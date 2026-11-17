# Databricks notebook source
# =============================================================================
# PROJETO INTEGRADOR ACADEMY - GRUPO 3 (TRANSLOG)
# ETAPA 2f: PREPARAÇÃO DA SIMULAÇÃO DE ENTREGA (eventos logísticos pós-despacho)
# Responsável: Engenharia de Dados (Mateus)
#
# Não grava tabelas. É chamado por %run no 02g e deixa prontos, na mesma sessão:
#   - parâmetros (versão, escopo)
#   - df_pedidos_base:      1 linha por pedido, com rota, modal e hubs de silver.dim_hubs
#   - df_quarentena_prep:   pedidos que não podem ser simulados com segurança (+ motivo)
#   - df_pedidos_entrada:   entrada do gerador (piloto estratificado ou base completa)
#   - df_cobertura_piloto:  grupos esperados x presentes no piloto
#
# PREMISSA (doc 04_decisao_premissa_despacho.md, validada com o instrutor):
#   Shipping date = DESPACHO (dado real). Tudo depois do despacho é SIMULADO.
#   Não existe mais o cenário "entrega" (Shipping date = entrega): era uma segunda verdade.
#
# Fontes (somente leitura): silver.pedidos_rastreio (nome_cliente NÃO é lido),
#   silver.dim_hubs, silver.dim_traducao.
# Ordem: 01 -> 01b -> 02a -> 02d -> 02g (chama 02f) -> 02i -> 02e -> 02b -> 02h
# =============================================================================

# COMMAND ----------

from pyspark.sql import functions as F
from pyspark.sql import Window as W

CENARIO = "despacho"   # única hipótese adotada (mantida como coluna para rastreabilidade)
dbutils.widgets.text("versao", "v3", "Versão")
dbutils.widgets.dropdown("escopo", "piloto", ["piloto", "completo"], "Escopo")
dbutils.widgets.text("pedidos_por_grupo", "5", "Piloto: pedidos por grupo")

VERSAO = dbutils.widgets.get("versao").strip()
ESCOPO = dbutils.widgets.get("escopo")
POR_GRUPO = int(dbutils.widgets.get("pedidos_por_grupo"))
assert VERSAO, "versão vazia"
print(f"cenário={CENARIO} versão={VERSAO} escopo={ESCOPO} pedidos_por_grupo={POR_GRUPO}")

# COMMAND ----------

# -----------------------------------------------------------------------------
# 1. Itens da Silver (só as colunas necessárias; sem dados pessoais)
# -----------------------------------------------------------------------------
CAMPOS_PEDIDO = [
    "data_pedido", "data_envio", "modo_envio", "status_pedido", "dias_envio_programado",
    "dias_envio_real", "dias_atraso_despacho", "mercado_logistico", "origem_cliente_pais", "tipo_rota",
    "destino_pais", "destino_estado", "destino_cidade", "destino_regiao", "situacao_rastreio",
]

itens = spark.table("silver.pedidos_rastreio").select("id_pedido", "id_item_pedido", *CAMPOS_PEDIDO)

# Data de referência da base (D, foto histórica na última transação) — calculada no 02a
DATA_REF = spark.table("silver.pedidos_rastreio").agg(F.max("data_referencia_base").alias("data_referencia_base"))

# -----------------------------------------------------------------------------
# 2. Granularidade: itens do mesmo pedido têm que concordar em todos os campos de pedido.
#    Não agregamos campo nenhum: pedido divergente vai para a quarentena.
# -----------------------------------------------------------------------------
divergencia = (
    itens.groupBy("id_pedido")
    .agg(*[F.countDistinct(F.coalesce(F.col(c).cast("string"), F.lit("<nulo>"))).alias(c) for c in CAMPOS_PEDIDO])
)
cond_div = None
for c in CAMPOS_PEDIDO:
    cond_div = (F.col(c) > 1) if cond_div is None else (cond_div | (F.col(c) > 1))
pedidos_divergentes = divergencia.where(cond_div).select(
    "id_pedido",
    F.lit("DIVERGENCIA_ENTRE_ITENS").alias("motivo"),
    F.concat_ws(", ", *[F.when(F.col(c) > 1, F.lit(c)) for c in CAMPOS_PEDIDO]).alias("detalhe"),
)

# 1 linha por pedido: o primeiro item (todos os itens são iguais nos campos de pedido)
pedidos = (
    itens.withColumn("_rn", F.row_number().over(W.partitionBy("id_pedido").orderBy("id_item_pedido")))
    .where("_rn = 1").drop("_rn", "id_item_pedido")
)

# COMMAND ----------

