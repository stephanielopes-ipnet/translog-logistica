import { existsSync, readFileSync } from "node:fs";
import { orderSchema } from "@translog/contracts";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { loadConfig } from "../config.ts";
import { type FakeDatabricksOptions, startFakeDatabricks } from "../testing/fake-databricks.ts";
import { FORBIDDEN_COLUMNS } from "./consumo-mapper.ts";
import { loadDatabricksRepository } from "./databricks-repository.ts";
import { FIXTURES_FILE } from "./fixtures-repository.ts";

// Contra um Databricks falso que serve a amostra dos 9 pedidos da demo. Nenhum teste chama o
// Databricks real.

const TOKEN = "token-de-teste-nao-real";
const fixtures = z.array(orderSchema).parse(JSON.parse(readFileSync(FIXTURES_FILE, "utf8")));

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
    expect(fake.statements.map((sql) => sql.match(/ FROM (\S+)/)?.[1])).toEqual([
      "workspace.silver.consumo_pedidos",
      "workspace.silver.consumo_itens_pedido",
      "workspace.silver.consumo_eventos_logisticos",
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
    expect(polls).toHaveLength(6); // 2 por consulta
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
