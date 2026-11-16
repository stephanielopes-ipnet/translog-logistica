# Databricks notebook source
# =============================================================================
# PROJETO INTEGRADOR ACADEMY - GRUPO 3 (TRANSLOG)
# ETAPA 2g: SIMULAÇÃO DA ENTREGA (eventos pós-despacho + resultado da entrega)
# Responsável: Engenharia de Dados (Mateus)
#
# PREMISSA (doc 04, validada com o instrutor): o DataCo mede o DESPACHO. Tudo depois dele é
# SIMULADO, com padrão definido para os pedidos concluídos: 60% entregues no prazo,
# 20% entregues com atraso e 20% extraviados.
#
# Regra da entrega (v3):
#   - prazo prometido: data_entrega_prevista = data_despacho_prevista + trânsito padrão (T)
#   - entrega:         data_entrega_realizada = data_despacho_real + trânsito real
#   - Despacho no prazo                       -> trânsito real = T -> chega no prazo
#   - Despacho atrasado, RECUPERADO           -> trânsito real = T - dias de atraso (>= 1 dia)
#                                                -> chega exatamente na data prometida
#   - Despacho atrasado, NÃO recuperado       -> trânsito real = T -> atraso na entrega =
#                                                atraso no despacho (o transporte nunca piora)
#     (quem não tem como recuperar, atraso >= T, cai sempre aqui)
#   - Extraviado (20%, sorteio independente)  -> jornada para numa etapa + EXTRAVIO_CONFIRMADO
#   => toda entrega atrasada vem de um despacho atrasado: o despacho é a etapa crítica.
#   A fração recuperada é CALIBRADA na base inteira para que o atraso feche em 20%.
#   PROCESSING (em trânsito): jornada parcial até uma etapa sorteada; sem desfecho.
#
# Saídas (gravação idempotente por fatia versão + escopo):
#   silver.eventos_logisticos             1 linha por evento do pedido
#   silver.entregas_simuladas             1 linha por pedido: resultado da entrega
#   silver.eventos_logisticos_quarentena  pedidos que não puderam ser simulados (+ motivo)
#   silver.simulacao_publicada            qual fatia (versão + escopo) as views consomem
# Tempo determinístico: xxhash64(id_pedido, ...). Nada de rand().
# =============================================================================

# COMMAND ----------

# MAGIC %run ./02f_silver_preparacao_simulacao

# COMMAND ----------

from pyspark.sql import functions as F
from pyspark.sql import Window as W

c = F.col
DIA = 86400.0

# -----------------------------------------------------------------------------
# 1. PARÂMETROS DA SIMULAÇÃO (não vêm da base; documentados no doc 05)
# -----------------------------------------------------------------------------
# Catálogo: (código, ordem, etapa, descrição, peso). peso = fatia relativa do trânsito gasta
# no trecho que TERMINA no evento.
EVENTOS = [
    ("PEDIDO_CRIADO",          10, 0, "Pedido registrado",                       0.0),
    ("PEDIDO_DESPACHADO",      20, 1, "Pedido despachado",                       0.0),
    ("COLETA_GATEWAY",         30, 1, "Recebido no gateway de origem",           1.0),
    ("PARTIDA_VOO",            40, 2, "Partida do voo",                          1.0),
    ("CHEGADA_ALFANDEGA",      50, 3, "Chegada à alfândega",                     1.5),
    ("LIBERACAO_ALFANDEGA",    60, 3, "Liberado pela alfândega",                 2.0),
    ("CHEGADA_CD",             70, 4, "Chegada ao centro de distribuição",       1.5),
    ("CHEGADA_ARMAZEM",        80, 4, "Chegada ao armazém regional",             1.0),
    ("SAIU_PARA_ENTREGA",      90, 5, "Saiu para entrega",                       1.0),
    ("ENTREGUE",              100, 5, "Entregue",                                1.0),
    # Ordem dinâmica: logo depois do evento da etapa onde o extravio acontece
    ("EXTRAVIO_CONFIRMADO",     0, 0, "Extravio confirmado",                     0.0),
]
ESPECIAIS = ["EXTRAVIO_CONFIRMADO"]

