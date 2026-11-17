import type { Order } from "@translog/contracts";

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

/**
 * Código de guia de remessa: `TL-000375`. Sem o mercado logístico interno (ex.: `LATAM`), que
 * saiu da visão do cliente.
 */
export function formatManifestCode(order: Pick<Order, "orderId">): string {
  return `TL-${String(order.orderId).padStart(6, "0")}`;
}
