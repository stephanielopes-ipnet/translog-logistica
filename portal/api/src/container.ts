import type { Config } from "./config.ts";
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

/** Monta as dependências. Fontes de dados lentas são carregadas aqui, antes de a API abrir a porta. */
export async function createContainer(
  config: Config,
  overrides: ContainerOverrides = {},
): Promise<Container> {
  const orders = overrides.orderRepository ?? (await createOrderRepository(config));
  return {
    config,
    orderService: createOrderService({ orders, sampleOrderIds: config.sampleOrderIds }),
  };
}

async function createOrderRepository(config: Config): Promise<OrderRepository> {
  switch (config.dataSource) {
    case "fixtures":
      return createFixturesRepository();
    case "file":
      throw new Error(
        "DATA_SOURCE=file ainda não está disponível: a leitura da Silver chega na próxima " +
          "etapa. Use DATA_SOURCE=fixtures (padrão).",
      );
  }
}
