import { ASSISTANT_NAME, type Order } from "@translog/contracts";
import { ChevronsRight, Info, MessageSquareText, RotateCcw, Tag } from "lucide-react";
import { ChatInput } from "./chat-input.tsx";
import { ChatMessages } from "./chat-messages.tsx";
import type { ChatMessageItem } from "./chat-session.ts";
import { LOGBOT_INPUT_ID, LOGBOT_PANEL_ID } from "./logbot-dock.tsx";

interface ChatPanelProps {
  activeOrder: Order | null;
  messages: readonly ChatMessageItem[];
  typing: boolean;
  onSendMessage: (text: string) => void;
  onRetryMessage: (id: number) => void;
  onNewChat: () => void;
  /** Minimiza o painel lateral (o painel desliza para a direita e deixa uma aba). */
  onMinimize: () => void;
}

export function ChatPanel({
  activeOrder,
  messages,
  typing,
  onSendMessage,
  onRetryMessage,
  onNewChat,
  onMinimize,
}: ChatPanelProps) {
  const canClearChat = messages.length > 0 || typing;

  return (
    <div className="h-full min-h-0 flex flex-col bg-surface border border-slate-300/90 rounded-lg shadow-sm overflow-hidden">
      {/* Cabeçalho do Assistente */}
      <div className="shrink-0 px-5 py-3.5 border-b border-slate-200 bg-slate-50/60 flex items-center gap-2">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-primary text-white grid place-items-center shadow-sm relative">
            <MessageSquareText className="w-4 h-4" />
            <span
              aria-hidden="true"
              className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-surface bg-accent"
            />
          </div>
          <div className="leading-tight min-w-0">
            <h2 className="text-sm font-semibold text-slate-900">{ASSISTANT_NAME}</h2>
            <p className="text-xs text-slate-500 mt-0.5 truncate">Pergunte sobre sua entrega</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onNewChat}
          disabled={!canClearChat}
          className="ml-auto shrink-0 whitespace-nowrap h-8 px-2.5 rounded border border-slate-300 bg-surface text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-45 disabled:hover:bg-surface disabled:cursor-not-allowed inline-flex items-center gap-1.5 transition"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Nova conversa
        </button>
        <button
          type="button"
          onClick={onMinimize}
          aria-expanded={true}
          aria-controls={LOGBOT_PANEL_ID}
          aria-label={`Minimizar a conversa com o ${ASSISTANT_NAME}`}
          title="Minimizar"
          className="-mr-1.5 w-8 h-8 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-200/60 grid place-items-center transition"
        >
          <ChevronsRight aria-hidden="true" className="w-4 h-4" />
        </button>
      </div>

      {/* Faixa de contexto do pedido ativo */}
      <div className="shrink-0">
        {activeOrder ? (
          <div className="px-5 py-2 border-b border-slate-200 bg-slate-100/70 flex items-center justify-between">
            <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-slate-600">
              <Tag className="w-3.5 h-3.5 text-primary" />
              <span>
                Falando sobre o pedido{" "}
                <strong className="text-slate-900 font-semibold tabular">
                  #{activeOrder.orderId}
                </strong>
              </span>
            </div>
            <span className="font-mono text-[11px] text-slate-500">{activeOrder.shippingMode}</span>
          </div>
        ) : (
          <div className="px-5 py-2 border-b border-slate-200 bg-slate-100/50 flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-slate-500">
            <Info className="w-3.5 h-3.5 text-slate-400" />
            <span>Nenhum pedido selecionado</span>
          </div>
        )}
      </div>

      {/* Lista de mensagens ou sugestões */}
      <ChatMessages
        activeOrder={activeOrder}
        messages={messages}
        typing={typing}
        onSelectSuggestion={onSendMessage}
        onRetryMessage={onRetryMessage}
      />

      {/* Input de mensagem */}
      <ChatInput
        id={LOGBOT_INPUT_ID}
        disabled={typing}
        hasOrder={activeOrder !== null}
        onSend={onSendMessage}
      />
    </div>
  );
}
