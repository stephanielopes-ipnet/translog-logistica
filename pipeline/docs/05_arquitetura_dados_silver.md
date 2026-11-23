# Arquitetura de dados (Silver v4 + Gold v4): o que é real, o que é simulado e quem usa

**Projeto:** TransLog, Academy, Grupo 3 · **Área:** Engenharia de Dados · **Base:** DataCo (Kaggle) + simulação pós-despacho
**Premissa:** `04_decisao_premissa_despacho.md` (validada com o instrutor)

---

## 1. O problema em uma página

A **TransLog** é uma operadora logística internacional. Ela despacha pedidos de e-commerce dos **EUA e de Porto Rico** para cinco mercados (América do Norte, América Latina, Europa, Ásia-Pacífico e África), em quatro níveis de serviço (Standard, Second Class, First Class e Same Day).

A empresa cresceu sem enxergar a própria operação:

| Dor | Quem sente | O que precisa existir nos dados |
|---|---|---|
| Não sabe **quanto** atrasa | Diretoria, PMO | Atraso medido com regra única, no despacho e na entrega |
| Não sabe **onde** atrasa | Operação, PMO | Atraso por modalidade, rota, mercado, região e etapa da jornada |
| Não sabe **por quê** | Operação | Causa do atraso no despacho e papel do transporte (recuperou ou não) |
| O cliente não consegue acompanhar o pedido; tudo vira ligação e e-mail | Cliente, central | Situação atual, posição, previsão e linha do tempo de cada pedido, em linguagem natural |

**O que a base tem:** o DataCo registra o pedido e o **despacho** (`Shipping date`), com o prazo de despacho prometido e o real. **Não tem nada depois do despacho.**

**O que fizemos:**
- mantivemos tudo o que é real como **fonte oficial** (atraso no despacho);
- **simulamos a jornada pós-despacho** com o padrão validado com o instrutor (60% entregues no prazo, 20% com atraso, 20% extraviados);
- marcamos cada linha simulada **nas tabelas** (governança), sem expor essa marca nas **views** que vão para a IA e o portal.

---

## 2. Fluxo dos dados (notebooks)

```
 VOLUME (landing)                               LEGENDA:  [R] real DataCo  [D] derivado do real
 ├─ CSV DataCo                                             [P] premissa    [S] simulado
 └─ de_para.csv
      │                │
      ▼                ▼
 ┌─────────┐     ┌──────────┐
 │ 01      │     │ 01b      │──► silver.dim_traducao [P]
 │ Bronze  │     └──────────┘
 └────┬────┘
      ▼ bronze.dataco_raw [R]                                         grão: item
 ┌──────────────────────────────────────────────────────────────┐
 │ 02a  limpeza · LGPD · tipagem · quarentena                    │
 │      ATRASO NO DESPACHO (flag/dias/faixa/janela/causa) [D]    │
 │      datas de despacho prevista e real · tipo_rota      [R+D] │
 └────┬─────────────────────────────────────────────────────────┘
      ├──► silver.pedidos_quarentena
      ▼ silver.pedidos_rastreio [R+D]                                  grão: item
 ┌──────────────────────┐
 │ 02d  malha de hubs   │──► silver.dim_hubs [P]   5 gateways · 164 CDs · 163 alfândegas · 370 armazéns
 └──────────────────────┘
      ▼
 ┌──────────────────────────────────────────────────────────────┐
 │ 02g (chama 02f)                                               │
 │  02f: 1 linha/pedido · grupo · modal [P] · hubs · amostra     │
 │  02g: trânsito padrão [P] · calibração na base inteira ·      │
 │       desfecho 60/20/20 [S] · eventos [S] · checagens         │
 └────┬─────────────────────────────────────────────────────────┘
      ├──► silver.eventos_logisticos [R+S]     grão: evento (CRIADO, DESPACHADO = R; demais = S)
      ├──► silver.entregas_simuladas [S]       grão: pedido
      ├──► silver.eventos_logisticos_quarentena
      └──► silver.simulacao_publicada          (versão + escopo consumidos)
      ▼
 ┌──────────────────────────────────────────────────────────────┐
 │ 02i  só a fatia publicada                                     │
 └────┬─────────────────────────────────────────────────────────┘
      ├──► silver.rastreio_pedidos (TABELA, com dado_simulado)  grão: pedido
      └──► silver.consumo_eventos_logisticos (TABELA, sem marca) grão: evento  → Portal / IA
      ▼
 ┌──────────────────────────────────────────────────────────────┐
 │ 02e  tabelas de consumo finais (pt-BR, sem PII/marca, RAG)   │
 └────┬─────────────────────────────────────────────────────────┘
      ├──► silver.consumo_pedidos (65.752 · CDF ligado)          → IA (RAG) / Portal
      └──► silver.consumo_itens_pedido (180.519)                 → Portal / IA
 ┌────────────────────────────────────────┐
 │ 03c  Gold OBT (só despachados: 36.866) │──► gold.obt_pedidos_logistica · obt_itens_risco ·
 └────────────────────────────────────────┘    obt_eventos_etapas · param_cenario_prazo ·
                                               vw_cenarios_prazo  → BI (dashboard_v2: 36.671 finalizados)
 Testes: 02b (Silver, 37 PASS) · 02h (simulação, 28 PASS, com assert) · 03d (Gold OBT, com assert)
```

