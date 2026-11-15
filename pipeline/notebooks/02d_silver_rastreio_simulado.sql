-- Databricks notebook source
-- =============================================================================
-- PROJETO INTEGRADOR ACADEMY - GRUPO 3 (TRANSLOG BRASIL)
-- ETAPA 2d: MALHA DE HUBS + RASTREIO SIMULADO (Silver v2)
-- Responsável: Engenharia de Dados (Mateus)
-- Rodar depois de 02a (precisa de silver.pedidos_rastreio e silver.dim_traducao).
-- Ordem: 01 -> 01b -> 02a -> 02d -> 02e (view) -> 02b (testes)
--
-- POR QUE SIMULAR: o DataCo só tem datas macro (pedido, entrega, dias programados/reais).
-- Não existe "onde o pedido está". Para o portal e o agente de IA responderem
-- "cadê meu pedido?", simulamos APENAS A POSIÇÃO do pedido numa malha de hubs:
--   - só pedidos despachados têm posição (sem pagamento não há despacho);
--   - entregues estão no destino; em trânsito (PROCESSING) recebem uma etapa sorteada por
--     hash de id_pedido (determinístico: rodar de novo dá o mesmo resultado);
--   - a posição NÃO afirma nada sobre atraso: atraso e motivo vêm só de dados reais
--     (flag_atrasado, dias, causa_provavel). Não há gargalo nem motivo sorteado.
-- Malha e posição levam hub_simulado = true / dado_simulado = true.
--
-- Saídas: silver.dim_hubs (malha) e silver.rastreio_pedidos (1 linha por id_pedido)
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. MALHA DE HUBS (silver.dim_hubs) — nomes derivados dos próprios dados
--    GATEWAY_ORIGEM   : 5 fixos (saída da carga nos EUA / Porto Rico)
--    CD_NACIONAL      : 1 por país de destino, na cidade com mais pedidos do país
--    ALFANDEGA        : 1 por país internacional, na mesma cidade do CD
--    ARMAZEM_ESTADUAL : só os 3 estados com mais pedidos de cada país (decisão 14/11);
--                       os demais estados são atendidos direto pelo CD nacional.
--    id_hub determinístico (md5 da chave), para a versão LLM poder ser comparada pela chave.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE TABLE silver.dim_hubs
COMMENT 'Silver v2: malha de hubs SIMULADA (gateways, CDs, alfândegas, armazéns estaduais)'
AS
WITH pedidos AS (
    -- 1 linha por pedido (todos os itens de um pedido têm o mesmo destino)
    SELECT id_pedido, destino_pais, destino_estado, destino_cidade
    FROM silver.pedidos_rastreio
    QUALIFY ROW_NUMBER() OVER (PARTITION BY id_pedido ORDER BY id_item_pedido) = 1
),
vol_cidade_pais AS (
    SELECT destino_pais, destino_cidade, COUNT(*) AS pedidos
    FROM pedidos GROUP BY destino_pais, destino_cidade
),
cidade_pais AS (
    SELECT destino_pais, destino_cidade AS cidade
    FROM vol_cidade_pais
    QUALIFY ROW_NUMBER() OVER (PARTITION BY destino_pais ORDER BY pedidos DESC, destino_cidade) = 1
),
vol_pais AS (
    SELECT destino_pais, COUNT(*) AS pedidos FROM pedidos GROUP BY destino_pais
),
vol_estado AS (
    SELECT destino_pais, destino_estado, COUNT(*) AS pedidos
    FROM pedidos GROUP BY destino_pais, destino_estado
),
top_estados AS (
    SELECT *,
           ROW_NUMBER() OVER (PARTITION BY destino_pais ORDER BY pedidos DESC, destino_estado) AS ranking_estado
    FROM vol_estado
    QUALIFY ranking_estado <= 3
),
vol_cidade_estado AS (
    SELECT destino_pais, destino_estado, destino_cidade, COUNT(*) AS pedidos
    FROM pedidos GROUP BY destino_pais, destino_estado, destino_cidade
),
cidade_estado AS (
    SELECT destino_pais, destino_estado, destino_cidade AS cidade
    FROM vol_cidade_estado
    QUALIFY ROW_NUMBER() OVER (PARTITION BY destino_pais, destino_estado
                               ORDER BY pedidos DESC, destino_cidade) = 1
),
paises AS (
    SELECT v.destino_pais AS pais_original,
           COALESCE(tp.valor_pt, v.destino_pais) AS pais,
           COALESCE(tc.valor_pt, c.cidade) AS cidade, v.pedidos
    FROM vol_pais v
    JOIN cidade_pais c USING (destino_pais)
    LEFT JOIN silver.dim_traducao tp ON tp.coluna = 'destino_pais' AND tp.valor_original = v.destino_pais
    LEFT JOIN silver.dim_traducao tc ON tc.coluna = 'destino_cidade' AND tc.valor_original = c.cidade
                                    AND tc.contexto = v.destino_pais
),
gateways AS (
    -- Gateways de saída (fixos). Regra de uso no rastreio (seção 2):
    --   origem Porto Rico -> San Juan; EUA -> por mercado de destino.
    SELECT * FROM VALUES
        ('GW-MIA', 'Estados Unidos', 'Flórida',     'Miami',       'Gateway Miami (EUA)',          'Origem EUA, mercado LATAM'),
        ('GW-NYC', 'Estados Unidos', 'Nova York',   'Nova York',   'Gateway Nova York (EUA)',      'Origem EUA, mercados Europa e África'),
        ('GW-LAX', 'Estados Unidos', 'Califórnia',  'Los Angeles', 'Gateway Los Angeles (EUA)',    'Origem EUA, mercado Ásia-Pacífico'),
        ('GW-MEM', 'Estados Unidos', 'Tennessee',   'Memphis',     'Hub de Coleta Memphis (EUA)',  'Origem EUA, mercado EUA e Canadá'),
        ('GW-SJU', 'Porto Rico',     'Porto Rico',  'San Juan',    'Gateway San Juan (Porto Rico)', 'Origem Porto Rico, todos os mercados')
        AS g(id_hub, pais, estado, cidade, nome_hub, atende)
)
SELECT id_hub, 'GATEWAY_ORIGEM' AS tipo_hub, pais, estado, cidade, nome_hub, atende,
       CAST(NULL AS STRING) AS pais_original, CAST(NULL AS STRING) AS estado_original,
       CAST(NULL AS INT) AS ranking_estado, CAST(NULL AS BIGINT) AS pedidos_atendidos,
       TRUE AS hub_simulado, 'derivado' AS fonte
