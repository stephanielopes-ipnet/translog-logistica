import type { Order } from "@translog/contracts";

// Perguntas sugeridas quando a conversa está vazia. São só atalhos de digitação:
// quem responde é a API (`POST /api/chat`).

/** Sem pedido aberto: o primeiro atalho leva o assistente a pedir o número. */
export const CHAT_SUGGESTIONS = [
  "Quero acompanhar meu pedido",
  "Quais são as modalidades de envio?",
  "Como funciona a central de atendimento?",
] as const;

const MODES = "Quais são as modalidades de envio?";
/** Atalho para quem quer atendimento humano (o assistente explica horário e regra da central). */
export const SUPPORT_SUGGESTION = "Quero falar com a central";

/** Sugestões contextuais de acordo com o pedido aberto no momento. */
export function getChatSuggestions(order: Order | null): readonly string[] {
  if (!order) {
    return CHAT_SUGGESTIONS;
  }
  const id = order.orderId;
  const delivered = order.status === "Entregue no prazo" || order.status === "Entregue com atraso";
  const when = delivered ? `Quando o pedido #${id} foi entregue?` : `Quando o pedido #${id} chega?`;

  switch (order.status) {
    case "Cancelado":
    case "Não pago (expirado)":
      return [
        `Qual a situação do pedido #${id}?`,
        `Por que o pedido #${id} não foi enviado?`,
        MODES,
      ];
    case "Aguardando pagamento":
      return [when, `Por que o pedido #${id} ainda não foi despachado?`, MODES];
    case "Extraviado":
      return [
        `O que aconteceu com o pedido #${id}?`,
        `Por que o pedido #${id} atrasou?`,
        SUPPORT_SUGGESTION,
      ];
  }
  if (order.delivery.delayDays !== null && order.delivery.delayDays > 0) {
    return [`Por que o pedido #${id} atrasou?`, when, SUPPORT_SUGGESTION];
  }
  return [when, `Há algum atraso previsto no pedido #${id}?`, MODES];
}
