import type { Order, OrdersSummaryResponse, StaffOrder, TowerResponse } from "@translog/contracts";
import type { OrderRepository } from "./order-repository.ts";
import { toCustomerOrder, toStaffOrder } from "./order-views.ts";
import type { PromiseScenario } from "./promise-scenario.ts";
import { buildOrdersSummary, buildTower } from "./tower-stats.ts";

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
  /** Visão do cliente. Lança `OrderNotFoundError` se não existir. */
  getOrder(orderId: number): Promise<Order>;
  /** Visão do cliente, ou `null` se não existir (o chat usa para conferir pedidos citados). */
  findOrder(orderId: number): Promise<Order | null>;
  /** Visão do colaborador, com o diagnóstico. Lança `OrderNotFoundError` se não existir. */
  getStaffOrder(orderId: number): Promise<StaffOrder>;
  /** Pedidos de exemplo configurados que existem na fonte, na ordem configurada. */
  sampleOrderIds(): Promise<number[]>;
  /** Quantos pedidos a fonte tem. */
  count(): Promise<number>;
  /** Torre de controle (números calculados na carga). */
  getTower(): TowerResponse;
  /** Pedidos por mercado, para o mapa do Início (público, só números). */
  getSummary(): OrdersSummaryResponse;
}

export interface OrderServiceDeps {
  orders: OrderRepository;
  /** `SAMPLE_ORDER_IDS`, na ordem de exibição. */
  sampleOrderIds: readonly number[];
  /** Prazo de despacho sugerido por modalidade (Promessa ajustada, da Gold). */
  promiseScenario: PromiseScenario;
  /** Painel completo de performance (`DASHBOARD_URL`), ou `null`. */
  dashboardUrl?: string | null;
}

export function createOrderService({
  orders,
  sampleOrderIds,
  promiseScenario,
  dashboardUrl = null,
}: OrderServiceDeps): OrderService {
  async function getRecord(orderId: number) {
    const record = await orders.findById(orderId);
    if (!record) {
      throw new OrderNotFoundError(orderId);
    }
    return record;
  }

  return {
    getOrder: async (orderId) => toCustomerOrder(await getRecord(orderId)),

    async findOrder(orderId) {
      const record = await orders.findById(orderId);
      return record ? toCustomerOrder(record) : null;
    },

    getStaffOrder: async (orderId) =>
      toStaffOrder(await getRecord(orderId), {
        stats: orders.stats(),
        scenario: promiseScenario,
      }),

    async sampleOrderIds() {
      const found = await Promise.all(sampleOrderIds.map((id) => orders.findById(id)));
      return sampleOrderIds.filter((_id, index) => found[index] !== null);
    },

    count: () => orders.count(),

    getTower() {
      const stats = orders.stats();
      return buildTower(stats.tower, {
        scenario: promiseScenario,
        deliveryByRoute: stats.deliveryByRoute,
        dashboardUrl,
      });
    },

    getSummary: () => buildOrdersSummary(orders.stats().tower),
  };
}
