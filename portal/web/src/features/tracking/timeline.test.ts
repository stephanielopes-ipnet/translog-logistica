import { describe, expect, it } from "vitest";
import { FIXTURE_ORDERS } from "@/api/fixtures.ts";
import { buildTimelineSteps, getDisplayTrackingStatus } from "./timeline.ts";

describe("timeline logic", () => {
  it("builds 4 steps for Em Trânsito (#375)", () => {
    const order375 = FIXTURE_ORDERS.find((o) => o.orderId === 375);
    expect(order375).toBeDefined();
    if (!order375) return;

    const steps = buildTimelineSteps(order375);
    expect(steps.map((s) => s.state)).toEqual(["done", "done", "current", "pending"]);
    expect(steps[0]?.subtitle).toBe("06/01/2015");
    expect(steps[2]?.subtitle).toBe("Etapa atual");
    expect(steps[3]?.subtitle).toBe("previsto 08/01/2015");
  });

  it("builds 4 steps for Entregue (#15)", () => {
    const order15 = FIXTURE_ORDERS.find((o) => o.orderId === 15);
    expect(order15).toBeDefined();
    if (!order15) return;

    const steps = buildTimelineSteps(order15);
    expect(steps.map((s) => s.state)).toEqual(["done", "done", "done", "done"]);
    expect(steps[3]?.subtitle).toBe("07/01/2015");
  });

  it("supports both waiting and payment release labels for #562", () => {
    const order562 = FIXTURE_ORDERS.find((o) => o.orderId === 562);
    expect(order562).toBeDefined();
    if (!order562) return;

    expect(getDisplayTrackingStatus(order562, "waiting")).toBe("Aguardando Liberação");
    expect(getDisplayTrackingStatus(order562, "payment")).toBe("Pagamento não processado");

    const stepsPayment = buildTimelineSteps(order562, "payment");
    expect(stepsPayment[1]?.label).toBe("Confirmação pendente");
    expect(stepsPayment[1]?.state).toBe("current");
  });

  it("returns only first step for Cancelado (#1002)", () => {
    const order1002 = FIXTURE_ORDERS.find((o) => o.orderId === 1002);
    expect(order1002).toBeDefined();
    if (!order1002) return;

    const steps = buildTimelineSteps(order1002);
    expect(steps).toHaveLength(1);
    expect(steps[0]?.key).toBe("placed");
  });
});
