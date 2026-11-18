/** Pedidos de exemplo padrão (fallback se `/api/orders/samples` falhar), na ordem da demo. */
export const DEFAULT_SAMPLE_IDS = [76902, 375, 34, 8] as const;

/**
 * Dica curta ao lado de cada atalho de exemplo (`SAMPLE_ORDER_IDS`). Cobre os 9 pedidos da
 * demo, para qualquer combinação configurada ter dica.
 */
export const SAMPLE_HINTS: Record<number, string> = {
  76902: "Em trânsito · Roteiro",
  375: "Entregue c/ atraso",
  34: "Extraviado",
  222: "Prazo curto (First)",
  8: "No prazo",
  9: "Não pago",
  50: "Cancelado",
  31298: "Doméstica",
  76385: "Em voo",
};
