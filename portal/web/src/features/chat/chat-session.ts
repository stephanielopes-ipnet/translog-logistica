import { ApiError } from "@/api/client.ts";

// Regras puras da conversa na tela. As respostas vêm da API (`POST /api/chat`);
// a regra das respostas do assistente simulado vive só no backend (`api/src/chat/mock-agent.ts`).

export type ChatMessageItem =
  | {
      id: number;
      role: "user";
      text: string;
      time: string;
      status: "sent" | "failed";
      /** Texto curto exibido ao lado de "Tentar novamente" quando o envio falha. */
      failureLabel?: string;
    }
  | {
      id: number;
      role: "assistant";
      text: string;
      time: string;
    }
  | {
      id: number;
      role: "divider";
      orderId: number;
    };

/** Horário da mensagem (`HH:MM`). */
export function chatTimeLabel(): string {
  return new Date().toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Identificador de uma conversa nova (UUID v4), enviado como `sessionId` em `POST /api/chat`. */
export function createSessionId(): string {
  return crypto.randomUUID();
}

/**
 * Mensagens depois de trocar de pedido (decidido em 17/11): a conversa continua, com um divisor
 * marcando o pedido novo. Chat vazio, mesmo pedido ou sem pedido anterior: nada muda.
 */
export function messagesAfterOrderSwitch(
  messages: ChatMessageItem[],
  previousOrderId: number | null,
  nextOrderId: number | null,
  nextId: () => number,
): ChatMessageItem[] {
  if (
    previousOrderId === null ||
    nextOrderId === null ||
    previousOrderId === nextOrderId ||
    messages.length === 0
  ) {
    return messages;
  }
  const last = messages.at(-1);
  if (last?.role === "divider" && last.orderId === nextOrderId) {
    return messages;
  }
  return [...messages, { id: nextId(), role: "divider", orderId: nextOrderId }];
}

/** Texto ao lado de "Tentar novamente" conforme a falha de `POST /api/chat`. */
export function chatFailureLabel(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 504) {
      return "O assistente demorou demais";
    }
    if (error.status === 409) {
      return "Aguarde a resposta anterior";
    }
  }
  return "Não enviada";
}