---

## 3. O que é real, o que é derivado e o que é simulado

| Camada | Origem | Exemplos | KPI oficial? |
|---|---|---|---|
| **Real (DataCo)** | colunas originais limpas | `data_pedido`, `data_envio`, `modo_envio`, `status_pedido`, valores, produto, destino | Sim |
| **Derivado do real** | regra determinística | `flag_atraso_despacho`, `dias_atraso_despacho`, `causa_atraso_despacho`, `tipo_rota`, `data_despacho_prevista`, `data_despacho_real` | Sim |
| **Premissa** | parâmetro declarado | malha de hubs, `modal_transporte`, trânsito padrão, pesos dos trechos | Não |
| **Simulado** | sorteio determinístico por pedido | eventos pós-despacho, desfecho da entrega, `data_entrega_realizada`, atraso na entrega, extravio, posição atual | Indicador de entrega (Gold), com origem declarada na documentação |

**Onde fica a marca de simulação:** nas tabelas `eventos_logisticos` (`origem_evento`, `dado_simulado`, `precisao_temporal`), `entregas_simuladas` e `rastreio_pedidos` (`dado_simulado`, `versao_simulacao`). **Não** fica nas views de consumo nem no texto da IA, que fala em linguagem de operação (teste `views_de_consumo_sem_marca_de_simulacao` e `textos_de_consumo_sem_termo_simulado`).

---

## 4. Como os dados simulados são criados (02f + 02g)

1. **Entrada:** 1 linha por pedido da Silver. Pedido com itens divergentes vai para a quarentena.
2. **Grupo do pedido (base real):**

   | `status_pedido` | `grupo_status` | O que recebe |
   |---|---|---|
   | COMPLETE, CLOSED | `concluido` | Jornada completa + **desfecho** (60/20/20) |
   | PROCESSING | `em_transito` | Jornada parcial até uma etapa sorteada, sem desfecho |
   | PENDING, PENDING_PAYMENT, PAYMENT_REVIEW, ON_HOLD | `aguardando` | Só `PEDIDO_CRIADO` |
   | CANCELED, SUSPECTED_FRAUD | `cancelado` | Só `PEDIDO_CRIADO` |

3. **Rota e modal (premissa):** internacional = gateway → voo → alfândega → CD → (armazém) → última milha; doméstico aéreo (Same Day/First Class ou origem Porto Rico) sem alfândega; doméstico rodoviário sem voo nem alfândega. Hubs de `silver.dim_hubs`.
4. **Trânsito padrão T (dias, do despacho até a entrega):**

   | Rota / modal | USCA | LATAM | Europa | Ásia-Pacífico | África |
   |---|---|---|---|---|---|
   | Internacional, aéreo expresso | 2 | 3 | 3 | 4 | 4 |
   | Internacional, aéreo consolidado | 4 | 5 | 6 | 7 | 8 |
   | Doméstico | rodoviário 3 · aéreo expresso 1 · aéreo consolidado 2 | | | | |

