# Dashboard — TransLog Logística (`dashboard_v2`)

Documentação das consultas e do modelo de dados do painel executivo no Databricks AI/BI (`dashboard_v2`, ID `01f1e431058219bdbc65bf2d1d94947a`).

- **Queries e Data Model completos:** [queries_data_model_gold.md](queries_data_model_gold.md)

## Por que os totais do Dashboard diferem do Portal / IA?

| Camada / Tabela | Consumidor | Universo / Grão | Linhas | Por que é diferente |
|---|---|---|---:|---|
| `silver.consumo_itens_pedido` | Portal / IA (itens) | 1 linha por **item** de pedido | 180.519 | Cada pedido possui ~2,75 itens em média. |
| `silver.consumo_pedidos` | **Portal / Agente de IA** | 1 linha por **pedido** (base completa) | **65.752** | Mantém os **28.886** pedidos não pagos (`26.008`), cancelados (`2.855`) e aguardando pagamento (`23`) para que o cliente consiga rastreá-los no chat. |
| `gold.obt_pedidos_logistica` | **Gold (BI / PMO)** | 1 linha por **pedido despachado** | **36.866** | Exclui pedidos nunca pagos/cancelados antes da expedição (nunca chegaram à transportadora). |
| `gold.obt_pedidos_logistica` (`WHERE fl_com_desfecho = 1`) | **Dashboard (`dashboard_v2`)** | 1 linha por **pedido finalizado** | **36.671** | Exclui os **195** pedidos ainda `Em trânsito` na data de corte (`06/02/2018`) para padronizar 100% dos KPIs sobre desfechos concluídos (`60,0%` no prazo · `20,3%` atrasados · `19,7%` extraviados). |

> **Schema padrão:** Todas as queries do `dashboard_v2` referenciam explicitamente `workspace.gold.*`. Os arquivos `.lvdash.json` locais de backup ficam em `pipeline/dashboards/` (ignorados no Git).
