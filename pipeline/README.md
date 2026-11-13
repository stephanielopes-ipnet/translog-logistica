# Pipeline

Responsável: Mateus

## Onde ficam os dados

| O quê | Onde | Vai para o GitHub? |
|---|---|---|
| CSV original do DataCo | Databricks (upload em um Volume) | Não, é grande e está no Kaggle |
| Tabelas Bronze, Silver e Gold | Databricks, catálogo `translog` | Não |
| Notebooks | `pipeline/notebooks/` | Sim |
| Amostra de 1.000 pedidos | `pipeline/export/amostra_entregas.csv` | Sim |
| Gold exportada | `pipeline/export/*.parquet` | Sim |

## Estrutura

```
pipeline/
  notebooks/
    01_bronze.py
    02_silver.py
    03_gold.py
  export/
    amostra_entregas.csv
    gold_entregas.parquet
    gold_kpi_rota.parquet
    gold_eventos_rastreio.parquet
```

O Marco e o Matheus leem os arquivos de `export/` localmente. O formato das tabelas está em [docs/arquitetura.md](../docs/arquitetura.md).
