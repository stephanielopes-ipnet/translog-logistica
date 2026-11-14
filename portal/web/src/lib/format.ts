import type { Order, ShippingMode } from "@translog/contracts";

/**
 * Formatação para a tela em pt-BR.
 * Datas de calendário (`AAAA-MM-DD`) nunca passam por `new Date(string)` para evitar
 * deslocamento de fuso horário (UTC -> UTC-3 mudaria o dia).
 */

const usdFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "USD",
});

/** `"2015-01-06"` -> `"06/01/2015"`. Retorna `"—"` se vazio ou nulo. */
export function formatDate(date: string | null | undefined): string {
  if (!date) {
    return "—";
  }
  const [year, month, day] = date.slice(0, 10).split("-");
  if (!year || !month || !day) {
    return date;
  }
  return `${day}/${month}/${year}`;
}

/** `91.34` -> `"US$ 91,34"`. */
export function formatCurrency(value: number): string {
  return usdFormatter.format(value);
}

/** Pluralização simples: `(1, "dia", "dias")` -> `"1 dia"`. */
export function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** Mantém apenas dígitos até `maxLength` caracteres (padrão: 10). */
export function onlyDigits(raw: string, maxLength = 10): string {
  return raw.replace(/\D/g, "").slice(0, maxLength);
}

/** Separa `"San Benito, Texas, Estados Unidos"` em `{ city: "San Benito", rest: "Texas, Estados Unidos" }`. */
export function splitPlace(place: string): { city: string; rest: string } {
  const parts = place.split(", ");
  return {
    city: parts[0] ?? place,
    rest: parts.slice(1).join(", "),
  };
}

/** Código técnico de guia de remessa: `TL-000375-LATAM`. */
export function formatManifestCode(order: Pick<Order, "orderId" | "market">): string {
  const paddedId = String(order.orderId).padStart(6, "0");
  const marketCode = order.market.replace(/\s+/g, "").toUpperCase();
  return `TL-${paddedId}-${marketCode}`;
}

/** Prazo estimado por modalidade de envio (coerente com a base: 4, 2, 1 e 0 dias). */
export const SHIPPING_MODE_SLA: Record<ShippingMode, string> = {
  "Standard Class": "Prazo estimado: 4 dias",
  "Second Class": "Prazo estimado: 2 dias",
  "First Class": "Prazo estimado: 1 dia",
  "Same Day": "Despacho no mesmo dia",
};

/** Rótulo resumido de atraso/adiantamento. */
export function formatDelayLabel(delayDays: number | null): string | null {
  if (delayDays === null) {
    return null;
  }
  if (delayDays > 0) {
    return `${pluralize(delayDays, "dia", "dias")} de atraso`;
  }
  if (delayDays < 0) {
    return `${pluralize(-delayDays, "dia", "dias")} adiantado`;
  }
  return "dentro do prazo";
}
