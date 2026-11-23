# Decisão: o DataCo mede o despacho, e a entrega é simulada

**Projeto:** TransLog, Academy, Grupo 3 · **Área:** Engenharia de Dados · **Status:** abordagem validada com o instrutor (nov/2026)

## 1. Pergunta
O dataset DataCo traz `Shipping date (DateOrders)`, `Days for shipping (real)`, `Days for shipment (scheduled)` e `Delivery Status`. A dúvida era se esses campos medem o tempo **do pedido até a entrega ao cliente** ou **do pedido até o despacho** da mercadoria.

## 2. Verificação de documentação
Seguindo a orientação do instrutor, procuramos primeiro uma fonte que definisse os campos.
- **Não existe documentação oficial** do dataset: nem dicionário de dados, nem descrição do autor que defina os campos.
- As fontes públicas (páginas do Kaggle, notebooks e artigos de quem usou a base) só repetem os nomes das colunas. Nenhuma diz se o tempo vai até o despacho ou até a entrega.
- Pela nomenclatura do setor de logística, *shipping* e *shipment* indicam **expedição/despacho**, ou seja, o envio da mercadoria. O termo para a chegada ao cliente seria *delivery date*, e ele não existe na base.

## 3. Evidências nos dados
| Evidência | O que mostra |
|---|---|
| Prazo real de 0 a 6 dias para 164 países, sem variar com o destino | Uma entrega internacional em 0 a 6 dias, igual para qualquer país, não é plausível. Um prazo de despacho, que só depende do armazém de origem, é |
| O prazo real depende só do modo de envio (First Class sempre 2 dias, Second e Standard de 2 a 6, Same Day 0 ou 1) | O tempo é definido pela operação de origem, e não pela distância |
| `Shipping date − Order date` = `Days for shipping (real)` em 100% dos pedidos | Existe uma única data depois do pedido. Não há outro marco de transporte |
| A hora do `Shipping date` repete a hora do pedido (Same Day: pedido + 12h) | É uma data calculada com precisão de dia, e não um evento registrado |
| `Delivery Status` é 100% derivado de real × programado | Não é um status observado na entrega, é só a comparação de dois prazos |
| 26.031 pedidos não pagos ou retidos (40% da base) têm `Delivery Status` (14.921 deles com *Late delivery*), e 1.650 cancelados têm real > programado | O campo é calculado até para pedidos que nunca saíram, então não descreve uma entrega |

**Conclusão:** adotamos que a base **mede o despacho**. Não existe nenhum dado sobre o transporte nem sobre a chegada ao cliente.

## 4. Por que simular
- A dor da TransLog é o **prazo de entrega**: acompanhar o pedido até o cliente e identificar atrasos. A base para no despacho.
- Sem dados após o despacho, não seria possível responder "onde está meu pedido?" nem "a entrega vai atrasar?".
- Por isso **simulamos as etapas seguintes** (coleta, voo, alfândega, CD, armazém, saída para entrega, entrega ou extravio). Cada evento leva a marcação de dado simulado.
- A estrutura de eventos é a mesma que receberia o rastreio real de uma transportadora. No futuro, basta trocar a fonte, sem mudar o modelo.
- O instrutor validou a abordagem e sugeriu gerar os resultados de entrega com um padrão definido, por exemplo **60% no prazo, 20% com atraso e 20% com extravio**.

