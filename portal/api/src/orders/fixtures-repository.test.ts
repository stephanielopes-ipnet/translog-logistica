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
  it("carrega os 9 pedidos da demo", async () => {
    const orders = await createFixturesRepository();

    expect(await orders.count()).toBe(9);
    expect((await orders.findById(76902))?.dispatch.probableCause).toBe("Promessa irreal");
    expect(await orders.findById(1)).toBeNull();
  });

  it("os pedidos da demo cobrem as 6 situações dos dados de exemplo e a central", async () => {
    const orders = await createFixturesRepository();

    const view = await Promise.all(
      [76902, 375, 34, 222, 8, 9, 50, 31298, 76385].map(async (id) => {
        const order = await orders.findById(id);
        return [id, order?.status, order?.escalateToSupport];
      }),
    );

    expect(view).toEqual([
      [76902, "Em trânsito", true],
      [375, "Entregue com atraso", true],
      [34, "Extraviado", true],
      [222, "Entregue com atraso", false],
      [8, "Entregue no prazo", false],
      [9, "Não pago (expirado)", false],
      [50, "Cancelado", false],
      [31298, "Entregue no prazo", false],
      [76385, "Em trânsito", true],
    ]);
  });

  it("recusa arquivo com pedido fora do contrato, apontando o campo", async () => {
    const [first, ...rest] = await readFixtures();
    const file = await tempFile([{ ...first, status: "Entregue" }, ...rest]);

    await expect(createFixturesRepository(file)).rejects.toThrow(
      /Pedidos de exemplo inválidos.*\n.*status/s,
    );
  });

  it("descarta na leitura campos que não estão no contrato", async () => {
    const [first] = await readFixtures();
    const file = await tempFile([{ ...first, id_cliente: 123, preco_unitario: 9.99 }]);

    const order = await (await createFixturesRepository(file)).findById(76902);

    expect(order).not.toHaveProperty("id_cliente");
    expect(order).not.toHaveProperty("preco_unitario");
  });
});
