-- Databricks notebook source
-- =============================================================================
-- PROJETO INTEGRADOR ACADEMY - GRUPO 3 (TRANSLOG)
-- ETAPA 2i: CONSOLIDAÇÃO DO RASTREIO (única fonte de posição e de entrega)
-- Responsável: Engenharia de Dados (Mateus)
--
-- Consome SÓ a fatia publicada pelo 02g (silver.simulacao_publicada: versão + escopo).
-- Saídas:
--   silver.rastreio_pedidos        TABELA, 1 linha por pedido da Silver: posição = ÚLTIMO EVENTO,
--                                  entrega e motivo. Guarda a marca dado_simulado (governança/Gold).
--   silver.consumo_eventos_logisticos  TABELA de consumo (portal): linha do tempo do pedido
--   (vw_rastreio_eventos removida: a situação atual por pedido está em silver.consumo_pedidos, 02e)
-- As tabelas de consumo (consumo_*) não expõem marcas de simulação (dado_simulado, fonte, versão): o cliente não pode
-- receber "dado simulado" numa resposta. A rastreabilidade fica nas tabelas.
-- Pedido fora da simulação (ex.: escopo piloto) fica sem posição e entrega (dado_simulado = false).
-- Ordem: 02a -> 02d -> 02g -> 02i -> 02e -> 02b -> 02h
-- =============================================================================

CREATE OR REPLACE TABLE silver.rastreio_pedidos
COMMENT 'Silver v3: posição (último evento) e entrega por pedido + motivo. Grão = id_pedido. dado_simulado marca o que veio da simulação'
AS
WITH pub AS (
    SELECT cenario, versao, escopo FROM silver.simulacao_publicada
),
pedido AS (
    -- 1 linha por pedido (itens do mesmo pedido são iguais nesses campos)
    SELECT id_pedido, avaliado_prazo, situacao_rastreio, data_referencia_base, modo_envio,
           dias_envio_real, dias_envio_programado,
           dias_atraso_despacho, flag_atraso_despacho, causa_atraso_despacho
    FROM silver.pedidos_rastreio
    QUALIFY ROW_NUMBER() OVER (PARTITION BY id_pedido ORDER BY id_item_pedido) = 1
),
taxa_modalidade AS (
    -- % de pedidos despachados no prazo de despacho por modalidade (evidência de "Promessa irreal")
    SELECT modo_envio, ROUND(100.0 * AVG(1 - flag_atraso_despacho), 1) AS pct_no_prazo_modalidade
    FROM pedido WHERE flag_atraso_despacho IS NOT NULL
    GROUP BY modo_envio
),
ent AS (
    SELECT s.* FROM silver.entregas_simuladas s JOIN pub USING (cenario, versao, escopo)
),
ult AS (
    SELECT e.* FROM silver.eventos_logisticos e JOIN pub USING (cenario, versao, escopo)
    WHERE e.ultimo_evento
)
SELECT
    p.id_pedido,
    -- Situação final do pedido em D (uma coluna só para portal e IA):
    -- Cancelado / Aguardando pagamento / Não pago (expirado) / Em trânsito /
    -- Entregue no prazo / Entregue com atraso / Extraviado
    -- (pedido despachado fora da simulação, só no escopo piloto: 'Despachado')
    CASE WHEN p.situacao_rastreio = 'Despachado' THEN COALESCE(ent.situacao_entrega, 'Despachado')
         ELSE p.situacao_rastreio END                                AS situacao_pedido,
    CAST(p.data_referencia_base AS DATE)                              AS data_referencia_base,
    ent.modal_transporte,
    ent.transito_padrao_dias,
    ent.transito_real_dias,
    ent.dias_recuperados_transporte,
    ent.resultado_transporte,
    ent.situacao_entrega,
    ent.data_entrega_prevista,
    ent.data_entrega_realizada,
    ent.dias_atraso_entrega,
    ent.flag_atraso_entrega,
    ent.causa_atraso_entrega,
    ent.etapa_extravio,

    -- Posição = último evento (só pedidos despachados; não despachado/cancelado = NULL)
    CASE WHEN p.avaliado_prazo THEN u.etapa END                       AS etapa_atual,
    CASE WHEN p.avaliado_prazo THEN
        CASE u.etapa WHEN 1 THEN '1 - Coleta' WHEN 2 THEN '2 - Voo' WHEN 3 THEN '3 - Alfândega'
                     WHEN 4 THEN '4 - Transferência' WHEN 5 THEN '5 - Última milha' END
    END                                                               AS etapa_atual_desc,
    CASE WHEN p.avaliado_prazo THEN u.id_hub END                      AS id_hub_atual,
    CASE WHEN p.avaliado_prazo THEN u.local_evento END                AS local_atual,
    u.codigo_evento                                                   AS ultimo_codigo_evento,
    u.descricao_evento                                                AS ultimo_evento_desc,
    u.ts_evento                                                       AS ts_ultimo_evento,

    -- Motivo em linguagem de operação (vai para o cliente via IA): despacho + transporte
    CASE WHEN p.avaliado_prazo THEN CONCAT(
        'Despacho em ', CAST(p.dias_envio_real AS STRING), ' dia(s)',
        CASE WHEN p.flag_atraso_despacho = 0
             THEN CONCAT(', dentro do prazo de despacho de ', CAST(p.dias_envio_programado AS STRING), ' dia(s).')
             ELSE CONCAT(', ', CAST(p.dias_atraso_despacho AS STRING), ' dia(s) além do prazo de despacho de ',
                         CAST(p.dias_envio_programado AS STRING), ' dia(s).')
        END,
        CASE p.causa_atraso_despacho
            WHEN 'Promessa irreal' THEN CONCAT(' O prazo de despacho da modalidade ',
                                               COALESCE(tme.valor_pt, p.modo_envio),
                                               ' é cumprido em apenas ',
                                               COALESCE(CAST(t.pct_no_prazo_modalidade AS STRING), 'N/A'),
                                               '% dos pedidos.')
            WHEN 'Atraso operacional' THEN ' Atraso operacional na expedição.'
            ELSE ''
        END,
        CASE ent.resultado_transporte
            WHEN 'No prazo' THEN ' Transporte dentro do prazo padrão da rota.'
            WHEN 'Recuperou o atraso do despacho' THEN CONCAT(' O transporte recuperou o atraso (',
                                                    CAST(ent.dias_recuperados_transporte AS STRING),
                                                    ' dia(s) mais rápido que o padrão) e a entrega ocorreu no prazo.')
            WHEN 'Não recuperou o atraso do despacho' THEN CONCAT(' O transporte seguiu o prazo padrão da rota e a entrega ficou ',
                                                    CAST(ent.dias_atraso_entrega AS STRING), ' dia(s) atrasada.')
            WHEN 'Extraviado' THEN CONCAT(' Volume extraviado na etapa ', ent.etapa_extravio, ': ',
                                          ent.motivo_extravio, '.')
            WHEN 'Em trânsito' THEN CASE WHEN ent.flag_atraso_entrega = 1
                                         THEN CONCAT(' Pedido em transporte; o prazo de entrega foi ultrapassado em ',
                                                     CAST(ent.dias_atraso_entrega AS STRING), ' dia(s).')
                                         ELSE ' Pedido em transporte, dentro do prazo de entrega.' END
            ELSE ''
        END)
    END                                                               AS motivo_ocorrencia,

    pub.versao                                                        AS versao_simulacao,
    pub.escopo                                                        AS escopo_simulacao,
    COALESCE(p.avaliado_prazo AND ent.id_pedido IS NOT NULL, FALSE)   AS dado_simulado,
    current_timestamp()                                               AS dt_processamento_rastreio
