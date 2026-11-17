# Guia da Gold OBT para o analista de BI (TransLog)

**Catálogo:** `workspace` · **Schema:** `gold` · **Data de referência da base (D):** 06/02/2018
**Período dos pedidos:** 01/01/2015 a 31/01/2018 · **Escopo:** só pedidos **despachados** (36.866)
**Notebooks:** `03c_gold_obt.sql` (cria) e `03d_gold_validacao.sql` (testa; falha o job se algum teste der FAIL)

As tabelas OBT (One Big Table) já trazem tudo pronto para o dashboard: não precisa de join.
Pedidos não pagos, cancelados e aguardando pagamento ficam fora porque nunca chegam à transportadora.

---

## 1. Qual tabela usar

| Pergunta | Use | Grão (1 linha por) | Linhas |
|---|---|---|---|
| Quanto atrasa o despacho e a entrega? Onde? Quanto custa? | `gold.obt_pedidos_logistica` | pedido despachado | 36.866 |
| E se o prazo prometido fosse outro? (atual × ajustado) | `gold.vw_cenarios_prazo` | pedido × cenário | 73.732 |
| Qual departamento ou categoria tem mais valor em risco? | `gold.obt_itens_risco` | item do pedido | 101.009 |
| Em que etapa da jornada o volume se perde ou demora? | `gold.obt_eventos_etapas` | pedido × etapa percorrida | 201.635 |
| Quais prazos cada cenário usa? | `gold.param_cenario_prazo` | cenário × classe de serviço | 4 |

O dashboard atual lê só `vw_cenarios_prazo` (cards, classe, linha do tempo, país) e `obt_eventos_etapas` (extravio por etapa).

---

## 2. Regras de ouro (leia antes de montar qualquer gráfico)

1. **Dado real × cenário simulado.** O despacho (datas, atraso, causa, prazo) é **dado real** do DataCo. Transporte, entrega, atraso na entrega, extravio e as etapas 1 a 5 são **cenário simulado** (meta 60% no prazo / 20% atrasado / 20% extraviado aplicada sobre o despacho real). Todo visual com entrega ou extravio precisa do aviso. Use a coluna `rotulo_fonte` ("Despacho: dado real · Entrega/extravio: cenário simulado") ou o comentário da coluna.
2. **Percentual = SUM / SUM.** As medidas `fl_*` valem 0 ou 1. Não use média de percentuais.
   - % de **despacho**: denominador = todas as linhas (`COUNT(*)`).
   - % de **entrega e extravio**: denominador = `SUM(fl_com_desfecho)`. Os 197 pedidos em trânsito em D ficam fora.
   - % **recuperado no transporte**: `SUM(fl_recuperou_atraso) / SUM(fl_despacho_atrasado_entregue)`.
3. **Atraso médio = `AVG` direto.** `dias_atraso_despacho` e `dias_atraso_entrega` só são preenchidos quando há atraso (NULL nos demais), então `AVG(coluna)` já é o atraso médio dos atrasados.
4. **Não some o que está repetido.**
   - Em `obt_itens_risco`, as colunas do pedido (`fl_*`, `situacao_pedido`) se repetem em cada item: conte pedidos com `COUNT(DISTINCT id_pedido)` e não calcule taxa nessa tabela.
   - Em `obt_eventos_etapas`, `receita_bruta_pedido` se repete em cada etapa. Para valor extraviado, some `receita_*_extraviada_nesta_etapa` (preenchida só na etapa do extravio).
5. **Em `vw_cenarios_prazo`, sempre filtre ou agrupe por `cenario`.** Sem filtro, cada pedido aparece duas vezes e tudo dobra.
6. **País no mapa:** `destino_pais` está em **espanhol** ("Francia", "Alemania"), como no DataCo original, e o mapa não reconhece. Use `destino_pais_iso3` (ISO alfa-3) no mapa, `destino_pais_pt` nos rótulos e `destino_pais_en` se precisar do nome em inglês.
7. **Período parcial:** `fl_periodo_parcial = 1` marca jan/2018 (mês incompleto) e os pedidos em trânsito. Tire esses pedidos da linha do tempo ou marque o ponto como parcial.

