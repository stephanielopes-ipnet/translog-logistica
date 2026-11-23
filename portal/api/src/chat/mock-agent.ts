import { ASSISTANT_NAME, type Order } from "@translog/contracts";
import { CUSTOMER_CAUSES } from "../orders/customer-language.ts";
import { SUPPORT_HOURS, SUPPORT_MIN_DELAY_DAYS } from "../orders/escalation.ts";
import type { OrderService } from "../orders/order-service.ts";
import { citedOrderIds, findCitedOrder } from "./cited-orders.ts";
import type { SupportAgent } from "./support-agent.ts";

// Assistente simulado (AGENT=mock), reescrito em 16/11 para o contrato das tabelas consumo_*.
// Responde cada mensagem sozinha, sem histórico, consultando os pedidos da fonte configurada.
// Tom amigável e gentil (reunião de 16/11). Regras fixas:
// - a causa é sempre "motivo provável", nunca certeza, e já chega em linguagem do cliente
//   (`customer-language.ts`): o simulado não conhece os termos internos da base;
// - o encaminhamento à central vem pronto da API (`escalateToSupport`), não é decidido aqui;
// - nada de dados do cliente ou de pagamento além da situação do pedido.

export const MODES_REPLY =
  "Trabalhamos com quatro modalidades, cada uma com um prazo de despacho prometido:\n" +
  "• **Standard Class**: econômica, despacho em até 4 dias.\n" +
  "• **Second Class**: intermediária, despacho em até 2 dias.\n" +
  "• **First Class**: prioritária, despacho em até 1 dia.\n" +
  "• **Same Day**: despacho no mesmo dia do pedido.\n" +
  "Depois do despacho, o prazo de entrega depende da rota.";

export const ASK_NUMBER_REPLY =
  "Claro, eu ajudo! Para isso, me diga o número do pedido (só os dígitos, por exemplo 76902). " +
  "Você também pode digitá-lo no campo ao lado.";

export const GREETING_REPLY =
  `Olá! Eu sou o ${ASSISTANT_NAME}, assistente da TransLog. Me diga o número do seu pedido e eu ` +
  "conto onde ele está, quando chega e, se houver atraso, o motivo provável.";

export const FALLBACK_REPLY =
  "Desculpe, ainda não sei responder isso. Posso contar onde está um pedido, quando ele chega, " +
  "o motivo provável de um atraso, explicar as modalidades de envio ou como funciona a central " +
  "de atendimento.";

export const SUPPORT_REPLY =
  `Nossa central de atendimento funciona de **${SUPPORT_HOURS}**. Ela acompanha os pedidos com ` +
  `atraso de entrega de ${SUPPORT_MIN_DELAY_DAYS} dias ou mais e os casos de extravio.`;

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
        return (
          `Não encontrei o pedido **#${cited[0]}** na nossa base. Pode conferir o número? ` +
          "Ele tem só dígitos, como 76902."
        );
      }

      if (/modalidade|tipos de envio|formas de envio|classe/.test(text)) {
        return MODES_REPLY;
      }

      const target = citedOrder ?? order;

      if (/central|atendimento|atendente|humano|falar com alguem|telefone|contato/.test(text)) {
        return target?.escalateToSupport
          ? `${SUPPORT_REPLY} O pedido **#${target.orderId}** se enquadra: ${escalationReason(target)}.`
          : SUPPORT_REPLY;
      }

      const asksWhy = /atras|por que|porque|motivo|demor|causa/.test(text);
      const asksWhere = /onde|local|localiza|rastre|aconteceu|extravi|perdi|sumiu/.test(text);
      const asksStatus = /quando|chega|prazo|previs|entreg|situac|status|acompanh/.test(text);

      if (asksWhy || asksWhere || asksStatus || citedOrder !== null || /pedido/.test(text)) {
        if (target === null) {
          return ASK_NUMBER_REPLY;
        }
        if (asksWhy) {
          return buildWhyReply(target);
        }
        return asksWhere ? buildWhereReply(target) : buildStatusReply(target);
      }

      if (/^(oi|ola|bom dia|boa tarde|boa noite|e ai|hello)\b/.test(text)) {
        return target === null
          ? GREETING_REPLY
          : `Olá! Estou com o pedido **#${target.orderId}** aberto. Posso contar onde ele está, quando chega ou o motivo provável de um atraso.`;
      }

      return FALLBACK_REPLY;
    },
  };
}

