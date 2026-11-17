import { AgentUnavailableError } from "./support-agent.ts";

// Extração da resposta final da lista de eventos que o `POST /run` do ADK devolve.
// Reproduz `extract_final_text` de `agent/src/translog/client.py` (Marco) e os casos de teste
// dele (`agent/tests/test_cli_and_client.py`). Mudou lá, muda aqui.
//
// As mensagens de erro são o motivo técnico para o log: nunca incluem texto dos eventos
// (nem o `errorMessage` do modelo, que pode trazer detalhes privados).

/** Código de erro do modelo seguro para o log (ex.: RESOURCE_EXHAUSTED). */
const SAFE_ERROR_CODE = /^[\w.-]{1,64}$/;

/**
 * Texto final público da resposta do agente. Lança `AgentUnavailableError` se:
 * - a resposta não for uma lista ou algum evento tiver `errorCode`/`error_code`;
 * - o último evento com conteúdo não for uma resposta final do modelo (`role` diferente de
 *   `model`, `partial` ou `interrupted`), ou ainda tiver chamada/retorno de ferramenta;
 * - esse evento não tiver texto público (partes `thought` são ignoradas).
 * Nunca recupera um texto intermediário anterior como se fosse a resposta.
 */
export function extractFinalText(events: unknown): string {
  if (!Array.isArray(events) || !events.every(isObject)) {
    throw new AgentUnavailableError("a resposta do agente não é uma lista de eventos");
  }

  const failed = events.find((event) => truthy(event.errorCode) || truthy(event.error_code));
  if (failed) {
    const code = failed.errorCode ?? failed.error_code;
    const safeCode = typeof code === "string" && SAFE_ERROR_CODE.test(code) ? code : "sem código";
    throw new AgentUnavailableError(`o modelo devolveu um evento de erro (${safeCode})`);
  }

  for (const event of events.toReversed()) {
    const content = event.content;
    if (!truthy(content)) {
      continue;
    }
    if (!isObject(content)) {
      throw new AgentUnavailableError("evento do agente fora do formato esperado");
    }
    if (content.role !== "model" || truthy(event.partial) || truthy(event.interrupted)) {
      throw new AgentUnavailableError("o agente não concluiu uma resposta final");
    }

    const parts = truthy(content.parts) ? content.parts : [];
    if (!Array.isArray(parts) || !parts.every(isObject)) {
      throw new AgentUnavailableError("evento do agente fora do formato esperado");
    }
    // `function_response` não está no original; conferir também só deixa a regra mais estrita.
    const usesTools = parts.some(
      (part) =>
        truthy(part.functionCall) ||
        truthy(part.function_call) ||
        truthy(part.functionResponse) ||
        truthy(part.function_response),
    );
    if (usesTools) {
      throw new AgentUnavailableError("o agente não concluiu as ferramentas");
    }

    const texts = parts.flatMap((part) =>
      typeof part.text === "string" && !truthy(part.thought) ? [part.text] : [],
    );
    if (texts.length > 0) {
      return texts.join("\n");
    }
    throw new AgentUnavailableError("o último evento do agente não tem resposta pública");
  }

  throw new AgentUnavailableError("o agente não devolveu uma resposta final");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Verdadeiro como no Python: `null`, `false`, `0`, `""`, `[]` e `{}` são falsos. */
function truthy(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (isObject(value)) {
    return Object.keys(value).length > 0;
  }
  return Boolean(value);
}
