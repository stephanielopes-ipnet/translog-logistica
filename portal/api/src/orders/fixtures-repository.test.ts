import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it, onTestFinished } from "vitest";
import { createFixturesRepository, FIXTURES_FILE } from "./fixtures-repository.ts";

/** Grava `content` num arquivo temporário (apagado ao fim do teste) e devolve a URL. */
async function tempFile(content: unknown): Promise<URL> {
  const dir = await mkdtemp(join(tmpdir(), "translog-fixtures-"));
  onTestFinished(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, "orders.json");
  await writeFile(file, JSON.stringify(content));
  return pathToFileURL(file);
}

async function readFixtures(): Promise<Record<string, unknown>[]> {
  return JSON.parse(await readFile(FIXTURES_FILE, "utf8"));
}

describe("createFixturesRepository", () => {
  it("carrega os 11 pedidos de exemplo", async () => {
    const orders = await createFixturesRepository();

    expect(await orders.count()).toBe(11);
    expect((await orders.findById(375))?.probableCause).toBe("Promessa irreal");
    expect(await orders.findById(1)).toBeNull();
  });

  it("os pedidos da demo cobrem as quatro situações", async () => {
    const orders = await createFixturesRepository();

    const statuses = await Promise.all(
      [15, 375, 562, 1002].map(async (id) => (await orders.findById(id))?.trackingStatus),
    );

    expect(statuses).toEqual(["Entregue", "Em Trânsito", "Aguardando Liberação", "Cancelado"]);
  });

  it("recusa arquivo com pedido fora do contrato, apontando o campo", async () => {
    const [first, ...rest] = await readFixtures();
    const file = await tempFile([{ ...first, trackingStatus: "Extraviado" }, ...rest]);

    await expect(createFixturesRepository(file)).rejects.toThrow(
      /Pedidos de exemplo inválidos.*\n.*trackingStatus/s,
    );
  });

  it("descarta na leitura campos que não estão no contrato", async () => {
    const [first] = await readFixtures();
    const file = await tempFile([{ ...first, id_cliente: 123, lucro_item: 9.99 }]);

    const order = await (await createFixturesRepository(file)).findById(15);

    expect(order).not.toHaveProperty("id_cliente");
    expect(order).not.toHaveProperty("lucro_item");
  });
});
