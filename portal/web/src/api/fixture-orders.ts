import { orderSchema } from "@translog/contracts";
import { z } from "zod";
import ordersJson from "../../../api/src/orders/fixtures/orders.json" with { type: "json" };

/**
 * Os 9 pedidos da demo, do mesmo arquivo que a API usa com DATA_SOURCE=fixtures (gerado das
 * tabelas consumo_*, sem dados do cliente). Só para os testes da tela: a tela consulta a API.
 * O arquivo guarda o registro completo da API; o `parse` descarta o que não é do cliente, mas o
 * motivo provável fica nos termos da base (a API o traduz para o cliente na resposta).
 */
export const FIXTURE_ORDERS = z.array(orderSchema).parse(ordersJson);

export function findFixtureOrder(orderId: number) {
  return FIXTURE_ORDERS.find((order) => order.orderId === orderId) ?? null;
}
