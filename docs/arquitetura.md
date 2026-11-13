# Arquitetura

## Fluxo do MVP

| Componente | Tecnologia | Responsável |
|---|---|---|
| Pipeline | Databricks | Mateus |
| Dashboard | Databricks AI/BI | Marcelo |
| Assistente | Google ADK, DuckDB e Chroma | Marco |
| Portal | Aplicação web local | Matheus |

A Gold é exportada do Databricks para `pipeline/export/` (Parquet) e lida localmente pelo assistente e pelo portal.

## Contratos de dados

Se algum campo mudar, avisar o time antes.

**gold_entregas** (uma linha por pedido)

| Coluna | Origem no DataCo |
|---|---|
| order_id | `Order Id` |
| order_date, shipping_date | `order date (DateOrders)`, `shipping date (DateOrders)` |
| shipping_mode | `Shipping Mode` |
| dias_previstos | `Days for shipment (scheduled)` |
| dias_reais | `Days for shipping (real)` |
| atraso_dias | `dias_reais - dias_previstos` |
| flag_atraso | `Late_delivery_risk` |
| status_entrega | `Delivery Status` |
| market, order_region, order_country, order_city | colunas de mesmo nome |
| latitude, longitude | `Latitude`, `Longitude` |
| categoria | `Category Name` |
| valor_venda, lucro | soma de `Sales` e `Order Profit Per Order` |

**gold_kpi_rota**: por mercado, região, modal e mês, com quantidade de pedidos, % no prazo, trânsito real e previsto, atraso médio e receita em risco.

**gold_eventos_rastreio**: `order_id`, `evento` (criado, enviado, em trânsito, saiu para entrega, entregue, atrasado, cancelado), `timestamp`, `local`.

**Chat (portal ↔ assistente)**

```
POST /chat
{ "pergunta": "...", "order_id": 12345 }
→ { "resposta": "...", "fontes": ["sql", "faq"] }
```

Prazos: Gold exportada em 16/11 e endpoint em 17/11. Até lá, o time usa a amostra de 1.000 pedidos e respostas simuladas.

## KPIs

| KPI | Cálculo |
|---|---|
| % de entregas no prazo | pedidos com `atraso_dias <= 0` / total |
| Tempo de trânsito real x prometido | média de `dias_reais` e de `dias_previstos` |
| Atraso médio | média de `atraso_dias` dos atrasados |
| Gargalos regionais | regiões com maior % de atraso |
| Atraso por modal | % de atraso por `shipping_mode` |
| Receita em risco | soma de `valor_venda` dos atrasados |
| Cancelamentos | pedidos com `Shipping canceled` / total |

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

Custo mensal estimado: a calcular em 18/11.
