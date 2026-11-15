-- Databricks notebook source
-- =============================================================================
-- PROJETO INTEGRADOR ACADEMY - GRUPO 3 (TRANSLOG BRASIL)
-- ETAPA 2e: VIEW DE CONSUMO DA SILVER (Fullstack e IA leem DAQUI, não da tabela)
-- Responsável: Engenharia de Dados (Mateus)
-- Rodar depois de 02a e 02d. Ordem: 01 -> 01b -> 02a -> 02d -> 02e -> 02b
--
-- Nenhum dado é apagado: a tabela silver.pedidos_rastreio continua com tudo.
-- Ficam de fora da view só:
--   - Linhagem técnica: arquivo_origem, dt_ingestao_bronze, dt_processamento_silver
--   - PII: nome_cliente (portal busca por id_cliente)
--   - Colunas originais de atraso (risco_atraso_flag, status_entrega_original):
--     comprovadamente = (dias_envio_real > dias_envio_programado) em 100% das linhas,
--     então são reconstruíveis; fora da view para um agente Text-to-SQL não contar
--     atrasos de pedidos não pagos (98.976 em vez de 57.810).
--   - Redundantes: avaliado_prazo (= flag_atrasado IS NOT NULL) e
--     pedido_cancelado (= situacao_rastreio = 'Cancelado').
--   - [v2] data_envio: é a data da entrega (Shipping date = pedido + dias reais) e era
--     ambígua no nome. Na view, a data de entrega é data_entrega_real (só entregues).
-- Tradução pt-BR: de-para em silver.dim_traducao (importada de
-- data/de_para_padronizacao_pt.csv). As colunas mantêm o mesmo nome com valores em
-- português; sem tradução, mantém o original (COALESCE).
-- rota_logistica e resumo_rastreio_rag são remontados com os valores traduzidos.
--
-- [Silver v2] Novidades:
--   - Indicadores da PMO (vêm da tabela): no_prazo, faixa_atraso, data_entrega_real,
--     periodo_pico, receita_em_risco, causa_provavel
--   - rota_servico = mercado - região - modal (pedido da PMO), já traduzida
--   - Posição SIMULADA (silver.rastreio_pedidos, por id_pedido): tipo_rota,
--     modal_transporte, etapa_atual, etapa_atual_desc, id_hub_atual, local_atual,
--     dado_simulado; e motivo_ocorrencia (factual, não simulado)
--   - Matriz de consistência: pedido NÃO DESPACHADO (pendente, em análise, em espera) ou
--     CANCELADO não tem data prevista, dias reais, atraso, posição nem motivo (tudo NULL).
--     Em trânsito: dias_envio_real = dias em trânsito até a foto; sem data de entrega.
-- =============================================================================

