-- Databricks notebook source
-- =============================================================================
-- PROJETO INTEGRADOR ACADEMY - GRUPO 3 (TRANSLOG)
-- ETAPA 3c: GOLD OBT PARA O BI (One Big Table, sem join no dashboard)
-- Responsável: Engenharia de Dados (Mateus)
-- Consumidores: BI (AI/BI Dashboard). Rodar depois de 02i e 02e. Validação: 03d_gold_validacao.
--
-- Escopo: SÓ PEDIDOS DESPACHADOS (36.866). Não pagos, cancelados e aguardando pagamento ficam
-- fora: são problema do varejista, não da transportadora (o pedido nunca chega à TransLog).
--
-- Tabelas:
--   gold.obt_pedidos_logistica  grão PEDIDO despachado           chave id_pedido
--   gold.obt_itens_risco        grão ITEM de pedido despachado   chave id_item_pedido
--   gold.obt_eventos_etapas     grão PEDIDO x ETAPA percorrida   chave (id_pedido, etapa_num)
--   gold.param_cenario_prazo    parâmetros editáveis dos cenários de prazo (não sobrescrita)
--   gold.vw_cenarios_prazo      VIEW grão PEDIDO x CENÁRIO       chave (id_pedido, cenario)
--
-- Rótulo obrigatório (regra do projeto: não misturar real e simulado sem identificação):
--   Despacho (datas, atraso, causa, prazo)          = DADO REAL (DataCo)
--   Transporte, entrega, extravio, etapas 1 a 5     = CENÁRIO SIMULADO (60/20/20 sobre o despacho real)
--   Receita e lucro                                 = valores reais; "em risco"/"extraviada" depende
--                                                     do desfecho simulado
-- Medidas 0/1 (fl_*) para o BI calcular % = SUM(numerador) / SUM(denominador).
-- Receitas: bruta = valor_bruto_venda; líquida = valor_item_pedido (após desconto); lucro = lucro_item.
-- LGPD: nenhuma coluna de nome, e-mail, endereço ou origem do cliente.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS gold;

-- COMMAND ----------

-- -----------------------------------------------------------------------------
-- Base por item (temporária): só despachados, com o item principal de cada pedido
-- -----------------------------------------------------------------------------
CREATE OR REPLACE TEMP VIEW gold_base_itens AS
SELECT
    p.*,
    ROW_NUMBER() OVER (PARTITION BY id_pedido ORDER BY id_item_pedido)                        AS rn_base,
    -- item principal = maior receita bruta do pedido (empate: menor id_item_pedido)
    ROW_NUMBER() OVER (PARTITION BY id_pedido ORDER BY valor_bruto_venda DESC, id_item_pedido) AS rn_principal
FROM silver.pedidos_rastreio p
WHERE p.avaliado_prazo;

-- COMMAND ----------

