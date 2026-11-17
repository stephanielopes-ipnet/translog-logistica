import { errorResponseSchema } from "@translog/contracts";
import type { z } from "zod";

/** Falha padronizada numa chamada à API. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/** GET em `/api{path}` com validação Zod da resposta. */
export function getJson<Schema extends z.ZodType>(
  path: string,
  schema: Schema,
): Promise<z.output<Schema>> {
  return requestJson(path, { method: "GET" }, schema);
}

/** POST em `/api{path}` com corpo JSON e validação Zod da resposta. */
export function postJson<Schema extends z.ZodType>(
  path: string,
  body: unknown,
  schema: Schema,
): Promise<z.output<Schema>> {
  return requestJson(
    path,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    schema,
  );
}

/**
 * POST em `/api{path}` com corpo JSON, para rotas que respondem sem corpo (`204`, ex.: login e
 * logout). Erros viram `ApiError` como nas demais chamadas.
 */
export async function postNoContent(path: string, body: unknown): Promise<void> {
  await send(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * Chama a API e valida a resposta com o esquema do contrato. Toda falha vira `ApiError`:
 * rede (`status: 0`, `NETWORK_ERROR`), erro da API (código e mensagem do envelope padrão)
 * ou resposta fora do contrato (`INVALID_RESPONSE`).
 */
async function requestJson<Schema extends z.ZodType>(
  path: string,
  init: RequestInit,
  schema: Schema,
): Promise<z.output<Schema>> {
  const { response, body } = await send(path, init);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(
      response.status,
      "INVALID_RESPONSE",
      "O servidor respondeu em um formato inesperado.",
    );
  }
  return parsed.data;
}

/**
 * Faz a chamada e lê o corpo (quando houver). O cookie de sessão do colaborador (`HttpOnly`)
 * vai junto por ser a mesma origem: a tela nunca lê nem guarda o token.
 */
async function send(
  path: string,
  init: RequestInit,
): Promise<{ response: Response; body: unknown }> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...init,
      credentials: "same-origin",
      headers: { Accept: "application/json", ...init.headers },
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "Não foi possível conectar ao sistema.");
  }

  let body: unknown;
  try {
    body = response.status === 204 ? undefined : await response.json();
  } catch {
    body = undefined;
  }

  if (!response.ok) {
    const parsedError = errorResponseSchema.safeParse(body);
    if (parsedError.success) {
      throw new ApiError(
        response.status,
        parsedError.data.error.code,
        parsedError.data.error.message,
      );
    }
    throw new ApiError(
      response.status,
      "UNKNOWN_ERROR",
      "Ocorreu um erro inesperado. Tente novamente.",
    );
  }
  return { response, body };
}

/**
 * Política de retry para o TanStack Query: tenta mais uma vez apenas em falha
 * de rede ou erro 5xx; nunca repete 4xx (ex.: 404 ORDER_NOT_FOUND).
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  const retryable = error instanceof ApiError && (error.status === 0 || error.status >= 500);
  return retryable && failureCount < 1;
}
