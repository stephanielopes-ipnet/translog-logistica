import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { z } from "zod";
import { loadConfig } from "../config.ts";
import { type FakeDatabricksOptions, startFakeDatabricks } from "../testing/fake-databricks.ts";
import { tempDir } from "../testing/temp-dir.ts";
import { FORBIDDEN_COLUMNS } from "./consumo-mapper.ts";
import { cacheKey, readOrderCache, writeOrderCache } from "./databricks-cache.ts";
import {
  type CachedDatabricksOptions,
  loadCachedDatabricksRepository,
  loadDatabricksRepository,
} from "./databricks-repository.ts";
import { FIXTURES_FILE } from "./fixtures-repository.ts";
import { orderRecordSchema } from "./order-record.ts";

// Contra um Databricks falso que serve a amostra dos 9 pedidos da demo. Nenhum teste chama o
// Databricks real.

const TOKEN = "token-de-teste-nao-real";
const fixtures = z.array(orderRecordSchema).parse(JSON.parse(readFileSync(FIXTURES_FILE, "utf8")));

function fakeLog() {
  return { info: vi.fn(), warn: vi.fn() };
}

async function load(options: FakeDatabricksOptions = {}, timeoutMs = 5000) {
  const fake = await startFakeDatabricks(options);
  const log = fakeLog();
  const repository = loadDatabricksRepository(
    {
      baseUrl: fake.baseUrl,
      warehouseId: "wh-teste",
      token: TOKEN,
      catalogSchema: "workspace.silver",
      pollIntervalMs: 5,
      timeoutMs,
    },
    log,
  );
  return { fake, log, repository };
}

/** Mensagem do erro, ou "" se não falhar. */
async function failure(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return "";
}

