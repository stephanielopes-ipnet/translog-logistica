import type { StaffSearchQuery, StaffSearchResponse, StaffSearchRow } from "@translog/contracts";
import type { OrderRecord } from "./order-record.ts";

// Busca da Área do colaborador (`GET /api/staff/orders`): varre os ~65 mil registros em memória
// (sem índice: com os filtros simples abaixo, uma consulta leva alguns milissegundos).

const ONLY_DIGITS = /^\d+$/;

/**
 * Texto pesquisável de cada registro (destino, origem, região e rota, sem acentos e em
 * minúsculas), montado na primeira busca e guardado junto do registro (WeakMap: some com ele
 * quando o `databricks` troca os pedidos).
 */
const searchText = new WeakMap<OrderRecord, string>();

export function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function textOf(record: OrderRecord): string {
  let text = searchText.get(record);
  if (text === undefined) {
    text = normalize(
      [record.destination, record.origin, record.region, record.routeService].join(" | "),
    );
    searchText.set(record, text);
  }
  return text;
}

/** Filtro que a consulta monta (todos se somam). */
function matcher(query: StaffSearchQuery): (record: OrderRecord) => boolean {
  const q = query.q ?? "";
  const byNumber = ONLY_DIGITS.test(q);
  const text = byNumber ? "" : normalize(q);
  const cause = query.cause === undefined ? undefined : normalize(query.cause);
  return (record) => {
    if (byNumber && !String(record.orderId).startsWith(q)) return false;
    if (text !== "" && !textOf(record).includes(text)) return false;
    if (query.status !== undefined && record.status !== query.status) return false;
    if (query.shippingMode !== undefined && record.shippingMode !== query.shippingMode) {
      return false;
    }
    if (query.market !== undefined && record.market !== query.market) return false;
    if (query.stage !== undefined && record.currentStage?.number !== query.stage) return false;
    if (
      cause !== undefined &&
      ![record.dispatch.probableCause, record.delivery.probableCause].some(
        (value) => value !== null && normalize(value) === cause,
      )
    ) {
      return false;
    }
    if (
      query.minDelayDays !== undefined &&
      (record.delivery.delayDays ?? Number.NEGATIVE_INFINITY) < query.minDelayDays
    ) {
      return false;
    }
    if (query.escalated !== undefined && record.escalateToSupport !== query.escalated) {
      return false;
    }
    return true;
  };
}

const COMPARE: Record<StaffSearchQuery["sort"], (a: OrderRecord, b: OrderRecord) => number> = {
  // Maior atraso de entrega primeiro; sem atraso calculado no fim; empate pelo número.
  delay: (a, b) =>
    (b.delivery.delayDays ?? Number.NEGATIVE_INFINITY) -
      (a.delivery.delayDays ?? Number.NEGATIVE_INFINITY) || a.orderId - b.orderId,
  orderId: (a, b) => a.orderId - b.orderId,
  // Mais recentes primeiro (texto AAAA-MM-DD ordena como data); empate pelo número.
  orderDate: (a, b) => b.orderDate.localeCompare(a.orderDate) || a.orderId - b.orderId,
};

export function searchOrders(
  records: Iterable<OrderRecord>,
  query: StaffSearchQuery,
): StaffSearchResponse {
  const matches = matcher(query);
  const found: OrderRecord[] = [];
  for (const record of records) {
    if (matches(record)) {
      found.push(record);
    }
  }
  found.sort(COMPARE[query.sort]);
  const start = (query.page - 1) * query.pageSize;
  return {
    total: found.length,
    page: query.page,
    pageSize: query.pageSize,
    results: found.slice(start, start + query.pageSize).map(toRow),
  };
}

/** Campos listados um a um: nada além da linha resumida sai do registro. */
function toRow(record: OrderRecord): StaffSearchRow {
  return {
    orderId: record.orderId,
    orderDate: record.orderDate,
    status: record.status,
    shippingMode: record.shippingMode,
    market: record.market,
    routeService: record.routeService,
    origin: record.origin,
    destination: record.destination,
    stage: record.currentStage,
    location: record.currentLocation,
    dispatchDelayDays: record.dispatch.delayDays,
    deliveryDelayDays: record.delivery.delayDays,
    escalateToSupport: record.escalateToSupport,
    probableCause: record.delivery.probableCause ?? record.dispatch.probableCause,
  };
}