/** Situação do pedido: o que aconteceu e o que vem a seguir. */
export function buildStatusReply(order: Order, withSupport = true): string {
  const note = withSupport ? supportNote(order) : "";
  const id = order.orderId;
  const { delivery } = order;
  const delay = delivery.delayDays;

  switch (order.status) {
    case "Em trânsito": {
      const where = order.currentLocation
        ? ` No momento, ele está em **${order.currentLocation}** (etapa ${order.currentStage?.label ?? "—"}).`
        : "";
      if (delay !== null && delay > 0) {
        return (
          `O pedido **#${id}** está **em trânsito**.${where} A entrega estava prevista para ` +
          `**${formatDate(delivery.expectedDate)}** e já soma **${days(delay)} de atraso**. ` +
          `Sinto muito pela espera.${note}`
        );
      }
      return (
        `O pedido **#${id}** está **em trânsito**.${where} A entrega está prevista para ` +
        `**${formatDate(delivery.expectedDate)}**, tudo dentro do prazo até agora.`
      );
    }
    case "Entregue no prazo":
      return (
        `Boa notícia: o pedido **#${id}** foi **entregue no prazo** em ` +
        `**${formatDate(delivery.actualDate)}**${deliveryPlace(order)}.` +
        (delay !== null && delay < 0 ? ` Chegou ${days(-delay)} antes do previsto.` : "")
      );
    case "Entregue com atraso":
      return (
        `O pedido **#${id}** foi **entregue** em **${formatDate(delivery.actualDate)}**` +
        `${deliveryPlace(order)}, **${days(delay ?? 0)} depois** do previsto ` +
        `(${formatDate(delivery.expectedDate)}). Sinto muito pelo atraso.${note}`
      );
    case "Extraviado":
      return (
        `Sinto muito: o volume do pedido **#${id}** foi **extraviado**` +
        `${order.lostAtStage ? ` na etapa **${order.lostAtStage.label}**` : ""}. ` +
        `Último registro em ${formatDate(order.events.at(-1)?.date)}` +
        `${order.currentLocation ? `: ${order.currentLocation}` : ""}.${note}`
      );
    case "Aguardando pagamento":
      return (
        `O pedido **#${id}** está **aguardando a confirmação do pagamento**. Depois dela, o ` +
        `despacho sai em até ${days(order.dispatch.promisedDays)} (${order.shippingMode}).`
      );
    case "Não pago (expirado)":
      return (
        `O pagamento do pedido **#${id}** não foi confirmado e ele **expirou** sem ser ` +
        "despachado, então não há entrega prevista."
      );
    case "Cancelado":
      return `O pedido **#${id}** foi **cancelado** e não será enviado. Se tiver dúvidas, estou por aqui.`;
  }
}

/** Onde o pedido está agora (ou onde foi entregue, ou visto pela última vez). */
export function buildWhereReply(order: Order): string {
  if (order.status !== "Em trânsito" || !order.currentLocation) {
    return buildStatusReply(order);
  }
  const delay = order.delivery.delayDays;
  return (
    `O pedido **#${order.orderId}** está em **${order.currentLocation}** ` +
    `(etapa ${order.currentStage?.label ?? "—"}), desde ${formatDate(order.events.at(-1)?.date)}. ` +
    (delay !== null && delay > 0
      ? `A entrega estava prevista para **${formatDate(order.delivery.expectedDate)}** e já soma **${days(delay)} de atraso**.${supportNote(order)}`
      : `A entrega está prevista para **${formatDate(order.delivery.expectedDate)}**.`)
  );
}

