import type { Order } from "@translog/contracts";
import type { OrderRepository } from "./order-repository.ts";

/** Erro de domínio: o pedido não existe na fonte. Vira `404` em `http/errors.ts`. */
export class OrderNotFoundError extends Error {
  readonly orderId: number;

  constructor(orderId: number) {
    super(`Pedido ${orderId} não encontrado.`);
    this.name = "OrderNotFoundError";
    this.orderId = orderId;
  }
}

export interface OrderService {
  /** Pedido pelo número. Lança `OrderNotFoundError` se não existir. */
  getOrder(orderId: number): Promise<Order>;
  /** Pedidos de exemplo configurados que existem na fonte, na ordem configurada. */
  sampleOrderIds(): Promise<number[]>;
  /** Quantos pedidos a fonte tem. */
  count(): Promise<number>;
}

export interface OrderServiceDeps {
  orders: OrderRepository;
  /** `SAMPLE_ORDER_IDS`, na ordem de exibição. */
  sampleOrderIds: readonly number[];
}

export function createOrderService({ orders, sampleOrderIds }: OrderServiceDeps): OrderService {
  return {
    async getOrder(orderId) {
      const order = await orders.findById(orderId);
      if (!order) {
        throw new OrderNotFoundError(orderId);
      }
      return order;
    },

    async sampleOrderIds() {
      const found = await Promise.all(sampleOrderIds.map((id) => orders.findById(id)));
      return sampleOrderIds.filter((_id, index) => found[index] !== null);
    },

    count: () => orders.count(),
  };
}
