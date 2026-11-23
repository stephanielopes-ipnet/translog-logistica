import type { Order } from "@translog/contracts";
import { describe, expect, it } from "vitest";
import { findFixtureOrder } from "@/api/fixture-orders.ts";
import { buildStageTimeline, plannedStages } from "./stage-timeline.ts";

function fixture(orderId: number): Order {
  const order = findFixtureOrder(orderId);
  if (!order) throw new Error(`Pedido ${orderId} fora dos fixtures`);
  return order;
}

/** "Rótulo:estado:eventos" de cada etapa, para comparar de uma vez. */
function summary(orderId: number): string[] {
  return buildStageTimeline(fixture(orderId)).map(
    (stage) => `${stage.label}:${stage.state}:${stage.events.length}`,
  );
}

describe("buildStageTimeline", () => {
  it("76902: parado na alfândega com atraso; transferência e última milha pendentes", () => {
    expect(summary(76902)).toEqual([
      "Pedido:done:1",
      "Coleta:done:2",
      "Voo:done:1",
      "Alfândega:delayed:1",
      "Transferência:pending:0",
      "Última milha:pending:0",
    ]);
  });

  it("76385: em voo, com atraso", () => {
    expect(summary(76385)).toEqual([
      "Pedido:done:1",
      "Coleta:done:2",
      "Voo:delayed:1",
      "Alfândega:pending:0",
      "Transferência:pending:0",
      "Última milha:pending:0",
    ]);
  });

  it("375: entregue, todas as etapas concluídas, eventos em ordem", () => {
    expect(summary(375)).toEqual([
      "Pedido:done:1",
      "Coleta:done:2",
      "Voo:done:1",
      "Alfândega:done:2",
      "Transferência:done:1",
      "Última milha:done:2",
    ]);
    const lastMile = buildStageTimeline(fixture(375)).at(-1);
    expect(lastMile?.events.map((event) => event.date)).toEqual(["2015-01-16", "2015-01-17"]);
  });

  it("34: extravio marcado na alfândega; o resto não será alcançado", () => {
    expect(summary(34)).toEqual([
      "Pedido:done:1",
      "Coleta:done:2",
      "Voo:done:1",
      "Alfândega:lost:2",
      "Transferência:not_reached:0",
      "Última milha:not_reached:0",
    ]);
  });

  it("31298: rota doméstica rodoviária, sem voo nem alfândega", () => {
    expect(summary(31298).map((stage) => stage.split(":")[0])).toEqual([
      "Pedido",
      "Coleta",
      "Transferência",
      "Última milha",
    ]);
  });

  it("8: Porto Rico → Brasil tem voo e alfândega", () => {
    expect(plannedStages(fixture(8))).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it.each([9, 50])("pedido %i (sem despacho): só o registro do pedido", (orderId) => {
    expect(summary(orderId)).toEqual(["Pedido:done:1"]);
  });

  it("rota doméstica aérea (Porto Rico → EUA) tem voo, mas não alfândega", () => {
    const order: Order = { ...fixture(31298), transportMode: "Aéreo consolidado" };

    expect(plannedStages(order)).toEqual([0, 1, 2, 4, 5]);
  });

  it("aguardando pagamento: registro concluído e as etapas da rota pendentes", () => {
    const order: Order = { ...fixture(9), status: "Aguardando pagamento" };

    expect(buildStageTimeline(order).map((stage) => stage.state)).toEqual([
      "done",
      "pending",
      "pending",
      "pending",
      "pending",
      "pending",
    ]);
  });
});
