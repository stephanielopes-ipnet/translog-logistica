import type { Order } from "@translog/contracts";
import type { OrderService } from "../orders/order-service.ts";

/** Maior número de pedido aceito (10 dígitos, como o campo da tela). */
const MAX_ORDER_ID_DIGITS = 10;

/**
 * Números citados no texto que podem ser pedidos, na ordem e sem repetir:
 * sequências de 1 a 10 dígitos, maiores que zero ("#375" → 375; "0015" → 15).
 * Sequências com mais de 10 dígitos (telefone, por exemplo) são ignoradas.
 */
export function citedOrderIds(message: string): number[] {
  const ids = (message.match(/\d+/g) ?? [])
    .filter((digits) => digits.length <= MAX_ORDER_ID_DIGITS)
    .map(Number)
    .filter((id) => id > 0);
  return [...new Set(ids)];
}

/** Primeiro pedido citado no texto que existe na fonte, ou `null`. */
export async function findCitedOrder(
  message: string,
  orders: Pick<OrderService, "findOrder">,
): Promise<Order | null> {
  for (const orderId of citedOrderIds(message)) {
    const order = await orders.findOrder(orderId);
    if (order) {
      return order;
    }
  }
  return null;
}
