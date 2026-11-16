import type { Order } from "@translog/contracts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "@/api/client.ts";
import { useHealth, useOrderQuery, useOrderSamples, useSendChatMessage } from "@/api/queries.ts";
import { AppHeader } from "@/components/app-header.tsx";
import { ChatPanel } from "@/features/chat/chat-panel.tsx";
import {
  type ChatMessageItem,
  chatFailureLabel,
  chatTimeLabel,
  createSessionId,
  messagesAfterOrderSwitch,
} from "@/features/chat/chat-session.ts";
import { type TrackerViewMode, TrackingPanel } from "@/features/tracking/tracking-panel.tsx";
import { parseOrderId, readOrderIdFromUrl, withOrderQueryParam } from "@/lib/url-state.ts";

export function App() {
  const initialOrderId = useMemo(
    () => readOrderIdFromUrl(typeof window !== "undefined" ? window.location.search : ""),
    [],
  );

  const msgSeqRef = useRef(1);
  const nextMsgId = useCallback(() => {
    const id = msgSeqRef.current;
    msgSeqRef.current += 1;
    return id;
  }, []);

  // Estado de busca e pedido selecionado (abre vazio por padrão quando sem parâmetros)
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(initialOrderId);
  // Pedido selecionado no momento, para quem lê depois de esperar (resposta do chat).
  const selectedOrderIdRef = useRef(selectedOrderId);
  useEffect(() => {
    selectedOrderIdRef.current = selectedOrderId;
  }, [selectedOrderId]);
  const [queryValue, setQueryValue] = useState<string>(
    initialOrderId ? String(initialOrderId) : "",
  );
  const [submittedQuery, setSubmittedQuery] = useState<string>(queryValue);

  // Número digitado fora do formato: mostra "não encontrado" sem consultar a API.
  const [invalidQuery, setInvalidQuery] = useState(false);

  // Estado do Chat
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [typing, setTyping] = useState(false);
  // Conversa atual no backend. null = a próxima mensagem começa uma conversa nova.
  const sessionIdRef = useRef<string | null>(null);
  const { mutateAsync: sendChatMessage } = useSendChatMessage();

  // Consultas à API real (@translog/api)
  const healthQuery = useHealth();
  const samplesQuery = useOrderSamples();
  const orderQuery = useOrderQuery(selectedOrderId);

  const isConnected = !healthQuery.isError;

  // Pedido ativo resolvido pela API real
  const activeOrder: Order | null = useMemo(() => {
    if (invalidQuery || selectedOrderId === null) {
      return null;
    }
    return orderQuery.data ?? null;
  }, [invalidQuery, selectedOrderId, orderQuery.data]);

  // View mode calculado da coluna de rastreio
  const trackerView: TrackerViewMode = useMemo(() => {
    if (invalidQuery) {
      return "notfound";
    }
    if (selectedOrderId === null) {
      return "empty";
    }
    if (orderQuery.isPending) {
      return "loading";
    }
    if (orderQuery.isError) {
      const err = orderQuery.error;
      if (err instanceof ApiError && err.status === 404) {
        return "notfound";
      }
      return "error";
    }
    if (orderQuery.data) {
      return "result";
    }
    return "empty";
  }, [
    invalidQuery,
    selectedOrderId,
    orderQuery.isPending,
    orderQuery.isError,
    orderQuery.error,
    orderQuery.data,
  ]);

  // Sincroniza URL (?pedido=N) ao selecionar um pedido
  const syncUrlOrder = useCallback((orderId: number | null) => {
    if (typeof window === "undefined") return;
    const nextSearch = withOrderQueryParam(window.location.search, orderId);
    const nextUrl = `${window.location.pathname}${nextSearch}`;
    window.history.replaceState(null, "", nextUrl);
  }, []);

  /**
   * Começa uma conversa nova: a próxima mensagem vai com outro `sessionId`, e a resposta ainda
   * pendente da conversa anterior é descartada quando chegar.
   */
  const startNewConversation = useCallback(() => {
    sessionIdRef.current = null;
    setTyping(false);
  }, []);

  // Troca de pedido: a conversa continua, com um divisor marcando o pedido novo.
  const applyOrderSwitchToChat = useCallback(
    (nextOrderId: number | null) => {
      const previousOrderId = selectedOrderIdRef.current;
      setMessages((prev) =>
        messagesAfterOrderSwitch(prev, previousOrderId, nextOrderId, nextMsgId),
      );
    },
    [nextMsgId],
  );

  // Busca um pedido pelo formulário, pelos chips ou pelo pedido citado no chat
  const handleSelectOrder = useCallback(
    (rawOrderId: string) => {
      const parsed = parseOrderId(rawOrderId);
      setSubmittedQuery(rawOrderId);
      setQueryValue(rawOrderId);
      setInvalidQuery(parsed === null);

      if (parsed === null) {
        setSelectedOrderId(null);
        syncUrlOrder(null);
        return;
      }

      applyOrderSwitchToChat(parsed);
      setSelectedOrderId(parsed);
      syncUrlOrder(parsed);
    },
    [applyOrderSwitchToChat, syncUrlOrder],
  );

  const handleClearOrder = useCallback(() => {
    setInvalidQuery(false);
    setSelectedOrderId(null);
    setQueryValue("");
    setSubmittedQuery("");
    syncUrlOrder(null);
  }, [syncUrlOrder]);

  const handleRetryTracking = useCallback(() => {
    setInvalidQuery(false);
    if (selectedOrderId !== null) {
      void orderQuery.refetch();
    } else {
      const fallback = parseOrderId(submittedQuery || queryValue || "375");
      if (fallback) {
        setSelectedOrderId(fallback);
        syncUrlOrder(fallback);
      }
    }
  }, [orderQuery, queryValue, selectedOrderId, submittedQuery, syncUrlOrder]);

  const markMessageFailed = useCallback((messageId: number, failureLabel: string) => {
    setMessages((prev) =>
      prev.map((item) =>
        item.id === messageId && item.role === "user"
          ? { ...item, status: "failed", failureLabel }
          : item,
      ),
    );
  }, []);

  // Envia a pergunta à API (POST /api/chat) e mostra a resposta. Sem reenvio automático.
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
        // Pedido citado na mensagem: abre no rastreio (mesma troca de pedido do formulário).
        if (
          response.mentionedOrderId !== null &&
          response.mentionedOrderId !== selectedOrderIdRef.current
        ) {
          handleSelectOrder(String(response.mentionedOrderId));
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
    [activeOrder, handleSelectOrder, markMessageFailed, nextMsgId, sendChatMessage],
  );

  const handleSendMessage = useCallback(
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
  const handleRetryMessage = useCallback(
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

  const handleNewChat = useCallback(() => {
    startNewConversation();
    setMessages([]);
  }, [startNewConversation]);

  return (
    <div className="flex flex-col h-full min-w-[1280px] bg-slate-100/80 text-slate-900 antialiased overflow-hidden">
      <AppHeader connected={isConnected} />

      <main className="flex-1 min-h-0">
        <div className="mx-auto max-w-[1440px] h-full px-6 py-5 grid grid-cols-[minmax(0,1fr)_400px] grid-rows-[minmax(0,1fr)] gap-6">
          <TrackingPanel
            view={trackerView}
            queryValue={queryValue}
            submittedQuery={submittedQuery}
            onQueryChange={setQueryValue}
            onSubmitOrder={handleSelectOrder}
            onClearOrder={handleClearOrder}
            onRetry={handleRetryTracking}
            sampleOrderIds={samplesQuery.orderIds}
            activeOrder={activeOrder}
            onAskAssistant={handleSendMessage}
          />

          <ChatPanel
            activeOrder={activeOrder}
            connected={isConnected}
            messages={messages}
            typing={typing}
            onSendMessage={handleSendMessage}
            onRetryMessage={handleRetryMessage}
            onNewChat={handleNewChat}
          />
        </div>
      </main>
    </div>
  );
}
