import { Readable } from "node:stream";
import { CONSUMO_TABLES, type ConsumoTable } from "./consumo-mapper.ts";
import { selectStatement } from "./consumo-sql.ts";
import { cacheKey, readOrderCache, writeOrderCache } from "./databricks-cache.ts";
import {
  type CsvResult,
  createDatabricksClient,
  type DatabricksClientOptions,
} from "./databricks-client.ts";
import {
  type ConsumoSources,
  type CsvSource,
  type LoadLogger,
  loadConsumoOrders,
} from "./file-repository.ts";
import type { OrderRecord } from "./order-record.ts";
import { createInMemoryRepository, type OrderRepository } from "./order-repository.ts";

export interface DatabricksRepositoryOptions extends DatabricksClientOptions {
  /** `catalogo.schema` das tabelas consumo_* (`DATABRICKS_CATALOG_SCHEMA`). */
  catalogSchema: string;
}

export interface CachedDatabricksOptions extends DatabricksRepositoryOptions {
  /** Arquivo do cache local (`DATA_DIR/cache-databricks.json.gz`). */
  cacheFile: string;
  /** Intervalo da verificação de mudanças no Databricks, em ms; 0 = só ao subir. */
  refreshIntervalMs: number;
}

/** Repositório do adapter `databricks`, que se atualiza sozinho quando as tabelas mudam. */
export interface CachedDatabricksRepository extends OrderRepository {
  /**
   * Confere a versão das tabelas e, se mudou, baixa de novo e troca os pedidos em memória.
   * Nunca lança: falhas viram aviso no log e os pedidos atuais continuam. Chamadas durante uma
   * verificação em andamento esperam por ela (não começam outra).
   */
  refresh(): Promise<void>;
  /** Para a verificação periódica (ao encerrar a API). */
  close(): void;
}

const USE_FILE = "Tente de novo ou use DATA_SOURCE=file com os CSVs em portal/dados/.";

/** Versão das três tabelas, uma depois da outra (texto opaco: só importa se mudou). */
type SourceVersion = string;

/**
 * Adapter `databricks` com cache local. Sobe pelo cache quando ele existe e é do mesmo código
 * e workspace (~4 s); confere em segundo plano se as tabelas mudaram e só então baixa de novo.
 *
 * - Com cache: carrega dele, abre a porta e confere a versão das tabelas no Unity Catalog
 *   (~200 ms, sem acordar o warehouse). Mudou: baixa as tabelas, troca os pedidos em memória
 *   sem reiniciar e regrava o cache. Falha do Databricks (rede, token, warehouse): segue com o
 *   cache e avisa no log.
 * - Sem cache (ou de outro código/workspace, ou ilegível): baixa do Databricks antes de abrir
 *   a porta, como antes, e grava o cache. Falha aqui impede a API de subir.
 * - A conferência se repete a cada `refreshIntervalMs` (0 = só ao subir).
 */
