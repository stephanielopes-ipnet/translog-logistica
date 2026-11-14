-- =============================================================================
-- PROJETO INTEGRADOR ACADEMY - GRUPO 3 (TRANSLOG BRASIL)
-- ETAPA 1: CAMADA BRONZE (INGESTÃO DE DADOS BRUTOS)
-- Responsável: Engenharia de Dados (Mateus)
-- =============================================================================

-- 1. Criação dos Schemas (equivalentes aos Datasets do BigQuery)
CREATE SCHEMA IF NOT EXISTS bronze COMMENT 'Camada Bronze: Dados brutos ingeridos da origem (DataCo Supply Chain)';
CREATE SCHEMA IF NOT EXISTS silver COMMENT 'Camada Silver: Dados limpos, tipados e enriquecidos com janelas de atraso e rotas (Consumo: IA e FullStack)';
CREATE SCHEMA IF NOT EXISTS gold   COMMENT 'Camada Gold: Tabelas agregadas de KPIs logísticos (Consumo: BI e Gestão)';

-- =============================================================================
-- 2. Ingestão do CSV Bruto para a Tabela Delta Bronze
-- Nota: Caso você tenha subido o CSV via Volume (/Volumes/workspace/default/landing_translog/DataCoSupplyChainDataset.csv),
-- execute o bloco 2A. Caso tenha subido via interface "Create Table" em default.dataco_raw_upload, execute o bloco 2B.
-- =============================================================================

-- [OPÇÃO 2A] Lendo diretamente do arquivo CSV no Databricks Volume via read_files:
-- columnMapping 'name' é obrigatório: o CSV tem colunas com espaço (ex.: "Order Id"), que o Delta recusa sem ele.
CREATE OR REPLACE TABLE bronze.dataco_raw
TBLPROPERTIES ('delta.columnMapping.mode' = 'name')
AS
SELECT
    *,
    current_timestamp() AS dt_ingestao_bronze,
    'DataCoSupplyChainDataset.csv' AS arquivo_origem
FROM read_files(
    '/Volumes/workspace/default/landing_translog/DataCoSupplyChainDataset.csv',
    format => 'csv',
    header => true,
    inferSchema => true,
    encoding => 'ISO-8859-1'
);

-- [OPÇÃO 2B] (Alternativa) Caso você tenha usado "Create or modify table" pela interface do Databricks:
-- CREATE OR REPLACE TABLE bronze.dataco_raw AS
-- SELECT
--     *,
--     current_timestamp() AS dt_ingestao_bronze,
--     'DataCoSupplyChainDataset.csv' AS arquivo_origem
-- FROM default.dataco_raw_upload;

-- 3. Validação rápida da Ingestão Bronze
SELECT
    COUNT(*) AS total_registros_brutos,
    MIN(dt_ingestao_bronze) AS data_hora_carga
FROM bronze.dataco_raw;
