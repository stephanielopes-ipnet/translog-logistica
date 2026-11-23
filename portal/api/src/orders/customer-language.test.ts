import { describe, expect, it } from "vitest";
import { CUSTOMER_CAUSES, customerCause, GENERIC_CUSTOMER_CAUSE } from "./customer-language.ts";

describe("customerCause: motivo provável em linguagem do cliente", () => {
  it.each([
    [
      "Promessa irreal",
      "o prazo de despacho prometido para esta modalidade costuma ser curto demais",
    ],
    ["Atraso operacional", "houve demora na preparação do envio"],
    [
      "Atraso no despacho não recuperado no transporte",
      "a demora na saída não foi compensada durante a viagem",
    ],
    ["Volume sem atualização de rastreio", "seu pedido está sem novas atualizações de rastreio"],
  ])("%j → %j", (base, customer) => {
    expect(customerCause(base)).toBe(customer);
  });

  it("cobre as 4 causas da base (despacho e entrega), e só elas", () => {
    expect(Object.keys(CUSTOMER_CAUSES).sort()).toEqual([
      "Atraso no despacho não recuperado no transporte",
      "Atraso operacional",
      "Promessa irreal",
      "Volume sem atualização de rastreio",
    ]);
  });

  it("sem causa continua sem causa", () => {
    expect(customerCause(null)).toBeNull();
  });

  it("causa nova na base vira texto genérico, nunca o termo interno", () => {
    expect(customerCause("Greve no aeroporto")).toBe(GENERIC_CUSTOMER_CAUSE);
  });

  it("as frases não repetem os termos da base nem falam em cliente", () => {
    for (const phrase of [...Object.values(CUSTOMER_CAUSES), GENERIC_CUSTOMER_CAUSE]) {
      expect(phrase).not.toMatch(/irreal|operacional|volume|cliente|%/i);
      expect(phrase.charAt(0)).toBe(phrase.charAt(0).toLowerCase());
    }
  });
});
