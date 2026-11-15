-- Databricks notebook source
-- =============================================================================

-- 1 linha por ITEM de pedido (id_item_pedido é único).
-- Ordem das etapas:
--   1. Deduplicação pelo grão (idempotente para recargas/streaming na Bronze)
--   2. Tipagem e limpeza de texto
--   3. LGPD: colunas sensíveis não são selecionadas
--   4. Colunas redundantes/vazias não são selecionadas (provas em 02b)
--   5. Regras de consistência -> registros inválidos vão para a QUARENTENA
--   6. Regras de negócio (atraso, janela, rota, texto RAG)
--   7. [Silver v2] Indicadores da PMO (no_prazo, faixa_atraso, periodo_pico,
--      receita_em_risco, causa_provavel, data_entrega_real)
-- PREMISSA DE DATAS: dias_envio_programado = prazo de ENTREGA prometido; dias_envio_real =
-- tempo até a ENTREGA (PROCESSING: dias em trânsito até a foto); data_envio (Shipping date) =
-- data_pedido + dias_envio_real = data da entrega para os entregues. Ver doc 03, seção 13.
-- Saídas: silver.pedidos_rastreio (válidos), silver.pedidos_quarentena (inválidos + motivo)
-- Ordem de execução: 01 -> 01b -> 02a -> 02d (hubs + rastreio simulado) -> 02e (view de consumo)
--                    -> 02b (testes) -> 02c (auditoria/exportação)
-- =============================================================================


-- 1. STAGING: dedup + tipagem + limpeza + regras de negócio + motivo de quarentena

