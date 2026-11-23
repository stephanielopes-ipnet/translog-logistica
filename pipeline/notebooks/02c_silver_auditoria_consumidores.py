# Databricks notebook source
# =============================================================================
# PROJETO INTEGRADOR ACADEMY - GRUPO 3 (TRANSLOG BRASIL)
# ETAPA 2c: AUDITORIA DA SILVER PARA OS CONSUMIDORES (FULLSTACK E IA)
# Responsável: Engenharia de Dados (Mateus)
#
# Somente leitura: não altera nenhuma tabela.
# Rodar depois de 02 / 02b. Cada célula responde a uma pergunta da avaliação
# "Silver pronta para Fullstack e IA?". Os resultados esperados estão nos comentários.
# =============================================================================

from pyspark.sql import functions as F

TABELA = "silver.pedidos_rastreio"
df = spark.table(TABELA)
total = df.count()
print(f"{TABELA}: {total} linhas, {len(df.columns)} colunas")

# COMMAND ----------
# A. PRONTIDÃO PARA UI: nulos por coluna (Fullstack renderiza sem tratar NULL?)
#    Esperado: só colunas "não aplicável" com nulo (dias_atraso_despacho, flag_atraso_despacho).
nulos = df.select([F.sum(F.col(c).isNull().cast("int")).alias(c) for c in df.columns]).first().asDict()
display(spark.createDataFrame(
    [(c, int(n), round(100.0 * n / total, 2)) for c, n in nulos.items() if n],
    "coluna string, nulos long, pct double",
).orderBy(F.desc("nulos")))

# COMMAND ----------
# B. IDIOMA E DOMÍNIOS: valores de todas as colunas texto com poucos valores distintos
#    (candidatas a dropdown/badge). Mostra o que ainda está em inglês/espanhol.
texto = [f.name for f in df.schema.fields if f.dataType.simpleString() == "string"]
cardinalidade = df.agg(*[F.approx_count_distinct(c).alias(c) for c in texto]).first().asDict()
pequenas = [c for c in texto if cardinalidade[c] <= 30]
linhas = []
for c in pequenas:
    valores = [r[0] for r in df.select(c).distinct().orderBy(c).collect()]
    linhas.append((c, len(valores), " | ".join(str(v) for v in valores)))
display(spark.createDataFrame(linhas, "coluna string, distintos int, valores string"))

# COMMAND ----------
# C. COBERTURA DA TRADUÇÃO: desativada por enquanto (a Silver ainda não usa
#    as tabelas de tradução do 02a). Reativar quando as colunas *_pt voltarem.

# COMMAND ----------
# D. CONSISTÊNCIA FINANCEIRA (Fullstack exibe sem recalcular?)
#    Esperado: todas as divergências = 0.
#    lucro_nao_bate_com_item > 0 indica que lucro_item NÃO é margem x item.
display(spark.sql(f"""
SELECT
    COUNT(*)                                                                                       AS total,
    SUM(CASE WHEN ABS(preco_unitario * quantidade_item - valor_bruto_venda) > 0.01 THEN 1 ELSE 0 END) AS bruto_diferente_preco_x_qtd,
    SUM(CASE WHEN ABS(valor_bruto_venda - valor_desconto - valor_item_pedido) > 0.01 THEN 1 ELSE 0 END) AS total_diferente_bruto_menos_desconto,
    SUM(CASE WHEN ABS(margem_lucro_item * valor_item_pedido - lucro_item)
                  > 0.01 * ABS(valor_item_pedido) + 0.05 THEN 1 ELSE 0 END)                        AS lucro_nao_bate_com_item,
    SUM(CASE WHEN quantidade_item <= 0 OR valor_bruto_venda < 0 OR valor_desconto < 0 THEN 1 ELSE 0 END) AS valores_invalidos,
    SUM(CASE WHEN lucro_item < 0 THEN 1 ELSE 0 END)                                          AS itens_com_prejuizo
FROM {TABELA}
"""))

