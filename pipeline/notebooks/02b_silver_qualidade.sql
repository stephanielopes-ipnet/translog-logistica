-- =============================================================================
-- PROJETO INTEGRADOR ACADEMY - GRUPO 3 (TRANSLOG BRASIL)
-- ETAPA 2b: TESTES DE QUALIDADE DA CAMADA SILVER
-- Responsável: Engenharia de Dados (Mateus)
-- Rodar depois de 01_bronze_ingestao.sql e 02a_silver_tratamento_rotas_atrasos.sql.
-- Resultado esperado: todas as linhas da consulta 1 com status = 'PASS'.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Painel de testes (PASS/FAIL)
-- -----------------------------------------------------------------------------
WITH
bronze  AS (SELECT COUNT(DISTINCT `Order Item Id`) AS n FROM bronze.dataco_raw),
silver  AS (SELECT COUNT(*) AS n, COUNT(DISTINCT id_item_pedido) AS n_distintos FROM silver.pedidos_rastreio),
quarent AS (SELECT COUNT(*) AS n FROM silver.pedidos_quarentena),
testes AS (
    -- Reconciliação: nenhum registro some entre Bronze e Silver
    SELECT 'reconciliacao_bronze = silver + quarentena' AS teste,
           CONCAT(b.n, ' = ', s.n, ' + ', q.n) AS detalhe,
           b.n = s.n + q.n AS ok
    FROM bronze b, silver s, quarent q

    UNION ALL
    -- Unicidade do grão
    SELECT 'unicidade_id_item_pedido',
           CONCAT(n, ' linhas / ', n_distintos, ' distintos'),
           n = n_distintos
    FROM silver

    UNION ALL
    -- Chaves e campos críticos sem nulos
    SELECT 'campos_criticos_sem_nulos',
           CONCAT(COUNT(*), ' linhas com nulo'),
           COUNT(*) = 0
    FROM silver.pedidos_rastreio
    WHERE id_pedido IS NULL OR id_item_pedido IS NULL
       OR data_pedido IS NULL OR data_envio IS NULL
       OR janela_atraso IS NULL OR resumo_rastreio_rag IS NULL

    UNION ALL
    -- Cancelados não podem ter dias_atraso (distorce médias da Gold)
    SELECT 'cancelados_sem_dias_atraso',
           CONCAT(COUNT(*), ' cancelados com dias_atraso'),
           COUNT(*) = 0
    FROM silver.pedidos_rastreio
    WHERE status_entrega_original = 'Shipping canceled' AND dias_atraso IS NOT NULL

    UNION ALL
    -- Regra de atraso: só COMPLETE/CLOSED/PROCESSING têm dias_atraso e flag
    SELECT 'nao_avaliados_sem_dias_atraso',
           CONCAT(COUNT(*), ' não avaliados com dias_atraso/flag'),
           COUNT(*) = 0
    FROM silver.pedidos_rastreio
    WHERE NOT avaliado_prazo AND (dias_atraso IS NOT NULL OR flag_atrasado IS NOT NULL)

    UNION ALL
    SELECT 'flag_atrasado_coerente_com_dias',
           CONCAT(COUNT(*), ' incoerências'),
           COUNT(*) = 0
    FROM silver.pedidos_rastreio
    WHERE avaliado_prazo AND flag_atrasado <> CASE WHEN dias_atraso > 0 THEN 1 ELSE 0 END

    UNION ALL
    -- Data prevista = data do pedido + prazo programado
    SELECT 'data_prevista_coerente_com_prazo',
           CONCAT(COUNT(*), ' incoerências'),
           COUNT(*) = 0
    FROM silver.pedidos_rastreio
    WHERE data_prevista_entrega IS NULL
       OR DATEDIFF(data_prevista_entrega, data_pedido) <> dias_envio_programado

    UNION ALL
    -- Atrasado pelas datas (envio depois da previsão) = atrasado pelos dias
    SELECT 'flag_atrasado_coerente_com_datas',
           CONCAT(COUNT(*), ' incoerências'),
           COUNT(*) = 0
    FROM silver.pedidos_rastreio
    WHERE avaliado_prazo
      AND flag_atrasado <> CASE WHEN DATEDIFF(data_envio, data_prevista_entrega) > 0 THEN 1 ELSE 0 END

    UNION ALL
    -- LGPD: nome do cliente não pode aparecer no texto que vai para o banco vetorial
    SELECT 'rag_sem_nome_cliente',
           CONCAT(COUNT(*), ' textos com nome'),
           COUNT(*) = 0
    FROM silver.pedidos_rastreio
    WHERE nome_cliente IS NOT NULL AND INSTR(resumo_rastreio_rag, nome_cliente) > 0

    UNION ALL
    -- View de consumo: sem PII, sem linhagem técnica, sem colunas de atraso originais
    SELECT 'view_sem_colunas_proibidas',
           COALESCE(CONCAT_WS(', ', COLLECT_LIST(column_name)), ''),
           COUNT(*) = 0
    FROM information_schema.columns
    WHERE table_schema = 'silver' AND table_name = 'vw_pedidos_rastreio'
      AND column_name IN ('nome_cliente', 'status_entrega_original', 'risco_atraso_flag',
                          'dt_ingestao_bronze', 'dt_processamento_silver', 'arquivo_origem',
                          'avaliado_prazo', 'pedido_cancelado')

    UNION ALL
    SELECT 'view_mesmas_linhas_da_tabela',
           CONCAT(v.n, ' na view / ', s.n, ' na tabela'),
           v.n = s.n
    FROM (SELECT COUNT(*) AS n FROM silver.vw_pedidos_rastreio) v, silver s

    UNION ALL
    -- Quarentena pequena: se passar de 1%, alguma regra provavelmente está errada
    SELECT 'quarentena_abaixo_de_1pct',
           CONCAT(ROUND(100.0 * q.n / b.n, 3), '%'),
           q.n <= 0.01 * b.n
    FROM bronze b, quarent q

    UNION ALL
    -- Provas de que as colunas descartadas eram mesmo redundantes
    SELECT 'redundante_benefit_eq_profit',
           CONCAT(COUNT(*), ' divergências'),
           COUNT(*) = 0
    FROM bronze.dataco_raw
    WHERE ROUND(`Benefit per order`, 2) <> ROUND(`Order Profit Per Order`, 2)

    UNION ALL
    SELECT 'redundante_salespercustomer_eq_itemtotal',
           CONCAT(COUNT(*), ' divergências'),
           COUNT(*) = 0
    FROM bronze.dataco_raw
    WHERE ROUND(`Sales per customer`, 2) <> ROUND(`Order Item Total`, 2)

    UNION ALL
    SELECT 'redundante_ordercustomerid_eq_customerid',
           CONCAT(COUNT(*), ' divergências'),
           COUNT(*) = 0
    FROM bronze.dataco_raw
    WHERE `Order Customer Id` <> `Customer Id`

    UNION ALL
    SELECT 'redundante_productcategoryid_eq_categoryid',
           CONCAT(COUNT(*), ' divergências'),
           COUNT(*) = 0
    FROM bronze.dataco_raw
    WHERE `Product Category Id` <> `Category Id`

    UNION ALL
    SELECT 'redundante_productprice_eq_itemproductprice',
           CONCAT(COUNT(*), ' divergências'),
           COUNT(*) = 0
    FROM bronze.dataco_raw
    WHERE ROUND(`Product Price`, 2) <> ROUND(`Order Item Product Price`, 2)
)
SELECT teste, detalhe, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status
FROM testes
ORDER BY status, teste;