# Trânsito padrão (dias) do despacho até a entrega, por rota e modal
def transito_padrao():
    merc = c("mercado_logistico")
    expresso_intl = (F.when(merc == "USCA", 2).when(merc.isin("LATAM", "Europe"), 3)
                     .when(merc.isin("Africa", "Pacific Asia"), 4))
    consolidado_intl = (F.when(merc == "USCA", 4).when(merc == "LATAM", 5).when(merc == "Europe", 6)
                        .when(merc == "Pacific Asia", 7).when(merc == "Africa", 8))
    return (
        F.when(~c("despachado"), F.lit(None))
        .when(~c("internacional") & (c("modal_transporte") == "Rodoviário"), 3)
        .when(~c("internacional") & (c("modal_transporte") == "Aéreo expresso"), 1)
        .when(~c("internacional"), 2)
        .when(c("modal_transporte") == "Aéreo expresso", expresso_intl)
        .otherwise(consolidado_intl)
    ).cast("int")

# Padrão da entrega (validado com o instrutor), sobre os pedidos concluídos
PCT_EXTRAVIO, PCT_ATRASO = 20, 20          # resto = entregue no prazo (60)
TRANSITO_MINIMO_DIAS = 1                   # recuperação nunca deixa o trânsito abaixo disso
DIAS_PARA_CONFIRMAR_EXTRAVIO = 5           # após a data em que a entrega deveria ocorrer

# Etapa do extravio (pesos % por rota) e o motivo exibido
MOTIVO_ETAPA = {
    "COLETA_GATEWAY":    "Volume não recebido no gateway de origem",
    "PARTIDA_VOO":       "Volume não embarcado / perdido no transbordo aéreo",
    "CHEGADA_ALFANDEGA": "Volume retido e não localizado na alfândega",
    "CHEGADA_CD":        "Volume não localizado no centro de distribuição",
    "SAIU_PARA_ENTREGA": "Volume não localizado na rota de entrega",
}
ETAPA_DESC = {0: "0 - Pedido", 1: "1 - Coleta", 2: "2 - Voo", 3: "3 - Alfândega",
              4: "4 - Transferência", 5: "5 - Última milha"}

def sorteio(salt, modulo=100):
    return F.pmod(F.xxhash64(c("id_pedido"), F.lit(salt)), F.lit(modulo))

def etapa_extravio():
    r = sorteio("ETAPA_EXTRAVIO")
    intl = (F.when(r < 5, "COLETA_GATEWAY").when(r < 25, "PARTIDA_VOO").when(r < 70, "CHEGADA_ALFANDEGA")
            .when(r < 80, "CHEGADA_CD").otherwise("SAIU_PARA_ENTREGA"))
    dom_aereo = (F.when(r < 10, "COLETA_GATEWAY").when(r < 25, "PARTIDA_VOO").when(r < 65, "CHEGADA_CD")
                 .otherwise("SAIU_PARA_ENTREGA"))
    dom_rodo = F.when(r < 15, "COLETA_GATEWAY").when(r < 65, "CHEGADA_CD").otherwise("SAIU_PARA_ENTREGA")
    return F.when(c("internacional"), intl).when(c("aereo"), dom_aereo).otherwise(dom_rodo)

def mapa(d):
    return F.create_map(*[F.lit(x) for kv in d.items() for x in kv])

ORDEM = mapa({e[0]: e[1] for e in EVENTOS if e[0] not in ESPECIAIS})
ETAPA = mapa({e[0]: e[2] for e in EVENTOS if e[0] not in ESPECIAIS})
MOTIVO = mapa(MOTIVO_ETAPA)
ETAPA_TXT = mapa(ETAPA_DESC)

df_catalogo = spark.createDataFrame(
    EVENTOS, "codigo_evento string, ordem int, etapa int, descricao_evento string, peso double")

# COMMAND ----------

# -----------------------------------------------------------------------------
# 2. Calibração (base INTEIRA de concluídos, sem collect): fração dos despachos atrasados
#    RECUPERÁVEIS que não são recuperados, para o atraso na entrega fechar em PCT_ATRASO.
#    atraso = (1 - extravio) x (irrecuperáveis + p x recuperáveis)
#    => p = (PCT_ATRASO / (100 - PCT_EXTRAVIO) - irrecuperáveis) / recuperáveis
# -----------------------------------------------------------------------------
atrasado = c("dias_atraso_despacho") > 0
recuperavel = atrasado & ((c("transito_padrao_dias") - c("dias_atraso_despacho")) >= TRANSITO_MINIMO_DIAS)
irrecuperavel = atrasado & ~recuperavel

