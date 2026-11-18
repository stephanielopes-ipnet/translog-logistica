import { readFileSync } from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { parse } from "csv-parse/sync";
import { onTestFinished } from "vitest";
import { consumoFiles } from "../orders/file-repository.ts";

// Só para testes (fora da imagem Docker): um Databricks falso que responde à SQL Statement
// Execution API com as linhas da amostra `orders/fixtures/consumo/` e à consulta de tabela do
// Unity Catalog (versão das tabelas, que o teste muda em `tableVersion`). Interpreta o SELECT que o
// portal gera: devolve só as colunas pedidas (na ordem pedida) e corta as datas de
// `date_format(...)` (o fake devolve só a data; o portal usa só os 10 primeiros caracteres). Nenhum teste chama o Databricks real.

const SAMPLE_DIR = new URL("../orders/fixtures/consumo/", import.meta.url).pathname;
const SAMPLE = consumoFiles(SAMPLE_DIR);
const SAMPLE_BY_TABLE: Record<string, string> = {
  consumo_pedidos: SAMPLE.orders,
  consumo_itens_pedido: SAMPLE.items,
  consumo_eventos_logisticos: SAMPLE.events,
};

export interface FakeDatabricksOptions {
  /** Quantas consultas de status respondem PENDING/RUNNING antes de SUCCEEDED. Padrão 0. */
  pendingPolls?: number;
  /** Nunca sai de PENDING (para o teste de timeout). */
  neverFinishes?: boolean;
  /** Em quantos pedaços dividir cada resultado. Padrão 1. */
  chunks?: number;
  /** Status HTTP de todas as chamadas à API (ex.: 401). */
  httpStatus?: number;
  /** Tabela que termina com FAILED / TABLE_OR_VIEW_NOT_FOUND. */
  missingTable?: string;
  /** Linhas a mais (como objetos coluna → valor) no resultado de uma tabela. */
  extraRows?: Record<string, Record<string, string>[]>;
  /** A consulta de tabela do Unity Catalog responde HTTP 503 (o resto funciona). */
  catalogUnavailable?: boolean;
}

export interface FakeDatabricks {
  /** Endereço base (`http://127.0.0.1:<porta>`), aceito em DATABRICKS_HOST nos testes. */
  baseUrl: string;
  /** SQL recebido em cada POST. */
  statements: string[];
  /** Header Authorization de cada requisição, por caminho. */
  requests: { path: string; authorization: string | undefined }[];
  /** Versão Delta das tabelas no Unity Catalog; o teste aumenta para simular uma escrita. */
  tableVersion: number;
}

interface Statement {
  id: string;
  table: string;
  chunks: string[];
  polls: number;
}