CREATE OR REPLACE TEMP VIEW vw_silver_staging AS
WITH bronze_dedup AS (
    -- [Etapa 1] Deduplicação: mantém a versão mais recente de cada item.
    -- Hoje o CSV não tem duplicatas (EDA), mas a Bronze pode receber recargas (append).
    SELECT *
    FROM bronze.dataco_raw
    QUALIFY ROW_NUMBER() OVER (
        PARTITION BY `Order Item Id`
        ORDER BY dt_ingestao_bronze DESC
    ) = 1
),
base_limpa AS (
    SELECT
        -- Identificadores do Pedido e Item
        TRY_CAST(`Order Id` AS INT)                      AS id_pedido,
        TRY_CAST(`Order Item Id` AS INT)                 AS id_item_pedido,
        TRY_CAST(`Customer Id` AS INT)                   AS id_cliente,

        -- [LGPD] Não trazemos Customer Email, Customer Password, Customer Street
        -- (endereço do cliente) nem os Zipcodes. nome_cliente fica só na tabela (fora da view).
        NULLIF(TRIM(CONCAT(COALESCE(`Customer Fname`, ''), ' ', COALESCE(`Customer Lname`, ''))), '') AS nome_cliente,
        NULLIF(TRIM(`Customer Segment`), '')             AS segmento_cliente,

        -- Datas: formato original M/d/yyyy H:mm. O TRY_CAST cobre o caso de o
        -- inferSchema da Bronze já ter convertido a coluna para timestamp.
        COALESCE(
            try_to_timestamp(CAST(`order date (DateOrders)` AS STRING), 'M/d/yyyy H:mm'),
            TRY_CAST(`order date (DateOrders)` AS TIMESTAMP)
        )                                                AS data_pedido,
        COALESCE(
            try_to_timestamp(CAST(`shipping date (DateOrders)` AS STRING), 'M/d/yyyy H:mm'),
            TRY_CAST(`shipping date (DateOrders)` AS TIMESTAMP)
        )                                                AS data_envio,

        -- Modalidade e Status
        NULLIF(TRIM(`Shipping Mode`), '')                AS modo_envio,
        NULLIF(TRIM(`Delivery Status`), '')              AS status_entrega_original,
        NULLIF(TRIM(`Order Status`), '')                 AS status_pedido,

        -- Prazos de Entrega e Flag de Risco
        TRY_CAST(`Days for shipment (scheduled)` AS INT) AS dias_envio_programado,
        TRY_CAST(`Days for shipping (real)` AS INT)      AS dias_envio_real,
        TRY_CAST(`Late_delivery_risk` AS INT)            AS risco_atraso_flag,

        -- Localização Origem (loja) e Destino (entrega)
        -- Correção de 3 registros com campos deslocados na origem: cidade = "CA" (sigla do
        -- estado) e estado = CEP. Cidade recuperada pelo CEP (confirmada pelas coordenadas):
        -- 91732 = El Monte, CA; 95758 = Elk Grove, CA.
        CASE
            WHEN TRIM(`Customer State`) RLIKE '^[0-9]+$' THEN
                CASE TRIM(`Customer State`)
                    WHEN '91732' THEN 'El Monte'
                    WHEN '95758' THEN 'Elk Grove'
                END
            ELSE INITCAP(NULLIF(TRIM(`Customer City`), ''))
        END                                              AS origem_cliente_cidade,
        CASE
            WHEN TRIM(`Customer State`) RLIKE '^[0-9]+$' THEN UPPER(TRIM(`Customer City`))
            ELSE NULLIF(TRIM(`Customer State`), '')
        END                                              AS origem_cliente_estado,
        NULLIF(TRIM(`Customer Country`), '')             AS origem_cliente_pais,
        INITCAP(NULLIF(TRIM(`Order City`), ''))          AS destino_cidade,
        NULLIF(TRIM(`Order State`), '')                  AS destino_estado,
        NULLIF(TRIM(`Order Region`), '')                 AS destino_regiao,
        NULLIF(TRIM(`Order Country`), '')                AS destino_pais,
        NULLIF(TRIM(`Market`), '')                       AS mercado_logistico,

        -- Produto e Financeiro (redundantes descartadas: Benefit per order,
        -- Sales per customer, Order Customer Id, Product Category Id,
        -- Product Description [100% nula], Product Image)
        TRY_CAST(`Product Card Id` AS INT)               AS id_produto,
        NULLIF(TRIM(`Product Name`), '')                 AS nome_produto,
        NULLIF(TRIM(`Category Name`), '')                AS categoria_produto,
        TRY_CAST(`Order Item Quantity` AS INT)           AS quantidade_item,
        ROUND(TRY_CAST(`Sales` AS DOUBLE), 2)                  AS valor_bruto_venda,
        ROUND(TRY_CAST(`Order Item Discount` AS DOUBLE), 2)    AS valor_desconto,
        ROUND(TRY_CAST(`Order Item Total` AS DOUBLE), 2)       AS valor_item_pedido,
        -- "Order Profit Per Order" tem nome enganoso no dataset: o valor é DO ITEM
        -- (varia entre itens do mesmo pedido em 100% dos casos e = margem x total do item).
        -- O lucro do pedido inteiro está na view: lucro_total_pedido = SUM por id_pedido.
        ROUND(TRY_CAST(`Order Profit Per Order` AS DOUBLE), 2) AS lucro_item,

        -- Coordenadas para Mapa
        TRY_CAST(`Latitude` AS DOUBLE)                   AS latitude_origem,
        TRY_CAST(`Longitude` AS DOUBLE)                  AS longitude_origem,

        -- [Adicionadas] Colunas recuperadas da Bronze
        -- Preço: Order Item Product Price = preço praticado NA VENDA (o fato do pedido);
        -- Product Price = preço de catálogo. Validação na seção 5 ao final do script.
        ROUND(TRY_CAST(`Order Item Product Price` AS DOUBLE), 2) AS preco_unitario,
        ROUND(TRY_CAST(`Order Item Profit Ratio` AS DOUBLE), 4)  AS margem_lucro_item,
        NULLIF(TRIM(`Department Name`), '')              AS departamento,
        UPPER(NULLIF(TRIM(`Type`), ''))                  AS tipo_pagamento,      -- DEBIT, TRANSFER, CASH, PAYMENT

        -- Linhagem
        arquivo_origem,
        dt_ingestao_bronze
    FROM bronze_dedup
),
avaliacao AS (
    -- REGRA DE NEGÓCIO DO ATRASO:
    -- Só avaliamos prazo de pedidos entregues ou em trânsito (COMPLETE, CLOSED, PROCESSING).
    -- Pedidos aguardando pagamento/liberação ainda não têm prazo a cobrar -> "Não Avaliado".
    -- O Delivery Status original NÃO é usado: ele marca "Late delivery" até em pedidos PENDING.
    SELECT
        *,
        COALESCE(status_pedido IN ('CANCELED', 'SUSPECTED_FRAUD')
              OR status_entrega_original = 'Shipping canceled', FALSE)          AS pedido_cancelado,
        COALESCE(status_pedido IN ('COMPLETE', 'CLOSED', 'PROCESSING')
             AND status_entrega_original <> 'Shipping canceled', FALSE)         AS avaliado_prazo
    FROM base_limpa
),
regras_negocio AS (
    SELECT
        *,
        -- Dias de atraso (Real - Programado), só para pedidos avaliados.
        -- Não avaliados e cancelados ficam NULL para não distorcer médias.
        CASE WHEN avaliado_prazo
             THEN dias_envio_real - dias_envio_programado
        END AS dias_atraso,

        -- Flag de atraso: 1 = atrasado (real > programado), 0 = no prazo/adiantado, NULL = não avaliado.
        CASE WHEN avaliado_prazo
             THEN CASE WHEN dias_envio_real > dias_envio_programado THEN 1 ELSE 0 END
        END AS flag_atrasado,

        -- Data prevista: data do pedido + prazo programado (derivada das colunas originais;
        -- o DataCo não traz essa data pronta). Vale para todos os pedidos, inclusive pendentes,
        -- pois é a promessa feita ao cliente. Observação: data_envio = data_pedido + dias_envio_real.
        TIMESTAMPADD(DAY, dias_envio_programado, data_pedido) AS data_prevista_entrega,

        -- Janela de Atraso (Entregável Obrigatório Eng. de Dados)
        CASE
            WHEN pedido_cancelado    THEN '5. Envios Cancelados'
            WHEN NOT avaliado_prazo  THEN '0. Não Avaliado (Aguardando Liberação)'
            WHEN (dias_envio_real - dias_envio_programado) < 0  THEN '1. Adiantado (< 0 dias)'
            WHEN (dias_envio_real - dias_envio_programado) = 0  THEN '2. No Prazo (0 dias)'
            WHEN (dias_envio_real - dias_envio_programado) BETWEEN 1 AND 2 THEN '3. Atraso Leve (1 a 2 dias)'
            ELSE '4. Atraso Crítico (3+ dias)'
        END AS janela_atraso,

        -- Status do prazo em português (mesma regra da janela, versão curta).
        CASE
            WHEN pedido_cancelado    THEN 'Cancelado'
            WHEN NOT avaliado_prazo  THEN 'Não Avaliado'
            WHEN dias_envio_real <  dias_envio_programado THEN 'Adiantado'
            WHEN dias_envio_real =  dias_envio_programado THEN 'No Prazo'
            ELSE 'Atrasado'
        END AS status_entrega_pt,

        -- Situação do rastreio (Portal FullStack / Agente IA).
        -- PREMISSA DE SIMULAÇÃO: o DataCo é histórico e não tem status "em trânsito";
        -- usamos Order Status para separar entregues, aguardando, em trânsito e cancelados.
        CASE
            WHEN pedido_cancelado                                       THEN 'Cancelado'
            WHEN status_pedido IN ('COMPLETE', 'CLOSED')                THEN 'Entregue'
            WHEN status_pedido = 'PROCESSING'                           THEN 'Em Trânsito'
            WHEN status_pedido IN ('PENDING', 'PENDING_PAYMENT',
                                   'PAYMENT_REVIEW', 'ON_HOLD')         THEN 'Aguardando Liberação'
            ELSE 'Desconhecido'
        END AS situacao_rastreio,

        -- Rota Logística Padronizada
        CONCAT(
            COALESCE(origem_cliente_estado, 'N/A'),
            ' -> ',
            COALESCE(destino_regiao, 'N/A'),
            ' (', COALESCE(destino_cidade, 'N/A'), ' - ', COALESCE(destino_estado, 'N/A'), ')'
        ) AS rota_logistica,

        -- [Etapa 5] Motivo de quarentena (NULL = registro válido).
        -- CONCAT_WS ignora NULLs, então só aparecem os motivos que de fato ocorreram.
        NULLIF(CONCAT_WS('; ',
            CASE WHEN id_pedido IS NULL OR id_item_pedido IS NULL
                 THEN 'id_nulo' END,
            CASE WHEN data_pedido IS NULL OR data_envio IS NULL
                 THEN 'data_invalida' END,
            CASE WHEN data_envio < data_pedido
                 THEN 'envio_antes_do_pedido' END,
            CASE WHEN dias_envio_real IS NULL OR dias_envio_programado IS NULL
                   OR dias_envio_real < 0 OR dias_envio_programado < 0
                 THEN 'dias_envio_invalido' END,
            CASE WHEN COALESCE(risco_atraso_flag, -1) <> CASE WHEN status_entrega_original = 'Late delivery' THEN 1 ELSE 0 END
                 THEN 'flag_risco_incoerente_com_status' END,
            CASE WHEN origem_cliente_estado RLIKE '^[0-9]+$' OR origem_cliente_cidade IS NULL
                 THEN 'origem_invalida' END,
            CASE WHEN latitude_origem  NOT BETWEEN -90  AND 90
                   OR longitude_origem NOT BETWEEN -180 AND 180
                 THEN 'coordenada_fora_do_intervalo' END
        ), '') AS motivo_quarentena
    FROM avaliacao
),
indicadores_pmo AS (
    -- [Silver v2] Indicadores pedidos pela PMO. Ficam num CTE próprio porque dependem de
    -- flag_atrasado/dias_atraso, calculados no CTE anterior.
    SELECT
        *,
        -- no_prazo: inverso de flag_atrasado (NULL = pedido não avaliado: pendente ou cancelado).
        CASE flag_atrasado WHEN 0 THEN 1 WHEN 1 THEN 0 END AS no_prazo,

        -- faixa_atraso: versão simplificada da janela_atraso, no formato pedido pela PMO.
        CASE
            WHEN dias_atraso IS NULL THEN NULL
            WHEN dias_atraso <= 0    THEN 'No prazo'
            WHEN dias_atraso <= 2    THEN '1-2 dias'
            ELSE '3+ dias'
        END AS faixa_atraso,

        -- data_entrega_real: data em que o pedido chegou. Só existe para ENTREGUES (COMPLETE/CLOSED).
        -- PREMISSA DE DATAS (Silver v2): Shipping date = data_pedido + dias_envio_real (100% das
        -- linhas, por dia) = data da ENTREGA. Usar só a data: a hora tem erro de ±12h em ~5% das linhas.
        -- PROCESSING ainda não chegou: para ele, dias_envio_real = dias em trânsito até a foto e
        -- data_entrega_real = NULL. Pendentes/cancelados não foram despachados: NULL.
        CASE WHEN status_pedido IN ('COMPLETE', 'CLOSED') AND NOT pedido_cancelado
             THEN data_envio
        END AS data_entrega_real,

        -- periodo_pico: pedidos de novembro e dezembro. Só DIMENSÃO para o BI investigar;
        -- não é usada como causa (no DataCo o atraso em nov/dez é 58,1% contra 57,1% no resto do ano).
        CASE WHEN MONTH(data_pedido) IN (11, 12) THEN 1 ELSE 0 END AS periodo_pico,

        -- receita_em_risco: valor bruto (Sales) dos itens atrasados; 0 nos demais.
        CASE WHEN flag_atrasado = 1 THEN valor_bruto_venda ELSE 0 END AS receita_em_risco,

        -- causa_provavel (derivada só de dados reais):
        --   Promessa irreal = atrasado com prazo prometido <= 1 dia (Same Day e First Class), em
        --   qualquer destino. First Class promete 1 dia e leva sempre 2 (0% no prazo).
        --   Atraso operacional = demais atrasados (a base não registra o motivo).
        CASE
            WHEN flag_atrasado IS NULL      THEN NULL
            WHEN flag_atrasado = 0          THEN 'Sem atraso'
            WHEN dias_envio_programado <= 1 THEN 'Promessa irreal'
            ELSE 'Atraso operacional'
        END AS causa_provavel
    FROM regras_negocio
)
SELECT
    *,
    -- Texto pronto para o Agente de IA (RAG / resposta em linguagem natural).
    -- COALESCE em tudo: um único NULL zera o CONCAT inteiro.
    CONCAT(
        'Pedido #', COALESCE(CAST(id_pedido AS STRING), 'N/A'),
        -- [LGPD] Sem nome do cliente no texto que vai para o banco vetorial: só o ID.
        ' (Item #', COALESCE(CAST(id_item_pedido AS STRING), 'N/A'), ') | Cliente ID: ', COALESCE(CAST(id_cliente AS STRING), 'N/A'),
        ' | Produto: ', COALESCE(nome_produto, 'N/A'), ' (Categoria: ', COALESCE(categoria_produto, 'N/A'), ')',
        ' | Modalidade: ', COALESCE(modo_envio, 'N/A'),
        ' | Rota: ', rota_logistica,
        ' | Situação: ', situacao_rastreio, ' (Status Pedido: ', COALESCE(status_pedido, 'N/A'), ')',
        ' | Prazo do Envio: ', status_entrega_pt,
        ' | Prazo Programado: ', COALESCE(CAST(dias_envio_programado AS STRING), 'N/A'), ' dias',
        -- Dias reais e atraso só para pedidos despachados (não pagos/cancelados não têm trânsito)
        COALESCE(CASE WHEN avaliado_prazo
                      THEN CONCAT(' | Tempo Real de Trânsito: ', CAST(dias_envio_real AS STRING), ' dias',
                                  ' | Diferença/Atraso: ', CAST(dias_atraso AS STRING), ' dias') END, ''),
        ' | Janela: ', janela_atraso, '.'
    ) AS resumo_rastreio_rag,
    current_timestamp() AS dt_processamento_silver