### Armadilhas conhecidas (não são insights)
- **Extravio por país ou por mês** fica em ~20% em todo lugar por construção da simulação. Não destaque como achado.
- **Pico de entrega atrasada em abr–set/2016:** é mudança de mix (o mercado USCA só existe nesse período), não sazonalidade.
- **Centro de distribuição:** a base não tem essa informação. Os hubs (`id_hub`, `local_evento`) são simulados, então não aponte um CD "culpado".
- **EUA:** a entrega atrasada é maior (33,8% contra 16%–21%), mas o despacho atrasa igual aos outros países (57,5% × 57,3%). A diferença vem do trânsito doméstico curto, que não recupera o atraso.

---

## 3. `gold.obt_pedidos_logistica` (grão: pedido despachado, chave `id_pedido`)

| Grupo | Coluna | O que é | Origem |
|---|---|---|---|
| Chave | `id_pedido`, `id_cliente` | Identificadores (sem nome, e-mail ou endereço: LGPD) | real |
| Tempo | `data_pedido`, `mes_pedido`, `ano`, `trimestre`, `mes_num` | Data do pedido e recortes | real |
| | `data_despacho_real` | Data em que saiu do armazém | real |
| | `data_referencia_base` | D = 06/02/2018 (foto da base) | — |
| | `fl_periodo_parcial` | 1 = jan/2018 ou em trânsito | — |
| Cliente e produto | `segmento_cliente` | Consumer / Corporate / Home Office | real |
| | `qtd_itens`, `qtd_unidades` | Itens e unidades do pedido | real |
| | `categoria_principal`, `departamento_principal` | Do item de maior receita bruta do pedido | real |
| Serviço | `classe_servico` | Same Day / First Class / Second Class / Standard Class (o `modo_envio` original) | real |
| | `modo_envio` | Mesmo valor de `classe_servico` (mantida por compatibilidade) | real |
| | `prazo_despacho_prometido` | Prazo de despacho prometido (dias): Same Day 0 · First 1 · Second 2 · Standard 4 | real |
| | `prazo_despacho_sugerido` | Prazo da "Promessa ajustada": Same Day 1 · First 2 · Second 4 · Standard 4 | regra |
| Rota | `tipo_rota` | Internacional / Doméstica | real |
| | `mercado_logistico` | Europe / Pacific Asia / LATAM / USCA / Africa | real |
| | `destino_regiao`, `destino_estado`, `destino_cidade` | Destino | real |
| | `destino_pais` (espanhol), `destino_pais_pt`, `destino_pais_en`, `destino_pais_iso3` | País em cada formato (ver regra 6) | real |
| | `modal_transporte` | Aéreo consolidado / Aéreo expresso / Rodoviário | **simulado** (regra fixa) |
| Despacho | `dias_ate_despacho` | Dias do pedido até o despacho | real |
| | `fl_despacho_atrasado` | 1 = despachou depois do prazo prometido | real |
| | `dias_atraso_despacho` | Dias reais − prometidos (só atrasados) | real |
| | `status_prazo_despacho` | Adiantado / No Prazo / Atrasado | real |
| | `causa_atraso_despacho` | Promessa irreal (prazo ≤ 1 dia) / Atraso operacional / Sem atraso | real |
| | `fl_despacho_atrasado_prazo_sugerido` | 1 = estaria atrasado mesmo com a promessa ajustada | real + regra |
| | `fl_despacho_acima_4_dias` | 1 = despachou em 5 ou 6 dias | real |
| Situação em D | `situacao_pedido` | Entregue no prazo / Entregue com atraso / Extraviado / Em trânsito | **simulado** |
| | `fl_com_desfecho` | 1 = tem desfecho (denominador da entrega) | **simulado** |
| | `fl_em_transito` | 1 = ainda sem desfecho em D | **simulado** |
| Transporte | `transito_padrao_dias`, `transito_real_dias` | Trânsito previsto e realizado (despacho → entrega) | **simulado** |
| | `dias_recuperados_transporte` | Dias de atraso do despacho que o transporte absorveu | **simulado** |
| | `resultado_transporte` | No prazo / Recuperou o atraso do despacho / Não recuperou o atraso do despacho / Extraviado / Em trânsito | **simulado** |
| | `fl_despacho_atrasado_entregue` | Despacho atrasado e entregue (denominador da recuperação) | **simulado** |
| | `fl_recuperou_atraso` | 1 = o transporte recuperou o atraso do despacho | **simulado** |
| Entrega | `data_entrega_prevista` | Pedido + prazo de despacho + trânsito padrão | **simulado** |
| | `data_entrega_realizada` | Despacho real + trânsito real (NULL em extraviado e em trânsito) | **simulado** |
| | `fl_entregue_no_prazo`, `fl_entregue_atrasado`, `fl_extraviado` | Desfechos 0/1 | **simulado** |
| | `dias_atraso_entrega` | Realizada − prevista (só entregues com atraso) | **simulado** |
| | `dias_diferenca_entrega` | Realizada − prevista em todo entregue (negativo = adiantado) | **simulado** |
| | `dias_atraso_ate_d` | Atraso acumulado até D dos pedidos em trânsito (fora dos KPIs) | **simulado** |
| | `etapa_extravio`, `etapa_extravio_num` | Etapa em que o volume se perdeu (1 a 5) | **simulado** |
| Valor | `receita_bruta_pedido`, `receita_liquida_pedido`, `lucro_pedido` | Bruta = venda; líquida = após desconto; lucro do pedido | real |
| | `receita_bruta_em_risco`, `receita_liquida_em_risco`, `lucro_em_risco` | Valor do pedido se a entrega atrasou ou extraviou (0 nos demais) | simulado sobre valor real |
| | `receita_bruta_extraviada`, `receita_liquida_extraviada`, `lucro_extraviado` | Valor do pedido se extraviou (0 nos demais) | simulado sobre valor real |
| Rótulos | `origem_dado_despacho` | `real` | — |
| | `origem_dado_entrega` | `simulado` hoje; vira `real` quando a entrega for ingerida | — |
| | `rotulo_fonte` | Texto pronto para o aviso do visual | — |
| | `dt_processamento_gold` | Quando a Gold foi gerada | — |

