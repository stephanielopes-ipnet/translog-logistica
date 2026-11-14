import type { Config } from "./config.ts";

/**
 * Dependências da aplicação. A escolha dos adapters (`DATA_SOURCE`) acontece só aqui.
 */
export interface Container {
  config: Config;
  /** Quantos pedidos a fonte carregou. A fonte de pedidos chega na tarefa 2; até lá, nenhum. */
  orderCount: number;
}

/** Monta as dependências. Fontes de dados lentas são carregadas aqui, antes de a API abrir a porta. */
export async function createContainer(config: Config): Promise<Container> {
  return { config, orderCount: 0 };
}
