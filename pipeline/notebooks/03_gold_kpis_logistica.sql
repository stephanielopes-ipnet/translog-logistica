-- Databricks notebook source
-- =============================================================================
-- PROJETO INTEGRADOR ACADEMY - GRUPO 3 (TRANSLOG BRASIL)
-- ETAPA 3: CAMADA GOLD (INDICADORES DE NEGÓCIO E PERFORMANCE LOGÍSTICA)
-- Responsável: Engenharia de Dados (Mateus)
-- Consumidores desta camada: BI & Analytics (Databricks AI/BI Dashboard) e PMO
-- [LEGADO] Ainda conta atraso pelo Delivery Status original (status_entrega_original), que
-- marca atraso até em pedido não pago. Usar a Gold v3 (03b_gold_insights_entrega).
-- Mantido só com os nomes de colunas atualizados para não quebrar.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- TABELA GOLD 1: Resumo Executivo Global (Para os Cards / Big Numbers do BI)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE TABLE gold.resumo_executivo_translog AS
SELECT
    COUNT(DISTINCT id_pedido)                                                      AS total_pedidos,
    COUNT(*)                                                                       AS total_itens_enviados,
    COUNT(DISTINCT id_cliente)                                                     AS total_clientes_atendidos,
    ROUND(AVG(dias_envio_programado), 2)                                           AS tempo_medio_programado_dias,
    ROUND(AVG(dias_envio_real), 2)                                                 AS tempo_medio_transito_real_dias,
    ROUND(AVG(CASE WHEN dias_atraso_despacho > 0 THEN dias_atraso_despacho END), 2)                  AS atraso_medio_quando_atrasa_dias,
    ROUND(100.0 * SUM(CASE WHEN dias_atraso_despacho <= 0 AND status_entrega_original != 'Shipping canceled' THEN 1 ELSE 0 END) / COUNT(*), 2) AS pct_entregas_no_prazo_otd,
    ROUND(100.0 * SUM(CASE WHEN status_entrega_original = 'Late delivery' THEN 1 ELSE 0 END) / COUNT(*), 2)                           AS pct_entregas_em_atraso,
    ROUND(100.0 * SUM(CASE WHEN janela_atraso_despacho = '4. Atraso Crítico (3+ dias)' THEN 1 ELSE 0 END) / COUNT(*), 2)                       AS pct_atraso_critico,
    ROUND(SUM(valor_item_pedido), 2)                                               AS faturamento_total_logistico,
    ROUND(SUM(CASE WHEN status_entrega_original = 'Late delivery' THEN valor_item_pedido ELSE 0 END), 2) AS valor_pedidos_impactados_por_atraso
FROM silver.pedidos_rastreio;

-- COMMAND ----------

-- -----------------------------------------------------------------------------
-- TABELA GOLD 2: Evolução Mensal de Pontualidade e Janelas de Atraso
-- -----------------------------------------------------------------------------
CREATE OR REPLACE TABLE gold.kpi_pontualidade_mensal AS
SELECT
    DATE_TRUNC('month', data_pedido)                                               AS ano_mes_pedido,
    DATE_FORMAT(data_pedido, 'yyyy-MM')                                            AS safra_ano_mes,
    COUNT(DISTINCT id_pedido)                                                      AS total_pedidos,
    COUNT(*)                                                                       AS total_entregas,
    SUM(CASE WHEN dias_atraso_despacho <= 0 AND status_entrega_original != 'Shipping canceled' THEN 1 ELSE 0 END) AS qtd_no_prazo,
    SUM(CASE WHEN status_entrega_original = 'Late delivery' THEN 1 ELSE 0 END)     AS qtd_atrasadas,
    ROUND(100.0 * SUM(CASE WHEN dias_atraso_despacho <= 0 AND status_entrega_original != 'Shipping canceled' THEN 1 ELSE 0 END) / COUNT(*), 2) AS taxa_pontualidade_otd_pct,
    ROUND(100.0 * SUM(CASE WHEN status_entrega_original = 'Late delivery' THEN 1 ELSE 0 END) / COUNT(*), 2)                           AS taxa_atraso_pct,
    ROUND(AVG(dias_envio_programado), 2)                                           AS media_dias_programado,
    ROUND(AVG(dias_envio_real), 2)                                                 AS media_dias_real,
    ROUND(AVG(dias_atraso_despacho), 2)                                                     AS saldo_medio_dias_atraso,
    ROUND(SUM(valor_item_pedido), 2)                                               AS receita_total_mes
