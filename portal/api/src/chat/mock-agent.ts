import type { Order } from "@translog/contracts";
import { SUPPORT_HOURS } from "../orders/escalation.ts";
import type { OrderService } from "../orders/order-service.ts";
import { citedOrderIds, findCitedOrder } from "./cited-orders.ts";
import type { SupportAgent } from "./support-agent.ts";

// Assistente simulado (AGENT=mock): regras e textos que antes ficavam na tela
// (web/src/features/chat/mock-chat-service.ts). Responde cada mensagem sozinha, sem histórico,
// consultando os pedidos da fonte configurada (fixtures ou tabelas consumo_*).
// Adaptado ao contrato novo em 16/11 com textos simples; a reescrita completa vem depois.
// Regra fixa: o rótulo é sempre "Motivo provável"; nenhum texto apresenta a causa como comprovada.

export const MODES_REPLY =
  "Trabalhamos com quatro modalidades internacionais:\n" +
  "• **Standard Class**: opção econômica, com prazo estimado de 4 dias.\n" +
  "• **Second Class**: intermediária, com prazo estimado de 2 dias.\n" +
  "• **First Class**: prioritária, com prazo estimado de 1 dia.\n" +
  "• **Same Day**: despacho no mesmo dia do pedido.";

export const ASK_NUMBER_REPLY =
  "Para consultar, informe o número do pedido no campo ao lado ou aqui na conversa (ex.: 76902).";

export const FALLBACK_REPLY =
  "Posso informar a situação, o prazo de entrega e o motivo provável de atraso de um pedido, ou explicar as modalidades de envio.";

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
  const { delivery } = order;
  const delay = delivery.delayDays;

  switch (order.status) {
    case "Em trânsito": {
      const where = order.currentLocation ? ` Agora: **${order.currentLocation}**.` : "";
      return delay !== null && delay > 0
        ? `O pedido **#${id}** está **Em trânsito**. A entrega estava prevista para **${formatDate(delivery.expectedDate)}** e acumula **${days(delay)} de atraso**.${where}`
        : `O pedido **#${id}** está **Em trânsito**, dentro do prazo, com entrega prevista para **${formatDate(delivery.expectedDate)}**.${where}`;
    }
    case "Entregue com atraso":
      return `O pedido **#${id}** foi **Entregue com atraso** em **${formatDate(delivery.actualDate)}**, ${days(delay ?? 0)} após a data prevista (${formatDate(delivery.expectedDate)}).`;
    case "Entregue no prazo":
      return delay !== null && delay < 0
        ? `O pedido **#${id}** foi **Entregue no prazo** em **${formatDate(delivery.actualDate)}**, ${days(-delay)} antes da data prevista.`
        : `O pedido **#${id}** foi **Entregue no prazo** em **${formatDate(delivery.actualDate)}**.`;
    case "Extraviado":
      return `O volume do pedido **#${id}** foi **Extraviado**${order.lostAtStage ? ` na etapa **${order.lostAtStage.label}**` : ""}.`;
    case "Aguardando pagamento":
      return `O pedido **#${id}** está **Aguardando pagamento**. O prazo de despacho começa a contar depois da confirmação.`;
    case "Não pago (expirado)":
      return `O pedido **#${id}** está como **Não pago (expirado)** e não foi despachado.`;
    case "Cancelado":
      return `O pedido **#${id}** foi **Cancelado** e não será enviado.`;
  }
}

export function buildWhyReply(order: Order): string {
  const id = order.orderId;
  const causes = [
    order.dispatch.probableCause && `no despacho, **${order.dispatch.probableCause}**`,
    order.delivery.probableCause && `na entrega, **${order.delivery.probableCause}**`,
  ].filter((cause) => cause !== null);

  if (order.status === "Extraviado") {
    const detail = causes.length > 0 ? ` Motivo provável do atraso: ${causes.join("; ")}.` : "";
    return `${buildWhenReply(order)}${detail}${supportNote(order)}`;
  }

  if (causes.length > 0) {
    return `Motivo provável do atraso do pedido **#${id}**: ${causes.join("; ")}.${supportNote(order)}`;
  }

  if (order.status === "Cancelado" || order.status === "Não pago (expirado)") {
    return `O pedido **#${id}** está como **${order.status}**, portanto não há atraso de transporte a analisar.`;
  }

  if (order.status === "Aguardando pagamento") {
    return `O pedido **#${id}** não está atrasado no transporte. Ele está **Aguardando pagamento**.`;
  }

  return `O pedido **#${id}** não apresenta atraso. ${buildWhenReply(order)}`;
}

/** Aviso de encaminhamento à central (regra calculada na API: `escalateToSupport`). */
function supportNote(order: Order): string {
  return order.escalateToSupport
    ? ` Este caso deve ser tratado pela central de atendimento (${SUPPORT_HOURS}).`
    : "";
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