# COMMAND ----------
# E. SEMÂNTICA DE "lucro_item": é do pedido ou do item?
#    Se pedidos com vários itens têm lucros diferentes por item, a coluna é DO ITEM
#    e o nome engana um agente Text-to-SQL (ele não faria SUM por pedido).
display(spark.sql(f"""
SELECT
    COUNT(*)                                             AS pedidos_com_varios_itens,
    SUM(CASE WHEN lucros_distintos > 1 THEN 1 ELSE 0 END) AS pedidos_com_lucro_diferente_por_item
FROM (
    SELECT id_pedido, COUNT(DISTINCT lucro_item) AS lucros_distintos
    FROM {TABELA}
    GROUP BY id_pedido
    HAVING COUNT(*) > 1
)
"""))

# COMMAND ----------
# F. SEMÂNTICA DAS DATAS. Resultado anterior: data_envio = data_pedido + dias_envio_real
#    em 100% das linhas. data_despacho_prevista (= data_pedido + dias_envio_programado)
#    é validada no 02b.
display(spark.sql(f"""
SELECT
    COUNT(*)                                                                                    AS total,
    SUM(CASE WHEN DATEDIFF(data_envio, data_pedido) = dias_envio_real       THEN 1 ELSE 0 END) AS diff_igual_dias_real,
    SUM(CASE WHEN DATEDIFF(data_envio, data_pedido) = dias_envio_programado THEN 1 ELSE 0 END) AS diff_igual_dias_programado,
    SUM(CASE WHEN DATEDIFF(data_envio, data_pedido) = 0                     THEN 1 ELSE 0 END) AS envio_no_mesmo_dia,
    MIN(data_pedido) AS primeira_data_pedido,
    MAX(data_pedido) AS ultima_data_pedido
FROM {TABELA}
"""))

# COMMAND ----------
# G. ARMADILHA PARA TEXT-TO-SQL: colunas originais x regra nova
#    Um agente que use risco_atraso_flag ou status_entrega_original responde 98.976 atrasos;
#    a regra de negócio (flag_atraso_despacho) dá 57.810.
display(spark.sql(f"""
SELECT
    SUM(risco_atraso_flag)                                                     AS atrasos_via_risco_atraso_flag,
    SUM(CASE WHEN status_entrega_original = 'Late delivery' THEN 1 ELSE 0 END) AS atrasos_via_status_original,
    SUM(flag_atraso_despacho)                                                         AS atrasos_via_regra_negocio,
    SUM(CASE WHEN status_pedido = 'PROCESSING' AND status_prazo_despacho = 'Atrasado' THEN 1 ELSE 0 END)
                                                                               AS em_transito_ja_marcados_atrasados
FROM {TABELA}
"""))

# COMMAND ----------
# H. QUALIDADE DO TEXTO RAG: tamanho, N/A, termos não traduzidos e PII
#    Esperado: rag_nulo = 0; com_nome_cliente_pii = 0 (LGPD);
#    com_n_a = itens não avaliados/cancelados (dias_atraso_despacho nulo);
#    com_termos_em_ingles = todas as linhas enquanto não houver tradução.
display(spark.sql(f"""
SELECT
    SUM(CASE WHEN resumo_rastreio_rag IS NULL THEN 1 ELSE 0 END)                         AS rag_nulo,
    MIN(LENGTH(resumo_rastreio_rag))                                                     AS tam_min,
    ROUND(AVG(LENGTH(resumo_rastreio_rag)))                                              AS tam_medio,
    MAX(LENGTH(resumo_rastreio_rag))                                                     AS tam_max,
    SUM(CASE WHEN resumo_rastreio_rag LIKE '%N/A%' THEN 1 ELSE 0 END)                    AS com_n_a,
    SUM(CASE WHEN resumo_rastreio_rag RLIKE 'Standard Class|First Class|Second Class|Same Day|PENDING|COMPLETE|CLOSED|PROCESSING|ON_HOLD'
             THEN 1 ELSE 0 END)                                                          AS com_termos_em_ingles,
    SUM(CASE WHEN nome_cliente IS NOT NULL AND INSTR(resumo_rastreio_rag, nome_cliente) > 0
             THEN 1 ELSE 0 END)                                                          AS com_nome_cliente_pii
FROM {TABELA}
"""))

