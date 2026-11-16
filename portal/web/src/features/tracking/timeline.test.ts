import { describe, expect, it } from "vitest";
import { findFixtureOrder } from "@/api/fixture-orders.ts";
import { buildTimelineSteps, getDisplayTrackingStatus } from "./timeline.ts";

function fixture(orderId: number) {
  const order = findFixtureOrder(orderId);
  if (!order) throw new Error(`Pedido ${orderId} fora dos fixtures`);
  return order;
}

describe("timeline logic", () => {
  it("builds 4 steps for Em trânsito (#76902)", () => {
    const steps = buildTimelineSteps(fixture(76902));

    expect(steps.map((s) => s.state)).toEqual(["done", "done", "current", "pending"]);
    expect(steps[0]?.subtitle).toBe("27/01/2018");
    expect(steps[1]?.subtitle).toBe("29/01/2018");
    expect(steps[2]?.subtitle).toBe("Etapa atual");
    expect(steps[3]?.subtitle).toBe("previsto 01/02/2018");
  });

  it("builds 4 done steps for Entregue com atraso (#375)", () => {
    const steps = buildTimelineSteps(fixture(375));

    expect(steps.map((s) => s.state)).toEqual(["done", "done", "done", "done"]);
    expect(steps[3]?.subtitle).toBe("17/01/2015");
  });

  it("marks the lost step for Extraviado (#34)", () => {
    const steps = buildTimelineSteps(fixture(34));

    expect(steps[2]).toMatchObject({ label: "Extraviado", state: "current" });
  });

  it.each([9, 50])(
    "returns only the first step for terminal orders before dispatch (#%i)",
    (id) => {
      const steps = buildTimelineSteps(fixture(id));

      expect(steps).toHaveLength(1);
      expect(steps[0]?.key).toBe("placed");
    },
  );

  it("relabels 'Aguardando pagamento' only with the payment variant", () => {
    const order = { ...fixture(9), status: "Aguardando pagamento" as const };

    expect(getDisplayTrackingStatus(order, "waiting")).toBe("Aguardando pagamento");
    expect(getDisplayTrackingStatus(order, "payment")).toBe("Pagamento não processado");
    expect(getDisplayTrackingStatus(fixture(76902), "payment")).toBe("Em trânsito");
  });
});
