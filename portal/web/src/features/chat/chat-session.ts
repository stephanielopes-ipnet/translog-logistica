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

/** O que acontece com a conversa ao trocar de pedido (decisão em aberto, simulada na barra). */
export type ChatOnSwitchMode = "keep" | "divider" | "clear";

/** Horário da mensagem (`HH:MM`); `minutesAgo` serve às conversas de exemplo da barra. */
export function chatTimeLabel(minutesAgo = 0): string {
  return new Date(Date.now() - minutesAgo * 60_000).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Identificador de uma conversa nova (UUID v4), enviado como `sessionId` em `POST /api/chat`. */
export function createSessionId(): string {
  return crypto.randomUUID();
}

function isOrderSwitch(previousOrderId: number | null, nextOrderId: number | null): boolean {
  return previousOrderId !== null && nextOrderId !== null && previousOrderId !== nextOrderId;
}

/**
 * A troca de pedido começa uma conversa nova (novo `sessionId`) só quando limpa a conversa
 * (`clear`). Nos outros modos a conversa e o `sessionId` continuam.
 */
export function startsNewConversation(
  mode: ChatOnSwitchMode,
  previousOrderId: number | null,
  nextOrderId: number | null,
): boolean {
  return mode === "clear" && isOrderSwitch(previousOrderId, nextOrderId);
}

/** Mensagens depois de trocar de pedido: `keep` mantém, `divider` insere um divisor, `clear` limpa. */
export function messagesAfterOrderSwitch(
  messages: ChatMessageItem[],
  mode: ChatOnSwitchMode,
  previousOrderId: number | null,
  nextOrderId: number | null,
  nextId: () => number,
): ChatMessageItem[] {
  if (
    nextOrderId === null ||
    !isOrderSwitch(previousOrderId, nextOrderId) ||
    messages.length === 0
  ) {
    return messages;
  }
  if (mode === "clear") {
    return [];
  }
  if (mode === "divider") {
    const last = messages.at(-1);
    if (last?.role === "divider" && last.orderId === nextOrderId) {
      return messages;
    }
    return [...messages, { id: nextId(), role: "divider", orderId: nextOrderId }];
  }
  return messages;
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