---

## 4. `gold.vw_cenarios_prazo` (grão: pedido × cenário, chave `id_pedido` + `cenario`)

A view é a `obt_pedidos_logistica` repetida para cada cenário de prazo. O cenário muda **só a régua** (o prazo prometido). O que aconteceu de fato continua igual.

| Cenário | `ordem_cenario` | Régua |
|---|---|---|
| `Promessa atual` | 1 | Prazo prometido de cada pedido (idêntico à OBT de pedidos) |
| `Promessa ajustada` | 2 | Prazo de `gold.param_cenario_prazo` por classe de serviço |

**O que muda com o cenário:** `prazo_despacho_cenario`, `ajuste_prazo_dias` (cenário − prometido), `fl_despacho_atrasado`, `dias_atraso_despacho`, `situacao_pedido`, `fl_entregue_no_prazo`, `fl_entregue_atrasado`, `dias_atraso_entrega`, `data_entrega_prevista` e os valores `receita_bruta_atrasada`, `lucro_atrasado`, `receita_*_em_risco`, `lucro_em_risco`.

**O que não muda:** `dias_ate_despacho`, `data_entrega_realizada`, `fl_extraviado`, `fl_em_transito`, `fl_com_desfecho`, `receita_bruta_extraviada` e `lucro_extraviado`. Extravio e trânsito independem do prazo.

As demais colunas (dimensões, valores totais e rótulos) têm o mesmo significado da seção 3. `receita_bruta_atrasada` e `lucro_atrasado` existem só aqui: são o valor das entregas **atrasadas**, sem os extravios.

