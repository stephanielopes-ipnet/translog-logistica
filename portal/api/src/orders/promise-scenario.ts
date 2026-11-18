import type { ShippingMode } from "@translog/contracts";

/**
 * Cenário "Promessa ajustada" da Gold (`param_cenario_prazo`): prazo de despacho sugerido, em
 * dias, por modalidade. Modalidade ausente = sem sugestão (o diagnóstico mostra `null`).
 */
export type PromiseScenario = ReadonlyMap<ShippingMode, number>;

/** Sem cenário carregado: nenhuma modalidade tem prazo sugerido. */
export const NO_PROMISE_SCENARIO: PromiseScenario = new Map();

/**
 * Cenário "Promessa ajustada" da Gold (`workspace.gold.param_cenario_prazo`, linhas ativas),
 * copiado da tabela em 17/11/2026: First Class 2 dias, Same Day 1, Second Class 4, Standard 4.
 * Pendência: ler a tabela no modo `databricks` e exportá-la junto com os CSVs.
 */
export const ADJUSTED_PROMISE_SCENARIO: PromiseScenario = new Map([
  ["Standard Class", 4],
  ["Second Class", 4],
  ["First Class", 2],
  ["Same Day", 1],
]);
