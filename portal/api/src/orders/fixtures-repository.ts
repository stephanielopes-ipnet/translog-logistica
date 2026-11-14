import { readFile } from "node:fs/promises";
import { orderSchema } from "@translog/contracts";
import { z } from "zod";
import type { OrderRepository } from "./order-repository.ts";

/** 11 pedidos reais da Silver, só com os campos do contrato (sem dados de cliente ou lucro). */
export const FIXTURES_FILE = new URL("./fixtures/orders.json", import.meta.url);

/**
 * Adapter `fixtures`: pedidos de exemplo que vêm no código. Valida o arquivo inteiro
 * contra o contrato ao carregar; qualquer pedido inválido impede a API de subir.
 */
export async function createFixturesRepository(
  file: URL = FIXTURES_FILE,
): Promise<OrderRepository> {
  const result = z.array(orderSchema).safeParse(JSON.parse(await readFile(file, "utf8")));
  if (!result.success) {
    throw new Error(
      `Pedidos de exemplo inválidos em ${file.pathname}:\n${z.prettifyError(result.error)}`,
    );
  }
  const byId = new Map(result.data.map((order) => [order.orderId, order]));

  return {
    async findById(orderId) {
      return byId.get(orderId) ?? null;
    },
    async count() {
      return byId.size;
    },
  };
}
