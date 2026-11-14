import type { ErrorResponse } from "@translog/contracts";
import type { FastifyInstance, FastifyReply, FastifySchemaValidationError } from "fastify";
import { hasZodFastifySchemaValidationErrors } from "fastify-type-provider-zod";

const clientErrorMessages: Record<number, string> = {
  400: "Requisição inválida.",
  405: "Método não permitido.",
  413: "O corpo da requisição é grande demais.",
  415: "Tipo de conteúdo não suportado.",
};

/**
 * Único lugar que transforma erros em resposta HTTP. Todo erro sai no formato
 * `{ error: { code, message } }`:
 * - validação Zod: `400 VALIDATION_ERROR`, citando os campos;
 * - outros 4xx do Fastify: mesmo status, `VALIDATION_ERROR` (400) ou `BAD_REQUEST`;
 * - qualquer outro erro: `500 INTERNAL_ERROR` genérico, com o detalhe só no log;
 * - rota inexistente: `404 NOT_FOUND`.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      return sendError(reply, 400, "VALIDATION_ERROR", validationMessage(error.validation));
    }

    const statusCode = statusCodeOf(error);
    if (statusCode >= 400 && statusCode < 500) {
      request.log.info({ err: error }, "Requisição rejeitada");
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
