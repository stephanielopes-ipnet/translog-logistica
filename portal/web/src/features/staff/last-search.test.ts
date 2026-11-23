import { afterEach, describe, expect, it } from "vitest";
import { forgetSearch, lastSearch, rememberSearch } from "./last-search.ts";

describe("última busca", () => {
  afterEach(forgetSearch);

  it("lembra a última busca aberta, para o 'Voltar à busca'", () => {
    expect(lastSearch()).toBeNull();
    rememberSearch("/colaborador/pedidos?q=769");
    rememberSearch("/colaborador/pedidos?status=Extraviado&page=3");
    expect(lastSearch()).toBe("/colaborador/pedidos?status=Extraviado&page=3");
  });
});
