import type { Order } from "@translog/contracts";
import { describe, expect, it } from "vitest";
import { findFixtureOrder } from "@/api/fixture-orders.ts";
import { deliveryDeadline, STATUS_TONE, statusHeadline, supportReason } from "./order-status.ts";

function fixture(orderId: number): Order {
  const order = findFixtureOrder(orderId);
  if (!order) throw new Error(`Pedido ${orderId} fora dos fixtures`);
  return order;
}

describe("statusHeadline", () => {
  it.each([
    [76902, "Em trânsito, com 5 dias de atraso", "Entrega prevista para 01/02/2018."],
    [375, "Entregue em 17/01/2015", "4 dias depois do previsto (13/01/2015)."],
    [34, "Volume extraviado na etapa Alfândega", "Último registro em 11/01/2015."],
    [222, "Entregue em 09/01/2015", "1 dia depois do previsto (08/01/2015)."],
    [8, "Entregue em 10/01/2015", "Dentro do prazo previsto."],
    [9, "Pagamento não confirmado", "O pedido expirou sem ser despachado."],
    [50, "Pedido cancelado", "Ele não será despachado nem entregue."],
  ])("pedido %i: %s", (orderId, title, detail) => {
    expect(statusHeadline(fixture(orderId))).toEqual({ title, detail });
  });

  it("cobre as 7 situações, inclusive as que não estão nos fixtures", () => {
    const base = fixture(9);
    const waiting = statusHeadline({ ...base, status: "Aguardando pagamento" });
    const early = statusHeadline({
      ...fixture(8),
      delivery: { ...fixture(8).delivery, delayDays: -2 },
    });
    const onTime = statusHeadline({
      ...fixture(76902),
      delivery: { ...fixture(76902).delivery, delayDays: 0 },
    });

    expect(waiting).toEqual({
      title: "Aguardando pagamento",
      detail: "O prazo de despacho de 4 dias começa a contar depois da confirmação.",
    });
    expect(early.detail).toBe("2 dias antes do previsto (10/01/2015).");
    expect(onTime.title).toBe("Em trânsito, dentro do prazo");
    expect(Object.keys(STATUS_TONE)).toHaveLength(7);
  });
});

describe("prazo e central", () => {
  it.each([
    [76902, "Atrasado"],
    [8, "No Prazo"],
    [34, null],
    [9, null],
  ] as const)("pedido %i: prazo de entrega %s", (orderId, deadline) => {
    expect(deliveryDeadline(fixture(orderId))).toBe(deadline);
  });

  it.each([
    [76902, "a entrega está 5 dias atrasada"],
    [375, "a entrega está 4 dias atrasada"],
    [34, "o volume foi extraviado"],
    [222, null],
    [8, null],
  ] as const)("pedido %i: motivo da central %j", (orderId, reason) => {
    expect(supportReason(fixture(orderId))).toBe(reason);
  });
});
