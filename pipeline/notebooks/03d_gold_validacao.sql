-- Databricks notebook source
-- =============================================================================
-- PROJETO INTEGRADOR ACADEMY - GRUPO 3 (TRANSLOG)
-- ETAPA 3d: VALIDAÇÃO DA GOLD OBT (painel PASS/FAIL, mesmo padrão do 02h)
-- Responsável: Engenharia de Dados (Mateus)
--
-- Valida gold.obt_pedidos_logistica, gold.obt_itens_risco e gold.obt_eventos_etapas:
--   grão único e escopo (só despachados), KPIs contra um gabarito recalculado direto da Silver
--   (CTEs gab_*, mesma lógica independente da antiga Gold v3) e contra os números de referência, PII, receita em risco, extravio por etapa e
--   soma por item = soma por pedido.
-- A última célula falha o notebook (assert_true) se houver FAIL.
-- Ordem: 03c -> 03d
-- =============================================================================

CREATE OR REPLACE TEMP VIEW painel_gold_obt AS
WITH o AS (SELECT * FROM gold.obt_pedidos_logistica),
it AS (SELECT * FROM gold.obt_itens_risco),
et AS (SELECT * FROM gold.obt_eventos_etapas),
-- Gabarito independente: KPIs calculados direto da Silver, sem passar pela OBT
gab_item AS (
    SELECT id_pedido, flag_atraso_despacho, dias_atraso_despacho, avaliado_prazo,
           ROW_NUMBER() OVER (PARTITION BY id_pedido ORDER BY id_item_pedido) AS rn
    FROM silver.pedidos_rastreio
),
gab_receita AS (
    SELECT id_pedido, SUM(valor_bruto_venda) AS receita_pedido FROM silver.pedidos_rastreio GROUP BY id_pedido
),
gab_base AS (
    SELECT i.id_pedido, i.flag_atraso_despacho, i.dias_atraso_despacho, i.avaliado_prazo AS despachado,
           r.situacao_entrega, r.resultado_transporte, rc.receita_pedido,
           r.dado_simulado AND r.situacao_entrega IN ('Entregue no prazo', 'Entregue com atraso', 'Extraviado')
               AS tem_desfecho_entrega,
           r.situacao_entrega IN ('Entregue com atraso', 'Extraviado') AS entrega_com_problema
    FROM gab_item i
    JOIN gab_receita rc USING (id_pedido)
    LEFT JOIN silver.rastreio_pedidos r USING (id_pedido)
    WHERE i.rn = 1
),
k AS (
    SELECT
        SUM(CASE WHEN despachado THEN 1 ELSE 0 END)                                          AS pedidos_despachados,
        ROUND(100.0 * AVG(flag_atraso_despacho), 1)                                          AS pct_despacho_atrasado,
        ROUND(AVG(CASE WHEN flag_atraso_despacho = 1 THEN dias_atraso_despacho END), 2)      AS atraso_medio_despacho_dias,
        SUM(CASE WHEN tem_desfecho_entrega THEN 1 ELSE 0 END)                                AS pedidos_com_desfecho_entrega,
        ROUND(100.0 * AVG(CASE WHEN tem_desfecho_entrega THEN
              CASE WHEN situacao_entrega = 'Entregue no prazo' THEN 1 ELSE 0 END END), 1)      AS pct_entregue_no_prazo,
        ROUND(100.0 * AVG(CASE WHEN tem_desfecho_entrega THEN
              CASE WHEN situacao_entrega = 'Entregue com atraso' THEN 1 ELSE 0 END END), 1)    AS pct_entregue_com_atraso,
        ROUND(100.0 * AVG(CASE WHEN tem_desfecho_entrega THEN
              CASE WHEN situacao_entrega = 'Extraviado' THEN 1 ELSE 0 END END), 1)             AS pct_extraviado,
        ROUND(100.0 * SUM(CASE WHEN resultado_transporte = 'Recuperou o atraso do despacho' THEN 1 ELSE 0 END)
              / NULLIF(SUM(CASE WHEN flag_atraso_despacho = 1 AND situacao_entrega LIKE 'Entregue%' THEN 1 ELSE 0 END), 0), 1)
                                                                                             AS pct_despacho_atrasado_recuperado_no_transporte,
        ROUND(SUM(CASE WHEN despachado THEN receita_pedido ELSE 0 END), 2)                   AS receita_despachada,
        ROUND(SUM(CASE WHEN entrega_com_problema THEN receita_pedido ELSE 0 END), 2)         AS receita_em_risco
    FROM gab_base
),
kp AS (
    -- KPIs recalculados a partir da OBT de pedidos
    SELECT
        COUNT(*)                                                                              AS despachados,
        ROUND(100.0 * SUM(fl_despacho_atrasado) / COUNT(*), 1)                                AS pct_despacho_atrasado,
        ROUND(AVG(dias_atraso_despacho), 2)                                                   AS atraso_medio_despacho,
        SUM(CASE WHEN causa_atraso_despacho = 'Promessa irreal' THEN 1 ELSE 0 END)            AS causa_promessa,
        SUM(CASE WHEN causa_atraso_despacho = 'Atraso operacional' THEN 1 ELSE 0 END)         AS causa_operacional,
        SUM(fl_com_desfecho)                                                                  AS com_desfecho,
        SUM(fl_em_transito)                                                                   AS em_transito,
        ROUND(100.0 * SUM(fl_entregue_no_prazo) / SUM(fl_com_desfecho), 1)                    AS pct_no_prazo,
        ROUND(100.0 * SUM(fl_entregue_atrasado) / SUM(fl_com_desfecho), 1)                    AS pct_atrasado,
        ROUND(100.0 * SUM(fl_extraviado) / SUM(fl_com_desfecho), 1)                           AS pct_extraviado,
        ROUND(AVG(dias_atraso_entrega), 2)                                                    AS atraso_medio_entrega,
        ROUND(100.0 * SUM(fl_recuperou_atraso) / SUM(fl_despacho_atrasado_entregue), 1)       AS pct_recuperado,
        ROUND(100.0 * SUM(fl_despacho_atrasado_prazo_sugerido) / COUNT(*), 1)                 AS pct_s1,
        SUM(fl_despacho_acima_4_dias)                                                         AS acima_4_dias,
        SUM(receita_bruta_pedido)                                                             AS rb,
        SUM(receita_bruta_em_risco)                                                           AS rb_risco,
        SUM(receita_liquida_pedido)                                                           AS rl,
        SUM(receita_liquida_em_risco)                                                         AS rl_risco,
        SUM(lucro_pedido)                                                                     AS lu,
        SUM(lucro_em_risco)                                                                   AS lu_risco,
        SUM(lucro_extraviado)                                                                 AS lu_extr
    FROM o
),
somas_item AS (
    SELECT SUM(receita_bruta_item) AS rb, SUM(receita_liquida_item) AS rl, SUM(lucro_item) AS lu,
           SUM(receita_bruta_em_risco) AS rb_risco, SUM(receita_liquida_em_risco) AS rl_risco,
           SUM(lucro_em_risco) AS lu_risco, SUM(receita_bruta_extraviada) AS rb_extr,
           SUM(receita_liquida_extraviada) AS rl_extr, SUM(lucro_extraviado) AS lu_extr
    FROM it
),
somas_pedido AS (
    SELECT SUM(receita_bruta_pedido) AS rb, SUM(receita_liquida_pedido) AS rl, SUM(lucro_pedido) AS lu,
           SUM(receita_bruta_em_risco) AS rb_risco, SUM(receita_liquida_em_risco) AS rl_risco,
           SUM(lucro_em_risco) AS lu_risco, SUM(receita_bruta_extraviada) AS rb_extr,
           SUM(receita_liquida_extraviada) AS rl_extr, SUM(lucro_extraviado) AS lu_extr
    FROM o
),
item_x_pedido AS (
    -- diferença por pedido entre a soma dos itens e o valor do pedido (qualquer métrica)
    SELECT COUNT(*) AS pedidos_divergentes
    FROM (SELECT id_pedido, SUM(receita_bruta_item) rb, SUM(receita_liquida_item) rl, SUM(lucro_item) lu,
                 SUM(receita_bruta_em_risco) rbr, SUM(lucro_em_risco) lur
          FROM it GROUP BY id_pedido) s
    FULL JOIN o USING (id_pedido)
    WHERE o.id_pedido IS NULL OR s.id_pedido IS NULL
       OR ABS(s.rb - o.receita_bruta_pedido) > 0.005 OR ABS(s.rl - o.receita_liquida_pedido) > 0.005
       OR ABS(s.lu - o.lucro_pedido) > 0.005 OR ABS(s.rbr - o.receita_bruta_em_risco) > 0.005
       OR ABS(s.lur - o.lucro_em_risco) > 0.005
),
extravio_pedido AS (
    SELECT o.id_pedido, o.fl_extraviado, o.etapa_extravio_num,
           COALESCE(SUM(et.fl_extravio_nesta_etapa), 0)            AS etapas_com_extravio,
           MAX(CASE WHEN et.fl_extravio_nesta_etapa = 1 THEN et.etapa_num END) AS etapa_ev
    FROM o LEFT JOIN et USING (id_pedido)
    GROUP BY ALL
),
extravio_etapa_cmp AS (
    -- OBT de etapas x silver.rastreio_pedidos (etapa do extravio por pedido)
    SELECT COUNT(*) AS etapas_divergentes
    FROM (SELECT etapa_desc, SUM(fl_extravio_nesta_etapa) n FROM et GROUP BY 1 HAVING SUM(fl_extravio_nesta_etapa) > 0) a
    FULL JOIN (SELECT etapa_extravio AS etapa_desc, COUNT(*) n FROM silver.rastreio_pedidos
               WHERE situacao_entrega = 'Extraviado' GROUP BY 1) b
      USING (etapa_desc)
    WHERE a.n IS NULL OR b.n IS NULL OR a.n <> b.n
),
pii AS (
    SELECT COUNT(*) AS colunas_pii, COALESCE(CONCAT_WS(', ', COLLECT_LIST(CONCAT(table_name, '.', column_name))), '') AS lista
    FROM system.information_schema.columns
    WHERE table_catalog = current_catalog() AND table_schema = 'gold'
      AND table_name IN ('obt_pedidos_logistica', 'obt_itens_risco', 'obt_eventos_etapas', 'vw_cenarios_prazo')
      AND (column_name LIKE 'nome_cliente%' OR column_name LIKE '%email%' OR column_name LIKE '%endereco%'
           OR column_name LIKE '%street%' OR column_name LIKE '%zipcode%' OR column_name LIKE '%cep%'
           OR column_name LIKE 'origem_cliente%' OR column_name LIKE '%senha%' OR column_name LIKE '%password%'
           OR column_name LIKE 'resumo%' OR column_name LIKE 'status_entrega_original%')
),
cv AS (SELECT * FROM gold.vw_cenarios_prazo),
pc AS (SELECT * FROM gold.param_cenario_prazo WHERE ativo),
cen_resumo AS (
    SELECT cenario, MIN(ordem_cenario) AS ordem, COUNT(*) AS linhas, COUNT(DISTINCT id_pedido) AS pedidos,
           ROUND(100.0 * AVG(fl_despacho_atrasado), 1)                       AS pct_despacho_atrasado,
           SUM(fl_entregue_atrasado)                                         AS entregas_atrasadas,
           SUM(fl_extraviado)                                                AS extraviados,
           SUM(fl_em_transito)                                               AS em_transito,
           SUM(receita_bruta_em_risco)                                       AS receita_bruta_em_risco
    FROM cv GROUP BY cenario
),
seed_intacto AS (
    -- o seed da "Promessa ajustada" continua como o 03c criou? (se alguém editou, a referência vira informativa)
    SELECT COUNT(*) = 4 AND SUM(CASE WHEN (classe_servico = 'First Class' AND prazo_despacho_dias = 2)
                        OR (classe_servico = 'Same Day' AND prazo_despacho_dias = 1)
                        OR (classe_servico = 'Second Class' AND prazo_despacho_dias = 4)
                        OR (classe_servico = 'Standard Class' AND prazo_despacho_dias = 4) THEN 1 ELSE 0 END) = 4 AS ok
    FROM pc WHERE cenario = 'Promessa ajustada'
),
testes AS (
    -- ---------------- Grão e escopo ----------------
    SELECT 'obt_pedidos_grao_unico' AS teste,
           CONCAT(COUNT(*), ' linhas x ', COUNT(DISTINCT id_pedido), ' pedidos') AS detalhe,
           COUNT(*) = COUNT(DISTINCT id_pedido) AS ok
    FROM o
    UNION ALL
    SELECT 'obt_pedidos_36866_despachados', CONCAT(COUNT(*), ' linhas (esperado 36866 = Silver ', MAX(k.pedidos_despachados), ')'),
           COUNT(*) = 36866 AND COUNT(*) = MAX(k.pedidos_despachados)
    FROM o CROSS JOIN k
    UNION ALL
    SELECT 'obt_pedidos_so_despachados',
           CONCAT(COUNT(*), ' pedidos da OBT não despachados ou sem situação de entrega'),
           COUNT(*) = 0
    FROM o LEFT JOIN (SELECT DISTINCT id_pedido, avaliado_prazo FROM silver.pedidos_rastreio) p USING (id_pedido)
    WHERE NOT COALESCE(p.avaliado_prazo, FALSE)
       OR o.situacao_pedido NOT IN ('Entregue no prazo', 'Entregue com atraso', 'Extraviado', 'Em trânsito')
       OR o.situacao_pedido IS NULL
    UNION ALL
    SELECT 'obt_itens_grao_unico',
           CONCAT(COUNT(*), ' linhas x ', COUNT(DISTINCT id_item_pedido), ' itens (esperado 101009)'),
           COUNT(*) = COUNT(DISTINCT id_item_pedido) AND COUNT(*) = 101009
    FROM it
    UNION ALL
    SELECT 'obt_itens_cobre_todos_os_pedidos',
           CONCAT(COUNT(DISTINCT id_pedido), ' pedidos nos itens'),
           COUNT(DISTINCT id_pedido) = 36866
    FROM it
    UNION ALL
    SELECT 'obt_etapas_grao_unico',
           CONCAT(COUNT(*), ' linhas x ', COUNT(DISTINCT id_pedido, etapa_num), ' pedido x etapa (esperado 201635)'),
           COUNT(*) = COUNT(DISTINCT id_pedido, etapa_num) AND COUNT(*) = 201635
    FROM et
    UNION ALL
    SELECT 'obt_etapas_todo_pedido_tem_etapa_0_e_1',
           CONCAT(COUNT(DISTINCT CASE WHEN etapa_num = 0 THEN id_pedido END), ' com etapa 0; ',
                  COUNT(DISTINCT CASE WHEN etapa_num = 1 THEN id_pedido END), ' com etapa 1'),
           COUNT(DISTINCT CASE WHEN etapa_num = 0 THEN id_pedido END) = 36866
           AND COUNT(DISTINCT CASE WHEN etapa_num = 1 THEN id_pedido END) = 36866
    FROM et
    UNION ALL
    -- País do mapa: o original está em espanhol; o mapa usa ISO3 / inglês (de-para gold_pais_mapa do 03c)
    SELECT 'pais_mapa_iso3_e_ingles_sem_nulo',
           CONCAT(SUM(CASE WHEN destino_pais_iso3 IS NULL OR LENGTH(destino_pais_iso3) <> 3 OR destino_pais_en IS NULL THEN 1 ELSE 0 END),
                  ' pedidos sem ISO3/inglês; ', COUNT(DISTINCT destino_pais), ' países originais x ',
                  COUNT(DISTINCT destino_pais_iso3), ' ISO3 x ', COUNT(DISTINCT destino_pais_en), ' em inglês'),
           SUM(CASE WHEN destino_pais_iso3 IS NULL OR LENGTH(destino_pais_iso3) <> 3 OR destino_pais_en IS NULL THEN 1 ELSE 0 END) = 0
           AND COUNT(DISTINCT destino_pais) = COUNT(DISTINCT destino_pais_iso3)
           AND COUNT(DISTINCT destino_pais) = COUNT(DISTINCT destino_pais_en)
    FROM o
    UNION ALL
    SELECT 'pais_mapa_igual_nas_3_obts',
           CONCAT(SUM(CASE WHEN it.destino_pais_iso3 IS DISTINCT FROM o.destino_pais_iso3 THEN 1 ELSE 0 END), ' itens com ISO3 diferente do pedido'),
           SUM(CASE WHEN it.destino_pais_iso3 IS DISTINCT FROM o.destino_pais_iso3 THEN 1 ELSE 0 END) = 0
    FROM it JOIN o USING (id_pedido)
    UNION ALL
    -- Rótulo real x simulado: todo campo listado precisa do comentário com o prefixo certo
    SELECT 'rotulo_real_simulado_nos_comentarios',
           CONCAT(COUNT(*), ' colunas sem rótulo', CASE WHEN COUNT(*) > 0
                  THEN CONCAT(': ', CONCAT_WS(', ', COLLECT_LIST(CONCAT(r.tabela, '.', r.coluna)))) ELSE '' END),
           COUNT(*) = 0
    FROM VALUES
        ('obt_pedidos_logistica', 'fl_despacho_atrasado', 'DADO REAL%'),
        ('obt_pedidos_logistica', 'dias_atraso_despacho', 'DADO REAL%'),
        ('obt_pedidos_logistica', 'causa_atraso_despacho', 'DADO REAL%'),
        ('obt_pedidos_logistica', 'receita_bruta_pedido', 'DADO REAL%'),
        ('obt_pedidos_logistica', 'receita_liquida_pedido', 'DADO REAL%'),
        ('obt_pedidos_logistica', 'lucro_pedido', 'DADO REAL%'),
        ('obt_pedidos_logistica', 'situacao_pedido', 'CENÁRIO SIMULADO%'),
        ('obt_pedidos_logistica', 'fl_com_desfecho', 'CENÁRIO SIMULADO%'),
        ('obt_pedidos_logistica', 'fl_em_transito', 'CENÁRIO SIMULADO%'),
        ('obt_pedidos_logistica', 'modal_transporte', 'CENÁRIO SIMULADO%'),
        ('obt_pedidos_logistica', 'transito_padrao_dias', 'CENÁRIO SIMULADO%'),
        ('obt_pedidos_logistica', 'transito_real_dias', 'CENÁRIO SIMULADO%'),
        ('obt_pedidos_logistica', 'dias_recuperados_transporte', 'CENÁRIO SIMULADO%'),
        ('obt_pedidos_logistica', 'resultado_transporte', 'CENÁRIO SIMULADO%'),
        ('obt_pedidos_logistica', 'data_entrega_prevista', 'CENÁRIO SIMULADO%'),
        ('obt_pedidos_logistica', 'data_entrega_realizada', 'CENÁRIO SIMULADO%'),
        ('obt_pedidos_logistica', 'fl_entregue_no_prazo', 'CENÁRIO SIMULADO%'),
        ('obt_pedidos_logistica', 'fl_entregue_atrasado', 'CENÁRIO SIMULADO%'),
        ('obt_pedidos_logistica', 'fl_extraviado', 'CENÁRIO SIMULADO%'),
        ('obt_pedidos_logistica', 'fl_recuperou_atraso', 'CENÁRIO SIMULADO%'),
        ('obt_pedidos_logistica', 'dias_atraso_entrega', 'CENÁRIO SIMULADO%'),
        ('obt_pedidos_logistica', 'etapa_extravio', 'CENÁRIO SIMULADO%'),
        ('obt_pedidos_logistica', 'receita_bruta_em_risco', 'CENÁRIO SIMULADO%'),
        ('obt_pedidos_logistica', 'receita_liquida_em_risco', 'CENÁRIO SIMULADO%'),
        ('obt_pedidos_logistica', 'lucro_em_risco', 'CENÁRIO SIMULADO%'),
        ('obt_pedidos_logistica', 'receita_bruta_extraviada', 'CENÁRIO SIMULADO%'),
        ('obt_pedidos_logistica', 'lucro_extraviado', 'CENÁRIO SIMULADO%'),
        ('obt_itens_risco', 'receita_bruta_item', 'DADO REAL%'),
        ('obt_itens_risco', 'receita_liquida_item', 'DADO REAL%'),
        ('obt_itens_risco', 'lucro_item', 'DADO REAL%'),
        ('obt_itens_risco', 'situacao_pedido', 'CENÁRIO SIMULADO%'),
        ('obt_itens_risco', 'fl_extraviado', 'CENÁRIO SIMULADO%'),
        ('obt_itens_risco', 'receita_bruta_em_risco', 'CENÁRIO SIMULADO%'),
        ('obt_itens_risco', 'receita_liquida_em_risco', 'CENÁRIO SIMULADO%'),
        ('obt_itens_risco', 'lucro_em_risco', 'CENÁRIO SIMULADO%'),
        ('obt_itens_risco', 'lucro_extraviado', 'CENÁRIO SIMULADO%'),
        ('obt_eventos_etapas', 'horas_na_etapa', 'CENÁRIO SIMULADO%'),
        ('obt_eventos_etapas', 'fl_extravio_nesta_etapa', 'CENÁRIO SIMULADO%'),
        ('obt_eventos_etapas', 'receita_bruta_extraviada_nesta_etapa', 'CENÁRIO SIMULADO%'),
        ('obt_eventos_etapas', 'receita_bruta_pedido', 'DADO REAL%')
        AS r(tabela, coluna, prefixo)
    LEFT JOIN system.information_schema.columns c
      ON c.table_catalog = current_catalog() AND c.table_schema = 'gold'
     AND c.table_name = r.tabela AND c.column_name = r.coluna
    WHERE c.comment IS NULL OR c.comment NOT LIKE r.prefixo
    UNION ALL
    -- Rótulo derivado do dado: origem da entrega = silver.rastreio_pedidos.dado_simulado
    SELECT 'rotulo_origem_coerente_com_silver',
           CONCAT(SUM(CASE WHEN o.origem_dado_entrega IS DISTINCT FROM CASE WHEN r.dado_simulado THEN 'simulado' WHEN r.situacao_entrega IS NULL THEN 'sem_dado' ELSE 'real' END
                            OR o.origem_dado_despacho <> 'real' OR o.rotulo_fonte IS NULL THEN 1 ELSE 0 END),
                  ' pedidos com rótulo divergente da Silver; ',
                  (SELECT COUNT(*) FROM et JOIN o o2 USING (id_pedido) WHERE et.origem_dado IS DISTINCT FROM
                       CASE WHEN et.etapa_num = 0 THEN 'real' ELSE o2.origem_dado_entrega END),
                  ' etapas com origem_dado errado'),
           SUM(CASE WHEN o.origem_dado_entrega IS DISTINCT FROM CASE WHEN r.dado_simulado THEN 'simulado' WHEN r.situacao_entrega IS NULL THEN 'sem_dado' ELSE 'real' END
                     OR o.origem_dado_despacho <> 'real' OR o.rotulo_fonte IS NULL THEN 1 ELSE 0 END) = 0
           AND (SELECT COUNT(*) FROM et JOIN o o2 USING (id_pedido) WHERE et.origem_dado IS DISTINCT FROM
                    CASE WHEN et.etapa_num = 0 THEN 'real' ELSE o2.origem_dado_entrega END) = 0
    FROM o LEFT JOIN silver.rastreio_pedidos r USING (id_pedido)
    UNION ALL
    SELECT 'classe_servico_preenchida',
           CONCAT(SUM(CASE WHEN classe_servico IS NULL
                             OR classe_servico NOT IN ('Same Day', 'First Class', 'Second Class', 'Standard Class')
                             OR modo_envio IS NULL OR modo_envio = classe_servico THEN 1 ELSE 0 END),
                  ' pedidos sem classe_servico ou modo_envio não traduzido'),
           SUM(CASE WHEN classe_servico IS NULL
                      OR classe_servico NOT IN ('Same Day', 'First Class', 'Second Class', 'Standard Class')
                      OR modo_envio IS NULL OR modo_envio = classe_servico THEN 1 ELSE 0 END) = 0
    FROM o

    -- ---------------- KPIs x gabarito da Silver (k) ----------------
    UNION ALL
    SELECT 'kpi_despacho_atrasado_57_3',
           CONCAT(kp.pct_despacho_atrasado, '% x Silver ', k.pct_despacho_atrasado, '%'),
           kp.pct_despacho_atrasado = k.pct_despacho_atrasado AND kp.pct_despacho_atrasado = 57.3
    FROM kp CROSS JOIN k
    UNION ALL
    SELECT 'kpi_atraso_medio_despacho_1_61',
           CONCAT(kp.atraso_medio_despacho, ' dia x Silver ', k.atraso_medio_despacho_dias),
           kp.atraso_medio_despacho = k.atraso_medio_despacho_dias AND kp.atraso_medio_despacho = 1.61
    FROM kp CROSS JOIN k
    UNION ALL
    SELECT 'kpi_causas_6655_promessa_14472_operacional',
           CONCAT(kp.causa_promessa, ' promessa irreal / ', kp.causa_operacional, ' operacional'),
           kp.causa_promessa = 6655 AND kp.causa_operacional = 14472
    FROM kp
    UNION ALL
    SELECT 'kpi_base_desfecho_36669_e_197_em_transito',
           CONCAT(kp.com_desfecho, ' com desfecho (Silver ', k.pedidos_com_desfecho_entrega, ') / ', kp.em_transito, ' em trânsito'),
           kp.com_desfecho = k.pedidos_com_desfecho_entrega AND kp.com_desfecho = 36669 AND kp.em_transito = 197
    FROM kp CROSS JOIN k
    UNION ALL
    SELECT 'kpi_entrega_59_9_20_4_19_7',
           CONCAT(kp.pct_no_prazo, ' / ', kp.pct_atrasado, ' / ', kp.pct_extraviado, ' x Silver ',
                  k.pct_entregue_no_prazo, ' / ', k.pct_entregue_com_atraso, ' / ', k.pct_extraviado),
           kp.pct_no_prazo = k.pct_entregue_no_prazo AND kp.pct_atrasado = k.pct_entregue_com_atraso
           AND kp.pct_extraviado = k.pct_extraviado
           AND kp.pct_no_prazo = 59.9 AND kp.pct_atrasado = 20.4 AND kp.pct_extraviado = 19.7
    FROM kp CROSS JOIN k
    UNION ALL
    SELECT 'kpi_atraso_medio_entrega_1_63',
           CONCAT(kp.atraso_medio_entrega, ' dia'),
           kp.atraso_medio_entrega = 1.63
    FROM kp
    UNION ALL
    SELECT 'kpi_recuperado_no_transporte_55_8',
           CONCAT(kp.pct_recuperado, '% x Silver ', k.pct_despacho_atrasado_recuperado_no_transporte, '%'),
           kp.pct_recuperado = k.pct_despacho_atrasado_recuperado_no_transporte AND kp.pct_recuperado = 55.8
    FROM kp CROSS JOIN k
    UNION ALL
    SELECT 'kpi_receita_bruta_20_62M_risco_8_28M',
           CONCAT(ROUND(kp.rb / 1e6, 2), ' M / ', ROUND(kp.rb_risco / 1e6, 2), ' M x Silver ',
                  ROUND(k.receita_despachada / 1e6, 2), ' M / ', ROUND(k.receita_em_risco / 1e6, 2), ' M'),
           ABS(kp.rb - k.receita_despachada) < 0.05 AND ABS(kp.rb_risco - k.receita_em_risco) < 0.05
           AND ROUND(kp.rb / 1e6, 2) = 20.62 AND ROUND(kp.rb_risco / 1e6, 2) = 8.28
    FROM kp CROSS JOIN k
    UNION ALL
    SELECT 'kpi_receita_liquida_18_53M_risco_7_44M',
           CONCAT(ROUND(kp.rl / 1e6, 2), ' M / ', ROUND(kp.rl_risco / 1e6, 2), ' M'),
           ROUND(kp.rl / 1e6, 2) = 18.53 AND ROUND(kp.rl_risco / 1e6, 2) = 7.44
    FROM kp
    UNION ALL
    SELECT 'kpi_lucro_2_27M_risco_0_89M_extraviado_0_44M',
           CONCAT(ROUND(kp.lu / 1e6, 2), ' M / ', ROUND(kp.lu_risco / 1e6, 2), ' M / ', ROUND(kp.lu_extr / 1e6, 2), ' M'),
           ROUND(kp.lu / 1e6, 2) = 2.27 AND ROUND(kp.lu_risco / 1e6, 2) = 0.89 AND ROUND(kp.lu_extr / 1e6, 2) = 0.44
    FROM kp
    UNION ALL
    SELECT 'kpi_s1_prazo_honesto_31_4',
           CONCAT(kp.pct_s1, '% com prazo sugerido; ', kp.acima_4_dias, ' despachos acima de 4 dias'),
           kp.pct_s1 = 31.4 AND kp.acima_4_dias = 11578
    FROM kp

    -- ---------------- Receita em risco ----------------
    UNION ALL
    SELECT 'pedidos_risco_so_em_atraso_ou_extravio',
           CONCAT(SUM(CASE WHEN (receita_bruta_em_risco > 0 OR receita_liquida_em_risco <> 0 OR lucro_em_risco <> 0)
                            AND situacao_pedido NOT IN ('Entregue com atraso', 'Extraviado') THEN 1 ELSE 0 END),
                  ' pedidos com valor em risco fora de atraso/extravio; ',
                  SUM(CASE WHEN situacao_pedido IN ('Entregue com atraso', 'Extraviado') AND receita_bruta_em_risco <= 0 THEN 1 ELSE 0 END),
                  ' atrasados/extraviados sem receita em risco'),
           SUM(CASE WHEN (receita_bruta_em_risco > 0 OR receita_liquida_em_risco <> 0 OR lucro_em_risco <> 0)
                     AND situacao_pedido NOT IN ('Entregue com atraso', 'Extraviado') THEN 1 ELSE 0 END) = 0
           AND SUM(CASE WHEN situacao_pedido IN ('Entregue com atraso', 'Extraviado') AND receita_bruta_em_risco <= 0 THEN 1 ELSE 0 END) = 0
    FROM o
    UNION ALL
    SELECT 'pedidos_extraviada_so_em_extravio',
           CONCAT(SUM(CASE WHEN (receita_bruta_extraviada <> 0 OR receita_liquida_extraviada <> 0 OR lucro_extraviado <> 0)
                            AND situacao_pedido <> 'Extraviado' THEN 1 ELSE 0 END), ' pedidos'),
           SUM(CASE WHEN (receita_bruta_extraviada <> 0 OR receita_liquida_extraviada <> 0 OR lucro_extraviado <> 0)
                     AND situacao_pedido <> 'Extraviado' THEN 1 ELSE 0 END) = 0
    FROM o
    UNION ALL
    SELECT 'itens_risco_so_em_atraso_ou_extravio',
           CONCAT(SUM(CASE WHEN (receita_bruta_em_risco > 0 OR receita_liquida_em_risco <> 0 OR lucro_em_risco <> 0
                                 OR receita_bruta_extraviada <> 0 OR lucro_extraviado <> 0)
                            AND situacao_pedido NOT IN ('Entregue com atraso', 'Extraviado') THEN 1 ELSE 0 END), ' itens'),
           SUM(CASE WHEN (receita_bruta_em_risco > 0 OR receita_liquida_em_risco <> 0 OR lucro_em_risco <> 0
                          OR receita_bruta_extraviada <> 0 OR lucro_extraviado <> 0)
                     AND situacao_pedido NOT IN ('Entregue com atraso', 'Extraviado') THEN 1 ELSE 0 END) = 0
    FROM it

    -- ---------------- Extravio por etapa ----------------
    UNION ALL
    SELECT 'extraviado_tem_exatamente_1_etapa_de_extravio',
           CONCAT(SUM(CASE WHEN fl_extraviado = 1 AND etapas_com_extravio <> 1 THEN 1 ELSE 0 END), ' extraviados com <> 1 etapa; ',
                  SUM(CASE WHEN fl_extraviado = 0 AND etapas_com_extravio > 0 THEN 1 ELSE 0 END), ' não extraviados com etapa de extravio'),
           SUM(CASE WHEN fl_extraviado = 1 AND etapas_com_extravio <> 1 THEN 1 ELSE 0 END) = 0
           AND SUM(CASE WHEN fl_extraviado = 0 AND etapas_com_extravio > 0 THEN 1 ELSE 0 END) = 0
    FROM extravio_pedido
    UNION ALL
    SELECT 'etapa_extravio_pedido_igual_etapa_evento',
           CONCAT(SUM(CASE WHEN fl_extraviado = 1 AND (etapa_extravio_num IS NULL OR etapa_extravio_num <> etapa_ev) THEN 1 ELSE 0 END),
                  ' extraviados com etapa divergente'),
           SUM(CASE WHEN fl_extraviado = 1 AND (etapa_extravio_num IS NULL OR etapa_extravio_num <> etapa_ev) THEN 1 ELSE 0 END) = 0
    FROM extravio_pedido
    UNION ALL
    SELECT 'extravios_por_etapa_batem_com_silver',
           CONCAT(etapas_divergentes, ' etapas divergentes de silver.rastreio_pedidos'),
           etapas_divergentes = 0
    FROM extravio_etapa_cmp
    UNION ALL
    SELECT 'horas_na_etapa_coerentes',
           CONCAT(SUM(CASE WHEN horas_na_etapa < 0 THEN 1 ELSE 0 END), ' negativas; ',
                  SUM(CASE WHEN fl_extravio_nesta_etapa = 1 AND horas_na_etapa IS NOT NULL THEN 1 ELSE 0 END), ' na etapa do extravio; ',
                  SUM(CASE WHEN fl_etapa_concluida = 1 AND horas_na_etapa IS NULL THEN 1 ELSE 0 END), ' concluídas sem horas'),
           SUM(CASE WHEN horas_na_etapa < 0 THEN 1 ELSE 0 END) = 0
           AND SUM(CASE WHEN fl_extravio_nesta_etapa = 1 AND horas_na_etapa IS NOT NULL THEN 1 ELSE 0 END) = 0
           AND SUM(CASE WHEN fl_etapa_concluida = 1 AND horas_na_etapa IS NULL THEN 1 ELSE 0 END) = 0
    FROM et
    UNION ALL
    SELECT 'em_transito_tem_1_etapa_atual',
           CONCAT(COUNT(*), ' pedidos em trânsito com <> 1 etapa atual'),
           COUNT(*) = 0
    FROM (SELECT id_pedido FROM et WHERE situacao_pedido = 'Em trânsito' GROUP BY id_pedido HAVING SUM(fl_etapa_atual) <> 1)
    UNION ALL
    SELECT 'etapa_atual_so_em_transito',
           CONCAT(SUM(CASE WHEN fl_etapa_atual = 1 AND situacao_pedido <> 'Em trânsito' THEN 1 ELSE 0 END),
                  ' etapas atuais fora de Em trânsito'),
           SUM(CASE WHEN fl_etapa_atual = 1 AND situacao_pedido <> 'Em trânsito' THEN 1 ELSE 0 END) = 0
    FROM et
    UNION ALL
    -- A receita do pedido se repete por etapa; a extraviada "nesta etapa" precisa somar igual à OBT de pedidos
    SELECT 'etapas_valor_extraviado_igual_obt_pedidos',
           CONCAT('bruta ', ROUND(SUM(et.receita_bruta_extraviada_nesta_etapa), 2), ' x ', ROUND(MAX(op.rbx), 2),
                  '; líquida ', ROUND(SUM(et.receita_liquida_extraviada_nesta_etapa), 2), ' x ', ROUND(MAX(op.rlx), 2),
                  '; lucro ', ROUND(SUM(et.lucro_extraviado_nesta_etapa), 2), ' x ', ROUND(MAX(op.lux), 2)),
           ABS(SUM(et.receita_bruta_extraviada_nesta_etapa) - MAX(op.rbx)) < 0.05
           AND ABS(SUM(et.receita_liquida_extraviada_nesta_etapa) - MAX(op.rlx)) < 0.05
           AND ABS(SUM(et.lucro_extraviado_nesta_etapa) - MAX(op.lux)) < 0.05
    FROM et CROSS JOIN (SELECT SUM(receita_bruta_extraviada) rbx, SUM(receita_liquida_extraviada) rlx,
                               SUM(lucro_extraviado) lux FROM o) op

    -- ---------------- Item x pedido ----------------
    UNION ALL
    SELECT 'soma_itens_igual_soma_pedidos_total',
           CONCAT('bruta ', ROUND(si.rb, 2), ' x ', ROUND(sp.rb, 2), '; líquida ', ROUND(si.rl, 2), ' x ', ROUND(sp.rl, 2),
                  '; lucro ', ROUND(si.lu, 2), ' x ', ROUND(sp.lu, 2)),
           ABS(si.rb - sp.rb) < 0.05 AND ABS(si.rl - sp.rl) < 0.05 AND ABS(si.lu - sp.lu) < 0.05
    FROM somas_item si CROSS JOIN somas_pedido sp
    UNION ALL
    SELECT 'soma_itens_igual_soma_pedidos_risco_extravio',
           CONCAT('em risco (bruta/líquida/lucro) ', ROUND(si.rb_risco, 2), '/', ROUND(si.rl_risco, 2), '/', ROUND(si.lu_risco, 2),
                  ' x ', ROUND(sp.rb_risco, 2), '/', ROUND(sp.rl_risco, 2), '/', ROUND(sp.lu_risco, 2)),
           ABS(si.rb_risco - sp.rb_risco) < 0.05 AND ABS(si.rl_risco - sp.rl_risco) < 0.05 AND ABS(si.lu_risco - sp.lu_risco) < 0.05
           AND ABS(si.rb_extr - sp.rb_extr) < 0.05 AND ABS(si.rl_extr - sp.rl_extr) < 0.05 AND ABS(si.lu_extr - sp.lu_extr) < 0.05
    FROM somas_item si CROSS JOIN somas_pedido sp
    UNION ALL
    SELECT 'soma_itens_igual_pedido_linha_a_linha',
           CONCAT(pedidos_divergentes, ' pedidos divergentes'),
           pedidos_divergentes = 0
    FROM item_x_pedido
    UNION ALL
    -- Conferência independente: OBT de itens x Silver (não Gold x Gold)
    SELECT 'obt_itens_igual_silver',
           CONCAT('bruta ', ROUND(si.rb, 2), ' x silver ', ROUND(sv.rb, 2), '; líquida ', ROUND(si.rl, 2), ' x ', ROUND(sv.rl, 2),
                  '; lucro ', ROUND(si.lu, 2), ' x ', ROUND(sv.lu, 2), '; em risco bruta ', ROUND(si.rb_risco, 2), ' x ', ROUND(sv.rb_risco, 2),
                  '; extraviado lucro ', ROUND(si.lu_extr, 2), ' x ', ROUND(sv.lu_extr, 2)),
           ABS(si.rb - sv.rb) < 0.05 AND ABS(si.rl - sv.rl) < 0.05 AND ABS(si.lu - sv.lu) < 0.05
           AND ABS(si.rb_risco - sv.rb_risco) < 0.05 AND ABS(si.rl_risco - sv.rl_risco) < 0.05
           AND ABS(si.lu_risco - sv.lu_risco) < 0.05 AND ABS(si.lu_extr - sv.lu_extr) < 0.05
           AND sv.itens = 101009
    FROM somas_item si
    CROSS JOIN (
        SELECT COUNT(*) AS itens, SUM(p.valor_bruto_venda) AS rb, SUM(p.valor_item_pedido) AS rl, SUM(p.lucro_item) AS lu,
               SUM(CASE WHEN r.situacao_entrega IN ('Entregue com atraso', 'Extraviado') THEN p.valor_bruto_venda ELSE 0 END) AS rb_risco,
               SUM(CASE WHEN r.situacao_entrega IN ('Entregue com atraso', 'Extraviado') THEN p.valor_item_pedido ELSE 0 END) AS rl_risco,
               SUM(CASE WHEN r.situacao_entrega IN ('Entregue com atraso', 'Extraviado') THEN p.lucro_item ELSE 0 END) AS lu_risco,
               SUM(CASE WHEN r.situacao_entrega = 'Extraviado' THEN p.lucro_item ELSE 0 END) AS lu_extr
        FROM silver.pedidos_rastreio p
        LEFT JOIN silver.rastreio_pedidos r USING (id_pedido)
        WHERE p.avaliado_prazo
    ) sv

    -- ---------------- Cenários de prazo (gold.vw_cenarios_prazo) ----------------
    UNION ALL
    SELECT 'cenarios_grao_pedido_x_cenario',
           CONCAT(COUNT(*), ' linhas x ', COUNT(DISTINCT id_pedido, cenario), ' pedido x cenário; ',
                  COUNT(DISTINCT cenario), ' cenários (esperado 1 + ', (SELECT COUNT(DISTINCT cenario) FROM pc), ' ativos)'),
           COUNT(*) = COUNT(DISTINCT id_pedido, cenario)
           AND COUNT(DISTINCT cenario) = 1 + (SELECT COUNT(DISTINCT cenario) FROM pc)
    FROM cv
    UNION ALL
    SELECT 'cenarios_todo_pedido_em_todo_cenario',
           CONCAT(SUM(CASE WHEN pedidos <> 36866 THEN 1 ELSE 0 END), ' cenários sem os 36866 pedidos (classe sem parâmetro?)'),
           SUM(CASE WHEN pedidos <> 36866 OR linhas <> 36866 THEN 1 ELSE 0 END) = 0
    FROM cen_resumo
    UNION ALL
    SELECT 'cenario_atual_igual_obt_pedidos',
           CONCAT(COUNT(*), ' pedidos divergentes da OBT (despacho, situação ou receita em risco)'),
           COUNT(*) = 0
    FROM cv JOIN o USING (id_pedido)
    WHERE cv.cenario = 'Promessa atual'
      AND (cv.fl_despacho_atrasado <> o.fl_despacho_atrasado OR cv.situacao_pedido <> o.situacao_pedido
           OR cv.fl_entregue_atrasado <> o.fl_entregue_atrasado OR cv.fl_entregue_no_prazo <> o.fl_entregue_no_prazo
           OR ABS(cv.receita_bruta_em_risco - o.receita_bruta_em_risco) > 0.005
           OR ABS(cv.lucro_em_risco - o.lucro_em_risco) > 0.005
           OR cv.dias_atraso_entrega IS DISTINCT FROM o.dias_atraso_entrega)
    UNION ALL
    SELECT 'cenarios_extravio_e_transito_iguais',
           CONCAT(COUNT(DISTINCT extraviados), ' valor(es) de extraviados e ', COUNT(DISTINCT em_transito),
                  ' de em trânsito entre os cenários (esperado 1 e 1)'),
           COUNT(DISTINCT extraviados) = 1 AND COUNT(DISTINCT em_transito) = 1 AND MAX(extraviados) = 7222
    FROM cen_resumo
    UNION ALL
    SELECT 'cenarios_entrega_atrasada_so_com_despacho_atrasado',
           CONCAT(SUM(CASE WHEN fl_entregue_atrasado = 1 AND fl_despacho_atrasado = 0 THEN 1 ELSE 0 END),
                  ' entregas atrasadas sem despacho atrasado no mesmo cenário'),
           SUM(CASE WHEN fl_entregue_atrasado = 1 AND fl_despacho_atrasado = 0 THEN 1 ELSE 0 END) = 0
    FROM cv
    UNION ALL
    SELECT 'cenario_ajustado_referencia_31_4_3952_6_29M',
           CONCAT(r.pct_despacho_atrasado, '% despacho atrasado / ', r.entregas_atrasadas, ' entregas atrasadas / ',
                  ROUND(r.receita_bruta_em_risco / 1e6, 2), ' M em risco',
                  CASE WHEN NOT si.ok THEN ' (parâmetros editados: informativo)' ELSE '' END),
           NOT si.ok OR (r.pct_despacho_atrasado = 31.4 AND r.entregas_atrasadas = 3952
                         AND ROUND(r.receita_bruta_em_risco / 1e6, 2) = 6.29)
    FROM cen_resumo r CROSS JOIN seed_intacto si
    WHERE r.cenario = 'Promessa ajustada'

    -- ---------------- LGPD ----------------
    UNION ALL
    SELECT 'sem_colunas_pii',
           CONCAT(colunas_pii, ' colunas suspeitas', CASE WHEN colunas_pii > 0 THEN CONCAT(': ', lista) ELSE '' END),
           colunas_pii = 0
    FROM pii
)
SELECT teste, detalhe, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status
FROM testes;

