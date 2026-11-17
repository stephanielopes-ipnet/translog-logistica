-- Databricks notebook source
-- =============================================================================
-- PROJETO INTEGRADOR ACADEMY - GRUPO 3 (TRANSLOG)
-- ETAPA 2h: VALIDAÇÃO DA SIMULAÇÃO DE ENTREGA (painel PASS/FAIL, mesmo padrão do 02b)
-- Responsável: Engenharia de Dados (Mateus)
--
-- Valida a fatia PUBLICADA (silver.simulacao_publicada) de silver.eventos_logisticos e
-- silver.entregas_simuladas. A última célula falha o notebook (assert_true) se houver FAIL.
-- A distribuição 60/20/20 (entregue no prazo / com atraso / extraviado) só é exigida (±2 pp)
-- no escopo completo; no piloto é informativa.
-- Ordem: 02g -> 02i -> 02e -> 02b -> 02h
-- =============================================================================

CREATE OR REPLACE TEMP VIEW painel_eventos AS
WITH pub AS (
    SELECT cenario, versao, escopo FROM silver.simulacao_publicada
),
ev AS (
    SELECT e.* FROM silver.eventos_logisticos e JOIN pub USING (cenario, versao, escopo)
),
ent AS (
    SELECT s.* FROM silver.entregas_simuladas s JOIN pub USING (cenario, versao, escopo)
),
pedido AS (
    -- datas originais do pedido (1 linha por pedido)
    SELECT DISTINCT id_pedido, data_pedido, data_envio, dias_atraso_despacho FROM silver.pedidos_rastreio
),
ev_p AS (
    SELECT ev.*, p.data_pedido, p.data_envio,
           LAG(ts_evento) OVER (PARTITION BY id_pedido ORDER BY sequencia) AS ts_anterior
    FROM ev JOIN pedido p USING (id_pedido)
),
por_pedido AS (
    SELECT id_pedido, grupo_status, tipo_rota, modal_transporte,
           COUNT(*) AS eventos,
           MAX(sequencia) AS max_seq,
           SUM(CASE WHEN ultimo_evento THEN 1 ELSE 0 END) AS ultimos,
           SUM(CASE WHEN codigo_evento = 'PEDIDO_CRIADO' THEN 1 ELSE 0 END) AS criados,
           SUM(CASE WHEN codigo_evento = 'PEDIDO_DESPACHADO' THEN 1 ELSE 0 END) AS despachos,
           SUM(CASE WHEN codigo_evento = 'ENTREGUE' THEN 1 ELSE 0 END) AS entregues,
           SUM(CASE WHEN codigo_evento = 'EXTRAVIO_CONFIRMADO' THEN 1 ELSE 0 END) AS extravios,
           SUM(CASE WHEN codigo_evento = 'PARTIDA_VOO' THEN 1 ELSE 0 END) AS voos,
           SUM(CASE WHEN etapa = 3 THEN 1 ELSE 0 END) AS alfandega,
           MAX(CASE WHEN codigo_evento = 'ENTREGUE' THEN ts_evento END) AS ts_entregue,
           MAX_BY(codigo_evento, sequencia) AS ultimo_codigo
    FROM ev
    GROUP BY ALL
),
pe AS (
    SELECT p.*, e.resultado_transporte, e.situacao_entrega, e.data_entrega_realizada, e.data_despacho_real,
           e.transito_padrao_dias, e.transito_real_dias, e.dias_atraso_entrega, d.dias_atraso_despacho
    FROM por_pedido p LEFT JOIN ent e USING (id_pedido) LEFT JOIN pedido d USING (id_pedido)
),
distribuicao AS (
    SELECT COUNT(*) AS n,
           100.0 * AVG(CASE WHEN situacao_entrega = 'Entregue no prazo' THEN 1 ELSE 0 END)   AS pct_no_prazo,
           100.0 * AVG(CASE WHEN situacao_entrega = 'Entregue com atraso' THEN 1 ELSE 0 END) AS pct_atraso,
           100.0 * AVG(CASE WHEN situacao_entrega = 'Extraviado' THEN 1 ELSE 0 END)          AS pct_extravio
    FROM ent WHERE situacao_entrega IN ('Entregue no prazo', 'Entregue com atraso', 'Extraviado')
),
testes AS (
    SELECT 'fatia_publicada_unica' AS teste,
           CONCAT((SELECT COUNT(*) FROM pub), ' fatia(s) publicada(s)') AS detalhe,
           (SELECT COUNT(*) FROM pub) = 1 AS ok

    UNION ALL
    SELECT 'id_evento_unico', CONCAT(COUNT(*) - COUNT(DISTINCT id_evento), ' duplicados'),
           COUNT(*) = COUNT(DISTINCT id_evento)
    FROM ev

    UNION ALL
    SELECT 'um_pedido_criado_por_pedido', CONCAT(COUNT(*), ' pedidos fora'), COUNT(*) = 0
    FROM por_pedido WHERE criados <> 1

    UNION ALL
    SELECT 'sequencia_continua_e_um_ultimo_evento', CONCAT(COUNT(*), ' pedidos fora'), COUNT(*) = 0
    FROM por_pedido WHERE max_seq <> eventos OR ultimos <> 1

    UNION ALL
    SELECT 'ordem_temporal_nao_decrescente', CONCAT(COUNT(*), ' eventos fora'), COUNT(*) = 0
    FROM ev_p WHERE ts_anterior IS NOT NULL AND ts_evento < ts_anterior

    UNION ALL
    SELECT 'ts_evento_preenchido', CONCAT(COUNT(*), ' nulos'), COUNT(*) = 0
    FROM ev WHERE ts_evento IS NULL

    UNION ALL
    -- Eventos originais batem com a fonte
    SELECT 'eventos_dataco_batem_com_a_fonte', CONCAT(COUNT(*), ' eventos fora'), COUNT(*) = 0
    FROM ev_p
    WHERE (codigo_evento = 'PEDIDO_CRIADO' AND ts_evento <> data_pedido)
       OR (codigo_evento = 'PEDIDO_DESPACHADO' AND ts_evento <> data_envio)

    UNION ALL
    SELECT 'origem_evento_coerente_com_dado_simulado', CONCAT(COUNT(*), ' eventos fora'), COUNT(*) = 0
    FROM ev
    WHERE dado_simulado <> (origem_evento = 'simulado')
       OR (codigo_evento IN ('PEDIDO_CRIADO', 'PEDIDO_DESPACHADO') AND dado_simulado)
       OR (codigo_evento NOT IN ('PEDIDO_CRIADO', 'PEDIDO_DESPACHADO') AND NOT dado_simulado)

    UNION ALL
    -- (antigo T7 da auditoria) precisão declarada coerente; simulados sem segundos
    SELECT 'precisao_temporal_coerente', CONCAT(COUNT(*), ' eventos fora'), COUNT(*) = 0
    FROM ev
    WHERE NOT (precisao_temporal <=> CASE codigo_evento WHEN 'PEDIDO_CRIADO' THEN 'minuto'
                                                       WHEN 'PEDIDO_DESPACHADO' THEN 'dia'
                                                       ELSE 'simulado' END)
       OR (dado_simulado AND SECOND(ts_evento) <> 0)

    UNION ALL
    -- Nada simulado acontece antes do despacho real
    SELECT 'simulados_depois_do_despacho', CONCAT(COUNT(*), ' eventos fora'), COUNT(*) = 0
    FROM ev_p WHERE dado_simulado AND ts_evento < data_envio

    UNION ALL
    -- Matriz de status (base real) x resultado simulado
    SELECT 'aguardando_e_cancelado_so_pedido_criado', CONCAT(COUNT(*), ' pedidos fora'), COUNT(*) = 0
    FROM pe WHERE grupo_status IN ('aguardando', 'nao_pago', 'cancelado')
              AND (eventos <> 1 OR resultado_transporte IS NOT NULL)

    UNION ALL
    SELECT 'despachado_tem_um_evento_de_despacho', CONCAT(COUNT(*), ' pedidos fora'), COUNT(*) = 0
    FROM pe WHERE grupo_status = 'despachado' AND despachos <> 1

    UNION ALL
    SELECT 'entregue_termina_em_entregue_na_data_simulada', CONCAT(COUNT(*), ' pedidos fora'), COUNT(*) = 0
    FROM pe WHERE situacao_entrega LIKE 'Entregue%'
              AND (entregues <> 1 OR ultimo_codigo <> 'ENTREGUE' OR extravios > 0
                   OR CAST(ts_entregue AS DATE) <> data_entrega_realizada)

    UNION ALL
    SELECT 'extraviado_sem_entregue_e_termina_em_extravio', CONCAT(COUNT(*), ' pedidos fora'), COUNT(*) = 0
    FROM pe WHERE resultado_transporte = 'Extraviado'
              AND (entregues > 0 OR extravios <> 1 OR ultimo_codigo <> 'EXTRAVIO_CONFIRMADO'
                   OR data_entrega_realizada IS NOT NULL)

    UNION ALL
    -- Regra da entrega: no prazo só com despacho no prazo; recuperado = trânsito encurtado
    -- (>= 1 dia) e entrega na data prometida; não recuperado = trânsito padrão e atraso igual ao
    -- do despacho; entrega atrasada só existe com despacho atrasado
    SELECT 'regra_recuperacao_do_despacho', CONCAT(COUNT(*), ' pedidos fora'), COUNT(*) = 0
    FROM pe
    WHERE (resultado_transporte = 'No prazo'
           AND (dias_atraso_despacho > 0 OR transito_real_dias <> transito_padrao_dias))
       OR (resultado_transporte = 'Recuperou o atraso do despacho'
           AND (dias_atraso_despacho <= 0 OR transito_real_dias < 1
                OR transito_real_dias <> transito_padrao_dias - dias_atraso_despacho OR dias_atraso_entrega <> 0))
       OR (resultado_transporte = 'Não recuperou o atraso do despacho'
           AND (dias_atraso_despacho <= 0 OR transito_real_dias <> transito_padrao_dias
                OR dias_atraso_entrega <> dias_atraso_despacho))
       OR (situacao_entrega = 'Entregue com atraso' AND dias_atraso_despacho <= 0)

    UNION ALL
    -- (antigo T3) em trânsito: nunca entregue, extraviado ou com ocorrência
    SELECT 'em_transito_sem_desfecho', CONCAT(COUNT(*), ' pedidos fora'), COUNT(*) = 0
    FROM pe WHERE situacao_entrega = 'Em trânsito'
              AND (entregues > 0 OR extravios > 0 OR resultado_transporte <> 'Em trânsito')

    UNION ALL
    -- Foto em D: nenhum evento depois da data de referência da base
    SELECT 'nenhum_evento_depois_da_data_de_referencia', CONCAT(COUNT(*), ' eventos fora'), COUNT(*) = 0
    FROM ev JOIN (SELECT MAX(data_referencia_base) AS d FROM silver.pedidos_rastreio) r
    WHERE ev.ts_evento > r.d

    UNION ALL
    -- Em trânsito só existe perto de D (despacho até ~14 dias antes: maior trânsito + extravio)
    SELECT 'em_transito_so_perto_da_data_de_referencia',
           CONCAT(COUNT(*), ' pedidos fora'), COUNT(*) = 0
    FROM ent JOIN (SELECT CAST(MAX(data_referencia_base) AS DATE) AS d FROM silver.pedidos_rastreio) r
    WHERE ent.situacao_entrega = 'Em trânsito' AND ent.data_despacho_real < DATE_SUB(r.d, 14)

    UNION ALL
    SELECT 'entrega_simulada_depois_do_despacho', CONCAT(COUNT(*), ' pedidos fora'), COUNT(*) = 0
    FROM ent WHERE data_entrega_realizada < data_despacho_real

    UNION ALL
    -- Rota
    SELECT 'domestico_nunca_passa_na_alfandega', CONCAT(COUNT(*), ' pedidos fora'), COUNT(*) = 0
    FROM por_pedido WHERE tipo_rota = 'Doméstica' AND alfandega > 0

    UNION ALL
    SELECT 'rodoviario_nunca_voa', CONCAT(COUNT(*), ' pedidos fora'), COUNT(*) = 0
    FROM por_pedido WHERE modal_transporte = 'Rodoviário' AND voos > 0

    UNION ALL
    SELECT 'aereo_entregue_tem_voo', CONCAT(COUNT(*), ' pedidos fora'), COUNT(*) = 0
    FROM pe WHERE modal_transporte LIKE 'Aéreo%' AND entregues = 1 AND voos <> 1

    UNION ALL
    SELECT 'internacional_entregue_passa_na_alfandega', CONCAT(COUNT(*), ' pedidos fora'), COUNT(*) = 0
    FROM pe WHERE tipo_rota = 'Internacional' AND entregues = 1 AND alfandega < 2

    UNION ALL
    SELECT 'id_hub_existe_em_dim_hubs', CONCAT(COUNT(*), ' eventos fora'), COUNT(*) = 0
    FROM ev e LEFT ANTI JOIN silver.dim_hubs h ON h.id_hub = e.id_hub
    WHERE e.id_hub IS NOT NULL

    UNION ALL
    SELECT 'eventos_de_hub_tem_hub', CONCAT(COUNT(*), ' eventos fora'), COUNT(*) = 0
    FROM ev WHERE codigo_evento NOT IN ('PEDIDO_CRIADO', 'PEDIDO_DESPACHADO', 'ENTREGUE') AND id_hub IS NULL

    UNION ALL
    -- Entregas e eventos cobrem os mesmos pedidos
    SELECT 'entregas_e_eventos_mesmos_pedidos',
           CONCAT((SELECT COUNT(*) FROM ent), ' entregas x ', COUNT(*), ' pedidos com eventos'),
           (SELECT COUNT(*) FROM ent) = COUNT(*)
             AND (SELECT COUNT(*) FROM ent) = (SELECT COUNT(DISTINCT id_pedido) FROM ent)
    FROM por_pedido

    UNION ALL
    -- Pedido em quarentena não aparece nos eventos da mesma fatia
    SELECT 'quarentena_e_eventos_disjuntos', CONCAT(COUNT(*), ' pedidos nos dois'), COUNT(*) = 0
    FROM silver.eventos_logisticos_quarentena q
    JOIN pub USING (cenario, versao, escopo)
    JOIN (SELECT DISTINCT id_pedido FROM ev) e USING (id_pedido)

    UNION ALL
    -- A tabela de consumo é uma foto: se o 02g rodou e o 02i não, as contagens divergem
    SELECT 'consumo_eventos_mesmas_linhas_da_fatia',
           CONCAT((SELECT COUNT(*) FROM silver.consumo_eventos_logisticos), ' no consumo x ', COUNT(*), ' na fatia'),
           (SELECT COUNT(*) FROM silver.consumo_eventos_logisticos) = COUNT(*)
    FROM ev

    UNION ALL
    SELECT 'consumo_pedidos_um_registro_por_pedido',
           CONCAT(COUNT(*), ' linhas x ', COUNT(DISTINCT id_pedido), ' pedidos'),
           COUNT(*) = COUNT(DISTINCT id_pedido)
    FROM silver.consumo_pedidos

    UNION ALL
    -- Padrão do instrutor: 60/20/20 entre os pedidos concluídos (±2 pp no escopo completo)
    SELECT 'distribuicao_60_20_20',
           CONCAT(n, ' concluídos: ', ROUND(pct_no_prazo, 1), '% no prazo / ', ROUND(pct_atraso, 1),
                  '% atraso / ', ROUND(pct_extravio, 1), '% extravio',
                  CASE WHEN (SELECT escopo FROM pub) <> 'completo' THEN ' (piloto: informativo)' ELSE '' END),
           (SELECT escopo FROM pub) <> 'completo'
             OR (ABS(pct_no_prazo - 60) <= 2 AND ABS(pct_atraso - 20) <= 2 AND ABS(pct_extravio - 20) <= 2)
    FROM distribuicao
)
SELECT teste, detalhe, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status
FROM testes;

