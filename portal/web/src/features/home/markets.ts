import type { Market } from "@translog/contracts";

// Nome de cada mercado no Início (em português, para o cliente) e números arredondados: o Início
// não mostra a quantidade exata de pedidos, só a ordem de grandeza e a parte de cada mercado.

export const MARKET_LABEL: Record<Market, string> = {
  USCA: "América do Norte",
  LATAM: "América Latina",
  Europe: "Europa",
  "Pacific Asia": "Ásia-Pacífico",
  Africa: "África",
};

const countFormatter = new Intl.NumberFormat("pt-BR");
const pctFormatter = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

/**
 * Total arredondado para baixo, em milhares, para o Início (`65752` → `65000`, mostrado como
 * "65.000+"). Abaixo de 1.000 (só nos pedidos de exemplo) fica o número exato, sem o "+".
 */
export function roundedOrderTotal(total: number): { value: number; plus: boolean } {
  return total >= 1000
    ? { value: Math.floor(total / 1000) * 1000, plus: true }
    : { value: total, plus: false };
}

/** `65000, true` → `"65.000+"`. */
export function formatRoundedTotal(value: number, plus: boolean): string {
  return `${countFormatter.format(value)}${plus ? "+" : ""}`;
}

/** `28.2` → `"28,2%"`; `13` → `"13%"`. */
export function formatShare(pct: number): string {
  return `${pctFormatter.format(pct)}%`;
}