df_calibracao = (
    df_pedidos_base.where("grupo_status = 'concluido'")
    .withColumn("transito_padrao_dias", transito_padrao())
    .agg(F.avg(irrecuperavel.cast("double")).alias("share_irrecuperavel"),
         F.avg(recuperavel.cast("double")).alias("share_recuperavel"),
         F.avg(atrasado.cast("double")).alias("share_despacho_atrasado"),
         F.count("*").alias("concluidos_na_base"))
    .withColumn("p_nao_recuperado",
                F.greatest(F.lit(0.0), F.least(F.lit(1.0),
                    (F.lit(PCT_ATRASO / (100.0 - PCT_EXTRAVIO)) - c("share_irrecuperavel")) / c("share_recuperavel"))))
)
display(df_calibracao)

# COMMAND ----------

# -----------------------------------------------------------------------------
# 3. Resultado da entrega por pedido (determinístico)
# -----------------------------------------------------------------------------
u_recup = sorteio("RECUPERACAO", 10000) / 10000.0
resultado = (
    F.when(c("grupo_status") == "em_transito", "Em trânsito")
    .when(c("grupo_status") != "concluido", F.lit(None))
    .when(sorteio("EXTRAVIO") < PCT_EXTRAVIO, "Extraviado")
    .when(~atrasado, "No prazo")
    .when(irrecuperavel | (u_recup < c("p_nao_recuperado")), "Não recuperou o atraso do despacho")
    .otherwise("Recuperou o atraso do despacho")
)

# Em trânsito: posição = etapa sorteada (uniforme) entre os eventos da rota, exceto ENTREGUE
rota_eventos = F.filter(F.array(
    F.lit("COLETA_GATEWAY"),
    F.when(c("aereo"), F.lit("PARTIDA_VOO")),
    F.when(c("internacional"), F.lit("CHEGADA_ALFANDEGA")),
    F.when(c("internacional"), F.lit("LIBERACAO_ALFANDEGA")),
    F.lit("CHEGADA_CD"),
    F.when(c("tem_armazem"), F.lit("CHEGADA_ARMAZEM")),
    F.lit("SAIU_PARA_ENTREGA"),
), lambda x: x.isNotNull())
posicao_em_transito = F.element_at(rota_eventos, (F.pmod(F.xxhash64(c("id_pedido"), F.lit("POSICAO")),
                                                         F.size(rota_eventos)) + 1).cast("int"))

entregue = c("resultado_transporte").isin("No prazo", "Recuperou o atraso do despacho",
                                          "Não recuperou o atraso do despacho")
df_ped = (
    df_pedidos_entrada.crossJoin(df_calibracao.select("p_nao_recuperado"))
    .withColumn("cenario", F.lit(CENARIO))
    .withColumn("transito_padrao_dias", transito_padrao())
    .withColumn("resultado_transporte", resultado)
    .withColumn("transito_real_dias",
                F.when(c("resultado_transporte") == "Recuperou o atraso do despacho",
                       c("transito_padrao_dias") - c("dias_atraso_despacho"))
                .when(entregue, c("transito_padrao_dias")).cast("int"))
    .withColumn("codigo_etapa_extravio", F.when(c("resultado_transporte") == "Extraviado", etapa_extravio()))
    # Última ordem de evento mantida na jornada
    .withColumn("corte_ordem",
                F.when(entregue, F.lit(100))
                .when(c("resultado_transporte") == "Extraviado", ORDEM[c("codigo_etapa_extravio")])
                .when(c("resultado_transporte") == "Em trânsito", ORDEM[posicao_em_transito])
                .otherwise(F.lit(10)))
)

# COMMAND ----------

# -----------------------------------------------------------------------------
# 4. Eventos da rota (jornada completa hipotética; depois corta conforme o resultado)
# -----------------------------------------------------------------------------
cod = c("codigo_evento")
desp = c("despachado")
aplica = (
    F.when(cod == "PEDIDO_CRIADO", F.lit(True))
    .when(cod.isin("PEDIDO_DESPACHADO", "COLETA_GATEWAY", "CHEGADA_CD", "SAIU_PARA_ENTREGA", "ENTREGUE"), desp)
    .when(cod == "PARTIDA_VOO", desp & c("aereo"))
    .when(cod.isin("CHEGADA_ALFANDEGA", "LIBERACAO_ALFANDEGA"), desp & c("internacional"))
    .when(cod == "CHEGADA_ARMAZEM", desp & c("tem_armazem"))
    .when(cod == "EXTRAVIO_CONFIRMADO", c("resultado_transporte") == "Extraviado")
    .otherwise(F.lit(False))
)
especial = cod.isin(*ESPECIAIS)