# -----------------------------------------------------------------------------
# 3. Classificação do pedido, modal e hubs
#    grupo_status (situação operacional em D, calculada no 02a):
#      despachado = COMPLETE/CLOSED/PROCESSING: tem despacho -> jornada simulada até D;
#                   desfecho (60/20/20) se ele acontece até D, senão "Em trânsito" em D
#      aguardando = status de espera com pedido nos últimos 7 dias antes de D
#      nao_pago   = status de espera mais antigo ("Não pago (expirado)")
#      cancelado  = CANCELED / SUSPECTED_FRAUD
#    modal_transporte (PREMISSA de simulação, regra fixa):
#      Same Day / First Class -> Aéreo expresso; doméstico EUA saindo dos EUA -> Rodoviário;
#      demais (internacional ou saindo de Porto Rico) -> Aéreo consolidado.
# -----------------------------------------------------------------------------
c = F.col
grupo_status = (
    F.when(c("situacao_rastreio") == "Despachado", "despachado")
    .when(c("situacao_rastreio") == "Cancelado", "cancelado")
    .when(c("situacao_rastreio") == "Aguardando pagamento", "aguardando")
    .when(c("situacao_rastreio") == "Não pago (expirado)", "nao_pago")
)

domestico = c("tipo_rota") == "Doméstica"
origem_pr = c("origem_cliente_pais") == "Puerto Rico"
modal = (
    F.when(c("modo_envio").isin("Same Day", "First Class"), "Aéreo expresso")
    .when(domestico & ~origem_pr, "Rodoviário")
    .otherwise("Aéreo consolidado")
)

# Gateway de saída (mesmos ids fixos de silver.dim_hubs)
id_gateway = (
    F.when(origem_pr, "GW-SJU")
    .when(c("mercado_logistico") == "LATAM", "GW-MIA")
    .when(c("mercado_logistico").isin("Europe", "Africa"), "GW-NYC")
    .when(c("mercado_logistico") == "Pacific Asia", "GW-LAX")
    .otherwise("GW-MEM")
)

hubs = spark.table("silver.dim_hubs")
gw = hubs.where("tipo_hub = 'GATEWAY_ORIGEM'").select(
    c("id_hub").alias("gw_id"), c("nome_hub").alias("gw_nome"), c("cidade").alias("gw_cidade"))
cd = hubs.where("tipo_hub = 'CD_NACIONAL'").select(
    c("pais_original").alias("destino_pais"), c("id_hub").alias("cd_id"),
    c("nome_hub").alias("cd_nome"), c("cidade").alias("cd_cidade"))
af = hubs.where("tipo_hub = 'ALFANDEGA'").select(
    c("pais_original").alias("destino_pais"), c("id_hub").alias("af_id"), c("nome_hub").alias("af_nome"))
ar = hubs.where("tipo_hub = 'ARMAZEM_ESTADUAL'").select(
    c("pais_original").alias("destino_pais"), c("estado_original").alias("destino_estado"),
    c("id_hub").alias("ar_id"), c("nome_hub").alias("ar_nome"))

trad = spark.table("silver.dim_traducao")
tp = trad.where("coluna = 'destino_pais'").select(c("valor_original").alias("destino_pais"), c("valor_pt").alias("pais_pt"))
te = trad.where("coluna = 'destino_estado'").select(
    c("contexto").alias("destino_pais"), c("valor_original").alias("destino_estado"), c("valor_pt").alias("estado_pt"))
tc = trad.where("coluna = 'destino_cidade'").select(
    c("contexto").alias("destino_pais"), c("valor_original").alias("destino_cidade"), c("valor_pt").alias("cidade_pt"))

df_pedidos_base = (
    pedidos.join(pedidos_divergentes.select("id_pedido"), "id_pedido", "left_anti")
    .withColumn("grupo_status", grupo_status)
    .withColumn("despachado", c("grupo_status") == "despachado")
    .crossJoin(DATA_REF)
    .withColumn("modal_transporte", F.when(c("despachado"), modal))
    .withColumn("internacional", c("tipo_rota") == "Internacional")
    .withColumn("aereo", F.coalesce(c("modal_transporte").startswith("Aéreo"), F.lit(False)))
    .withColumn("id_gateway", id_gateway)
    .join(gw, c("id_gateway") == c("gw_id"), "left")
    .join(cd, "destino_pais", "left")
    .join(af, "destino_pais", "left")
    .join(ar, ["destino_pais", "destino_estado"], "left")
    .join(tp, "destino_pais", "left")
    .join(te, ["destino_pais", "destino_estado"], "left")
    .join(tc, ["destino_pais", "destino_cidade"], "left")
    .withColumn("pais_pt", F.coalesce("pais_pt", "destino_pais"))
    .withColumn("estado_pt", F.coalesce("estado_pt", "destino_estado"))
    .withColumn("cidade_pt", F.coalesce("cidade_pt", "destino_cidade"))
    .withColumn("tem_armazem", c("ar_id").isNotNull())
)