describe("loadDatabricksRepository (Databricks falso)", () => {
  it("carrega os 9 pedidos da demo iguais aos fixtures, com as 3 consultas", async () => {
    const { fake, repository } = await load();

    const orders = await repository;

    expect(await orders.count()).toBe(9);
    for (const order of fixtures) {
      expect(await orders.findById(order.orderId), `pedido ${order.orderId}`).toStrictEqual(order);
    }
    // As 3 tabelas, em paralelo (a ordem de chegada varia); nenhuma consulta à Gold.
    expect(fake.statements.map((sql) => sql.match(/ FROM (\S+)/)?.[1]).sort()).toEqual([
      "workspace.silver.consumo_eventos_logisticos",
      "workspace.silver.consumo_itens_pedido",
      "workspace.silver.consumo_pedidos",
    ]);
  });

  it("as consultas listam colunas explícitas e nunca as proibidas", async () => {
    const { fake, repository } = await load();
    await repository;

    for (const sql of fake.statements) {
      expect(sql).not.toContain("*");
      for (const column of FORBIDDEN_COLUMNS) {
        expect(sql).not.toMatch(new RegExp(`\\b${column}\\b`));
      }
    }
  });

  it("o token vai só para a API do workspace, nunca para os links pré-assinados", async () => {
    const { fake, repository } = await load({ chunks: 3 });
    await repository;

    const api = fake.requests.filter((r) => r.path.startsWith("/api/"));
    const storage = fake.requests.filter((r) => r.path.startsWith("/storage/"));
    expect(api.length).toBeGreaterThan(0);
    expect(storage).toHaveLength(9); // 3 tabelas × 3 pedaços
    expect(api.every((r) => r.authorization === `Bearer ${TOKEN}`)).toBe(true);
    expect(storage.every((r) => r.authorization === undefined)).toBe(true);
  });

  it("espera PENDING → RUNNING → SUCCEEDED antes de baixar", async () => {
    const { fake, repository } = await load({ pendingPolls: 2 });

    expect(await (await repository).count()).toBe(9);
    const polls = fake.requests.filter((r) =>
      /^\/api\/2\.0\/sql\/statements\/st-\d+$/.test(r.path),
    );
    expect(polls).toHaveLength(6); // 2 por consulta (3 tabelas)
  });

  it("vários pedaços (com e sem cabeçalho repetido) dão o mesmo resultado", async () => {
    const { repository } = await load({ chunks: 4 });
    const orders = await repository;

    for (const order of fixtures) {
      expect(await orders.findById(order.orderId)).toStrictEqual(order);
    }
  });

  it("loga as consultas e a carga só com números, nunca dados nem o token", async () => {
    const { log, repository } = await load();
    await repository;

    expect(log.info.mock.calls).toEqual([
      [
        {
          catalogSchema: "workspace.silver",
          rows: { orders: 9, items: 17, events: 52 },
          megabytes: 0,
          queryMs: expect.any(Number),
          downloadMs: expect.any(Number),
        },
        "Tabelas baixadas do Databricks",
      ],
      [
        {
          dataSource: "databricks",
          catalogSchema: "workspace.silver",
          orders: 9,
          invalidRows: 0,
          durationMs: expect.any(Number),
        },
        "Pedidos carregados",
      ],
    ]);
    expect(JSON.stringify(log.info.mock.calls)).not.toMatch(/token|Jacarta|adidas/);
  });

  it("conta linhas inválidas do resultado como no adapter file", async () => {
    const { log, repository } = await load({
      extraRows: { consumo_itens_pedido: [{ id_pedido: "99003", id_item_pedido: "1" }] },
    });

    expect(await (await repository).count()).toBe(9);
    expect(log.warn).toHaveBeenCalledWith(
      { table: "workspace.silver.consumo_itens_pedido", orderId: 99003, rows: 1 },
      "Linhas sem pedido; ignoradas",
    );
  });

  it("401: não sobe, manda conferir o token e sugere DATA_SOURCE=file, sem mostrar o token", async () => {
    const { repository } = await load({ httpStatus: 401 });

    const message = await failure(repository);

    expect(message).toMatch(
      /^Não foi possível carregar workspace\.silver\.consumo_\w+ do Databricks: O Databricks recusou o acesso \(HTTP 401\)\. Confira DATABRICKS_TOKEN/,
    );
    expect(message).toContain("use DATA_SOURCE=file");
    expect(message).not.toContain(TOKEN);
  });

  it("tabela ausente (FAILED): não sobe, cita a tabela e o erro do Databricks", async () => {
    const { repository } = await load({ missingTable: "consumo_eventos_logisticos" });

    const message = await failure(repository);

    expect(message).toMatch(
      /^Não foi possível carregar workspace\.silver\.consumo_eventos_logisticos do Databricks: A consulta terminou com FAILED \(BAD_REQUEST\): \[TABLE_OR_VIEW_NOT_FOUND\]/,
    );
    expect(message).toContain("DATA_SOURCE=file");
  });

  it("warehouse que não responde a tempo: não sobe e explica o que fazer", async () => {
    const { repository } = await load({ neverFinishes: true }, 50);

    const message = await failure(repository);

    expect(message).toMatch(
      /A consulta não terminou em 0 s \(estado (PENDING|RUNNING)\)\. O warehouse pode estar ligando/,
    );
    expect(message).toContain("use DATA_SOURCE=file");
  });
});

