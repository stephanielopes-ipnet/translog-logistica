import type { Order } from "@translog/contracts";

/**
 * Porta: origem dos pedidos. Os adapters (`fixtures`, `file`) carregam tudo uma vez e
 * entregam pedidos já validados contra o `orderSchema`. A escolha acontece no `container.ts`.
 */
export interface OrderRepository {
  /** Pedido pelo número, ou `null` se não existir. */
  findById(orderId: number): Promise<Order | null>;
  /** Quantos pedidos a fonte tem. */
  count(): Promise<number>;
}
