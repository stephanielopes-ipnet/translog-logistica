import type { Order } from "@translog/contracts";
import { extractFinalText } from "./adk-events.ts";
import {
  AgentTimeoutError,
  AgentUnavailableError,
  type SupportAgent,
  type SupportAgentInput,
} from "./support-agent.ts";

// Adapter do agente de IA do Marco (Google ADK), pela API nativa dele
// (`agent/docs/api-chat.md`): criar a sessão e depois `POST /run`. Não existe `/chat` no agente.
// Só `fetch` nativo. A chave do Gemini fica no processo do agente; o portal nunca a vê.

/** Sessão sem uso por mais tempo que isto é esquecida (e recriada se a conversa voltar). */
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
/** Máximo de sessões lembradas; acima disso, as usadas há mais tempo são esquecidas. */
const MAX_SESSIONS = 1000;

/**
 * Coloca o pedido de contexto dentro do texto, porque o agente não recebe o número do pedido em
 * campo separado (ele procura o número na mensagem).
 *
 * FORMATO PROVISÓRIO: ainda depende do acordo com o Marco (pendencias.md, seção "Marco (IA)").
 * É o único ponto do portal que conhece esse formato; se mudar, só esta função muda.
 */
export function withOrderContext(message: string, order: Order | null): string {
  return order === null ? message : `[Pedido aberto no portal: ${order.orderId}] ${message}`;
}

export interface AdkAgentLogger {
  info(details: object, message: string): void;
}

export interface AdkAgentOptions {
  /** Endereço do agente, sem barra no fim (ex.: http://127.0.0.1:8001). */
  url: string;
  /** Nome do app no ADK (ex.: translog_agent). */
  appName: string;
  /** Limite por resposta, incluindo a criação da sessão e o reenvio após `404`. */
  timeoutMs: number;
  log: AdkAgentLogger;
  /** Relógio e limites da memória de sessões; só os testes mudam. */
  now?: () => number;
  sessionTtlMs?: number;
  maxSessions?: number;
}

/**
 * - `userId` gerado aqui (`portal-<sessionId>`), nunca vindo do navegador;
 * - a sessão ADK é criada na primeira mensagem de cada `sessionId` (`409` "already exists" = ok)
 *   e lembrada por 2 h sem uso (no máximo 1.000);
 * - `404` "Session not found" no `/run` (o agente reiniciou e perdeu as sessões, que ficam em
 *   memória): recria a sessão e reenvia **uma vez**. É seguro porque a mensagem comprovadamente
 *   não foi processada. Nenhum outro reenvio automático;
 * - tempo esgotado → `AgentTimeoutError`; HTTP de erro, JSON inválido ou sem resposta final
 *   válida → `AgentUnavailableError`. Os motivos nunca trazem o texto do cliente nem corpo HTTP.
 */
export function createAdkAgent(options: AdkAgentOptions): SupportAgent {
  const { url, appName, timeoutMs, log } = options;
  const sessions = createSessionMemory({
    now: options.now ?? Date.now,
    ttlMs: options.sessionTtlMs ?? SESSION_TTL_MS,
    maxSessions: options.maxSessions ?? MAX_SESSIONS,
  });

  async function post(label: string, path: string, body: unknown, signal: AbortSignal) {
    try {
      return await fetch(`${url}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
        signal,
      });
    } catch (error) {
      if (signal.aborted) {
        throw new AgentTimeoutError(`sem resposta do agente em ${timeoutMs} ms (${label})`);
      }
      throw new AgentUnavailableError(
        `falha de conexão com o agente (${label}${connectionCode(error)})`,
        { cause: error },
      );
    }
  }

  async function readJson(response: Response, label: string, signal: AbortSignal) {
    try {
      return (await response.json()) as unknown;
    } catch {
      if (signal.aborted) {
        throw new AgentTimeoutError(`sem resposta do agente em ${timeoutMs} ms (${label})`);
      }
      throw new AgentUnavailableError(`JSON inválido na resposta do agente (${label})`);
    }
  }

  async function createSession(userId: string, sessionId: string, signal: AbortSignal) {
    const label = "criar sessão";
    const path = `/apps/${encodeURIComponent(appName)}/users/${userId}/sessions/${sessionId}`;
    const response = await post(label, path, {}, signal);
    await response.body?.cancel();
    // 409: a sessão já existe no agente (ex.: a memória daqui expirou e a conversa voltou).
    if (!response.ok && response.status !== 409) {
      throw new AgentUnavailableError(`HTTP ${response.status} ao ${label}`);
    }
  }

  function run(userId: string, sessionId: string, text: string, signal: AbortSignal) {
    return post(
      "POST /run",
      "/run",
      { appName, userId, sessionId, newMessage: { role: "user", parts: [{ text }] } },
      signal,
    );
  }

  return {
    async reply({ sessionId, message, order }: SupportAgentInput) {
      const signal = AbortSignal.timeout(timeoutMs);
      const userId = `portal-${sessionId}`;
      const text = withOrderContext(message, order);

      if (!sessions.has(sessionId)) {
        await createSession(userId, sessionId, signal);
      }
      sessions.touch(sessionId);

      let response = await run(userId, sessionId, text, signal);
      if (response.status === 404) {
        const body = await readJson(response, "POST /run", signal);
        if (!isSessionNotFound(body)) {
          throw new AgentUnavailableError("HTTP 404 em POST /run");
        }
        log.info({ sessionId }, "Sessão perdida no agente (reiniciou?); recriando e reenviando");
        await createSession(userId, sessionId, signal);
        response = await run(userId, sessionId, text, signal);
      }

      if (!response.ok) {
        await response.body?.cancel();
        throw new AgentUnavailableError(`HTTP ${response.status} em POST /run`);
      }
      return extractFinalText(await readJson(response, "POST /run", signal));
    },
  };
}

/** `{"detail":"Session not found: ..."}`, resposta do ADK para sessão inexistente. */
function isSessionNotFound(body: unknown): boolean {
  return (
    typeof body === "object" &&
    body !== null &&
    "detail" in body &&
    typeof body.detail === "string" &&
    body.detail.startsWith("Session not found")
  );
}

/** Código da falha de rede (ex.: ", ECONNREFUSED"), sem mais detalhes. */
function connectionCode(error: unknown): string {
  const cause = error instanceof Error ? error.cause : undefined;
  if (typeof cause === "object" && cause !== null && "code" in cause) {
    return typeof cause.code === "string" ? `, ${cause.code}` : "";
  }
  return "";
}

interface SessionMemoryOptions {
  now: () => number;
  ttlMs: number;
  maxSessions: number;
}

/**
 * Sessões já criadas no agente, com o instante do último uso. O `Map` mantém a ordem de
 * inserção e cada uso reinsere a sessão no fim, então as primeiras são as usadas há mais tempo.
 */
function createSessionMemory({ now, ttlMs, maxSessions }: SessionMemoryOptions) {
  const lastUsed = new Map<string, number>();

  function prune() {
    const at = now();
    for (const [sessionId, usedAt] of lastUsed) {
      if (at - usedAt <= ttlMs && lastUsed.size <= maxSessions) {
        break;
      }
      lastUsed.delete(sessionId);
    }
  }

  return {
    has(sessionId: string) {
      prune();
      return lastUsed.has(sessionId);
    },
    touch(sessionId: string) {
      lastUsed.delete(sessionId);
      lastUsed.set(sessionId, now());
      prune();
    },
  };
}
