import type { AttentionOrder } from "@translog/contracts";

// Lógica pura da Área do colaborador: filtro da fila de atenção e formatação dos números.

/** Filtros por etapa da tabela "Pedidos que precisam de atenção" (`null` = todos). */
export const STAGE_FILTERS: readonly { stage: number | null; label: string }[] = [
  { stage: null, label: "Todos" },
  { stage: 1, label: "Coleta" },
  { stage: 2, label: "Voo" },
  { stage: 3, label: "Alfândega" },
  { stage: 4, label: "Transferência" },
  { stage: 5, label: "Última milha" },
];

/** Pedidos da fila na etapa escolhida (`null` = todos), na ordem recebida (mais atrasados primeiro). */
export function filterByStage(
  orders: readonly AttentionOrder[],
  stage: number | null,
): AttentionOrder[] {
  return stage === null ? [...orders] : orders.filter((order) => order.stage?.number === stage);
}

/** `"San Jose, Califórnia, Estados Unidos"` + `"Jacarta, Jacarta, Indonésia"` → `"Estados Unidos → Jacarta, Indonésia"`. */
export function routeLabel(origin: string, destination: string): string {
  const from = origin.split(", ").at(-1) ?? origin;
  const parts = destination.split(", ");
  const to = parts.length > 1 ? `${parts[0]}, ${parts.at(-1)}` : destination;
  return `${from} → ${to}`;
}

const intFormatter = new Intl.NumberFormat("pt-BR");
const pctFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** `15739` → `"15.739"`. */
export function formatInt(value: number): string {
  return intFormatter.format(value);
}

/** `42.7` → `"42,7%"`; `null` → `"—"`. */
export function formatPercent(value: number | null): string {
  return value === null ? "—" : `${pctFormatter.format(value)}%`;
}

/** Dias com sinal para diagnóstico: `2` → `"+2 dias"`, `-1` → `"−1 dia"`, `0` → `"0 dia"`. */
export function formatSignedDays(value: number | null): string {
  if (value === null) {
    return "—";
  }
  const abs = Math.abs(value);
  const unit = abs === 1 || abs === 0 ? "dia" : "dias";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${abs} ${unit}`;
}
