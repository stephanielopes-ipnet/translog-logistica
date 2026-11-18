import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ordersSummaryResponseSchema, towerResponseSchema } from "@translog/contracts";
import { describe, expect, it } from "vitest";
import { loadFileRepository } from "./file-repository.ts";
import { createFixturesRepository } from "./fixtures-repository.ts";
import type { OrderRepository } from "./order-repository.ts";
import { createOrderService } from "./order-service.ts";
import { NO_PROMISE_SCENARIO } from "./promise-scenario.ts";

function service(orders: OrderRepository, dashboardUrl: string | null = null) {
  return createOrderService({
    orders,
    sampleOrderIds: [],
    dashboardUrl,
  });
}

describe("Torre de controle (fixtures)", () => {
  it("calcula os indicadores dos 9 pedidos da demo", async () => {
    const tower = service(await createFixturesRepository()).getTower();

    expect(towerResponseSchema.strict().safeParse(tower).success).toBe(true);
    expect(tower).toMatchObject({
      referenceDate: "2018-02-06",
      totalOrders: 9,
      indicators: {
        dispatchOnTime: { onTime: 1, total: 7, pct: 14.3 },
        deliveryOnTime: { onTime: 2, total: 6, pct: 33.3 },
        inTransit: { total: 2, late: 2, lateForSupport: 2 },
        escalatedToSupport: 4,
        lost: 1,
      },
      inTransitByStage: [
        { stage: 2, label: "Voo", count: 1 },
        { stage: 3, label: "Alfândega", count: 1 },
      ],
      lostByStage: [{ stage: 3, label: "Alfândega", count: 1 }],
      dashboardUrl: null,
    });
  });

  it("ordena a fila de atenção pelo atraso de entrega, com o motivo nos termos da base", async () => {
    const { attention } = service(await createFixturesRepository()).getTower();

    expect(attention.map((order) => [order.orderId, order.delayDays])).toEqual([
      [76385, 6],
      [76902, 5],
    ]);
    expect(attention[1]).toMatchObject({
      shippingMode: "First Class",
      stage: { number: 3, label: "Alfândega" },
      location: "Alfândega Jacarta (Indonésia)",
      probableCause: "Volume sem atualização de rastreio",
    });
  });

  it("compara promessa e realidade com o prazo sugerido da Gold", async () => {
    const { promiseByMode } = service(await createFixturesRepository()).getTower();

    expect(promiseByMode.map((mode) => mode.shippingMode)).toEqual([
      "Standard Class",
      "Second Class",
      "First Class",
    ]);
    expect(promiseByMode[2]).toEqual({
      shippingMode: "First Class",
      promisedDays: 1,
      dispatchedOrders: 3,
      lateDispatchPct: 100,
      evaluatedDeliveries: 2,
      lateDeliveryPct: 100,
      suggestedDays: 2,
      lateDispatchPctWithSuggested: 0,
    });
  });

  it("sem cenário, não sugere prazo; com DASHBOARD_URL, devolve o link", async () => {
    const orders = await createFixturesRepository();
    const withoutScenario = createOrderService({
      orders: { ...orders, scenario: () => NO_PROMISE_SCENARIO },
      sampleOrderIds: [],
    }).getTower();

    expect(withoutScenario.promiseByMode.every((mode) => mode.suggestedDays === null)).toBe(true);
    expect(service(orders, "https://painel.exemplo/1").getTower().dashboardUrl).toBe(
      "https://painel.exemplo/1",
    );
  });

  it("resume os pedidos por mercado na ordem do mapa", async () => {
    const summary = service(await createFixturesRepository()).getSummary();

    expect(ordersSummaryResponseSchema.strict().parse(summary)).toEqual({
      totalOrders: 9,
      markets: [
        { market: "USCA", orders: 1 },
        { market: "LATAM", orders: 6 },
        { market: "Europe", orders: 0 },
        { market: "Pacific Asia", orders: 2 },
        { market: "Africa", orders: 0 },
      ],
    });
  });
});

const DATA_DIR = fileURLToPath(new URL("../../../dados/", import.meta.url));
const hasRealData = existsSync(`${DATA_DIR}consumo_pedidos.csv`);

describe.skipIf(!hasRealData)("Torre de controle (CSVs reais em portal/dados/)", () => {
  it("bate com os números conferidos na base", { timeout: 120_000 }, async () => {
    const log = { info() {}, warn() {}, error() {} };
    const tower = service(await loadFileRepository(DATA_DIR, log)).getTower();

    expect(tower.totalOrders).toBe(65_752);
    expect(tower.indicators).toEqual({
      dispatchOnTime: { onTime: 15_739, total: 36_866, pct: 42.7 },
      deliveryOnTime: { onTime: 22_130, total: 29_644, pct: 74.7 },
      inTransit: { total: 197, late: 43, lateForSupport: 23 },
      escalatedToSupport: 8_337,
      lost: 7_222,
    });
    expect(tower.attention).toHaveLength(197);
    expect(tower.lateRoutes.every((route) => route.evaluatedDeliveries >= 300)).toBe(true);
  });
});