ev = (
    df_ped.crossJoin(df_catalogo).where(aplica)
    .withColumn("ordem", F.when(especial, ORDEM[c("codigo_etapa_extravio")] + 5).otherwise(c("ordem")))
    .withColumn("etapa", F.when(especial, ETAPA[c("codigo_etapa_extravio")]).otherwise(c("etapa")))
)

origem_dataco = cod.isin("PEDIDO_CRIADO", "PEDIDO_DESPACHADO")
ev = (
    ev.withColumn("origem_evento", F.when(origem_dataco, "DataCo").otherwise("simulado"))
    .withColumn("dado_simulado", ~origem_dataco)
    .withColumn("campo_origem",
                F.when(cod == "PEDIDO_CRIADO", "order date (DateOrders)")
                .when(cod == "PEDIDO_DESPACHADO", "shipping date (DateOrders)"))
    .withColumn("precisao_temporal",
                F.when(cod == "PEDIDO_CRIADO", "minuto").when(cod == "PEDIDO_DESPACHADO", "dia")
                .otherwise("simulado"))
)

# COMMAND ----------

# -----------------------------------------------------------------------------
# 5. Tempo dos eventos (determinístico)
#    O trânsito (real, para entregues; padrão, para extraviados e em trânsito) é repartido
#    entre os trechos por peso, com variação de +-30%.
#    ENTREGUE = despacho + trânsito real (exato, em dias).
# -----------------------------------------------------------------------------
por_pedido = W.partitionBy("id_pedido")
acumulado = por_pedido.orderBy("ordem").rowsBetween(W.unboundedPreceding, W.currentRow)

u = F.pmod(F.xxhash64(c("id_pedido"), cod, F.lit(CENARIO)), F.lit(10000)) / 10000.0     # [0, 1)
ev = ev.withColumn("_w", F.when((c("ordem") >= 30) & ~especial, c("peso") * (0.7 + 0.6 * u)).otherwise(0.0))

t_envio = F.unix_timestamp("data_envio")
janela_s = F.coalesce(c("transito_real_dias"), c("transito_padrao_dias")) * DIA
total_w = F.sum("_w").over(por_pedido)
ts_seg = (
    F.when(cod == "ENTREGUE", t_envio + c("transito_real_dias") * DIA)
    .when(cod == "EXTRAVIO_CONFIRMADO", t_envio + (c("transito_padrao_dias") + DIAS_PARA_CONFIRMAR_EXTRAVIO) * DIA)
    # denominador NULL quando 0 (pedido sem jornada): evita divisão por zero no modo ANSI
    .otherwise(t_envio + F.sum("_w").over(acumulado) / F.when(total_w > 0, total_w) * janela_s)
)
ev = ev.withColumn(
    "ts_evento",
    F.when(cod == "PEDIDO_CRIADO", c("data_pedido"))
    .when(cod == "PEDIDO_DESPACHADO", c("data_envio"))
    .otherwise(F.date_trunc("minute", F.timestamp_seconds(ts_seg)))
)

# Corte da jornada conforme o resultado (os pesos acima usaram a jornada completa)
ev = ev.where(especial | (c("ordem") <= c("corte_ordem")))

# COMMAND ----------

# -----------------------------------------------------------------------------
# 6. Hubs (silver.dim_hubs), local e descrição do evento (linguagem de operação)
# -----------------------------------------------------------------------------
def hub_de(x):
    return (F.when(x.isin("COLETA_GATEWAY", "PARTIDA_VOO"), c("gw_id"))
            .when(x.isin("CHEGADA_ALFANDEGA", "LIBERACAO_ALFANDEGA"), c("af_id"))
            .when(x == "CHEGADA_CD", c("cd_id"))
            .when(x == "CHEGADA_ARMAZEM", c("ar_id"))
            .when(x == "SAIU_PARA_ENTREGA", F.coalesce("ar_id", "cd_id")))