FROM silver.pedidos_rastreio
WHERE data_pedido IS NOT NULL
GROUP BY DATE_TRUNC('month', data_pedido), DATE_FORMAT(data_pedido, 'yyyy-MM')
ORDER BY ano_mes_pedido;

-- COMMAND ----------

-- -----------------------------------------------------------------------------
-- TABELA GOLD 3: Gargalos Regionais e Análise de Rotas
-- -----------------------------------------------------------------------------
CREATE OR REPLACE TABLE gold.gargalos_rotas_regioes AS
SELECT
    mercado_logistico,
    destino_regiao,
    destino_pais,
    destino_estado,
    destino_cidade,
    rota_logistica,
    COUNT(DISTINCT id_pedido)                                                      AS total_pedidos_rota,
    COUNT(*)                                                                       AS total_itens_rota,
    ROUND(AVG(dias_envio_programado), 2)                                           AS prazo_medio_prometido,
    ROUND(AVG(dias_envio_real), 2)                                                 AS tempo_medio_real_transito,
    ROUND(AVG(dias_atraso_despacho), 2)                                                     AS media_dias_atraso,
    SUM(CASE WHEN status_entrega_original = 'Late delivery' THEN 1 ELSE 0 END)     AS total_entregas_atrasadas,
    ROUND(100.0 * SUM(CASE WHEN status_entrega_original = 'Late delivery' THEN 1 ELSE 0 END) / COUNT(*), 2) AS taxa_atraso_rota_pct,
    SUM(CASE WHEN janela_atraso_despacho = '4. Atraso Crítico (3+ dias)' THEN 1 ELSE 0 END) AS qtd_atraso_critico,
    ROUND(SUM(valor_item_pedido), 2)                                               AS valor_total_transportado,
    ROUND(SUM(lucro_item), 2)                                                AS lucro_total_rota
FROM silver.pedidos_rastreio
GROUP BY
    mercado_logistico,
    destino_regiao,
    destino_pais,
    destino_estado,
    destino_cidade,
    rota_logistica
HAVING COUNT(DISTINCT id_pedido) >= 5
ORDER BY total_entregas_atrasadas DESC;

-- COMMAND ----------

-- -----------------------------------------------------------------------------
-- TABELA GOLD 4: Performance por Modo de Envio e Janela de Atraso
-- -----------------------------------------------------------------------------
CREATE OR REPLACE TABLE gold.performance_modo_envio AS
SELECT
    modo_envio,
    janela_atraso_despacho,
    status_prazo_despacho,
    COUNT(DISTINCT id_pedido)                                                      AS total_pedidos,
    COUNT(*)                                                                       AS total_itens,
    ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (PARTITION BY modo_envio), 2)      AS pct_dentro_do_modo_envio,
    ROUND(AVG(dias_envio_programado), 2)                                           AS media_dias_programado,
    ROUND(AVG(dias_envio_real), 2)                                                 AS media_dias_real,
    ROUND(AVG(dias_atraso_despacho), 2)                                                     AS media_dias_atraso,
    ROUND(SUM(valor_item_pedido), 2)                                               AS valor_total_movimentado
FROM silver.pedidos_rastreio
GROUP BY
    modo_envio,
    janela_atraso_despacho,
    status_prazo_despacho
ORDER BY modo_envio, janela_atraso_despacho;

-- COMMAND ----------

-- Consulta rápida de verificação do Resumo Executivo Gold
SELECT * FROM gold.resumo_executivo_translog;