-- -----------------------------------------------------------------------------
-- De-para de país para o MAPA (temporário): o destino_pais original do DataCo está em ESPANHOL
-- ("Francia", "Alemania"), que o mapa do AI/BI não reconhece. Chave = nome original (164 países
-- de silver.dim_traducao); saída = nome em inglês e código ISO 3166-1 alfa-3.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE TEMP VIEW gold_pais_mapa AS
SELECT * FROM VALUES
    ('Afganistán', 'Afghanistan', 'AFG'), ('Albania', 'Albania', 'ALB'), ('Alemania', 'Germany', 'DEU'),
    ('Angola', 'Angola', 'AGO'), ('Arabia Saudí', 'Saudi Arabia', 'SAU'), ('Argelia', 'Algeria', 'DZA'),
    ('Argentina', 'Argentina', 'ARG'), ('Armenia', 'Armenia', 'ARM'), ('Australia', 'Australia', 'AUS'),
    ('Austria', 'Austria', 'AUT'), ('Azerbaiyán', 'Azerbaijan', 'AZE'), ('Bangladés', 'Bangladesh', 'BGD'),
    ('Barbados', 'Barbados', 'BRB'), ('Baréin', 'Bahrain', 'BHR'), ('Belice', 'Belize', 'BLZ'),
    ('Benín', 'Benin', 'BEN'), ('Bielorrusia', 'Belarus', 'BLR'), ('Bolivia', 'Bolivia', 'BOL'),
    ('Bosnia y Herzegovina', 'Bosnia and Herzegovina', 'BIH'), ('Botsuana', 'Botswana', 'BWA'),
    ('Brasil', 'Brazil', 'BRA'), ('Bulgaria', 'Bulgaria', 'BGR'), ('Burkina Faso', 'Burkina Faso', 'BFA'),
    ('Burundi', 'Burundi', 'BDI'), ('Bután', 'Bhutan', 'BTN'), ('Bélgica', 'Belgium', 'BEL'),
    ('Camboya', 'Cambodia', 'KHM'), ('Camerún', 'Cameroon', 'CMR'), ('Canada', 'Canada', 'CAN'),
    ('Chad', 'Chad', 'TCD'), ('Chile', 'Chile', 'CHL'), ('China', 'China', 'CHN'),
    ('Chipre', 'Cyprus', 'CYP'), ('Colombia', 'Colombia', 'COL'), ('Corea del Sur', 'South Korea', 'KOR'),
    ('Costa Rica', 'Costa Rica', 'CRI'), ('Costa de Marfil', 'Ivory Coast', 'CIV'), ('Croacia', 'Croatia', 'HRV'),
    ('Cuba', 'Cuba', 'CUB'), ('Dinamarca', 'Denmark', 'DNK'), ('Ecuador', 'Ecuador', 'ECU'),
    ('Egipto', 'Egypt', 'EGY'), ('El Salvador', 'El Salvador', 'SLV'),
    ('Emiratos Árabes Unidos', 'United Arab Emirates', 'ARE'), ('Eritrea', 'Eritrea', 'ERI'),
    ('Eslovaquia', 'Slovakia', 'SVK'), ('Eslovenia', 'Slovenia', 'SVN'), ('España', 'Spain', 'ESP'),
    ('Estados Unidos', 'United States', 'USA'), ('Estonia', 'Estonia', 'EST'), ('Etiopía', 'Ethiopia', 'ETH'),
    ('Filipinas', 'Philippines', 'PHL'), ('Finlandia', 'Finland', 'FIN'), ('Francia', 'France', 'FRA'),
    ('Gabón', 'Gabon', 'GAB'), ('Georgia', 'Georgia', 'GEO'), ('Ghana', 'Ghana', 'GHA'),
    ('Grecia', 'Greece', 'GRC'), ('Guadalupe', 'Guadeloupe', 'GLP'), ('Guatemala', 'Guatemala', 'GTM'),
    ('Guayana Francesa', 'French Guiana', 'GUF'), ('Guinea', 'Guinea', 'GIN'),
    ('Guinea Ecuatorial', 'Equatorial Guinea', 'GNQ'), ('Guinea-Bissau', 'Guinea-Bissau', 'GNB'),
    ('Guyana', 'Guyana', 'GUY'), ('Haití', 'Haiti', 'HTI'), ('Honduras', 'Honduras', 'HND'),
    ('Hong Kong', 'Hong Kong', 'HKG'), ('Hungría', 'Hungary', 'HUN'), ('India', 'India', 'IND'),
    ('Indonesia', 'Indonesia', 'IDN'), ('Irak', 'Iraq', 'IRQ'), ('Irlanda', 'Ireland', 'IRL'),
    ('Irán', 'Iran', 'IRN'), ('Israel', 'Israel', 'ISR'), ('Italia', 'Italy', 'ITA'),
    ('Jamaica', 'Jamaica', 'JAM'), ('Japón', 'Japan', 'JPN'), ('Jordania', 'Jordan', 'JOR'),
    ('Kazajistán', 'Kazakhstan', 'KAZ'), ('Kenia', 'Kenya', 'KEN'), ('Kirguistán', 'Kyrgyzstan', 'KGZ'),
    ('Kuwait', 'Kuwait', 'KWT'), ('Laos', 'Laos', 'LAO'), ('Lesoto', 'Lesotho', 'LSO'),
    ('Liberia', 'Liberia', 'LBR'), ('Libia', 'Libya', 'LBY'), ('Lituania', 'Lithuania', 'LTU'),
    ('Luxemburgo', 'Luxembourg', 'LUX'), ('Líbano', 'Lebanon', 'LBN'), ('Macedonia', 'North Macedonia', 'MKD'),
    ('Madagascar', 'Madagascar', 'MDG'), ('Malasia', 'Malaysia', 'MYS'), ('Mali', 'Mali', 'MLI'),
    ('Marruecos', 'Morocco', 'MAR'), ('Martinica', 'Martinique', 'MTQ'), ('Mauritania', 'Mauritania', 'MRT'),
    ('Moldavia', 'Moldova', 'MDA'), ('Mongolia', 'Mongolia', 'MNG'), ('Montenegro', 'Montenegro', 'MNE'),
    ('Mozambique', 'Mozambique', 'MOZ'), ('Myanmar (Birmania)', 'Myanmar', 'MMR'), ('México', 'Mexico', 'MEX'),
    ('Namibia', 'Namibia', 'NAM'), ('Nepal', 'Nepal', 'NPL'), ('Nicaragua', 'Nicaragua', 'NIC'),
    ('Nigeria', 'Nigeria', 'NGA'), ('Noruega', 'Norway', 'NOR'), ('Nueva Zelanda', 'New Zealand', 'NZL'),
    ('Níger', 'Niger', 'NER'), ('Omán', 'Oman', 'OMN'), ('Pakistán', 'Pakistan', 'PAK'),
    ('Panamá', 'Panama', 'PAN'), ('Papúa Nueva Guinea', 'Papua New Guinea', 'PNG'), ('Paraguay', 'Paraguay', 'PRY'),
    ('Países Bajos', 'Netherlands', 'NLD'), ('Perú', 'Peru', 'PER'), ('Polonia', 'Poland', 'POL'),
    ('Portugal', 'Portugal', 'PRT'), ('Qatar', 'Qatar', 'QAT'), ('Reino Unido', 'United Kingdom', 'GBR'),
    ('República Centroafricana', 'Central African Republic', 'CAF'), ('República Checa', 'Czechia', 'CZE'),
    ('República Democrática del Congo', 'Democratic Republic of the Congo', 'COD'),
    ('República Dominicana', 'Dominican Republic', 'DOM'), ('República de Gambia', 'Gambia', 'GMB'),
    ('República del Congo', 'Republic of the Congo', 'COG'), ('Ruanda', 'Rwanda', 'RWA'),
    ('Rumania', 'Romania', 'ROU'), ('Rusia', 'Russia', 'RUS'), ('Sáhara Occidental', 'Western Sahara', 'ESH'),
    ('Senegal', 'Senegal', 'SEN'), ('Serbia', 'Serbia', 'SRB'), ('Sierra Leona', 'Sierra Leone', 'SLE'),
    ('Singapur', 'Singapore', 'SGP'), ('Siria', 'Syria', 'SYR'), ('Somalia', 'Somalia', 'SOM'),
    ('Sri Lanka', 'Sri Lanka', 'LKA'), ('Suazilandia', 'Eswatini', 'SWZ'), ('SudAfrica', 'South Africa', 'ZAF'),
    ('Sudán', 'Sudan', 'SDN'), ('Sudán del Sur', 'South Sudan', 'SSD'), ('Suecia', 'Sweden', 'SWE'),
    ('Suiza', 'Switzerland', 'CHE'), ('Surinam', 'Suriname', 'SUR'), ('Tailandia', 'Thailand', 'THA'),
    ('Taiwán', 'Taiwan', 'TWN'), ('Tanzania', 'Tanzania', 'TZA'), ('Tayikistán', 'Tajikistan', 'TJK'),
    ('Togo', 'Togo', 'TGO'), ('Trinidad y Tobago', 'Trinidad and Tobago', 'TTO'),
    ('Turkmenistán', 'Turkmenistan', 'TKM'), ('Turquía', 'Turkey', 'TUR'), ('Túnez', 'Tunisia', 'TUN'),
    ('Ucrania', 'Ukraine', 'UKR'), ('Uganda', 'Uganda', 'UGA'), ('Uruguay', 'Uruguay', 'URY'),
    ('Uzbekistán', 'Uzbekistan', 'UZB'), ('Venezuela', 'Venezuela', 'VEN'), ('Vietnam', 'Vietnam', 'VNM'),
    ('Yemen', 'Yemen', 'YEM'), ('Yibuti', 'Djibouti', 'DJI'), ('Zambia', 'Zambia', 'ZMB'),
    ('Zimbabue', 'Zimbabwe', 'ZWE')
AS t(pais_original, pais_en, pais_iso3);

-- COMMAND ----------

-- -----------------------------------------------------------------------------
-- Base por pedido (temporária): item rn = 1 do pedido +
-- receita somada + rastreio_pedidos), restrita aos despachados e com líquida, lucro e item principal
-- -----------------------------------------------------------------------------
CREATE OR REPLACE TEMP VIEW gold_base_pedidos AS
WITH valores AS (
    SELECT id_pedido,
           COUNT(*)                AS qtd_itens,
           SUM(quantidade_item)    AS qtd_unidades,
           SUM(valor_bruto_venda)  AS receita_bruta_pedido,
           SUM(valor_item_pedido)  AS receita_liquida_pedido,
           SUM(lucro_item)         AS lucro_pedido
    FROM gold_base_itens
    GROUP BY id_pedido
),
principal AS (
    SELECT id_pedido, categoria_produto AS categoria_principal, departamento AS departamento_principal
    FROM gold_base_itens WHERE rn_principal = 1
),
SELECT
    i.* EXCEPT (destino_pais, destino_estado, destino_cidade, destino_regiao, modo_envio),
    i.modo_envio                             AS classe_servico,
    COALESCE(tme.valor_pt, i.modo_envio)     AS modo_envio,
    COALESCE(tp.valor_pt,  i.destino_pais)   AS destino_pais,
    COALESCE(te.valor_pt,  i.destino_estado) AS destino_estado,
    COALESCE(tci.valor_pt, i.destino_cidade) AS destino_cidade,
    COALESCE(tr.valor_pt,  i.destino_regiao) AS destino_regiao,
    v.qtd_itens, v.qtd_unidades, v.receita_bruta_pedido, v.receita_liquida_pedido, v.lucro_pedido,
    pr.categoria_principal, pr.departamento_principal,
    pm.pais_en             AS destino_pais_en,
    pm.pais_iso3           AS destino_pais_iso3,
    r.situacao_pedido      AS situacao_pedido_rastreio,
    r.situacao_entrega, r.modal_transporte, r.transito_padrao_dias, r.transito_real_dias,
    r.dias_recuperados_transporte, r.resultado_transporte, r.data_entrega_prevista,
    r.data_entrega_realizada, r.dias_atraso_entrega AS dias_atraso_entrega_silver,
    r.etapa_extravio, r.dado_simulado