5. **Datas:**
   - `data_despacho_prevista` = pedido + prazo de despacho (real)
   - `data_despacho_real` = Shipping date (real)
   - `data_entrega_prevista` = `data_despacho_prevista` + T (a promessa ao cliente; não muda se o despacho atrasar)
   - `data_entrega_realizada` = `data_despacho_real` + trânsito real
6. **Desfecho (concluídos):**

   | Grupo | Regra | Trânsito real | Resultado |
   |---|---|---|---|
   | Extraviado | `pmod(xxhash64(id,'EXTRAVIO'),100) < 20` | — | sem entrega; `EXTRAVIO_CONFIRMADO` em despacho + T + 5 dias, na etapa sorteada |
   | Despacho no prazo | atraso no despacho ≤ 0 | T | entregue no prazo |
   | Despacho atrasado, **recuperado** | sorteio ≥ p (e atraso < T) | T − atraso (≥ 1 dia) | entregue **na data prometida** |
   | Despacho atrasado, **não recuperado** | sorteio < p, ou atraso ≥ T | T | entregue com atraso = atraso no despacho |

   **Atualização `v4`:** além dos atrasos de despacho não recuperados (`5.066` pedidos), a simulação `v4` introduz ~`6,5%` de **atraso no transporte** (`2.369` pedidos, +1 a +3 dias concentrados em Alfândega internacional e Transferência entre hubs domésticos), fechando os `36.671` concluídos em **60,0% no prazo (`22.014`) · 20,3% com atraso (`7.435`) · 19,7% extraviados (`7.222`)**, com `195` pedidos `Em trânsito` em `D`.
8. **Horário dos eventos:** o trânsito é repartido por peso (±30% por hash), truncado ao minuto. Tudo é calculado a partir das datas da base: a maior data possível é ~19/02/2018 (último despacho real + trânsito + confirmação de extravio).
9. **Garantias:** determinístico (hash), versionado (`versao`, `escopo`), idempotente (`replaceWhere`), com quarentena para horário nulo, ordem invertida, hub ausente ou evento antes do despacho.

---

## 5. Dicionário

### 5.1 `silver.consumo_pedidos` e `silver.consumo_itens_pedido` (consumo IA e Portal)
**Grão:** `consumo_pedidos` = pedido (`65.752` linhas); `consumo_itens_pedido` = item (`180.519` linhas). Base: `silver.pedidos_rastreio` (02a) + `silver.rastreio_pedidos` (02i). pt-BR, sem PII, sem marca de simulação.

