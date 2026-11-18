import { describe, expect, it } from "vitest";
import {
  countUpValue,
  easeOutCubic,
  journeyOffset,
  marketShares,
  nextCycleStep,
} from "./motion.ts";

describe("animações do Início", () => {
  it("a contagem começa em 0, desacelera e termina exatamente no alvo", () => {
    expect(countUpValue(65752, 0, 1400)).toBe(0);
    expect(countUpValue(65752, 700, 1400)).toBeGreaterThan(65752 / 2);
    expect(countUpValue(65752, 1400, 1400)).toBe(65752);
    expect(countUpValue(65752, 9999, 1400)).toBe(65752);
    expect(countUpValue(5, 100, 0)).toBe(5);
    expect(easeOutCubic(-1)).toBe(0);
    expect(easeOutCubic(2)).toBe(1);
  });

  it("calcula a parte de cada mercado", () => {
    const shares = marketShares([
      { market: "USCA", orders: 8579 },
      { market: "LATAM", orders: 17181 },
      { market: "Europe", orders: 18561 },
      { market: "Pacific Asia", orders: 17577 },
      { market: "Africa", orders: 3854 },
    ]);
    expect(shares.map((share) => share.pct)).toEqual([13, 26.1, 28.2, 26.7, 5.9]);
    expect(marketShares([{ market: "USCA", orders: 0 }])[0]?.pct).toBe(0);
  });

  it("posiciona o pacote na trilha das etapas", () => {
    expect(journeyOffset(0, 6)).toBe(0);
    expect(journeyOffset(3, 6)).toBe(60);
    expect(journeyOffset(5, 6)).toBe(100);
    expect(journeyOffset(9, 6)).toBe(100);
    expect(journeyOffset(0, 1)).toBe(0);
  });

  it("avança, segura no fim e recomeça", () => {
    expect(nextCycleStep(0, 5, 2)).toBe(1);
    expect(nextCycleStep(5, 5, 2)).toBe(6);
    expect(nextCycleStep(7, 5, 2)).toBe(0);
  });
});