FROM gold_base_itens i
JOIN valores v USING (id_pedido)
JOIN principal pr USING (id_pedido)
LEFT JOIN silver.rastreio_pedidos r USING (id_pedido)
LEFT JOIN silver.dim_traducao tp  ON tp.coluna  = 'destino_pais'   AND tp.valor_original  = i.destino_pais
LEFT JOIN silver.dim_traducao te  ON te.coluna  = 'destino_estado' AND te.valor_original  = i.destino_estado
                                 AND te.contexto = i.destino_pais
LEFT JOIN silver.dim_traducao tci ON tci.coluna = 'destino_cidade' AND tci.valor_original = i.destino_cidade
                                 AND tci.contexto = i.destino_pais
LEFT JOIN silver.dim_traducao tr  ON tr.coluna  = 'destino_regiao' AND tr.valor_original  = i.destino_regiao
LEFT JOIN silver.dim_traducao tme ON tme.coluna = 'modo_envio'     AND tme.valor_original = i.modo_envio
LEFT JOIN gold_pais_mapa pm ON pm.pais_original = i.destino_pais
WHERE i.rn_base = 1;

-- COMMAND ----------

-- -----------------------------------------------------------------------------
-- OBT 1: gold.obt_pedidos_logistica (1 linha por pedido despachado)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE TABLE gold.obt_pedidos_logistica
COMMENT 'Gold OBT (grão PEDIDO despachado, chave id_pedido). Despacho: dado real · Entrega/extravio: cenário simulado (60/20/20). Medidas fl_* 0/1: % = SUM/SUM. % de despacho: base = todas as linhas; % de entrega: base = fl_com_desfecho = 1.'
AS
WITH b AS (
    SELECT *,
           CASE classe_servico WHEN 'First Class' THEN 2 WHEN 'Second Class' THEN 4
                               WHEN 'Same Day' THEN 1 WHEN 'Standard Class' THEN 4 END AS prazo_sugerido,
           situacao_entrega IN ('Entregue com atraso', 'Extraviado')                    AS em_risco,
           situacao_entrega = 'Extraviado'                                              AS extraviado
    FROM gold_base_pedidos
)
SELECT
    -- Chaves (sem PII)
    id_pedido,
    id_cliente,
    -- Tempo
    CAST(data_pedido AS DATE)                                                   AS data_pedido,
    CAST(DATE_TRUNC('month', data_pedido) AS DATE)                              AS mes_pedido,
    YEAR(data_pedido)                                                           AS ano,
    QUARTER(data_pedido)                                                        AS trimestre,
    MONTH(data_pedido)                                                          AS mes_num,
    data_despacho_real,
    CAST(data_referencia_base AS DATE)                                          AS data_referencia_base,
    CASE WHEN data_pedido >= DATE'2018-01-01' OR situacao_entrega = 'Em trânsito' THEN 1 ELSE 0 END
                                                                                AS fl_periodo_parcial,
    -- Cliente e produto
    segmento_cliente,
    qtd_itens,
    qtd_unidades,
    categoria_principal,
    departamento_principal,
    -- Serviço e rota
    classe_servico,
    modo_envio,
    dias_envio_programado                                                       AS prazo_despacho_prometido,
    prazo_sugerido                                                              AS prazo_despacho_sugerido,
    modal_transporte,
    tipo_rota,
    mercado_logistico,
    destino_regiao,
    destino_pais,
    destino_pais_en,
    destino_pais_iso3,
    destino_estado,
    destino_cidade,
    -- Situação em D
    COALESCE(situacao_entrega, situacao_pedido_rastreio)                        AS situacao_pedido,
    CASE WHEN situacao_entrega IN ('Entregue no prazo', 'Entregue com atraso', 'Extraviado') THEN 1 ELSE 0 END
                                                                                AS fl_com_desfecho,
    CASE WHEN situacao_entrega = 'Em trânsito' THEN 1 ELSE 0 END                AS fl_em_transito,
    -- Despacho (DADO REAL)
    dias_envio_real                                                             AS dias_ate_despacho,
    flag_atraso_despacho                                                        AS fl_despacho_atrasado,
    CASE WHEN flag_atraso_despacho = 1 THEN dias_atraso_despacho END            AS dias_atraso_despacho,
    status_prazo_despacho,
    causa_atraso_despacho,
    CASE WHEN dias_envio_real > prazo_sugerido THEN 1 ELSE 0 END                AS fl_despacho_atrasado_prazo_sugerido,
    CASE WHEN dias_envio_real > 4 THEN 1 ELSE 0 END                             AS fl_despacho_acima_4_dias,
    -- Transporte e entrega (CENÁRIO SIMULADO)
    transito_padrao_dias,
    transito_real_dias,
    dias_recuperados_transporte,
    resultado_transporte,
    data_entrega_prevista,
    data_entrega_realizada,
    CASE WHEN situacao_entrega = 'Entregue no prazo' THEN 1 ELSE 0 END          AS fl_entregue_no_prazo,
    CASE WHEN situacao_entrega = 'Entregue com atraso' THEN 1 ELSE 0 END        AS fl_entregue_atrasado,
    CASE WHEN extraviado THEN 1 ELSE 0 END                                      AS fl_extraviado,
    CASE WHEN flag_atraso_despacho = 1 AND situacao_entrega LIKE 'Entregue%' THEN 1 ELSE 0 END
                                                                                AS fl_despacho_atrasado_entregue,
    CASE WHEN resultado_transporte = 'Recuperou o atraso do despacho' THEN 1 ELSE 0 END
                                                                                AS fl_recuperou_atraso,
    -- dias de atraso da entrega = realizada - prevista, só em "Entregue com atraso" (1 a 4)
    CASE WHEN situacao_entrega = 'Entregue com atraso' THEN dias_atraso_entrega_silver END
                                                                                AS dias_atraso_entrega,
    -- realizada - prevista em todo pedido entregue (negativo = adiantado)
    CASE WHEN situacao_entrega LIKE 'Entregue%' THEN dias_atraso_entrega_silver END
                                                                                AS dias_diferenca_entrega,
    -- em trânsito: atraso acumulado até D (parcial, fora dos KPIs)
    CASE WHEN situacao_entrega = 'Em trânsito' THEN dias_atraso_entrega_silver END
                                                                                AS dias_atraso_ate_d,
    etapa_extravio,
    CAST(LEFT(etapa_extravio, 1) AS INT)                                        AS etapa_extravio_num,
    -- Valor (real; "em risco" = entrega atrasada ou extraviada, desfecho simulado)
    receita_bruta_pedido,
    receita_liquida_pedido,
    lucro_pedido,
    CASE WHEN em_risco   THEN receita_bruta_pedido   ELSE 0 END                 AS receita_bruta_em_risco,
    CASE WHEN em_risco   THEN receita_liquida_pedido ELSE 0 END                 AS receita_liquida_em_risco,
    CASE WHEN em_risco   THEN lucro_pedido           ELSE 0 END                 AS lucro_em_risco,
    CASE WHEN extraviado THEN receita_bruta_pedido   ELSE 0 END                 AS receita_bruta_extraviada,
    CASE WHEN extraviado THEN receita_liquida_pedido ELSE 0 END                 AS receita_liquida_extraviada,
    CASE WHEN extraviado THEN lucro_pedido           ELSE 0 END                 AS lucro_extraviado,
    -- Rótulo da origem do dado
    -- Despacho vem do DataCo (pedidos_rastreio); a origem da entrega vem de rastreio_pedidos.dado_simulado.
    -- Quando a entrega passar a ser ingerida (fila), dado_simulado = false e o rótulo muda sozinho.
    'real'                                                                      AS origem_dado_despacho,
    CASE WHEN dado_simulado THEN 'simulado'
         WHEN situacao_entrega IS NULL THEN 'sem_dado'
         ELSE 'real' END                                                        AS origem_dado_entrega,
    CONCAT('Despacho: dado real · Entrega/extravio: ',
           CASE WHEN dado_simulado THEN 'cenário simulado'
                WHEN situacao_entrega IS NULL THEN 'sem dado'
                ELSE 'dado real' END)                                           AS rotulo_fonte,
    current_timestamp()                                                         AS dt_processamento_gold
