import { DEMO_STAFF_EMAIL } from "@translog/contracts";
import { createLoginLimiter, type LoginLimiter } from "./login-limiter.ts";
import { DUMMY_PASSWORD_HASH, verifyPassword } from "./password.ts";
import { createSessionToken, readSessionToken, type SessionData } from "./session-token.ts";

/** E-mail ou senha errados (mesma resposta nos dois casos). Vira `401` em `http/errors.ts`. */
export class InvalidCredentialsError extends Error {
  constructor() {
    super("E-mail ou senha inválidos.");
    this.name = "InvalidCredentialsError";
  }
}

/** Tentativas demais do mesmo IP. Vira `429` em `http/errors.ts`. */
export class TooManyAttemptsError extends Error {
  constructor() {
    super("Muitas tentativas de login.");
    this.name = "TooManyAttemptsError";
  }
}

/** Sem sessão válida numa rota do colaborador. Vira `401` em `http/errors.ts`. */
export class UnauthenticatedError extends Error {
  constructor() {
    super("Sessão ausente ou expirada.");
    this.name = "UnauthenticatedError";
  }
}

/** Validade da sessão: 8 horas. */
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export interface AuthService {
  /** A entrada de demonstração está ligada (`AUTH_DEMO=true`). */
  readonly demoAvailable: boolean;
  /** Confere e-mail e senha; devolve o token do cookie. */
  login(email: string, password: string, ip: string): Promise<string>;
  /** Sessão do usuário de demonstração (só com `AUTH_DEMO=true`). */
  demoLogin(): string;
  /** Sessão do token do cookie, ou `null`. */
  session(token: string | undefined): SessionData | null;
}

export interface AuthServiceDeps {
  /** E-mail (minúsculo) → hash da senha (`STAFF_USERS`). */
  users: ReadonlyMap<string, string>;
  /** `SESSION_SECRET`; sem ele ninguém entra (login desligado). */
  secret: string | undefined;
  demo: boolean;
  now?: () => number;
  limiter?: LoginLimiter;
}

export function createAuthService({
  users,
  secret,
  demo,
  now = Date.now,
  limiter = createLoginLimiter({ maxFailures: 5, windowMs: 60_000, now }),
}: AuthServiceDeps): AuthService {
  function issue(email: string): string {
    if (secret === undefined) {
      throw new InvalidCredentialsError();
    }
    return createSessionToken({ email, expiresAt: now() + SESSION_TTL_MS }, secret);
  }

  return {
    demoAvailable: demo && secret !== undefined,

    async login(email, password, ip) {
      if (limiter.isBlocked(ip)) {
        throw new TooManyAttemptsError();
      }
      const normalized = email.trim().toLowerCase();
      const stored = users.get(normalized);
      // Mesmo trabalho com e-mail inexistente, para o tempo não revelar quem existe.
      const valid = await verifyPassword(password, stored ?? DUMMY_PASSWORD_HASH);
      if (!stored || !valid || secret === undefined) {
        limiter.recordFailure(ip);
        throw new InvalidCredentialsError();
      }
      limiter.reset(ip);
      return issue(normalized);
    },

    demoLogin: () => issue(DEMO_STAFF_EMAIL),

    session: (token) => (secret === undefined ? null : readSessionToken(token, secret, now())),
  };
}