describe("loadCachedDatabricksRepository (cache local + Databricks falso)", () => {
  async function setup(options: FakeDatabricksOptions = {}) {
    const fake = await startFakeDatabricks(options);
    const cacheFile = join(tempDir(), "cache-databricks.json.gz");
    const source: CachedDatabricksOptions = {
      baseUrl: fake.baseUrl,
      warehouseId: "wh-teste",
      token: TOKEN,
      catalogSchema: "workspace.silver",
      pollIntervalMs: 5,
      timeoutMs: 5000,
      cacheFile,
      refreshIntervalMs: 0,
    };
    /** Sobe o repositório (como a API ao subir); fecha ao fim do teste. */
    const boot = async (overrides: Partial<CachedDatabricksOptions> = {}) => {
      const log = fakeLog();
      const repository = await loadCachedDatabricksRepository({ ...source, ...overrides }, log);
      onTestFinished(() => repository.close());
      return { repository, log };
    };
    const catalogCalls = () =>
      fake.requests.filter((r) => r.path.startsWith("/api/2.1/unity-catalog/")).length;
    const messages = (log: ReturnType<typeof fakeLog>, level: "info" | "warn" = "info") =>
      log[level].mock.calls.map(([, message]) => message);
    return { fake, options, cacheFile, source, boot, catalogCalls, messages };
  }

  it("sem cache: baixa do Databricks antes de responder e grava o cache com a versão", async () => {
    const { fake, cacheFile, source, boot } = await setup();

    const { repository, log } = await boot();

    expect(await repository.count()).toBe(9);
    expect(fake.statements).toHaveLength(3);
    expect(log.info).toHaveBeenCalledWith(
      { cacheFile, reason: "ausente" },
      "Sem cache local; carregando do Databricks",
    );
    const saved = await readOrderCache(cacheFile, await cacheKey(source));
    expect(saved.ok && saved.cache.orders.size).toBe(9);
    expect(saved.ok && saved.cache.version).toMatch(/consumo_pedidos@1@/);
  });

  it("com cache: sobe sem consultar o warehouse e só confere a versão no Unity Catalog", async () => {
    const { fake, boot, catalogCalls, messages } = await setup();
    await boot();
    fake.statements.length = 0;

    const { repository, log } = await boot();
    await repository.refresh();

    for (const order of fixtures) {
      expect(await repository.findById(order.orderId)).toStrictEqual(order);
    }
    expect(fake.statements).toHaveLength(0);
    expect(catalogCalls()).toBe(6); // 3 tabelas na primeira subida + 3 na conferência
    expect(messages(log)).toEqual([
      "Pedidos carregados do cache local; conferindo o Databricks em segundo plano",
      "Tabelas sem mudança no Databricks",
    ]);
    expect(JSON.stringify(log.info.mock.calls)).not.toMatch(/token|Jacarta|adidas/);
  });

  it("tabela mudou: baixa de novo em segundo plano, troca os pedidos e regrava o cache", async () => {
    const { fake, cacheFile, source, boot, messages } = await setup();
    // Cache antigo com um pedido só, de uma versão anterior das tabelas.
    const key = await cacheKey(source);
    const [first] = fixtures;
    if (!first) throw new Error("fixtures vazios");
    await writeOrderCache(cacheFile, key, "versao-antiga", {
      orders: new Map([[first.orderId, first]]),
    });

    const { repository, log } = await boot();
    expect(await repository.count()).toBe(1); // já responde com o cache
    await repository.refresh();

    expect(await repository.count()).toBe(9);
    expect(fake.statements).toHaveLength(3);
    expect(messages(log)).toContain("Pedidos trocados pela versão nova");
    const saved = await readOrderCache(cacheFile, key);
    expect(saved.ok && saved.cache.orders.size).toBe(9);
    expect(saved.ok && saved.cache.version).toMatch(/consumo_pedidos@1@/);
  });

  it("nova escrita no Databricks com a API no ar: a conferência seguinte recarrega", async () => {
    const { fake, boot } = await setup();
    const { repository } = await boot();

    fake.tableVersion = 2;
    await repository.refresh();
    await repository.refresh(); // sem mudança desde a última: não baixa de novo

    expect(fake.statements).toHaveLength(6);
  });

  it("Unity Catalog fora do ar ao subir com cache: serve o cache e avisa no log", async () => {
    const { options, boot, messages } = await setup();
    await boot();
    options.catalogUnavailable = true;

    const { repository, log } = await boot();
    await repository.refresh();

    expect(await repository.count()).toBe(9);
    expect(messages(log, "warn")).toEqual([
      "Não foi possível conferir a versão das tabelas no Databricks; seguindo com os pedidos atuais",
    ]);
  });

  it("falha ao recarregar (token recusado): segue com os pedidos atuais e o cache", async () => {
    const { fake, options, cacheFile, source, boot, messages } = await setup();
    const { repository, log } = await boot();
    fake.tableVersion = 2;
    options.httpStatus = 401;

    await repository.refresh();

    expect(await repository.count()).toBe(9);
    expect(messages(log, "warn")).toEqual([
      "Não foi possível conferir a versão das tabelas no Databricks; seguindo com os pedidos atuais",
    ]);
    expect(JSON.stringify(log.warn.mock.calls)).not.toContain(TOKEN);
    expect((await readOrderCache(cacheFile, await cacheKey(source))).ok).toBe(true);
  });

  it("falha no download durante a recarga: segue com os pedidos atuais", async () => {
    const { fake, options, boot, messages } = await setup();
    const { repository, log } = await boot();
    fake.tableVersion = 2;
    options.missingTable = "consumo_itens_pedido";

    await repository.refresh();

    expect(await repository.count()).toBe(9);
    expect(messages(log, "warn")).toEqual([
      "Falha ao recarregar do Databricks; seguindo com os pedidos atuais",
    ]);
  });

  it("sem cache e Databricks recusando: a API não sobe (como sem cache)", async () => {
    const { boot } = await setup({ httpStatus: 401 });

    expect(await failure(boot())).toMatch(/Confira DATABRICKS_TOKEN.*use DATA_SOURCE=file/);
  });

  it("cache de outro código ou workspace: ignora e baixa do Databricks", async () => {
    const { fake, cacheFile, boot } = await setup();
    await writeOrderCache(cacheFile, "chave-de-outro-codigo", "v1", {
      orders: new Map(),
    });

    const { repository, log } = await boot();

    expect(await repository.count()).toBe(9);
    expect(fake.statements).toHaveLength(3);
    expect(log.info).toHaveBeenCalledWith(
      { cacheFile, reason: "de outra versão do código ou da fonte" },
      "Sem cache local; carregando do Databricks",
    );
  });

  it("não consegue gravar o cache: sobe do Databricks e avisa", async () => {
    const { boot, messages } = await setup();
    // A "pasta" do cache é um arquivo: a gravação falha.
    const blocker = join(tempDir(), "arquivo");
    writeFileSync(blocker, "");

    const { repository, log } = await boot({ cacheFile: join(blocker, "cache.json.gz") });

    expect(await repository.count()).toBe(9);
    expect(messages(log, "warn")).toEqual([
      "Não foi possível gravar o cache local; a próxima subida vai baixar do Databricks",
    ]);
  });

  it("confere de novo a cada intervalo e para ao fechar", async () => {
    const { boot, catalogCalls } = await setup();
    const { repository } = await boot({ refreshIntervalMs: 10 });

    await vi.waitFor(() => expect(catalogCalls()).toBeGreaterThanOrEqual(12));
    repository.close();
    await repository.refresh(); // espera uma conferência que esteja em andamento
    const afterClose = catalogCalls();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(catalogCalls()).toBe(afterClose);
  });
});

