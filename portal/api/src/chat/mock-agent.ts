import type { Order, ShippingMode } from "@translog/contracts";
import type { OrderService } from "../orders/order-service.ts";
import { citedOrderIds, findCitedOrder } from "./cited-orders.ts";
import type { SupportAgent } from "./support-agent.ts";

// Assistente simulado (AGENT=mock): regras e textos que antes ficavam na tela
// (web/src/features/chat/mock-chat-service.ts). Responde cada mensagem sozinha, sem histórico,
// consultando os pedidos da fonte configurada (fixtures ou Silver).
// Regra fixa: o rótulo é sempre "Motivo provável"; nenhum texto apresenta a causa como comprovada.

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

/** Prazo estimado de cada modalidade, em dias (o mesmo de `MODES_REPLY`). */
const SHIPPING_DAYS: Record<ShippingMode, number> = {
  "Standard Class": 4,
  "Second Class": 2,
  "First Class": 1,
  "Same Day": 0,
};

export interface MockAgentDeps {
  orders: Pick<OrderService, "findOrder">;
}

export function createMockAgent({ orders }: MockAgentDeps): SupportAgent {
  return {
    async reply({ message, order }) {
      const text = normalizeText(message);
      const cited = citedOrderIds(message);

      // Pedido existente citado na mensagem (normalmente o chat-service já o resolveu em `order`).
      const citedOrder =
        order !== null && cited.includes(order.orderId)
          ? order
          : await findCitedOrder(message, orders);

      if (cited.length > 0 && citedOrder === null && (/pedido/.test(text) || isOnlyNumber(text))) {
        return `Não encontrei o pedido **#${cited[0]}**. Confira o número e tente novamente.`;
      }

      if (/modalidade|tipos de envio|formas de envio|classe/.test(text)) {
        return MODES_REPLY;
      }

      const target = citedOrder ?? order;
      const asksWhy = /atras|por que|porque|motivo|demor|causa/.test(text);
      const asksWhen = /quando|chega|prazo|previs|entreg|situac|status|onde/.test(text);

      if (asksWhy || asksWhen || citedOrder !== null || /pedido/.test(text)) {
        if (target === null) {
          return ASK_NUMBER_REPLY;
        }
        return asksWhy ? buildWhyReply(target) : buildWhenReply(target);
      }

      return FALLBACK_REPLY;
    },
  };
}

export function buildWhenReply(order: Order): string {
  const id = order.orderId;
  const delay = order.delayDays;

  switch (order.trackingStatus) {
    case "Em Trânsito":
      return delay !== null && delay > 0
        ? `O pedido **#${id}** está **Em Trânsito**. A entrega estava prevista para **${formatDate(order.estimatedDeliveryDate)}** e acumula **${days(delay)} de atraso**.`
        : `O pedido **#${id}** está **Em Trânsito**, dentro do prazo, com entrega prevista para **${formatDate(order.estimatedDeliveryDate)}**.`;
    case "Entregue":
      if (delay !== null && delay > 0) {
        return `O pedido **#${id}** foi **Entregue** em **${formatDate(order.actualDeliveryDate)}**, ${days(delay)} após a data prevista (${formatDate(order.estimatedDeliveryDate)}).`;
      }
      if (delay !== null && delay < 0) {
        return `O pedido **#${id}** foi **Entregue** em **${formatDate(order.actualDeliveryDate)}**, ${days(-delay)} antes da data prevista.`;
      }
      return `O pedido **#${id}** foi **Entregue** em **${formatDate(order.actualDeliveryDate)}**, dentro do prazo previsto.`;
    case "Aguardando Liberação":
      return `O pedido **#${id}** está **Aguardando Liberação**. Depois de liberado, a entrega está prevista para **${formatDate(order.estimatedDeliveryDate)}**.`;
    case "Cancelado":
      return `O pedido **#${id}** foi **Cancelado** e não será enviado.`;
  }
}

export function buildWhyReply(order: Order): string {
  const id = order.orderId;

  if (order.probableCause) {
    const detail = causeDetail(order);
    return detail
      ? `O motivo provável do atraso do pedido **#${id}** é **${order.probableCause}**: ${detail}`
      : `O motivo provável do atraso do pedido **#${id}** é **${order.probableCause}**.`;
  }

  if (order.trackingStatus === "Cancelado") {
    return `O pedido **#${id}** foi **Cancelado**, portanto não há atraso de transporte a analisar.`;
  }

  if (order.trackingStatus === "Aguardando Liberação") {
    return `O pedido **#${id}** não está atrasado no transporte. Ele está **Aguardando Liberação** com previsão para **${formatDate(order.estimatedDeliveryDate)}**.`;
  }

  if (order.delayDays !== null && order.delayDays > 0) {
    const verb = order.trackingStatus === "Entregue" ? "foi entregue" : "está";
    return `O pedido **#${id}** ${verb} com **${days(order.delayDays)} de atraso**, mas não há um motivo provável específico registrado na base para esta remessa.`;
  }

  return `O pedido **#${id}** não apresenta atraso. ${buildWhenReply(order)}`;
}

/**
 * Explicação do motivo "Promessa irreal" a partir do próprio pedido, sempre como hipótese
 * ("provavelmente"). Ex. (375): "o prazo de 2 dias da modalidade Second Class provavelmente foi
 * curto para a rota internacional Texas → Saltillo (México)." Outros motivos: sem detalhe.
 */
function causeDetail(order: Order): string | null {
  if (order.probableCause !== "Promessa irreal") {
    return null;
  }
  const origin = order.origin.split(", ");
  const destination = order.destination.split(", ");
  const from = origin[1] ?? origin[0];
  const to = `${destination[0]} (${destination.at(-1)})`;
  const route = origin.at(-1) === destination.at(-1) ? "rota" : "rota internacional";

  if (order.shippingMode === "Same Day") {
    return `o envio no mesmo dia (Same Day) provavelmente tinha prazo curto demais para a ${route} ${from} → ${to}.`;
  }
  return `o prazo de ${days(SHIPPING_DAYS[order.shippingMode])} da modalidade ${order.shippingMode} provavelmente foi curto para a ${route} ${from} → ${to}.`;
}

/** Minúsculas e sem acentos, para comparar palavras-chave. */
function normalizeText(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Mensagem que é só um número ("375" ou "#375"). */
function isOnlyNumber(text: string): boolean {
  return /^\s*#?\d+\s*$/.test(text);
}

/** `"2015-01-08"` → `"08/01/2015"`, por corte de texto (nunca `new Date`). */
function formatDate(date: string | null): string {
  if (!date) {
    return "—";
  }
  const [year, month, day] = date.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

/** `1` → `"1 dia"`; `4` → `"4 dias"`. */
function days(count: number): string {
  return `${count} ${count === 1 ? "dia" : "dias"}`;
}
