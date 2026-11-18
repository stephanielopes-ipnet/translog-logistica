import { createHmac, timingSafeEqual } from "node:crypto";

// Conteúdo do cookie de sessão: `<dados em base64url>.<assinatura HMAC-SHA256 em base64url>`.
// Sem banco de sessões: a assinatura com `SESSION_SECRET` garante que ninguém forjou ou mudou
// o e-mail e a validade. Feito com node:crypto para não depender de outro pacote.

export interface SessionData {
  email: string;
  /** Validade, em milissegundos desde 1970. */
  expiresAt: number;
}

function sign(payload: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(payload).digest();
}

export function createSessionToken(data: SessionData, secret: string): string {
  const payload = Buffer.from(JSON.stringify({ e: data.email, x: data.expiresAt })).toString(
    "base64url",
  );
  return `${payload}.${sign(payload, secret).toString("base64url")}`;
}

/** Dados da sessão, ou `null` se o token for inválido, adulterado ou vencido. */
export function readSessionToken(
  token: string | undefined,
  secret: string,
  now: number,
): SessionData | null {
  if (!token) {
    return null;
  }
  const [payload, signature, ...rest] = token.split(".");
  if (!payload || !signature || rest.length > 0) {
    return null;
  }
  const expected = sign(payload, secret);
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return null;
  }
  try {
    const data: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (
      typeof data === "object" &&
      data !== null &&
      "e" in data &&
      "x" in data &&
      typeof data.e === "string" &&
      typeof data.x === "number" &&
      data.x > now
    ) {
      return { email: data.e, expiresAt: data.x };
    }
  } catch {
    return null;
  }
  return null;
}