FROM indicadores_pmo;

-- COMMAND ----------

-- -----------------------------------------------------------------------------
-- 2. SILVER (registros válidos)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE TABLE silver.pedidos_rastreio
COMMENT 'Silver: itens de pedido limpos, deduplicados e enriquecidos (grão = id_item_pedido)'
AS
SELECT * EXCEPT (motivo_quarentena)
FROM vw_silver_staging
WHERE motivo_quarentena IS NULL;

-- COMMAND ----------

-- -----------------------------------------------------------------------------
-- 3. QUARENTENA (registros inválidos + motivo, para auditoria e não perder dados)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE TABLE silver.pedidos_quarentena
COMMENT 'Silver: registros reprovados nas regras de qualidade, com motivo'
AS
SELECT *
FROM vw_silver_staging
WHERE motivo_quarentena IS NOT NULL;

-- COMMAND ----------

-- -----------------------------------------------------------------------------
-- 3b. VIEW DE CONSUMO: movida para 02e_silver_view_consumo.sql (Silver v2).
--     Motivo: a view agora junta o rastreio simulado (silver.rastreio_pedidos, criado
--     no 02d), que depende desta tabela. Ordem: 02a -> 02d -> 02e.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- 4. Validação rápida das Janelas de Atraso (testes completos em 02b)
-- -----------------------------------------------------------------------------
SELECT
    janela_atraso,
    status_entrega_pt,
    COUNT(DISTINCT id_pedido) AS total_pedidos,
    COUNT(*) AS total_itens,
    ROUND(AVG(dias_envio_programado), 2) AS media_prazo_programado,
    ROUND(AVG(dias_envio_real), 2) AS media_tempo_real,
    ROUND(AVG(dias_atraso), 2) AS media_dias_atraso
