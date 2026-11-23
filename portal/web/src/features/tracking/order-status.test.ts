import type { Order } from "@translog/contracts";
import { describe, expect, it } from "vitest";
import { findFixtureOrder } from "@/api/fixture-orders.ts";
import {
  deliveryDeadline,
  dispatchSentence,
  STATUS_TONE,
  statusHeadline,
  supportReason,
} from "./order-status.ts";

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

describe("dispatchSentence", () => {
  const dispatch = (actualDate: string | null, delayDays: number | null) =>
    ({ actualDate, delayDays }) as Order["dispatch"];

  it("diz como o envio saiu, em linguagem simples", () => {
    expect(dispatchSentence({ status: "Em trânsito", dispatch: dispatch("2018-01-29", 1) })).toBe(
      "O envio saiu com 1 dia de atraso.",
    );
    expect(
      dispatchSentence({ status: "Entregue com atraso", dispatch: dispatch("2015-01-12", 4) }),
    ).toBe("O envio saiu com 4 dias de atraso.");
    expect(
      dispatchSentence({ status: "Entregue no prazo", dispatch: dispatch("2015-01-01", 0) }),
    ).toBe("O envio saiu no prazo.");
    expect(
      dispatchSentence({ status: "Entregue no prazo", dispatch: dispatch("2015-01-01", -1) }),
    ).toBe("O envio saiu antes do previsto.");
  });

  it("explica por que o envio ainda não saiu", () => {
    expect(
      dispatchSentence({ status: "Aguardando pagamento", dispatch: dispatch(null, null) }),
    ).toBe("O envio sai depois da confirmação do pagamento.");
    expect(dispatchSentence({ status: "Cancelado", dispatch: dispatch(null, null) })).toBe(
      "O pedido foi cancelado antes do envio.",
    );
    expect(
      dispatchSentence({ status: "Não pago (expirado)", dispatch: dispatch(null, null) }),
    ).toBe("O pedido não foi enviado: o pagamento não foi confirmado.");
  });

  it("vale para os pedidos da demo", () => {
    const order = findFixtureOrder(76902);
    expect(order && dispatchSentence(order)).toBe("O envio saiu com 1 dia de atraso.");
  });
});