| Grupo | Coluna | Significado | NULL quando |
|---|---|---|---|
| Chaves | `id_pedido`, `id_item_pedido`, `id_cliente`, `id_produto` | Identificadores | — |
| Pedido | `data_pedido`, `status_pedido`, `tipo_pagamento` | Dados do pedido | — |
| | `situacao_rastreio` | `Aguardando Liberação` / `Cancelado` / `Em Trânsito` (PROCESSING) / `Despachado` (COMPLETE, CLOSED) | — |
| Despacho | `modo_envio`, `dias_envio_programado` | Serviço e prazo de despacho prometido (0, 1, 2 ou 4 dias) | — |
| | `dias_envio_real` | Dias até o despacho | não despachado |
| | `data_despacho_prevista`, `data_despacho_real` | Datas de despacho (DATE) | não despachado |
| | `flag_atraso_despacho`, `despacho_no_prazo`, `dias_atraso_despacho`, `faixa_atraso_despacho`, `janela_atraso_despacho`, `status_prazo_despacho` | **Atraso no despacho** (KPI oficial) | não despachado / cancelado |
| | `causa_atraso_despacho` | `Promessa irreal` (prazo ≤ 1 dia) / `Atraso operacional` / `Sem atraso` | não avaliado |
| | `periodo_pico` | Pedido de novembro/dezembro (dimensão; não é causa) | — |
| Rota | `tipo_rota`, `mercado_logistico`, `destino_regiao`, `destino_pais`, `destino_estado`, `destino_cidade`, `rota_logistica`, `rota_servico` | Rota e destino (pt-BR) | — |
| Produto e valor | `nome_produto`, `categoria_produto`, `departamento`, `quantidade_item`, `preco_unitario`, `valor_bruto_venda`, `valor_desconto`, `valor_item_pedido`, `lucro_item`, `margem_lucro_item`, `lucro_total_pedido` | Itens e financeiro | — |
| Entrega | `modal_transporte`, `transito_padrao_dias`, `transito_real_dias`, `dias_recuperados_transporte` | Transporte | fora da simulação / não entregue |
| | `resultado_transporte` | `No prazo` / `Recuperou o atraso do despacho` / `Não recuperou o atraso do despacho` / `Extraviado` / `Em trânsito` | não despachado |
| | `situacao_entrega` | `Entregue no prazo` / `Entregue com atraso` / `Extraviado` / `Em trânsito` / `Não despachado` / `Cancelado` | fora da simulação |
| | `data_entrega_prevista`, `data_entrega_realizada` | Promessa e entrega (DATE) | não despachado / não entregue |
| | `dias_atraso_entrega`, `flag_atraso_entrega`, `causa_atraso_entrega` | Atraso na entrega (`v4`: despacho não recuperado ou atraso no transporte) | não entregue |
| | `etapa_extravio` | Etapa onde o volume se perdeu | não extraviado |
| Posição | `etapa_atual`, `etapa_atual_desc`, `local_atual`, `id_hub_atual`, `ultimo_codigo_evento`, `ultimo_evento_desc`, `ts_ultimo_evento` | Último evento | não despachado |
| Texto | `motivo_ocorrencia` | Despacho + transporte em linguagem de operação | não despachado |
| | `resumo_rastreio_rag` | Texto do item para o agente (sem nome de cliente) | — |

**Só nas tabelas (fora das views):** `nome_cliente` (PII), `status_entrega_original` e `risco_atraso_flag` (rótulos originais), `data_envio`, `avaliado_prazo`, `pedido_cancelado`, linhagem técnica e as marcas de simulação.

### 5.2 `silver.consumo_eventos_logisticos` (linha do tempo)
- **`consumo_eventos_logisticos`** (grão: evento, `350.421` linhas na `v4`): `id_pedido`, `id_cliente`, `sequencia`, `codigo_evento`, `descricao_evento`, `etapa`, `etapa_desc`, `ts_evento`, `id_hub`, `local_evento`, `ultimo_evento`, `tipo_rota`, `modal_transporte`, `modo_envio`, `destino_regiao`.
  Eventos: `PEDIDO_CRIADO`, `PEDIDO_DESPACHADO`, `COLETA_GATEWAY`, `PARTIDA_VOO`, `CHEGADA_ALFANDEGA`, `LIBERACAO_ALFANDEGA`, `CHEGADA_CD`, `CHEGADA_ARMAZEM`, `SAIU_PARA_ENTREGA`, `ENTREGUE`, `EXTRAVIO_CONFIRMADO`.

### 5.3 Tabelas Silver (governança e Gold)
| Tabela | Grão | Conteúdo |
|---|---|---|
| `silver.pedidos_rastreio` | item | Tudo do 02a, inclusive PII e linhagem (fora da view) |
| `silver.eventos_logisticos` | evento × versão × escopo | Eventos com `origem_evento`, `dado_simulado`, `precisao_temporal` |
| `silver.entregas_simuladas` | pedido × versão × escopo | Desfecho da entrega e datas |
| `silver.rastreio_pedidos` | pedido | Fatia publicada: posição + entrega + motivo + `dado_simulado` |
| `silver.dim_hubs`, `silver.dim_traducao` | hub / termo | Malha e de-para |
| `silver.pedidos_quarentena`, `silver.eventos_logisticos_quarentena` | registro | Reprovados + motivo |
| `silver.simulacao_publicada` | 1 linha | Fatia consumida pelas views |

