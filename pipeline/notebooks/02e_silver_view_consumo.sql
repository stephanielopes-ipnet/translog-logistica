-- Databricks notebook source
-- =============================================================================
-- PROJETO INTEGRADOR ACADEMY - GRUPO 3 (TRANSLOG BRASIL)
-- ETAPA 2e: TABELAS DE CONSUMO DA SILVER (Fullstack e IA leem DAQUI, nunca das tabelas internas)
-- Responsável: Engenharia de Dados (Mateus)
-- Ordem: 01 -> 01b -> 02a -> 02d -> 02g -> 02i -> 02e -> 02b -> 02h -> 03c -> 03d
--
-- CONTRATO DE CONSUMO (3 tabelas Delta, ligadas por id_pedido; filtro de segurança por id_cliente):
--   silver.consumo_pedidos             1 linha por PEDIDO. Tudo o que a IA precisa numa tabela só:
--                                 situação na data de referência, despacho, entrega, posição
--                                 atual, itens, linha do tempo e resumo_pedido (texto pronto).
--   silver.consumo_eventos_logisticos  1 linha por EVENTO (criada no 02i): linha do tempo detalhada
--                                 para a tela de rastreio do portal.
--   silver.consumo_itens_pedido        1 linha por ITEM: detalhe do que foi comprado (portal).
--   IA: lê só a consumo_pedidos. Portal: consumo_pedidos + consumo_eventos_logisticos + consumo_itens_pedido.
-- São TABELAS (não views): recriadas a cada execução (CREATE OR REPLACE), leitura rápida, exportáveis
-- e aceitas como origem do Vector Search (consumo_pedidos tem Change Data Feed ligado).
-- Rodar SEMPRE depois do 02i: são uma foto do que 02a/02g/02i publicaram (o 02b e o 02h conferem).
--
-- PREMISSA (doc 04): o DataCo mede o DESPACHO (dado real); entrega e posição vêm da
-- simulação. As views NÃO expõem marca de simulação (o cliente não pode receber "dado
-- simulado"); a marca fica nas tabelas internas (governança e Gold).
-- Data de referência (D): a base é uma foto na última transação registrada.
-- Fora das views: PII (nome, e-mail, endereço), lucro/margem (interno, vai para a Gold),
-- status original do pedido (não é foto atual: ver doc 04), rótulos originais de atraso,
-- linhagem técnica e marcas de simulação.
-- Tradução pt-BR: de-para em silver.dim_traducao (sem tradução, mantém o original).
-- =============================================================================

-- Views antigas, substituídas por este contrato (remoção não apaga dado: só a definição da view)
DROP VIEW IF EXISTS silver.vw_pedidos_rastreio;
DROP VIEW IF EXISTS silver.vw_pedidos;
DROP VIEW IF EXISTS silver.vw_itens_pedido;

-- COMMAND ----------

-- -----------------------------------------------------------------------------
-- TABELA: silver.consumo_itens_pedido — 1 linha por ITEM (o que foi comprado)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE TABLE silver.consumo_itens_pedido
COMMENT 'Itens de cada pedido (produto, quantidade e valores). Grão = item. Liga com consumo_pedidos por id_pedido'
AS
SELECT
    id_item_pedido, id_pedido, id_cliente,
    id_produto, nome_produto, categoria_produto, departamento,
    quantidade_item, preco_unitario, valor_bruto_venda, valor_desconto, valor_item_pedido
FROM silver.pedidos_rastreio;

-- COMMAND ----------

-- -----------------------------------------------------------------------------
-- TABELA: silver.consumo_pedidos — 1 linha por PEDIDO (a única que a IA precisa ler)
--   resumo_pedido, no formato:
--   "Pedido nº X, feito em dd/mm/aaaa. Itens: 1x Asa delta, 2x Chinelo. Situação: em trânsito.
--    Local atual: Alfândega Y (etapa 3 - Alfândega). Prazo de entrega: dd/mm/aaaa.
--    Pedido atrasado em N dia(s). Detalhe: ..."
--   linha_do_tempo: "28/01/2018 Pedido registrado · 30/01/2018 Pedido despachado · ..."
-- -----------------------------------------------------------------------------
CREATE OR REPLACE TABLE silver.consumo_pedidos
COMMENT 'Pedidos: situação na data de referência da base, despacho, entrega, posição atual, itens, linha do tempo e resumo para a IA. Grão = pedido. pt-BR, sem PII'
TBLPROPERTIES (delta.enableChangeDataFeed = true)
AS
WITH cab AS (
    -- 1 linha por pedido (os campos de pedido são iguais em todos os itens)
    SELECT * FROM silver.pedidos_rastreio
    QUALIFY ROW_NUMBER() OVER (PARTITION BY id_pedido ORDER BY id_item_pedido) = 1
),
itens AS (
    SELECT
        id_pedido,
        CAST(SUM(quantidade_item) AS INT)                                  AS qtd_itens,
        ROUND(SUM(valor_item_pedido), 2)                                   AS valor_total_pedido,
        ARRAY_JOIN(TRANSFORM(ARRAY_SORT(COLLECT_LIST(NAMED_STRUCT(
            'id', id_item_pedido,
            'txt', CONCAT(CAST(quantidade_item AS STRING), 'x ', nome_produto)))), x -> x.txt), ', ')
                                                                           AS lista_itens
    FROM silver.pedidos_rastreio
    GROUP BY id_pedido
),
linha AS (
    SELECT
        id_pedido,
        ARRAY_JOIN(TRANSFORM(ARRAY_SORT(COLLECT_LIST(NAMED_STRUCT(
            'seq', sequencia,
            'txt', CONCAT(DATE_FORMAT(ts_evento, 'dd/MM/yyyy'), ' ', descricao_evento,
                          CASE WHEN codigo_evento IN ('PEDIDO_CRIADO', 'PEDIDO_DESPACHADO') THEN ''
                               ELSE COALESCE(CONCAT(' (', local_evento, ')'), '') END)))), x -> x.txt), ' · ')
                                                                           AS linha_do_tempo
    FROM silver.consumo_eventos_logisticos
    GROUP BY id_pedido
),
base AS (
    SELECT
        cab.id_pedido, cab.id_cliente, cab.segmento_cliente, cab.data_pedido,
        COALESCE(r.situacao_pedido, cab.situacao_rastreio)                AS situacao_pedido,
        CAST(cab.data_referencia_base AS DATE)                            AS data_referencia_base,
        -- Serviço e rota (pt-BR)
        COALESCE(tme.valor_pt, cab.modo_envio)            AS modo_envio,
        r.modal_transporte, cab.tipo_rota, cab.mercado_logistico,
        COALESCE(tcp.valor_pt, cab.origem_cliente_pais)   AS origem_cliente_pais,
        COALESCE(tce.valor_pt, cab.origem_cliente_estado) AS origem_cliente_estado,
        COALESCE(tcc.valor_pt, cab.origem_cliente_cidade) AS origem_cliente_cidade,
        COALESCE(tp.valor_pt,  cab.destino_pais)          AS destino_pais,
        COALESCE(te.valor_pt,  cab.destino_estado)        AS destino_estado,
        COALESCE(tci.valor_pt, cab.destino_cidade)        AS destino_cidade,
        COALESCE(tr.valor_pt,  cab.destino_regiao)        AS destino_regiao,
        CASE cab.mercado_logistico
            WHEN 'Europe' THEN 'Europa' WHEN 'Pacific Asia' THEN 'Ásia-Pacífico' WHEN 'Africa' THEN 'África'
            WHEN 'LATAM' THEN 'América Latina' WHEN 'USCA' THEN 'EUA e Canadá' ELSE cab.mercado_logistico
        END                                               AS mercado_pt,
        -- Despacho (só pedidos despachados têm datas, dias e atraso)
        cab.dias_envio_programado                                         AS prazo_despacho_dias,
        CASE WHEN cab.avaliado_prazo THEN cab.dias_envio_real END         AS dias_ate_despacho,
        CASE WHEN cab.avaliado_prazo THEN cab.data_despacho_prevista END  AS data_despacho_prevista,
        cab.data_despacho_real, cab.status_prazo_despacho,
        cab.flag_atraso_despacho, cab.dias_atraso_despacho, cab.causa_atraso_despacho,
        -- Entrega
        r.data_entrega_prevista, r.data_entrega_realizada, r.flag_atraso_entrega,
        r.dias_atraso_entrega, r.causa_atraso_entrega, r.etapa_extravio,
        -- Posição atual
        r.etapa_atual_desc, r.local_atual, r.ultimo_evento_desc, r.ts_ultimo_evento,
        r.motivo_ocorrencia
    FROM cab
    LEFT JOIN silver.rastreio_pedidos r ON r.id_pedido = cab.id_pedido
    LEFT JOIN silver.dim_traducao tp  ON tp.coluna  = 'destino_pais'          AND tp.valor_original  = cab.destino_pais
    LEFT JOIN silver.dim_traducao te  ON te.coluna  = 'destino_estado'        AND te.valor_original  = cab.destino_estado
                                     AND te.contexto = cab.destino_pais
    LEFT JOIN silver.dim_traducao tci ON tci.coluna = 'destino_cidade'        AND tci.valor_original = cab.destino_cidade
                                     AND tci.contexto = cab.destino_pais
    LEFT JOIN silver.dim_traducao tr  ON tr.coluna  = 'destino_regiao'        AND tr.valor_original  = cab.destino_regiao
    LEFT JOIN silver.dim_traducao tcc ON tcc.coluna = 'origem_cliente_cidade' AND tcc.valor_original = cab.origem_cliente_cidade
    LEFT JOIN silver.dim_traducao tce ON tce.coluna = 'origem_cliente_estado' AND tce.valor_original = cab.origem_cliente_estado
    LEFT JOIN silver.dim_traducao tcp ON tcp.coluna = 'origem_cliente_pais'   AND tcp.valor_original = cab.origem_cliente_pais
    LEFT JOIN silver.dim_traducao tme ON tme.coluna = 'modo_envio'            AND tme.valor_original = cab.modo_envio
)
SELECT
    b.* EXCEPT (mercado_pt),
    CONCAT(COALESCE(b.mercado_pt, 'N/A'), ' - ', COALESCE(b.destino_regiao, 'N/A'), ' - ',
           COALESCE(b.modo_envio, 'N/A'))                                  AS rota_servico,
    i.qtd_itens, i.lista_itens, i.valor_total_pedido,
    l.linha_do_tempo,
    CONCAT(
        'Pedido nº ', CAST(b.id_pedido AS STRING), ', feito em ', DATE_FORMAT(b.data_pedido, 'dd/MM/yyyy'),
        '. Itens: ', i.lista_itens, '. ',
        CASE b.situacao_pedido
            WHEN 'Em trânsito' THEN CONCAT('Situação: em trânsito. Local atual: ', b.local_atual,
                                           ' (etapa ', b.etapa_atual_desc, '). ')
            WHEN 'Entregue no prazo' THEN CONCAT('Situação: entregue no prazo em ',
                                                 DATE_FORMAT(b.data_entrega_realizada, 'dd/MM/yyyy'), '. ')
            WHEN 'Entregue com atraso' THEN CONCAT('Situação: entregue em ',
                                                   DATE_FORMAT(b.data_entrega_realizada, 'dd/MM/yyyy'), ', com ',
                                                   CAST(b.dias_atraso_entrega AS STRING), ' dia(s) de atraso. ')
            WHEN 'Extraviado' THEN CONCAT('Situação: volume extraviado (', b.local_atual, '). ')
            WHEN 'Aguardando pagamento' THEN 'Situação: aguardando a confirmação do pagamento; o pedido ainda não foi despachado. '
            WHEN 'Não pago (expirado)' THEN 'Situação: o pagamento não foi confirmado e o pedido expirou sem despacho. '
            WHEN 'Cancelado' THEN 'Situação: pedido cancelado. '
            ELSE CONCAT('Situação: ', b.situacao_pedido, '. ')
        END,
        COALESCE(CONCAT('Prazo de entrega: ', DATE_FORMAT(b.data_entrega_prevista, 'dd/MM/yyyy'), '. '), ''),
        CASE WHEN b.situacao_pedido = 'Em trânsito' AND b.flag_atraso_entrega = 1
             THEN CONCAT('Pedido atrasado em ', CAST(b.dias_atraso_entrega AS STRING), ' dia(s). ') ELSE '' END,
        COALESCE(CONCAT('Detalhe: ', b.motivo_ocorrencia), '')
    )                                                                      AS resumo_pedido
FROM base b
JOIN itens i ON i.id_pedido = b.id_pedido
LEFT JOIN linha l ON l.id_pedido = b.id_pedido;

-- COMMAND ----------

-- Conferência: um pedido por situação (o que a IA e o portal recebem)
SELECT situacao_pedido, resumo_pedido, linha_do_tempo
FROM silver.consumo_pedidos
QUALIFY ROW_NUMBER() OVER (PARTITION BY situacao_pedido ORDER BY id_pedido DESC) = 1;
