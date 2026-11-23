import { describe, expect, it } from "vitest";
import { formatRoundedTotal, formatShare, MARKET_LABEL, roundedOrderTotal } from "./markets.ts";

describe("mercados do Início", () => {
  it("arredonda o total para baixo, em milhares, sem mostrar o número exato", () => {
    expect(roundedOrderTotal(65752)).toEqual({ value: 65000, plus: true });
    expect(roundedOrderTotal(1000)).toEqual({ value: 1000, plus: true });
    expect(roundedOrderTotal(9)).toEqual({ value: 9, plus: false });
    expect(formatRoundedTotal(65000, true)).toBe("65.000+");
    expect(formatRoundedTotal(9, false)).toBe("9");
  });

  it("formata a parte de cada mercado em pt-BR", () => {
    expect(formatShare(28.2)).toBe("28,2%");
    expect(formatShare(13)).toBe("13%");
  });

  it("dá nome em português aos 5 mercados", () => {
    expect(Object.keys(MARKET_LABEL)).toHaveLength(5);
    expect(MARKET_LABEL["Pacific Asia"]).toBe("Ásia-Pacífico");
  });
});