export async function loadCachedDatabricksRepository(
  { cacheFile, refreshIntervalMs, ...source }: CachedDatabricksOptions,
  log: LoadLogger,
): Promise<CachedDatabricksRepository> {
  const { catalogSchema } = source;
  const databricks = createDatabricksClient(source);
  const key = await cacheKey(source);
  const startedAt = performance.now();
  const cached = await readOrderCache(cacheFile, key);

  let orders: OrderRepository;
  let version: SourceVersion | null;
  if (cached.ok) {
    orders = createInMemoryRepository(cached.cache.orders);
    version = cached.cache.version;
    log.info(
      {
        dataSource: "databricks",
        catalogSchema,
        orders: cached.cache.orders.size,
        savedAt: cached.cache.savedAt,
        durationMs: Math.round(performance.now() - startedAt),
      },
      "Pedidos carregados do cache local; conferindo o Databricks em segundo plano",
    );
  } else {
    log.info({ cacheFile, reason: cached.reason }, "Sem cache local; carregando do Databricks");
    version = await sourceVersion().catch((error: unknown) => {
      warnVersion(error);
      return null;
    });
    const loaded = await loadDatabricksOrders(source, log);
    orders = createInMemoryRepository(loaded);
    await save(loaded, version);
  }

  let closed = false;
  let running: Promise<void> | undefined;
  const refresh = () => {
    running ??= check().finally(() => {
      running = undefined;
    });
    return running;
  };
  if (cached.ok) {
    void refresh();
  }
  const timer = refreshIntervalMs > 0 ? setInterval(refresh, refreshIntervalMs) : undefined;
  // O timer não segura o processo aberto (o encerramento é do Fastify).
  timer?.unref();

  return {
    findById: (orderId) => orders.findById(orderId),
    count: () => orders.count(),
    stats: () => orders.stats(),
    refresh,
    close() {
      closed = true;
      clearInterval(timer);
    },
  };

  async function check(): Promise<void> {
    let latest: SourceVersion;
    try {
      latest = await sourceVersion();
    } catch (error) {
      warnVersion(error);
      return;
    }
    if (latest === version) {
      log.info({ catalogSchema }, "Tabelas sem mudança no Databricks");
      return;
    }
    log.info({ catalogSchema }, "Tabelas mudaram no Databricks; recarregando em segundo plano");
    let loaded: Map<number, OrderRecord>;
    try {
      loaded = await loadDatabricksOrders(source, log);
    } catch (error) {
      log.warn(
        { catalogSchema, error: message(error) },
        "Falha ao recarregar do Databricks; seguindo com os pedidos atuais",
      );
      return;
    }
    if (closed) {
      return;
    }
    orders = createInMemoryRepository(loaded);
    version = latest;
    log.info({ catalogSchema, orders: loaded.size }, "Pedidos trocados pela versão nova");
    await save(loaded, latest);
  }

  async function sourceVersion(): Promise<SourceVersion> {
    const tables = Object.values(CONSUMO_TABLES).map((table) => `${catalogSchema}.${table}`);
    const versions = await Promise.all(tables.map((table) => databricks.tableVersion(table)));
    return versions.join("|");
  }

  function warnVersion(error: unknown) {
    log.warn(
      { catalogSchema, error: message(error) },
      "Não foi possível conferir a versão das tabelas no Databricks; seguindo com os pedidos atuais",
    );
  }

  /** Grava o cache; falha só avisa (a próxima subida baixa do Databricks de novo). */
  async function save(
    loaded: ReadonlyMap<number, OrderRecord>,
    savedVersion: SourceVersion | null,
  ) {
    const savingAt = performance.now();
    try {
      await writeOrderCache(cacheFile, key, savedVersion, loaded);
      log.info(
        { cacheFile, durationMs: Math.round(performance.now() - savingAt) },
        "Cache local gravado",
      );
    } catch (error) {
      log.warn(
        { cacheFile, error: message(error) },
        "Não foi possível gravar o cache local; a próxima subida vai baixar do Databricks",
      );
    }
  }
}

/** Adapter `databricks` sem cache: baixa as três tabelas e serve da memória. */
export async function loadDatabricksRepository(
  options: DatabricksRepositoryOptions,
  log: LoadLogger,
): Promise<OrderRepository> {
  return createInMemoryRepository(await loadDatabricksOrders(options, log));
}

/**
 * Baixa as três tabelas `consumo_*` e devolve os pedidos convertidos.
 *
 * 1. As três consultas rodam em paralelo no warehouse, só com as colunas que o portal lê.
 * 2. Os pedaços das três são baixados ao mesmo tempo (o download é a parte lenta).
 * 3. Os pedaços passam pela mesma leitura e conversão do adapter `file` (`loadConsumoOrders`).
 *
 * Token recusado, tabela ausente, consulta com falha ou warehouse que não responde a tempo
 * lançam erro com a mensagem do que fazer (inclusive "use DATA_SOURCE=file").
 */
export async function loadDatabricksOrders(
  { catalogSchema, ...client }: DatabricksRepositoryOptions,
  log: LoadLogger,
): Promise<Map<number, OrderRecord>> {
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
    return await loadConsumoOrders(sources, log, { dataSource: "databricks", catalogSchema });
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
