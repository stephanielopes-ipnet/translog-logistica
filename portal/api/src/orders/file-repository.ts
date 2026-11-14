import { createReadStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import type { Order } from "@translog/contracts";
import { parse } from "csv-parse";
import type { z } from "zod";
import { createInMemoryRepository, type OrderRepository } from "./order-repository.ts";
import { mapSilverOrder, SILVER_COLUMNS, type SilverRow } from "./silver-mapper.ts";

/** O que o adapter precisa do log (o `app.log` do Fastify serve). */
export interface LoadLogger {
  info(details: object, message: string): void;
  warn(details: object, message: string): void;
}

/** Avisos detalhados de linha inválida no log; além disso, só a contagem (evita inundar o log). */
const MAX_INVALID_WARNINGS = 10;

const ORDER_ID_TEXT = /^\d{1,10}$/;

/**
 * Adapter `file`: lê a Silver em CSV numa passada só, em streaming, e mantém os pedidos em
 * memória (`Map` por número do pedido).
 *
 * - Só as colunas de `SILVER_COLUMNS` são copiadas de cada registro; as proibidas (dados do
 *   cliente, lucro etc.) são descartadas ali mesmo, antes de agrupar ou mapear.
 * - Linhas e pedidos inválidos são contados e logados sem conteúdo (só número do registro,
 *   número do pedido e nome dos campos) e não impedem a carga.
 * - Arquivo ausente, ilegível, vazio ou sem as colunas esperadas impede a API de subir.
 */
export async function loadFileRepository(file: string, log: LoadLogger): Promise<OrderRepository> {
  const startedAt = performance.now();
  const strings: StringPool = new Map();
  const rowsByOrder = new Map<number, [SilverRow, ...SilverRow[]]>();
  let invalidRows = 0;
  let warnings = 0;
  const warnInvalid = (details: object, message: string) => {
    if (warnings++ < MAX_INVALID_WARNINGS) {
      log.warn(details, message);
    }
  };

  try {
    let columnIndexes: number[] | undefined;
    let record = 0;
    await pipeline(
      createReadStream(file),
      // Registros como arrays: ~30% mais rápido que objetos na Silver de 163 MB.
      parse({ bom: true, relax_column_count: true, skip_empty_lines: true }),
      async (records: AsyncIterable<unknown>) => {
        for await (const fields of records) {
          if (!Array.isArray(fields)) {
            continue;
          }
          if (!columnIndexes) {
            columnIndexes = indexesOfReadColumns(fields);
            continue;
          }
          record++;
          const row = toSilverRow(fields, columnIndexes, strings);
          const orderId = row ? parseOrderId(row.id_pedido) : null;
          if (!row || orderId === null) {
            invalidRows++;
            const reason = row ? "id_pedido inválido" : "colunas faltando";
            warnInvalid({ record, reason }, "Linha inválida na Silver; ignorada");
            continue;
          }
          const rows = rowsByOrder.get(orderId);
          if (rows) {
            rows.push(row);
          } else {
            rowsByOrder.set(orderId, [row]);
          }
        }
      },
    );
    if (!columnIndexes) {
      throw new Error("o arquivo está vazio.");
    }
  } catch (error) {
    throw new Error(`Não foi possível ler ORDERS_FILE (${file}): ${describeReadError(error)}`);
  }

  const orders = new Map<number, Order>();
  for (const [orderId, rows] of rowsByOrder) {
    // Solta as linhas assim que o pedido é montado. Medido: o closure do pipeline mantém o
    // contexto desta função vivo depois da carga, e com ele este Map (e o `strings`, abaixo).
    rowsByOrder.delete(orderId);
    const result = mapSilverOrder(rows);
    if (result.success) {
      orders.set(orderId, internDerivedStrings(result.data, strings));
    } else {
      invalidRows += rows.length;
      const fields = invalidFields(result.error);
      warnInvalid({ orderId, rows: rows.length, fields }, "Pedido inválido na Silver; ignorado");
    }
  }
  strings.clear();

  const durationMs = Math.round(performance.now() - startedAt);
  log.info({ file, orders: orders.size, invalidRows, durationMs }, "Pedidos carregados da Silver");
  return createInMemoryRepository(orders);
}

/** Posição de cada coluna de `SILVER_COLUMNS` no cabeçalho, na mesma ordem. */
function indexesOfReadColumns(header: readonly unknown[]): number[] {
  const names = header.map(String);
  const missing = SILVER_COLUMNS.filter((column) => !names.includes(column));
  if (missing.length > 0) {
    throw new Error(`o cabeçalho não tem as colunas ${missing.join(", ")}.`);
  }
  return SILVER_COLUMNS.map((column) => names.indexOf(column));
}

/** Copia só as colunas lidas do registro. Linha curta (coluna faltando) = `null`. */
function toSilverRow(
  fields: readonly unknown[],
  columnIndexes: readonly number[],
  strings: StringPool,
): SilverRow | null {
  const values = columnIndexes.map((index) => fields[index]);
  if (!values.every((value): value is string => typeof value === "string")) {
    return null;
  }
  // Object.fromEntries deixa o objeto no modo rápido do V8. Atribuir chave por chave num
  // loop o leva ao modo dicionário, com ~4x mais memória por linha (medido na Silver).
  return Object.fromEntries(
    SILVER_COLUMNS.map((column, position) => [column, intern(strings, values[position] ?? "")]),
  ) as SilverRow;
}

/**
 * Textos já vistos na carga. Na Silver quase tudo se repete (4 modalidades, 23 regiões,
 * ~118 produtos, ~1.100 datas): guardar uma instância só de cada texto reduziu o heap da
 * API com a Silver de 89 para 61 MB e o RSS de 450 para 338 MB (medido em 14/11).
 */
type StringPool = Map<string, string>;

function intern(strings: StringPool, text: string): string {
  const known = strings.get(text);
  if (known !== undefined) {
    return known;
  }
  strings.set(text, text);
  return text;
}

/** Textos que o mapper cria por pedido (datas cortadas, rota, janela) também vão para o pool. */
function internDerivedStrings(order: Order, strings: StringPool): Order {
  return {
    ...order,
    orderDate: intern(strings, order.orderDate),
    delayWindow: intern(strings, order.delayWindow),
    estimatedDeliveryDate: intern(strings, order.estimatedDeliveryDate),
    actualDeliveryDate: order.actualDeliveryDate && intern(strings, order.actualDeliveryDate),
    origin: intern(strings, order.origin),
    destination: intern(strings, order.destination),
  };
}

function parseOrderId(text: string): number | null {
  return ORDER_ID_TEXT.test(text) && Number(text) > 0 ? Number(text) : null;
}

/** Só o caminho dos campos (ex.: `items.0.quantity`), nunca o valor. */
function invalidFields(error: z.ZodError): string[] {
  return [...new Set(error.issues.map((issue) => issue.path.join(".")))];
}

function describeReadError(error: unknown): string {
  const code =
    typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
  switch (code) {
    case "ENOENT":
      return "arquivo não encontrado.";
    case "EACCES":
      return "sem permissão de leitura.";
    case "EISDIR":
      return "o caminho é uma pasta, não um arquivo.";
  }
  return error instanceof Error ? error.message : String(error);
}
