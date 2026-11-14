import type { Order } from "@translog/contracts";
import { Info, MessageSquareText, RotateCcw, Tag } from "lucide-react";
import { ChatInput } from "./chat-input.tsx";
import { type ChatMessageItem, ChatMessages } from "./chat-messages.tsx";

interface ChatPanelProps {
  activeOrder: Order | null;
  messages: readonly ChatMessageItem[];
  typing: boolean;
  onSendMessage: (text: string) => void;
  onRetryMessage: (id: number) => void;
  onNewChat: () => void;
}

export function ChatPanel({
  activeOrder,
  messages,
  typing,
  onSendMessage,
  onRetryMessage,
  onNewChat,
}: ChatPanelProps) {
  return (
    <aside className="min-h-0 flex flex-col bg-white border border-slate-300/90 rounded-lg shadow-sm overflow-hidden">
      {/* Cabeçalho do Assistente */}
      <div className="shrink-0 px-5 py-3.5 border-b border-slate-200 bg-slate-50/60 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-primary text-white grid place-items-center shadow-sm relative">
            <MessageSquareText className="w-4 h-4" />
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-accent ring-2 ring-white" />
          </div>
          <div className="leading-tight">
            <h2 className="text-sm font-semibold text-slate-900">Assistente TransLog</h2>
            <p className="text-xs text-slate-500 mt-0.5">Pergunte sobre sua entrega</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onNewChat}
          className="h-8 px-2.5 rounded border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 inline-flex items-center gap-1.5 transition"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Nova conversa
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
        messages={messages}
        typing={typing}
        onSelectSuggestion={onSendMessage}
        onRetryMessage={onRetryMessage}
      />

      {/* Input de mensagem */}
      <ChatInput disabled={typing} onSend={onSendMessage} />
    </aside>
  );
}
