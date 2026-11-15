import type { Order } from "@translog/contracts";

// Perguntas sugeridas quando a conversa está vazia. São só atalhos de digitação:
// quem responde é a API (`POST /api/chat`).

export const CHAT_SUGGESTIONS = [
  "Onde está o pedido 375?",
  "Por que o pedido 375 atrasou?",
  "Quais são as modalidades de envio?",
] as const;

/** Sugestões contextuais de acordo com o pedido aberto no momento. */
export function getChatSuggestions(order: Order | null): readonly string[] {
  if (!order) {
    return CHAT_SUGGESTIONS;
  }
  const id = order.orderId;
  if (order.trackingStatus === "Cancelado") {
    return [
      `Qual a situação do pedido #${id}?`,
      `Por que o pedido #${id} não foi enviado?`,
      "Quais são as modalidades de envio?",
    ];
  }
  if (order.trackingStatus === "Aguardando Liberação") {
    return [
      `Quando o pedido #${id} chega?`,
      `Por que o pedido #${id} ainda não foi liberado?`,
      "Quais são as modalidades de envio?",
    ];
  }
  if (order.deadlineStatus === "Atrasado") {
    return [
      `Por que o pedido #${id} atrasou?`,
      order.trackingStatus === "Entregue"
        ? `Quando o pedido #${id} foi entregue?`
        : `Quando o pedido #${id} chega?`,
      "Quais são as modalidades de envio?",
    ];
  }
  return [
    order.trackingStatus === "Entregue"
      ? `Quando o pedido #${id} foi entregue?`
      : `Quando o pedido #${id} chega?`,
    `Há algum atraso previsto no pedido #${id}?`,
    "Quais são as modalidades de envio?",
  ];
}