FROM gateways

UNION ALL
SELECT CONCAT('CD-', SUBSTR(md5(pais_original), 1, 10)), 'CD_NACIONAL', pais, NULL, cidade,
       CONCAT('CD ', cidade, ' (', pais, ')'), CONCAT('Destinos em ', pais),
       pais_original, NULL, NULL, pedidos, TRUE, 'derivado'
FROM paises

UNION ALL
-- Alfândega só para destino internacional (o doméstico EUA não passa por alfândega)
SELECT CONCAT('AF-', SUBSTR(md5(pais_original), 1, 10)), 'ALFANDEGA', pais, NULL, cidade,
       CONCAT('Alfândega ', cidade, ' (', pais, ')'), CONCAT('Desembaraço aduaneiro em ', pais),
       pais_original, NULL, NULL, pedidos, TRUE, 'derivado'
FROM paises
WHERE pais_original <> 'Estados Unidos'

UNION ALL
SELECT CONCAT('AR-', SUBSTR(md5(CONCAT(t.destino_pais, '|', t.destino_estado)), 1, 10)),
       'ARMAZEM_ESTADUAL',
       COALESCE(tp.valor_pt, t.destino_pais),
       COALESCE(te.valor_pt, t.destino_estado),
       COALESCE(tc.valor_pt, c.cidade),
       CONCAT('Armazém ', COALESCE(tc.valor_pt, c.cidade), ' - ', COALESCE(te.valor_pt, t.destino_estado),
              ' (', COALESCE(tp.valor_pt, t.destino_pais), ')'),
       CONCAT('Top ', CAST(t.ranking_estado AS STRING), ' do país em pedidos'),
       t.destino_pais, t.destino_estado, t.ranking_estado, t.pedidos, TRUE, 'derivado'
FROM top_estados t
JOIN cidade_estado c USING (destino_pais, destino_estado)
LEFT JOIN silver.dim_traducao tp ON tp.coluna = 'destino_pais'   AND tp.valor_original = t.destino_pais
LEFT JOIN silver.dim_traducao te ON te.coluna = 'destino_estado' AND te.valor_original = t.destino_estado
                                AND te.contexto = t.destino_pais
LEFT JOIN silver.dim_traducao tc ON tc.coluna = 'destino_cidade' AND tc.valor_original = c.cidade
                                AND tc.contexto = t.destino_pais;

-- COMMAND ----------

