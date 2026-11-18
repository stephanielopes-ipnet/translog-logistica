import { describe, expect, it } from "vitest";
import { formatOrderCount, MARKET_LABEL } from "./markets.ts";

describe("mercados do Início", () => {
  it("formata a contagem de pedidos em pt-BR", () => {
    expect(formatOrderCount(17577)).toBe("17.577 pedidos");
    expect(formatOrderCount(1)).toBe("1 pedido");
    expect(formatOrderCount(0)).toBe("0 pedidos");
  });

  it("dá nome em português aos 5 mercados", () => {
    expect(Object.keys(MARKET_LABEL)).toHaveLength(5);
    expect(MARKET_LABEL["Pacific Asia"]).toBe("Ásia-Pacífico");
  });
});
