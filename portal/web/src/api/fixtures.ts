/** Pedidos de exemplo padrão (fallback se `/api/orders/samples` falhar), na ordem da demo. */
export const DEFAULT_SAMPLE_IDS = [76902, 375, 34, 8] as const;

/** Dica curta ao lado de cada atalho de exemplo. */
export const SAMPLE_HINTS: Record<number, string> = {
  76902: "Em trânsito · Roteiro",
  375: "Entregue c/ atraso",
  34: "Extraviado",
  8: "No prazo",
};
