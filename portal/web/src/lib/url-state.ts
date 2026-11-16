import type { ChatOnSwitchMode } from "@/features/dev-bar/proto-bar.tsx";

export interface UrlInitialPresets {
  orderId: number | null;
  trackerPreset: string | null;
  chatPreset: "empty" | "conversation" | "typing" | "error" | null;
  chatOnSwitch: ChatOnSwitchMode | null;
  networkOnline: boolean | null;
  hideProtoBarCompletely: boolean;
}

/** Interpreta um código numérico de pedido positivo (até 10 dígitos). */
export function parseOrderId(value: string | null | undefined): number | null {
  if (!value || !/^\d{1,10}$/.test(value)) {
    return null;
  }
  const num = Number(value);
  return Number.isSafeInteger(num) && num > 0 ? num : null;
}

/** Lê parâmetros iniciais da URL (`?pedido=375` ou presets `?t=375&c=conversation&bar=off`). */
export function readUrlPresets(search: string): UrlInitialPresets {
  const params = new URLSearchParams(search);
  const pedidoParam = parseOrderId(params.get("pedido"));
  const tParam = params.get("t");
  const cParam = params.get("c");
  const sParam = params.get("s");
  const nParam = params.get("n");

  const tOrderId = parseOrderId(tParam);

  return {
    orderId: tOrderId ?? pedidoParam,
    trackerPreset: tParam && !tOrderId ? tParam : null,
    chatPreset:
      cParam === "empty" || cParam === "conversation" || cParam === "typing" || cParam === "error"
        ? cParam
        : null,
    chatOnSwitch: sParam === "keep" || sParam === "divider" || sParam === "clear" ? sParam : null,
    networkOnline: nParam === "on" ? true : nParam === "off" ? false : null,
    hideProtoBarCompletely: params.get("bar") === "off",
  };
}

/** Atualiza `?pedido=<id>` na query string preservando demais parâmetros. */
export function withOrderQueryParam(search: string, orderId: number | null): string {
  const params = new URLSearchParams(search);
  params.delete("t");
  if (orderId === null) {
    params.delete("pedido");
  } else {
    params.set("pedido", String(orderId));
  }
  const str = params.toString();
  return str ? `?${str}` : "";
}
