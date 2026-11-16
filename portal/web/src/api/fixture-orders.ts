import { orderSchema } from "@translog/contracts";
import { z } from "zod";
import ordersJson from "../../../api/src/orders/fixtures/orders.json" with { type: "json" };

/**
 * Os 9 pedidos da demo, do mesmo arquivo que a API usa com DATA_SOURCE=fixtures (gerado das
 * tabelas consumo_*, sem dados do cliente). Só para os testes da tela: a tela consulta a API.
 */
export const FIXTURE_ORDERS = z.array(orderSchema).parse(ordersJson);

export function findFixtureOrder(orderId: number) {
  return FIXTURE_ORDERS.find((order) => order.orderId === orderId) ?? null;
}
