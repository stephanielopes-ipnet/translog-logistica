import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import type { ShippingMode } from "@translog/contracts";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { tempDir } from "../testing/temp-dir.ts";
import { cacheKey, readOrderCache, writeOrderCache } from "./databricks-cache.ts";
import { FIXTURES_FILE } from "./fixtures-repository.ts";
import { orderRecordSchema } from "./order-record.ts";

const fixtures = z.array(orderRecordSchema).parse(JSON.parse(readFileSync(FIXTURES_FILE, "utf8")));
const ORDERS = new Map(fixtures.map((order) => [order.orderId, order]));
const SOURCE = {
  baseUrl: "https://dbc-teste.cloud.databricks.com",
  catalogSchema: "workspace.silver",
  goldSchema: "workspace.gold",
};
const SCENARIO = new Map<ShippingMode, number>([
  ["First Class", 2],
  ["Second Class", 4],
]);
const DATA = { orders: ORDERS, scenario: SCENARIO };

describe("cache local do databricks", () => {
  it("grava e lê os mesmos pedidos, com a versão e a data da gravação", async () => {
    const file = join(tempDir(), "cache.json.gz");
    const key = await cacheKey(SOURCE);

    await writeOrderCache(file, key, "v7", DATA);
    const result = await readOrderCache(file, key);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cache.version).toBe("v7");
    expect(result.cache.savedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect([...result.cache.orders.values()]).toStrictEqual(fixtures);
    expect(result.cache.scenario).toStrictEqual(SCENARIO);
  });

  it("cria a pasta, grava só para o dono e não deixa arquivo temporário", async () => {
    const dir = tempDir();
    const file = join(dir, "sub", "cache.json.gz");

    await writeOrderCache(file, "k", null, DATA);

    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(readFileSync(file).subarray(0, 2)).toStrictEqual(Buffer.from([0x1f, 0x8b])); // gzip
    expect(readdirSync(join(dir, "sub"))).toEqual(["cache.json.gz"]);
  });

  it("grava um cabeçalho e um pedido por linha (lido em streaming)", async () => {
    const file = join(tempDir(), "cache.json.gz");
    await writeOrderCache(file, "k", "v1", DATA);

    const lines = gunzipSync(readFileSync(file)).toString("utf8").trimEnd().split("\n");

    expect(lines).toHaveLength(1 + fixtures.length);
    expect(JSON.parse(lines[0] ?? "")).toMatchObject({
      key: "k",
      version: "v1",
      orders: fixtures.length,
      scenario: { "First Class": 2, "Second Class": 4 },
    });
    expect(JSON.parse(lines[1] ?? "").orderId).toBe(fixtures[0]?.orderId);
  });

  it("arquivo ausente: devolve o motivo, sem erro", async () => {
    expect(await readOrderCache(join(tempDir(), "nao-existe.json.gz"), "k")).toStrictEqual({
      ok: false,
      reason: "ausente",
    });
  });

  it("outro workspace, outro schema ou outra chave: descarta", async () => {
    const file = join(tempDir(), "cache.json.gz");
    await writeOrderCache(file, await cacheKey(SOURCE), "v1", DATA);

    for (const other of [
      { ...SOURCE, baseUrl: "http://127.0.0.1:9999" },
      { ...SOURCE, catalogSchema: "workspace.gold" },
      { ...SOURCE, goldSchema: "outro.gold" },
    ]) {
      expect(await readOrderCache(file, await cacheKey(other))).toStrictEqual({
        ok: false,
        reason: "de outra versão do código ou da fonte",
      });
    }
  });

  it("a chave é estável para a mesma fonte e o mesmo código", async () => {
    expect(await cacheKey(SOURCE)).toBe(await cacheKey({ ...SOURCE }));
  });

  it("corrompido, sem gzip, cortado, pedido fora do contrato ou sem cenário: ilegível", async () => {
    const dir = tempDir();
    const key = await cacheKey(SOURCE);
    const file = join(dir, "cache.json.gz");
    await writeOrderCache(file, key, "v1", DATA);
    const [headerLine = "", ...orderLines] = gunzipSync(readFileSync(file))
      .toString("utf8")
      .trimEnd()
      .split("\n");
    const header = JSON.parse(headerLine);
    const rebuild = (head: object, lines: string[]) =>
      gzipSync(`${[JSON.stringify(head), ...lines].join("\n")}\n`);
    const broken = JSON.stringify({ ...JSON.parse(orderLines[0] ?? "{}"), status: "Inventado" });

    const cases = {
      truncated: readFileSync(file).subarray(0, 100),
      plain: Buffer.from([headerLine, ...orderLines].join("\n")),
      outOfContract: rebuild(header, [broken, ...orderLines.slice(1)]),
      missingOrders: rebuild(header, orderLines.slice(1)),
      notJson: rebuild(header, ["{nao-e-json", ...orderLines.slice(1)]),
      noScenario: rebuild({ ...header, scenario: {} }, orderLines),
      badScenario: rebuild({ ...header, scenario: { "First Class": -1 } }, orderLines),
      empty: gzipSync(""),
    };
    for (const [name, bytes] of Object.entries(cases)) {
      writeFileSync(join(dir, name), bytes);
      expect(await readOrderCache(join(dir, name), key), name).toStrictEqual({
        ok: false,
        reason: "ilegível",
      });
    }
  });
});
