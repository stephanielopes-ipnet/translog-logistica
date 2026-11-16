import { describe, expect, it } from "vitest";
import { type ConsumoTable, FORBIDDEN_COLUMNS, READ_COLUMNS } from "./consumo-mapper.ts";
import { EXPORT_COLUMNS, selectStatement } from "./consumo-sql.ts";

const TABLES: ConsumoTable[] = ["orders", "items", "events"];

/** Colunas que aparecem no SELECT (nome final de cada expressão). */
function selectedColumns(sql: string): string[] {
  const list = sql.slice("SELECT ".length, sql.indexOf(" FROM "));
  return list
    .split("'') AS ")
    .slice(1)
    .map((rest) => rest.split(", ")[0] ?? rest);
}

describe("selectStatement", () => {
  it("lista colunas explícitas como texto (NULL vira vazio), corta timestamps e ordena", () => {
    expect(selectStatement("workspace.silver", "items")).toBe(
      "SELECT coalesce(CAST(id_pedido AS STRING), '') AS id_pedido, " +
        "coalesce(CAST(id_item_pedido AS STRING), '') AS id_item_pedido, " +
        "coalesce(CAST(nome_produto AS STRING), '') AS nome_produto, " +
        "coalesce(CAST(categoria_produto AS STRING), '') AS categoria_produto, " +
        "coalesce(CAST(quantidade_item AS STRING), '') AS quantidade_item, " +
        "coalesce(CAST(valor_item_pedido AS STRING), '') AS valor_item_pedido " +
        "FROM workspace.silver.consumo_itens_pedido ORDER BY id_pedido, id_item_pedido",
    );
  });

  it.each(TABLES)("nenhuma coluna proibida no SQL de leitura nem no de export (%s)", (table) => {
    for (const columns of [READ_COLUMNS[table], EXPORT_COLUMNS[table]]) {
      const sql = selectStatement("workspace.silver", table, columns);

      expect(sql).not.toContain("*");
      expect(selectedColumns(sql)).toEqual([...columns]);
      for (const forbidden of FORBIDDEN_COLUMNS) {
        expect(sql).not.toMatch(new RegExp(`\\b${forbidden}\\b`));
      }
    }
  });

  it.each(TABLES)("o export traz todas as colunas que o portal lê (%s)", (table) => {
    const exported: readonly string[] = EXPORT_COLUMNS[table];

    expect(READ_COLUMNS[table].filter((column) => !exported.includes(column))).toEqual([]);
  });

  it("formata as datas de pedido e de evento no próprio SQL", () => {
    expect(selectStatement("workspace.silver", "orders")).toContain(
      "coalesce(date_format(data_pedido, 'yyyy-MM-dd'), '') AS data_pedido",
    );
    expect(selectStatement("workspace.silver", "orders", EXPORT_COLUMNS.orders)).toContain(
      "coalesce(date_format(ts_ultimo_evento, 'yyyy-MM-dd'), '') AS ts_ultimo_evento",
    );
  });

  it.each(["id_cliente", "segmento_cliente", "preco_unitario", "id_produto"])(
    "recusa a coluna proibida %s",
    (column) => {
      expect(() => selectStatement("workspace.silver", "orders", ["id_pedido", column])).toThrow(
        `Colunas recusadas na consulta: ${column}.`,
      );
    },
  );

  it.each(["workspace", "workspace.silver; DROP TABLE x", "a.b.c", "work space.silver"])(
    "recusa schema fora do padrão catalogo.schema: %j",
    (schema) => {
      expect(() => selectStatement(schema, "orders")).toThrow("Schema inválido");
    },
  );

  it("recusa nome de coluna com caracteres fora do padrão", () => {
    expect(() => selectStatement("workspace.silver", "orders", ["id_pedido", "1; --"])).toThrow(
      "Colunas recusadas",
    );
  });
});