export async function startFakeDatabricks(
  options: FakeDatabricksOptions = {},
): Promise<FakeDatabricks> {
  const statements: string[] = [];
  const requests: FakeDatabricks["requests"] = [];
  const fake: FakeDatabricks = { baseUrl: "", statements, requests, tableVersion: 1 };
  const byId = new Map<string, Statement>();
  let baseUrl = "";

  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      const path = req.url ?? "";
      requests.push({ path, authorization: req.headers.authorization });
      if (path.startsWith("/storage/")) {
        const [, id = "", index = ""] = path.match(/^\/storage\/([^/]+)\/(\d+)/) ?? [];
        res.end(byId.get(id)?.chunks[Number(index)] ?? "");
        return;
      }
      if (options.httpStatus) {
        json(res, options.httpStatus, {
          error_code: "UNAUTHENTICATED",
          message: "Credential was not sent or was invalid",
        });
        return;
      }
      const table = path.match(/^\/api\/2\.1\/unity-catalog\/tables\/([\w.]+)$/)?.[1];
      if (table) {
        if (options.catalogUnavailable) {
          json(res, 503, { error_code: "TEMPORARILY_UNAVAILABLE", message: "try again" });
          return;
        }
        json(res, 200, {
          full_name: table,
          table_id: `id-${table}`,
          updated_at: 1_763_000_000_000,
          properties: {
            "delta.lastUpdateVersion": String(fake.tableVersion),
            "delta.lastCommitTimestamp": String(1_763_000_000_000 + fake.tableVersion),
          },
        });
        return;
      }
      if (req.method === "POST" && path === "/api/2.0/sql/statements") {
        const { statement } = JSON.parse(body) as { statement: string };
        statements.push(statement);
        const created = createStatement(statement, `st-${statements.length}`);
        byId.set(created.id, created);
        json(res, 200, describe(created));
        return;
      }
      const chunkLink = path.match(
        /^\/api\/2\.0\/sql\/statements\/([^/]+)\/result\/chunks\/(\d+)$/,
      );
      if (chunkLink) {
        const statement = byId.get(chunkLink[1] ?? "");
        json(res, 200, {
          external_links: statement ? [link(statement, Number(chunkLink[2]))] : [],
        });
        return;
      }
      const statusLink = path.match(/^\/api\/2\.0\/sql\/statements\/([^/]+)(\/cancel)?$/);
      const statement = byId.get(statusLink?.[1] ?? "");
      if (statement) {
        statement.polls++;
        json(res, 200, describe(statement));
        return;
      }
      json(res, 404, { error_code: "NOT_FOUND", message: "not found" });
    });
  });

  function createStatement(sql: string, id: string): Statement {
    const table = sql.match(/ FROM [\w.]+\.(consumo_\w+)/)?.[1] ?? "";
    const file = SAMPLE_BY_TABLE[table];
    if (!file || table === options.missingTable) {
      return { id, table, chunks: [], polls: 0 };
    }
    const selected = [
      ...sql.matchAll(/coalesce\((date_format|CAST)\(\w+[^)]*\), ''\) AS (\w+)/g),
    ].map(([, fn, alias]) => ({ name: alias ?? "", isDate: fn === "date_format" }));
    const sample: Record<string, string>[] = parse(readFileSync(file, "utf8"), { columns: true });
    const records = [...sample, ...(options.extraRows?.[table] ?? [])];
    const rows = records.map((record) =>
      selected
        .map(({ name, isDate }) =>
          quote(isDate ? (record[name] ?? "").slice(0, 10) : (record[name] ?? "")),
        )
        .join(","),
    );
    const header = selected.map((column) => column.name).join(",");
    const parts = Math.max(1, options.chunks ?? 1);
    const size = Math.ceil(rows.length / parts);
    const chunks = Array.from({ length: parts }, (_, index) => {
      const lines = rows.slice(index * size, (index + 1) * size);
      // O primeiro pedaço traz o cabeçalho; os outros, às vezes também (o cliente aceita os dois).
      return `${index === 0 || index % 2 === 0 ? `${header}\n` : ""}${lines.join("\n")}\n`;
    });
    return { id, table, chunks, polls: 0 };
  }

  function describe(statement: Statement) {
    if (statement.chunks.length === 0) {
      return {
        statement_id: statement.id,
        status: {
          state: "FAILED",
          error: {
            error_code: "BAD_REQUEST",
            message: `[TABLE_OR_VIEW_NOT_FOUND] The table or view \`${statement.table}\` cannot be found.`,
          },
        },
      };
    }
    if (options.neverFinishes || statement.polls < (options.pendingPolls ?? 0)) {
      return {
        statement_id: statement.id,
        status: { state: statement.polls === 0 ? "PENDING" : "RUNNING" },
      };
    }
    const header = statement.chunks[0]?.split("\n")[0] ?? "";
    const totalRows = statement.chunks
      .join("")
      .split("\n")
      .filter((line) => line !== "" && line !== header).length;
    return {
      statement_id: statement.id,
      status: { state: "SUCCEEDED" },
      manifest: {
        format: "CSV",
        schema: { columns: header.split(",").map((name) => ({ name })) },
        total_row_count: totalRows,
        total_chunk_count: statement.chunks.length,
      },
      result: { external_links: [link(statement, 0)] },
    };
  }

  function link(statement: Statement, index: number) {
    return {
      chunk_index: index,
      external_link: `${baseUrl}/storage/${statement.id}/${index}?assinatura=falsa`,
      ...(index + 1 < statement.chunks.length
        ? {
            next_chunk_internal_link: `/api/2.0/sql/statements/${statement.id}/result/chunks/${index + 1}`,
          }
        : {}),
    };
  }

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  onTestFinished(() => new Promise<void>((resolve) => server.close(() => resolve())));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  fake.baseUrl = baseUrl;
  return fake;
}

function json(res: ServerResponse, status: number, body: object) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function quote(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}
