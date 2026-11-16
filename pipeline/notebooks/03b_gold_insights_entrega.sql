-- Databricks notebook source
-- =============================================================================
-- PROJETO INTEGRADOR ACADEMY - GRUPO 3 (TRANSLOG)
-- ETAPA 3b: GOLD v3 — VISIBILIDADE DA OPERAÇÃO (despacho -> entrega)
-- Responsável: Engenharia de Dados (Mateus)
-- Consumidores: BI (AI/BI Dashboard) e PMO. Rodar depois de 02a -> 02d -> 02g -> 02i -> 02e.
--
-- Perguntas que esta camada responde:
--   QUANTO atrasa?   % de despacho atrasado e % de entrega atrasada / extraviada
--   ONDE atrasa?     por modalidade, mercado, região, rota e etapa do extravio
--   POR QUÊ?         causa do atraso no despacho (promessa irreal x operacional) e o papel do
--                    transporte (recuperou ou não o atraso do despacho)
--   QUANTO CUSTA?    receita_em_risco = venda bruta dos pedidos com entrega atrasada ou extraviada
--
-- Fontes: silver.pedidos_rastreio (despacho, valores) e silver.rastreio_pedidos (entrega).
-- Indicadores de DESPACHO = dado real (base inteira). Indicadores de ENTREGA vêm da simulação
-- publicada (silver.simulacao_publicada) e cobrem só os pedidos simulados: no escopo piloto,
-- poucos pedidos; os números finais exigem a geração completa. A cobertura está no KPI executivo.
-- Grão de contagem: PEDIDO (receita = soma dos itens do pedido).
-- Não substitui o 03 (legado, ainda baseado no Delivery Status original).
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS gold;

-- COMMAND ----------

-- Base por pedido (temporária): despacho real + entrega + receita
CREATE OR REPLACE TEMP VIEW gold_base_pedidos AS
WITH item AS (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY id_pedido ORDER BY id_item_pedido) AS rn
    FROM silver.pedidos_rastreio
),
receita AS (
    SELECT id_pedido, SUM(valor_bruto_venda) AS receita_pedido, COUNT(*) AS itens
    FROM silver.pedidos_rastreio GROUP BY id_pedido
)
SELECT
    i.id_pedido, i.data_pedido, DATE_TRUNC('month', i.data_pedido) AS mes_pedido,
    i.status_pedido, i.situacao_rastreio, i.avaliado_prazo AS despachado,
    i.modo_envio, i.tipo_rota, i.mercado_logistico, i.destino_regiao, i.destino_pais,
    i.dias_envio_programado, i.dias_envio_real,
    i.flag_atraso_despacho, i.dias_atraso_despacho, i.status_prazo_despacho, i.causa_atraso_despacho,
    r.modal_transporte, r.transito_padrao_dias, r.transito_real_dias, r.dias_recuperados_transporte,
    r.resultado_transporte, r.situacao_entrega, r.flag_atraso_entrega, r.dias_atraso_entrega,
    r.etapa_extravio,
    -- pedido concluído com desfecho de entrega (base dos % de entrega)
    r.dado_simulado AND r.situacao_entrega IN ('Entregue no prazo', 'Entregue com atraso', 'Extraviado')
        AS tem_desfecho_entrega,
    r.situacao_entrega IN ('Entregue com atraso', 'Extraviado') AS entrega_com_problema,
    rc.receita_pedido, rc.itens
FROM item i
JOIN receita rc USING (id_pedido)
LEFT JOIN silver.rastreio_pedidos r USING (id_pedido)
WHERE i.rn = 1;

-- COMMAND ----------

