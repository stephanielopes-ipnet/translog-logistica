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
--   7. [Silver v2] Indicadores da PMO (despacho_no_prazo, faixa_atraso_despacho, periodo_pico,
--      causa_atraso_despacho, data_despacho_real)
-- PREMISSA DE DATAS (Silver v3, doc 04_decisao_premissa_despacho.md, validada com o instrutor):
--   o DataCo mede o DESPACHO, não a entrega.
--   dias_envio_programado = prazo de DESPACHO prometido; dias_envio_real = tempo real até o
--   DESPACHO; data_envio (Shipping date) = data do despacho (= data_pedido + dias_envio_real).
--   flag_atraso_despacho / dias_atraso_despacho / faixa_atraso_despacho / despacho_no_prazo / causa_atraso_despacho
--   medem o ATRASO NO DESPACHO (dado real). Entrega, atraso na entrega e extravio são
--   SIMULADOS (02g -> silver.entregas_simuladas) e nunca são calculados aqui.
-- Saídas: silver.pedidos_rastreio (válidos), silver.pedidos_quarentena (inválidos + motivo)
-- Ordem de execução: 01 -> 01b -> 02a -> 02d (hubs) -> 02g (eventos, chama 02f) -> 02i (rastreio)
--                    -> 02e (view de consumo) -> 02b (testes Silver) -> 02h (testes eventos)
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

        -- Prazos de DESPACHO (programado x real) e flag de risco original
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
    -- REGRA DE NEGÓCIO DO ATRASO NO DESPACHO:
    -- Só avaliamos o prazo de despacho de pedidos pagos e despachados (COMPLETE, CLOSED, PROCESSING).
    -- Pedidos aguardando pagamento/liberação ainda não têm prazo a cobrar -> "Não Avaliado".
    -- O Delivery Status original NÃO é usado: é só real x programado e marca "Late delivery"
    -- até em pedidos PENDING (não pagos). Leitura adotada: status do prazo de DESPACHO.
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
        END AS dias_atraso_despacho,

        -- Flag de atraso: 1 = atrasado (real > programado), 0 = no prazo/adiantado, NULL = não avaliado.
        CASE WHEN avaliado_prazo
             THEN CASE WHEN dias_envio_real > dias_envio_programado THEN 1 ELSE 0 END
        END AS flag_atraso_despacho,

        -- Data prevista de DESPACHO: data do pedido + prazo programado (derivada das colunas
        -- originais). DATE: a base só tem precisão de dia (a hora do Shipping date repete a do pedido).
        -- Vale para todos os pedidos, inclusive pendentes (é a promessa feita ao cliente).
        -- A previsão de ENTREGA é simulada (silver.entregas_simuladas).
        DATE_ADD(CAST(data_pedido AS DATE), dias_envio_programado) AS data_despacho_prevista,

        -- Tipo de rota (derivado de dado real): destino EUA = doméstica; resto = internacional
        -- (Canadá inclusive). Origem é sempre EUA ou Porto Rico.
        CASE WHEN destino_pais = 'Estados Unidos' THEN 'Doméstica' ELSE 'Internacional' END AS tipo_rota,

        -- Janela de Atraso (Entregável Obrigatório Eng. de Dados)
        CASE
            WHEN pedido_cancelado    THEN '5. Envios Cancelados'
            WHEN NOT avaliado_prazo  THEN '0. Não Avaliado (Aguardando Liberação)'
            WHEN (dias_envio_real - dias_envio_programado) < 0  THEN '1. Adiantado (< 0 dias)'
            WHEN (dias_envio_real - dias_envio_programado) = 0  THEN '2. No Prazo (0 dias)'
            WHEN (dias_envio_real - dias_envio_programado) BETWEEN 1 AND 2 THEN '3. Atraso Leve (1 a 2 dias)'
            ELSE '4. Atraso Crítico (3+ dias)'
        END AS janela_atraso_despacho,

        -- Status do prazo de DESPACHO em português (mesma regra da janela, versão curta).
        CASE
            WHEN pedido_cancelado    THEN 'Cancelado'
            WHEN NOT avaliado_prazo  THEN 'Não Avaliado'
            WHEN dias_envio_real <  dias_envio_programado THEN 'Adiantado'
            WHEN dias_envio_real =  dias_envio_programado THEN 'No Prazo'
            ELSE 'Atrasado'
        END AS status_prazo_despacho,

        -- Situação do pedido na base REAL (até o despacho). Usa Order Status:
        --   COMPLETE/CLOSED = pedido concluído e despachado; PROCESSING = despachado, pedido
        --   ainda aberto (em trânsito); pendentes = aguardando liberação; cancelados.
        -- A situação da ENTREGA (entregue, atrasada, extraviada) é simulada: situacao_entrega.
        CASE
            WHEN pedido_cancelado                                       THEN 'Cancelado'
            WHEN status_pedido IN ('COMPLETE', 'CLOSED')                THEN 'Despachado'
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
    -- flag_atraso_despacho/dias_atraso_despacho, calculados no CTE anterior.
    SELECT
        *,
        -- despacho_no_prazo: inverso de flag_atraso_despacho (NULL = pedido não avaliado: pendente ou cancelado).
        CASE flag_atraso_despacho WHEN 0 THEN 1 WHEN 1 THEN 0 END AS despacho_no_prazo,

        -- faixa_atraso_despacho: versão simplificada da janela_atraso_despacho, no formato pedido pela PMO.
        CASE
            WHEN dias_atraso_despacho IS NULL THEN NULL
            WHEN dias_atraso_despacho <= 0    THEN 'No prazo'
            WHEN dias_atraso_despacho <= 2    THEN '1-2 dias'
            ELSE '3+ dias'
        END AS faixa_atraso_despacho,

        -- data_despacho_real: data em que o pedido foi DESPACHADO (Shipping date), só para
        -- pedidos pagos e despachados (COMPLETE, CLOSED, PROCESSING). DATE: a hora do Shipping
        -- date repete a hora do pedido (Same Day: +12h), então não é um horário observado.
        -- Pendentes/cancelados não foram despachados: NULL.
        CASE WHEN avaliado_prazo THEN CAST(data_envio AS DATE) END AS data_despacho_real,

        -- periodo_pico: pedidos de novembro e dezembro. Só DIMENSÃO para o BI investigar;
        -- não é usada como causa (no DataCo o atraso em nov/dez é 58,1% contra 57,1% no resto do ano).
        CASE WHEN MONTH(data_pedido) IN (11, 12) THEN 1 ELSE 0 END AS periodo_pico,

        -- receita_em_risco agora é da ENTREGA (atrasada ou extraviada) e fica só na Gold (03b).

        -- causa_atraso_despacho do atraso no DESPACHO (derivada só de dados reais):
        --   Promessa irreal = atrasado com prazo de despacho prometido <= 1 dia (Same Day e
        --   First Class), em qualquer destino. First Class promete 1 dia e despacha sempre em 2.
        --   Atraso operacional = demais atrasados (a base não registra o motivo).
        CASE
            WHEN flag_atraso_despacho IS NULL      THEN NULL
            WHEN flag_atraso_despacho = 0          THEN 'Sem atraso'
            WHEN dias_envio_programado <= 1 THEN 'Promessa irreal'
            ELSE 'Atraso operacional'
        END AS causa_atraso_despacho
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
        ' | Prazo de despacho: ', status_prazo_despacho,
        ' | Prazo de despacho prometido: ', COALESCE(CAST(dias_envio_programado AS STRING), 'N/A'), ' dias',
        -- Dias reais e atraso só para pedidos despachados (não pagos/cancelados não foram despachados)
        COALESCE(CASE WHEN avaliado_prazo
                      THEN CONCAT(' | Tempo real até o despacho: ', CAST(dias_envio_real AS STRING), ' dias',
                                  ' | Atraso no despacho: ', CAST(dias_atraso_despacho AS STRING), ' dias') END, ''),
        ' | Janela: ', janela_atraso_despacho, '.'
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
-- 3b. VIEW DE CONSUMO: movida para 02e_silver_view_consumo.sql.
--     Motivo: a view junta o rastreio simulado (silver.rastreio_pedidos, criado no 02i a
--     partir dos eventos do 02g), que depende desta tabela.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- 4. Validação rápida das Janelas de Atraso (testes completos em 02b)
-- -----------------------------------------------------------------------------
SELECT
    janela_atraso_despacho,
    status_prazo_despacho,
    COUNT(DISTINCT id_pedido) AS total_pedidos,
    COUNT(*) AS total_itens,
    ROUND(AVG(dias_envio_programado), 2) AS media_prazo_programado,
    ROUND(AVG(dias_envio_real), 2) AS media_tempo_real,
    ROUND(AVG(dias_atraso_despacho), 2) AS media_dias_atraso
FROM silver.pedidos_rastreio
GROUP BY janela_atraso_despacho, status_prazo_despacho
ORDER BY janela_atraso_despacho;

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