# COMMAND ----------

# -----------------------------------------------------------------------------
# 4. Quarentena da preparação: pedido que não dá para simular com segurança.
#    Não criamos hubs para cobrir lacunas.
# -----------------------------------------------------------------------------
motivos_prep = (
    F.when(c("grupo_status").isNull(), F.lit("STATUS_DESCONHECIDO"))
    .when(c("despachado") & c("tipo_rota").isNull(), F.lit("SEM_ROTA"))
    .when(c("despachado") & c("modal_transporte").isNull(), F.lit("SEM_MODAL"))
    .when(c("despachado") & c("gw_id").isNull(), F.lit("SEM_GATEWAY"))
    .when(c("despachado") & c("cd_id").isNull(), F.lit("SEM_CD_NO_PAIS"))
    .when(c("despachado") & c("internacional") & c("af_id").isNull(), F.lit("SEM_ALFANDEGA_NO_PAIS"))
    .when(c("despachado") & (c("data_envio").isNull() | (c("data_envio") < c("data_pedido"))),
          F.lit("DATA_ENVIO_INVALIDA"))
)
_prep = df_pedidos_base.withColumn("motivo", motivos_prep)

df_quarentena_prep = (
    _prep.where("motivo IS NOT NULL").select("id_pedido", "motivo", F.lit(None).cast("string").alias("detalhe"))
    .unionByName(pedidos_divergentes)
)
df_pedidos_base = _prep.where("motivo IS NULL").drop("motivo")

# COMMAND ----------

# -----------------------------------------------------------------------------
# 5. Entrada do gerador
#    piloto: amostra estratificada e determinística (hash do id_pedido), sem inventar registros.
#      - despachados: até N por (tipo_rota x modo_envio x status_pedido original)
#      - despachados nos últimos 15 dias antes de D: até N por tipo_rota (testam o "em trânsito")
#      - +1 por região de destino ainda não coberta
#      - aguardando e cancelado: até N cada (só para validar que não ganham jornada)
#    completo: todos os pedidos de df_pedidos_base.
# -----------------------------------------------------------------------------
_h = F.xxhash64(c("id_pedido"), F.lit("piloto"))

estratos = (
    df_pedidos_base.where("despachado")
    .withColumn("_rn", F.row_number().over(W.partitionBy("tipo_rota", "modo_envio", "status_pedido").orderBy(_h)))
    .where(c("_rn") <= POR_GRUPO).select("id_pedido")
)
recentes = (
    df_pedidos_base.where(c("despachado") & (c("data_envio") >= c("data_referencia_base") - F.expr("INTERVAL 15 DAYS")))
    .withColumn("_rn", F.row_number().over(W.partitionBy("tipo_rota").orderBy(_h)))
    .where(c("_rn") <= POR_GRUPO).select("id_pedido")
)
nao_despachados = (
    df_pedidos_base.where("NOT despachado")
    .withColumn("_rn", F.row_number().over(W.partitionBy("grupo_status").orderBy(_h)))
    .where(c("_rn") <= POR_GRUPO).select("id_pedido")
)
_ja = df_pedidos_base.join(estratos, "id_pedido")
regioes = (
    df_pedidos_base.where("despachado")
    .join(_ja.select("destino_regiao").distinct(), "destino_regiao", "left_anti")
    .withColumn("_rn", F.row_number().over(W.partitionBy("destino_regiao").orderBy(_h)))
    .where("_rn = 1").select("id_pedido")
)
ids_piloto = estratos.unionByName(recentes).unionByName(regioes).unionByName(nao_despachados).distinct()

if ESCOPO == "piloto":
    df_pedidos_entrada = df_pedidos_base.join(ids_piloto, "id_pedido")
else:
    df_pedidos_entrada = df_pedidos_base

# Cobertura do piloto: grupos que existem na base x grupos presentes na entrada
_grade = ["tipo_rota", "modo_envio", "status_pedido"]
df_cobertura_piloto = (
    df_pedidos_base.where("despachado").groupBy(*_grade).agg(F.count("*").alias("pedidos_na_base"))
    .join(df_pedidos_entrada.where("despachado").groupBy(*_grade).agg(F.count("*").alias("pedidos_no_piloto")),
          _grade, "left")
    .fillna(0, ["pedidos_no_piloto"])
    .orderBy(*_grade)
)
