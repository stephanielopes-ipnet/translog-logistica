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

/** Repositório sobre pedidos já carregados em memória (base dos adapters `fixtures` e `file`). */
export function createInMemoryRepository(byId: ReadonlyMap<number, Order>): OrderRepository {
  return {
    async findById(orderId) {
      return byId.get(orderId) ?? null;
    },
    async count() {
      return byId.size;
    },
  };
}