def local_de(x):
    return (F.when(x == "COLETA_GATEWAY", c("gw_nome"))
            .when(x == "PARTIDA_VOO", F.concat(F.lit("Em voo: "), c("gw_cidade"), F.lit(" -> "), c("cd_cidade"),
                                               F.lit(" ("), c("pais_pt"), F.lit(")")))
            .when(x.isin("CHEGADA_ALFANDEGA", "LIBERACAO_ALFANDEGA"), c("af_nome"))
            .when(x == "CHEGADA_CD", c("cd_nome"))
            .when(x == "CHEGADA_ARMAZEM", c("ar_nome"))
            .when(x == "SAIU_PARA_ENTREGA", F.concat(F.lit("Em rota de entrega - "), c("cidade_pt"),
                                                     F.lit(" (saída: "), F.coalesce("ar_nome", "cd_nome"), F.lit(")"))))

etapa_cod = c("codigo_etapa_extravio")
ev = (
    ev.withColumn("id_hub", F.when(especial, hub_de(etapa_cod)).otherwise(hub_de(cod)))
    .withColumn(
        "local_evento",
        F.when(cod == "PEDIDO_CRIADO", F.lit("Pedido registrado no sistema"))
        .when(cod == "PEDIDO_DESPACHADO", F.lit("Pedido despachado pela expedição de origem"))
        .when(cod == "ENTREGUE", F.concat(F.lit("Entregue em "), c("cidade_pt"), F.lit(" - "), c("estado_pt"),
                                          F.lit(" ("), c("pais_pt"), F.lit(")")))
        .when(cod == "EXTRAVIO_CONFIRMADO", F.concat(F.lit("Volume não localizado após: "), local_de(etapa_cod)))
        .otherwise(local_de(cod)))
    .withColumn(
        "descricao_evento",
        F.when(cod == "EXTRAVIO_CONFIRMADO",
               F.concat(F.lit("Extravio confirmado: "), MOTIVO[etapa_cod]))
        .otherwise(c("descricao_evento")))
    .withColumn("hub_esperado", ~cod.isin("PEDIDO_CRIADO", "PEDIDO_DESPACHADO", "ENTREGUE"))
)

# COMMAND ----------

# -----------------------------------------------------------------------------
# 7. Checagens antes de gravar. Pedido com problema vai para a quarentena.
# -----------------------------------------------------------------------------
ordem_pedido = por_pedido.orderBy("ordem")
ev = ev.withColumn("_ts_anterior", F.lag("ts_evento").over(ordem_pedido))
problema = (
    F.when(c("ts_evento").isNull(), F.lit("TS_NULO"))
    .when(c("_ts_anterior").isNotNull() & (c("ts_evento") < c("_ts_anterior")), F.lit("ORDEM_TEMPORAL_INVALIDA"))
    .when(c("hub_esperado") & c("id_hub").isNull(), F.lit("HUB_NAO_ENCONTRADO"))
    .when(c("dado_simulado") & (c("ts_evento") < c("data_envio")), F.lit("ANTES_DO_DESPACHO"))
)
ev = ev.withColumn("_problema", problema)

quarentena_geracao = (
    ev.where("_problema IS NOT NULL")
    .groupBy("id_pedido")
    .agg(F.min("_problema").alias("motivo"),
         F.concat_ws(", ", F.collect_set("codigo_evento")).alias("detalhe"))
)
ev_ok = ev.join(quarentena_geracao.select("id_pedido"), "id_pedido", "left_anti")

agora = F.current_timestamp()
# A quarentena da preparação (02f) só entra no escopo completo: o piloto é sorteado de
# df_pedidos_base, que já está sem esses pedidos.
quarentena_prep = df_quarentena_prep if ESCOPO == "completo" else df_quarentena_prep.limit(0)
df_quarentena = (
    quarentena_prep.unionByName(quarentena_geracao)
    .select(F.lit(CENARIO).alias("cenario"), F.lit(VERSAO).alias("versao"), F.lit(ESCOPO).alias("escopo"),
            "id_pedido", "motivo", "detalhe", agora.alias("dt_processamento"))
)

