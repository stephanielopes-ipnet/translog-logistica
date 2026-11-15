import { useQueryClient } from "@tanstack/react-query";
import { type Order, orderSchema } from "@translog/contracts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, getJson } from "@/api/client.ts";
import { findFixtureOrder } from "@/api/fixtures.ts";
import { useHealth, useOrderQuery, useOrderSamples } from "@/api/queries.ts";
import { AppHeader } from "@/components/app-header.tsx";
import type { ChatMessageItem } from "@/features/chat/chat-messages.tsx";
import { ChatPanel } from "@/features/chat/chat-panel.tsx";
import {
  buildAssistantReply,
  buildWhenReply,
  buildWhyReply,
} from "@/features/chat/mock-chat-service.ts";
import {
  type ChatOnSwitchMode,
  ProtoBar,
  type ReleaseLabelMode,
} from "@/features/dev-bar/proto-bar.tsx";
import { type TrackerViewMode, TrackingPanel } from "@/features/tracking/tracking-panel.tsx";
import { parseOrderId, readUrlPresets, withOrderQueryParam } from "@/lib/url-state.ts";

function nowTimeLabel(offsetMin = 0): string {
  return new Date(Date.now() - offsetMin * 60_000).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildPresetConversation(
  order: Order,
  releaseLabel: ReleaseLabelMode,
  withSecondAnswer: boolean,
  nextId: () => number,
): ChatMessageItem[] {
  const q1 = "Quando meu pedido chega?";
  const q2 = "Por que meu pedido atrasou?";
  const items: ChatMessageItem[] = [
    { id: nextId(), role: "user", text: q1, time: nowTimeLabel(4), status: "sent" },
    {
      id: nextId(),
      role: "assistant",
      text: buildWhenReply(order, releaseLabel),
      time: nowTimeLabel(4),
    },
  ];
  if (withSecondAnswer) {
    items.push({ id: nextId(), role: "user", text: q2, time: nowTimeLabel(2), status: "sent" });
    items.push({
      id: nextId(),
      role: "assistant",
      text: buildWhyReply(order, releaseLabel),
      time: nowTimeLabel(2),
    });
  }
  return items;
}

export function App() {
  const initialUrl = useMemo(
    () => readUrlPresets(typeof window !== "undefined" ? window.location.search : ""),
    [],
  );

  const msgSeqRef = useRef(1);
  const queryClient = useQueryClient();
  const nextMsgId = useCallback(() => {
    const id = msgSeqRef.current;
    msgSeqRef.current += 1;
    return id;
  }, []);

  // Estado de busca e pedido selecionado (abre vazio por padrão quando sem parâmetros)
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(initialUrl.orderId);
  const [queryValue, setQueryValue] = useState<string>(
    initialUrl.orderId
      ? String(initialUrl.orderId)
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
  const [messages, setMessages] = useState<ChatMessageItem[]>(() => {
    if (!initialUrl.chatPreset || initialUrl.chatPreset === "empty") {
      return [];
    }
    const baseOrder = findFixtureOrder(initialUrl.orderId ?? 375) ?? findFixtureOrder(375);
    if (!baseOrder) return [];
    const rel = initialUrl.releaseLabel ?? "waiting";
    if (initialUrl.chatPreset === "conversation") {
      return buildPresetConversation(baseOrder, rel, true, () => msgSeqRef.current++);
    }
    if (initialUrl.chatPreset === "typing") {
      const list = buildPresetConversation(baseOrder, rel, false, () => msgSeqRef.current++);
      list.push({
        id: msgSeqRef.current++,
        role: "user",
        text: "Por que meu pedido atrasou?",
        time: nowTimeLabel(),
        status: "sent",
      });
      return list;
    }
    if (initialUrl.chatPreset === "error") {
      const list = buildPresetConversation(baseOrder, rel, false, () => msgSeqRef.current++);
      list.push({
        id: msgSeqRef.current++,
        role: "user",
        text: "Por que meu pedido atrasou?",
        time: nowTimeLabel(),
        status: "failed",
      });
      return list;
    }
    return [];
  });
  const [typing, setTyping] = useState<boolean>(initialUrl.chatPreset === "typing");
  const chatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Consultas à API real (@translog/api)
  const healthQuery = useHealth(!forcedOffline);
  const samplesQuery = useOrderSamples();
  const orderQuery = useOrderQuery(selectedOrderId, !forcedOffline && forcedTrackerView === null);

  const isConnected = !forcedOffline && !healthQuery.isError;

  // Pedido ativo resolvido pela API real (com fallback para fixture se inspecionando sem API)
  const activeOrder: Order | null = useMemo(() => {
    if (forcedTrackerView !== null || selectedOrderId === null) {
      return null;
    }
    if (orderQuery.data) {
      return orderQuery.data;
    }
    return null;
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

  // Aplica regra de troca de pedido no chat (keep | divider | clear)
  const applyOrderSwitchToChat = useCallback(
    (prevOrderId: number | null, nextOrderId: number | null) => {
      if (!prevOrderId || !nextOrderId || prevOrderId === nextOrderId) {
        return;
      }
      setMessages((prev) => {
        if (prev.length === 0) return prev;
        if (chatOnSwitch === "clear") {
          return [];
        }
        if (chatOnSwitch === "divider") {
          const last = prev[prev.length - 1];
          if (last && last.role === "divider" && last.orderId === nextOrderId) {
            return prev;
          }
          return [...prev, { id: nextMsgId(), role: "divider", orderId: nextOrderId }];
        }
        return prev;
      });
    },
    [chatOnSwitch, nextMsgId],
  );

  // Busca um pedido pelo formulário ou pelos chips
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

      applyOrderSwitchToChat(selectedOrderId, parsed);
      setSelectedOrderId(parsed);
      syncUrlOrder(parsed);
    },
    [applyOrderSwitchToChat, selectedOrderId, syncUrlOrder],
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

  // Dispara resposta do assistente
  const deliverChatReply = useCallback(
    (questionText: string) => {
      if (chatTimerRef.current) {
        clearTimeout(chatTimerRef.current);
      }
      setTyping(true);

      chatTimerRef.current = setTimeout(async () => {
        if (forcedOffline) {
          setTyping(false);
          setMessages((prev) => {
            const copy = [...prev];
            for (let i = copy.length - 1; i >= 0; i -= 1) {
              const item = copy[i];
              if (item && item.role === "user") {
                copy[i] = { ...item, status: "failed" };
                break;
              }
            }
            return copy;
          });
          return;
        }

        const currentOrder =
          activeOrder ?? (selectedOrderId ? findFixtureOrder(selectedOrderId) : null);

        // Se o texto mencionar outro pedido e a API estiver online, tenta buscá-lo na API real
        let prefetchedOrder: Order | null = null;
        const numberMatch = questionText.match(/\d+/);
        const mentionedId = numberMatch ? parseOrderId(numberMatch[0]) : null;
        if (mentionedId !== null && mentionedId !== activeOrder?.orderId) {
          try {
            prefetchedOrder = await queryClient.fetchQuery({
              queryKey: ["orders", mentionedId],
              queryFn: () => getJson(`/orders/${mentionedId}`, orderSchema),
              retry: false,
            });
          } catch {
            prefetchedOrder = null;
          }
        }

        setTyping(false);

        const { reply, detectedOrderId } = buildAssistantReply({
          message: questionText,
          currentOrder,
          releaseLabel,
          resolveOrder: (id) => {
            if (activeOrder && activeOrder.orderId === id) return activeOrder;
            if (prefetchedOrder && prefetchedOrder.orderId === id) return prefetchedOrder;
            return findFixtureOrder(id);
          },
        });

        if (detectedOrderId !== null && detectedOrderId !== selectedOrderId) {
          applyOrderSwitchToChat(selectedOrderId, detectedOrderId);
          setForcedTrackerView(null);
          setSelectedOrderId(detectedOrderId);
          setQueryValue(String(detectedOrderId));
          setSubmittedQuery(String(detectedOrderId));
          syncUrlOrder(detectedOrderId);
        }

        setMessages((prev) => [
          ...prev,
          {
            id: nextMsgId(),
            role: "assistant",
            text: reply,
            time: nowTimeLabel(),
          },
        ]);
      }, 850);
    },
    [
      activeOrder,
      applyOrderSwitchToChat,
      forcedOffline,
      nextMsgId,
      queryClient,
      releaseLabel,
      selectedOrderId,
      syncUrlOrder,
    ],
  );

  const handleSendMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || typing) return;
      const userMsg: ChatMessageItem = {
        id: nextMsgId(),
        role: "user",
        text: trimmed,
        time: nowTimeLabel(),
        status: "sent",
      };
      setMessages((prev) => [...prev, userMsg]);
      deliverChatReply(trimmed);
    },
    [deliverChatReply, nextMsgId, typing],
  );

  const handleRetryMessage = useCallback(
    (id: number) => {
      if (typing) return;
      const target = messages.find((m) => m.id === id && m.role === "user");
      if (target?.role !== "user") return;

      setMessages((prev) => [
        ...prev.filter((m) => m.id !== id),
        {
          id: nextMsgId(),
          role: "user",
          text: target.text,
          time: nowTimeLabel(),
          status: "sent",
        },
      ]);
      deliverChatReply(target.text);
    },
    [deliverChatReply, messages, nextMsgId, typing],
  );

  const handleNewChat = useCallback(() => {
    if (chatTimerRef.current) {
      clearTimeout(chatTimerRef.current);
    }
    setTyping(false);
    setMessages([]);
  }, []);

  useEffect(() => {
    return () => {
      if (chatTimerRef.current) {
        clearTimeout(chatTimerRef.current);
      }
    };
  }, []);

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
          applyOrderSwitchToChat(selectedOrderId, id);
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
        if (chatTimerRef.current) {
          clearTimeout(chatTimerRef.current);
        }
        setTyping(false);
        if (val === "empty") {
          setMessages([]);
        } else {
          const targetId = selectedOrderId ?? 375;
          if (selectedOrderId === null) {
            setForcedTrackerView(null);
            setSelectedOrderId(375);
            setQueryValue("375");
            setSubmittedQuery("375");
            syncUrlOrder(375);
          }
          const orderObj = activeOrder ?? findFixtureOrder(targetId) ?? findFixtureOrder(375);
          if (!orderObj) return;

          if (val === "conversation") {
            setMessages(buildPresetConversation(orderObj, releaseLabel, true, nextMsgId));
          } else if (val === "typing") {
            const list = buildPresetConversation(orderObj, releaseLabel, false, nextMsgId);
            list.push({
              id: nextMsgId(),
              role: "user",
              text: "Por que meu pedido atrasou?",
              time: nowTimeLabel(),
              status: "sent",
            });
            setMessages(list);
            setTyping(true);
          } else if (val === "error") {
            const list = buildPresetConversation(orderObj, releaseLabel, false, nextMsgId);
            list.push({
              id: nextMsgId(),
              role: "user",
              text: "Por que meu pedido atrasou?",
              time: nowTimeLabel(),
              status: "failed",
            });
            setMessages(list);
          }
        }
      } else if (kind === "s") {
        if (val === "keep" || val === "divider" || val === "clear") {
          setChatOnSwitch(val);
        }
      } else if (kind === "r") {
        if (val === "waiting" || val === "payment") {
          setReleaseLabel(val);
          if (selectedOrderId !== 562 && selectedOrderId !== 16) {
            setForcedTrackerView(null);
            setSelectedOrderId(562);
            setQueryValue("562");
            setSubmittedQuery("562");
            syncUrlOrder(562);
          }
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
      activeOrder,
      applyOrderSwitchToChat,
      forcedTrackerView,
      nextMsgId,
      queryValue,
      releaseLabel,
      selectedOrderId,
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
