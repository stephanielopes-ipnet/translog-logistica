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

/**
 * GET em `/api{path}` com validação Zod da resposta.
 */
export async function getJson<Schema extends z.ZodType>(
  path: string,
  schema: Schema,
): Promise<z.output<Schema>> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "Não foi possível conectar ao sistema.");
  }

  let body: unknown;
  try {
    body = await response.json();
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
 * Política de retry para o TanStack Query: tenta mais uma vez apenas em falha
 * de rede ou erro 5xx; nunca repete 4xx (ex.: 404 ORDER_NOT_FOUND).
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  const retryable = error instanceof ApiError && (error.status === 0 || error.status >= 500);
  return retryable && failureCount < 1;
}