-- COMMAND ----------

-- 1. Painel
SELECT * FROM painel_gold_obt ORDER BY status, teste;

-- COMMAND ----------

-- 2. Extravio e horas por etapa (cenário simulado, exceto a etapa 0)
SELECT etapa_num, etapa_desc, origem_dado, COUNT(*) AS pedidos, SUM(fl_extravio_nesta_etapa) AS extravios,
       ROUND(AVG(horas_na_etapa), 1) AS horas_media
FROM gold.obt_eventos_etapas
GROUP BY ALL
ORDER BY etapa_num;

-- COMMAND ----------

-- 3. Valor em risco por departamento (exemplo de uso da OBT de itens)
SELECT departamento, COUNT(DISTINCT id_pedido) AS pedidos,
       ROUND(SUM(receita_bruta_item), 2) AS receita_bruta, ROUND(SUM(receita_bruta_em_risco), 2) AS receita_bruta_em_risco,
       ROUND(SUM(lucro_item), 2) AS lucro, ROUND(SUM(lucro_em_risco), 2) AS lucro_em_risco
FROM gold.obt_itens_risco
GROUP BY departamento
ORDER BY receita_bruta DESC;

-- COMMAND ----------

-- 4. Falha o notebook se houver algum FAIL
SELECT assert_true(COUNT(*) = 0, 'Validação da Gold OBT com FAIL: veja o painel') AS ok
FROM painel_gold_obt
WHERE status = 'FAIL';
