import { readFileSync } from "node:fs";
import { orderSchema, type ShippingMode, staffOrderSchema } from "@translog/contracts";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { FIXTURES_FILE } from "./fixtures-repository.ts";
import { type OrderRecord, orderRecordSchema } from "./order-record.ts";
import { computeOrderStats } from "./order-stats.ts";
import { daysBetween, toCustomerOrder, toStaffOrder } from "./order-views.ts";
import { NO_PROMISE_SCENARIO } from "./promise-scenario.ts";

const fixtures = z.array(orderRecordSchema).parse(JSON.parse(readFileSync(FIXTURES_FILE, "utf8")));

/** Cenário "Promessa ajustada" da Gold (`param_cenario_prazo`, linhas ativas, 17/11). */
const GOLD_SCENARIO = new Map<ShippingMode, number>([
  ["First Class", 2],
  ["Same Day", 1],
  ["Second Class", 4],
  ["Standard Class", 4],
]);

const context = { stats: computeOrderStats(fixtures), scenario: GOLD_SCENARIO };

function record(orderId: number): OrderRecord {
  const found = fixtures.find((candidate) => candidate.orderId === orderId);
  if (!found) {
    throw new Error(`Pedido ${orderId} fora dos fixtures`);
  }
  return found;
}

const staff = (orderId: number) => toStaffOrder(record(orderId), context);

describe("toStaffOrder: diagnóstico", () => {
  it("76902: First Class em trânsito; com 2 dias (Promessa ajustada) o despacho estaria no prazo", () => {
    const order = staff(76902);

    expect(order.dispatchDiagnosis).toStrictEqual({
      promisedDays: 1,
      daysToDispatch: 2,
      delayDays: 1,
      suggestedDays: 2,
      onTimeWithSuggested: true,
    });
    // Trânsito padrão: 28/01 → 01/02. Ainda não entregue: sem trânsito real.
    expect(order.transportDiagnosis).toStrictEqual({
      standardTransitDays: 4,
      actualTransitDays: null,
      recoveredDays: null,
    });
    // Parado na alfândega desde 31/01; data de referência 06/02.
    expect(order.stageDays).toStrictEqual([
      { stage: 0, label: "Pedido", days: 2, ongoing: false },
      { stage: 1, label: "Coleta", days: 1, ongoing: false },
      { stage: 2, label: "Voo", days: 1, ongoing: false },
      { stage: 3, label: "Alfândega", days: 6, ongoing: true },
    ]);
    expect(order.valueAtRisk).toBe(194.24);
    expect(order.dispatch.probableCause).toBe("Promessa irreal");
    expect(order.delivery.probableCause).toBe("Volume sem atualização de rastreio");
  });

  it("375: Second Class; 6 dias para despachar estouram até os 4 sugeridos; transporte no padrão", () => {
    const order = staff(375);

    expect(order.dispatchDiagnosis).toStrictEqual({
      promisedDays: 2,
      daysToDispatch: 6,
      delayDays: 4,
      suggestedDays: 4,
      onTimeWithSuggested: false,
    });
    // Padrão 08/01 → 13/01; real 12/01 → 17/01: o transporte não recuperou nada.
    expect(order.transportDiagnosis).toStrictEqual({
      standardTransitDays: 5,
      actualTransitDays: 5,
      recoveredDays: 0,
    });
    expect(order.stageDays.map(({ label, days }) => [label, days])).toEqual([
      ["Pedido", 6],
      ["Coleta", 1],
      ["Voo", 1],
      ["Alfândega", 2],
      ["Transferência", 0],
      ["Última milha", 1],
    ]);
    expect(order.stageDays.some((stage) => stage.ongoing)).toBe(false);
    expect(order.valueAtRisk).toBe(91.34);
    expect(order.explanation).toMatch(/^Despacho em 6 dia\(s\)/);
  });

  it("34: extraviado na alfândega depois de 7 dias; total do pedido em risco", () => {
    const order = staff(34);

    expect(order.dispatchDiagnosis).toMatchObject({
      daysToDispatch: 2,
      suggestedDays: 2,
      onTimeWithSuggested: true,
    });
    expect(order.transportDiagnosis).toStrictEqual({
      standardTransitDays: 3,
      actualTransitDays: null,
      recoveredDays: null,
    });
    expect(order.stageDays.at(-1)).toStrictEqual({
      stage: 3,
      label: "Alfândega",
      days: 7,
      ongoing: false,
    });
    expect(order.valueAtRisk).toBe(278.98);
    expect(order.dataOrigin).toStrictEqual({
      dispatch: "real",
      transport: "simulado",
      delivery: "simulado",
      loss: "simulado",
    });
  });

  it("222: First Class entregue 1 dia atrasado, transporte no padrão (3 dias)", () => {
    const order = staff(222);

    expect(order.dispatchDiagnosis.onTimeWithSuggested).toBe(true);
    expect(order.transportDiagnosis).toStrictEqual({
      standardTransitDays: 3,
      actualTransitDays: 3,
      recoveredDays: 0,
    });
    expect(order.stageDays.map(({ stage, days }) => [stage, days])).toEqual([
      [0, 2],
      [1, 0],
      [2, 1],
      [3, 1],
      [4, 0],
      [5, 1],
    ]);
    expect(order.valueAtRisk).toBe(445.95);
  });

  it("31298: doméstica rodoviária; o transporte recuperou os 2 dias do despacho", () => {
    const order = staff(31298);

    expect(order.dispatchDiagnosis).toStrictEqual({
      promisedDays: 2,
      daysToDispatch: 4,
      delayDays: 2,
      suggestedDays: 4,
      onTimeWithSuggested: true,
    });
    expect(order.transportDiagnosis).toStrictEqual({
      standardTransitDays: 3,
      actualTransitDays: 1,
      recoveredDays: 2,
    });
    expect(order.stageDays.map(({ label }) => label)).toEqual([
      "Pedido",
      "Coleta",
      "Transferência",
      "Última milha",
    ]);
    expect(order.valueAtRisk).toBeNull();
    expect(order.routeService).toBe("EUA e Canadá - Sul dos EUA - Second Class");
  });

  it("9: não pago, sem despacho: diagnóstico vazio e só a etapa Pedido", () => {
    const order = staff(9);

    expect(order.dispatchDiagnosis).toStrictEqual({
      promisedDays: 4,
      daysToDispatch: null,
      delayDays: null,
      suggestedDays: 4,
      onTimeWithSuggested: null,
    });
    expect(order.transportDiagnosis).toStrictEqual({
      standardTransitDays: null,
      actualTransitDays: null,
      recoveredDays: null,
    });
    expect(order.stageDays).toStrictEqual([{ stage: 0, label: "Pedido", days: 0, ongoing: false }]);
    expect(order.valueAtRisk).toBeNull();
  });

  it("contexto: % de despachos atrasados da modalidade e de entregas atrasadas da rota", () => {
    expect(staff(8).context).toStrictEqual({
      shippingMode: { dispatchedOrders: 2, lateDispatchPct: 50 },
      route: { evaluatedDeliveries: 1, lateDeliveryPct: 0 },
    });
    expect(staff(34).context).toStrictEqual({
      shippingMode: { dispatchedOrders: 3, lateDispatchPct: 100 },
      route: { evaluatedDeliveries: 1, lateDeliveryPct: 100 },
    });
  });

  it("sem cenário carregado: prazo sugerido e comparação ficam null", () => {
    const order = toStaffOrder(record(76902), { ...context, scenario: NO_PROMISE_SCENARIO });

    expect(order.dispatchDiagnosis).toMatchObject({
      suggestedDays: null,
      onTimeWithSuggested: null,
    });
  });

  it("resumo para a IA e linha do tempo bruta vêm da base", () => {
    const order = staff(76902);

    expect(order.aiSummary).toMatch(/^Pedido nº 76902, feito em 27\/01\/2018\./);
    expect(order.rawTimeline).toMatch(/^27\/01\/2018 Pedido registrado · 29\/01\/2018/);
  });

  it.each(fixtures.map((candidate) => candidate.orderId))(
    "pedido %i: a visão do colaborador segue o contrato (sem campo a mais)",
    (orderId) => {
      expect(() => staffOrderSchema.strict().parse(staff(orderId))).not.toThrow();
    },
  );
});