### 5.4 Gold (03c)
A Gold consumida é só a OBT (`gold.obt_*`) e a view de cenários (`gold.vw_cenarios_prazo`), com os parâmetros em `gold.param_cenario_prazo`. O 03d confere os KPIs da OBT contra um gabarito recalculado direto da Silver. Dicionário completo: `07_guia_gold_obt_analista.md`.

`receita_em_risco` = venda bruta (`Sales`) dos pedidos com **entrega atrasada ou extraviada**. Existe só na Gold.

---

## 6. Como cada consumidor usa os dados (Portal/IA vs. Dashboard)

| Consumidor | O que lê | Escopo | Perguntas que responde | O que **não** deve fazer |
|---|---|---|---|---|
| **BI / Dashboard (`dashboard_v2`)** | `gold.obt_pedidos_logistica`, `gold.obt_eventos_etapas` (03c) | **36.671** pedidos finalizados (`fl_com_desfecho = 1`, dentre `36.866` despachados) | Quanto atrasa no despacho (real) e na entrega; onde (modalidade, rota, etapa); por quê (despacho vs. transporte); quanto custa | Usar `Delivery Status`/`Late delivery`; somar itens como pedidos; misturar não pagos no KPI logístico |
| **Agente de IA / RAG** | `silver.consumo_pedidos` (`resumo_pedido`, `linha_do_tempo`), `silver.consumo_eventos_logisticos` | **65.752** pedidos (inclui `28.886` não pagos/cancelados/aguardando) | "Onde está meu pedido?", "Quando chega?", "Por que atrasou?", "Foi extraviado?" | Ler tabelas internas (têm PII e marcas de simulação); responder pedido não pago como despachado |
| **Portal FullStack** | `silver.consumo_pedidos`, `silver.consumo_itens_pedido`, `silver.consumo_eventos_logisticos` *(e `gold.*` para KPIs da Torre de Controle)* | **65.752** no rastreio individual; **36.671** nos KPIs gerenciais | Tela de rastreio do cliente + Torre de Controle | Agregar `silver.consumo_pedidos` sem filtro para KPI de transportadora (gera divergência com o Dashboard) |

### Por que a arquitetura com mais informação torna BI e agentes mais robustos
- **Do "quanto" para o "onde" e o "porquê":** o atraso na entrega se decompõe em **despacho (real)** + **recuperação no transporte**, com etapa e motivo de extravio. A Gold responde onde nasce o problema e qual alavanca atacar.
- **Narrativa de negócio clara:** o despacho é a etapa crítica (toda entrega atrasada nasce nele), First Class promete 1 dia e despacha sempre em 2 (100% de atraso por promessa irreal), e o transporte é a alavanca que salva ~56% dos despachos atrasados.
- **Uma única fonte de verdade por pedido:** a posição vem só do último evento publicado; portal, IA e BI dão a mesma resposta.
- **Atendimento sem atrito:** o texto do agente já vem montado, em pt-BR, sem PII e em linguagem de operação.
- **Pronto para dado real:** o modelo de eventos é o de uma API de transportadora; trocar a simulação por rastreio real é trocar a fonte do 02g.
- **Confiável por construção:** 65 testes PASS/FAIL (02b + 02h) e geração reprodutível.

---

## 7. Como o desenho evita inconsistências