FROM b;

-- COMMAND ----------

-- Comentários de coluna: prefixo 'DADO REAL.' ou 'CENÁRIO SIMULADO.' (conferido no 03d)
-- Despacho (dado real)
ALTER TABLE gold.obt_pedidos_logistica ALTER COLUMN dias_ate_despacho COMMENT 'DADO REAL. Dias do pedido até o despacho';
ALTER TABLE gold.obt_pedidos_logistica ALTER COLUMN fl_despacho_atrasado COMMENT 'DADO REAL. 1 = despacho depois do prazo prometido. % = SUM / COUNT (todos os despachados)';
ALTER TABLE gold.obt_pedidos_logistica ALTER COLUMN dias_atraso_despacho COMMENT 'DADO REAL. Dias reais - prometidos, só em despacho atrasado (AVG direto = atraso médio)';
ALTER TABLE gold.obt_pedidos_logistica ALTER COLUMN causa_atraso_despacho COMMENT 'DADO REAL. Promessa irreal / Atraso operacional (só despachos atrasados)';
ALTER TABLE gold.obt_pedidos_logistica ALTER COLUMN fl_despacho_atrasado_prazo_sugerido COMMENT 'DADO REAL com regra S1 (First 2, Second 4, Same Day 1, Standard 4): atraso se o prazo fosse honesto';
ALTER TABLE gold.obt_pedidos_logistica ALTER COLUMN fl_despacho_acima_4_dias COMMENT 'DADO REAL. Meta S2: 1 = despacho em 5 ou 6 dias';
-- Transporte e entrega (cenário simulado)
ALTER TABLE gold.obt_pedidos_logistica ALTER COLUMN situacao_pedido COMMENT 'CENÁRIO SIMULADO. Entregue no prazo / Entregue com atraso / Extraviado / Em trânsito (desfecho depois de D)';
ALTER TABLE gold.obt_pedidos_logistica ALTER COLUMN fl_com_desfecho COMMENT 'CENÁRIO SIMULADO. Denominador dos % de entrega (exclui Em trânsito)';
ALTER TABLE gold.obt_pedidos_logistica ALTER COLUMN fl_em_transito COMMENT 'CENÁRIO SIMULADO. 1 = sem desfecho em D (fora da base dos % de entrega)';
ALTER TABLE gold.obt_pedidos_logistica ALTER COLUMN modal_transporte COMMENT 'CENÁRIO SIMULADO. Modal atribuído por regra fixa (modo de envio e rota)';
ALTER TABLE gold.obt_pedidos_logistica ALTER COLUMN transito_padrao_dias COMMENT 'CENÁRIO SIMULADO. Parâmetro: trânsito padrão T por rota e modal';
ALTER TABLE gold.obt_pedidos_logistica ALTER COLUMN transito_real_dias COMMENT 'CENÁRIO SIMULADO. Trânsito do despacho até a entrega';
ALTER TABLE gold.obt_pedidos_logistica ALTER COLUMN dias_recuperados_transporte COMMENT 'CENÁRIO SIMULADO. Dias de atraso do despacho absorvidos pelo transporte';
ALTER TABLE gold.obt_pedidos_logistica ALTER COLUMN resultado_transporte COMMENT 'CENÁRIO SIMULADO. No prazo / Recuperou o atraso do despacho / Não recuperou o atraso do despacho / Extraviado / Em trânsito';
ALTER TABLE gold.obt_pedidos_logistica ALTER COLUMN data_entrega_prevista COMMENT 'CENÁRIO SIMULADO. Pedido + prazo de despacho + T';
ALTER TABLE gold.obt_pedidos_logistica ALTER COLUMN data_entrega_realizada COMMENT 'CENÁRIO SIMULADO. Despacho real + trânsito real (NULL em extraviado e em trânsito)';
ALTER TABLE gold.obt_pedidos_logistica ALTER COLUMN fl_entregue_no_prazo COMMENT 'CENÁRIO SIMULADO. % = SUM / SUM(fl_com_desfecho)';
ALTER TABLE gold.obt_pedidos_logistica ALTER COLUMN fl_entregue_atrasado COMMENT 'CENÁRIO SIMULADO. % = SUM / SUM(fl_com_desfecho)';
ALTER TABLE gold.obt_pedidos_logistica ALTER COLUMN fl_extraviado COMMENT 'CENÁRIO SIMULADO. % = SUM / SUM(fl_com_desfecho)';
ALTER TABLE gold.obt_pedidos_logistica ALTER COLUMN fl_despacho_atrasado_entregue COMMENT 'CENÁRIO SIMULADO. Despacho atrasado (real) e entregue (simulado): denominador da recuperação';
ALTER TABLE gold.obt_pedidos_logistica ALTER COLUMN fl_recuperou_atraso COMMENT 'CENÁRIO SIMULADO. % recuperado = SUM(fl_recuperou_atraso) / SUM(fl_despacho_atrasado_entregue)';
ALTER TABLE gold.obt_pedidos_logistica ALTER COLUMN dias_atraso_entrega COMMENT 'CENÁRIO SIMULADO. Realizada - prevista, só em Entregue com atraso (AVG direto = atraso médio)';
ALTER TABLE gold.obt_pedidos_logistica ALTER COLUMN dias_diferenca_entrega COMMENT 'CENÁRIO SIMULADO. Realizada - prevista em todo entregue (negativo = adiantado)';
ALTER TABLE gold.obt_pedidos_logistica ALTER COLUMN dias_atraso_ate_d COMMENT 'CENÁRIO SIMULADO. Atraso acumulado até D dos pedidos em trânsito (parcial, fora dos KPIs)';
ALTER TABLE gold.obt_pedidos_logistica ALTER COLUMN etapa_extravio COMMENT 'CENÁRIO SIMULADO. Etapa em que o volume se perdeu';
ALTER TABLE gold.obt_pedidos_logistica ALTER COLUMN etapa_extravio_num COMMENT 'CENÁRIO SIMULADO. Número da etapa do extravio (1 a 5)';
-- Valor: real; em risco / extraviado depende do desfecho simulado
ALTER TABLE gold.obt_pedidos_logistica ALTER COLUMN receita_bruta_pedido COMMENT 'DADO REAL. SUM(valor_bruto_venda) dos itens';
ALTER TABLE gold.obt_pedidos_logistica ALTER COLUMN receita_liquida_pedido COMMENT 'DADO REAL. SUM(valor_item_pedido) dos itens (após desconto)';
ALTER TABLE gold.obt_pedidos_logistica ALTER COLUMN lucro_pedido COMMENT 'DADO REAL. SUM(lucro_item) dos itens';
ALTER TABLE gold.obt_pedidos_logistica ALTER COLUMN receita_bruta_em_risco COMMENT 'CENÁRIO SIMULADO sobre valor real. Receita bruta se entrega atrasada ou extraviada; 0 nos demais';
ALTER TABLE gold.obt_pedidos_logistica ALTER COLUMN receita_liquida_em_risco COMMENT 'CENÁRIO SIMULADO sobre valor real. Receita líquida se entrega atrasada ou extraviada; 0 nos demais';
ALTER TABLE gold.obt_pedidos_logistica ALTER COLUMN lucro_em_risco COMMENT 'CENÁRIO SIMULADO sobre valor real. Lucro se entrega atrasada ou extraviada; 0 nos demais';
ALTER TABLE gold.obt_pedidos_logistica ALTER COLUMN receita_bruta_extraviada COMMENT 'CENÁRIO SIMULADO sobre valor real. Receita bruta se extraviado; 0 nos demais';
ALTER TABLE gold.obt_pedidos_logistica ALTER COLUMN receita_liquida_extraviada COMMENT 'CENÁRIO SIMULADO sobre valor real. Receita líquida se extraviado; 0 nos demais';
ALTER TABLE gold.obt_pedidos_logistica ALTER COLUMN lucro_extraviado COMMENT 'CENÁRIO SIMULADO sobre valor real. Lucro se extraviado; 0 nos demais';
-- Outros
ALTER TABLE gold.obt_pedidos_logistica ALTER COLUMN fl_periodo_parcial COMMENT '1 = pedido de jan/2018 ou em trânsito: % censurados em D, marcar como parcial';
ALTER TABLE gold.obt_pedidos_logistica ALTER COLUMN destino_pais COMMENT 'País de destino em pt-BR (para mapa use destino_pais_iso3 ou destino_pais_en)';
ALTER TABLE gold.obt_pedidos_logistica ALTER COLUMN destino_pais_en COMMENT 'País em inglês (para mapa)';
ALTER TABLE gold.obt_pedidos_logistica ALTER COLUMN destino_pais_iso3 COMMENT 'Código ISO 3166-1 alfa-3 do país (para mapa)';
ALTER TABLE gold.obt_pedidos_logistica ALTER COLUMN classe_servico COMMENT 'DADO REAL. Classe de serviço contratada (modo_envio original: Same Day, First Class, Second Class, Standard Class)';
ALTER TABLE gold.obt_pedidos_logistica ALTER COLUMN origem_dado_entrega COMMENT 'Derivado de silver.rastreio_pedidos.dado_simulado: simulado (hoje), sem_dado (sem rastreio de entrega) ou real (quando a entrega for ingerida)';