CREATE OR REPLACE VIEW silver.vw_pedidos_rastreio
COMMENT 'Silver para consumo (Fullstack/IA): pt-BR, sem PII, sem linhagem técnica, regra de atraso oficial, posição simulada'
AS
WITH base AS (
    SELECT
        s.* EXCEPT (nome_cliente, risco_atraso_flag, status_entrega_original,
                    arquivo_origem, dt_ingestao_bronze, dt_processamento_silver,
                    avaliado_prazo, pedido_cancelado, data_envio,
                    data_prevista_entrega, dias_envio_real,
                    destino_pais, destino_estado, destino_cidade, destino_regiao,
                    origem_cliente_cidade, origem_cliente_estado, origem_cliente_pais,
                    rota_logistica, resumo_rastreio_rag),
        -- Só pedidos despachados (avaliados) têm previsão e dias reais
        CASE WHEN s.avaliado_prazo THEN s.data_prevista_entrega END AS data_prevista_entrega,
        CASE WHEN s.avaliado_prazo THEN s.dias_envio_real END       AS dias_envio_real,
        COALESCE(tp.valor_pt,  s.destino_pais)          AS destino_pais,
        COALESCE(te.valor_pt,  s.destino_estado)        AS destino_estado,
        COALESCE(tci.valor_pt, s.destino_cidade)        AS destino_cidade,
        COALESCE(tr.valor_pt,  s.destino_regiao)        AS destino_regiao,
        COALESCE(tcc.valor_pt, s.origem_cliente_cidade) AS origem_cliente_cidade,
        COALESCE(tce.valor_pt, s.origem_cliente_estado) AS origem_cliente_estado,
        COALESCE(tcp.valor_pt, s.origem_cliente_pais)   AS origem_cliente_pais,
        -- Mercado em pt-BR só para montar a rota_servico (a coluna mercado_logistico segue original)
        CASE s.mercado_logistico
            WHEN 'Europe'       THEN 'Europa'
            WHEN 'Pacific Asia' THEN 'Ásia-Pacífico'
            WHEN 'Africa'       THEN 'África'
            WHEN 'LATAM'        THEN 'América Latina'
            WHEN 'USCA'         THEN 'EUA e Canadá'
            ELSE s.mercado_logistico
        END                                             AS mercado_pt,
        r.* EXCEPT (id_pedido, dt_processamento_rastreio)
    FROM silver.pedidos_rastreio s
    LEFT JOIN silver.dim_traducao tp  ON tp.coluna  = 'destino_pais'          AND tp.valor_original  = s.destino_pais
    LEFT JOIN silver.dim_traducao te  ON te.coluna  = 'destino_estado'        AND te.valor_original  = s.destino_estado
                                     AND te.contexto = s.destino_pais
    LEFT JOIN silver.dim_traducao tci ON tci.coluna = 'destino_cidade'       AND tci.valor_original = s.destino_cidade
                                     AND tci.contexto = s.destino_pais
    LEFT JOIN silver.dim_traducao tr  ON tr.coluna  = 'destino_regiao'        AND tr.valor_original  = s.destino_regiao
    LEFT JOIN silver.dim_traducao tcc ON tcc.coluna = 'origem_cliente_cidade' AND tcc.valor_original = s.origem_cliente_cidade
    LEFT JOIN silver.dim_traducao tce ON tce.coluna = 'origem_cliente_estado' AND tce.valor_original = s.origem_cliente_estado
    LEFT JOIN silver.dim_traducao tcp ON tcp.coluna = 'origem_cliente_pais'   AND tcp.valor_original = s.origem_cliente_pais
    LEFT JOIN silver.rastreio_pedidos r ON r.id_pedido = s.id_pedido
)
SELECT
    * EXCEPT (mercado_pt),
    CONCAT(COALESCE(origem_cliente_estado, 'N/A'), ' -> ', COALESCE(destino_regiao, 'N/A'),
           ' (', COALESCE(destino_cidade, 'N/A'), ' - ', COALESCE(destino_estado, 'N/A'), ')') AS rota_logistica,
    -- Rota de serviço (PMO): mercado - região - modal
    CONCAT(COALESCE(mercado_pt, 'N/A'), ' - ', COALESCE(destino_regiao, 'N/A'), ' - ',
           COALESCE(modo_envio, 'N/A'))                                                    AS rota_servico,
    -- Texto para o agente de IA. Trechos que dependem de despacho só aparecem quando existem
    -- (CONCAT com NULL vira NULL e o COALESCE troca por '').
    CONCAT(
        'Pedido #', COALESCE(CAST(id_pedido AS STRING), 'N/A'),
        ' (Item #', COALESCE(CAST(id_item_pedido AS STRING), 'N/A'), ') | Cliente ID: ', COALESCE(CAST(id_cliente AS STRING), 'N/A'),
        ' | Produto: ', COALESCE(nome_produto, 'N/A'), ' (Categoria: ', COALESCE(categoria_produto, 'N/A'), ')',
        ' | Modalidade: ', COALESCE(modo_envio, 'N/A'), COALESCE(CONCAT(' (', modal_transporte, ')'), ''),
        ' | Rota: ', COALESCE(origem_cliente_estado, 'N/A'), ' -> ', COALESCE(destino_regiao, 'N/A'),
                   ' (', COALESCE(destino_cidade, 'N/A'), ' - ', COALESCE(destino_estado, 'N/A'), ')',
        ' | Situação: ', COALESCE(situacao_rastreio, 'N/A'), ' (Status Pedido: ', COALESCE(status_pedido, 'N/A'), ')',
        COALESCE(CONCAT(' | Local atual: ', local_atual, ' (etapa ', etapa_atual_desc, ')'), ''),
        ' | Prazo prometido: ', COALESCE(CAST(dias_envio_programado AS STRING), 'N/A'), ' dia(s)',
        COALESCE(CONCAT(' | Previsão de entrega: ', DATE_FORMAT(data_prevista_entrega, 'dd/MM/yyyy')), ''),
        COALESCE(CONCAT(' | Entregue em: ', DATE_FORMAT(data_entrega_real, 'dd/MM/yyyy')), ''),
        ' | Prazo do Envio: ', COALESCE(status_entrega_pt, 'N/A'),
        COALESCE(CONCAT(' | Causa provável: ', causa_provavel), ''),
        COALESCE(CONCAT(' | Detalhe: ', motivo_ocorrencia), '.')
    ) AS resumo_rastreio_rag,
    ROUND(SUM(lucro_item) OVER (PARTITION BY id_pedido), 2) AS lucro_total_pedido
FROM base;

-- COMMAND ----------

-- Conferência rápida: um texto RAG por situação (pendente/cancelado sem local, datas nem motivo)
SELECT situacao_rastreio, rota_servico, resumo_rastreio_rag
FROM silver.vw_pedidos_rastreio
QUALIFY ROW_NUMBER() OVER (PARTITION BY situacao_rastreio ORDER BY id_item_pedido) = 1;
