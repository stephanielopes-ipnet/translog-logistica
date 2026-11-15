import type { Order } from "@translog/contracts";
import { ArrowUpRight, CircleAlert, MessageCircleQuestion } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import { getChatSuggestions } from "./mock-chat-service.ts";

export type ChatMessageItem =
  | {
      id: number;
      role: "user";
      text: string;
      time: string;
      status: "sent" | "failed";
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

/** Renderiza `**negrito**` e quebras de linha em React sem usar `dangerouslySetInnerHTML`. */
function renderRichText(text: string): ReactNode {
  const lines = text.split("\n");
  let lineOffset = 0;
  return lines.map((line) => {
    const currentLineOffset = lineOffset;
    lineOffset += line.length + 1;
    const segments = line.split(/(\*\*.+?\*\*)/g);
    let segOffset = 0;
    return (
      <span key={`line-${currentLineOffset}`}>
        {currentLineOffset > 0 && <br />}
        {segments.map((segment) => {
          const currentSegOffset = segOffset;
          segOffset += segment.length;
          if (segment.startsWith("**") && segment.endsWith("**") && segment.length > 4) {
            return (
              <strong
                key={`seg-${currentLineOffset}-${currentSegOffset}`}
                className="font-semibold text-slate-900"
              >
                {segment.slice(2, -2)}
              </strong>
            );
          }
          return <span key={`seg-${currentLineOffset}-${currentSegOffset}`}>{segment}</span>;
        })}
      </span>
    );
  });
}

interface ChatMessagesProps {
  activeOrder: Order | null;
  messages: readonly ChatMessageItem[];
  typing: boolean;
  onSelectSuggestion: (text: string) => void;
  onRetryMessage: (id: number) => void;
}

export function ChatMessages({
  activeOrder,
  messages,
  typing,
  onSelectSuggestion,
  onRetryMessage,
}: ChatMessagesProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const suggestions = getChatSuggestions(activeOrder);

  useEffect(() => {
    const el = containerRef.current;
    if (el && (messages.length > 0 || typing)) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, typing]);

  if (messages.length === 0 && !typing) {
    return (
      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-y-auto scroll-thin px-5 py-4 flex flex-col justify-center fade-in"
      >
        <div className="text-center mb-5">
          <div className="mx-auto w-11 h-11 rounded-md bg-primary-50 border border-primary-100 text-primary grid place-items-center">
            <MessageCircleQuestion className="w-5 h-5" />
          </div>
          <p className="mt-3 text-sm font-semibold text-slate-900">
            Como posso ajudar com sua remessa?
          </p>
          <p className="mt-1 text-xs text-slate-500 max-w-[260px] mx-auto">
            Consulte prazos, entenda o motivo provável de um atraso ou tire dúvidas sobre
            modalidades.
          </p>
        </div>

        <div className="space-y-2">
          <p className="label-mono px-1">
            {activeOrder ? `Sugestões para #${activeOrder.orderId}` : "Perguntas frequentes"}
          </p>
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => onSelectSuggestion(suggestion)}
              className="group w-full flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50/60 px-3.5 py-2.5 text-left text-sm text-slate-700 hover:border-primary hover:bg-primary-50/50 hover:text-primary transition"
            >
              <span>{suggestion}</span>
              <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-primary shrink-0" />
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 min-h-0 overflow-y-auto scroll-thin px-5 py-4">
      <div className="space-y-4">
        {messages.map((msg) => {
          if (msg.role === "divider") {
            return (
              <div key={msg.id} className="flex items-center gap-3 py-1 fade-in">
                <div className="flex-1 perf-t" />
                <span className="font-mono text-[10.5px] uppercase tracking-wider text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                  Alternado para o pedido #{msg.orderId}
                </span>
                <div className="flex-1 perf-t" />
              </div>
            );
          }

          if (msg.role === "user") {
            const isFailed = msg.status === "failed";
            return (
              <div key={msg.id} className="flex flex-col items-end fade-in">
                <div
                  className={`max-w-[85%] rounded-md px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words ${
                    isFailed ? "bg-primary/60 text-white" : "bg-primary text-white shadow-sm"
                  }`}
                >
                  {msg.text}
                </div>
                {isFailed ? (
                  <span className="mt-1 flex items-center gap-1 font-mono text-[11px] text-red-600">
                    <CircleAlert className="w-3 h-3" />
                    Não enviada
                    <span className="text-red-300">·</span>
                    <button
                      type="button"
                      onClick={() => onRetryMessage(msg.id)}
                      className="font-sans font-semibold hover:underline underline-offset-2"
                    >
                      Tentar novamente
                    </button>
                  </span>
                ) : (
                  <span className="mt-1 font-mono text-[10.5px] text-slate-400 tabular">
                    {msg.time}
                  </span>
                )}
              </div>
            );
          }

          return (
            <div key={msg.id} className="max-w-[92%] fade-in">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                <span className="label-mono !text-primary font-semibold">Assistente TransLog</span>
              </div>
              <div className="border-l-2 border-primary bg-slate-50/90 rounded-r-md px-3.5 py-2.5 text-sm leading-relaxed text-slate-800 break-words border-y border-r border-y-slate-200/80 border-r-slate-200/80">
                {renderRichText(msg.text)}
              </div>
              <span className="mt-1 block font-mono text-[10.5px] text-slate-400 tabular">
                {msg.time}
              </span>
            </div>
          );
        })}

        {typing && (
          <div className="max-w-[85%] fade-in">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              <span className="label-mono !text-primary font-semibold">Assistente TransLog</span>
            </div>
            <div className="border-l-2 border-primary bg-slate-50 px-3.5 py-2.5 rounded-r-md border-y border-r border-slate-200 inline-flex items-center gap-2.5">
              <span className="typing">
                <span />
                <span />
                <span />
              </span>
              <span className="font-mono text-xs text-slate-500">digitando…</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
