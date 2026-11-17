import { createReadStream } from "node:fs";
import { join } from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { parse } from "csv-parse";
import type { z } from "zod";
import {
  CONSUMO_TABLES,
  type ConsumoTable,
  mapConsumoOrder,
  type OrderRow,
  READ_COLUMNS,
} from "./consumo-mapper.ts";
import type { OrderRecord } from "./order-record.ts";
import { createInMemoryRepository, type OrderRepository } from "./order-repository.ts";

/** O que a carga precisa do log (o `app.log` do Fastify serve). */
export interface LoadLogger {
  info(details: object, message: string): void;
  warn(details: object, message: string): void;
}

/** Uma tabela em CSV: nome para mensagens e log, e como abrir o fluxo de bytes. */
export interface CsvSource {
  name: string;
  open(): Readable;
}

export type ConsumoSources = Record<ConsumoTable, CsvSource>;

/** Avisos detalhados de linha inválida no log; além disso, só a contagem (evita inundar o log). */
const MAX_INVALID_WARNINGS = 10;

const ORDER_ID_TEXT = /^\d{1,10}$/;

/** Arquivos que o adapter `file` espera dentro de `DATA_DIR`. */
export function consumoFiles(dir: string): Record<ConsumoTable, string> {
  return {
    orders: join(dir, `${CONSUMO_TABLES.orders}.csv`),
    items: join(dir, `${CONSUMO_TABLES.items}.csv`),
    events: join(dir, `${CONSUMO_TABLES.events}.csv`),
  };
}

/**
 * Adapter `file`: lê as três tabelas `consumo_*` em CSV da pasta `DATA_DIR`
 * (`consumo_pedidos.csv`, `consumo_itens_pedido.csv`, `consumo_eventos_logisticos.csv`).
 * Pasta ou arquivo ausente, vazio ou sem as colunas esperadas impede a API de subir.
 */
export async function loadFileRepository(dir: string, log: LoadLogger): Promise<OrderRepository> {
  const files = consumoFiles(dir);
  const source = (table: ConsumoTable): CsvSource => ({
    name: `${CONSUMO_TABLES[table]}.csv`,
    open: () => createReadStream(files[table]),
  });
  try {
    const orders = await loadConsumoOrders(
      { orders: source("orders"), items: source("items"), events: source("events") },
      log,
      { dataDir: dir },
    );
    return createInMemoryRepository(orders);
  } catch (error) {
    throw new Error(`Não foi possível ler DATA_DIR (${dir}): ${describeError(error)}`);
  }
}

/**
 * Carga comum às fontes em CSV: lê as três tabelas em streaming, uma de cada vez, e devolve os
 * pedidos convertidos (`Map` por número do pedido).
 *
 * - Só as colunas de `READ_COLUMNS` são copiadas de cada registro; as proibidas (dados do
 *   cliente, preço, desconto etc.) são descartadas ali mesmo, antes de agrupar ou converter.
 * - Linhas inválidas (colunas faltando, número de pedido inválido ou repetido, item ou evento
 *   sem pedido, pedido fora do contrato) são contadas e logadas sem conteúdo (só tabela,
 *   número do registro, número do pedido e nome dos campos) e não impedem a carga.
 * - `logContext` entra no log final (ex.: `{ dataDir }`), junto com pedidos, linhas
 *   inválidas e tempo.
 */
export async function loadConsumoOrders(
  sources: ConsumoSources,
  log: LoadLogger,
  logContext: object = {},
): Promise<Map<number, OrderRecord>> {
  const startedAt = performance.now();
  const strings: StringPool = new Map();
  const intern = (text: string) => internText(strings, text);
  let invalidRows = 0;
  let warnings = 0;
  const invalid = (details: object, message: string, rows = 1) => {
    invalidRows += rows;
    if (warnings++ < MAX_INVALID_WARNINGS) {
      log.warn(details, message);
    }
  };

  const orderRows = new Map<number, OrderRow>();
  await readTable(sources.orders, READ_COLUMNS.orders, intern, invalid, (orderId, row, record) => {
    if (orderRows.has(orderId)) {
      invalid({ table: sources.orders.name, record, orderId }, "Pedido repetido; ignorado");
    } else {
      orderRows.set(orderId, row);
    }
  });
  const itemsByOrder = await readChildren(sources.items, READ_COLUMNS.items);
  const eventsByOrder = await readChildren(sources.events, READ_COLUMNS.events);

  const orders = new Map<number, OrderRecord>();
  for (const [orderId, row] of orderRows) {
    // Solta as linhas assim que o pedido é montado. Medido (14/11): o closure do pipeline
    // mantém o contexto desta função vivo depois da carga, e com ele estes Maps.
    orderRows.delete(orderId);
    const items = itemsByOrder.get(orderId) ?? [];
    const events = eventsByOrder.get(orderId) ?? [];
    itemsByOrder.delete(orderId);
    eventsByOrder.delete(orderId);
    const result = mapConsumoOrder(row, items, events, intern);
    if (result.success) {
      orders.set(orderId, result.data);
    } else {
      const rows = 1 + items.length + events.length;
      const fields = invalidFields(result.error);
      invalid({ orderId, rows, fields }, "Pedido fora do contrato; ignorado", rows);
    }
  }
  // Sobram itens e eventos cujo pedido não existe.
  for (const [table, byOrder] of [
    [sources.items.name, itemsByOrder],
    [sources.events.name, eventsByOrder],
  ] as const) {
    for (const [orderId, rows] of byOrder) {
      invalid({ table, orderId, rows: rows.length }, "Linhas sem pedido; ignoradas", rows.length);
    }
  }
  strings.clear();

  const durationMs = Math.round(performance.now() - startedAt);
  log.info({ ...logContext, orders: orders.size, invalidRows, durationMs }, "Pedidos carregados");
  return orders;

  /** Itens ou eventos agrupados por número do pedido. */
  async function readChildren<Column extends string>(
    source: CsvSource,
    columns: readonly Column[],
  ): Promise<Map<number, Record<Column, string>[]>> {
    const byOrder = new Map<number, Record<Column, string>[]>();
    await readTable(source, columns, intern, invalid, (orderId, row) => {
      const rows = byOrder.get(orderId);
      if (rows) {
        rows.push(row);
      } else {
        byOrder.set(orderId, [row]);
      }
    });
    return byOrder;
  }
}