FROM silver.pedidos_rastreio
GROUP BY janela_atraso, status_entrega_pt
ORDER BY janela_atraso;

-- COMMAND ----------

-- -----------------------------------------------------------------------------
-- 5. Validação: Order Item Product Price x Product Price
--    Pergunta 1: as duas colunas são 100% iguais?
--    Pergunta 2 (caso verídico): qual preço x quantidade reconcilia com Sales
--               (valor bruto da venda)? Esse é o preço real praticado no pedido.
--    Esperado: preco_item_reconcilia_sales = total_linhas. Se Product Price
--    também reconciliar 100%, as colunas são equivalentes e a escolha não muda nada.
-- -----------------------------------------------------------------------------
SELECT
    COUNT(*) AS total_linhas,
    SUM(CASE WHEN ABS(TRY_CAST(`Order Item Product Price` AS DOUBLE)
                    - TRY_CAST(`Product Price` AS DOUBLE)) > 0.01
             THEN 1 ELSE 0 END) AS divergencias_entre_precos,
    SUM(CASE WHEN ABS(TRY_CAST(`Order Item Product Price` AS DOUBLE) * TRY_CAST(`Order Item Quantity` AS INT)
                    - TRY_CAST(`Sales` AS DOUBLE)) <= 0.01
             THEN 1 ELSE 0 END) AS preco_item_reconcilia_sales,
    SUM(CASE WHEN ABS(TRY_CAST(`Product Price` AS DOUBLE) * TRY_CAST(`Order Item Quantity` AS INT)
                    - TRY_CAST(`Sales` AS DOUBLE)) <= 0.01
             THEN 1 ELSE 0 END) AS preco_catalogo_reconcilia_sales
FROM bronze.dataco_raw;