**Como mudar ou criar um cenário:** edite `gold.param_cenario_prazo`. A view relê a tabela na hora e o dashboard não precisa mudar. O 03c não sobrescreve edições: ele só insere o seed se a linha não existir.

| Coluna | O que é |
|---|---|
| `cenario`, `ordem_cenario` | Nome exibido e ordem (1 é reservado para "Promessa atual") |
| `classe_servico` | Classe a que o prazo se aplica (precisa ter as 4 classes, senão pedidos somem do cenário) |
| `prazo_despacho_dias` | Prazo de despacho prometido neste cenário |
| `criterio` | Justificativa do prazo |
| `ativo` | Só cenários ativos entram na view |
| `dt_atualizacao` | Última alteração |

Seed atual da "Promessa ajustada": First Class 2 (despacho real é sempre 2 dias) · Same Day 1 · Second Class 4 (despacha de 2 a 6 dias, igual à Standard) · Standard Class 4 (mantém).

---

## 5. `gold.obt_itens_risco` (grão: item, chave `id_item_pedido`)

Serve para **valor**, não para taxa. 11 departamentos, 50 categorias e 118 produtos (nomes em inglês, como no DataCo).

| Grupo | Coluna | O que é | Origem |
|---|---|---|---|
| Chaves | `id_item_pedido`, `id_pedido`, `id_produto` | Identificadores | real |
| Produto | `departamento`, `categoria_produto`, `nome_produto` | Hierarquia do produto | real |
| Quantidade | `quantidade_item`, `preco_unitario` | Do item | real |
| Valor | `receita_bruta_item`, `desconto_item`, `receita_liquida_item`, `lucro_item` | Valor do item | real |
| | `receita_bruta_em_risco`, `receita_liquida_em_risco`, `lucro_em_risco` | Valor do item se o pedido atrasou ou extraviou | simulado sobre valor real |
| | `receita_bruta_extraviada`, `receita_liquida_extraviada`, `lucro_extraviado` | Valor do item se o pedido extraviou | simulado sobre valor real |
| Do pedido (repetido) | `situacao_pedido`, `fl_com_desfecho`, `fl_em_transito`, `fl_entregue_no_prazo`, `fl_entregue_atrasado`, `fl_extraviado`, `fl_despacho_atrasado` | Filtro, não taxa (regra 4) | ver seção 3 |
| | `causa_atraso_despacho`, `etapa_extravio`, `classe_servico`, `modo_envio`, `modal_transporte`, `tipo_rota`, `mercado_logistico`, `destino_*`, `segmento_cliente`, `data_pedido`, `mes_pedido`, `ano`, `fl_periodo_parcial` | Dimensões do pedido | ver seção 3 |
| Rótulos | `origem_dado_despacho`, `origem_dado_entrega`, `rotulo_fonte`, `dt_processamento_gold` | Ver seção 3 | — |

A soma dos itens bate com a OBT de pedidos (o 03d testa isso).

---

## 6. `gold.obt_eventos_etapas` (grão: pedido × etapa, chave `id_pedido` + `etapa_num`)

Uma linha para cada etapa que o pedido **percorreu**. Rotas domésticas não passam por voo nem alfândega, então as etapas 2 e 3 têm menos pedidos.

| `etapa_num` / `etapa_desc` | Pedidos | Extravios | Origem |
|---|---|---|---|
| 0 - Pedido (do pedido até o despacho) | 36.866 | — | real |
| 1 - Coleta | 36.866 | 415 | simulado |
| 2 - Voo | 34.198 | 1.339 | simulado |
| 3 - Alfândega | 30.599 | 2.907 (40,3% dos extravios) | simulado |
| 4 - Transferência | 32.065 | 993 | simulado |
| 5 - Última milha | 31.041 | 1.568 | simulado |

