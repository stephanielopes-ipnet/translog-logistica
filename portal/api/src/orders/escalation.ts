// Regra de encaminhamento para a central de atendimento (reunião de 16/11, FAQ da Stephanie).
// Única definição: a API calcula `escalateToSupport` aqui e a tela e o chat só leem o campo.
// O grupo ainda pode trocar ">= 3" por "> 3": mude só SUPPORT_MIN_DELAY_DAYS (e os testes).

/** Atraso de entrega, em dias, a partir do qual o pedido vai para a central. */
export const SUPPORT_MIN_DELAY_DAYS = 3;

/** Horário da central, para a tela e o chat. */
export const SUPPORT_HOURS = "segunda a sexta, das 9h às 18h";

export interface EscalationInput {
  /** Situação do pedido, como vem da base. */
  status: string;
  delivery: { delayDays: number | null };
}

/** Encaminhar à central: atraso de entrega de 3 dias ou mais, ou volume extraviado. */
export function shouldEscalateToSupport({ status, delivery }: EscalationInput): boolean {
  if (status === "Extraviado") {
    return true;
  }
  return delivery.delayDays !== null && delivery.delayDays >= SUPPORT_MIN_DELAY_DAYS;
}
