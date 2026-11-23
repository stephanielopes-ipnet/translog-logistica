# Pipeline de Dados — TransLog Logística

Notebooks Databricks (SQL e PySpark) do pipeline Medallion (**Bronze → Silver → Gold**) e gerador de dashboard AI/BI. Responsável: Engenharia de Dados (Mateus).

> Para o detalhamento completo de colunas, tipos, grãos e regras de negócio, consulte o [Dicionário de Dados](docs/DATA_DICTIONARY.md).

---

## 1. Arquitetura Atual (Medallion + Simulação Pós-Despacho)

O dataset de origem (*DataCo Supply Chain*) registra pedidos e o **despacho** (`Shipping date`), mas não possui eventos de transporte nem entrega final. Por isso:
- **Despacho (até a expedição):** tratado como **dado real** (calculado em `02a` apenas para pedidos pagos e despachados: `COMPLETE`, `CLOSED`, `PROCESSING`).
- **Pós-despacho (eventos, hubs e entrega):** **simulado de forma determinística** (`02d`, `02f`, `02g`) via `xxhash64(id_pedido, ...)`, calibrado em **60% no prazo / 20% com atraso / 20% extraviado** sobre pedidos concluídos, com corte temporal na data de referência da base (`D = 06/02/2018`).

```text
Landing Volume (/Volumes/workspace/default/landing_translog/)
  ├── DataCoSupplyChainDataset.csv ──► [01]  bronze.dataco_raw
  └── de_para.csv (+ modo_envio)   ──► [01b] silver.dim_traducao
                                          │
                                          ▼
  [02a] Limpeza, LGPD, despacho real, quarentena e data de referência D
     ├──► silver.pedidos_rastreio (tabela interna, grão item)
     └──► silver.pedidos_quarentena
            │
            ▼
  [02d] Malha física simulada ──► silver.dim_hubs
            │
            ▼
  [02g] (%run 02f) Simulação determinística pós-despacho
     ├──► silver.eventos_logisticos
     ├──► silver.entregas_simuladas
     ├──► silver.eventos_logisticos_quarentena
     └──► silver.simulacao_publicada (fatia ativa: cenario/versao/escopo)
            │
            ▼
  [02i] Consolidação da fatia publicada
     ├──► silver.rastreio_pedidos (tabela interna, grão pedido, dado_simulado)
     └──► silver.consumo_eventos_logisticos  ──► Portal FullStack / IA
            │
            ▼
  [02e] Tabelas de consumo finais (pt-BR, sem PII, sem marca de simulação)
     ├──► silver.consumo_pedidos (CDF ligado) ──► IA (RAG / Vector Search) + Portal
     └──► silver.consumo_itens_pedido         ──► Portal FullStack / IA
            │
            ├──► [02b / 02h / 02c] Testes de qualidade e auditoria
            ├──► [02j] Exportação CSV/Parquet para /Volumes/workspace/silver/exportacao/
            │
            ▼
  [03c] Camada Gold OBT (escopo: 36.866 pedidos despachados)
     ├──► gold.obt_pedidos_logistica
     ├──► gold.obt_itens_risco
     ├──► gold.obt_eventos_etapas
     ├──► gold.param_cenario_prazo
     └──► gold.vw_cenarios_prazo ──► [dashboards/gerar_dashboard_gold.py] translog_gold.lvdash.json
            │
            ▼
  [03d] Validação automatizada da Gold (assert_true)
```

---

## 2. Ordem de Execução e Linhagem dos Notebooks

| Ordem | Arquivo | Tipo | O que gera / valida |
|---|---|---|---|
| 1 | [`notebooks/01_bronze_ingestao.sql`](notebooks/01_bronze_ingestao.sql) | Ingestão | Schemas `bronze`, `silver`, `gold` e tabela `bronze.dataco_raw`. |
| 2 | [`notebooks/01b_silver_dim_traducao.sql`](notebooks/01b_silver_dim_traducao.sql) | Dimensão | `silver.dim_traducao` (`de_para.csv` + tradução de `modo_envio`). |
| 3 | [`notebooks/02a_silver_tratamento_rotas_atrasos.sql`](notebooks/02a_silver_tratamento_rotas_atrasos.sql) | Silver | `silver.pedidos_rastreio` e `silver.pedidos_quarentena`. |
| 4 | [`notebooks/02d_silver_rastreio_simulado.sql`](notebooks/02d_silver_rastreio_simulado.sql) | Simulação | `silver.dim_hubs` (gateways, CDs, alfândegas e armazéns estaduais). |
| 5 | [`notebooks/02f_silver_preparacao_simulacao.py`](notebooks/02f_silver_preparacao_simulacao.py) | Simulação (helper) | Chamado via `%run` pelo `02g`; prepara DataFrames base, modal, hubs e amostra/escopo. |
| 6 | [`notebooks/02g_silver_geracao_eventos.py`](notebooks/02g_silver_geracao_eventos.py) | Simulação | `silver.eventos_logisticos`, `silver.entregas_simuladas`, `silver.eventos_logisticos_quarentena`, `silver.simulacao_publicada`. |
| 7 | [`notebooks/02i_silver_consolidacao_rastreio.sql`](notebooks/02i_silver_consolidacao_rastreio.sql) | Silver + Consumo | `silver.rastreio_pedidos` e **`silver.consumo_eventos_logisticos`**. |
| 8 | [`notebooks/02e_silver_view_consumo.sql`](notebooks/02e_silver_view_consumo.sql) | Consumo | **`silver.consumo_pedidos`** e **`silver.consumo_itens_pedido`**. |
| 9 | [`notebooks/02b_silver_qualidade.sql`](notebooks/02b_silver_qualidade.sql) | Qualidade | Painel PASS/FAIL de reconciliação, LGPD, tradução, hubs e consumo. |
| 10 | [`notebooks/02h_silver_validacao_eventos.sql`](notebooks/02h_silver_validacao_eventos.sql) | Qualidade | Painel PASS/FAIL da simulação e distribuição 60/20/20 (com `assert_true`). |
| 11 | [`notebooks/02c_silver_auditoria_consumidores.py`](notebooks/02c_silver_auditoria_consumidores.py) | Auditoria | Consultas somente leitura simulando o acesso de IA e FullStack. |
| 12 | [`notebooks/03c_gold_obt.sql`](notebooks/03c_gold_obt.sql) | Gold | **`gold.obt_pedidos_logistica`**, **`gold.obt_itens_risco`**, **`gold.obt_eventos_etapas`**, `gold.param_cenario_prazo` e **`gold.vw_cenarios_prazo`**. |
| 13 | [`notebooks/03d_gold_validacao.sql`](notebooks/03d_gold_validacao.sql) | Qualidade Gold | Validação de grão, KPIs contra gabarito da Silver, LGPD e cenários (com `assert_true`). |
| Opcional | [`notebooks/02j_silver_exportacao_consumo.py`](notebooks/02j_silver_exportacao_consumo.py) | Exportação | Exporta `silver.consumo_*` em CSV e Parquet para `/Volumes/workspace/silver/exportacao/`. |
| Dashboard | [`dashboards/gerar_dashboard_gold.py`](dashboards/gerar_dashboard_gold.py) | BI | Gera [`dashboards/translog_gold.lvdash.json`](dashboards/translog_gold.lvdash.json) lendo `gold.vw_cenarios_prazo` e `gold.obt_eventos_etapas`. |

