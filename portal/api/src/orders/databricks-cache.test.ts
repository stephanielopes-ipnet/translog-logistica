import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { orderSchema } from "@translog/contracts";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { tempDir } from "../testing/temp-dir.ts";
import { cacheKey, readOrderCache, writeOrderCache } from "./databricks-cache.ts";
import { FIXTURES_FILE } from "./fixtures-repository.ts";

const fixtures = z.array(orderSchema).parse(JSON.parse(readFileSync(FIXTURES_FILE, "utf8")));
const ORDERS = new Map(fixtures.map((order) => [order.orderId, order]));
const SOURCE = {
  baseUrl: "https://dbc-teste.cloud.databricks.com",
  catalogSchema: "workspace.silver",
};

describe("cache local do databricks", () => {
  it("grava e lê os mesmos pedidos, com a versão e a data da gravação", async () => {
    const file = join(tempDir(), "cache.json.gz");
    const key = await cacheKey(SOURCE);

    await writeOrderCache(file, key, "v7", ORDERS);
    const result = await readOrderCache(file, key);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cache.version).toBe("v7");
    expect(result.cache.savedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect([...result.cache.orders.values()]).toStrictEqual(fixtures);
  });

  it("cria a pasta, grava só para o dono e não deixa arquivo temporário", async () => {
    const dir = tempDir();
    const file = join(dir, "sub", "cache.json.gz");

    await writeOrderCache(file, "k", null, ORDERS);

    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(readFileSync(file).subarray(0, 2)).toStrictEqual(Buffer.from([0x1f, 0x8b])); // gzip
    expect(readdirSync(join(dir, "sub"))).toEqual(["cache.json.gz"]);
  });

  it("arquivo ausente: devolve o motivo, sem erro", async () => {
    expect(await readOrderCache(join(tempDir(), "nao-existe.json.gz"), "k")).toStrictEqual({
      ok: false,
      reason: "ausente",
    });
  });

  it("outro workspace, outro schema ou outra chave: descarta", async () => {
    const file = join(tempDir(), "cache.json.gz");
    await writeOrderCache(file, await cacheKey(SOURCE), "v1", ORDERS);

    for (const other of [
      { ...SOURCE, baseUrl: "http://127.0.0.1:9999" },
      { ...SOURCE, catalogSchema: "workspace.gold" },
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

  it("corrompido, sem gzip ou com pedido fora do contrato: ilegível", async () => {
    const dir = tempDir();
    const key = await cacheKey(SOURCE);
    const file = join(dir, "cache.json.gz");
    await writeOrderCache(file, key, "v1", ORDERS);
    const content = JSON.parse(gunzipSync(readFileSync(file)).toString("utf8"));
    const broken = { ...content, orders: [{ ...content.orders[0], status: "Inventado" }] };

    const cases = {
      truncated: readFileSync(file).subarray(0, 100),
      plain: Buffer.from(JSON.stringify(content)),
      outOfContract: gzipSync(JSON.stringify(broken)),
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
