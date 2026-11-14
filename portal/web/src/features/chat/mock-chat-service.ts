import type { Order } from "@translog/contracts";
import { findFixtureOrder } from "@/api/fixtures.ts";
import type { ReleaseLabelMode } from "@/features/tracking/timeline.ts";
import { formatDate, pluralize } from "@/lib/format.ts";

export const CHAT_SUGGESTIONS = [
  "Quando meu pedido chega?",
  "Por que meu pedido atrasou?",
  "Quais são as modalidades de envio?",
] as const;

export const MODES_REPLY =
  "Trabalhamos com quatro modalidades internacionais:\n" +
  "• **Standard Class**: opção econômica, com prazo estimado de 4 dias.\n" +
  "• **Second Class**: intermediária, com prazo estimado de 2 dias.\n" +
  "• **First Class**: prioritária, com prazo estimado de 1 dia.\n" +
  "• **Same Day**: despacho no mesmo dia do pedido.";

export const ASK_NUMBER_REPLY =
  "Para consultar, informe o número do pedido no campo ao lado ou aqui na conversa (ex.: 375).";

export const FALLBACK_REPLY =
  "Posso informar a situação, o prazo de entrega e o motivo provável de atraso de um pedido, ou explicar as modalidades de envio.";

// Explicações de exemplo sem afirmar certeza ("provavelmente")
const CAUSE_DETAIL: Record<number, string> = {
  375: "o prazo de 2 dias da modalidade Second Class provavelmente foi curto para a rota internacional Texas → Saltillo (México).",
  225: "o prazo de 1 dia da modalidade First Class provavelmente foi curto para a rota internacional Nova York → Toluca (México).",
  41906:
    "o envio no mesmo dia (Same Day) provavelmente tinha prazo curto demais para o trajeto Califórnia → Sudão.",
};

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function buildWhenReply(order: Order, releaseLabel: ReleaseLabelMode = "waiting"): string {
  const id = order.orderId;
  const d = order.delayDays;

  switch (order.trackingStatus) {
    case "Em Trânsito":
      return d !== null && d > 0
        ? `O pedido **#${id}** está **Em Trânsito**. A entrega estava prevista para **${formatDate(order.estimatedDeliveryDate)}** e acumula **${pluralize(d, "dia", "dias")} de atraso**.`
        : `O pedido **#${id}** está **Em Trânsito**, dentro do prazo, com entrega prevista para **${formatDate(order.estimatedDeliveryDate)}**.`;
    case "Entregue":
      if (d !== null && d > 0) {
        return `O pedido **#${id}** foi **Entregue** em **${formatDate(order.actualDeliveryDate)}**, ${pluralize(d, "dia", "dias")} após a data prevista (${formatDate(order.estimatedDeliveryDate)}).`;
      }
      if (d !== null && d < 0) {
        return `O pedido **#${id}** foi **Entregue** em **${formatDate(order.actualDeliveryDate)}**, ${pluralize(-d, "dia", "dias")} antes da data prevista.`;
      }
      return `O pedido **#${id}** foi **Entregue** em **${formatDate(order.actualDeliveryDate)}**, dentro do prazo previsto.`;
    case "Aguardando Liberação":
      return releaseLabel === "payment"
        ? `O pedido **#${id}** está com **Pagamento não processado**. Após a confirmação e liberação, a entrega está prevista para **${formatDate(order.estimatedDeliveryDate)}**.`
        : `O pedido **#${id}** está **Aguardando Liberação**. Depois de liberado, a entrega está prevista para **${formatDate(order.estimatedDeliveryDate)}**.`;
    case "Cancelado":
      return `O pedido **#${id}** foi **Cancelado** e não será enviado.`;
  }
}

export function buildWhyReply(order: Order, releaseLabel: ReleaseLabelMode = "waiting"): string {
  const id = order.orderId;

  if (order.probableCause) {
    const detail = CAUSE_DETAIL[id];
    return detail
      ? `O motivo provável do atraso do pedido **#${id}** é **${order.probableCause}**: ${detail}`
      : `O motivo provável do atraso do pedido **#${id}** é **${order.probableCause}**.`;
  }

  if (order.trackingStatus === "Cancelado") {
    return `O pedido **#${id}** foi **Cancelado**, portanto não há atraso de transporte a analisar.`;
  }

  if (order.trackingStatus === "Aguardando Liberação") {
    return releaseLabel === "payment"
      ? `O pedido **#${id}** ainda não saiu para transporte porque consta como **Pagamento não processado**. A previsão após liberação é **${formatDate(order.estimatedDeliveryDate)}**.`
      : `O pedido **#${id}** não está atrasado no transporte. Ele está **Aguardando Liberação** com previsão para **${formatDate(order.estimatedDeliveryDate)}**.`;
  }

  if (order.delayDays !== null && order.delayDays > 0) {
    const verb = order.trackingStatus === "Entregue" ? "foi entregue" : "está";
    return `O pedido **#${id}** ${verb} com **${pluralize(order.delayDays, "dia", "dias")} de atraso**, mas não há um motivo provável específico registrado na base para esta remessa.`;
  }

  return `O pedido **#${id}** não apresenta atraso. ${buildWhenReply(order, releaseLabel)}`;
}

export interface AssistantReplyResult {
  reply: string;
  detectedOrderId: number | null;
}

/**
 * Processa a pergunta do usuário e retorna a resposta do assistente junto com um
 * eventual `detectedOrderId` caso o usuário tenha citado um pedido na mensagem.
 */
export function buildAssistantReply(params: {
  message: string;
  currentOrder: Order | null;
  releaseLabel?: ReleaseLabelMode;
  resolveOrder?: (orderId: number) => Order | null;
}): AssistantReplyResult {
  const {
    message,
    currentOrder,
    releaseLabel = "waiting",
    resolveOrder = findFixtureOrder,
  } = params;

  const normalized = normalizeText(message);
  let targetOrder = currentOrder;
  let detectedOrderId: number | null = null;

  const numberMatch = normalized.match(/\d+/);
  let mentionedOrder = false;

  if (numberMatch) {
    const candidateId = Number(numberMatch[0]);
    const found = resolveOrder(candidateId);
    if (found) {
      mentionedOrder = true;
      detectedOrderId = found.orderId;
      targetOrder = found;
    } else if (/pedido/.test(normalized) || /^\s*\d+\s*$/.test(normalized)) {
      return {
        reply: `Não encontrei o pedido **#${numberMatch[0]}**. Confira o número e tente novamente.`,
        detectedOrderId: null,
      };
    }
  }

  if (/modalidade|tipos de envio|formas de envio|classe/.test(normalized)) {
    return { reply: MODES_REPLY, detectedOrderId };
  }

  const asksWhy = /atras|por que|porque|motivo|demor|causa/.test(normalized);
  const asksWhen = /quando|chega|prazo|previs|entreg|situac|status|onde/.test(normalized);

  if (asksWhy || asksWhen || mentionedOrder || /pedido/.test(normalized)) {
    if (!targetOrder) {
      return { reply: ASK_NUMBER_REPLY, detectedOrderId: null };
    }
    return {
      reply: asksWhy
        ? buildWhyReply(targetOrder, releaseLabel)
        : buildWhenReply(targetOrder, releaseLabel),
      detectedOrderId,
    };
  }

  return { reply: FALLBACK_REPLY, detectedOrderId };
}
