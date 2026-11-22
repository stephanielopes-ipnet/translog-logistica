# Arquitetura

## Fluxo do MVP

```
DataCo (CSV) → Bronze → Silver ──→ consumo_* (pedidos, itens, eventos) ──→ Portal (API + tela)
                          │                                           └──→ LogBot (agente ADK)
                          └──→ Gold: obt_pedidos_logistica ──→ Dashboard de diagnóstico
```

| Componente | Tecnologia | Responsável | Onde está |
|---|---|---|---|
| Pipeline Medallion | Databricks Free Edition (SQL e PySpark, Delta) | Mateus | `pipeline/` |
| Dashboard | Databricks AI/BI sobre a Gold | Marcelo | `dashboard/` |
| LogBot | Google ADK com Gemini, consulta estruturada dos pedidos e Chroma para a FAQ (18 trechos) | Marco | `agent/` |
| Portal | React (tela), Fastify em Node (API), contratos Zod, Docker | Matheus | `portal/` |

O portal e o LogBot leem as tabelas `consumo_*` da Silver, porque precisam do grão de evento e dos pedidos aguardando pagamento ou cancelados, que o cliente consulta. O dashboard lê a Gold, que já traz os agregados por pedido. Fonte alternativa sem internet: os mesmos dados exportados em CSV.

## Contratos de dados

Se algum campo mudar, avisar o time antes.

**Silver `consumo_*`** (portal e LogBot, só leitura)

| Tabela | Grão | Uso |
|---|---|---|
| `consumo_pedidos` | pedido | Situação, prazos, destino, motivo provável, linha do tempo resumida |
| `consumo_itens` | item | Itens do pedido |
| `consumo_eventos` | evento | Linha do tempo: coleta, voo, alfândega, transferência, última milha |

Dados pessoais e financeiros (identificação do cliente, segmento, desconto, preço unitário) não são lidos pelo portal.

**Gold `obt_pedidos_logistica`** (dashboard): uma linha por pedido pago e despachado, 67 colunas, cada uma rotulada como dado real ou cenário simulado. Dicionário e regras em [dados-e-indicadores.md](dados-e-indicadores.md).

**Chat (tela → API do portal → agente)**

```
POST /api/chat
{ "sessionId": "uuid", "message": "Por que meu pedido atrasou?", "orderId": 76902 }
→ { "sessionId": "uuid", "reply": "...", "mentionedOrderId": 76902 }
```

A tela fala só com a API do portal, nunca direto com o modelo. Contrato em `portal/contracts/src/chat.ts`; documentação da API em `/docs` do portal. Se a IA ficar indisponível, a API usa o assistente reserva (`AGENT=mock`), que lê os mesmos dados.

## KPIs

| KPI | Cálculo (Gold) |
|---|---|
| % de despacho atrasado | `SUM(fl_despacho_atrasado) / COUNT(*)` |
| Atraso médio no despacho | `AVG(dias_atraso_despacho)` entre os atrasados |
| Atraso com prazo honesto | `SUM(fl_despacho_atrasado_prazo_sugerido) / COUNT(*)` |
| Despachos acima de 4 dias | `SUM(fl_despacho_acima_4_dias) / COUNT(*)` |
| Receita com despacho atrasado | soma de `receita_bruta_pedido` dos atrasados |
| % de entrega no prazo (simulado) | `SUM(fl_entregue_no_prazo) / SUM(fl_com_desfecho)` |
| % de recuperação no transporte (simulado) | `SUM(fl_recuperou_atraso) / SUM(fl_despacho_atrasado_entregue)` |

## Alertas e SLA

| Alerta | Quando dispara | Prazo de resposta |
|---|---|---|
| Pedido atrasado | Prazo prometido vencido sem entrega | 4h úteis |
| Região em queda | % no prazo 10 p.p. abaixo da meta na semana | 1 dia útil |
| Pipeline parado | Gold sem atualização há 24h | 2h |
| Assistente fora do ar | 3 falhas seguidas | 1h |

## Arquitetura em Google Cloud

```
Veículos → Pub/Sub → Dataflow → BigQuery → Looker (gestão)
                                         → Vertex AI Agent ↔ Cloud Run (portal)
                                         → Cloud Monitoring (alertas)
```

| Camada | MVP | Google Cloud |
|---|---|---|
| Ingestão | CSV | Pub/Sub e Dataflow |
| Dados | Databricks | Cloud Storage e BigQuery |
| BI | Databricks AI/BI | Looker |
| Assistente | ADK local | Vertex AI Agent Engine |
| Portal | Local | Cloud Run |
| Segurança | `.env` | IAM e Secret Manager |

Comparação com AWS: o BigQuery não exige gerenciar cluster, ao contrário do Redshift, o que reduz o esforço de operação para uma transportadora sem time de dados. O ADK usado no MVP é o mesmo que roda no Vertex AI, sem reescrita.

O custo mensal em Google Cloud não foi estimado: a arquitetura em nuvem é conceitual neste desafio e o MVP roda em Databricks Free Edition e localmente.
