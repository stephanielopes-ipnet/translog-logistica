/** Interpreta um código numérico de pedido positivo (até 10 dígitos). */
export function parseOrderId(value: string | null | undefined): number | null {
  if (!value || !/^\d{1,10}$/.test(value)) {
    return null;
  }
  const num = Number(value);
  return Number.isSafeInteger(num) && num > 0 ? num : null;
}

/** Pedido aberto pela URL (`?pedido=375`), ou `null`. */
export function readOrderIdFromUrl(search: string): number | null {
  return parseOrderId(new URLSearchParams(search).get("pedido"));
}

/** Atualiza `?pedido=<id>` na query string preservando demais parâmetros. */
export function withOrderQueryParam(search: string, orderId: number | null): string {
  const params = new URLSearchParams(search);
  if (orderId === null) {
    params.delete("pedido");
  } else {
    params.set("pedido", String(orderId));
  }
  const str = params.toString();
  return str ? `?${str}` : "";
}