-- -----------------------------------------------------------------------------
-- GOLD 1: KPI executivo (cards do dashboard)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE TABLE gold.kpi_executivo_v3
COMMENT 'Gold v3: KPIs executivos. Despacho = base inteira; entrega = pedidos com desfecho na simulação publicada'
AS
SELECT
    COUNT(*)                                                                         AS pedidos_total,
    SUM(CASE WHEN despachado THEN 1 ELSE 0 END)                                      AS pedidos_despachados,
    ROUND(100.0 * AVG(flag_atraso_despacho), 1)                                      AS pct_despacho_atrasado,
    ROUND(AVG(CASE WHEN flag_atraso_despacho = 1 THEN dias_atraso_despacho END), 2)  AS atraso_medio_despacho_dias,
    SUM(CASE WHEN tem_desfecho_entrega THEN 1 ELSE 0 END)                            AS pedidos_com_desfecho_entrega,
    ROUND(100.0 * AVG(CASE WHEN tem_desfecho_entrega THEN
          CASE WHEN situacao_entrega = 'Entregue no prazo' THEN 1 ELSE 0 END END), 1)  AS pct_entregue_no_prazo,
    ROUND(100.0 * AVG(CASE WHEN tem_desfecho_entrega THEN
          CASE WHEN situacao_entrega = 'Entregue com atraso' THEN 1 ELSE 0 END END), 1) AS pct_entregue_com_atraso,
    ROUND(100.0 * AVG(CASE WHEN tem_desfecho_entrega THEN
          CASE WHEN situacao_entrega = 'Extraviado' THEN 1 ELSE 0 END END), 1)         AS pct_extraviado,
    -- Quanto do atraso na entrega nasce no despacho (esperado: 100%)
    ROUND(100.0 * SUM(CASE WHEN situacao_entrega = 'Entregue com atraso' AND flag_atraso_despacho = 1 THEN 1 ELSE 0 END)
          / NULLIF(SUM(CASE WHEN situacao_entrega = 'Entregue com atraso' THEN 1 ELSE 0 END), 0), 1)
                                                                                     AS pct_atrasos_entrega_originados_no_despacho,
    -- Dos despachos atrasados que chegaram, quantos o transporte salvou
    ROUND(100.0 * SUM(CASE WHEN resultado_transporte = 'Recuperou o atraso do despacho' THEN 1 ELSE 0 END)
          / NULLIF(SUM(CASE WHEN flag_atraso_despacho = 1 AND situacao_entrega LIKE 'Entregue%' THEN 1 ELSE 0 END), 0), 1)
                                                                                     AS pct_despacho_atrasado_recuperado_no_transporte,
    ROUND(SUM(receita_pedido), 2)                                                    AS receita_total,
    ROUND(SUM(CASE WHEN entrega_com_problema THEN receita_pedido ELSE 0 END), 2)     AS receita_em_risco,
    ROUND(100.0 * SUM(CASE WHEN entrega_com_problema THEN receita_pedido ELSE 0 END)
          / NULLIF(SUM(CASE WHEN tem_desfecho_entrega THEN receita_pedido END), 0), 1) AS pct_receita_em_risco,
    ROUND(100.0 * SUM(CASE WHEN tem_desfecho_entrega THEN 1 ELSE 0 END)
          / NULLIF(SUM(CASE WHEN status_pedido IN ('COMPLETE', 'CLOSED') THEN 1 ELSE 0 END), 0), 1)
                                                                                     AS pct_cobertura_entrega
FROM gold_base_pedidos;

-- COMMAND ----------

-- -----------------------------------------------------------------------------
-- GOLD 2: Funil despacho -> entrega (o despacho é a etapa crítica)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE TABLE gold.funil_despacho_entrega
COMMENT 'Gold v3: situação do despacho x desfecho da entrega (pedidos com desfecho)'
AS
SELECT
    status_prazo_despacho,
    situacao_entrega,
    resultado_transporte,
    COUNT(*)                                                                          AS pedidos,
    ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (PARTITION BY status_prazo_despacho), 1) AS pct_no_status_despacho,
    ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1)                                AS pct_do_total,
    ROUND(SUM(receita_pedido), 2)                                                     AS receita
FROM gold_base_pedidos
WHERE tem_desfecho_entrega
GROUP BY ALL;

-- COMMAND ----------

-- -----------------------------------------------------------------------------
-- GOLD 3: Desempenho por modalidade (onde nasce o atraso e por quê)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE TABLE gold.desempenho_modalidade
COMMENT 'Gold v3: despacho (real) e entrega por modalidade de serviço'
AS
SELECT
    modo_envio,
    MAX(dias_envio_programado)                                                       AS prazo_despacho_prometido_dias,
    SUM(CASE WHEN despachado THEN 1 ELSE 0 END)                                      AS pedidos_despachados,
    ROUND(100.0 * AVG(flag_atraso_despacho), 1)                                      AS pct_despacho_atrasado,
    ROUND(AVG(CASE WHEN despachado THEN dias_envio_real END), 2)                     AS media_dias_ate_despacho,
    ROUND(100.0 * AVG(CASE WHEN flag_atraso_despacho = 1 THEN
          CASE WHEN causa_atraso_despacho = 'Promessa irreal' THEN 1 ELSE 0 END END), 1) AS pct_atrasos_por_promessa_irreal,
    SUM(CASE WHEN tem_desfecho_entrega THEN 1 ELSE 0 END)                            AS pedidos_com_desfecho_entrega,
    ROUND(100.0 * AVG(CASE WHEN tem_desfecho_entrega THEN
          CASE WHEN situacao_entrega = 'Entregue no prazo' THEN 1 ELSE 0 END END), 1)  AS pct_entregue_no_prazo,
    ROUND(100.0 * AVG(CASE WHEN tem_desfecho_entrega THEN
          CASE WHEN situacao_entrega = 'Entregue com atraso' THEN 1 ELSE 0 END END), 1) AS pct_entregue_com_atraso,
    ROUND(100.0 * AVG(CASE WHEN tem_desfecho_entrega THEN
          CASE WHEN situacao_entrega = 'Extraviado' THEN 1 ELSE 0 END END), 1)         AS pct_extraviado,
    ROUND(100.0 * SUM(CASE WHEN resultado_transporte = 'Recuperou o atraso do despacho' THEN 1 ELSE 0 END)
          / NULLIF(SUM(CASE WHEN flag_atraso_despacho = 1 AND situacao_entrega LIKE 'Entregue%' THEN 1 ELSE 0 END), 0), 1)
                                                                                     AS pct_despacho_atrasado_recuperado,
    ROUND(SUM(CASE WHEN entrega_com_problema THEN receita_pedido ELSE 0 END), 2)     AS receita_em_risco
