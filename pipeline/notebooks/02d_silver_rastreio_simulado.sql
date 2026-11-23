-- Databricks notebook source
-- =============================================================================
-- PROJETO INTEGRADOR ACADEMY - GRUPO 3 (TRANSLOG BRASIL)
-- ETAPA 2d: MALHA DE HUBS SIMULADA (silver.dim_hubs)
-- Responsável: Engenharia de Dados (Mateus)
-- Rodar depois de 02a (precisa de silver.pedidos_rastreio e silver.dim_traducao).
-- Ordem: 01 -> 01b -> 02a -> 02d -> 02g (eventos, chama 02f) -> 02i -> 02e -> 02b -> 02h
--
-- POR QUE SIMULAR: o DataCo mede só até o DESPACHO (doc 04). Não existe "por onde o pedido
-- passou" depois disso. A malha de hubs é a base física da jornada simulada no 02g.
-- Todos os hubs levam hub_simulado = true.
--
-- [Silver v3] A posição do pedido (etapa_atual, local_atual) NÃO é mais sorteada aqui:
-- ela vem do último evento logístico (02g) e é consolidada em silver.rastreio_pedidos no 02i.
-- Assim existe uma única fonte de posição (antes 02d e 02g sorteavam posições diferentes).
--
-- Saída: silver.dim_hubs (malha)
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
-- 2. CONFERÊNCIAS RÁPIDAS (testes PASS/FAIL completos em 02b)
-- -----------------------------------------------------------------------------
-- 2a. Hubs por tipo (esperado: 5 gateways, 164 CDs, 163 alfândegas, até 492 armazéns)
SELECT tipo_hub, COUNT(*) AS hubs FROM silver.dim_hubs GROUP BY tipo_hub ORDER BY tipo_hub;

-- COMMAND ----------

-- 2b. Causa provável dos itens com atraso no DESPACHO por modalidade
--     (esperado: Same Day e First Class só em "Promessa irreal")
SELECT causa_atraso_despacho, modo_envio, COUNT(*) AS itens
FROM silver.pedidos_rastreio
WHERE flag_atraso_despacho = 1
GROUP BY ALL ORDER BY causa_atraso_despacho, modo_envio;

-- -----------------------------------------------------------------------------
-- 3. (OPCIONAL) VERSÃO LLM DOS HUBS — para comparar com a derivada
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