/** Motivo provável do atraso, por etapa (despacho e entrega). */
export function buildWhyReply(order: Order): string {
  const id = order.orderId;
  const { dispatch, delivery } = order;

  switch (order.status) {
    case "Cancelado":
      return `O pedido **#${id}** foi **cancelado** e não será enviado, então não há atraso de transporte a analisar.`;
    case "Não pago (expirado)":
      return `O pedido **#${id}** não chegou a ser despachado: o pagamento não foi confirmado e ele **expirou**. Por isso não há atraso de transporte a analisar.`;
    case "Aguardando pagamento":
      return `O pedido **#${id}** não está atrasado: ele ainda aguarda a confirmação do pagamento para ser despachado.`;
    case "Extraviado":
      return dispatch.probableCause
        ? `${buildStatusReply(order, false)} Antes disso, ${dispatchSentence(order)}${supportNote(order)}`
        : buildStatusReply(order);
  }

  const deliveryLate = delivery.delayDays !== null && delivery.delayDays > 0;
  if (!deliveryLate) {
    const recovered = dispatch.probableCause
      ? ` O despacho atrasou (motivo provável: ${dispatch.probableCause}), mas o transporte recuperou o tempo.`
      : "";
    const now =
      order.status === "Em trânsito"
        ? ` A entrega está prevista para **${formatDate(delivery.expectedDate)}**.`
        : ` Ele foi entregue em **${formatDate(delivery.actualDate)}**${deliveryPlace(order)}.`;
    return `Boa notícia: o pedido **#${id}** não tem atraso na entrega.${recovered}${now}`;
  }

  const parts = [
    dispatch.probableCause ? capitalize(dispatchSentence(order)) : null,
    delivery.probableCause
      ? `Na entrega, o motivo provável é que **${delivery.probableCause}**.`
      : null,
  ].filter((part) => part !== null);
  if (parts.length === 0) {
    return (
      `O pedido **#${id}** está com **${days(delivery.delayDays ?? 0)} de atraso**, mas não há um ` +
      `motivo provável registrado para ele.${supportNote(order)}`
    );
  }
  return `Sinto muito pelo atraso do pedido **#${id}**. ${parts.join(" ")}${supportNote(order)}`;
}

/** "no despacho, que saiu N dias depois do prometido, o motivo provável é que <motivo>." */
function dispatchSentence(order: Order): string {
  const { dispatch } = order;
  const cause = dispatch.probableCause ?? "";
  const late =
    dispatch.delayDays !== null && dispatch.delayDays > 0
      ? `, que saiu ${days(dispatch.delayDays)} depois do prometido`
      : "";
  const mode =
    cause === CUSTOMER_CAUSES["Promessa irreal"]
      ? ` (${order.shippingMode}: ${days(dispatch.promisedDays)} para despachar)`
      : "";
  return `no despacho${late}, o motivo provável é que **${cause}**${mode}.`;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Aviso de encaminhamento à central, quando a API marcou o pedido (`escalateToSupport`). */
function supportNote(order: Order): string {
  if (!order.escalateToSupport) {
    return "";
  }
  return (
    ` Como ${escalationReason(order)}, este caso é acompanhado pela nossa **central de ` +
    `atendimento**, que funciona de **${SUPPORT_HOURS}**.`
  );
}

/** Por que a API encaminhou o pedido à central. */
function escalationReason(order: Order): string {
  const delay = order.delivery.delayDays ?? 0;
  if (order.status === "Extraviado") {
    return "houve extravio";
  }
  return order.status === "Em trânsito"
    ? `a entrega já está ${days(delay)} atrasada`
    : `a entrega atrasou ${days(delay)}`;
}

/** ", em Saltillo - Coahuila (México)" a partir de "Entregue em Saltillo - Coahuila (México)". */
function deliveryPlace(order: Order): string {
  const place = order.currentLocation?.replace(/^Entregue em /, "");
  return place ? `, em ${place}` : "";
}

/** Minúsculas e sem acentos, para comparar palavras-chave. */
function normalizeText(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

/** Mensagem que é só um número ("375" ou "#375"). */
function isOnlyNumber(text: string): boolean {
  return /^\s*#?\d+\s*$/.test(text);
}

/** `"2015-01-08"` → `"08/01/2015"`, por corte de texto (nunca `new Date`). */
function formatDate(date: string | null | undefined): string {
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
