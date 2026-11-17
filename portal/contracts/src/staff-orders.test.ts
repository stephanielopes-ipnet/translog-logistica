import { describe, expect, it } from "vitest";
import { orderSchema } from "./orders.ts";
import { type StaffOrder, staffOrderSchema } from "./staff-orders.ts";

/** Pedido 34 (Extraviado) como o colaborador recebe. */
const lost: StaffOrder = {
  orderId: 34,
  orderDate: "2015-01-01",
  referenceDate: "2018-02-06",
  status: "Extraviado",
  shippingMode: "First Class",
  transportMode: "Aéreo expresso",
  routeType: "Internacional",
  origin: "Caguas, Porto Rico, Estados Unidos",
  destination: "Tegucigalpa, Francisco Morazán, Honduras",
  region: "América Central",
  dispatch: {
    promisedDays: 1,
    expectedDate: "2015-01-02",
    actualDate: "2015-01-03",
    delayDays: 1,
    status: "Atrasado",
    probableCause: "Promessa irreal",
  },
  delivery: { expectedDate: "2015-01-05", actualDate: null, delayDays: null, probableCause: null },
  currentStage: { number: 3, label: "Alfândega" },
  currentLocation: "Volume não localizado após: Alfândega Tegucigalpa (Honduras)",
  lostAtStage: { number: 3, label: "Alfândega" },
  events: [
    {
      date: "2015-01-01",
      code: "PEDIDO_CRIADO",
      description: "Pedido registrado",
      stage: 0,
      stageLabel: "Pedido",
      location: "Pedido registrado no sistema",
    },
  ],
  items: [{ productName: "Bicicleta", category: "Cycling", quantity: 1, total: 278.98 }],
  total: 278.98,
  escalateToSupport: true,
  market: "LATAM",
  routeService: "América Latina - América Central - First Class",
  explanation: "Despacho em 2 dia(s), 1 dia(s) além do prazo de despacho de 1 dia(s).",
  dispatchDiagnosis: {
    promisedDays: 1,
    daysToDispatch: 2,
    delayDays: 1,
    suggestedDays: 2,
    onTimeWithSuggested: true,
  },
  transportDiagnosis: { standardTransitDays: 3, actualTransitDays: null, recoveredDays: null },
  stageDays: [
    { stage: 0, label: "Pedido", days: 2, ongoing: false },
    { stage: 3, label: "Alfândega", days: 7, ongoing: false },
  ],
  dataOrigin: { dispatch: "real", transport: "simulado", delivery: "simulado", loss: "simulado" },
  context: {
    shippingMode: { dispatchedOrders: 5693, lateDispatchPct: 100 },
    route: { evaluatedDeliveries: 900, lateDeliveryPct: 31.2 },
  },
  valueAtRisk: 278.98,
  aiSummary: "Pedido nº 34, feito em 01/01/2015.",
  rawTimeline: "01/01/2015 Pedido registrado",
};

function failedFields(value: unknown): string[] {
  const result = staffOrderSchema.safeParse(value);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join("."));
}

describe("staffOrderSchema", () => {
  it("aceita um pedido extraviado com o diagnóstico", () => {
    expect(staffOrderSchema.parse(lost)).toStrictEqual(lost);
  });

  it("tem todos os campos do cliente, mais o diagnóstico", () => {
    const staffKeys = Object.keys(staffOrderSchema.shape);

    expect(staffKeys).toEqual(expect.arrayContaining(Object.keys(orderSchema.shape)));
    expect(staffKeys.filter((key) => !(key in orderSchema.shape)).sort()).toEqual([
      "aiSummary",
      "context",
      "dataOrigin",
      "dispatchDiagnosis",
      "explanation",
      "market",
      "rawTimeline",
      "routeService",
      "stageDays",
      "transportDiagnosis",
      "valueAtRisk",
    ]);
  });

  it("descarta campos fora do contrato (dados do cliente e financeiro interno)", () => {
    const parsed = staffOrderSchema.parse({
      ...lost,
      id_cliente: 1,
      segmento_cliente: "Consumer",
      valor_desconto: 3.5,
      dispatchDiagnosis: { ...lost.dispatchDiagnosis, lucro: 9 },
    });

    expect(parsed).toStrictEqual(lost);
  });

  it.each([
    [{ market: "Brasil" }, "market"],
    [{ routeService: "" }, "routeService"],
    [
      { dispatchDiagnosis: { ...lost.dispatchDiagnosis, daysToDispatch: -1 } },
      "dispatchDiagnosis.daysToDispatch",
    ],
    [{ stageDays: [{ stage: 6, label: "Marte", days: 1, ongoing: false }] }, "stageDays.0.stage"],
    [{ stageDays: [{ stage: 1, label: "Coleta", days: -1, ongoing: false }] }, "stageDays.0.days"],
    [{ dataOrigin: { ...lost.dataOrigin, dispatch: "inventado" } }, "dataOrigin.dispatch"],
    [
      { context: { ...lost.context, route: { evaluatedDeliveries: 1, lateDeliveryPct: 101 } } },
      "context.route.lateDeliveryPct",
    ],
    [{ valueAtRisk: -1 }, "valueAtRisk"],
  ])("recusa %j, apontando %s", (change, field) => {
    expect(failedFields({ ...lost, ...change })).toContain(field);
  });
});
