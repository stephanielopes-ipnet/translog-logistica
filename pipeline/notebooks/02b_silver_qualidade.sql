-- Databricks notebook source
-- =============================================================================
-- PROJETO INTEGRADOR ACADEMY - GRUPO 3 (TRANSLOG BRASIL)
-- ETAPA 2b: TESTES DE QUALIDADE DA CAMADA SILVER
-- Responsável: Engenharia de Dados (Mateus)
-- Rodar depois de 01 -> 01b (de-para) -> 02a (tabela) -> 02d (hubs) -> 02g (eventos) -> 02i (rastreio)
-- -> 02e (view). Premissa: Shipping date = DESPACHO (doc 04); entrega e posição são simuladas.
-- Resultado esperado: todas as linhas da consulta 1 com status = 'PASS'.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Painel de testes (PASS/FAIL)
-- -----------------------------------------------------------------------------
WITH
bronze  AS (SELECT COUNT(DISTINCT `Order Item Id`) AS n FROM bronze.dataco_raw),
silver  AS (SELECT COUNT(*) AS n, COUNT(DISTINCT id_item_pedido) AS n_distintos FROM silver.pedidos_rastreio),
quarent AS (SELECT COUNT(*) AS n FROM silver.pedidos_quarentena),
testes AS (
    -- Reconciliação: nenhum registro some entre Bronze e Silver
    SELECT 'reconciliacao_bronze = silver + quarentena' AS teste,
           CONCAT(b.n, ' = ', s.n, ' + ', q.n) AS detalhe,
           b.n = s.n + q.n AS ok
    FROM bronze b, silver s, quarent q

    UNION ALL
    -- Unicidade do grão
    SELECT 'unicidade_id_item_pedido',
           CONCAT(n, ' linhas / ', n_distintos, ' distintos'),
           n = n_distintos
    FROM silver

    UNION ALL
    -- Chaves e campos críticos sem nulos
    SELECT 'campos_criticos_sem_nulos',
           CONCAT(COUNT(*), ' linhas com nulo'),
           COUNT(*) = 0
    FROM silver.pedidos_rastreio
    WHERE id_pedido IS NULL OR id_item_pedido IS NULL
       OR data_pedido IS NULL OR data_envio IS NULL
       OR janela_atraso_despacho IS NULL OR resumo_rastreio_rag IS NULL

    UNION ALL
    -- Cancelados não podem ter dias_atraso_despacho (distorce médias da Gold)
    SELECT 'cancelados_sem_dias_atraso',
           CONCAT(COUNT(*), ' cancelados com dias_atraso_despacho'),
           COUNT(*) = 0
    FROM silver.pedidos_rastreio
    WHERE status_entrega_original = 'Shipping canceled' AND dias_atraso_despacho IS NOT NULL

    UNION ALL
    -- Regra de atraso: só COMPLETE/CLOSED/PROCESSING têm dias_atraso_despacho e flag
    SELECT 'nao_avaliados_sem_dias_atraso',
           CONCAT(COUNT(*), ' não avaliados com dias_atraso_despacho/flag'),
           COUNT(*) = 0
    FROM silver.pedidos_rastreio
    WHERE NOT avaliado_prazo AND (dias_atraso_despacho IS NOT NULL OR flag_atraso_despacho IS NOT NULL)

    UNION ALL
    SELECT 'flag_atraso_despacho_coerente_com_dias',
           CONCAT(COUNT(*), ' incoerências'),
           COUNT(*) = 0
    FROM silver.pedidos_rastreio
    WHERE avaliado_prazo AND flag_atraso_despacho <> CASE WHEN dias_atraso_despacho > 0 THEN 1 ELSE 0 END

    UNION ALL
    -- Despacho previsto = data do pedido + prazo de despacho programado
    SELECT 'data_prevista_despacho_coerente_com_prazo',
           CONCAT(COUNT(*), ' incoerências'),
           COUNT(*) = 0
    FROM silver.pedidos_rastreio
    WHERE data_despacho_prevista IS NULL
       OR DATEDIFF(data_despacho_prevista, data_pedido) <> dias_envio_programado

    UNION ALL
    -- Atrasado pelas datas (despacho depois do despacho previsto) = atrasado pelos dias
    SELECT 'flag_atraso_despacho_coerente_com_datas',
           CONCAT(COUNT(*), ' incoerências'),
           COUNT(*) = 0
    FROM silver.pedidos_rastreio
    WHERE avaliado_prazo
      AND flag_atraso_despacho <> CASE WHEN DATEDIFF(data_envio, data_despacho_prevista) > 0 THEN 1 ELSE 0 END

    UNION ALL
    -- LGPD: nome do cliente não pode aparecer no texto que vai para o banco vetorial
    SELECT 'rag_sem_nome_cliente',
           CONCAT(COUNT(*), ' textos com nome'),
           COUNT(*) = 0
    FROM silver.pedidos_rastreio
    WHERE nome_cliente IS NOT NULL AND INSTR(resumo_rastreio_rag, nome_cliente) > 0

    UNION ALL
    -- View de consumo: sem PII, sem linhagem técnica, sem colunas de atraso originais
    SELECT 'view_sem_colunas_proibidas',
           COALESCE(CONCAT_WS(', ', COLLECT_LIST(column_name)), ''),
           COUNT(*) = 0
    FROM information_schema.columns
    WHERE table_schema = 'silver' AND table_name = 'vw_pedidos_rastreio'
      AND column_name IN ('nome_cliente', 'status_entrega_original', 'risco_atraso_flag',
                          'dt_ingestao_bronze', 'dt_processamento_silver', 'arquivo_origem',
                          'avaliado_prazo', 'pedido_cancelado',
                          'data_envio', 'status_movimento', 'etapa_gargalo',
                          -- nomes da premissa antiga (Shipping date = entrega): não podem voltar
                          'data_entrega_real', 'status_entrega_pt', 'flag_atrasado', 'dias_atraso',
                          'causa_provavel', 'janela_atraso', 'faixa_atraso', 'no_prazo',
                          'data_prevista_despacho', 'data_entrega_simulada')

    UNION ALL
    SELECT 'view_mesmas_linhas_da_tabela',
           CONCAT(v.n, ' na view / ', s.n, ' na tabela'),
           v.n = s.n
    FROM (SELECT COUNT(*) AS n FROM silver.vw_pedidos_rastreio) v, silver s

    UNION ALL
    -- Quarentena pequena: se passar de 1%, alguma regra provavelmente está errada
    SELECT 'quarentena_abaixo_de_1pct',
           CONCAT(ROUND(100.0 * q.n / b.n, 3), '%'),
           q.n <= 0.01 * b.n
    FROM bronze b, quarent q

    UNION ALL
    -- Provas de que as colunas descartadas eram mesmo redundantes
    SELECT 'redundante_benefit_eq_profit',
           CONCAT(COUNT(*), ' divergências'),
           COUNT(*) = 0
    FROM bronze.dataco_raw
    WHERE ROUND(`Benefit per order`, 2) <> ROUND(`Order Profit Per Order`, 2)

    UNION ALL
    SELECT 'redundante_salespercustomer_eq_itemtotal',
           CONCAT(COUNT(*), ' divergências'),
           COUNT(*) = 0
    FROM bronze.dataco_raw
    WHERE ROUND(`Sales per customer`, 2) <> ROUND(`Order Item Total`, 2)

    UNION ALL
    SELECT 'redundante_ordercustomerid_eq_customerid',
           CONCAT(COUNT(*), ' divergências'),
           COUNT(*) = 0
    FROM bronze.dataco_raw
    WHERE `Order Customer Id` <> `Customer Id`

    UNION ALL
    SELECT 'redundante_productcategoryid_eq_categoryid',
           CONCAT(COUNT(*), ' divergências'),
           COUNT(*) = 0
    FROM bronze.dataco_raw
    WHERE `Product Category Id` <> `Category Id`

    UNION ALL
    SELECT 'redundante_productprice_eq_itemproductprice',
           CONCAT(COUNT(*), ' divergências'),
           COUNT(*) = 0
    FROM bronze.dataco_raw
    WHERE ROUND(`Product Price`, 2) <> ROUND(`Order Item Product Price`, 2)

    -- ======================= Silver v2: indicadores da PMO =======================
    UNION ALL
    SELECT 'pmo_no_prazo_inverso_da_flag',
           CONCAT(COUNT(*), ' incoerências'),
           COUNT(*) = 0
    FROM silver.pedidos_rastreio
    WHERE NOT (despacho_no_prazo <=> CASE flag_atraso_despacho WHEN 0 THEN 1 WHEN 1 THEN 0 END)

    UNION ALL
    SELECT 'pmo_faixa_atraso_coerente_com_dias',
           CONCAT(COUNT(*), ' incoerências'),
           COUNT(*) = 0
    FROM silver.pedidos_rastreio
    WHERE NOT (faixa_atraso_despacho <=> CASE WHEN dias_atraso_despacho IS NULL THEN NULL
                                     WHEN dias_atraso_despacho <= 0 THEN 'No prazo'
                                     WHEN dias_atraso_despacho <= 2 THEN '1-2 dias'
                                     ELSE '3+ dias' END)

    UNION ALL
    -- Despachado (COMPLETE, CLOSED, PROCESSING): data_despacho_real = data do Shipping date.
    -- Não despachado / cancelado: NULL
    SELECT 'data_despacho_real_so_despachados',
           CONCAT(COUNT(*), ' incoerências'),
           COUNT(*) = 0
    FROM silver.pedidos_rastreio
    WHERE (avaliado_prazo AND (data_despacho_real IS NULL OR data_despacho_real <> CAST(data_envio AS DATE)))
       OR (NOT avaliado_prazo AND data_despacho_real IS NOT NULL)

    UNION ALL
    SELECT 'pmo_periodo_pico_bate_com_mes',
           CONCAT(COUNT(*), ' incoerências'),
           COUNT(*) = 0
    FROM silver.pedidos_rastreio
    WHERE periodo_pico <> CASE WHEN MONTH(data_pedido) IN (11, 12) THEN 1 ELSE 0 END

    UNION ALL
    SELECT 'pmo_causa_provavel_segue_regra',
           CONCAT(COUNT(*), ' incoerências'),
           COUNT(*) = 0
    FROM silver.pedidos_rastreio
    WHERE NOT (causa_atraso_despacho <=> CASE
                   WHEN flag_atraso_despacho IS NULL THEN NULL
                   WHEN flag_atraso_despacho = 0 THEN 'Sem atraso'
                   WHEN dias_envio_programado <= 1 THEN 'Promessa irreal'
                   ELSE 'Atraso operacional' END)

    -- ======================= Silver v2: malha de hubs =======================
    UNION ALL
    SELECT 'hubs_id_unico',
           CONCAT(COUNT(*), ' hubs / ', COUNT(DISTINCT id_hub), ' ids'),
           COUNT(*) = COUNT(DISTINCT id_hub)
    FROM silver.dim_hubs

    UNION ALL
    SELECT 'hubs_um_cd_por_pais',
           CONCAT(h.n, ' CDs / ', p.n, ' países de destino'),
           h.n = p.n AND h.n = h.n_paises
    FROM (SELECT COUNT(*) AS n, COUNT(DISTINCT pais_original) AS n_paises
          FROM silver.dim_hubs WHERE tipo_hub = 'CD_NACIONAL') h,
         (SELECT COUNT(DISTINCT destino_pais) AS n FROM silver.pedidos_rastreio) p

    UNION ALL
    SELECT 'hubs_no_maximo_3_armazens_por_pais',
           CONCAT(COUNT(*), ' países com mais de 3'),
           COUNT(*) = 0
    FROM (SELECT pais_original FROM silver.dim_hubs WHERE tipo_hub = 'ARMAZEM_ESTADUAL'
          GROUP BY pais_original HAVING COUNT(*) > 3)

    -- ======================= Silver v2: rastreio simulado =======================
    UNION ALL
    SELECT 'rastreio_uma_linha_por_pedido',
           CONCAT(r.n, ' linhas / ', r.n_distintos, ' distintos / ', p.n, ' pedidos na Silver'),
           r.n = r.n_distintos AND r.n = p.n
    FROM (SELECT COUNT(*) AS n, COUNT(DISTINCT id_pedido) AS n_distintos FROM silver.rastreio_pedidos) r,
         (SELECT COUNT(DISTINCT id_pedido) AS n FROM silver.pedidos_rastreio) p

    UNION ALL
    SELECT 'rastreio_hub_atual_existe_na_malha',
           CONCAT(COUNT(*), ' pedidos com hub inexistente'),
           COUNT(*) = 0
    FROM silver.rastreio_pedidos r
    LEFT ANTI JOIN silver.dim_hubs h ON h.id_hub = r.id_hub_atual
    WHERE r.id_hub_atual IS NOT NULL

    UNION ALL
    -- Matriz status x posição/entrega (1º item de cada pedido x silver.rastreio_pedidos):
    --   não despachado/cancelado -> sem posição, hub, modal, motivo, previsão de entrega; não simulado
    --   despachado simulado      -> etapa, local, modal, motivo e situação de entrega preenchidos
    --   despachado fora da simulação (escopo piloto) -> sem posição/entrega; motivo (real) preenchido
    --   COMPLETE/CLOSED simulado -> entregue (no prazo/atraso) ou extraviado; PROCESSING -> em trânsito
    SELECT 'rastreio_matriz_status_x_posicao_e_entrega',
           CONCAT(COUNT(*), ' incoerências'),
           COUNT(*) = 0
    FROM silver.rastreio_pedidos r
    JOIN (SELECT * FROM silver.pedidos_rastreio
          QUALIFY ROW_NUMBER() OVER (PARTITION BY id_pedido ORDER BY id_item_pedido) = 1) s
      USING (id_pedido)
    WHERE (NOT s.avaliado_prazo AND (r.etapa_atual IS NOT NULL OR r.local_atual IS NOT NULL
                                     OR r.id_hub_atual IS NOT NULL OR r.modal_transporte IS NOT NULL
                                     OR r.motivo_ocorrencia IS NOT NULL OR r.data_entrega_prevista IS NOT NULL
                                     OR r.dado_simulado))
       OR (s.avaliado_prazo AND r.dado_simulado
           AND (r.etapa_atual IS NULL OR r.local_atual IS NULL OR r.modal_transporte IS NULL
                OR r.motivo_ocorrencia IS NULL OR r.situacao_entrega IS NULL OR r.data_entrega_prevista IS NULL))
       OR (s.avaliado_prazo AND NOT r.dado_simulado
           AND (r.etapa_atual IS NOT NULL OR r.local_atual IS NOT NULL OR r.motivo_ocorrencia IS NULL))
       OR (r.dado_simulado AND s.status_pedido IN ('COMPLETE', 'CLOSED')
           AND r.situacao_entrega NOT IN ('Entregue no prazo', 'Entregue com atraso', 'Extraviado'))
       OR (r.dado_simulado AND s.status_pedido = 'PROCESSING'
           AND (r.situacao_entrega <> 'Em trânsito' OR r.ultimo_codigo_evento = 'ENTREGUE'))

    UNION ALL
    -- Rotas: doméstica nunca passa pela alfândega; rodoviário nunca voa nem é internacional;
    -- origem Porto Rico é sempre aérea (ilha)
    SELECT 'rastreio_etapas_coerentes_com_rota',
           CONCAT(COUNT(*), ' incoerências'),
           COUNT(*) = 0
    FROM silver.rastreio_pedidos r
    JOIN (SELECT id_pedido, origem_cliente_pais, tipo_rota FROM silver.pedidos_rastreio
          QUALIFY ROW_NUMBER() OVER (PARTITION BY id_pedido ORDER BY id_item_pedido) = 1) s
      USING (id_pedido)
    WHERE (s.tipo_rota = 'Doméstica' AND r.etapa_atual = 3)
       OR (r.modal_transporte = 'Rodoviário' AND (r.etapa_atual = 2 OR s.tipo_rota = 'Internacional'))
       OR (s.origem_cliente_pais = 'Puerto Rico' AND r.modal_transporte = 'Rodoviário')

    UNION ALL
    -- Entrega simulada só existe para pedido despachado; extraviado/em trânsito não têm data de entrega
    SELECT 'entrega_simulada_so_para_despachados',
           CONCAT(COUNT(*), ' incoerências'),
           COUNT(*) = 0
    FROM silver.rastreio_pedidos r
    JOIN (SELECT id_pedido, avaliado_prazo FROM silver.pedidos_rastreio
          QUALIFY ROW_NUMBER() OVER (PARTITION BY id_pedido ORDER BY id_item_pedido) = 1) s
      USING (id_pedido)
    WHERE (NOT s.avaliado_prazo AND (r.data_entrega_prevista IS NOT NULL OR r.data_entrega_realizada IS NOT NULL))
       OR (r.situacao_entrega IN ('Extraviado', 'Em trânsito') AND r.data_entrega_realizada IS NOT NULL)
       OR (r.situacao_entrega LIKE 'Entregue%' AND r.data_entrega_realizada IS NULL)

    UNION ALL
    -- Entrega: atraso coerente com as datas; o transporte só recupera (nunca piora o despacho);
    -- entrega atrasada só existe com despacho atrasado
    SELECT 'atraso_entrega_coerente_com_despacho_e_datas',
           CONCAT(COUNT(*), ' incoerências'),
           COUNT(*) = 0
    FROM silver.entregas_simuladas e
    JOIN silver.simulacao_publicada p USING (cenario, versao, escopo)
    JOIN (SELECT id_pedido, dias_atraso_despacho FROM silver.pedidos_rastreio
          QUALIFY ROW_NUMBER() OVER (PARTITION BY id_pedido ORDER BY id_item_pedido) = 1) s
      USING (id_pedido)
    WHERE e.data_entrega_realizada IS NOT NULL
      AND (e.dias_atraso_entrega <> DATEDIFF(e.data_entrega_realizada, e.data_entrega_prevista)
           OR e.flag_atraso_entrega <> CASE WHEN e.dias_atraso_entrega > 0 THEN 1 ELSE 0 END
           OR e.dias_atraso_entrega > s.dias_atraso_despacho
           OR (e.flag_atraso_entrega = 1 AND s.dias_atraso_despacho <= 0))

    UNION ALL
    -- Fonte única de posição: o local da view é o local do último evento publicado
    SELECT 'posicao_da_view_igual_ultimo_evento',
           CONCAT(COUNT(*), ' pedidos divergentes'),
           COUNT(*) = 0
    FROM (SELECT DISTINCT v.id_pedido, v.local_atual
          FROM silver.vw_pedidos_rastreio v JOIN silver.rastreio_pedidos r USING (id_pedido)
          WHERE r.dado_simulado) v
    JOIN silver.eventos_logisticos e ON e.id_pedido = v.id_pedido AND e.ultimo_evento
    JOIN silver.simulacao_publicada p ON p.cenario = e.cenario AND p.versao = e.versao AND p.escopo = e.escopo
    WHERE NOT (v.local_atual <=> e.local_evento)

    UNION ALL
    -- Views de consumo (IA / portal) sem nenhuma marca de simulação nem termo "simulad" no texto
    SELECT 'views_de_consumo_sem_marca_de_simulacao',
           COALESCE(CONCAT_WS(', ', COLLECT_LIST(CONCAT(table_name, '.', column_name))), ''),
           COUNT(*) = 0
    FROM information_schema.columns
    WHERE table_schema = 'silver'
      AND table_name IN ('vw_pedidos_rastreio', 'vw_eventos_logisticos', 'vw_rastreio_eventos')
      AND column_name IN ('dado_simulado', 'fonte_evento', 'origem_evento', 'precisao_temporal',
                          'versao_simulacao', 'escopo_simulacao', 'cenario', 'versao', 'escopo',
                          'campo_origem', 'receita_em_risco')

    UNION ALL
    SELECT 'textos_de_consumo_sem_termo_simulado',
           CONCAT(COUNT(*), ' textos'),
           COUNT(*) = 0
    FROM silver.vw_pedidos_rastreio
    WHERE LOWER(resumo_rastreio_rag) LIKE '%simulad%' OR LOWER(motivo_ocorrencia) LIKE '%simulad%'
       OR LOWER(resumo_rastreio_rag) LIKE '%dataco%' OR LOWER(resumo_rastreio_rag) LIKE '%a base %'

    UNION ALL
    -- Matriz na VIEW (o que o portal e a IA leem):
    --   Aguardando Liberação / Cancelado -> sem datas de despacho, dias reais, atraso, local, motivo
    --                                       e sem datas de entrega
    --   Em Trânsito / Despachado -> despacho previsto e real, atraso no despacho (0/1)
    --   Em Trânsito -> nunca tem data de entrega simulada
    SELECT 'view_matriz_situacao_x_datas_e_posicao',
           CONCAT(COUNT(*), ' itens fora da matriz'),
           COUNT(*) = 0
    FROM silver.vw_pedidos_rastreio
    WHERE (situacao_rastreio IN ('Aguardando Liberação', 'Cancelado')
           AND (data_despacho_prevista IS NOT NULL OR data_despacho_real IS NOT NULL
                OR dias_envio_real IS NOT NULL OR flag_atraso_despacho IS NOT NULL
                OR local_atual IS NOT NULL OR etapa_atual IS NOT NULL OR motivo_ocorrencia IS NOT NULL
                OR data_entrega_prevista IS NOT NULL OR data_entrega_realizada IS NOT NULL))
       OR (situacao_rastreio IN ('Em Trânsito', 'Despachado')
           AND (data_despacho_prevista IS NULL OR data_despacho_real IS NULL OR flag_atraso_despacho IS NULL))
       OR (situacao_rastreio = 'Em Trânsito' AND data_entrega_realizada IS NOT NULL)
       OR situacao_rastreio NOT IN ('Aguardando Liberação', 'Cancelado', 'Em Trânsito', 'Despachado')

    UNION ALL
    -- Toda cidade de destino da Silver tem par no de-para (chave: país original + cidade)
    SELECT 'traducao_cobre_destino_cidade',
           CONCAT(COUNT(*), ' cidades sem tradução'),
           COUNT(*) = 0
    FROM (SELECT DISTINCT destino_pais, destino_cidade FROM silver.pedidos_rastreio
          WHERE destino_cidade IS NOT NULL) c
    LEFT ANTI JOIN silver.dim_traducao d
      ON d.coluna = 'destino_cidade' AND d.contexto = c.destino_pais AND d.valor_original = c.destino_cidade

    UNION ALL
    SELECT 'view_tem_colunas_v3',
           CONCAT(COUNT(*), ' de 16 colunas encontradas'),
           COUNT(*) = 16
    FROM information_schema.columns
    WHERE table_schema = 'silver' AND table_name = 'vw_pedidos_rastreio'
      AND column_name IN ('despacho_no_prazo', 'faixa_atraso_despacho', 'causa_atraso_despacho',
                          'flag_atraso_despacho', 'dias_atraso_despacho', 'rota_servico',
                          'data_despacho_prevista', 'data_despacho_real', 'status_prazo_despacho',
                          'etapa_atual', 'local_atual', 'motivo_ocorrencia', 'situacao_entrega',
                          'data_entrega_prevista', 'data_entrega_realizada', 'flag_atraso_entrega')
)
SELECT teste, detalhe, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status
FROM testes
ORDER BY status, teste;