-- COMMAND ----------

-- -----------------------------------------------------------------------------
-- OBT 2: gold.obt_itens_risco (1 linha por item de pedido despachado)
-- Serve para VALOR por departamento/categoria/produto, não para taxa (taxas são planas por item).
-- Contar pedidos aqui sempre com COUNT(DISTINCT id_pedido).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE TABLE gold.obt_itens_risco
COMMENT 'Gold OBT (grão ITEM de pedido despachado, chave id_item_pedido). Valor por departamento/categoria/produto: receita bruta, líquida e lucro, total e em risco. Para VALOR, não para taxa; pedidos = COUNT(DISTINCT id_pedido). Valores reais · risco/extravio: cenário simulado.'
AS
SELECT
    -- Chaves
    i.id_item_pedido,
    i.id_pedido,
    i.id_produto,
    -- Produto
    i.departamento,
    i.categoria_produto,
    i.nome_produto,
    i.quantidade_item,
    i.preco_unitario,
    -- Valor do item (real)
    i.valor_bruto_venda                                                         AS receita_bruta_item,
    i.valor_desconto                                                            AS desconto_item,
    i.valor_item_pedido                                                         AS receita_liquida_item,
    i.lucro_item,
    -- Risco (desfecho simulado sobre valor real)
    CASE WHEN o.fl_entregue_atrasado = 1 OR o.fl_extraviado = 1 THEN i.valor_bruto_venda ELSE 0 END AS receita_bruta_em_risco,
    CASE WHEN o.fl_entregue_atrasado = 1 OR o.fl_extraviado = 1 THEN i.valor_item_pedido ELSE 0 END AS receita_liquida_em_risco,
    CASE WHEN o.fl_entregue_atrasado = 1 OR o.fl_extraviado = 1 THEN i.lucro_item        ELSE 0 END AS lucro_em_risco,
    CASE WHEN o.fl_extraviado = 1 THEN i.valor_bruto_venda ELSE 0 END           AS receita_bruta_extraviada,
    CASE WHEN o.fl_extraviado = 1 THEN i.valor_item_pedido ELSE 0 END           AS receita_liquida_extraviada,
    CASE WHEN o.fl_extraviado = 1 THEN i.lucro_item        ELSE 0 END           AS lucro_extraviado,
    -- Contexto do pedido (da OBT 1, 1 linha por pedido: o join não duplica)
    o.situacao_pedido,
    o.fl_com_desfecho,
    o.fl_em_transito,
    o.fl_entregue_no_prazo,
    o.fl_entregue_atrasado,
    o.fl_extraviado,
    o.fl_despacho_atrasado,
    o.causa_atraso_despacho,
    o.etapa_extravio,
    o.classe_servico,
    o.modo_envio,
    o.modal_transporte,
    o.tipo_rota,
    o.mercado_logistico,
    o.destino_regiao,
    o.destino_pais,
    o.destino_pais_en,
    o.destino_pais_iso3,
    o.segmento_cliente,
    o.data_pedido,
    o.mes_pedido,
    o.ano,
    o.fl_periodo_parcial,
    -- Rótulo
    o.origem_dado_despacho,
    o.origem_dado_entrega,
    CONCAT('Valores: dado real · Em risco/extraviado: ',
           CASE WHEN o.origem_dado_entrega = 'simulado' THEN 'cenário simulado'
                WHEN o.origem_dado_entrega = 'sem_dado' THEN 'sem dado'
                ELSE 'dado real' END) AS rotulo_fonte,
    current_timestamp()                                                         AS dt_processamento_gold
FROM gold_base_itens i
JOIN gold.obt_pedidos_logistica o USING (id_pedido);

-- COMMAND ----------

