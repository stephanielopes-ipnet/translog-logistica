import { describe, expect, it } from "vitest";
import { extractFinalText } from "./adk-events.ts";
import { AgentUnavailableError } from "./support-agent.ts";

/** Mensagem do erro lançado, conferindo que é `AgentUnavailableError`. */
function failure(events: unknown): string {
  try {
    extractFinalText(events);
  } catch (error) {
    expect(error).toBeInstanceOf(AgentUnavailableError);
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("extractFinalText deveria ter falhado");
}

// Os cinco primeiros blocos são os casos de agent/tests/test_cli_and_client.py (Marco).
describe("extractFinalText: casos de teste do agente", () => {
  it("extrai só o texto final, sem ferramentas nem pensamentos", () => {
    const events = [
      { content: { role: "model", parts: [{ text: "Vou consultar." }] } },
      { content: { role: "model", parts: [{ functionCall: { name: "consultar_pedido" } }] } },
      { content: { role: "user", parts: [{ functionResponse: { name: "consultar_pedido" } }] } },
      {
        content: {
          role: "model",
          parts: [
            { text: "raciocínio privado", thought: true },
            { text: "Atraso observado de dois dias." },
          ],
        },
      },
    ];

    expect(extractFinalText(events)).toBe("Atraso observado de dois dias.");
  });

  it("erro do modelo não vira o texto intermediário anterior", () => {
    const events = [
      { content: { role: "model", parts: [{ text: "Vou consultar." }] } },
      { errorCode: "RESOURCE_EXHAUSTED", errorMessage: "private-details" },
    ];

    const reason = failure(events);

    expect(reason).toContain("RESOURCE_EXHAUSTED");
    expect(reason).not.toContain("private-details");
    expect(reason).not.toContain("Vou consultar");
  });

  it("recusa resposta que não é do modelo", () => {
    failure([{ content: { role: "user", parts: [{ text: "1001" }] } }]);
  });

  it("recusa texto intermediário quando a ferramenta nunca termina", () => {
    failure([
      { content: { role: "model", parts: [{ text: "Vou consultar." }] } },
      { content: { role: "model", parts: [{ functionCall: { name: "consultar_pedido" } }] } },
      { content: { role: "user", parts: [{ functionResponse: { name: "consultar_pedido" } }] } },
    ]);
  });

  it.each(["partial", "interrupted"])("recusa resposta %s", (flag) => {
    failure([
      { [flag]: true, content: { role: "model", parts: [{ text: "Resposta incompleta" }] } },
    ]);
  });
});

describe("extractFinalText: demais regras", () => {
  it("junta as partes de texto com quebra de linha", () => {
    expect(
      extractFinalText([
        { content: { role: "model", parts: [{ text: "Linha 1" }, { text: "Linha 2" }] } },
      ]),
    ).toBe("Linha 1\nLinha 2");
  });

  it("ignora eventos sem conteúdo depois da resposta final", () => {
    expect(
      extractFinalText([
        { content: { role: "model", parts: [{ text: "Resposta" }] } },
        { actions: { stateDelta: {} } },
        { content: {} },
        { content: null },
      ]),
    ).toBe("Resposta");
  });

  it("recusa error_code (snake_case)", () => {
    expect(failure([{ error_code: "INTERNAL" }])).toContain("INTERNAL");
  });

  it("não leva para o log um código de erro fora do formato", () => {
    expect(failure([{ errorCode: "texto livre com dados" }])).toContain("sem código");
  });

  it("recusa function_call e function_response (snake_case) no último evento", () => {
    failure([{ content: { role: "model", parts: [{ function_call: { name: "x" } }] } }]);
    failure([{ content: { role: "model", parts: [{ function_response: { name: "x" } }] } }]);
  });

  it("recusa último evento só com pensamento ou sem partes", () => {
    failure([{ content: { role: "model", parts: [{ text: "pensando", thought: true }] } }]);
    failure([{ content: { role: "model", parts: [] } }]);
    failure([{ content: { role: "model" } }]);
  });

  it.each([
    { case: "lista vazia", events: [] },
    { case: "objeto em vez de lista", events: { content: { role: "model" } } },
    { case: "texto", events: "Resposta" },
    { case: "null", events: null },
    { case: "evento que não é objeto", events: ["Resposta"] },
    { case: "conteúdo que não é objeto", events: [{ content: "Resposta" }] },
    { case: "partes que não são lista", events: [{ content: { role: "model", parts: "x" } }] },
  ])("recusa formato inesperado: $case", ({ events }) => {
    failure(events);
  });
});
