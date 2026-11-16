import { ASSISTANT_NAME, type Order } from "@translog/contracts";
import { ArrowUpRight, CircleAlert, MessageCircleQuestion } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils.ts";
import type { ChatMessageItem } from "./chat-session.ts";
import { getChatSuggestions } from "./chat-suggestions.ts";
import { parseRichText, type RichLine, type RichSegment } from "./rich-text.ts";

function RichSegments({ segments }: { segments: readonly RichSegment[] }) {
  return segments.map((segment, index) =>
    segment.bold ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: os trechos de uma linha nunca mudam de ordem
      <strong key={index} className="font-semibold text-slate-900">
        {segment.text}
      </strong>
    ) : (
      // biome-ignore lint/suspicious/noArrayIndexKey: os trechos de uma linha nunca mudam de ordem
      <span key={index}>{segment.text}</span>
    ),
  );
}

function RichLineView({ line }: { line: RichLine }) {
  switch (line.kind) {
    case "blank":
      return <div className="h-2" />;
    case "heading":
      return (
        <p className="font-semibold text-slate-900 mt-1 first:mt-0">
          <RichSegments segments={line.segments} />
        </p>
      );
    case "bullet":
      return (
        <div className={cn("flex gap-2", line.level === 1 && "pl-4", line.level === 2 && "pl-8")}>
          <span aria-hidden="true" className="text-primary">
            •
          </span>
          <span className="min-w-0">
            <RichSegments segments={line.segments} />
          </span>
        </div>
      );
    case "text":
      return (
        <p>
          <RichSegments segments={line.segments} />
        </p>
      );
  }
}

/** Mostra **negrito**, títulos e listas da resposta como elementos React (sem HTML). */
function RichText({ text }: { text: string }) {
  return parseRichText(text).map((line, index) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: as linhas de uma mensagem nunca mudam de ordem
    <RichLineView key={index} line={line} />
  ));
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
          {activeOrder ? (
            <>
              <p className="mt-3 text-sm font-semibold text-slate-900">
                Como posso ajudar com o pedido #{activeOrder.orderId}?
              </p>
              <p className="mt-1 text-xs text-slate-500 max-w-[260px] mx-auto">
                Pergunte onde ele está, quando chega ou o motivo provável de um atraso.
              </p>
            </>
          ) : (
            <>
              <p className="mt-3 text-sm font-semibold text-slate-900">
                Olá! {ASSISTANT_NAME} por aqui.
              </p>
              <p className="mt-1 text-xs text-slate-500 max-w-[260px] mx-auto">
                Para começar, informe o número do seu pedido aqui na conversa ou no campo ao lado.
              </p>
            </>
          )}
        </div>

        <div className="space-y-2">
          <p className="label-mono px-1">
            {activeOrder ? `Sugestões para #${activeOrder.orderId}` : "Para começar"}
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
                    {msg.failureLabel ?? "Não enviada"}
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
                <span className="label-mono !text-primary font-semibold">{ASSISTANT_NAME}</span>
              </div>
              <div className="border-l-2 border-primary bg-slate-50/90 rounded-r-md px-3.5 py-2.5 text-sm leading-relaxed text-slate-800 break-words border-y border-r border-y-slate-200/80 border-r-slate-200/80">
                <RichText text={msg.text} />
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
              <span className="label-mono !text-primary font-semibold">{ASSISTANT_NAME}</span>
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