-- COMMAND ----------

-- 1. Painel
SELECT * FROM painel_eventos ORDER BY status, teste;

-- COMMAND ----------

-- 2. Resumo da fatia publicada: situação real x resultado simulado
SELECT e.versao, e.escopo, e.grupo_status, e.resultado_transporte, e.situacao_entrega,
       COUNT(*) AS pedidos,
       ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (PARTITION BY e.grupo_status), 1) AS pct_no_grupo
FROM silver.entregas_simuladas e
JOIN silver.simulacao_publicada USING (cenario, versao, escopo)
GROUP BY ALL
ORDER BY ALL;

-- COMMAND ----------

-- 3. Exemplos legíveis: um pedido por resultado do transporte
SELECT e.id_pedido, r.resultado_transporte, e.sequencia, e.codigo_evento, e.etapa_desc, e.ts_evento,
       e.local_evento, e.descricao_evento
FROM silver.consumo_eventos_logisticos e
JOIN (SELECT resultado_transporte, MIN(id_pedido) AS id_pedido
      FROM silver.rastreio_pedidos WHERE resultado_transporte IS NOT NULL GROUP BY 1) r USING (id_pedido)
ORDER BY r.resultado_transporte, e.sequencia;

-- COMMAND ----------

-- 4. Falha o notebook se houver algum FAIL
SELECT assert_true(COUNT(*) = 0, 'Validação de eventos com FAIL: veja o painel') AS ok
FROM painel_eventos
WHERE status = 'FAIL';
