# Databricks notebook source
# =============================================================================
# PROJETO INTEGRADOR ACADEMY - GRUPO 3 (TRANSLOG)
# ETAPA 2j: EXPORTAÇÃO DAS TABELAS DE CONSUMO PARA ARQUIVO (download / Drive)
# Responsável: Engenharia de Dados (Mateus)
# Ordem: rodar depois do 02e (e dos testes 02b/02h), quando quiser uma foto em arquivo.
#
# Gera, no volume /Volumes/workspace/silver/exportacao/, um arquivo por tabela:
#   <tabela>.csv      (cabeçalho, UTF-8, aspas duplas; abrir no Excel por Dados > De Texto/CSV)
#   <tabela>.parquet  (tipos preservados; Python: pandas.read_parquet)
# Tabelas: consumo_pedidos, consumo_itens_pedido, consumo_eventos_logisticos (sem PII).
# Download na máquina (na raiz do repo; data/exportacao/ está no .gitignore):
#   databricks fs cp -r dbfs:/Volumes/workspace/silver/exportacao data/exportacao/silver --overwrite
# O arquivo é uma FOTO: se o pipeline rodar de novo, exporte de novo.
# =============================================================================

# COMMAND ----------

spark.sql("CREATE VOLUME IF NOT EXISTS workspace.silver.exportacao "
          "COMMENT 'Arquivos exportados das tabelas de consumo da Silver (gerado pelo 02j)'")

BASE = "/Volumes/workspace/silver/exportacao"
TABELAS = ["consumo_pedidos", "consumo_itens_pedido", "consumo_eventos_logisticos"]

# COMMAND ----------


def arquivo_unico(df, formato, destino, **opcoes):
    """Escreve 1 arquivo (coalesce(1)) numa pasta temporária e copia para um nome limpo."""
    tmp = f"{BASE}/_tmp_{destino}"
    escrita = df.coalesce(1).write.mode("overwrite").format(formato)
    for k, v in opcoes.items():
        escrita = escrita.option(k, v)
    escrita.save(tmp)
    parte = [f.path for f in dbutils.fs.ls(tmp) if f.name.startswith("part-")]
    assert len(parte) == 1, f"{destino}: esperado 1 arquivo, veio {len(parte)}"
    dbutils.fs.cp(parte[0], f"{BASE}/{destino}")
    dbutils.fs.rm(tmp, recurse=True)


for t in TABELAS:
    df = spark.table(f"workspace.silver.{t}")
    arquivo_unico(df, "csv", f"{t}.csv", header=True, encoding="UTF-8", escape='"')
    arquivo_unico(df, "parquet", f"{t}.parquet")

# COMMAND ----------

# Conferência: arquivos gerados e linhas lidas de volta do CSV x tabela
display(dbutils.fs.ls(BASE))
for t in TABELAS:
    n_csv = spark.read.option("header", True).option("escape", '"').option("multiLine", True).csv(f"{BASE}/{t}.csv").count()
    n_tab = spark.table(f"workspace.silver.{t}").count()
    print(f"{t}: tabela {n_tab} | csv {n_csv}")
    assert n_csv == n_tab, f"{t}: CSV com {n_csv} linhas, tabela com {n_tab}"