FROM gold_base_pedidos
GROUP BY modo_envio;

-- COMMAND ----------

-- -----------------------------------------------------------------------------
-- GOLD 4: Desempenho por rota (mercado · região · modal)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE TABLE gold.desempenho_rota
COMMENT 'Gold v3: despacho e entrega por rota (tipo de rota, mercado, região de destino, modal)'
AS
SELECT
    tipo_rota,
    mercado_logistico,
    destino_regiao,
    modal_transporte,
    MAX(transito_padrao_dias)                                                        AS transito_padrao_dias,
    SUM(CASE WHEN despachado THEN 1 ELSE 0 END)                                      AS pedidos_despachados,
    ROUND(100.0 * AVG(flag_atraso_despacho), 1)                                      AS pct_despacho_atrasado,
    SUM(CASE WHEN tem_desfecho_entrega THEN 1 ELSE 0 END)                            AS pedidos_com_desfecho_entrega,
    ROUND(100.0 * AVG(CASE WHEN tem_desfecho_entrega THEN
          CASE WHEN situacao_entrega = 'Entregue no prazo' THEN 1 ELSE 0 END END), 1)  AS pct_entregue_no_prazo,
    ROUND(100.0 * AVG(CASE WHEN tem_desfecho_entrega THEN
          CASE WHEN situacao_entrega = 'Entregue com atraso' THEN 1 ELSE 0 END END), 1) AS pct_entregue_com_atraso,
    ROUND(100.0 * AVG(CASE WHEN tem_desfecho_entrega THEN
          CASE WHEN situacao_entrega = 'Extraviado' THEN 1 ELSE 0 END END), 1)         AS pct_extraviado,
    ROUND(AVG(CASE WHEN situacao_entrega = 'Entregue com atraso' THEN dias_atraso_entrega END), 2)
                                                                                     AS media_dias_atraso_entrega,
    ROUND(SUM(receita_pedido), 2)                                                    AS receita,
    ROUND(SUM(CASE WHEN entrega_com_problema THEN receita_pedido ELSE 0 END), 2)     AS receita_em_risco
FROM gold_base_pedidos
WHERE despachado
GROUP BY ALL;

-- COMMAND ----------

-- -----------------------------------------------------------------------------
-- GOLD 5: Extravios por etapa (onde a carga se perde)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE TABLE gold.extravios_por_etapa
COMMENT 'Gold v3: extravios por etapa da jornada, rota e mercado'
AS
SELECT
    etapa_extravio,
    tipo_rota,
    mercado_logistico,
    COUNT(*)                                                                         AS pedidos_extraviados,
    ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1)                               AS pct_dos_extravios,
    ROUND(SUM(receita_pedido), 2)                                                    AS receita_extraviada
FROM gold_base_pedidos
WHERE situacao_entrega = 'Extraviado'
GROUP BY ALL;

-- COMMAND ----------

-- -----------------------------------------------------------------------------
-- GOLD 6: Tendência mensal
-- -----------------------------------------------------------------------------
CREATE OR REPLACE TABLE gold.tendencia_mensal_v3
COMMENT 'Gold v3: evolução mensal de despacho (real) e entrega'
AS
SELECT
    mes_pedido,
    DATE_FORMAT(mes_pedido, 'yyyy-MM')                                               AS ano_mes,
    COUNT(*)                                                                         AS pedidos,
    SUM(CASE WHEN despachado THEN 1 ELSE 0 END)                                      AS pedidos_despachados,
    ROUND(100.0 * AVG(flag_atraso_despacho), 1)                                      AS pct_despacho_atrasado,
    SUM(CASE WHEN tem_desfecho_entrega THEN 1 ELSE 0 END)                            AS pedidos_com_desfecho_entrega,
    ROUND(100.0 * AVG(CASE WHEN tem_desfecho_entrega THEN
          CASE WHEN situacao_entrega = 'Entregue com atraso' THEN 1 ELSE 0 END END), 1) AS pct_entregue_com_atraso,
    ROUND(100.0 * AVG(CASE WHEN tem_desfecho_entrega THEN
          CASE WHEN situacao_entrega = 'Extraviado' THEN 1 ELSE 0 END END), 1)         AS pct_extraviado,
    ROUND(SUM(receita_pedido), 2)                                                    AS receita,
    ROUND(SUM(CASE WHEN entrega_com_problema THEN receita_pedido ELSE 0 END), 2)     AS receita_em_risco
FROM gold_base_pedidos
GROUP BY ALL;

-- COMMAND ----------

-- Leitura rápida dos insights
SELECT * FROM gold.kpi_executivo_v3;

-- COMMAND ----------

SELECT * FROM gold.funil_despacho_entrega ORDER BY status_prazo_despacho, situacao_entrega;

-- COMMAND ----------

SELECT * FROM gold.desempenho_modalidade ORDER BY pct_despacho_atrasado DESC;