ALTER TABLE gold.obt_itens_risco ALTER COLUMN receita_bruta_item COMMENT 'DADO REAL. valor_bruto_venda do item';
ALTER TABLE gold.obt_itens_risco ALTER COLUMN desconto_item COMMENT 'DADO REAL. valor_desconto do item';
ALTER TABLE gold.obt_itens_risco ALTER COLUMN receita_liquida_item COMMENT 'DADO REAL. valor_item_pedido (bruta - desconto)';
ALTER TABLE gold.obt_itens_risco ALTER COLUMN lucro_item COMMENT 'DADO REAL. lucro_item';
ALTER TABLE gold.obt_itens_risco ALTER COLUMN receita_bruta_em_risco COMMENT 'CENÁRIO SIMULADO sobre valor real. Receita bruta do item se o pedido teve entrega atrasada ou extraviada';
ALTER TABLE gold.obt_itens_risco ALTER COLUMN receita_liquida_em_risco COMMENT 'CENÁRIO SIMULADO sobre valor real. Receita líquida do item se o pedido teve entrega atrasada ou extraviada';
ALTER TABLE gold.obt_itens_risco ALTER COLUMN lucro_em_risco COMMENT 'CENÁRIO SIMULADO sobre valor real. Lucro do item se o pedido teve entrega atrasada ou extraviada';
ALTER TABLE gold.obt_itens_risco ALTER COLUMN receita_bruta_extraviada COMMENT 'CENÁRIO SIMULADO sobre valor real. Receita bruta do item se o pedido foi extraviado';
ALTER TABLE gold.obt_itens_risco ALTER COLUMN receita_liquida_extraviada COMMENT 'CENÁRIO SIMULADO sobre valor real. Receita líquida do item se o pedido foi extraviado';
ALTER TABLE gold.obt_itens_risco ALTER COLUMN lucro_extraviado COMMENT 'CENÁRIO SIMULADO sobre valor real. Lucro do item se o pedido foi extraviado';
ALTER TABLE gold.obt_itens_risco ALTER COLUMN situacao_pedido COMMENT 'CENÁRIO SIMULADO. Situação do pedido em D (repetida em cada item: contar pedidos com COUNT(DISTINCT id_pedido))';
ALTER TABLE gold.obt_itens_risco ALTER COLUMN fl_com_desfecho COMMENT 'CENÁRIO SIMULADO. Do pedido, repetido por item: não usar para taxa';
ALTER TABLE gold.obt_itens_risco ALTER COLUMN fl_em_transito COMMENT 'CENÁRIO SIMULADO. Do pedido, repetido por item: não usar para taxa';
ALTER TABLE gold.obt_itens_risco ALTER COLUMN fl_entregue_no_prazo COMMENT 'CENÁRIO SIMULADO. Do pedido, repetido por item: não usar para taxa';
ALTER TABLE gold.obt_itens_risco ALTER COLUMN fl_entregue_atrasado COMMENT 'CENÁRIO SIMULADO. Do pedido, repetido por item: não usar para taxa';
ALTER TABLE gold.obt_itens_risco ALTER COLUMN fl_extraviado COMMENT 'CENÁRIO SIMULADO. Do pedido, repetido por item: não usar para taxa';
ALTER TABLE gold.obt_itens_risco ALTER COLUMN etapa_extravio COMMENT 'CENÁRIO SIMULADO. Etapa em que o volume se perdeu';
ALTER TABLE gold.obt_itens_risco ALTER COLUMN modal_transporte COMMENT 'CENÁRIO SIMULADO. Modal atribuído por regra fixa';
ALTER TABLE gold.obt_itens_risco ALTER COLUMN fl_despacho_atrasado COMMENT 'DADO REAL. Do pedido, repetido por item: não usar para taxa';
ALTER TABLE gold.obt_itens_risco ALTER COLUMN causa_atraso_despacho COMMENT 'DADO REAL. Promessa irreal / Atraso operacional';
ALTER TABLE gold.obt_itens_risco ALTER COLUMN destino_pais COMMENT 'País de destino em pt-BR (para mapa use destino_pais_iso3 ou destino_pais_en)';
ALTER TABLE gold.obt_itens_risco ALTER COLUMN destino_pais_iso3 COMMENT 'Código ISO 3166-1 alfa-3 do país (para mapa)';

-- COMMAND ----------

-- -----------------------------------------------------------------------------
-- OBT 3: gold.obt_eventos_etapas (1 linha por pedido despachado x etapa percorrida)
-- entrada = 1º evento da etapa; saída = entrada da próxima etapa percorrida; na última etapa,
-- o ENTREGUE ou o EXTRAVIO_CONFIRMADO; em trânsito, NULL.
-- horas_na_etapa é NULL na etapa do extravio (o intervalo até a confirmação em T+5 não é trânsito).
-- Etapa 0 (PEDIDO_CRIADO até o despacho) = dado real. O PEDIDO_DESPACHADO pertence à etapa 1:
-- a entrada da etapa 1 é o despacho real, mas a duração dela (despacho -> gateway) é simulada,
-- por isso a etapa 1 é rotulada 'simulado'. Etapas 2 a 5 = cenário simulado.
-- Receita: receita_bruta_pedido se repete em cada etapa (NÃO somar direto); para valor extraviado
-- por etapa use receita_bruta_extraviada_nesta_etapa, que só é > 0 na etapa do extravio.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE TABLE gold.obt_eventos_etapas
COMMENT 'Gold OBT (grão PEDIDO despachado x ETAPA, chave id_pedido + etapa_num). Jornada, extravio e horas por etapa. Etapa 0 (pedido até despacho) = dado real; etapas 1-5 = cenário simulado (duração é parâmetro da simulação).'
AS
WITH ev AS (
    SELECT e.*
    FROM silver.consumo_eventos_logisticos e
    JOIN gold.obt_pedidos_logistica o USING (id_pedido)
),
etapa AS (
    SELECT
        id_pedido,
        etapa                                                                   AS etapa_num,
        MIN(etapa_desc)                                                         AS etapa_desc,
        COUNT(*)                                                                AS qtd_eventos,
        MIN_BY(codigo_evento, sequencia)                                        AS primeiro_codigo_evento,
        MAX_BY(codigo_evento, sequencia)                                        AS ultimo_codigo_evento,
        MIN(ts_evento)                                                          AS entrada_etapa,
        MAX(ts_evento)                                                          AS ultimo_ts_etapa,
        MIN_BY(id_hub, sequencia)                                               AS id_hub,
        MIN_BY(local_evento, sequencia)                                         AS local_evento,
        MAX(CASE WHEN codigo_evento = 'EXTRAVIO_CONFIRMADO' THEN 1 ELSE 0 END)  AS fl_extravio_nesta_etapa,
        MAX(CASE WHEN codigo_evento = 'ENTREGUE' THEN 1 ELSE 0 END)             AS fl_entrega_nesta_etapa
    FROM ev
    GROUP BY id_pedido, etapa
),
seq AS (
    SELECT *, LEAD(entrada_etapa) OVER (PARTITION BY id_pedido ORDER BY etapa_num) AS entrada_proxima
    FROM etapa
),
calc AS (
    SELECT *,
           CASE WHEN entrada_proxima IS NOT NULL THEN entrada_proxima
                WHEN fl_extravio_nesta_etapa = 1 OR fl_entrega_nesta_etapa = 1 THEN ultimo_ts_etapa
           END                                                                  AS saida_etapa
    FROM seq
)
SELECT
    c.id_pedido,
    c.etapa_num,
    c.etapa_desc,
    c.qtd_eventos,
    c.primeiro_codigo_evento,
    c.ultimo_codigo_evento,
    c.entrada_etapa,
    c.saida_etapa,
    CASE WHEN c.fl_extravio_nesta_etapa = 0 AND c.saida_etapa IS NOT NULL
         THEN ROUND((UNIX_TIMESTAMP(c.saida_etapa) - UNIX_TIMESTAMP(c.entrada_etapa)) / 3600.0, 2)
    END                                                                         AS horas_na_etapa,
    CASE WHEN c.entrada_proxima IS NOT NULL OR c.fl_entrega_nesta_etapa = 1 THEN 1 ELSE 0 END
                                                                                AS fl_etapa_concluida,
    c.fl_extravio_nesta_etapa,
    CASE WHEN o.fl_em_transito = 1 AND c.entrada_proxima IS NULL THEN 1 ELSE 0 END
                                                                                AS fl_etapa_atual,
    c.id_hub,
    c.local_evento,
    CASE WHEN c.etapa_num = 0 THEN 'real' ELSE o.origem_dado_entrega END        AS origem_dado,
    -- Dimensões do pedido (OBT 1)
    o.situacao_pedido,
    o.fl_com_desfecho,
    o.fl_extraviado,
    o.fl_despacho_atrasado,
    o.classe_servico,
    o.modo_envio,
    o.modal_transporte,
    o.tipo_rota,
    o.mercado_logistico,
    o.destino_regiao,
    o.destino_pais,
    o.destino_pais_en,
    o.destino_pais_iso3,
    o.mes_pedido,
    o.ano,
    o.fl_periodo_parcial,
    o.receita_bruta_pedido,
    CASE WHEN c.fl_extravio_nesta_etapa = 1 THEN o.receita_bruta_pedido   ELSE 0 END AS receita_bruta_extraviada_nesta_etapa,
    CASE WHEN c.fl_extravio_nesta_etapa = 1 THEN o.receita_liquida_pedido ELSE 0 END AS receita_liquida_extraviada_nesta_etapa,
    CASE WHEN c.fl_extravio_nesta_etapa = 1 THEN o.lucro_pedido           ELSE 0 END AS lucro_extraviado_nesta_etapa,
    CONCAT('Etapa 0: dado real · Etapas 1-5: ',
           CASE WHEN o.origem_dado_entrega = 'simulado' THEN 'cenário simulado'
                WHEN o.origem_dado_entrega = 'sem_dado' THEN 'sem dado'
                ELSE 'dado real' END) AS rotulo_fonte,
    current_timestamp()                                                         AS dt_processamento_gold
