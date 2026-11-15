-- Databricks notebook source
-- =============================================================================
-- PROJETO INTEGRADOR ACADEMY - GRUPO 3 (TRANSLOG)
-- ETAPA 1b: DE-PARA DE TRADUÇÃO pt-BR (silver.dim_traducao)
-- Responsável: Engenharia de Dados (Mateus)
--
-- Origem: de_para.csv (coluna, contexto, valor_original, valor_pt), enviado ao volume
--   /Volumes/workspace/default/landing_translog/
-- Colunas traduzidas: destino_pais, destino_estado, destino_cidade, destino_regiao,
--   origem_cliente_cidade, origem_cliente_estado, origem_cliente_pais.
-- contexto = país ORIGINAL do DataCo (usado em destino_estado e destino_cidade, porque o
--   mesmo nome existe em países diferentes). valor_pt vazio = mantém o original.
-- Ordem de execução: 01 -> 01b -> 02a -> 02d -> 02e -> 02b -> 02c
-- =============================================================================

CREATE OR REPLACE TABLE silver.dim_traducao
COMMENT 'De-para de tradução pt-BR (fonte: de_para.csv no volume landing_translog)'
AS
SELECT
    TRIM(coluna)                                         AS coluna,
    NULLIF(TRIM(contexto), '')                           AS contexto,
    valor_original,
    COALESCE(NULLIF(TRIM(valor_pt), ''), valor_original) AS valor_pt
FROM read_files(
    '/Volumes/workspace/default/landing_translog/de_para.csv',
    format => 'csv',
    header => true,
    inferSchema => false,
    encoding => 'UTF-8'
);

-- COMMAND ----------

-- Conferência: linhas por coluna (esperado: destino_cidade 3665, destino_estado 1117,
-- origem_cliente_cidade 562, destino_pais 164, origem_cliente_estado 44,
-- destino_regiao 23, origem_cliente_pais 2; total 5577)
SELECT coluna, COUNT(*) AS linhas
FROM silver.dim_traducao
GROUP BY coluna
ORDER BY linhas DESC;
