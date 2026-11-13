# Bases

Responsável: Mateus.

| Camada | Onde fica | Quem usa |
|---|---|---|
| Bronze | Só no Databricks | Mateus |
| Silver | Só no Databricks | Mateus e Marcelo |
| Gold | Databricks e `gold/` (exportada) | Marco, Matheus e Marcelo |
| Amostra | `amostra/` | Marco e Matheus, até a Gold sair |

Bronze e Silver não vão para o GitHub: são grandes e só são usadas dentro do Databricks.

Na exportação da Gold:
- salvar em Parquet, só com as colunas do contrato ([docs/arquitetura.md](../docs/arquitetura.md));
- se algum arquivo passar de 100 MB, anexar numa Release do repositório.