-- -----------------------------------------------------------------------------
-- 2. RASTREIO SIMULADO (silver.rastreio_pedidos) — 1 linha por id_pedido
--    Etapas: 1 Coleta (gateway) · 2 Voo · 3 Alfândega · 4 Transferência (CD -> armazém)
--            5 Última milha / entregue
--    Rotas:  internacional = 1-2-3-4-5
--            doméstica aérea (origem Porto Rico ou Same Day/First Class) = 1-2-4-5
--              (sem alfândega: Porto Rico é território dos EUA)
--            doméstica rodoviária (EUA -> EUA, Second/Standard) = 1-4-5
--    Matriz (validada no 02b):
--      não despachado (pendente, em análise, em espera) e cancelado -> tudo NULL
--      PROCESSING (em trânsito)  -> etapa sorteada entre as etapas da rota, local = hub/voo
--      COMPLETE/CLOSED (entregue) -> etapa 5, local = cidade de destino
--    motivo_ocorrencia: texto FACTUAL montado só com números reais (dias, prazo, % no prazo
--    da modalidade). Não é simulado.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE TABLE silver.rastreio_pedidos
COMMENT 'Silver v2: posição SIMULADA de cada pedido despachado na malha de hubs + motivo factual. Grão = id_pedido'
AS
WITH taxa_modalidade AS (
    -- % de itens ENTREGUES no prazo por modalidade (evidência para "Promessa irreal")
    SELECT modo_envio,
           ROUND(100.0 * AVG(no_prazo), 1) AS pct_no_prazo_modalidade
    FROM silver.pedidos_rastreio
    WHERE status_pedido IN ('COMPLETE', 'CLOSED') AND no_prazo IS NOT NULL
    GROUP BY modo_envio
),
pedidos AS (
    SELECT
        p.id_pedido, p.status_pedido, p.pedido_cancelado, p.avaliado_prazo,
        p.modo_envio, p.mercado_logistico, p.origem_cliente_pais,
        p.destino_pais, p.destino_estado, p.destino_cidade,
        p.dias_envio_programado, p.dias_envio_real, p.dias_atraso,
        p.flag_atrasado, p.causa_provavel,
        t.pct_no_prazo_modalidade,
        p.destino_pais = 'Estados Unidos'                    AS domestico,
        p.origem_cliente_pais = 'Puerto Rico'                AS origem_porto_rico,
        p.status_pedido IN ('COMPLETE', 'CLOSED') AND NOT p.pedido_cancelado AS entregue,
        p.status_pedido = 'PROCESSING' AND NOT p.pedido_cancelado            AS em_transito,
        -- Sorteio determinístico (0-99) da etapa de quem está em trânsito
        pmod(xxhash64(p.id_pedido, 'etapa'), 100)            AS sorteio_etapa
    FROM silver.pedidos_rastreio p
    LEFT JOIN taxa_modalidade t USING (modo_envio)
    QUALIFY ROW_NUMBER() OVER (PARTITION BY p.id_pedido ORDER BY p.id_item_pedido) = 1
),
etapa AS (
    SELECT
        *,
        -- Etapas que existem na rota do pedido (doméstico nunca passa pela alfândega;
        -- só voa se for aéreo: origem Porto Rico ou Same Day/First Class)
        CASE
            WHEN NOT domestico THEN array(1, 2, 3, 4, 5)
            WHEN origem_porto_rico OR modo_envio IN ('Same Day', 'First Class')
                               THEN array(1, 2, 4, 5)
            ELSE                    array(1, 4, 5)
        END AS etapas_rota
    FROM pedidos
),
posicao AS (
    SELECT
        *,
        CASE
            WHEN entregue    THEN 5
            WHEN em_transito THEN element_at(etapas_rota,
                                             CAST(pmod(sorteio_etapa, size(etapas_rota)) AS INT) + 1)
        END AS etapa_atual,     -- NULL = não despachado ou cancelado
        CASE
            WHEN origem_porto_rico                         THEN 'GW-SJU'
            WHEN mercado_logistico = 'LATAM'               THEN 'GW-MIA'
            WHEN mercado_logistico IN ('Europe', 'Africa') THEN 'GW-NYC'
            WHEN mercado_logistico = 'Pacific Asia'        THEN 'GW-LAX'
            ELSE 'GW-MEM'
        END AS id_gateway
    FROM etapa
),
com_hubs AS (
    SELECT
        e.*,
        COALESCE(tp.valor_pt, e.destino_pais)   AS pais_pt,
        COALESCE(te.valor_pt, e.destino_estado) AS estado_pt,
        COALESCE(tc.valor_pt, e.destino_cidade) AS cidade_pt,
        gw.id_hub AS gw_id, gw.nome_hub AS gw_nome, gw.cidade AS gw_cidade,
        cd.id_hub AS cd_id, cd.nome_hub AS cd_nome, cd.cidade AS cd_cidade,
        af.id_hub AS af_id, af.nome_hub AS af_nome,
        ar.id_hub AS ar_id, ar.nome_hub AS ar_nome
    FROM posicao e
    LEFT JOIN silver.dim_hubs gw ON gw.id_hub = e.id_gateway
    LEFT JOIN silver.dim_hubs cd ON cd.tipo_hub = 'CD_NACIONAL' AND cd.pais_original = e.destino_pais
    LEFT JOIN silver.dim_hubs af ON af.tipo_hub = 'ALFANDEGA'   AND af.pais_original = e.destino_pais
    LEFT JOIN silver.dim_hubs ar ON ar.tipo_hub = 'ARMAZEM_ESTADUAL'
                                AND ar.pais_original = e.destino_pais AND ar.estado_original = e.destino_estado
    LEFT JOIN silver.dim_traducao tp ON tp.coluna = 'destino_pais'   AND tp.valor_original = e.destino_pais
    LEFT JOIN silver.dim_traducao te ON te.coluna = 'destino_estado' AND te.valor_original = e.destino_estado
                                    AND te.contexto = e.destino_pais
    LEFT JOIN silver.dim_traducao tc ON tc.coluna = 'destino_cidade' AND tc.valor_original = e.destino_cidade
                                    AND tc.contexto = e.destino_pais
)
SELECT
    id_pedido,
    IF(domestico, 'Doméstica', 'Internacional') AS tipo_rota,
    CASE
        WHEN NOT (entregue OR em_transito)                       THEN NULL
        WHEN modo_envio IN ('Same Day', 'First Class')           THEN 'Aéreo expresso'
        WHEN domestico AND NOT origem_porto_rico                 THEN 'Rodoviário'
        ELSE 'Aéreo consolidado'
    END AS modal_transporte,

    etapa_atual,
    CASE etapa_atual
        WHEN 1 THEN '1 - Coleta'
        WHEN 2 THEN '2 - Voo'
        WHEN 3 THEN '3 - Alfândega'
        WHEN 4 THEN '4 - Transferência'
        WHEN 5 THEN '5 - Última milha'
    END AS etapa_atual_desc,

    -- Último ponto físico (hub) do pedido
    CASE
        WHEN etapa_atual IN (1, 2) THEN gw_id
        WHEN etapa_atual = 3       THEN af_id
        WHEN etapa_atual = 4       THEN cd_id
        WHEN etapa_atual = 5       THEN COALESCE(ar_id, cd_id)
    END AS id_hub_atual,
    CASE
        WHEN etapa_atual IS NULL THEN NULL
        WHEN entregue            THEN CONCAT('Entregue em ', cidade_pt, ' - ', estado_pt, ' (', pais_pt, ')')
        WHEN etapa_atual = 1     THEN gw_nome
        WHEN etapa_atual = 2     THEN CONCAT('Em voo: ', gw_cidade, ' -> ', cd_cidade, ' (', pais_pt, ')')
        WHEN etapa_atual = 3     THEN af_nome
        WHEN etapa_atual = 4     THEN COALESCE(CONCAT('Em transferência: ', cd_nome, ' -> ', ar_nome),
                                               CONCAT('Transferência direta a partir do ', cd_nome))
        WHEN etapa_atual = 5     THEN CONCAT('Em rota de entrega - ', cidade_pt,
                                             ' (saída: ', COALESCE(ar_nome, cd_nome), ')')
    END AS local_atual,

    -- Motivo FACTUAL (só números reais). NULL para não despachados e cancelados.
    CASE
        WHEN NOT avaliado_prazo THEN NULL
        ELSE CONCAT(
            IF(entregue,
               CONCAT('Entregue em ', CAST(dias_envio_real AS STRING), ' dia(s)'),
               CONCAT('Em trânsito há ', CAST(dias_envio_real AS STRING), ' dia(s)')),
            CASE
                WHEN flag_atrasado = 0
                    THEN CONCAT(', dentro do prazo prometido de ', CAST(dias_envio_programado AS STRING), ' dia(s).')
                ELSE CONCAT(', ', CAST(dias_atraso AS STRING), ' dia(s) além do prazo prometido de ',
                            CAST(dias_envio_programado AS STRING), ' dia(s).')
            END,
            CASE
                WHEN causa_provavel = 'Promessa irreal'
                    THEN CONCAT(' Prazo irreal para a modalidade ', modo_envio, ': só ',
                                COALESCE(CAST(pct_no_prazo_modalidade AS STRING), 'N/A'),
                                '% das entregas dela cumprem o prazo prometido.')
                WHEN causa_provavel = 'Atraso operacional'
                    THEN ' A base não registra o motivo do atraso.'
                ELSE ''
            END)
    END AS motivo_ocorrencia,

    -- A posição (etapa/local/hub) é simulada; o motivo, não.
    etapa_atual IS NOT NULL AS dado_simulado,
    current_timestamp()     AS dt_processamento_rastreio
