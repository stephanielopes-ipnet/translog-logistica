import type { ChatMessageItem } from "@/features/chat/chat-session.ts";
import { chatTimeLabel } from "@/features/chat/chat-session.ts";

// Conversas de exemplo da barra de protótipo (`c=conversation|typing|error`), com textos fixos
// sobre o pedido 76902. Não são regra de resposta: quem responde de verdade é a API.

/** Pedido das conversas de exemplo; a barra abre esse pedido junto com a conversa. */
export const PRESET_ORDER_ID = 76902;

export type ChatPreset = "conversation" | "typing" | "error";

const WHEN_QUESTION = "Quando meu pedido chega?";
const WHEN_REPLY =
  "O pedido **#76902** está **Em trânsito**. A entrega estava prevista para **01/02/2018** e acumula **5 dias de atraso**. Agora: **Alfândega Jacarta (Indonésia)**.";
const WHY_QUESTION = "Por que meu pedido atrasou?";
const WHY_REPLY =
  "Motivo provável do atraso do pedido **#76902**: no despacho, **Promessa irreal**; na entrega, **Volume sem atualização de rastreio**. Este caso deve ser tratado pela central de atendimento (segunda a sexta, das 9h às 18h).";

/**
 * - `conversation`: duas perguntas respondidas;
 * - `typing`: a segunda pergunta enviada, à espera da resposta (quem liga o "digitando…" é a tela);
 * - `error`: a segunda pergunta não enviada.
 */
export function buildPresetConversation(
  preset: ChatPreset,
  nextId: () => number,
): ChatMessageItem[] {
  const items: ChatMessageItem[] = [
    { id: nextId(), role: "user", text: WHEN_QUESTION, time: chatTimeLabel(4), status: "sent" },
    { id: nextId(), role: "assistant", text: WHEN_REPLY, time: chatTimeLabel(4) },
  ];
  const time = chatTimeLabel(preset === "conversation" ? 2 : 0);
  items.push({
    id: nextId(),
    role: "user",
    text: WHY_QUESTION,
    time,
    status: preset === "error" ? "failed" : "sent",
  });
  if (preset === "conversation") {
    items.push({ id: nextId(), role: "assistant", text: WHY_REPLY, time });
  }
  return items;
}
