import type {
  AttentionOrder,
  Market,
  OrdersSummaryResponse,
  PromiseByMode,
  ShippingMode,
  StageCount,
  TowerResponse,
} from "@translog/contracts";
import type { OrderRecord } from "./order-record.ts";

// Números da Torre de controle e do resumo do Início, acumulados numa passada só quando os
// pedidos são carregados (junto com `computeOrderStats`).

/** Ordem fixa das modalidades (da mais lenta para a mais rápida). */
export const SHIPPING_MODE_ORDER: readonly ShippingMode[] = [
  "Standard Class",
  "Second Class",
  "First Class",
  "Same Day",
];

/** Ordem fixa dos mercados no mapa do Início. */
export const MARKET_ORDER: readonly Market[] = [
  "USCA",
  "LATAM",
  "Europe",
  "Pacific Asia",
  "Africa",
];

/** Mínimo de entregas avaliadas para uma rota entrar em "rotas com mais atraso". */
export const LATE_ROUTE_MIN_DELIVERIES = 300;
const LATE_ROUTES_SHOWN = 8;
/** Atraso a partir do qual o pedido vai para a central (igual a `escalation.ts`). */
const SUPPORT_MIN_DELAY_DAYS = 3;

interface Count {
  total: number;
  late: number;
}

interface ModeStats {
  promisedDays: number;
  dispatch: Count;
  delivery: Count;
}

export interface TowerStats {
  referenceDate: string | null;
  totalOrders: number;
  dispatch: Count;
  delivery: Count;
  inTransit: { total: number; late: number; lateForSupport: number };
  escalatedToSupport: number;
  lost: number;
  attention: AttentionOrder[];
  modes: ReadonlyMap<ShippingMode, ModeStats>;
  inTransitByStage: StageCount[];
  lostByStage: StageCount[];
  markets: ReadonlyMap<Market, number>;
}

/** Acumula os números pedido a pedido; `finish` ordena e congela. */
export function createTowerAccumulator() {
  let referenceDate: string | null = null;
  let totalOrders = 0;
  const dispatch: Count = { total: 0, late: 0 };
  const delivery: Count = { total: 0, late: 0 };
  const inTransit = { total: 0, late: 0, lateForSupport: 0 };
  let escalatedToSupport = 0;
  let lost = 0;
  const attention: AttentionOrder[] = [];
  const modes = new Map<ShippingMode, ModeStats>();
  const inTransitByStage = new Map<number, StageCount>();
  const lostByStage = new Map<number, StageCount>();
  const markets = new Map<Market, number>();

  return {
    add(record: OrderRecord): void {
      totalOrders++;
      referenceDate ??= record.referenceDate;
      markets.set(record.market, (markets.get(record.market) ?? 0) + 1);
      if (record.escalateToSupport) {
        escalatedToSupport++;
      }

      let mode = modes.get(record.shippingMode);
      if (!mode) {
        mode = {
          promisedDays: record.dispatch.promisedDays,
          dispatch: { total: 0, late: 0 },
          delivery: { total: 0, late: 0 },
        };
        modes.set(record.shippingMode, mode);
      }

      if (record.dispatch.actualDate !== null) {
        const late = (record.dispatch.delayDays ?? 0) > 0;
        tally(dispatch, late);
        tally(mode.dispatch, late);
      }
      if (record.delivery.delayDays !== null) {
        const late = record.delivery.delayDays > 0;
        tally(delivery, late);
        tally(mode.delivery, late);
      }

      if (record.status === "Em trânsito") {
        const delay = record.delivery.delayDays;
        inTransit.total++;
        inTransit.late += delay !== null && delay > 0 ? 1 : 0;
        inTransit.lateForSupport += delay !== null && delay >= SUPPORT_MIN_DELAY_DAYS ? 1 : 0;
        countStage(inTransitByStage, record.currentStage);
        attention.push({
          orderId: record.orderId,
          origin: record.origin,
          destination: record.destination,
          market: record.market,
          shippingMode: record.shippingMode,
          stage: record.currentStage,
          location: record.currentLocation,
          delayDays: delay,
          probableCause: record.delivery.probableCause ?? record.dispatch.probableCause,
        });
      }
      if (record.status === "Extraviado") {
        lost++;
        countStage(lostByStage, record.lostAtStage);
      }
    },

    finish(): TowerStats {
      attention.sort(
        (a, b) => (b.delayDays ?? -Infinity) - (a.delayDays ?? -Infinity) || a.orderId - b.orderId,
      );
      return {
        referenceDate,
        totalOrders,
        dispatch,
        delivery,
        inTransit,
        escalatedToSupport,
        lost,
        attention,
        modes,
        inTransitByStage: byStage(inTransitByStage),
        lostByStage: byStage(lostByStage),
        markets,
      };
    },
  };
}

