import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { type HealthResponse, healthResponseSchema } from "@translog/contracts";
import Fastify, { type FastifyServerOptions } from "fastify";
import {
  type FastifyPluginAsyncZod,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { z } from "zod";
import type { Config } from "./config.ts";
import { type Container, type ContainerOverrides, createContainer } from "./container.ts";
import { registerErrorHandler } from "./http/errors.ts";
import { orderRoutes } from "./orders/routes.ts";

// Mensagens de validação do Zod em pt-BR (aparecem nos erros VALIDATION_ERROR).
z.config(z.locales.ptBR());

export interface ServerOptions {
  /** Liga o log do Fastify (padrão: ligado). Os testes usam `false`. */
  logger?: boolean;
  /** Substituições do container, só para testes. */
  overrides?: ContainerOverrides;
}

/**
 * Cria o Fastify com validação Zod, documentação em /docs e as rotas em /api.
 * Monta o container (e carrega os pedidos) antes de registrar as rotas: quando esta
 * função retorna, a API está pronta para responder. Não abre porta: quem chama
 * `listen` é o main.ts, e os testes usam `inject`.
 */
export async function buildServer(config: Config, options: ServerOptions = {}) {
  const logger = options.logger === false ? false : loggerOptions(config);
  const app = Fastify({ logger }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerErrorHandler(app);

  await app.register(swagger, {
    openapi: {
      info: {
        title: "TransLog — Portal de Rastreamento",
        description:
          "API do portal de rastreamento da TransLog, operadora logística internacional que " +
          "despacha pedidos de e-commerce a partir dos EUA e de Porto Rico para cinco mercados " +
          "(América do Norte, América Latina, Europa, Ásia-Pacífico e África). O cliente consulta " +
          "o pedido pelo número e vê a situação, o prazo, a rota e os itens. Nenhuma resposta " +
          "traz dados do cliente, de pagamento ou financeiros internos.",
        version: "0.1.0",
      },
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });

  const container = await createContainer(config, options.overrides);
  await app.register(healthRoutes, { prefix: "/api", container });
  await app.register(orderRoutes, { prefix: "/api", orderService: container.orderService });

  return app;
}

const healthRoutes: FastifyPluginAsyncZod<{ container: Container }> = async (
  app,
  { container },
) => {
  app.get(
    "/health",
    {
      schema: {
        summary: "Verifica se a API está pronta",
        description:
          "Responde só depois de os pedidos terem sido carregados. Informa a origem dos dados " +
          "e quantos pedidos estão disponíveis.",
        tags: ["sistema"],
        response: { 200: healthResponseSchema },
      },
    },
    async (): Promise<HealthResponse> => ({
      status: "ok",
      dataSource: container.config.dataSource,
      orders: await container.orderService.count(),
    }),
  );
};

/** Log legível em desenvolvimento (pino-pretty) e JSON em produção. */
function loggerOptions(config: Config): FastifyServerOptions["logger"] {
  if (config.nodeEnv === "production") {
    return true;
  }
  return {
    transport: {
      target: "pino-pretty",
      options: { translateTime: "SYS:HH:MM:ss", ignore: "pid,hostname" },
    },
  };
}