## 5. Como cada coisa passa a ser lida
| Campo / indicador | Leitura adotada | Fonte |
|---|---|---|
| `Order date` | Data do pedido | Real |
| `Shipping date` | **Data do despacho** | Real |
| `Days for shipment (scheduled)` | **Prazo prometido de despacho** | Real |
| `Days for shipping (real)` | **Tempo real até o despacho** | Real |
| `Delivery Status` / `Late_delivery_risk` | **Status do prazo de despacho**, válido só para pedidos pagos e não cancelados | Real (derivado) |
| `flag_atraso_despacho`, `dias_atraso_despacho`, `causa_atraso_despacho` | **Atraso no despacho**: o KPI oficial de expedição | Real (derivado) |
| Prazo de entrega prometido (`data_entrega_prevista`) | Despacho previsto + trânsito padrão da rota | Real + premissa |
| Desfecho da entrega (no prazo / com atraso / extraviado) | Padrão 60/20/20 nos pedidos concluídos, sorteado de forma determinística | **Simulado** |
| Data de entrega (`data_entrega_realizada`) | Despacho real + trânsito real | Real + simulado |

### Regra da entrega (como o 60/20/20 convive com 57% de despacho atrasado — atualizado na simulação `v4`)
- **Extraviado (~20% / 7.222 pedidos):** sorteio independente do despacho, concentrado na Alfândega em rotas internacionais.
- **Despacho no prazo ou adiantado:** maioria segue com trânsito padrão e é **entregue no prazo** (`22.014` no total); na versão `v4`, ~`6,5%` dos concluídos (`2.369` pedidos) sofrem **atraso no transporte** (+1 a +3 dias além do padrão, concentrados em **Alfândega** nas rotas internacionais e **Transferência entre hubs** nas domésticas).
- **Despacho atrasado:** o transporte pode **recuperar** o atraso (trânsito mais curto, mínimo de 1 dia) e entregar na data prometida, ou **não recuperar** (trânsito padrão) e a entrega atrasa os mesmos dias do despacho (`5.066` pedidos).
- A fração é calibrada na base inteira para que os pedidos concluídos fechem próximos de **60% no prazo (`60,0%` / `22.014`), 20% com atraso (`20,3%` / `7.435` = `5.066` despacho + `2.369` transporte) e 20% extraviados (`19,7%` / `7.222`)**.
- **Blindagem de `Em trânsito`:** pedidos cujo desfecho ocorre após a data de corte `D = 06/02/2018` (`195` pedidos) permanecem como `Em trânsito` com `transito_real_dias = NULL` e sem vazar motivo futuro.

## 6. Regras de geração (o que vale para os dados simulados)
1. **Nada sobrescreve o DataCo.** Os eventos reais (pedido criado e despacho) mantêm a data original.
2. **Toda linha simulada é identificada nas tabelas** por `origem_evento = 'simulado'` e `dado_simulado = true`. As **views de consumo** (IA e portal) não expõem essa marca: o cliente final não pode receber "dado simulado" numa resposta. A rastreabilidade fica nas tabelas e nesta documentação.
3. **Determinístico e reprodutível.** O sorteio usa hash do pedido (`xxhash64`) e não `rand()`. Rodar de novo gera exatamente os mesmos dados.
4. **Versionado e idempotente.** Cada geração grava a fatia cenário + versão + escopo, sem duplicar.
5. **Só pedidos despachados** (COMPLETE, CLOSED, PROCESSING) ganham transporte. Pendentes, retidos e cancelados ficam só com o evento de criação.
6. **Métricas reais e simuladas não se misturam.** O atraso no despacho é indicador real (base inteira). O atraso na entrega e o extravio vêm da simulação; na Gold eles são calculados à parte e a documentação declara a origem.
7. **Durações simuladas não provam gargalo.** O tempo de cada trecho é um parâmetro, não uma medição.

## 7. Limitações declaradas
- O tempo de transporte, a recuperação de atraso no transporte, os gargalos de trânsito (`v4`: Alfândega e Transferência entre hubs) e os extravios **não são observados**. Eles seguem o padrão calibrado com o instrutor.
- Na simulação `v3`, a premissa era 100% despacho; na `v4`, os atrasos finais foram repartidos entre despacho não recuperado (`5.066`) e atraso de transporte (`2.369`), mantendo o total de ~20% (`20,3%`).
- O `Delivery Status` original continua na base para rastreabilidade, mas não é usado como status de entrega.
