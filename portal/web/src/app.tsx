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
  startsNewConversation,
} from "@/features/chat/chat-session.ts";
import { buildPresetConversation, PRESET_ORDER_ID } from "@/features/dev-bar/chat-presets.ts";
import {
  type ChatOnSwitchMode,
  ProtoBar,
  type ReleaseLabelMode,
} from "@/features/dev-bar/proto-bar.tsx";
import { type TrackerViewMode, TrackingPanel } from "@/features/tracking/tracking-panel.tsx";
import { parseOrderId, readUrlPresets, withOrderQueryParam } from "@/lib/url-state.ts";

export function App() {
  const initialUrl = useMemo(
    () => readUrlPresets(typeof window !== "undefined" ? window.location.search : ""),
    [],
  );
  // Conversa de exemplo pela URL (?c=conversation|typing|error): textos fixos sobre o pedido 76902.
  const initialChatPreset =
    initialUrl.chatPreset && initialUrl.chatPreset !== "empty" ? initialUrl.chatPreset : null;
  const initialOrderId = initialUrl.orderId ?? (initialChatPreset ? PRESET_ORDER_ID : null);

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
    initialOrderId
      ? String(initialOrderId)
      : initialUrl.trackerPreset === "notfound"
        ? "9999"
        : initialUrl.trackerPreset === "loading" || initialUrl.trackerPreset === "error"
          ? "375"
          : "",
  );
  const [submittedQuery, setSubmittedQuery] = useState<string>(queryValue);

  // Sobreposições da barra de protótipo (null = usa API real normalmente)
  const [forcedTrackerView, setForcedTrackerView] = useState<
    "loading" | "notfound" | "error" | null
  >(
    initialUrl.trackerPreset === "loading" ||
      initialUrl.trackerPreset === "notfound" ||
      initialUrl.trackerPreset === "error"
      ? initialUrl.trackerPreset
      : null,
  );
  const [forcedOffline, setForcedOffline] = useState<boolean>(initialUrl.networkOnline === false);

  // Os 2 pontos em aberto configuráveis
  const [chatOnSwitch, setChatOnSwitch] = useState<ChatOnSwitchMode>(
    initialUrl.chatOnSwitch ?? "keep",
  );
  const [releaseLabel, setReleaseLabel] = useState<ReleaseLabelMode>(
    initialUrl.releaseLabel ?? "waiting",
  );

  // Estado do Chat
  const [messages, setMessages] = useState<ChatMessageItem[]>(() =>
    initialChatPreset ? buildPresetConversation(initialChatPreset, () => msgSeqRef.current++) : [],
  );
  const [typing, setTyping] = useState<boolean>(initialChatPreset === "typing");
  // Conversa atual no backend. null = a próxima mensagem começa uma conversa nova.
  const sessionIdRef = useRef<string | null>(null);
  const { mutateAsync: sendChatMessage } = useSendChatMessage();

  // Consultas à API real (@translog/api)
  const healthQuery = useHealth(!forcedOffline);
  const samplesQuery = useOrderSamples();
  const orderQuery = useOrderQuery(selectedOrderId, !forcedOffline && forcedTrackerView === null);

  const isConnected = !forcedOffline && !healthQuery.isError;

  // Pedido ativo resolvido pela API real
  const activeOrder: Order | null = useMemo(() => {
    if (forcedTrackerView !== null || selectedOrderId === null) {
      return null;
    }
    return orderQuery.data ?? null;
  }, [forcedTrackerView, selectedOrderId, orderQuery.data]);

  // View mode calculado da coluna de rastreio
  const trackerView: TrackerViewMode = useMemo(() => {
    if (forcedTrackerView) {
      return forcedTrackerView;
    }
    if (selectedOrderId === null) {
      return "empty";
    }
    if (forcedOffline) {
      return "error";
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
    forcedTrackerView,
    selectedOrderId,
    forcedOffline,
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

  // Aplica regra de troca de pedido no chat (keep | divider | clear)
  const applyOrderSwitchToChat = useCallback(
    (nextOrderId: number | null) => {
      const previousOrderId = selectedOrderIdRef.current;
      if (startsNewConversation(chatOnSwitch, previousOrderId, nextOrderId)) {
        startNewConversation();
      }
      setMessages((prev) =>
        messagesAfterOrderSwitch(prev, chatOnSwitch, previousOrderId, nextOrderId, nextMsgId),
      );
    },
    [chatOnSwitch, nextMsgId, startNewConversation],
  );

  // Busca um pedido pelo formulário, pelos chips ou pelo pedido citado no chat
  const handleSelectOrder = useCallback(
    (rawOrderId: string) => {
      const parsed = parseOrderId(rawOrderId);
      setSubmittedQuery(rawOrderId);
      setQueryValue(rawOrderId);
      setForcedTrackerView(null);

      if (parsed === null) {
        setSelectedOrderId(null);
        setForcedTrackerView("notfound");
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
    setForcedTrackerView(null);
    setSelectedOrderId(null);
    setQueryValue("");
    setSubmittedQuery("");
    syncUrlOrder(null);
  }, [syncUrlOrder]);

  const handleRetryTracking = useCallback(() => {
    setForcedOffline(false);
    setForcedTrackerView(null);
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
      if (forcedOffline) {
        markMessageFailed(userMessageId, "Não enviada");
        return;
      }

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
          return; // A conversa mudou enquanto esperava ("Nova conversa" ou troca com "Zerar").
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
    [activeOrder, forcedOffline, handleSelectOrder, markMessageFailed, nextMsgId, sendChatMessage],
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

  // Aplicação de presets da barra de controle
  const handleSelectPreset = useCallback(
    (presetKey: string) => {
      const [kind, val] = presetKey.split(":");
      if (!kind || !val) return;

      if (kind === "t") {
        if (/^\d+$/.test(val)) {
          const id = Number(val);
          setForcedOffline(false);
          setForcedTrackerView(null);
          applyOrderSwitchToChat(id);
          setSelectedOrderId(id);
          setQueryValue(val);
          setSubmittedQuery(val);
          syncUrlOrder(id);
        } else if (val === "empty") {
          setForcedTrackerView(null);
          setSelectedOrderId(null);
          setQueryValue("");
          setSubmittedQuery("");
          syncUrlOrder(null);
        } else if (val === "loading") {
          setForcedTrackerView("loading");
          if (!queryValue) setQueryValue("375");
        } else if (val === "notfound") {
          setForcedTrackerView("notfound");
          setSelectedOrderId(null);
          setQueryValue("9999");
          setSubmittedQuery("9999");
          syncUrlOrder(null);
        } else if (val === "error") {
          setForcedOffline(true);
          setForcedTrackerView("error");
          if (!queryValue) {
            setQueryValue("375");
            setSubmittedQuery("375");
          }
        }
      } else if (kind === "c") {
        // Conversa de exemplo substitui a atual: começa outra conversa no backend.
        startNewConversation();
        if (val === "empty") {
          setMessages([]);
        } else if (val === "conversation" || val === "typing" || val === "error") {
          if (selectedOrderIdRef.current !== PRESET_ORDER_ID) {
            setForcedTrackerView(null);
            setSelectedOrderId(PRESET_ORDER_ID);
            setQueryValue(String(PRESET_ORDER_ID));
            setSubmittedQuery(String(PRESET_ORDER_ID));
            syncUrlOrder(PRESET_ORDER_ID);
          }
          setMessages(buildPresetConversation(val, nextMsgId));
          // "Digitando" de exemplo: nenhuma pergunta foi enviada à API.
          setTyping(val === "typing");
        }
      } else if (kind === "s") {
        if (val === "keep" || val === "divider" || val === "clear") {
          setChatOnSwitch(val);
        }
      } else if (kind === "r") {
        if (val === "waiting" || val === "payment") {
          // Só muda o rótulo de pedidos "Aguardando pagamento" (nenhum entre os fixtures).
          setReleaseLabel(val);
        }
      } else if (kind === "n") {
        const nextOffline = val === "off";
        setForcedOffline(nextOffline);
        if (!nextOffline && forcedTrackerView === "error") {
          setForcedTrackerView(null);
        }
      }
    },
    [
      applyOrderSwitchToChat,
      forcedTrackerView,
      nextMsgId,
      queryValue,
      startNewConversation,
      syncUrlOrder,
    ],
  );

  const activeProtoKeys = useMemo(() => {
    const tk =
      trackerView === "result" && activeOrder ? `t:${activeOrder.orderId}` : `t:${trackerView}`;
    const hasFailed = messages.some((m) => m.role === "user" && m.status === "failed");
    const ck = typing
      ? "c:typing"
      : hasFailed
        ? "c:error"
        : messages.length > 0
          ? "c:conversation"
          : "c:empty";
    return [tk, ck, `s:${chatOnSwitch}`, `r:${releaseLabel}`, isConnected ? "n:on" : "n:off"];
  }, [activeOrder, chatOnSwitch, isConnected, messages, releaseLabel, trackerView, typing]);

  return (
    <div className="flex flex-col h-full min-w-[1280px] bg-slate-100/80 text-slate-900 antialiased overflow-hidden">
      {!initialUrl.hideProtoBarCompletely && (
        <ProtoBar activeKeys={activeProtoKeys} onSelectPreset={handleSelectPreset} />
      )}

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
            releaseLabel={releaseLabel}
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
