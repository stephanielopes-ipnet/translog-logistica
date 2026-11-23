import {
  type ChatResponse,
  chatRequestSchema,
  chatResponseSchema,
  errorResponseSchema,
} from "@translog/contracts";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { ChatService } from "./chat-service.ts";

export const chatRoutes: FastifyPluginAsyncZod<{ chatService: ChatService }> = async (
  app,
  { chatService },
) => {
  app.post(
    "/chat",
    {
      schema: {
        summary: "Envia uma pergunta ao assistente",
        description:
          "Envia a pergunta do cliente ao assistente (simulado ou agente de IA, conforme AGENT) e " +
          "devolve a resposta. A tela gera um sessionId (UUID) por conversa e manda o pedido " +
          "aberto em orderId. Se a mensagem citar um pedido existente, ele vira o contexto e volta " +
          "em mentionedOrderId. Uma mensagem por vez por conversa. O agente de IA pode levar " +
          "dezenas de segundos para responder.",
        tags: ["chat"],
        body: chatRequestSchema,
        response: {
          200: chatResponseSchema.describe("Resposta do assistente"),
          400: errorResponseSchema.describe(
            'Corpo inválido: "VALIDATION_ERROR" (sem sessionId, mensagem vazia ou longa demais...)',
          ),
          409: errorResponseSchema.describe(
            '"CHAT_BUSY": a conversa ainda espera a resposta da mensagem anterior',
          ),
          502: errorResponseSchema.describe(
            '"AGENT_UNAVAILABLE": o assistente falhou ou não devolveu uma resposta válida',
          ),
          504: errorResponseSchema.describe(
            '"AGENT_TIMEOUT": o assistente passou do limite de tempo (AGENT_TIMEOUT_MS)',
          ),
        },
      },
    },
    async (request): Promise<ChatResponse> => {
      const { sessionId, message, orderId } = request.body;
      const result = await chatService.send({ sessionId, message, orderId: orderId ?? null });
      return { sessionId, ...result };
    },
  );
};
