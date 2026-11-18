import type { ShippingMode } from "@translog/contracts";
import { describe, expect, it } from "vitest";
import { createFixturesRepository } from "./fixtures-repository.ts";
import { createOrderService, OrderNotFoundError } from "./order-service.ts";

const fixtures = await createFixturesRepository();
const service = createOrderService({
  // Cenário trocado pelo teste: só First Class tem prazo sugerido (3 dias).
  orders: { ...fixtures, scenario: () => new Map<ShippingMode, number>([["First Class", 3]]) },
  sampleOrderIds: [76902, 1, 375],
});

describe("createOrderService", () => {
  it("getOrder: visão do cliente, com o motivo em linguagem do cliente", async () => {
    const order = await service.getOrder(375);

    expect(order.dispatch.probableCause).toBe("houve demora na preparação do envio");
    expect(order).not.toHaveProperty("explanation");
    expect(order).not.toHaveProperty("market");
  });

  it("getStaffOrder: visão do colaborador, com causas da base e o cenário configurado", async () => {
    const order = await service.getStaffOrder(76902);

    expect(order.dispatch.probableCause).toBe("Promessa irreal");
    expect(order.market).toBe("Pacific Asia");
    expect(order.dispatchDiagnosis.suggestedDays).toBe(3);
    expect((await service.getStaffOrder(375)).dispatchDiagnosis.suggestedDays).toBeNull();
    expect(order.context.shippingMode.dispatchedOrders).toBe(3);
  });

  it("findOrder (chat): visão do cliente, ou null", async () => {
    expect((await service.findOrder(34))?.dispatch.probableCause).toBe(
      "o prazo de despacho prometido para esta modalidade costuma ser curto demais",
    );
    expect(await service.findOrder(1)).toBeNull();
  });

  it("pedido inexistente: OrderNotFoundError nas duas visões", async () => {
    await expect(service.getOrder(1)).rejects.toBeInstanceOf(OrderNotFoundError);
    await expect(service.getStaffOrder(1)).rejects.toBeInstanceOf(OrderNotFoundError);
  });

  it("pedidos de exemplo: só os que existem, na ordem configurada", async () => {
    expect(await service.sampleOrderIds()).toEqual([76902, 375]);
  });
});
