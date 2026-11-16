import type { FastifyBaseLogger } from "fastify";
import { createAdkAgent } from "./chat/adk-agent.ts";
import { type ChatLogger, type ChatService, createChatService } from "./chat/chat-service.ts";
import { createMockAgent } from "./chat/mock-agent.ts";
import type { SupportAgent } from "./chat/support-agent.ts";
import type { Config } from "./config.ts";
import { loadDatabricksRepository } from "./orders/databricks-repository.ts";
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
  const chatLog = log.child({ agent: config.agent });
  const agent = overrides.supportAgent ?? createSupportAgent(config, orderService, chatLog);
  return {
    config,
    orderService,
    chatService: createChatService({ agent, orders: orderService, log: chatLog }),
  };
}

function createSupportAgent(
  config: Config,
  orderService: OrderService,
  log: ChatLogger,
): SupportAgent {
  switch (config.agent) {
    case "mock":
      return createMockAgent({ orders: orderService });
    case "adk":
      // O config.ts já recusa AGENT=adk sem AGENT_URL; isto só satisfaz o tipo.
      if (config.agentUrl === undefined) {
        throw new Error("AGENT_URL é obrigatória com AGENT=adk.");
      }
      return createAdkAgent({
        url: config.agentUrl,
        appName: config.agentAppName,
        timeoutMs: config.agentTimeoutMs,
        log,
      });
  }
}

async function createOrderRepository(config: Config, log: LoadLogger): Promise<OrderRepository> {
  switch (config.dataSource) {
    case "fixtures":
      return createFixturesRepository();
    case "file":
      return loadFileRepository(config.dataDir, log);
    case "databricks":
      // O config.ts já recusa DATA_SOURCE=databricks sem host, warehouse e token.
      if (config.databricks === undefined) {
        throw new Error(
          "DATABRICKS_HOST, DATABRICKS_WAREHOUSE_ID e DATABRICKS_TOKEN são obrigatórias.",
        );
      }
      return loadDatabricksRepository(config.databricks, log);
  }
}
