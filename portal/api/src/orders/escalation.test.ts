import { describe, expect, it } from "vitest";
import { SUPPORT_MIN_DELAY_DAYS, shouldEscalateToSupport } from "./escalation.ts";

describe("shouldEscalateToSupport", () => {
  it("o limite combinado em 16/11 é 3 dias (>= 3)", () => {
    expect(SUPPORT_MIN_DELAY_DAYS).toBe(3);
  });

  it.each([
    ["Entregue com atraso", 4, true],
    ["Entregue com atraso", 3, true],
    ["Entregue com atraso", 2, false],
    ["Entregue com atraso", 1, false],
    ["Em trânsito", 5, true],
    ["Em trânsito", 0, false],
    ["Entregue no prazo", 0, false],
    ["Entregue no prazo", -2, false],
    ["Extraviado", null, true],
    ["Não pago (expirado)", null, false],
    ["Aguardando pagamento", null, false],
    ["Cancelado", null, false],
  ] as const)("%s com atraso de entrega %j → %j", (status, delayDays, expected) => {
    expect(shouldEscalateToSupport({ status, delivery: { delayDays } })).toBe(expected);
  });
});
