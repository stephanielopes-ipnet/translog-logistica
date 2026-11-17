import type { ErrorResponse } from "@translog/contracts";
import type { FastifyInstance, FastifyReply, FastifySchemaValidationError } from "fastify";
import { hasZodFastifySchemaValidationErrors } from "fastify-type-provider-zod";
import { ChatBusyError } from "../chat/chat-service.ts";
import { AgentTimeoutError, AgentUnavailableError } from "../chat/support-agent.ts";
import { OrderNotFoundError } from "../orders/order-service.ts";

const ORDER_NOT_FOUND_MESSAGE = "Pedido não encontrado. Confira o número e tente novamente.";
const CHAT_BUSY_MESSAGE = "Aguarde a resposta anterior antes de enviar outra mensagem.";
const AGENT_UNAVAILABLE_MESSAGE =
  "O assistente está indisponível no momento. Tente novamente em instantes.";
const AGENT_TIMEOUT_MESSAGE = "O assistente demorou demais para responder. Tente novamente.";

const clientErrorMessages: Record<number, string> = {
  400: "Requisição inválida.",
  405: "Método não permitido.",
  413: "O corpo da requisição é grande demais.",
  415: "Tipo de conteúdo não suportado.",
};

/**
 * Único lugar que transforma erros em resposta HTTP. Todo erro sai no formato
 * `{ error: { code, message } }`:
 * - erros de domínio: `OrderNotFoundError` → `404 ORDER_NOT_FOUND`, `ChatBusyError` →
 *   `409 CHAT_BUSY`, `AgentUnavailableError` → `502 AGENT_UNAVAILABLE`, `AgentTimeoutError` →
 *   `504 AGENT_TIMEOUT` (o chat-service já registrou o motivo técnico no log);
 * - validação Zod: `400 VALIDATION_ERROR`, citando os campos;
 * - outros 4xx do Fastify: mesmo status, `VALIDATION_ERROR` (400) ou `BAD_REQUEST`;
 * - qualquer outro erro: `500 INTERNAL_ERROR` genérico, com o detalhe só no log;
 * - rota inexistente: `404 NOT_FOUND`.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof OrderNotFoundError) {
      return sendError(reply, 404, "ORDER_NOT_FOUND", ORDER_NOT_FOUND_MESSAGE);
    }
    if (error instanceof ChatBusyError) {
      return sendError(reply, 409, "CHAT_BUSY", CHAT_BUSY_MESSAGE);
    }
    if (error instanceof AgentUnavailableError) {
      return sendError(reply, 502, "AGENT_UNAVAILABLE", AGENT_UNAVAILABLE_MESSAGE);
    }
    if (error instanceof AgentTimeoutError) {
      return sendError(reply, 504, "AGENT_TIMEOUT", AGENT_TIMEOUT_MESSAGE);
    }

    if (hasZodFastifySchemaValidationErrors(error)) {
      return sendError(reply, 400, "VALIDATION_ERROR", validationMessage(error.validation));
    }

    const statusCode = statusCodeOf(error);
    if (statusCode >= 400 && statusCode < 500) {
      // Sem o erro inteiro: a mensagem de JSON malformado traz um trecho do corpo enviado.
      request.log.info({ statusCode, code: errorCodeOf(error) }, "Requisição rejeitada");
      return sendError(
        reply,
        statusCode,
        statusCode === 400 ? "VALIDATION_ERROR" : "BAD_REQUEST",
        clientErrorMessages[statusCode] ?? "Não foi possível processar a requisição.",
      );
    }

    request.log.error({ err: error }, "Erro inesperado");
    return sendError(reply, 500, "INTERNAL_ERROR", "Ocorreu um erro inesperado. Tente novamente.");
  });

  app.setNotFoundHandler((_request, reply) =>
    sendError(reply, 404, "NOT_FOUND", "Recurso não encontrado."),
  );
}

/** Status HTTP de erros do Fastify (ex.: JSON malformado = 400); 500 nos demais. */
function statusCodeOf(error: unknown): number {
  if (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof error.statusCode === "number"
  ) {
    return error.statusCode;
  }
  return 500;
}

/** Código interno do Fastify (ex.: FST_ERR_CTP_INVALID_MEDIA_TYPE), se houver. */
function errorCodeOf(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    return typeof error.code === "string" ? error.code : undefined;
  }
  return undefined;
}

function sendError(reply: FastifyReply, statusCode: number, code: string, message: string) {
  const body: ErrorResponse = { error: { code, message } };
  return reply.status(statusCode).send(body);
}

/** Ex.: "Requisição inválida: orderId: deve ser um número inteiro positivo de até 10 dígitos." */
function validationMessage(issues: FastifySchemaValidationError[]): string {
  const details = issues.map((issue) => {
    const field = issue.instancePath.slice(1).replaceAll("/", ".");
    return field ? `${field}: ${issue.message}` : issue.message;
  });
  return `Requisição inválida: ${details.join("; ")}.`;
}