| Coluna | O que é |
|---|---|
| `qtd_eventos`, `primeiro_codigo_evento`, `ultimo_codigo_evento` | Eventos da etapa (ex.: `CHEGADA_ALFANDEGA`, `LIBERACAO_ALFANDEGA`) |
| `entrada_etapa`, `saida_etapa` | Primeiro evento da etapa e entrada da próxima (`saida_etapa` NULL na etapa atual de quem está em trânsito) |
| `horas_na_etapa` | Permanência, incluindo espera. NULL na etapa do extravio e na etapa atual |
| `fl_etapa_concluida` | 1 = o pedido saiu da etapa (ou foi entregue nela) |
| `fl_extravio_nesta_etapa` | 1 = o volume se perdeu aqui (exatamente 1 linha por pedido extraviado) |
| `fl_etapa_atual` | 1 = etapa em que o pedido em trânsito estava em D |
| `id_hub`, `local_evento` | Hub e local (malha **simulada**: não use como CD real) |
| `origem_dado` | `real` na etapa 0, `simulado` nas etapas 1 a 5 |
| `receita_bruta_extraviada_nesta_etapa`, `receita_liquida_extraviada_nesta_etapa`, `lucro_extraviado_nesta_etapa` | Valor do pedido só na etapa do extravio: pode somar direto |
| `receita_bruta_pedido` | Repetida em cada etapa: **não some** (regra 4) |
| Dimensões do pedido | `situacao_pedido`, `fl_com_desfecho`, `fl_extraviado`, `fl_despacho_atrasado`, `classe_servico`, `modo_envio`, `modal_transporte`, `tipo_rota`, `mercado_logistico`, `destino_regiao`, `destino_pais*`, `mes_pedido`, `ano`, `fl_periodo_parcial`, `rotulo_fonte`, `dt_processamento_gold` |

---

## 7. Consultas prontas

**KPIs executivos (cards)**
```sql
SELECT
  ROUND(100 * SUM(fl_despacho_atrasado) / COUNT(*), 1)                 AS pct_despacho_atrasado,      -- 57,3 (real)
  ROUND(AVG(dias_atraso_despacho), 2)                                  AS atraso_medio_despacho,      -- 1,61
  ROUND(100 * SUM(fl_entregue_no_prazo) / SUM(fl_com_desfecho), 1)     AS pct_entregue_no_prazo,      -- 59,9 (simulado)
  ROUND(100 * SUM(fl_entregue_atrasado) / SUM(fl_com_desfecho), 1)     AS pct_entregue_atrasado,      -- 20,4
  ROUND(100 * SUM(fl_extraviado)        / SUM(fl_com_desfecho), 1)     AS pct_extraviado,             -- 19,7
  ROUND(AVG(dias_atraso_entrega), 2)                                   AS atraso_medio_entrega,       -- 1,63
  ROUND(100 * SUM(fl_recuperou_atraso) / SUM(fl_despacho_atrasado_entregue), 1) AS pct_recuperado,   -- 55,8
  ROUND(SUM(receita_bruta_em_risco) / 1e6, 2)                          AS receita_bruta_em_risco_mi,  -- 8,28
  ROUND(SUM(lucro_em_risco) / 1e6, 2)                                  AS lucro_em_risco_mi           -- 0,89
FROM workspace.gold.obt_pedidos_logistica;
```

**Atraso no despacho por classe de serviço**
```sql
SELECT classe_servico, COUNT(*) AS pedidos,
       ROUND(100 * SUM(fl_despacho_atrasado) / COUNT(*), 1) AS pct_despacho_atrasado
FROM workspace.gold.obt_pedidos_logistica
GROUP BY classe_servico
ORDER BY pct_despacho_atrasado DESC;   -- First 100% · Second 79,8% · Same Day 48,4% · Standard 39,7%
```

**Promessa atual × ajustada**
```sql
SELECT cenario,
       ROUND(100 * SUM(fl_despacho_atrasado) / COUNT(*), 1)             AS pct_despacho_atrasado,   -- 57,3 → 31,4
       SUM(fl_entregue_atrasado)                                        AS entregas_atrasadas,      -- 7.471 → 3.952
       ROUND(100 * SUM(fl_entregue_atrasado) / SUM(fl_com_desfecho), 1) AS pct_entrega_atrasada,    -- 20,4 → 10,8
       ROUND(SUM(receita_bruta_em_risco) / 1e6, 2)                      AS receita_em_risco_mi      -- 8,28 → 6,29
FROM workspace.gold.vw_cenarios_prazo
GROUP BY cenario, ordem_cenario
ORDER BY ordem_cenario;
```