describe("toCustomerOrder: visão do cliente", () => {
  it("76902: motivo em linguagem do cliente, sem mercado, frase técnica nem diagnóstico", () => {
    const order = toCustomerOrder(record(76902));

    expect(order.dispatch.probableCause).toBe(
      "o prazo de despacho prometido para esta modalidade costuma ser curto demais",
    );
    expect(order.delivery.probableCause).toBe("seu pedido está sem novas atualizações de rastreio");
    expect(order.region).toBe("Sudeste Asiático");
    expect(order.destination).toBe("Jacarta, Jacarta, Indonésia");
    expect(JSON.stringify(order)).not.toMatch(
      /Pacific Asia|Promessa irreal|0\.0%|resumo|Pedido nº/,
    );
  });

  it.each(fixtures.map((candidate) => candidate.orderId))(
    "pedido %i: só os campos do contrato do cliente",
    (orderId) => {
      const order = toCustomerOrder(record(orderId));

      expect(Object.keys(order).sort()).toEqual(Object.keys(orderSchema.shape).sort());
      expect(() => orderSchema.strict().parse(order)).not.toThrow();
    },
  );

  it("campo novo no registro não vaza para o cliente (campos listados um a um)", () => {
    const leaky = { ...record(375), id_cliente: 1, segredo: "x" } as OrderRecord;

    expect(toCustomerOrder(leaky)).not.toHaveProperty("id_cliente");
    expect(toCustomerOrder(leaky)).not.toHaveProperty("segredo");
    expect(toStaffOrder(leaky, context)).not.toHaveProperty("id_cliente");
  });
});

describe("daysBetween", () => {
  it.each([
    ["2018-01-31", "2018-02-06", 6],
    ["2016-02-28", "2016-03-01", 2], // ano bissexto
    ["2015-01-17", "2015-01-12", -5],
    [null, "2015-01-12", null],
    ["2015-01-12", null, null],
  ] as const)("%s → %s = %j", (from, to, days) => {
    expect(daysBetween(from, to)).toBe(days);
  });
});
