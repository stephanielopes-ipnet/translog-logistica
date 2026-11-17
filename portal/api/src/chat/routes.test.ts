import { chatResponseSchema, errorResponseSchema } from "@translog/contracts";
import { describe, expect, it, onTestFinished } from "vitest";
import { loadConfig } from "../config.ts";
import { buildServer } from "../server.ts";
import {
  AgentTimeoutError,
  AgentUnavailableError,
  type SupportAgent,
  type SupportAgentInput,
} from "./support-agent.ts";

const SESSION = "3f2b8c1e-7a4d-4e5f-9b6a-1c2d3e4f5a6b";

async function buildTestServer(supportAgent?: SupportAgent) {
  const app = await buildServer(loadConfig({}), {
    logger: false,
    overrides: supportAgent ? { supportAgent } : undefined,
  });
  onTestFinished(() => app.close());
  return app;
}

function postChat(app: Awaited<ReturnType<typeof buildTestServer>>, payload: unknown) {
  return app.inject({ method: "POST", url: "/api/chat", payload: payload as object });
}

function parseError(payload: string) {
  return errorResponseSchema.parse(JSON.parse(payload)).error;
}

describe("POST /api/chat (assistente simulado)", () => {
  it("responde 200 no contrato, com o pedido citado", async () => {
    const app = await buildTestServer();

    const response = await postChat(app, {
      sessionId: SESSION,
      message: "Por que o pedido #375 atrasou?",
      orderId: 375,
    });

    expect(response.statusCode).toBe(200);
    expect(chatResponseSchema.parse(response.json())).toStrictEqual({
      sessionId: SESSION,
      reply: expect.stringContaining("Sinto muito pelo atraso do pedido **#375**"),
      mentionedOrderId: 375,
    });
  });

  it("usa o pedido aberto como contexto quando a mensagem não cita outro", async () => {
    const app = await buildTestServer();

    const response = await postChat(app, {
      sessionId: SESSION,
      message: "Quando chega?",
      orderId: 375,
    });

    expect(response.json()).toMatchObject({
      reply: expect.stringContaining("**#375**"),
      mentionedOrderId: null,
    });
  });

  it("aceita orderId ausente ou null e pede o número", async () => {
    const app = await buildTestServer();

    for (const payload of [
      { sessionId: SESSION, message: "Quando chega?" },
      { sessionId: SESSION, message: "Quando chega?", orderId: null },
    ]) {
      const response = await postChat(app, payload);
      expect(response.statusCode).toBe(200);
      expect(response.json().reply).toMatch(/me diga o número do pedido/);
    }
  });

  it("apara os espaços das pontas da mensagem antes de enviar ao assistente", async () => {
    const received: SupportAgentInput[] = [];
    const app = await buildTestServer({
      async reply(input) {
        received.push(input);
        return "ok";
      },
    });

    await postChat(app, { sessionId: SESSION, message: "   Quando chega?  \n" });

    expect(received[0]?.message).toBe("Quando chega?");
  });

  it.each([
    {
      case: "sem sessionId",
      payload: { message: "Quando chega?" },
      field: "sessionId",
    },
    {
      case: "sessionId que não é UUID",
      payload: { sessionId: "conversa-1", message: "Quando chega?" },
      field: "sessionId",
    },
    { case: "mensagem vazia", payload: { sessionId: SESSION, message: "" }, field: "message" },
    {
      case: "mensagem só com espaços",
      payload: { sessionId: SESSION, message: "   \n " },
      field: "message",
    },
    {
      case: "mensagem longa demais",
      payload: { sessionId: SESSION, message: "a".repeat(1001) },
      field: "message",
    },
    {
      case: "orderId inválido",
      payload: { sessionId: SESSION, message: "Oi", orderId: -1 },
      field: "orderId",
    },
  ])("400 VALIDATION_ERROR: $case", async ({ payload, field }) => {
    const app = await buildTestServer();

    const response = await postChat(app, payload);

    expect(response.statusCode).toBe(400);
    const error = parseError(response.payload);
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.message).toContain(`${field}: `);
  });

  it("aceita mensagem com exatamente 1000 caracteres", async () => {
    const app = await buildTestServer();

    const response = await postChat(app, { sessionId: SESSION, message: "a".repeat(1000) });

    expect(response.statusCode).toBe(200);
  });
});

describe("POST /api/chat: erros do assistente", () => {
  it("409 CHAT_BUSY para outra mensagem da mesma conversa antes da resposta", async () => {
    let release: (reply: string) => void = () => {};
    let started = false;
    const app = await buildTestServer({
      reply: () =>
        new Promise<string>((resolve) => {
          started = true;
          release = resolve;
        }),
    });

    const first = postChat(app, { sessionId: SESSION, message: "Quando chega?" });
    await expect.poll(() => started).toBe(true);
    const second = await postChat(app, { sessionId: SESSION, message: "E agora?" });

    expect(second.statusCode).toBe(409);
    expect(parseError(second.payload)).toStrictEqual({
      code: "CHAT_BUSY",
      message: "Aguarde a resposta anterior antes de enviar outra mensagem.",
    });

    release("Resposta");
    expect((await first).statusCode).toBe(200);
  });

  it.each([
    {
      error: new AgentUnavailableError("HTTP 500 em POST /run"),
      status: 502,
      body: {
        code: "AGENT_UNAVAILABLE",
        message: "O assistente está indisponível no momento. Tente novamente em instantes.",
      },
    },
    {
      error: new AgentTimeoutError("sem resposta em 90000 ms"),
      status: 504,
      body: {
        code: "AGENT_TIMEOUT",
        message: "O assistente demorou demais para responder. Tente novamente.",
      },
    },
  ])("$status $body.code sem vazar o detalhe técnico", async ({ error, status, body }) => {
    const app = await buildTestServer({
      reply: async () => {
        throw error;
      },
    });

    const response = await postChat(app, { sessionId: SESSION, message: "Quando chega?" });

    expect(response.statusCode).toBe(status);
    expect(parseError(response.payload)).toStrictEqual(body);
    expect(response.payload).not.toContain(error.message);
  });
});

describe("POST /api/chat na documentação", () => {
  it("o OpenAPI traz o corpo com exemplo e as respostas 200, 400, 409, 502 e 504", async () => {
    const app = await buildTestServer();

    const spec = (await app.inject({ method: "GET", url: "/docs/json" })).json();
    const operation = spec.paths["/api/chat"].post;

    expect(operation.requestBody.content["application/json"].schema.example).toMatchObject({
      message: "Por que o pedido #375 atrasou?",
      orderId: 375,
    });
    expect(Object.keys(operation.responses).sort()).toEqual(["200", "400", "409", "502", "504"]);
  });
});