**Linha do tempo (sem o mês parcial)**
```sql
SELECT mes_pedido,
       ROUND(100 * SUM(fl_despacho_atrasado) / COUNT(*), 1) AS pct_despacho_atrasado
FROM workspace.gold.vw_cenarios_prazo
WHERE cenario = 'Promessa atual' AND mes_pedido < DATE'2018-01-01'
GROUP BY mes_pedido
ORDER BY mes_pedido;
```

**Mapa de entrega atrasada por país (mínimo de 300 pedidos)**
```sql
SELECT destino_pais_iso3, MAX(destino_pais_pt) AS pais, SUM(fl_com_desfecho) AS pedidos,
       ROUND(100 * SUM(fl_entregue_atrasado) / SUM(fl_com_desfecho), 1) AS pct_entrega_atrasada
FROM workspace.gold.obt_pedidos_logistica
GROUP BY destino_pais_iso3
HAVING SUM(fl_com_desfecho) >= 300
ORDER BY pct_entrega_atrasada DESC;
```

**Valor em risco por departamento**
```sql
SELECT departamento,
       COUNT(DISTINCT id_pedido)                      AS pedidos,
       ROUND(SUM(receita_bruta_em_risco) / 1e6, 2)    AS receita_bruta_em_risco_mi,   -- Fan Shop 3,84 · Apparel 1,78 · Golf 1,03
       ROUND(SUM(lucro_em_risco) / 1e6, 3)            AS lucro_em_risco_mi
FROM workspace.gold.obt_itens_risco
GROUP BY departamento
ORDER BY receita_bruta_em_risco_mi DESC;
```

**Extravio e permanência por etapa**
```sql
SELECT etapa_num, etapa_desc,
       SUM(fl_extravio_nesta_etapa)                                   AS extravios,
       ROUND(100 * SUM(fl_extravio_nesta_etapa) / SUM(SUM(fl_extravio_nesta_etapa)) OVER (), 1) AS pct_dos_extravios,
       ROUND(SUM(receita_bruta_extraviada_nesta_etapa) / 1e6, 2)      AS receita_extraviada_mi,
       ROUND(AVG(horas_na_etapa), 1)                                  AS horas_medias
FROM workspace.gold.obt_eventos_etapas
GROUP BY etapa_num, etapa_desc
ORDER BY etapa_num;
```

---

## 8. Números de referência

Se o seu visual não bater com estes números, revise o denominador (regra 2) ou o filtro de cenário (regra 5).

| Indicador | Valor | Origem |
|---|---|---|
| Pedidos despachados | 36.866 (36.669 com desfecho, 197 em trânsito) | real |
| Despacho atrasado | 57,3% · atraso médio 1,61 dia | real |
| Causa do atraso no despacho | 6.655 promessa irreal · 14.472 atraso operacional | real |
| Entrega no prazo / atrasada / extraviada | 59,9% / 20,4% (7.471) / 19,7% (7.222) | simulado |
| Atraso médio na entrega | 1,63 dia | simulado |
| Despachos atrasados recuperados no transporte | 55,8% | simulado |
| Receita bruta / em risco | 20,62 mi / 8,28 mi | real / simulado |
| Receita líquida / em risco | 18,53 mi / 7,44 mi | real / simulado |
| Lucro / em risco / extraviado | 2,27 mi / 0,89 mi / 0,44 mi | real / simulado |
| Promessa ajustada: despacho atrasado / entregas atrasadas / receita em risco | 31,4% / 3.952 (10,8%) / 6,29 mi | real + regra / simulado |
| Extravios na alfândega | 40,3% dos extravios | simulado |
