import type { AttentionOrder } from "@translog/contracts";
import { describe, expect, it } from "vitest";
import {
  filterByStage,
  formatInt,
  formatPercent,
  formatSignedDays,
  routeLabel,
  STAGE_FILTERS,
} from "./tower-format.ts";

function order(orderId: number, stage: number | null): AttentionOrder {
  return {
    orderId,
    origin: "San Jose, Califórnia, Estados Unidos",
    destination: "Jacarta, Jacarta, Indonésia",
    market: "Pacific Asia",
    shippingMode: "First Class",
    stage: stage === null ? null : { number: stage, label: `Etapa ${stage}` },
    location: null,
    delayDays: 5,
    probableCause: null,
  };
}

describe("filtro por etapa", () => {
  const orders = [order(1, 3), order(2, 2), order(3, 3), order(4, null)];

  it("mostra todos com 'Todos' e só a etapa escolhida nos outros, mantendo a ordem", () => {
    expect(filterByStage(orders, null).map((o) => o.orderId)).toEqual([1, 2, 3, 4]);
    expect(filterByStage(orders, 3).map((o) => o.orderId)).toEqual([1, 3]);
    expect(filterByStage(orders, 5)).toEqual([]);
  });

  it("tem os 6 filtros da Torre", () => {
    expect(STAGE_FILTERS.map((filter) => filter.label)).toEqual([
      "Todos",
      "Coleta",
      "Voo",
      "Alfândega",
      "Transferência",
      "Última milha",
    ]);
  });
});

describe("formatação", () => {
  it("monta a rota com o país de origem e a cidade e o país de destino", () => {
    expect(routeLabel("San Jose, Califórnia, Estados Unidos", "Jacarta, Jacarta, Indonésia")).toBe(
      "Estados Unidos → Jacarta, Indonésia",
    );
    expect(routeLabel("Caguas, Porto Rico, Porto Rico", "Singapura")).toBe(
      "Porto Rico → Singapura",
    );
  });

  it("formata números e percentuais em pt-BR", () => {
    expect(formatInt(65752)).toBe("65.752");
    expect(formatPercent(42.7)).toBe("42,7%");
    expect(formatPercent(100)).toBe("100,0%");
    expect(formatPercent(null)).toBe("—");
  });

  it("formata dias com sinal", () => {
    expect(formatSignedDays(2)).toBe("+2 dias");
    expect(formatSignedDays(-1)).toBe("−1 dia");
    expect(formatSignedDays(0)).toBe("0 dia");
    expect(formatSignedDays(null)).toBe("—");
  });
});
