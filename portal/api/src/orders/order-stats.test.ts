import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { FIXTURES_FILE } from "./fixtures-repository.ts";
import { orderRecordSchema } from "./order-record.ts";
import { computeOrderStats, latePercent } from "./order-stats.ts";

const fixtures = z.array(orderRecordSchema).parse(JSON.parse(readFileSync(FIXTURES_FILE, "utf8")));

describe("computeOrderStats", () => {
  it("despachos por modalidade: só os despachados; atrasado = saiu depois do prometido", () => {
    const { dispatchByMode } = computeOrderStats(fixtures);

    // First: 76902, 34, 222 (todos atrasados). Second: 375, 31298 (atrasados). Standard: 8 (no
    // prazo) e 76385 (atrasado); 9 (não pago) e 50 (cancelado) não foram despachados.
    expect(Object.fromEntries(dispatchByMode)).toStrictEqual({
      "First Class": { total: 3, late: 3 },
      "Second Class": { total: 2, late: 2 },
      "Standard Class": { total: 2, late: 1 },
    });
  });

  it("entregas por rota: entregues e em trânsito; extraviado fica de fora", () => {
    const { deliveryByRoute } = computeOrderStats(fixtures);

    expect(Object.fromEntries(deliveryByRoute)).toStrictEqual({
      "Ásia-Pacífico - Sudeste Asiático - First Class": { total: 1, late: 1 },
      "América Latina - América Central - Second Class": { total: 1, late: 1 },
      "América Latina - América Central - First Class": { total: 1, late: 1 }, // 222 (34 extraviou)
      "América Latina - América do Sul - Standard Class": { total: 1, late: 0 },
      "EUA e Canadá - Sul dos EUA - Second Class": { total: 1, late: 0 },
      "Ásia-Pacífico - Oceania - Standard Class": { total: 1, late: 1 },
    });
  });
});

describe("latePercent", () => {
  it.each([
    [{ total: 36_866, late: 21_127 }, 57.3],
    [{ total: 3, late: 1 }, 33.3],
    [{ total: 2, late: 2 }, 100],
    [{ total: 0, late: 0 }, null],
    [undefined, null],
  ])("%j → %j", (count, percent) => {
    expect(latePercent(count)).toBe(percent);
  });
});