---

## 3. Propósito das Tabelas de Consumo (Portal/IA vs. Dashboard)

| Objeto | Grão / Escopo | Linhas | Consumidor | Propósito |
|---|---|---|---|---|
| `silver.consumo_pedidos` | Pedido (universo completo) | **65.752** | **IA (RAG / Vector Search) + Portal** | Visão completa do pedido em pt-BR (sem PII nem marca de simulação), com `resumo_pedido` e `linha_do_tempo`. Inclui `28.886` pedidos não pagos/cancelados para atendimento ao cliente. |
| `silver.consumo_itens_pedido` | Item (universo completo) | **180.519** | **Portal FullStack / IA** | Produtos, quantidades e valores por item de cada pedido. |
| `silver.consumo_eventos_logisticos` | Evento (universo completo) | **350.421** | **Portal FullStack / IA** | Linha do tempo granular (data, etapa, hub e local) da fatia publicada (`v4`). |
| `gold.obt_pedidos_logistica` | Pedido despachado (`36.866` total · **`36.671` finalizados**) | **36.866** | **Dashboard (`dashboard_v2`) / PMO** | OBT executiva de despacho (real), entrega/extravio (simulado) e receita/lucro em risco. Exclui pedidos nunca pagos/cancelados (`28.886`). No `dashboard_v2`, todas as consultas padronizam `WHERE fl_com_desfecho = 1` (`36.671` finalizados, excluindo `195` em trânsito). |
| `gold.obt_itens_risco` | Item despachado | **101.009** | BI (ad-hoc) | Receita e lucro em risco desdobrados por departamento, categoria e produto. |
| `gold.obt_eventos_etapas` | Pedido × etapa | **201.643** | **Dashboard (`dashboard_v2`)** | Concentração de atrasos não recuperados e extravios por etapa (`1` a `5`). |
| `gold.vw_cenarios_prazo` | Pedido × cenário | **73.732** | BI (cenários) | Compara cenários de promessa (`Promessa atual` vs. `Promessa ajustada` parametrizada em `gold.param_cenario_prazo`). |

> **Regra de reconciliação Portal × Dashboard:** O **Portal/IA** exibe **`65.752` pedidos** porque responde também sobre pedidos não pagos ou cancelados no e-commerce; já o **Dashboard executivo** analisa apenas os **`36.671` pedidos finalizados** que de fato passaram pela transportadora e já possuem desfecho concluído. Caso o Portal exiba métricas operacionais da transportadora lendo `silver.consumo_pedidos`, deve filtrar apenas pedidos despachados/concluídos (ou ler da `gold.*`).

---

## 4. Documentação Complementar e Pastas Locais

- **Docs do pipeline (`pipeline/docs/`):**
  - [`DATA_DICTIONARY.md`](docs/DATA_DICTIONARY.md) — dicionário de dados completo da Silver, Gold e fluxo sintético.
  - [`03_camada_silver_tratamentos.md`](docs/03_camada_silver_tratamentos.md) — regras de tratamento e qualidade da Silver.
  - [`04_decisao_premissa_despacho.md`](docs/04_decisao_premissa_despacho.md) — evidências de que o DataCo mede despacho e premissas da simulação 60/20/20.
  - [`05_arquitetura_dados_silver.md`](docs/05_arquitetura_dados_silver.md) — arquitetura detalhada e testes da Silver.
  - [`06_guia_dados_ia.md`](docs/06_guia_dados_ia.md) — guia de consumo de `silver.consumo_*` para IA e Portal.
  - [`07_guia_gold_obt_analista.md`](docs/07_guia_gold_obt_analista.md) — guia de uso das OBTs e `vw_cenarios_prazo` para BI.
  - [`08_cenarios_prazo_despacho.md`](docs/08_cenarios_prazo_despacho.md) — análise de sensibilidade dos cenários de prazo.
- **Diretórios ignorados pelo Git (`.gitignore`):** `pipeline/data/` (CSVs brutos, de-paras e exports locais), `pipeline/notebooks_databricks/` (cópias legadas exportadas do Databricks) e `pipeline/exploracao/` (notebooks de EDA).
