import { z } from "zod";
import { orderIdSchema } from "./orders.ts";

/** Tamanho máximo da mensagem do cliente, sem contar os espaços das pontas. */
export const CHAT_MESSAGE_MAX_LENGTH = 1000;

const messageError = `deve ter entre 1 e ${CHAT_MESSAGE_MAX_LENGTH} caracteres`;

/** Qual assistente responde o chat (`AGENT`). */
export const agentModeSchema = z
  .enum(["mock", "adk"])
  .describe("Assistente do chat: mock (respostas simuladas) ou adk (agente de IA do Google ADK)");
export type AgentMode = z.infer<typeof agentModeSchema>;

/** Identificador da conversa, gerado pela tela a cada conversa nova. */
export const chatSessionIdSchema = z
  .uuid({ error: "deve ser um UUID" })
  .describe("Identificador da conversa (UUID), gerado pela tela a cada conversa nova");

/** Corpo de `POST /api/chat`. */
export const chatRequestSchema = z
  .object({
    sessionId: chatSessionIdSchema,
    message: z
      .string({ error: messageError })
      .trim()
      .min(1, { error: messageError })
      .max(CHAT_MESSAGE_MAX_LENGTH, { error: messageError })
      .describe(
        `Pergunta do cliente; os espaços das pontas são removidos antes de medir (1 a ${CHAT_MESSAGE_MAX_LENGTH} caracteres)`,
      ),
    orderId: orderIdSchema
      .nullish()
      .describe("Pedido aberto na tela, se houver; pedido inexistente é ignorado"),
  })
  .meta({
    example: {
      sessionId: "3f2b8c1e-7a4d-4e5f-9b6a-1c2d3e4f5a6b",
      message: "Por que o pedido #375 atrasou?",
      orderId: 375,
    },
  });
export type ChatRequest = z.infer<typeof chatRequestSchema>;

/** Resposta de `POST /api/chat`. */
export const chatResponseSchema = z.object({
  sessionId: chatSessionIdSchema,
  reply: z
    .string()
    .min(1)
    .describe("Resposta do assistente; pode ter **negrito** e quebras de linha (\\n)"),
  mentionedOrderId: orderIdSchema
    .nullable()
    .describe("Pedido existente citado na mensagem do cliente, para a tela abrir; null se nenhum"),
});
export type ChatResponse = z.infer<typeof chatResponseSchema>;
