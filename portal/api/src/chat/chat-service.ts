import type { OrderService } from "../orders/order-service.ts";
import { findCitedOrder } from "./cited-orders.ts";
import { AgentTimeoutError, AgentUnavailableError, type SupportAgent } from "./support-agent.ts";

/** Chegou outra mensagem da mesma conversa antes de a anterior terminar. Vira `409 CHAT_BUSY`. */
export class ChatBusyError extends Error {
  readonly sessionId: string;

  constructor(sessionId: string) {
    super("A conversa já tem uma mensagem em andamento.");
    this.name = "ChatBusyError";
    this.sessionId = sessionId;
  }
}

/** Log do chat. Recebe só metadados: nunca a mensagem do cliente nem a resposta. */
export interface ChatLogger {
  info(details: object, message: string): void;
  warn(details: object, message: string): void;
}

export interface SendChatMessageInput {
  sessionId: string;
  /** Mensagem já aparada e validada pelo contrato. */
  message: string;
  /** Pedido aberto na tela, se houver. */
  orderId: number | null;
}

export interface ChatReply {
  reply: string;
  /** Pedido existente citado na mensagem, para a tela abrir. */
  mentionedOrderId: number | null;
}

export interface ChatService {
  /**
   * Envia a mensagem ao assistente e devolve a resposta. Uma mensagem por vez por conversa:
   * outra da mesma conversa antes de a anterior terminar lança `ChatBusyError`.
   */
  send(input: SendChatMessageInput): Promise<ChatReply>;
}

export interface ChatServiceDeps {
  agent: SupportAgent;
  orders: Pick<OrderService, "findOrder">;
  log: ChatLogger;
}

type ChatOutcome = "ok" | "busy" | "unavailable" | "timeout" | "error";

/**
 * Chat sem histórico no servidor: o agente ADK guarda a conversa, e o simulado responde
 * cada mensagem sozinha.
 *
 * Pedido de contexto: o primeiro pedido existente citado na mensagem (que também volta como
 * `mentionedOrderId`); sem ele, o pedido aberto na tela, se existir na fonte (inexistente é
 * ignorado, sem erro).
 */
export function createChatService({ agent, orders, log }: ChatServiceDeps): ChatService {
  const busySessions = new Set<string>();

  return {
    async send({ sessionId, message, orderId }) {
      const details = { sessionId, messageLength: message.length };

      // Conferido e marcado antes de qualquer await: duas chamadas simultâneas não passam juntas.
      if (busySessions.has(sessionId)) {
        log.info(
          { ...details, outcome: "busy" satisfies ChatOutcome },
          "Mensagem do chat recusada",
        );
        throw new ChatBusyError(sessionId);
      }
      busySessions.add(sessionId);

      const startedAt = performance.now();
      let outcome: ChatOutcome = "error";
      let reason: string | undefined;
      try {
        const mentioned = await findCitedOrder(message, orders);
        const order = mentioned ?? (orderId === null ? null : await orders.findOrder(orderId));

        const reply = (await agent.reply({ sessionId, message, order })).trim();
        if (reply === "") {
          throw new AgentUnavailableError("o assistente devolveu uma resposta vazia");
        }

        outcome = "ok";
        return { reply, mentionedOrderId: mentioned?.orderId ?? null };
      } catch (error) {
        if (error instanceof AgentTimeoutError) {
          outcome = "timeout";
          reason = error.message;
        } else if (error instanceof AgentUnavailableError) {
          outcome = "unavailable";
          reason = error.message;
        }
        throw error;
      } finally {
        busySessions.delete(sessionId);
        const summary = {
          ...details,
          outcome,
          durationMs: Math.round(performance.now() - startedAt),
          ...(reason === undefined ? {} : { reason }),
        };
        if (outcome === "ok") {
          log.info(summary, "Mensagem do chat respondida");
        } else {
          log.warn(summary, "Mensagem do chat sem resposta");
        }
      }
    },
  };
}
