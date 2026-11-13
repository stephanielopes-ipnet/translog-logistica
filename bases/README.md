# Bases

Tabelas exportadas do Databricks para o time usar localmente. Responsável: Mateus.

| Pasta | Conteúdo | Quem usa |
|---|---|---|
| `bronze/` | Dado bruto do DataCo | Mateus |
| `silver/` | Dado limpo, sem dados pessoais, com `atraso_dias` | Marcelo (exploração) |
| `gold/` | `gold_entregas`, `gold_kpi_rota`, `gold_eventos_rastreio` | Marco, Matheus e Marcelo |

Salvar em Parquet sempre que possível: o arquivo fica menor e mantém os tipos das colunas. O GitHub não aceita arquivos acima de 100 MB.

Formato das tabelas: [docs/arquitetura.md](../docs/arquitetura.md)