-- COMMAND ----------

-- -----------------------------------------------------------------------------
-- 2. Quarentena por motivo (para explicar na apresentação)
-- -----------------------------------------------------------------------------
SELECT motivo_quarentena, COUNT(*) AS registros
FROM silver.pedidos_quarentena
GROUP BY motivo_quarentena
ORDER BY registros DESC;

-- COMMAND ----------

-- -----------------------------------------------------------------------------
-- 3. Distribuição das janelas. Esperado: PENDING/PENDING_PAYMENT/PAYMENT_REVIEW/ON_HOLD
--    só em "0. Não Avaliado"; CANCELED/SUSPECTED_FRAUD só em "5. Envios Cancelados".
--    (Os % da EDA não servem mais de referência: lá todos os status eram avaliados.)
-- -----------------------------------------------------------------------------
SELECT
    janela_atraso_despacho,
    COUNT(*) AS itens,
    ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) AS pct
FROM silver.pedidos_rastreio
GROUP BY janela_atraso_despacho
ORDER BY janela_atraso_despacho;

-- COMMAND ----------

-- -----------------------------------------------------------------------------
-- 3b. TRADUÇÃO: valores da Silver sem par no de-para (silver.dim_traducao)
--     Esperado: 0 linhas. Se aparecer, o valor original não bate com a chave do CSV.
-- -----------------------------------------------------------------------------
WITH usados AS (
    SELECT DISTINCT 'destino_pais' AS coluna, CAST(NULL AS STRING) AS contexto, destino_pais AS valor FROM silver.pedidos_rastreio
    UNION SELECT DISTINCT 'destino_estado', destino_pais, destino_estado FROM silver.pedidos_rastreio
    UNION SELECT DISTINCT 'destino_cidade', destino_pais, destino_cidade FROM silver.pedidos_rastreio
    UNION SELECT DISTINCT 'destino_regiao', NULL, destino_regiao FROM silver.pedidos_rastreio
    UNION SELECT DISTINCT 'origem_cliente_cidade', NULL, origem_cliente_cidade FROM silver.pedidos_rastreio
    UNION SELECT DISTINCT 'origem_cliente_estado', NULL, origem_cliente_estado FROM silver.pedidos_rastreio
    UNION SELECT DISTINCT 'origem_cliente_pais', NULL, origem_cliente_pais FROM silver.pedidos_rastreio
)
SELECT u.*
FROM usados u
LEFT ANTI JOIN silver.dim_traducao d
  ON d.coluna = u.coluna
 AND d.valor_original = u.valor
 AND (u.coluna NOT IN ('destino_estado', 'destino_cidade') OR d.contexto = u.contexto);

-- COMMAND ----------

-- 3c. De-para sem chave duplicada (esperado: 0 linhas; duplicata multiplicaria linhas na view)
SELECT coluna, contexto, valor_original, COUNT(*) AS vezes
FROM silver.dim_traducao
GROUP BY ALL
HAVING COUNT(*) > 1;

-- COMMAND ----------

-- 3d. Nenhum "?" de codificação sobrando nos nomes da view (esperado: 0)
SELECT COUNT(*) AS nomes_com_interrogacao
FROM silver.vw_pedidos_rastreio
WHERE destino_estado LIKE '%?%' OR destino_pais LIKE '%?%' OR origem_cliente_cidade LIKE '%?%';

-- COMMAND ----------

-- 3e. Leitura humana: um texto RAG por situação do pedido x entrega simulada, já em pt-BR
SELECT situacao_rastreio, situacao_entrega, rota_logistica, resumo_rastreio_rag
FROM silver.vw_pedidos_rastreio
QUALIFY ROW_NUMBER() OVER (PARTITION BY situacao_rastreio, situacao_entrega ORDER BY id_item_pedido) = 1;
