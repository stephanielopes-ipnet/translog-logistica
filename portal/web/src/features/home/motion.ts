import type { Market } from "@translog/contracts";

// Lógica pura das animações do Início (contagem, fatias dos mercados, posição na jornada).

/** Desacelera no fim: rápido no começo, suave na chegada (0 → 1). */
export function easeOutCubic(progress: number): number {
  const p = Math.min(1, Math.max(0, progress));
  return 1 - (1 - p) ** 3;
}

/** Valor da contagem animada depois de `elapsedMs` (inteiro, chega exatamente ao alvo). */
export function countUpValue(target: number, elapsedMs: number, durationMs: number): number {
  if (durationMs <= 0 || elapsedMs >= durationMs) {
    return target;
  }
  return Math.round(target * easeOutCubic(elapsedMs / durationMs));
}

export interface MarketShare {
  market: Market;
  orders: number;
  /** % do total, com 1 casa decimal. */
  pct: number;
}

/** Parte de cada mercado no total (0% em todos se não houver pedidos). */
export function marketShares(
  markets: readonly { market: Market; orders: number }[],
): MarketShare[] {
  const total = markets.reduce((sum, item) => sum + item.orders, 0);
  return markets.map((item) => ({
    ...item,
    pct: total === 0 ? 0 : Math.round((1000 * item.orders) / total) / 10,
  }));
}

/** Posição (0 a 100%) do pacote na trilha da jornada, na etapa `step` de `count`. */
export function journeyOffset(step: number, count: number): number {
  if (count <= 1) {
    return 0;
  }
  const clamped = Math.min(count - 1, Math.max(0, step));
  return (100 * clamped) / (count - 1);
}

/**
 * Próximo passo de uma animação em ciclo: avança até o último, segura `hold` passos parado e
 * recomeça do zero (a jornada e a prévia do chat usam isto).
 */
export function nextCycleStep(step: number, last: number, hold: number): number {
  return step >= last + hold ? 0 : step + 1;
}