FROM com_hubs;

-- COMMAND ----------

-- -----------------------------------------------------------------------------
-- 3. CONFERÊNCIAS RÁPIDAS (testes PASS/FAIL completos em 02b)
-- -----------------------------------------------------------------------------
-- 3a. Hubs por tipo (esperado: 5 gateways, 164 CDs, 163 alfândegas, 370 armazéns)
SELECT tipo_hub, COUNT(*) AS hubs FROM silver.dim_hubs GROUP BY tipo_hub ORDER BY tipo_hub;

-- COMMAND ----------

-- 3b. Causa provável dos itens atrasados por modalidade
--     (esperado: Same Day e First Class só em "Promessa irreal")
SELECT causa_provavel, modo_envio, COUNT(*) AS itens
FROM silver.pedidos_rastreio
WHERE flag_atrasado = 1
GROUP BY ALL ORDER BY causa_provavel, modo_envio;

-- COMMAND ----------

-- 3c. Situação x etapa (esperado: Aguardando Liberação/Cancelado sem etapa; Entregue só na 5)
SELECT s.situacao_rastreio, r.tipo_rota, r.etapa_atual_desc, COUNT(*) AS pedidos
FROM silver.rastreio_pedidos r
JOIN (SELECT id_pedido, situacao_rastreio FROM silver.pedidos_rastreio
      QUALIFY ROW_NUMBER() OVER (PARTITION BY id_pedido ORDER BY id_item_pedido) = 1) s
  USING (id_pedido)