| Risco | Regra que evita | Teste que comprova |
|---|---|---|
| Duas posições para o mesmo pedido | Posição só do último evento publicado | `posicao_da_view_igual_ultimo_evento` (02b) |
| Duas hipóteses convivendo | Só o cenário `despacho`; views leem `simulacao_publicada` | `fatia_publicada_unica` (02h) |
| Entrega contradizer o despacho | Transporte só recupera; entrega atrasada só com despacho atrasado | `atraso_entrega_coerente_com_despacho_e_datas` (02b), `regra_recuperacao_do_despacho` (02h) |
| Extraviado ou em trânsito com data de entrega | Datas só para entregues | `entrega_simulada_so_para_despachados` (02b), `extraviado_sem_entregue_e_termina_em_extravio` (02h) |
| Pedido não pago com jornada ou atraso | Só despachados ganham jornada | `aguardando_e_cancelado_so_pedido_criado` (02h), `nao_avaliados_sem_dias_atraso` (02b) |
| Evento simulado antes do despacho | Simulação sempre a partir do Shipping date | `simulados_depois_do_despacho` (02h) |
| Cliente receber "dado simulado" | Marca só nas tabelas; texto em linguagem de operação | `views_de_consumo_sem_marca_de_simulacao`, `textos_de_consumo_sem_termo_simulado` (02b) |
| Nomes antigos voltarem | Lista de proibidos | `view_sem_colunas_proibidas` (02b) |
| Grão confundido | Grão declarado por tabela; Gold conta pedidos | `unicidade_id_item_pedido`, `rastreio_uma_linha_por_pedido` |
| Rota impossível | Doméstico sem alfândega; rodoviário sem voo | `domestico_nunca_passa_na_alfandega`, `rodoviario_nunca_voa`, `rastreio_etapas_coerentes_com_rota` |
| Resultado não reprodutível | Hash, sem `rand()`; `replaceWhere` | 2 execuções do 02g: `EXCEPT ALL` = 0 |
| PII no texto da IA | `nome_cliente` fora da view e do RAG | `rag_sem_nome_cliente` |
| Padrão do instrutor não respeitado | Calibração na base inteira | `distribuicao_60_20_20` (±2 pp no completo) |

---

## 8. Pontos de atenção (monitorar)

| # | Ponto | Situação | Tratamento |
|---|---|---|---|
| 1 | PROCESSING antigos ficam "em trânsito" (2015: 2.448 · 2016: 2.538 · 2017: 2.663 · 2018: 252) | Aceito: a base é histórica | — |
| 2 | Previsão de entrega anterior ao despacho real (atraso no despacho ≥ trânsito) | ~4,2% dos concluídos | Coerente: caem sempre em "Entregue com atraso" |
| 3 | Extravio em pedido COMPLETE | Esperado | COMPLETE = concluído **até o despacho** (doc 04) |
| 4 | Fatias antigas na tabela de eventos (`v1`, `v2`) | Fora das views | Quem ler a **tabela** deve filtrar pela fatia publicada. Limpeza: decisão do Mateus |
| 5 | Colunas de versões antigas em `entregas_simuladas` (`etapa_ocorrencia`, `data_entrega_simulada`...) | NULL na fatia v3 (mergeSchema) | Limpeza junto com as fatias antigas |
| 6 | Gold v3 no piloto cobre só 43 pedidos com desfecho (0,1%) | Indicadores de entrega ainda não representativos | **Geração completa** (escopo `completo`) antes de publicar o dashboard |
| 7 | Gold legado (03) usa `Late delivery` (98.977 itens x 57.811 reais) | Notebook removido | Usar a Gold OBT (03c) |
| 8 | Itens divergentes, país sem hub, cidade sem tradução | 0 / 0 / 0 | Monitorar a cada carga |

### Resultado da validação (piloto v3)
- **02b:** 37 de 37 PASS · **02h:** 28 de 28 PASS.
- 94 pedidos, 561 eventos, 0 em quarentena; view com 180.519 itens (igual à tabela).
- Atraso no despacho inalterado: 57.811 de 101.009 itens; 21.127 de 36.866 pedidos (57,3%).
- Projeção do desfecho na base completa: 60,0 / 20,2 / 19,8; recuperação de 56,2% dos despachos atrasados.

---

## 9. Limitações e evolução
- Trânsito, recuperação, gargalos de trânsito (`v4`: Alfândega e Transferência) e extravio **não são observados**; seguem o padrão calibrado com o instrutor (doc 04).
- A repartição entre atrasos de despacho (`5.066`) e de transporte (`2.369`) na `v4` é **premissa da simulação**, não medição.
- Malha de hubs e modal são premissas.
- **Evolução:** com feed real de transportadora, o 02g grava eventos `origem_evento = 'transportadora'` no mesmo formato; o desfecho passa a ser medido. Tabelas de consumo, testes e consumidores continuam iguais.
