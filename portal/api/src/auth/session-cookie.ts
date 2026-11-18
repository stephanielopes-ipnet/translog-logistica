import type { FastifyReply, FastifyRequest } from "fastify";
import { SESSION_TTL_MS } from "./auth-service.ts";

/** Nome do cookie de sessão do colaborador. */
export const SESSION_COOKIE = "translog_session";

/** Valor do cookie de sessão na requisição, ou `undefined`. */
export function readSessionCookie(request: FastifyRequest): string | undefined {
  const header = request.headers.cookie;
  if (!header) {
    return undefined;
  }
  for (const part of header.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === SESSION_COOKIE) {
      return value.join("=");
    }
  }
  return undefined;
}

/**
 * Grava o cookie: `HttpOnly` (o navegador não deixa o JavaScript ler), `SameSite=Lax`,
 * `Path=/`, validade de 8 h e `Secure` em produção. `token = null` apaga o cookie.
 */
export function writeSessionCookie(reply: FastifyReply, token: string | null, secure: boolean) {
  const maxAge = token === null ? 0 : Math.floor(SESSION_TTL_MS / 1000);
  const attributes = [
    `${SESSION_COOKIE}=${token ?? ""}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${maxAge}`,
  ];
  if (secure) {
    attributes.push("Secure");
  }
  reply.header("set-cookie", attributes.join("; "));
}
