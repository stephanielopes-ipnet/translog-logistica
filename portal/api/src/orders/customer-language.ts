// Motivo provável em linguagem do cliente. Único lugar que traduz as causas da base
// (`causa_atraso_despacho`, `causa_atraso_entrega`) para a resposta pública e para o chat
// simulado. O colaborador continua vendo os termos da base. Na tela o rótulo segue sendo
// "Motivo provável": as frases são hipótese, nunca causa comprovada, e começam em minúscula
// para caber depois de "No despacho:" ou "o motivo provável é que".

/** Causa da base → frase para o cliente. */
export const CUSTOMER_CAUSES: Readonly<Record<string, string>> = {
  "Promessa irreal": "o prazo de despacho prometido para esta modalidade costuma ser curto demais",
  "Atraso operacional": "houve demora na preparação do envio",
  "Atraso no despacho não recuperado no transporte":
    "a demora na saída não foi compensada durante a viagem",
  "Volume sem atualização de rastreio": "seu pedido está sem novas atualizações de rastreio",
};

/**
 * Causa nova na base, ainda sem frase: o cliente recebe um texto genérico, nunca o termo
 * interno (que pode ser técnico ou constrangedor).
 */
export const GENERIC_CUSTOMER_CAUSE = "houve um imprevisto na operação logística";

/** Causa da base (ou `null`) → motivo provável em linguagem do cliente (ou `null`). */
export function customerCause(baseCause: string | null): string | null {
  if (baseCause === null) {
    return null;
  }
  return CUSTOMER_CAUSES[baseCause] ?? GENERIC_CUSTOMER_CAUSE;
}
