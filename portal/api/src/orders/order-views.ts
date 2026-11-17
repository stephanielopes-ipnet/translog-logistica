import type {
  Order,
  OrderContext,
  StaffDataOrigin,
  StaffOrder,
  StageDays,
  TransportDiagnosis,
} from "@translog/contracts";
import { customerCause } from "./customer-language.ts";
import type { OrderRecord } from "./order-record.ts";
import { latePercent, type OrderStats } from "./order-stats.ts";
import type { PromiseScenario } from "./promise-scenario.ts";

// As duas visões de um pedido, montadas a cada consulta a partir do `OrderRecord` guardado.
// Campos listados um a um (nunca `...record`): campo novo no registro não vaza para o cliente
// por acidente.

/** Situações em que o pedido ainda está na etapa atual na data de referência. */
const ONGOING_STATUSES: ReadonlySet<string> = new Set(["Em trânsito", "Aguardando pagamento"]);

/**
 * Origem de cada parte do pedido: o despacho vem do DataCo; transporte, entrega e extravio vêm
 * da simulação de rastreio do grupo (portal/_contexto/databricks.md).
 */
export const DATA_ORIGIN: StaffDataOrigin = {
  dispatch: "real",
  transport: "simulado",
  delivery: "simulado",
  loss: "simulado",
};

/** Visão do cliente: enxuta, com o motivo provável em linguagem do cliente. */
export function toCustomerOrder(record: OrderRecord): Order {
  const { dispatch, delivery } = record;
  return {
    orderId: record.orderId,
    orderDate: record.orderDate,
    referenceDate: record.referenceDate,
    status: record.status,
    shippingMode: record.shippingMode,
    transportMode: record.transportMode,
    routeType: record.routeType,
    origin: record.origin,
    destination: record.destination,
    region: record.region,
    dispatch: {
      promisedDays: dispatch.promisedDays,
      expectedDate: dispatch.expectedDate,
      actualDate: dispatch.actualDate,
      delayDays: dispatch.delayDays,
      status: dispatch.status,
      probableCause: customerCause(dispatch.probableCause),
    },
    delivery: {
      expectedDate: delivery.expectedDate,
      actualDate: delivery.actualDate,
      delayDays: delivery.delayDays,
      probableCause: customerCause(delivery.probableCause),
    },
    currentStage: record.currentStage,
    currentLocation: record.currentLocation,
    lostAtStage: record.lostAtStage,
    events: record.events,
    items: record.items,
    total: record.total,
    escalateToSupport: record.escalateToSupport,
  };
}

export interface StaffViewContext {
  /** Números da carga (contexto da modalidade e da rota). */
  stats: OrderStats;
  /** Prazo sugerido por modalidade (Promessa ajustada, da Gold). */
  scenario: PromiseScenario;
}

/** Visão do colaborador: o registro inteiro (causas da base) mais o diagnóstico. */
export function toStaffOrder(
  record: OrderRecord,
  { stats, scenario }: StaffViewContext,
): StaffOrder {
  const { dispatch, delivery } = record;
  const suggestedDays = scenario.get(record.shippingMode) ?? null;
  const deliveryLate = delivery.delayDays !== null && delivery.delayDays > 0;
  return {
    ...toCustomerOrder(record),
    dispatch: {
      promisedDays: dispatch.promisedDays,
      expectedDate: dispatch.expectedDate,
      actualDate: dispatch.actualDate,
      delayDays: dispatch.delayDays,
      status: dispatch.status,
      probableCause: dispatch.probableCause,
    },
    delivery: {
      expectedDate: delivery.expectedDate,
      actualDate: delivery.actualDate,
      delayDays: delivery.delayDays,
      probableCause: delivery.probableCause,
    },
    market: record.market,
    routeService: record.routeService,
    explanation: record.explanation,
    dispatchDiagnosis: {
      promisedDays: dispatch.promisedDays,
      daysToDispatch: record.daysToDispatch,
      delayDays: dispatch.delayDays,
      suggestedDays,
      onTimeWithSuggested:
        record.daysToDispatch === null || suggestedDays === null
          ? null
          : record.daysToDispatch <= suggestedDays,
    },
    transportDiagnosis: transportDiagnosis(record),
    stageDays: stageDays(record),
    dataOrigin: { ...DATA_ORIGIN },
    context: orderContext(record, stats),
    valueAtRisk: record.status === "Extraviado" || deliveryLate ? record.total : null,
    aiSummary: record.aiSummary,
    rawTimeline: record.rawTimeline,
  };
}

/** Trânsito padrão × real e quanto o transporte recuperou. */
export function transportDiagnosis({ dispatch, delivery }: OrderRecord): TransportDiagnosis {
  const standard = daysBetween(dispatch.expectedDate, delivery.expectedDate);
  const actual = daysBetween(dispatch.actualDate, delivery.actualDate);
  return {
    standardTransitDays: standard,
    actualTransitDays: actual,
    recoveredDays: standard === null || actual === null ? null : standard - actual,
  };
}

/**
 * Dias em cada etapa, pelas datas dos eventos (os horários da base são sintéticos): do primeiro
 * evento da etapa ao primeiro da etapa seguinte. A última etapa vai até o último evento ou, se o
 * pedido ainda está nela (em trânsito, aguardando pagamento), até a data de referência.
 */
export function stageDays(record: OrderRecord): StageDays[] {
  const segments: { stage: number; label: string; start: string }[] = [];
  for (const event of record.events) {
    if (segments.at(-1)?.stage !== event.stage) {
      segments.push({ stage: event.stage, label: event.stageLabel, start: event.date });
    }
  }
  const ongoing = ONGOING_STATUSES.has(record.status);
  const lastDate = record.events.at(-1)?.date ?? record.referenceDate;
  return segments.map((segment, index) => {
    const isLast = index === segments.length - 1;
    const end = isLast ? (ongoing ? record.referenceDate : lastDate) : segments[index + 1]?.start;
    return {
      stage: segment.stage,
      label: segment.label,
      days: Math.max(0, daysBetween(segment.start, end ?? segment.start) ?? 0),
      ongoing: isLast && ongoing,
    };
  });
}

function orderContext(record: OrderRecord, stats: OrderStats): OrderContext {
  const mode = stats.dispatchByMode.get(record.shippingMode);
  const route = stats.deliveryByRoute.get(record.routeService);
  return {
    shippingMode: { dispatchedOrders: mode?.total ?? 0, lateDispatchPct: latePercent(mode) },
    route: { evaluatedDeliveries: route?.total ?? 0, lateDeliveryPct: latePercent(route) },
  };
}

/**
 * Dias de `from` até `to` (datas `AAAA-MM-DD`); `null` se faltar uma delas. Conta pelo
 * calendário em UTC, a partir dos números da data: nunca `new Date(texto)`, que mudaria o dia
 * conforme o fuso.
 */
export function daysBetween(from: string | null, to: string | null): number | null {
  if (from === null || to === null) {
    return null;
  }
  return Math.round((utcDay(to) - utcDay(from)) / 86_400_000);
}

function utcDay(date: string): number {
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}