df_eventos = (
    ev_ok.withColumn("sequencia", F.row_number().over(ordem_pedido))
    .withColumn("ultimo_evento", c("sequencia") == F.max("sequencia").over(por_pedido))
    .select(
        "cenario",
        F.lit(VERSAO).alias("versao"),
        F.lit(ESCOPO).alias("escopo"),
        F.sha2(F.concat_ws("|", "cenario", F.lit(VERSAO), c("id_pedido").cast("string"), "codigo_evento"), 256)
         .alias("id_evento"),
        "id_pedido", "sequencia", "codigo_evento", "descricao_evento", "etapa", "ts_evento",
        "id_hub", "local_evento", "origem_evento", "campo_origem", "dado_simulado", "ultimo_evento",
        "grupo_status", "status_pedido", "tipo_rota", "modal_transporte", "modo_envio",
        "mercado_logistico", "destino_regiao", "precisao_temporal",
        agora.alias("dt_processamento"),
    )
)

# COMMAND ----------

# -----------------------------------------------------------------------------
# 8. Entrega por pedido (1 linha por pedido da entrada, fora da quarentena)
#    data_entrega_prevista  = data_despacho_prevista + trânsito padrão
#    data_entrega_realizada = data_despacho_real + trânsito real
# -----------------------------------------------------------------------------
df_entregas = (
    df_ped.join(quarentena_geracao.select("id_pedido"), "id_pedido", "left_anti")
    .withColumn("data_despacho_real", F.when(c("despachado"), F.to_date("data_envio")))
    .withColumn("data_entrega_prevista",
                F.when(c("despachado"), F.expr("date_add(to_date(data_pedido), dias_envio_programado + transito_padrao_dias)")))
    .withColumn("data_entrega_realizada",
                F.when(entregue, F.expr("date_add(to_date(data_envio), transito_real_dias)")))
    .withColumn("dias_recuperados_transporte",
                F.when(entregue, c("transito_padrao_dias") - c("transito_real_dias")))
    .withColumn("dias_atraso_entrega", F.when(entregue, F.datediff("data_entrega_realizada", "data_entrega_prevista")))
    .withColumn("flag_atraso_entrega", F.when(entregue, (c("dias_atraso_entrega") > 0).cast("int")))
    .withColumn("causa_atraso_entrega",
                F.when(~entregue, F.lit(None))
                .when(c("flag_atraso_entrega") == 0, "Sem atraso")
                .otherwise("Atraso no despacho não recuperado no transporte"))
    .withColumn("situacao_entrega",
                F.when(c("grupo_status") == "cancelado", "Cancelado")
                .when(c("grupo_status") == "aguardando", "Não despachado")
                .when(c("resultado_transporte") == "Em trânsito", "Em trânsito")
                .when(c("resultado_transporte") == "Extraviado", "Extraviado")
                .when(c("flag_atraso_entrega") == 1, "Entregue com atraso")
                .otherwise("Entregue no prazo"))
    .withColumn("etapa_extravio", ETAPA_TXT[ETAPA[etapa_cod]])
    .withColumn("motivo_extravio", MOTIVO[etapa_cod])
    .select(
        "cenario", F.lit(VERSAO).alias("versao"), F.lit(ESCOPO).alias("escopo"),
        "id_pedido", "grupo_status", "status_pedido", "tipo_rota", "modal_transporte", "modo_envio",
        "mercado_logistico", "transito_padrao_dias", "transito_real_dias", "dias_recuperados_transporte",
        "resultado_transporte", "etapa_extravio", "motivo_extravio",
        "data_despacho_real", "data_entrega_prevista", "data_entrega_realizada",
        "dias_atraso_entrega", "flag_atraso_entrega", "causa_atraso_entrega", "situacao_entrega",
        F.lit(True).alias("dado_simulado"), agora.alias("dt_processamento"),
    )
)

# COMMAND ----------

