import { describe, expect, it } from "vitest";
import { type Order, orderSchema, orderStatusSchema } from "./orders.ts";

/** Pedido 9 (Não pago (expirado)) como o cliente recebe: sem prazos nem etapa. */
const unpaid: Order = {
  orderId: 9,
  orderDate: "2015-01-01",
  referenceDate: "2018-02-06",
  status: "Não pago (expirado)",
  shippingMode: "Standard Class",
  transportMode: null,
  routeType: "Internacional",
  origin: "Lakewood, Ohio, Estados Unidos",
  destination: "São Paulo, São Paulo, Brasil",
  region: "América do Sul",
  dispatch: {
    promisedDays: 4,
    expectedDate: null,
    actualDate: null,
    delayDays: null,
    status: "Não Avaliado",
    probableCause: null,
  },
  delivery: { expectedDate: null, actualDate: null, delayDays: null, probableCause: null },
  currentStage: null,
  currentLocation: null,
  lostAtStage: null,
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
  items: [
    {
      productName: "Pelican Sunstream 100 Kayak",
      category: "Water Sports",
      quantity: 1,
      total: 199.99,
    },
  ],
  total: 199.99,
  escalateToSupport: false,
};

/** Pedido 34 (Extraviado), com etapa do extravio e encaminhamento à central. */
const lost: Order = {
  ...unpaid,
  orderId: 34,
  status: "Extraviado",
  shippingMode: "First Class",
  transportMode: "Aéreo expresso",
  dispatch: {
    promisedDays: 1,
    expectedDate: "2015-01-02",
    actualDate: "2015-01-03",
    delayDays: 1,
    status: "Atrasado",
    probableCause: "o prazo de despacho prometido para esta modalidade costuma ser curto demais",
  },
  delivery: { expectedDate: "2015-01-05", actualDate: null, delayDays: null, probableCause: null },
  currentStage: { number: 3, label: "Alfândega" },
  currentLocation: "Volume não localizado após: Alfândega Tegucigalpa (Honduras)",
  lostAtStage: { number: 3, label: "Alfândega" },
  escalateToSupport: true,
};

/** Caminhos dos campos que falharam. */
function failedFields(value: unknown): string[] {
  const result = orderSchema.safeParse(value);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join("."));
}

describe("orderSchema", () => {
  it.each([
    ["não pago", unpaid],
    ["extraviado", lost],
  ])("aceita um pedido %s", (_name, order) => {
    expect(orderSchema.parse(order)).toStrictEqual(order);
  });

  it("tem as 7 situações da base", () => {
    expect(orderStatusSchema.options).toEqual([
      "Entregue no prazo",
      "Entregue com atraso",
      "Em trânsito",
      "Extraviado",
      "Cancelado",
      "Não pago (expirado)",
      "Aguardando pagamento",
    ]);
  });

  it("não tem mais os campos antigos (situação, prazo e motivo únicos)", () => {
    const keys = Object.keys(orderSchema.shape);

    for (const old of [
      "trackingStatus",
      "deadlineStatus",
      "delayWindow",
      "delayDays",
      "estimatedDeliveryDate",
      "actualDeliveryDate",
      "probableCause",
    ]) {
      expect(keys).not.toContain(old);
    }
  });

  it("não tem o diagnóstico interno (só na visão do colaborador)", () => {
    const keys = Object.keys(orderSchema.shape);

    for (const internal of [
      "explanation",
      "market",
      "routeService",
      "dispatchDiagnosis",
      "transportDiagnosis",
      "stageDays",
      "dataOrigin",
      "context",
      "valueAtRisk",
      "aiSummary",
      "rawTimeline",
      "daysToDispatch",
    ]) {
      expect(keys).not.toContain(internal);
    }
  });

  it("descarta campos fora do contrato", () => {
    const parsed = orderSchema.parse({ ...unpaid, id_cliente: 123, segmento_cliente: "Consumer" });

    expect(parsed).not.toHaveProperty("id_cliente");
    expect(parsed).not.toHaveProperty("segmento_cliente");
  });

  it.each([
    [{ status: "Em Trânsito" }, "status"],
    [{ status: "Entregue" }, "status"],
    [{ orderDate: "2015-01-01T00:00:00.000Z" }, "orderDate"],
    [{ referenceDate: "06/02/2018" }, "referenceDate"],
    [{ transportMode: "Marítimo" }, "transportMode"],
    [{ routeType: "Nacional" }, "routeType"],
    [{ dispatch: { ...unpaid.dispatch, status: "Late" } }, "dispatch.status"],
    [{ dispatch: { ...unpaid.dispatch, delayDays: 1.5 } }, "dispatch.delayDays"],
    [{ delivery: { ...unpaid.delivery, probableCause: "" } }, "delivery.probableCause"],
    [{ currentStage: { number: 6, label: "Marte" } }, "currentStage.number"],
    [{ lostAtStage: { number: 3, label: "" } }, "lostAtStage.label"],
    [{ events: [] }, "events"],
    [{ items: [] }, "items"],
    [{ escalateToSupport: "sim" }, "escalateToSupport"],
  ])("recusa %j, apontando %s", (change, field) => {
    expect(failedFields({ ...unpaid, ...change })).toContain(field);
  });

  it("recusa evento com data com hora ou etapa fora de 0 a 5", () => {
    const [event] = unpaid.events;

    expect(
      failedFields({ ...unpaid, events: [{ ...event, date: "2015-01-01T02:00:00Z" }] }),
    ).toContain("events.0.date");
    expect(failedFields({ ...unpaid, events: [{ ...event, stage: -1 }] })).toContain(
      "events.0.stage",
    );
  });
});
