import { readFile } from "node:fs/promises";
import { z } from "zod";
import { orderRecordSchema } from "./order-record.ts";
import { createInMemoryRepository, type OrderRepository } from "./order-repository.ts";

/**
 * Os 9 pedidos da demo, gerados das tabelas `consumo_*` por `pnpm --filter @translog/api
 * fixtures` no formato `OrderRecord` (sem dados do cliente nem financeiro interno).
 */
export const FIXTURES_FILE = new URL("./fixtures/orders.json", import.meta.url);

/**
 * Adapter `fixtures`: pedidos de exemplo que vêm no código. Valida o arquivo inteiro
 * contra o contrato ao carregar; qualquer pedido inválido impede a API de subir.
 */
export async function createFixturesRepository(
  file: URL = FIXTURES_FILE,
): Promise<OrderRepository> {
  const result = z.array(orderRecordSchema).safeParse(JSON.parse(await readFile(file, "utf8")));
  if (!result.success) {
    throw new Error(
      `Pedidos de exemplo inválidos em ${file.pathname}:\n${z.prettifyError(result.error)}`,
    );
  }
  return createInMemoryRepository(new Map(result.data.map((order) => [order.orderId, order])));
}