export interface BuildTowerOptions {
  /** Entregas avaliadas e atrasadas por rota (`OrderStats.deliveryByRoute`). */
  deliveryByRoute: ReadonlyMap<string, Count>;
}

/** Resposta de `GET /api/staff/tower`. */
export function buildTower(
  stats: TowerStats,
  { deliveryByRoute }: BuildTowerOptions,
): TowerResponse {
  const promiseByMode: PromiseByMode[] = [];
  for (const shippingMode of SHIPPING_MODE_ORDER) {
    const mode = stats.modes.get(shippingMode);
    if (!mode) {
      continue;
    }
    promiseByMode.push({
      shippingMode,
      promisedDays: mode.promisedDays,
      dispatchedOrders: mode.dispatch.total,
      lateDispatchPct: percent(mode.dispatch),
      evaluatedDeliveries: mode.delivery.total,
      lateDeliveryPct: percent(mode.delivery),
    });
  }

  const lateRoutes = [...deliveryByRoute]
    .filter(([, count]) => count.total >= LATE_ROUTE_MIN_DELIVERIES)
    .map(([routeService, count]) => ({
      routeService,
      evaluatedDeliveries: count.total,
      lateDeliveryPct: percent(count),
    }))
    .sort((a, b) => (b.lateDeliveryPct ?? 0) - (a.lateDeliveryPct ?? 0))
    .slice(0, LATE_ROUTES_SHOWN);

  return {
    referenceDate: stats.referenceDate,
    totalOrders: stats.totalOrders,
    indicators: {
      dispatchOnTime: onTime(stats.dispatch),
      deliveryOnTime: onTime(stats.delivery),
      inTransit: { ...stats.inTransit },
      escalatedToSupport: stats.escalatedToSupport,
      lost: stats.lost,
    },
    attention: stats.attention,
    promiseByMode,
    inTransitByStage: stats.inTransitByStage,
    lostByStage: stats.lostByStage,
    lateRoutes,
  };
}

/** Resposta de `GET /api/orders/summary` (pública, só números). */
export function buildOrdersSummary(stats: TowerStats): OrdersSummaryResponse {
  return {
    totalOrders: stats.totalOrders,
    markets: MARKET_ORDER.map((market) => ({ market, orders: stats.markets.get(market) ?? 0 })),
  };
}

function tally(count: Count, late: boolean): void {
  count.total++;
  count.late += late ? 1 : 0;
}

function countStage(
  counts: Map<number, StageCount>,
  stage: { number: number; label: string } | null,
): void {
  if (!stage) {
    return;
  }
  const current = counts.get(stage.number);
  if (current) {
    current.count++;
  } else {
    counts.set(stage.number, { stage: stage.number, label: stage.label, count: 1 });
  }
}

function byStage(counts: Map<number, StageCount>): StageCount[] {
  return [...counts.values()].sort((a, b) => a.stage - b.stage);
}

/** % com 1 casa decimal; `null` sem pedidos. */
function percent({ total, late }: Count): number | null {
  return total === 0 ? null : Math.round((1000 * late) / total) / 10;
}

function onTime(count: Count) {
  const onTimeCount = count.total - count.late;
  return {
    onTime: onTimeCount,
    total: count.total,
    pct: count.total === 0 ? null : Math.round((1000 * onTimeCount) / count.total) / 10,
  };
}