FROM pedido p
CROSS JOIN pub
LEFT JOIN ent ON ent.id_pedido = p.id_pedido
LEFT JOIN ult u ON u.id_pedido = p.id_pedido
LEFT JOIN taxa_modalidade t ON t.modo_envio = p.modo_envio
-- rótulo da modalidade só no texto que vai ao cliente; a tabela guarda o original
LEFT JOIN silver.dim_traducao tme ON tme.coluna = 'modo_envio' AND tme.valor_original = p.modo_envio;

-- COMMAND ----------

CREATE OR REPLACE TABLE silver.consumo_eventos_logisticos
COMMENT 'Linha do tempo logística de cada pedido (pt-BR, sem PII), do pedido até a entrega ou extravio'
AS
SELECT
    e.id_pedido,
    c.id_cliente,
    e.sequencia,
    e.codigo_evento,
    e.descricao_evento,
    e.etapa,
    CASE e.etapa
        WHEN 0 THEN '0 - Pedido'
        WHEN 1 THEN '1 - Coleta'
        WHEN 2 THEN '2 - Voo'
        WHEN 3 THEN '3 - Alfândega'
        WHEN 4 THEN '4 - Transferência'
        WHEN 5 THEN '5 - Última milha'
    END                                                                      AS etapa_desc,
    e.ts_evento,
    e.id_hub,
    e.local_evento,
    e.ultimo_evento,
    e.tipo_rota,
    e.modal_transporte,
    COALESCE(tme.valor_pt, e.modo_envio)                                     AS modo_envio,
    e.destino_regiao
FROM silver.eventos_logisticos e
JOIN silver.simulacao_publicada p USING (cenario, versao, escopo)
JOIN (SELECT DISTINCT id_pedido, id_cliente FROM silver.pedidos_rastreio) c ON c.id_pedido = e.id_pedido
LEFT JOIN silver.dim_traducao tme ON tme.coluna = 'modo_envio' AND tme.valor_original = e.modo_envio;

-- COMMAND ----------

-- Views antigas, substituídas pelas tabelas consumo_* (remoção só da definição: nenhum dado é apagado)
DROP VIEW IF EXISTS silver.vw_rastreio_eventos;
DROP VIEW IF EXISTS silver.vw_eventos_logisticos;

-- COMMAND ----------

-- Conferência: situação do pedido x entrega x etapa atual (fatia publicada)
SELECT s.situacao_rastreio, r.situacao_pedido, r.resultado_transporte, r.etapa_atual_desc, COUNT(*) AS pedidos
FROM silver.rastreio_pedidos r
JOIN (SELECT id_pedido, situacao_rastreio FROM silver.pedidos_rastreio
      QUALIFY ROW_NUMBER() OVER (PARTITION BY id_pedido ORDER BY id_item_pedido) = 1) s USING (id_pedido)
WHERE r.ultimo_codigo_evento IS NOT NULL
GROUP BY ALL ORDER BY ALL;
