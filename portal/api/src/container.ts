import type { Config } from "./config.ts";
import { type LoadLogger, loadFileRepository } from "./orders/file-repository.ts";
import { createFixturesRepository } from "./orders/fixtures-repository.ts";
import type { OrderRepository } from "./orders/order-repository.ts";
import { createOrderService, type OrderService } from "./orders/order-service.ts";

/**
 * Dependências da aplicação. A escolha dos adapters (`DATA_SOURCE`) acontece só aqui.
 */
export interface Container {
  config: Config;
  orderService: OrderService;
}

/** Substituições usadas só nos testes (ex.: repositório que devolve campos a mais). */
export interface ContainerOverrides {
  orderRepository?: OrderRepository;
}

export interface ContainerOptions {
  /** Log da carga dos pedidos (o `app.log` do Fastify). */
  log: LoadLogger;
  overrides?: ContainerOverrides;
}

/** Monta as dependências. Fontes de dados lentas são carregadas aqui, antes de a API abrir a porta. */
export async function createContainer(
  config: Config,
  { log, overrides = {} }: ContainerOptions,
): Promise<Container> {
  const orders = overrides.orderRepository ?? (await createOrderRepository(config, log));
  return {
    config,
    orderService: createOrderService({ orders, sampleOrderIds: config.sampleOrderIds }),
  };
}

async function createOrderRepository(config: Config, log: LoadLogger): Promise<OrderRepository> {
  switch (config.dataSource) {
    case "fixtures":
      return createFixturesRepository();
    case "file":
      // O config.ts já recusa DATA_SOURCE=file sem ORDERS_FILE; isto só satisfaz o tipo.
      if (config.ordersFile === undefined) {
        throw new Error("ORDERS_FILE é obrigatória com DATA_SOURCE=file.");
      }
      return loadFileRepository(config.ordersFile, log);
  }
}
