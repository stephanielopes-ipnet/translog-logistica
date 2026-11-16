import type { ChatMessageItem } from "@/features/chat/chat-session.ts";
import { chatTimeLabel } from "@/features/chat/chat-session.ts";

// Conversas de exemplo da barra de protótipo (`c=conversation|typing|error`), com textos fixos
// sobre o pedido 76902. Não são regra de resposta: quem responde de verdade é a API.

/** Pedido das conversas de exemplo; a barra abre esse pedido junto com a conversa. */
export const PRESET_ORDER_ID = 76902;

export type ChatPreset = "conversation" | "typing" | "error";

const WHEN_QUESTION = "Quando meu pedido chega?";
const WHEN_REPLY =
  "O pedido **#76902** está **em trânsito**. No momento, ele está em **Alfândega Jacarta (Indonésia)** (etapa Alfândega). A entrega estava prevista para **01/02/2018** e já soma **5 dias de atraso**. Sinto muito pela espera. Como a entrega já está 5 dias atrasada, este caso é acompanhado pela nossa **central de atendimento**, que funciona de **segunda a sexta, das 9h às 18h**.";
const WHY_QUESTION = "Por que meu pedido atrasou?";
const WHY_REPLY =
  "Sinto muito pelo atraso do pedido **#76902**. No despacho, que saiu 1 dia depois do prometido, o motivo provável é **Promessa irreal**: o prazo de despacho prometido pela modalidade provavelmente é curto demais para a nossa operação (First Class, 1 dia para despachar). Na entrega, o motivo provável é **Volume sem atualização de rastreio**: o volume está sem novas atualizações de rastreio desde o último registro. Como a entrega já está 5 dias atrasada, este caso é acompanhado pela nossa **central de atendimento**, que funciona de **segunda a sexta, das 9h às 18h**.";

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
