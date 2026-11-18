import type { Market } from "@translog/contracts";

// Nome de cada mercado no Início (em português, para o cliente) e contagem formatada.

export const MARKET_LABEL: Record<Market, string> = {
  USCA: "América do Norte",
  LATAM: "América Latina",
  Europe: "Europa",
  "Pacific Asia": "Ásia-Pacífico",
  Africa: "África",
};

const countFormatter = new Intl.NumberFormat("pt-BR");

/** `17577` → `"17.577 pedidos"`; `1` → `"1 pedido"`. */
export function formatOrderCount(count: number): string {
  return `${countFormatter.format(count)} ${count === 1 ? "pedido" : "pedidos"}`;
}
