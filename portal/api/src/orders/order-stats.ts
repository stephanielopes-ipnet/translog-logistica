import type { OrderRecord } from "./order-record.ts";

// Números agregados calculados uma vez, quando os pedidos são carregados (nos 3 modos). Servem
// de contexto para a visão do colaborador ("% de despachos atrasados da modalidade", "% de
// entregas atrasadas da rota").

/** Quantos pedidos entram na conta e quantos deles atrasaram. */
export interface LateCount {
  total: number;
  late: number;
}

export interface OrderStats {
  /** Por modalidade: pedidos despachados e despachos atrasados. */
  dispatchByMode: ReadonlyMap<string, LateCount>;
  /** Por rota (`rota_servico`): entregas avaliadas (entregues ou em trânsito) e atrasadas. */
  deliveryByRoute: ReadonlyMap<string, LateCount>;
}

/**
 * - Despacho avaliado = pedido despachado (tem data de despacho real); atrasado = saiu depois
 *   do prometido (`dispatch.delayDays > 0`).
 * - Entrega avaliada = tem atraso de entrega calculado (entregue, ou em trânsito contando até a
 *   data de referência; extraviados ficam de fora); atrasada = `delivery.delayDays > 0`.
 */
export function computeOrderStats(records: Iterable<OrderRecord>): OrderStats {
  const dispatchByMode = new Map<string, LateCount>();
  const deliveryByRoute = new Map<string, LateCount>();
  for (const record of records) {
    if (record.dispatch.actualDate !== null) {
      add(dispatchByMode, record.shippingMode, (record.dispatch.delayDays ?? 0) > 0);
    }
    if (record.delivery.delayDays !== null) {
      add(deliveryByRoute, record.routeService, record.delivery.delayDays > 0);
    }
  }
  return { dispatchByMode, deliveryByRoute };
}

/** `late` de `total` em %, com 1 casa decimal; `null` sem pedidos. */
export function latePercent(count: LateCount | undefined): number | null {
  if (!count || count.total === 0) {
    return null;
  }
  return Math.round((1000 * count.late) / count.total) / 10;
}

function add(counts: Map<string, LateCount>, key: string, late: boolean): void {
  const count = counts.get(key);
  if (count) {
    count.total++;
    count.late += late ? 1 : 0;
  } else {
    counts.set(key, { total: 1, late: late ? 1 : 0 });
  }
}
