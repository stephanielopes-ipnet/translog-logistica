import { Readable } from "node:stream";
import { CONSUMO_TABLES, type ConsumoTable } from "./consumo-mapper.ts";
import { selectStatement } from "./consumo-sql.ts";
import {
  type CsvResult,
  createDatabricksClient,
  type DatabricksClientOptions,
} from "./databricks-client.ts";
import {
  type ConsumoSources,
  type CsvSource,
  type LoadLogger,
  loadConsumoRepository,
} from "./file-repository.ts";
import type { OrderRepository } from "./order-repository.ts";

export interface DatabricksRepositoryOptions extends DatabricksClientOptions {
  /** `catalogo.schema` das tabelas consumo_* (`DATABRICKS_CATALOG_SCHEMA`). */
  catalogSchema: string;
}

const USE_FILE = "Tente de novo ou use DATA_SOURCE=file com os CSVs em portal/dados/.";

/**
 * Adapter `databricks`: consulta as três tabelas `consumo_*` uma vez, ao subir a API, e serve
 * da memória (como o `file`).
 *
 * 1. As três consultas rodam em paralelo no warehouse, só com as colunas que o portal lê.
 * 2. Os pedaços das três são baixados ao mesmo tempo (o download é a parte lenta).
 * 3. Os pedaços passam pela mesma leitura e conversão do adapter `file` (`loadConsumoRepository`).
 *
 * Token recusado, tabela ausente, consulta com falha ou warehouse que não responde a tempo
 * impedem a API de subir, com a mensagem do que fazer (inclusive "use DATA_SOURCE=file").
 */
export async function loadDatabricksRepository(
  { catalogSchema, ...client }: DatabricksRepositoryOptions,
  log: LoadLogger,
): Promise<OrderRepository> {
  const databricks = createDatabricksClient(client);
  const name = (table: ConsumoTable) => `${catalogSchema}.${CONSUMO_TABLES[table]}`;

  const query = async (table: ConsumoTable): Promise<CsvResult> => {
    try {
      return await databricks.queryCsv(selectStatement(catalogSchema, table));
    } catch (error) {
      throw new Error(`Não foi possível carregar ${name(table)} do Databricks: ${message(error)}`);
    }
  };
  const download = async (table: ConsumoTable, result: CsvResult): Promise<Buffer[]> => {
    try {
      return await collect(result);
    } catch (error) {
      throw new Error(
        `Não foi possível baixar ${name(table)} do Databricks: ${message(error)} ${USE_FILE}`,
      );
    }
  };

  const startedAt = performance.now();
  const [orders, items, events] = await Promise.all([
    query("orders"),
    query("items"),
    query("events"),
  ]);
  if (orders.totalRows === 0) {
    throw new Error(`${name("orders")} está vazia no Databricks. ${USE_FILE}`);
  }
  const queryMs = Math.round(performance.now() - startedAt);
  const chunks = await Promise.all([
    download("orders", orders),
    download("items", items),
    download("events", events),
  ]);
  log.info(
    {
      catalogSchema,
      rows: { orders: orders.totalRows, items: items.totalRows, events: events.totalRows },
      megabytes: Math.round(chunks.flat().reduce((sum, chunk) => sum + chunk.length, 0) / 1e6),
      queryMs,
      downloadMs: Math.round(performance.now() - startedAt) - queryMs,
    },
    "Tabelas baixadas do Databricks",
  );

  /** Fonte que entrega os pedaços uma vez e os solta da memória assim que a leitura começa. */
  const source = (table: ConsumoTable, index: number): CsvSource => ({
    name: name(table),
    open: () => {
      const owned = chunks[index] ?? [];
      chunks[index] = [];
      return Readable.from(inSlices(owned));
    },
  });
  const sources: ConsumoSources = {
    orders: source("orders", 0),
    items: source("items", 1),
    events: source("events", 2),
  };
  try {
    return await loadConsumoRepository(sources, log, { dataSource: "databricks", catalogSchema });
  } catch (error) {
    throw new Error(
      `Não foi possível ler o resultado do Databricks: ${message(error)} ${USE_FILE}`,
    );
  }
}

/**
 * Entrega os pedaços (~20 MB cada) em fatias de 64 KB, como uma leitura de arquivo, soltando
 * cada pedaço depois de lido. Medido em 16/11: entregar o pedaço inteiro ao `csv-parse` deixava
 * os Buffers presos e o RSS em ~670 MB; em fatias, ~425 MB.
 */
function* inSlices(chunks: Buffer[]): Generator<Buffer> {
  for (let chunk = chunks.shift(); chunk !== undefined; chunk = chunks.shift()) {
    for (let start = 0; start < chunk.length; start += SLICE_BYTES) {
      yield chunk.subarray(start, start + SLICE_BYTES);
    }
  }
}

const SLICE_BYTES = 64 * 1024;

/** Todos os pedaços do resultado, em ordem. */
async function collect(result: CsvResult): Promise<Buffer[]> {
  const chunks: Buffer[] = [];
  for await (const chunk of result.chunks()) {
    chunks.push(chunk);
  }
  return chunks;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