FROM calc c
JOIN gold.obt_pedidos_logistica o USING (id_pedido);

-- COMMAND ----------

ALTER TABLE gold.obt_eventos_etapas ALTER COLUMN origem_dado COMMENT 'real = etapa 0 (pedido até despacho, DataCo); etapas 1-5 herdam origem_dado_entrega do pedido (hoje simulado; a etapa 1 começa no despacho real, mas a duração é simulada)';
ALTER TABLE gold.obt_eventos_etapas ALTER COLUMN entrada_etapa COMMENT 'Primeiro evento da etapa. Etapa 0 e etapa 1: datas reais (pedido e despacho); etapas 2-5: CENÁRIO SIMULADO';
ALTER TABLE gold.obt_eventos_etapas ALTER COLUMN saida_etapa COMMENT 'CENÁRIO SIMULADO (exceto etapa 0, que sai no despacho real). Entrada da próxima etapa; na última, ENTREGUE ou EXTRAVIO; em trânsito, NULL';
ALTER TABLE gold.obt_eventos_etapas ALTER COLUMN horas_na_etapa COMMENT 'CENÁRIO SIMULADO (exceto etapa 0 = real). Permanência até a próxima etapa (inclui espera). NULL na etapa do extravio e na etapa atual de quem está em trânsito';
ALTER TABLE gold.obt_eventos_etapas ALTER COLUMN fl_extravio_nesta_etapa COMMENT 'CENÁRIO SIMULADO. 1 = o volume se perdeu nesta etapa (exatamente 1 por pedido extraviado)';
ALTER TABLE gold.obt_eventos_etapas ALTER COLUMN fl_etapa_atual COMMENT 'CENÁRIO SIMULADO. 1 = etapa em que o pedido em trânsito está em D';
ALTER TABLE gold.obt_eventos_etapas ALTER COLUMN receita_bruta_pedido COMMENT 'DADO REAL, repetido em cada etapa do pedido: NÃO somar direto (use a OBT de pedidos ou MAX por pedido)';
ALTER TABLE gold.obt_eventos_etapas ALTER COLUMN receita_bruta_extraviada_nesta_etapa COMMENT 'CENÁRIO SIMULADO sobre valor real. Receita bruta do pedido só na etapa do extravio; soma direto';
ALTER TABLE gold.obt_eventos_etapas ALTER COLUMN receita_liquida_extraviada_nesta_etapa COMMENT 'CENÁRIO SIMULADO sobre valor real. Receita líquida do pedido só na etapa do extravio; soma direto';
ALTER TABLE gold.obt_eventos_etapas ALTER COLUMN lucro_extraviado_nesta_etapa COMMENT 'CENÁRIO SIMULADO sobre valor real. Lucro do pedido só na etapa do extravio; soma direto';
ALTER TABLE gold.obt_eventos_etapas ALTER COLUMN destino_pais_iso3 COMMENT 'Código ISO 3166-1 alfa-3 do país (para mapa)';

-- COMMAND ----------

-- -----------------------------------------------------------------------------
-- CENÁRIOS DE PRAZO (parametrizados)
-- gold.param_cenario_prazo: prazo de despacho por classe de serviço em cada cenário ALTERNATIVO.
--   É dado, não código: para mudar um prazo ou criar um cenário, altere/insira linhas na tabela.
--   O notebook só cria a tabela e insere as linhas que faltam (não sobrescreve edições manuais).
--   "Promessa atual" não está aqui: vem do prazo prometido de cada pedido.
-- Seed "Promessa ajustada" = o que a operação já cumpre hoje: First Class despacha sempre em 2 dias,
--   Same Day em 0 ou 1; Second Class vai a 4 (igual à Standard, que já promete 4).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gold.param_cenario_prazo (
    cenario              STRING  NOT NULL COMMENT 'Nome do cenário exibido no dashboard',
    ordem_cenario        INT     NOT NULL COMMENT 'Ordem de exibição (1 = Promessa atual, reservado)',
    classe_servico       STRING  NOT NULL COMMENT 'Classe de serviço (modo_envio original)',
    prazo_despacho_dias  INT     NOT NULL COMMENT 'Prazo de despacho (dias) prometido neste cenário',
    criterio             STRING           COMMENT 'Por que este prazo',
    ativo                BOOLEAN NOT NULL COMMENT 'Só cenários ativos entram na view',
    dt_atualizacao       TIMESTAMP        COMMENT 'Última alteração'
)
COMMENT 'Gold: parâmetros dos cenários de prazo (editável). Lida por gold.vw_cenarios_prazo.';

-- COMMAND ----------

