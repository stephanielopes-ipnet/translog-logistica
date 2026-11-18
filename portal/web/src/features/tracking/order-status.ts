import type { Order } from "@translog/contracts";
import { formatDate, pluralize } from "@/lib/format.ts";

// Regras de exibição da situação do pedido (badge, mensagem principal, prazo e central).
// Só leem o `Order` da API: a regra de encaminhamento (`escalateToSupport`) vem pronta.

export type StatusTone = "success" | "transit" | "danger" | "waiting" | "neutral";

export const STATUS_TONE: Record<Order["status"], StatusTone> = {
  "Entregue no prazo": "success",
  "Entregue com atraso": "success",
  "Em trânsito": "transit",
  Extraviado: "danger",
  "Aguardando pagamento": "waiting",
  "Não pago (expirado)": "neutral",
  Cancelado: "neutral",
};

/** Horário da central de atendimento (FAQ da Stephanie, reunião de 16/11). */
export const SUPPORT_HOURS = "segunda a sexta, das 9h às 18h";

export type DeadlineStatus = "Atrasado" | "No Prazo" | "Adiantado";

export function isDelivered(order: Pick<Order, "status">): boolean {
  return order.status === "Entregue no prazo" || order.status === "Entregue com atraso";
}

/** Pedido que terminou antes do despacho (não haverá viagem). */
export function endedBeforeDispatch(order: Pick<Order, "status">): boolean {
  return order.status === "Cancelado" || order.status === "Não pago (expirado)";
}

/** Situação do prazo de entrega pelo atraso; `null` quando ainda não dá para avaliar. */
export function deliveryDeadline(order: Pick<Order, "delivery">): DeadlineStatus | null {
  const delay = order.delivery.delayDays;
  if (delay === null) return null;
  if (delay > 0) return "Atrasado";
  return delay < 0 ? "Adiantado" : "No Prazo";
}

/** Atraso na entrega, em dias, só quando positivo. */
export function deliveryDelay(order: Pick<Order, "delivery">): number | null {
  const delay = order.delivery.delayDays;
  return delay !== null && delay > 0 ? delay : null;
}

const days = (count: number) => pluralize(count, "dia", "dias");

/** Mensagem principal do pedido: o que aconteceu, numa frase, e um detalhe. */
export function statusHeadline(order: Order): { title: string; detail: string } {
  const { delivery } = order;
  const delay = delivery.delayDays;
  switch (order.status) {
    case "Entregue no prazo":
      return {
        title: `Entregue em ${formatDate(delivery.actualDate)}`,
        detail:
          delay !== null && delay < 0
            ? `${days(-delay)} antes do previsto (${formatDate(delivery.expectedDate)}).`
            : "Dentro do prazo previsto.",
      };
    case "Entregue com atraso":
      return {
        title: `Entregue em ${formatDate(delivery.actualDate)}`,
        detail: `${days(delay ?? 0)} depois do previsto (${formatDate(delivery.expectedDate)}).`,
      };
    case "Em trânsito":
      return {
        title:
          delay !== null && delay > 0
            ? `Em trânsito, com ${days(delay)} de atraso`
            : "Em trânsito, dentro do prazo",
        detail: `Entrega prevista para ${formatDate(delivery.expectedDate)}.`,
      };
    case "Extraviado":
      return {
        title: order.lostAtStage
          ? `Volume extraviado na etapa ${order.lostAtStage.label}`
          : "Volume extraviado",
        detail: `Último registro em ${formatDate(order.events.at(-1)?.date)}.`,
      };
    case "Aguardando pagamento":
      return {
        title: "Aguardando pagamento",
        detail: `O prazo de despacho de ${days(order.dispatch.promisedDays)} começa a contar depois da confirmação.`,
      };
    case "Não pago (expirado)":
      return {
        title: "Pagamento não confirmado",
        detail: "O pedido expirou sem ser despachado.",
      };
    case "Cancelado":
      return { title: "Pedido cancelado", detail: "Ele não será despachado nem entregue." };
  }
}

/** Por que o pedido vai para a central (quando `escalateToSupport`). */
export function supportReason(order: Order): string | null {
  if (!order.escalateToSupport) return null;
  if (order.status === "Extraviado") return "o volume foi extraviado";
  const delay = deliveryDelay(order);
  return delay === null
    ? "o pedido precisa de atendimento"
    : `a entrega está ${days(delay)} atrasada`;
}

/**
 * Envio em linguagem simples para o cliente (sem o prazo de despacho em números): "o envio
 * saiu com 1 dia de atraso", "no prazo", "antes do previsto", ou por que ainda não saiu.
 */
export function dispatchSentence(order: Pick<Order, "status" | "dispatch">): string {
  const { dispatch } = order;
  if (dispatch.actualDate === null) {
    switch (order.status) {
      case "Aguardando pagamento":
        return "O envio sai depois da confirmação do pagamento.";
      case "Cancelado":
        return "O pedido foi cancelado antes do envio.";
      case "Não pago (expirado)":
        return "O pedido não foi enviado: o pagamento não foi confirmado.";
      default:
        return "O envio ainda não saiu.";
    }
  }
  const delay = dispatch.delayDays ?? 0;
  if (delay > 0) {
    return `O envio saiu com ${days(delay)} de atraso.`;
  }
  return delay < 0 ? "O envio saiu antes do previsto." : "O envio saiu no prazo.";
}