# Uma amostra por situação, para ler o texto como a LLM vai ler
display(spark.sql(f"""
SELECT situacao_rastreio, resumo_rastreio_rag
FROM {TABELA}
QUALIFY ROW_NUMBER() OVER (PARTITION BY situacao_rastreio ORDER BY id_item_pedido) = 1
"""))

# COMMAND ----------
# J. INITCAP NAS CIDADES: quantos nomes a padronização alterou (e como)?
#    Ex.: "McAllen" -> "Mcallen", "Ciudad de México" -> "Ciudad De México".
display(spark.sql("""
SELECT TRIM(`Order City`) AS original, INITCAP(TRIM(`Order City`)) AS na_silver, COUNT(*) AS linhas
FROM bronze.dataco_raw
WHERE INITCAP(TRIM(`Order City`)) <> TRIM(`Order City`)
GROUP BY 1, 2
ORDER BY linhas DESC
LIMIT 30
"""))

# COMMAND ----------
# L. TESTE DE ACEITAÇÃO NAS TABELAS DE CONSUMO (o que Fullstack e IA vão fazer de verdade)
#    Contrato: silver.consumo_pedidos (IA + portal), silver.consumo_eventos_logisticos e silver.consumo_itens_pedido (portal)

# L1. IA / portal: um pedido em trânsito pelo id (situação, prazo, atraso, itens, linha do tempo, texto)
display(spark.sql("""
SELECT id_pedido, id_cliente, situacao_pedido, data_entrega_prevista, flag_atraso_entrega, dias_atraso_entrega,
       local_atual, lista_itens, linha_do_tempo, resumo_pedido
FROM silver.consumo_pedidos
WHERE id_pedido = (SELECT MIN(id_pedido) FROM silver.consumo_pedidos WHERE situacao_pedido = 'Em trânsito')
"""))

# L2. Portal: todos os pedidos de um cliente + itens + linha do tempo (joins por id_pedido)
display(spark.sql("""
SELECT p.id_pedido, p.data_pedido, p.situacao_pedido, i.nome_produto, i.quantidade_item
FROM silver.consumo_pedidos p JOIN silver.consumo_itens_pedido i USING (id_pedido)
WHERE p.id_cliente = (SELECT MIN(id_cliente) FROM silver.consumo_pedidos)
ORDER BY p.data_pedido
"""))
display(spark.sql("""
SELECT * FROM silver.consumo_eventos_logisticos
WHERE id_pedido = (SELECT MIN(id_pedido) FROM silver.consumo_pedidos WHERE situacao_pedido = 'Em trânsito')
ORDER BY sequencia
"""))

# L3. IA / BI: KPI oficial de atraso no despacho (por pedido). Esperado: 21.127 / 36.866 = 57,3%
display(spark.sql("""
SELECT SUM(flag_atraso_despacho) AS atrasados, COUNT(flag_atraso_despacho) AS avaliados,
       ROUND(100.0 * SUM(flag_atraso_despacho) / COUNT(flag_atraso_despacho), 2) AS pct_atraso
FROM silver.consumo_pedidos
"""))

# L4. Governança: colunas expostas (conferir que não há PII, lucro nem marca de simulação)
for v in ["silver.consumo_pedidos", "silver.consumo_itens_pedido", "silver.consumo_eventos_logisticos"]:
    display(spark.sql(f"DESCRIBE {v}"))

# COMMAND ----------
# K. DEDUP DETERMINÍSTICA: há empates (mesmo item, mesmo dt_ingestao_bronze)?
#    Esperado: 0. Se > 0, o ROW_NUMBER escolhe uma linha arbitrária.
display(spark.sql("""
SELECT COUNT(*) AS itens_empatados
FROM (
    SELECT `Order Item Id`, dt_ingestao_bronze
    FROM bronze.dataco_raw
    GROUP BY 1, 2
    HAVING COUNT(*) > 1
)
"""))
