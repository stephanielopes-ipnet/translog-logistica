# Dados e indicadores

Fonte oficial dos números: `workspace.gold.obt_pedidos_logistica` (uma linha por pedido pago e despachado), processada em 19/11/2026. Data de referência da base: 06/02/2018.

## 1. Camadas

| Camada | Conteúdo | Quem lê |
|---|---|---|
| Bronze | DataCo como chegou, sem alteração | Engenharia de dados |
| Silver | Deduplicação, tipagem, dados pessoais removidos, quarentena e regra de atraso corrigida | Engenharia de dados |
| Silver `consumo_*` | Pedidos, itens e eventos no grão de evento, incluindo pedidos aguardando pagamento e cancelados | Portal e LogBot (leitura) |
| Gold | `obt_pedidos_logistica`, rótulo real/simulado por coluna | Dashboard (BI) |

Governança por schema: Mateus edita bronze, silver e gold; Marco e Matheus leem a silver; Marcelo e Mateus editam a gold; o time inteiro visualiza os schemas.

> O notebook `03_gold_kpis_logistica` é **legado**: ainda conta atraso pelo *Delivery Status* original, que marca atraso até em pedido não pago. Não usar no painel.

## 2. Real x simulado

| Origem | O que inclui |
|---|---|
| **Dado real** | Datas do pedido e do despacho, modalidade, prazo prometido, dias até o despacho, atraso e causa do atraso no despacho, destino, receita e lucro |
| **Cenário simulado** | Modal de transporte, trânsito, data de entrega, situação da entrega, extravio e etapa, recuperação do atraso no transporte, receita em risco |

A base original termina no despacho. O trajeto depois dele foi simulado de forma determinística, sempre depois da data real de despacho, e cada coluna da Gold informa a origem.

## 3. Regras de negócio

| Regra | Definição |
|---|---|
| Base dos indicadores de prazo | Pedidos pagos e despachados. Pedidos aguardando pagamento ou cancelados ficam fora, porque o prazo não começou |
| Despacho atrasado | Dias até o despacho maiores que o prazo prometido da modalidade |
| Causa: promessa irreal | Atraso em modalidade que promete até 1 dia (Same Day e First Class) |
| Causa: atraso operacional | Demais atrasos (a base não registra o motivo) |
| Prazo honesto (regra S1) | First Class 2 dias, Same Day 1, Second Class 4, Standard 4 |
| Meta S2 | Despacho em até 4 dias (flag para despachos de 5 ou 6 dias) |
| % de entrega | Sobre pedidos com desfecho (exclui os 195 em trânsito) |
| Caso crítico para a central | Extravio ou atraso de entrega de 3 dias ou mais |
| Período parcial | Janeiro de 2018 e pedidos em trânsito, marcados como parciais |

## 4. Números finais

### Despacho (dado real)

| Indicador | Valor |
|---|---|
| Pedidos pagos e despachados | 36.866 (101.009 itens) |
| Despacho atrasado | **57,3%** (21.127 pedidos) |
| Despacho no prazo | 42,7% (15.739) |
| Atraso médio, entre os atrasados | 1,6 dia |
| Receita bruta total | US$ 20,6 mi |
| Receita com despacho atrasado | US$ 11,8 mi (57,1%) |
| Lucro total / com despacho atrasado | US$ 2,3 mi / US$ 1,3 mi |
| Causa: promessa irreal / operacional | 6.655 / 14.472 pedidos |

### Por modalidade (dado real)

| Modalidade | Pedidos | Promete | Despacha | Atraso hoje | Com prazo honesto |
|---|---|---|---|---|---|
| First Class | 5.693 | 1 dia | sempre em 2 | 100% | 0% |
| Second Class | 7.162 | 2 dias | 2 a 6 (média 4,0) | 79,8% | 39,4% |
| Same Day | 1.987 | 0 dia | 0 ou 1 | 48,4% | 0% |
| Standard Class | 22.024 | 4 dias | 2 a 6 (média 4,0) | 39,7% | 39,7% |
| **Total** | **36.866** | | | **57,3%** | **31,4%** |

Com o prazo honesto, 9.549 pedidos (US$ 5,3 mi em vendas) deixam de atrasar. Os 11.578 restantes são exatamente os despachos de 5 ou 6 dias (US$ 6,4 mi).

### O que não explica o atraso (dado real)

Diferença entre o grupo que mais atrasa e o que menos atrasa, em cada recorte:

| Recorte | Variação | Faixa |
|---|---|---|
| Modalidade | **60,3 p.p.** | 39,7% a 100% |
| Região de destino (23) | 8,7 p.p. | 51,7% a 60,4% |
| Mês do pedido (36 fechados) | 5,1 p.p. | 55,1% a 60,2% |
| País (15 maiores) | 4,4 p.p. | 55,2% a 59,7% |
| Mercado (5) | 2,7 p.p. | 55,8% a 58,5% |
| Departamento (8 maiores) | 2,8 p.p. | 56,0% a 58,8% |
| Dia da semana | 1,9 p.p. | 56,3% a 58,2% |
| Itens no pedido | 1,2 p.p. | 56,5% a 57,8% |
| Segmento de cliente | 0,9 p.p. | 57,1% a 57,9% |
| Tipo de rota | 0,2 p.p. | 57,3% a 57,5% |

Novembro e dezembro: 58,1% de despacho atrasado, contra 57,1% no resto do ano.

### Entrega (cenário simulado)

| Indicador | Valor |
|---|---|
| Pedidos com desfecho | 36.671 (195 em trânsito) |
| Entregue no prazo / com atraso / extraviado | 60,0% / 20,3% / 19,7% |
| Despacho atrasado recuperado no transporte | 70,0% (11.847 de 16.913) |
| Entregas atrasadas que começaram atrasadas no armazém | 68,1% |
| Entrega atrasada: despacho no prazo x atrasado | 15,1% x 24,1% |
| Entrega no prazo: rota doméstica x internacional | 42,9% x 62,5% |
| Extravio por etapa | Alfândega 40,3% · última milha 21,7% · voo 18,5% · transferência 13,7% · coleta 5,7% |
| Casos críticos para a central | 8.388 |

## 5. Premissas e limitações

- O DataCo é uma base pública usada como operação da TransLog.
- O extravio de 19,7% vem dos parâmetros do cenário simulado e não é estimativa da operação.
- A queda da entrega no prazo em abr–ago/2016 vem da simulação do transporte. O despacho real não muda nesse período.
- A receita por pedido cai de out/2017 a jan/2018 por mudança no mix de produtos da base. Não usar como tendência.
- O modal de transporte é atribuído por regra a partir da modalidade. Não explica o atraso.
- A base não registra o motivo do atraso operacional.
