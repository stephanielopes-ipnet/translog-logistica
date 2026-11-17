import type { ShippingMode } from "@translog/contracts";

/**
 * Cenário "Promessa ajustada" da Gold (`param_cenario_prazo`): prazo de despacho sugerido, em
 * dias, por modalidade. Modalidade ausente = sem sugestão (o diagnóstico mostra `null`).
 */
export type PromiseScenario = ReadonlyMap<ShippingMode, number>;

/** Sem cenário carregado: nenhuma modalidade tem prazo sugerido. */
export const NO_PROMISE_SCENARIO: PromiseScenario = new Map();