GROUP BY ALL ORDER BY 1, 2, 3;

-- COMMAND ----------

-- 3d. Modal x tipo de rota (esperado: Rodoviário só em doméstica; Porto Rico -> EUA aéreo)
SELECT tipo_rota, modal_transporte, COUNT(*) AS pedidos
FROM silver.rastreio_pedidos
GROUP BY ALL ORDER BY 1, 2;

-- COMMAND ----------

-- 3e. Amostra legível: um pedido por etapa (NULL = não despachado/cancelado)
SELECT etapa_atual_desc, local_atual, motivo_ocorrencia
FROM silver.rastreio_pedidos
QUALIFY ROW_NUMBER() OVER (PARTITION BY etapa_atual_desc ORDER BY id_pedido) = 1;

-- -----------------------------------------------------------------------------
-- 4. (OPCIONAL) VERSÃO LLM DOS HUBS — para comparar com a derivada
--    1) Gere o CSV com o prompt em pipeline/contexto/prompt_hubs_llm.md
--    2) Suba o arquivo para /Volumes/workspace/silver/insumos/hubs_llm.csv
--    3) Descomente e rode o bloco abaixo.
--    A view continua usando silver.dim_hubs (derivada) até o Mateus escolher.
-- -----------------------------------------------------------------------------
-- CREATE VOLUME IF NOT EXISTS workspace.silver.insumos;
--
-- CREATE OR REPLACE TABLE silver.dim_hubs_llm AS
-- SELECT
--     CASE tipo_hub
--         WHEN 'CD_NACIONAL' THEN CONCAT('CD-', SUBSTR(md5(pais_original), 1, 10))
--         ELSE CONCAT('AR-', SUBSTR(md5(CONCAT(pais_original, '|', estado_original)), 1, 10))
--     END AS id_hub,
--     tipo_hub, pais_original, NULLIF(estado_original, '') AS estado_original,
--     cidade, nome_hub, 'llm' AS fonte
-- FROM read_files('/Volumes/workspace/silver/insumos/hubs_llm.csv',
--                 format => 'csv', header => true, encoding => 'UTF-8');
--
-- -- Lado a lado: derivado x LLM (mesma chave id_hub). Linhas com só um lado = divergência de chave.
-- SELECT d.tipo_hub, d.pais, d.estado,
--        d.nome_hub AS nome_derivado, l.nome_hub AS nome_llm,
--        d.cidade = l.cidade AS mesma_cidade
-- FROM silver.dim_hubs d
-- FULL OUTER JOIN silver.dim_hubs_llm l USING (id_hub)
-- WHERE COALESCE(d.tipo_hub, l.tipo_hub) IN ('CD_NACIONAL', 'ARMAZEM_ESTADUAL')
-- ORDER BY d.pais, d.tipo_hub, d.estado;
