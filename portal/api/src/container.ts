import type { FastifyBaseLogger } from "fastify";
import { type ChatService, createChatService } from "./chat/chat-service.ts";
import { createMockAgent } from "./chat/mock-agent.ts";
import type { SupportAgent } from "./chat/support-agent.ts";
import type { Config } from "./config.ts";
import { type LoadLogger, loadFileRepository } from "./orders/file-repository.ts";
import { createFixturesRepository } from "./orders/fixtures-repository.ts";
import type { OrderRepository } from "./orders/order-repository.ts";
import { createOrderService, type OrderService } from "./orders/order-service.ts";

/**
 * Dependências da aplicação. A escolha dos adapters (`DATA_SOURCE` e `AGENT`) acontece só aqui.
 */
export interface Container {
  config: Config;
  orderService: OrderService;
  chatService: ChatService;
}

/** Substituições usadas só nos testes (ex.: repositório que devolve campos a mais). */
export interface ContainerOverrides {
  orderRepository?: OrderRepository;
  /** Assistente controlado pelo teste (ex.: que demora ou falha). */
  supportAgent?: SupportAgent;
}

export interface ContainerOptions {
  /** Log da aplicação (o `app.log` do Fastify): carga dos pedidos e chat. */
  log: FastifyBaseLogger;
  overrides?: ContainerOverrides;
}

/** Monta as dependências. Fontes de dados lentas são carregadas aqui, antes de a API abrir a porta. */
export async function createContainer(
  config: Config,
  { log, overrides = {} }: ContainerOptions,
): Promise<Container> {
  const orders = overrides.orderRepository ?? (await createOrderRepository(config, log));
  const orderService = createOrderService({ orders, sampleOrderIds: config.sampleOrderIds });
  const agent = overrides.supportAgent ?? createSupportAgent(config, orderService);
  return {
    config,
    orderService,
    chatService: createChatService({
      agent,
      orders: orderService,
      log: log.child({ agent: config.agent }),
    }),
  };
}

function createSupportAgent(config: Config, orderService: OrderService): SupportAgent {
  switch (config.agent) {
    case "mock":
      return createMockAgent({ orders: orderService });
  }
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
