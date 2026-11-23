/** Interpreta um código numérico de pedido positivo (até 10 dígitos). */
export function parseOrderId(value: string | null | undefined): number | null {
  if (!value || !/^\d{1,10}$/.test(value)) {
    return null;
  }
  const num = Number(value);
  return Number.isSafeInteger(num) && num > 0 ? num : null;
}
