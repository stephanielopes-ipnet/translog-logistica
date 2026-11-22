# Alinhamento Técnico para BI — Portal vs. Dashboard (`dashboard_v2`)

O **Portal** e o **Dashboard (`dashboard_v2`)** consomem recortes distintos e complementares do mesmo pipeline de dados no Databricks (`v4`), definidos pelo propósito de cada produto (atendimento operacional em tempo real vs. análise gerencial consolidada).

| Critério | Portal (Rastreamento e Torre de Controle) | Dashboard (`dashboard_v2`) |
| --- | --- | --- |
| **Objetivo** | Consulta pública de pedidos, atendimento via LogBot e monitoramento operacional no Dia D (`06/02/2018`). | Análise executiva de desempenho histórico e simulação de impacto de novos SLAs. |
| **Camada / Tabela** | `silver.consumo_pedidos` (1 linha por pedido registrado na loja). | `gold.obt_pedidos_logistica` (1 linha por pedido despachado com ciclo encerrado). |
| **Universo de Pedidos** | **`65.752` pedidos totais** na Home e no cabeçalho da Torre de Controle; **`36.866` despachados** na tabela de modalidades. | **`36.671` pedidos finalizados** (`36,67 mil`, filtro `WHERE fl_com_desfecho = 1`) em 100% das consultas. |
| **Não Pagos / Cancelados (`28.886`)** | **Incluídos** no universo de `65.752` (`26.008` expirados, `2.855` cancelados, `23` aguardando) para que clientes e chatbot possam consultar qualquer pedido da loja. | **Excluídos**, pois são falhas de checkout/pagamento e nunca chegaram à transportadora TransLog. |
| **Em Trânsito (`195` no Dia D)** | **Incluídos** no card *"Em trânsito agora"* (`195`, sendo `40` atrasados e `23` com 3+ dias) e no denominador da tabela de modalidades (`36.866`). | **Excluídos** (`fl_com_desfecho = 1`), evitando distorcer métricas de pontualidade com viagens ainda em andamento. |
| **Indicadores Principais** | • Distribuição por mercado sobre `65.752` pedidos<br>• Entrega atrasada por modalidade sobre despachos ativos (`21,8%` Standard, `28,0%` Second, `34,0%` First, `27,6%` Same Day)<br>• `7.222` extravios e `8.388` casos históricos encaminhados à central | • Receita de **`$ 20,59 mi`** (`$ 20,6 mi`) e ticket médio de **`$ 561,35`**<br>• Desfechos fechando em **`100%`**: **`60,0%`** no prazo (`22.014`) + **`20,3%`** atrasadas (`7.435`) + **`19,7%`** extraviados (`7.222`)<br>• Despacho atrasado: **`57,3%` → `15,7%`**<br>• Entrega atrasada: **`20,3%` → `6,2%`** (`7.435` → `2.257` pedidos) |

---

### Pontos de Atenção para Alinhamento Técnico

* **Diferenças legítimas de escopo (não são erros de cálculo):** As pequenas variações de percentual entre o Portal e o Dashboard ocorrem porque o Portal mantém os `195` pedidos em trânsito no denominador. Da mesma forma, o card de `8.388` casos encaminhados à central no Portal representa o acumulado histórico de extravios (`7.222`) e atrasos de 3+ dias (`1.166`, incluindo pedidos antigos já entregues), enquanto os `195` em trânsito refletem apenas a foto ativa de `06/02/2018`.

* **Padronização aplicada no `dashboard_v2`:** Todas as 14 queries ativas do painel foram uniformizadas em `WHERE fl_com_desfecho = 1` (`36.671` pedidos). Na **Aba 5 (`5 · impacto nas entregas`)**, o impacto na entrega final cai de **`20,3%` → `6,2%`** no consolidado e, por classe de serviço, apresenta:
  * **First Class:** `27,4% → 0,0%` (`1.557 → 0` pedidos)
  * **Same Day:** `22,2% → 5,6%` (`441 → 112` pedidos)
  * **Second Class:** `22,5% → 5,8%` (`1.601 → 415` pedidos)
  * **Standard Class:** `17,5% → 7,9%` (`3.836 → 1.730` pedidos)

* **Detalhamento completo das queries:** todas as 14 consultas SQL e as 5 tabelas do Data Model estão documentadas em [queries_data_model_gold.md](queries_data_model_gold.md).

