import type { Order } from "@translog/contracts";

export interface SupportAgentInput {
  /** Conversa (UUID gerado pela tela). */
  sessionId: string;
  /** Mensagem do cliente, já aparada e validada pelo contrato. */
  message: string;
  /** Pedido de contexto já resolvido: o citado na mensagem ou, sem ele, o aberto na tela. */
  order: Order | null;
}

/**
 * Porta: o assistente que responde o chat. Adapters: `mock` (respostas simuladas) e `adk`
 * (agente do Marco). A escolha acontece no `container.ts`.
 * Falhas do assistente lançam `AgentUnavailableError` ou `AgentTimeoutError`.
 */
export interface SupportAgent {
  /** Texto da resposta (pode ter **negrito** e quebras de linha). */
  reply(input: SupportAgentInput): Promise<string>;
}

/**
 * O assistente falhou (HTTP de erro, resposta inválida, modelo sem cota...). Vira
 * `502 AGENT_UNAVAILABLE`. A mensagem é o motivo técnico, para o log: nunca inclua nela
 * o texto do cliente, a resposta do agente nem o corpo de respostas HTTP.
 */
export class AgentUnavailableError extends Error {
  constructor(reason: string, options?: ErrorOptions) {
    super(reason, options);
    this.name = "AgentUnavailableError";
  }
}

/** O assistente passou do limite de tempo (`AGENT_TIMEOUT_MS`). Vira `504 AGENT_TIMEOUT`. */
export class AgentTimeoutError extends Error {
  constructor(reason: string, options?: ErrorOptions) {
    super(reason, options);
    this.name = "AgentTimeoutError";
  }
}