/**
 * Integração com o Databricks real: só com `DATABRICKS_IT=1` (gasta cota da edição gratuita:
 * 3 consultas). Credenciais do ambiente ou do portal/.env, nunca no teste.
 *   DATABRICKS_IT=1 pnpm --filter @translog/api test databricks-repository
 */
describe.skipIf(process.env.DATABRICKS_IT !== "1")(
  "loadDatabricksRepository (Databricks real)",
  () => {
    it("carrega os 65.752 pedidos sem linha inválida, e os da demo batem com os fixtures", async () => {
      const envFile = new URL("../../../.env", import.meta.url);
      if (existsSync(envFile)) {
        process.loadEnvFile(envFile);
      }
      const { databricks } = loadConfig({ ...process.env, DATA_SOURCE: "databricks" });
      if (!databricks) throw new Error("Credenciais do Databricks ausentes.");
      const log = fakeLog();

      const orders = await loadDatabricksRepository(databricks, log);

      expect(await orders.count()).toBe(65_752);
      expect(log.info).toHaveBeenCalledWith(
        expect.objectContaining({ orders: 65_752, invalidRows: 0 }),
        "Pedidos carregados",
      );
      for (const order of fixtures) {
        expect(await orders.findById(order.orderId), `pedido ${order.orderId}`).toStrictEqual(
          order,
        );
      }
    }, 300_000);
  },
);