type InvalidRow = (details: object, message: string) => void;

/**
 * Lê uma tabela numa passada, entregando cada linha válida (só as colunas lidas) a `onRow`.
 * Tabela ilegível, vazia ou sem uma das colunas lidas lança erro com o nome da tabela.
 */
async function readTable<Column extends string>(
  source: CsvSource,
  columns: readonly Column[],
  intern: (text: string) => string,
  invalid: InvalidRow,
  onRow: (orderId: number, row: Record<Column, string>, record: number) => void,
): Promise<void> {
  let indexes: number[] | undefined;
  let record = 0;
  try {
    await pipeline(
      source.open(),
      // Registros como arrays: ~30% mais rápido que objetos (medido na Silver antiga, 163 MB).
      parse({ bom: true, relax_column_count: true, skip_empty_lines: true }),
      async (records: AsyncIterable<unknown>) => {
        for await (const fields of records) {
          if (!Array.isArray(fields)) {
            continue;
          }
          if (!indexes) {
            indexes = indexesOf(columns, fields);
            continue;
          }
          record++;
          const row = pickColumns(fields, columns, indexes, intern);
          const orderId = row ? parseOrderId(row.id_pedido) : null;
          if (!row || orderId === null) {
            const reason = row ? "id_pedido inválido" : "colunas faltando";
            invalid({ table: source.name, record, reason }, "Linha inválida; ignorada");
            continue;
          }
          onRow(orderId, row, record);
        }
      },
    );
    if (!indexes) {
      throw new Error("está vazio.");
    }
  } catch (error) {
    throw new Error(`${source.name} ${describeError(error)}`);
  }
}

/** Posição de cada coluna lida no cabeçalho, na mesma ordem. */
function indexesOf(columns: readonly string[], header: readonly unknown[]): number[] {
  const names = header.map(String);
  const missing = columns.filter((column) => !names.includes(column));
  if (missing.length > 0) {
    throw new Error(`não tem as colunas ${missing.join(", ")}.`);
  }
  return columns.map((column) => names.indexOf(column));
}

/**
 * Copia só as colunas lidas do registro (as demais, inclusive as proibidas, ficam para trás).
 * Linha curta (coluna faltando) = `null`. Sem `id_pedido` nas colunas = `null`.
 */
function pickColumns<Column extends string>(
  fields: readonly unknown[],
  columns: readonly Column[],
  indexes: readonly number[],
  intern: (text: string) => string,
): (Record<Column, string> & { id_pedido: string }) | null {
  const values = indexes.map((index) => fields[index]);
  if (!values.every((value): value is string => typeof value === "string")) {
    return null;
  }
  // Object.fromEntries deixa o objeto no modo rápido do V8. Atribuir chave por chave num
  // loop o leva ao modo dicionário, com ~4x mais memória por linha (medido na Silver antiga).
  const row = Object.fromEntries(
    columns.map((column, position) => [column, intern(values[position] ?? "")]),
  );
  return hasOrderId(row) ? (row as Record<Column, string> & { id_pedido: string }) : null;
}

function hasOrderId(row: Record<string, string>): row is { id_pedido: string } {
  return typeof row.id_pedido === "string";
}

/**
 * Textos já vistos na carga. Quase tudo se repete (modalidades, regiões, produtos, datas,
 * locais dos eventos): guardar uma instância só de cada texto reduziu o heap da API com a
 * Silver antiga de 89 para 61 MB e o RSS de 450 para 338 MB (medido em 14/11).
 */
type StringPool = Map<string, string>;

function internText(strings: StringPool, text: string): string {
  const known = strings.get(text);
  if (known !== undefined) {
    return known;
  }
  strings.set(text, text);
  return text;
}

function parseOrderId(text: string): number | null {
  return ORDER_ID_TEXT.test(text) && Number(text) > 0 ? Number(text) : null;
}

/** Só o caminho dos campos (ex.: `items.0.quantity`), nunca o valor. */
function invalidFields(error: z.ZodError): string[] {
  return [...new Set(error.issues.map((issue) => issue.path.join(".")))];
}

function describeError(error: unknown): string {
  const code =
    typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
  switch (code) {
    case "ENOENT":
      return "não encontrado.";
    case "EACCES":
      return "sem permissão de leitura.";
    case "EISDIR":
      return "é uma pasta, não um arquivo.";
  }
  return error instanceof Error ? error.message : String(error);
}
