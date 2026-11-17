import type { Order } from "@translog/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSendChatMessage } from "@/api/queries.ts";
import {
  type ChatMessageItem,
  chatFailureLabel,
  chatTimeLabel,
  createSessionId,
  messagesAfterOrderSwitch,
} from "./chat-session.ts";

interface UseChatConversationOptions {
  /** Pedido aberto no rastreio (vai como contexto para a API), ou `null`. */
  activeOrder: Order | null;
  /** Pedido em foco no rastreio, mesmo antes de carregar (marca o divisor ao trocar). */
  focusedOrderId: number | null;
  /** O assistente citou outro pedido: a tela abre o rastreio dele. */
  onMentionedOrder: (orderId: number) => void;
}

/**
 * Conversa com o LogBot. Fica acima das páginas (no `App`), para a mesma conversa continuar do
 * Início para o Rastreamento. Sem histórico no servidor: a tela guarda as mensagens e o
 * `sessionId`. Sem reenvio automático.
 */
export function useChatConversation({
  activeOrder,
  focusedOrderId,
  onMentionedOrder,
}: UseChatConversationOptions) {
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [typing, setTyping] = useState(false);
  // Conversa atual no backend. null = a próxima mensagem começa uma conversa nova.
  const sessionIdRef = useRef<string | null>(null);
  const { mutateAsync: sendChatMessage } = useSendChatMessage();

  const msgSeqRef = useRef(1);
  const nextMsgId = useCallback(() => {
    const id = msgSeqRef.current;
    msgSeqRef.current += 1;
    return id;
  }, []);

  // Pedido em foco no momento, para quem lê depois de esperar (resposta do chat).
  const focusedOrderIdRef = useRef(focusedOrderId);
  // Troca de pedido: a conversa continua, com um divisor marcando o pedido novo.
  useEffect(() => {
    const previous = focusedOrderIdRef.current;
    focusedOrderIdRef.current = focusedOrderId;
    setMessages((prev) => messagesAfterOrderSwitch(prev, previous, focusedOrderId, nextMsgId));
  }, [focusedOrderId, nextMsgId]);

  const markMessageFailed = useCallback((messageId: number, failureLabel: string) => {
    setMessages((prev) =>
      prev.map((item) =>
        item.id === messageId && item.role === "user"
          ? { ...item, status: "failed", failureLabel }
          : item,
      ),
    );
  }, []);

  // Envia a pergunta à API (POST /api/chat) e mostra a resposta.
  const deliverChatReply = useCallback(
    async (question: string, userMessageId: number) => {
      sessionIdRef.current ??= createSessionId();
      const sessionId = sessionIdRef.current;
      setTyping(true);
      try {
        const response = await sendChatMessage({
          sessionId,
          message: question,
          orderId: activeOrder?.orderId ?? null,
        });
        if (sessionIdRef.current !== sessionId) {
          return; // O cliente começou uma "Nova conversa" enquanto esperava.
        }
        setTyping(false);
        if (
          response.mentionedOrderId !== null &&
          response.mentionedOrderId !== focusedOrderIdRef.current
        ) {
          onMentionedOrder(response.mentionedOrderId);
        }
        setMessages((prev) => [
          ...prev,
          { id: nextMsgId(), role: "assistant", text: response.reply, time: chatTimeLabel() },
        ]);
      } catch (error) {
        if (sessionIdRef.current !== sessionId) {
          return;
        }
        setTyping(false);
        markMessageFailed(userMessageId, chatFailureLabel(error));
      }
    },
    [activeOrder, markMessageFailed, nextMsgId, onMentionedOrder, sendChatMessage],
  );

  const sendMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || typing) return;
      const id = nextMsgId();
      setMessages((prev) => [
        ...prev,
        { id, role: "user", text: trimmed, time: chatTimeLabel(), status: "sent" },
      ]);
      void deliverChatReply(trimmed, id);
    },
    [deliverChatReply, nextMsgId, typing],
  );

  // Reenvio manual ("Tentar novamente"): a mensagem que falhou volta para o fim da conversa.
  const retryMessage = useCallback(
    (messageId: number) => {
      if (typing) return;
      const target = messages.find((m) => m.id === messageId && m.role === "user");
      if (target?.role !== "user") return;

      const id = nextMsgId();
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== messageId),
        { id, role: "user", text: target.text, time: chatTimeLabel(), status: "sent" },
      ]);
      void deliverChatReply(target.text, id);
    },
    [deliverChatReply, messages, nextMsgId, typing],
  );

  /**
   * Começa uma conversa nova: a próxima mensagem vai com outro `sessionId`, e a resposta ainda
   * pendente da conversa anterior é descartada quando chegar.
   */
  const newConversation = useCallback(() => {
    sessionIdRef.current = null;
    setTyping(false);
    setMessages([]);
  }, []);

  return { messages, typing, sendMessage, retryMessage, newConversation };
}