MERGE INTO gold.param_cenario_prazo t
USING (
    SELECT * FROM VALUES
        ('Promessa ajustada', 2, 'First Class',    2, 'Despacho real é sempre 2 dias'),
        ('Promessa ajustada', 2, 'Same Day',       1, 'Despacho real é 0 ou 1 dia'),
        ('Promessa ajustada', 2, 'Second Class',   4, 'Despacho real de 2 a 6 dias; alinhado à Standard'),
        ('Promessa ajustada', 2, 'Standard Class', 4, 'Mantém o prazo atual')
    AS v(cenario, ordem_cenario, classe_servico, prazo_despacho_dias, criterio)
) s
ON t.cenario = s.cenario AND t.classe_servico = s.classe_servico
WHEN NOT MATCHED THEN INSERT (cenario, ordem_cenario, classe_servico, prazo_despacho_dias, criterio, ativo, dt_atualizacao)
VALUES (s.cenario, s.ordem_cenario, s.classe_servico, s.prazo_despacho_dias, s.criterio, TRUE, current_timestamp());

-- COMMAND ----------

-- -----------------------------------------------------------------------------
-- gold.vw_cenarios_prazo: 1 linha por PEDIDO x CENÁRIO (Promessa atual + cenários ativos).
-- VIEW: recalcula na consulta, então pedidos novos na OBT entram sozinhos nos cenários.
-- Só muda a RÉGUA (prazo prometido); datas reais de despacho e de entrega são as mesmas:
--   despacho atrasado = dias até despachar > prazo do cenário                     (dado real)
--   entrega atrasada  = (realizada - prevista) - (prazo do cenário - prometido) > 0 (cenário simulado)
--   extravio e em trânsito não dependem do prazo (iguais em todos os cenários)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW gold.vw_cenarios_prazo
COMMENT 'Gold: pedido x cenário de prazo (Promessa atual + cenários ativos de gold.param_cenario_prazo). Despacho: dado real · Entrega/extravio: cenário simulado. Filtrar por cenario; % = SUM/SUM.'
AS
WITH cen AS (
    SELECT o.id_pedido, 'Promessa atual' AS cenario, 1 AS ordem_cenario,
           o.prazo_despacho_prometido AS prazo_despacho_cenario
    FROM gold.obt_pedidos_logistica o
    UNION ALL
    SELECT o.id_pedido, p.cenario, p.ordem_cenario, p.prazo_despacho_dias
    FROM gold.obt_pedidos_logistica o
    JOIN gold.param_cenario_prazo p ON p.ativo AND p.classe_servico = o.classe_servico
),
b AS (
    SELECT o.*, o.situacao_pedido AS situacao_atual, c.cenario, c.ordem_cenario, c.prazo_despacho_cenario,
           c.prazo_despacho_cenario - o.prazo_despacho_prometido                    AS ajuste_prazo_dias,
           o.situacao_pedido LIKE 'Entregue%'
             AND o.dias_diferenca_entrega - (c.prazo_despacho_cenario - o.prazo_despacho_prometido) > 0
                                                                                    AS entrega_atrasada
    FROM cen c JOIN gold.obt_pedidos_logistica o USING (id_pedido)
)
SELECT
    cenario,
    ordem_cenario,
    id_pedido,
    -- dimensões
    classe_servico,
    modo_envio,
    mes_pedido,
    ano,
    trimestre,
    fl_periodo_parcial,
    tipo_rota,
    modal_transporte,
    mercado_logistico,
    destino_regiao,
    destino_pais,
    destino_pais_en,
    destino_pais_iso3,
    destino_estado,
    destino_cidade,
    etapa_extravio,
    -- despacho (dado real, régua do cenário)
    prazo_despacho_prometido,
    prazo_despacho_cenario,
    ajuste_prazo_dias,
    dias_ate_despacho,
    CASE WHEN dias_ate_despacho > prazo_despacho_cenario THEN 1 ELSE 0 END          AS fl_despacho_atrasado,
    CASE WHEN dias_ate_despacho > prazo_despacho_cenario
         THEN dias_ate_despacho - prazo_despacho_cenario END                        AS dias_atraso_despacho,
    CASE WHEN dias_ate_despacho > 4 THEN 1 ELSE 0 END                               AS fl_despacho_acima_4_dias,
    -- entrega (cenário simulado, régua do cenário)
    CASE WHEN fl_extraviado = 1 THEN 'Extraviado'
         WHEN fl_em_transito = 1 THEN 'Em trânsito'
         WHEN situacao_atual LIKE 'Entregue%' AND entrega_atrasada THEN 'Entregue com atraso'
         WHEN situacao_atual LIKE 'Entregue%' THEN 'Entregue no prazo'
         ELSE situacao_atual END                                                    AS situacao_pedido,
    fl_com_desfecho,
    fl_em_transito,
    CASE WHEN situacao_atual LIKE 'Entregue%' AND NOT entrega_atrasada THEN 1 ELSE 0 END AS fl_entregue_no_prazo,
    CASE WHEN entrega_atrasada THEN 1 ELSE 0 END                                    AS fl_entregue_atrasado,
    fl_extraviado,
    CASE WHEN entrega_atrasada
         THEN dias_diferenca_entrega - ajuste_prazo_dias END                        AS dias_atraso_entrega,
    DATE_ADD(data_entrega_prevista, ajuste_prazo_dias)                              AS data_entrega_prevista,
    data_entrega_realizada,
    -- valor (real; atrasado / em risco segundo a régua do cenário)
    receita_bruta_pedido,
    receita_liquida_pedido,
    lucro_pedido,
    CASE WHEN entrega_atrasada THEN receita_bruta_pedido ELSE 0 END                 AS receita_bruta_atrasada,
    CASE WHEN entrega_atrasada THEN lucro_pedido ELSE 0 END                         AS lucro_atrasado,
    CASE WHEN entrega_atrasada OR fl_extraviado = 1 THEN receita_bruta_pedido ELSE 0 END   AS receita_bruta_em_risco,
    CASE WHEN entrega_atrasada OR fl_extraviado = 1 THEN receita_liquida_pedido ELSE 0 END AS receita_liquida_em_risco,
    CASE WHEN entrega_atrasada OR fl_extraviado = 1 THEN lucro_pedido ELSE 0 END           AS lucro_em_risco,
    receita_bruta_extraviada,
    lucro_extraviado,
    -- rótulos (herdados da OBT, derivados do dado)
    origem_dado_despacho,
    origem_dado_entrega,
    rotulo_fonte
FROM b;

-- COMMAND ----------

-- Leitura rápida
SELECT situacao_pedido, COUNT(*) AS pedidos, ROUND(SUM(receita_bruta_pedido), 2) AS receita_bruta,
       ROUND(SUM(receita_bruta_em_risco), 2) AS receita_bruta_em_risco
FROM gold.obt_pedidos_logistica GROUP BY ALL ORDER BY pedidos DESC;

-- COMMAND ----------

SELECT etapa_num, etapa_desc, origem_dado, COUNT(*) AS pedidos, SUM(fl_extravio_nesta_etapa) AS extravios,
       ROUND(AVG(horas_na_etapa), 1) AS horas_media
FROM gold.obt_eventos_etapas GROUP BY ALL ORDER BY etapa_num;

-- COMMAND ----------

SELECT cenario, COUNT(*) AS pedidos, ROUND(100.0 * AVG(fl_despacho_atrasado), 1) AS pct_despacho_atrasado,
       SUM(fl_entregue_atrasado) AS entregas_atrasadas, ROUND(SUM(receita_bruta_em_risco), 2) AS receita_bruta_em_risco
FROM gold.vw_cenarios_prazo GROUP BY ALL ORDER BY MIN(ordem_cenario);