# -----------------------------------------------------------------------------
# 9. Gravação idempotente. CREATE IF NOT EXISTS (nunca recria) + replaceWhere da fatia.
#    mergeSchema: colunas novas entram; colunas de versões anteriores ficam NULL nesta fatia.
# -----------------------------------------------------------------------------
spark.sql("""
CREATE TABLE IF NOT EXISTS silver.eventos_logisticos (
    cenario STRING COMMENT 'Hipótese temporal adotada: despacho (Shipping date = despacho)',
    versao STRING, escopo STRING COMMENT 'piloto ou completo',
    id_evento STRING COMMENT 'sha2(cenario|versao|id_pedido|codigo_evento)',
    id_pedido INT, sequencia INT, codigo_evento STRING, descricao_evento STRING,
    etapa INT COMMENT '0 Pedido · 1 Coleta/Despacho · 2 Voo · 3 Alfândega · 4 Transferência · 5 Última milha',
    ts_evento TIMESTAMP, id_hub STRING COMMENT 'silver.dim_hubs', local_evento STRING,
    origem_evento STRING COMMENT 'DataCo (dado original) ou simulado',
    campo_origem STRING COMMENT 'Coluna do DataCo que deu o horário (eventos originais)',
    dado_simulado BOOLEAN, ultimo_evento BOOLEAN,
    grupo_status STRING, status_pedido STRING, tipo_rota STRING, modal_transporte STRING,
    modo_envio STRING, mercado_logistico STRING, destino_regiao STRING,
    precisao_temporal STRING COMMENT 'minuto (pedido), dia (despacho), simulado (demais)',
    dt_processamento TIMESTAMP
) COMMENT 'Silver: eventos logísticos por pedido. Eventos simulados (dado_simulado = true) NÃO são evidência de gargalo.'
""")
spark.sql("""
CREATE TABLE IF NOT EXISTS silver.eventos_logisticos_quarentena (
    cenario STRING, versao STRING, escopo STRING, id_pedido INT,
    motivo STRING, detalhe STRING, dt_processamento TIMESTAMP
) COMMENT 'Pedidos que não puderam ser simulados com segurança na geração de eventos'
""")
spark.sql("""
CREATE TABLE IF NOT EXISTS silver.entregas_simuladas (
    cenario STRING, versao STRING, escopo STRING, id_pedido INT,
    grupo_status STRING COMMENT 'concluido, em_transito, aguardando, cancelado (base real)',
    status_pedido STRING, tipo_rota STRING, modal_transporte STRING, modo_envio STRING, mercado_logistico STRING,
    transito_padrao_dias INT COMMENT 'Parâmetro: dias do despacho até a entrega pela rota/modal',
    transito_real_dias INT COMMENT 'Trânsito usado (menor que o padrão quando recuperou atraso do despacho)',
    dias_recuperados_transporte INT,
    resultado_transporte STRING COMMENT 'No prazo / Recuperou o atraso do despacho / Não recuperou o atraso do despacho / Extraviado / Em trânsito',
    etapa_extravio STRING, motivo_extravio STRING,
    data_despacho_real DATE COMMENT 'Shipping date (real)',
    data_entrega_prevista DATE COMMENT 'data_despacho_prevista + trânsito padrão',
    data_entrega_realizada DATE COMMENT 'data_despacho_real + trânsito real',
    dias_atraso_entrega INT, flag_atraso_entrega INT, causa_atraso_entrega STRING, situacao_entrega STRING,
    dado_simulado BOOLEAN, dt_processamento TIMESTAMP
) COMMENT 'Silver: entrega SIMULADA por pedido (60% no prazo / 20% atraso / 20% extravio). Grão = pedido por versão/escopo'
""")

fatia = f"cenario = '{CENARIO}' AND versao = '{VERSAO}' AND escopo = '{ESCOPO}'"
for df, tabela in [(df_eventos, "silver.eventos_logisticos"),
                   (df_entregas, "silver.entregas_simuladas"),
                   (df_quarentena, "silver.eventos_logisticos_quarentena")]:
    (df.write.format("delta").mode("overwrite").option("replaceWhere", fatia)
     .option("mergeSchema", "true").saveAsTable(tabela))

# Publica a fatia: as views do 02i passam a consumir esta versão + escopo
(spark.createDataFrame([(CENARIO, VERSAO, ESCOPO)], "cenario string, versao string, escopo string")
 .withColumn("dt_publicacao", agora)
 .write.format("delta").mode("overwrite").saveAsTable("silver.simulacao_publicada"))
print(f"Gravado e publicado: {fatia}")

# COMMAND ----------

# Conferência rápida da fatia gravada
display(spark.sql(f"""
SELECT grupo_status, resultado_transporte, situacao_entrega, COUNT(*) AS pedidos,
       ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (PARTITION BY grupo_status), 1) AS pct_no_grupo
FROM silver.entregas_simuladas WHERE {fatia}
GROUP BY ALL ORDER BY 1, 2, 3
"""))

# COMMAND ----------

# Cobertura do piloto (grupo que existe na base e ficou sem pedido = ausência a reportar)
display(df_cobertura_piloto)
