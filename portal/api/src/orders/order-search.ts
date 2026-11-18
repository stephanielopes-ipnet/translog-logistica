import type {
  StaffSearchQuery,
  StaffSearchResponse,
  StaffSearchRow,
  StaffSearchSort,
} from "@translog/contracts";
import type { OrderRecord } from "./order-record.ts";

// Busca da Área do colaborador (`GET /api/staff/orders`). O índice é montado uma vez, quando o
// repositório é criado (nos 3 modos; no `databricks`, de novo a cada troca dos pedidos):
//
// - `records`: os registros em ordem de número (a ordem `order` sai de graça);
// - `places`: cada origem e destino diferente ("Cidade, Estado, País"), uma vez só, já
//   normalizado (minúsculas, sem acento); são poucos milhares para 65.752 pedidos;
// - `originOf` / `destinationOf`: por pedido, a posição da origem e do destino em `places`.
//
// Uma busca por texto testa só os lugares únicos e depois marca os pedidos pelos números das
// posições: nenhum texto por pedido fica guardado. Varrer os 65.752 leva poucos milissegundos.

const ONLY_DIGITS = /^\d{1,10}$/;

/** Minúsculas e sem acentos, para comparar textos digitados com os da base. */
export function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export type OrderSearch = (query: StaffSearchQuery) => StaffSearchResponse;

/** Monta o índice dos registros e devolve a função de busca. */
export function createOrderSearch(source: Iterable<OrderRecord>): OrderSearch {
  const records = [...source].sort((a, b) => a.orderId - b.orderId);
  const placeIndex = new Map<string, number>();
  const places: string[] = [];
  const positionOf = (place: string): number => {
    const known = placeIndex.get(place);
    if (known !== undefined) {
      return known;
    }
    places.push(normalize(place));
    placeIndex.set(place, places.length - 1);
    return places.length - 1;
  };
  const originOf = new Uint32Array(records.length);
  const destinationOf = new Uint32Array(records.length);
  records.forEach((record, index) => {
    originOf[index] = positionOf(record.origin);
    destinationOf[index] = positionOf(record.destination);
  });
  // O texto original só servia para montar o índice.
  placeIndex.clear();

  /** Causas da base normalizadas (são poucas; guardadas na primeira vez que aparecem). */
  const causes = new Map<string, string>();
  const normalizedCause = (cause: string): string => {
    let value = causes.get(cause);
    if (value === undefined) {
      value = normalize(cause);
      causes.set(cause, value);
    }
    return value;
  };

  return (query) => {
    const matches = matcher(query);
    const found: number[] = [];
    for (let index = 0; index < records.length; index++) {
      const record = records[index];
      if (record && matches(record, index)) {
        found.push(index);
      }
    }
    const sort = query.sort ?? (query.minDelayDays === undefined ? "order" : "delay");
    if (sort !== "order") {
      const compare = COMPARE[sort];
      found.sort((a, b) => compare(records[a] as OrderRecord, records[b] as OrderRecord));
    }
    const start = (query.page - 1) * query.pageSize;
    return {
      total: found.length,
      page: query.page,
      pageSize: query.pageSize,
      results: found
        .slice(start, start + query.pageSize)
        .map((index) => toRow(records[index] as OrderRecord)),
    };
  };

  /** Os filtros da consulta (E entre filtros, OU dentro de cada lista). */
  function matcher(query: StaffSearchQuery): (record: OrderRecord, index: number) => boolean {
    const q = query.q ?? "";
    const byNumber = ONLY_DIGITS.test(q);
    const placeHit = !byNumber && q !== "" ? matchingPlaces(normalize(q)) : null;
    const status = query.status === undefined ? null : new Set<string>(query.status);
    const modes = query.shippingMode === undefined ? null : new Set<string>(query.shippingMode);
    const markets = query.market === undefined ? null : new Set<string>(query.market);
    const stages = query.stage === undefined ? null : new Set(query.stage);
    const cause = query.cause === undefined ? null : normalize(query.cause);
    const minDelay = query.minDelayDays;
    const onlyEscalated = query.escalated === true;

    return (record, index) => {
      if (byNumber && !String(record.orderId).startsWith(q)) return false;
      if (
        placeHit !== null &&
        placeHit[originOf[index] ?? 0] !== 1 &&
        placeHit[destinationOf[index] ?? 0] !== 1
      ) {
        return false;
      }
      if (status !== null && !status.has(record.status)) return false;
      if (modes !== null && !modes.has(record.shippingMode)) return false;
      if (markets !== null && !markets.has(record.market)) return false;
      if (stages !== null && !stages.has(record.currentStage?.number ?? -1)) return false;
      if (
        cause !== null &&
        !(
          (record.dispatch.probableCause !== null &&
            normalizedCause(record.dispatch.probableCause) === cause) ||
          (record.delivery.probableCause !== null &&
            normalizedCause(record.delivery.probableCause) === cause)
        )
      ) {
        return false;
      }
      if (minDelay !== undefined && (record.delivery.delayDays ?? 0) < minDelay) return false;
      if (onlyEscalated && !record.escalateToSupport) return false;
      return true;
    };
  }

  /** 1 nas posições de `places` que contêm o texto. */
  function matchingPlaces(text: string): Uint8Array {
    const hit = new Uint8Array(places.length);
    places.forEach((place, position) => {
      if (place.includes(text)) {
        hit[position] = 1;
      }
    });
    return hit;
  }
}

const NO_DELAY = Number.NEGATIVE_INFINITY;

const COMPARE: Record<
  Exclude<StaffSearchSort, "order">,
  (a: OrderRecord, b: OrderRecord) => number
> = {
  // Maior atraso de entrega primeiro; sem atraso calculado no fim; empate pelo número.
  delay: (a, b) =>
    (b.delivery.delayDays ?? NO_DELAY) - (a.delivery.delayDays ?? NO_DELAY) ||
    a.orderId - b.orderId,
  // Mais recentes primeiro (texto AAAA-MM-DD ordena como data); empate pelo número.
  date: (a, b) => b.orderDate.localeCompare(a.orderDate) || a.orderId - b.orderId,
};

/** Campos listados um a um: nada além da linha resumida sai do registro. */
function toRow(record: OrderRecord): StaffSearchRow {
  return {
    orderId: record.orderId,
    orderDate: record.orderDate,
    status: record.status,
    shippingMode: record.shippingMode,
    origin: record.origin,
    destination: record.destination,
    stage: record.currentStage,
    location: record.currentLocation,
    delayDays: record.delivery.delayDays,
    escalateToSupport: record.escalateToSupport,
    probableCause: record.delivery.probableCause ?? record.dispatch.probableCause,
  };
}
