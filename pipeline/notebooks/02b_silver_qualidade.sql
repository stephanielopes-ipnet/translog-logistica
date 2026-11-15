-- Databricks notebook source
-- =============================================================================
-- PROJETO INTEGRADOR ACADEMY - GRUPO 3 (TRANSLOG BRASIL)
-- ETAPA 2b: TESTES DE QUALIDADE DA CAMADA SILVER
-- Responsável: Engenharia de Dados (Mateus)
-- Rodar depois de 01 -> 01b (de-para) -> 02a (tabela) -> 02d (hubs + rastreio) -> 02e (view).
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
       OR janela_atraso IS NULL OR resumo_rastreio_rag IS NULL

    UNION ALL
    -- Cancelados não podem ter dias_atraso (distorce médias da Gold)
    SELECT 'cancelados_sem_dias_atraso',
           CONCAT(COUNT(*), ' cancelados com dias_atraso'),
           COUNT(*) = 0
    FROM silver.pedidos_rastreio
    WHERE status_entrega_original = 'Shipping canceled' AND dias_atraso IS NOT NULL

    UNION ALL
    -- Regra de atraso: só COMPLETE/CLOSED/PROCESSING têm dias_atraso e flag
    SELECT 'nao_avaliados_sem_dias_atraso',
           CONCAT(COUNT(*), ' não avaliados com dias_atraso/flag'),
           COUNT(*) = 0
    FROM silver.pedidos_rastreio
    WHERE NOT avaliado_prazo AND (dias_atraso IS NOT NULL OR flag_atrasado IS NOT NULL)

    UNION ALL
    SELECT 'flag_atrasado_coerente_com_dias',
           CONCAT(COUNT(*), ' incoerências'),
           COUNT(*) = 0
    FROM silver.pedidos_rastreio
    WHERE avaliado_prazo AND flag_atrasado <> CASE WHEN dias_atraso > 0 THEN 1 ELSE 0 END

    UNION ALL
    -- Data prevista = data do pedido + prazo programado
    SELECT 'data_prevista_coerente_com_prazo',
           CONCAT(COUNT(*), ' incoerências'),
           COUNT(*) = 0
    FROM silver.pedidos_rastreio
    WHERE data_prevista_entrega IS NULL
       OR DATEDIFF(data_prevista_entrega, data_pedido) <> dias_envio_programado

    UNION ALL
    -- Atrasado pelas datas (envio depois da previsão) = atrasado pelos dias
    SELECT 'flag_atrasado_coerente_com_datas',
           CONCAT(COUNT(*), ' incoerências'),
           COUNT(*) = 0
    FROM silver.pedidos_rastreio
    WHERE avaliado_prazo
      AND flag_atrasado <> CASE WHEN DATEDIFF(data_envio, data_prevista_entrega) > 0 THEN 1 ELSE 0 END

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
                          'data_envio', 'status_movimento', 'etapa_gargalo')

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
    WHERE NOT (no_prazo <=> CASE flag_atrasado WHEN 0 THEN 1 WHEN 1 THEN 0 END)

    UNION ALL
    SELECT 'pmo_faixa_atraso_coerente_com_dias',
           CONCAT(COUNT(*), ' incoerências'),
           COUNT(*) = 0
    FROM silver.pedidos_rastreio
    WHERE NOT (faixa_atraso <=> CASE WHEN dias_atraso IS NULL THEN NULL
                                     WHEN dias_atraso <= 0 THEN 'No prazo'
                                     WHEN dias_atraso <= 2 THEN '1-2 dias'
                                     ELSE '3+ dias' END)

    UNION ALL
    -- Entregue: data_entrega_real = Shipping date (data_envio). Demais (em trânsito,
    -- não despachado, cancelado): NULL
    SELECT 'pmo_data_entrega_real_so_entregues',
           CONCAT(COUNT(*), ' incoerências'),
           COUNT(*) = 0
    FROM silver.pedidos_rastreio
    WHERE (status_pedido IN ('COMPLETE', 'CLOSED') AND NOT pedido_cancelado
           AND (data_entrega_real IS NULL OR DATEDIFF(data_entrega_real, data_envio) <> 0))
       OR (NOT (status_pedido IN ('COMPLETE', 'CLOSED') AND NOT pedido_cancelado)
           AND data_entrega_real IS NOT NULL)

    UNION ALL
    SELECT 'pmo_periodo_pico_bate_com_mes',
           CONCAT(COUNT(*), ' incoerências'),
           COUNT(*) = 0
    FROM silver.pedidos_rastreio
    WHERE periodo_pico <> CASE WHEN MONTH(data_pedido) IN (11, 12) THEN 1 ELSE 0 END

    UNION ALL
    SELECT 'pmo_receita_em_risco_so_nos_atrasados',
           CONCAT(COUNT(*), ' incoerências'),
           COUNT(*) = 0
    FROM silver.pedidos_rastreio
    WHERE NOT (receita_em_risco <=> CASE WHEN flag_atrasado = 1 THEN valor_bruto_venda ELSE 0 END)

    UNION ALL
    SELECT 'pmo_causa_provavel_segue_regra',
           CONCAT(COUNT(*), ' incoerências'),
           COUNT(*) = 0
    FROM silver.pedidos_rastreio
    WHERE NOT (causa_provavel <=> CASE
                   WHEN flag_atrasado IS NULL THEN NULL
                   WHEN flag_atrasado = 0 THEN 'Sem atraso'
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
    -- Matriz status x posição (compara com o 1º item de cada pedido):
    --   não despachado/cancelado -> sem etapa, local, hub, modal e motivo
    --   despachado (entregue ou em trânsito) -> tudo preenchido
    --   entregue -> etapa 5 e "Entregue em ..."; em trânsito -> nunca "Entregue em ..."
    SELECT 'rastreio_matriz_status_x_posicao',
           CONCAT(COUNT(*), ' incoerências'),
           COUNT(*) = 0
    FROM silver.rastreio_pedidos r
    JOIN (SELECT * FROM silver.pedidos_rastreio
          QUALIFY ROW_NUMBER() OVER (PARTITION BY id_pedido ORDER BY id_item_pedido) = 1) s
      USING (id_pedido)
    WHERE (NOT s.avaliado_prazo AND (r.etapa_atual IS NOT NULL OR r.local_atual IS NOT NULL
                                     OR r.id_hub_atual IS NOT NULL OR r.modal_transporte IS NOT NULL
                                     OR r.motivo_ocorrencia IS NOT NULL OR r.dado_simulado))
       OR (s.avaliado_prazo AND (r.etapa_atual IS NULL OR r.local_atual IS NULL OR r.id_hub_atual IS NULL
                                 OR r.modal_transporte IS NULL OR r.motivo_ocorrencia IS NULL))
       OR (s.avaliado_prazo AND s.status_pedido IN ('COMPLETE', 'CLOSED')
           AND (r.etapa_atual <> 5 OR r.local_atual NOT LIKE 'Entregue em %'))
       OR (s.status_pedido = 'PROCESSING' AND r.local_atual LIKE 'Entregue em %')

    UNION ALL
    -- Rotas: doméstica nunca passa pela alfândega; rodoviário nunca voa nem é internacional;
    -- origem Porto Rico é sempre aérea (ilha)
    SELECT 'rastreio_etapas_coerentes_com_rota',
           CONCAT(COUNT(*), ' incoerências'),
           COUNT(*) = 0
    FROM silver.rastreio_pedidos r
    JOIN (SELECT id_pedido, origem_cliente_pais FROM silver.pedidos_rastreio
          QUALIFY ROW_NUMBER() OVER (PARTITION BY id_pedido ORDER BY id_item_pedido) = 1) s
      USING (id_pedido)
    WHERE (r.tipo_rota = 'Doméstica' AND r.etapa_atual = 3)
       OR (r.modal_transporte = 'Rodoviário' AND (r.etapa_atual = 2 OR r.tipo_rota = 'Internacional'))
       OR (s.origem_cliente_pais = 'Puerto Rico' AND r.modal_transporte = 'Rodoviário')

    UNION ALL
    -- Matriz na VIEW (o que o portal e a IA leem):
    --   Aguardando Liberação / Cancelado -> sem datas de entrega, dias reais, atraso, local e motivo
    --   Em Trânsito -> tem previsão, atraso (0/1) e local; NÃO tem data de entrega
    --   Entregue    -> tem data de entrega, atraso (0/1) e etapa 5
    SELECT 'view_matriz_situacao_x_datas_e_posicao',
           CONCAT(COUNT(*), ' itens fora da matriz'),
           COUNT(*) = 0
    FROM silver.vw_pedidos_rastreio
    WHERE (situacao_rastreio IN ('Aguardando Liberação', 'Cancelado')
           AND (data_prevista_entrega IS NOT NULL OR data_entrega_real IS NOT NULL
                OR dias_envio_real IS NOT NULL OR flag_atrasado IS NOT NULL
                OR local_atual IS NOT NULL OR etapa_atual IS NOT NULL OR motivo_ocorrencia IS NOT NULL))
       OR (situacao_rastreio = 'Em Trânsito'
           AND (data_prevista_entrega IS NULL OR data_entrega_real IS NOT NULL
                OR flag_atrasado IS NULL OR local_atual IS NULL))
       OR (situacao_rastreio = 'Entregue'
           AND (data_entrega_real IS NULL OR flag_atrasado IS NULL OR etapa_atual <> 5))
       OR situacao_rastreio NOT IN ('Aguardando Liberação', 'Cancelado', 'Em Trânsito', 'Entregue')

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
    SELECT 'view_tem_colunas_v2',
           CONCAT(COUNT(*), ' de 10 colunas encontradas'),
           COUNT(*) = 10
    FROM information_schema.columns
    WHERE table_schema = 'silver' AND table_name = 'vw_pedidos_rastreio'
      AND column_name IN ('no_prazo', 'faixa_atraso', 'causa_provavel', 'receita_em_risco',
                          'rota_servico', 'data_entrega_real', 'etapa_atual', 'local_atual',
                          'motivo_ocorrencia', 'dado_simulado')
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
    janela_atraso,
    COUNT(*) AS itens,
    ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) AS pct
FROM silver.pedidos_rastreio
GROUP BY janela_atraso
ORDER BY janela_atraso;

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

-- 3e. Leitura humana: um texto RAG por situação, já em pt-BR
SELECT situacao_rastreio, rota_logistica, resumo_rastreio_rag
FROM silver.vw_pedidos_rastreio
QUALIFY ROW_NUMBER() OVER (PARTITION BY situacao_rastreio ORDER BY id_item_pedido) = 1;