-- -----------------------------------------------------------------------------
-- 2. Quarentena por motivo (para explicar na apresentação)
-- -----------------------------------------------------------------------------
SELECT motivo_quarentena, COUNT(*) AS registros
FROM silver.pedidos_quarentena
GROUP BY motivo_quarentena
ORDER BY registros DESC;

-- -----------------------------------------------------------------------------
-- 3. Distribuição das janelas. Esperado: PENDING/PENDING_PAYMENT/PAYMENT_REVIEW/ON_HOLD
--    só em "0. Não Avaliado"; CANCELED/SUSPECTED_FRAUD só em "5. Envios Cancelados".
--    (Os % da EDA não servem mais de referência: lá todos os status eram avaliados.)
-- -----------------------------------------------------------------------------
SELECT
    janela_atraso,
    COUNT(*) AS itens,
    ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) AS pct
FROM silver.pedidos_rastreio
GROUP BY janela_atraso
ORDER BY janela_atraso;

-- -----------------------------------------------------------------------------
-- 3b. TRADUÇÃO: valores da Silver sem par no de-para (silver.dim_traducao)
--     Esperado: 0 linhas. Se aparecer, o valor original não bate com a chave do CSV.
-- -----------------------------------------------------------------------------
WITH usados AS (
    SELECT DISTINCT 'destino_pais' AS coluna, CAST(NULL AS STRING) AS contexto, destino_pais AS valor FROM silver.pedidos_rastreio
    UNION SELECT DISTINCT 'destino_estado', destino_pais, destino_estado FROM silver.pedidos_rastreio
    UNION SELECT DISTINCT 'destino_regiao', NULL, destino_regiao FROM silver.pedidos_rastreio
    UNION SELECT DISTINCT 'origem_cliente_cidade', NULL, origem_cliente_cidade FROM silver.pedidos_rastreio
    UNION SELECT DISTINCT 'origem_cliente_estado', NULL, origem_cliente_estado FROM silver.pedidos_rastreio
    UNION SELECT DISTINCT 'origem_cliente_pais', NULL, origem_cliente_pais FROM silver.pedidos_rastreio
)
SELECT u.*
FROM usados u
LEFT ANTI JOIN silver.dim_traducao d
  ON d.coluna = u.coluna
 AND d.valor_original = u.valor
 AND (u.coluna <> 'destino_estado' OR d.contexto = u.contexto);

-- 3c. De-para sem chave duplicada (esperado: 0 linhas; duplicata multiplicaria linhas na view)
SELECT coluna, contexto, valor_original, COUNT(*) AS vezes
FROM silver.dim_traducao
GROUP BY ALL
HAVING COUNT(*) > 1;

-- 3d. Nenhum "?" de codificação sobrando nos nomes da view (esperado: 0)
SELECT COUNT(*) AS nomes_com_interrogacao
FROM silver.vw_pedidos_rastreio
WHERE destino_estado LIKE '%?%' OR destino_pais LIKE '%?%' OR origem_cliente_cidade LIKE '%?%';

-- 3e. Leitura humana: um texto RAG por situação, já em pt-BR
SELECT situacao_rastreio, rota_logistica, resumo_rastreio_rag
FROM silver.vw_pedidos_rastreio
QUALIFY ROW_NUMBER() OVER (PARTITION BY situacao_rastreio ORDER BY id_item_pedido) = 1;

