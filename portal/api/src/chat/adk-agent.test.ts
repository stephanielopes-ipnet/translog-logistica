import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { type Order, orderSchema } from "@translog/contracts";
import { describe, expect, it, onTestFinished } from "vitest";
import { loadConfig } from "../config.ts";
import { createFixturesRepository } from "../orders/fixtures-repository.ts";
import { buildServer } from "../server.ts";
import { createAdkAgent, withOrderContext } from "./adk-agent.ts";
import { AgentTimeoutError, AgentUnavailableError } from "./support-agent.ts";

// O adapter é testado contra um servidor HTTP falso, local, criado em cada teste.
// Nenhum teste daqui chama o Gemini (o de integração real só roda com AGENT_IT_URL).

const SESSION_A = "11111111-1111-4111-8111-111111111111";
const SESSION_B = "22222222-2222-4222-8222-222222222222";
const SESSION_C = "33333333-3333-4333-8333-333333333333";

const repository = await createFixturesRepository();
const order375 = orderSchema.parse(await repository.findById(375));

interface FakeRequest {
  method: string;
  url: string;
  body: unknown;
}

type FakeResponse = { status: number; body?: unknown; raw?: string } | "hang";
type Handler = (request: FakeRequest, index: number) => FakeResponse | undefined;

const finalEvents = (text: string) => [
  { content: { role: "model", parts: [{ functionCall: { name: "consultar_pedido" } }] } },
  { content: { role: "user", parts: [{ functionResponse: { name: "consultar_pedido" } }] } },
  { content: { role: "model", parts: [{ text }] } },
];

/** Respostas padrão do agente: cria a sessão (200) e responde o /run com uma resposta final. */
function defaultResponse(request: FakeRequest): FakeResponse {
  if (request.url === "/run") {
    return { status: 200, body: finalEvents("Resposta do agente") };
  }
  return { status: 200, body: { id: "sessao" } };
}

/** Servidor falso do ADK. `handler` decide cada resposta; `undefined` usa a resposta padrão. */
async function startFakeAgent(handler: Handler = () => undefined) {
  const requests: FakeRequest[] = [];
  const server = createServer(async (req, res) => {
    let data = "";
    for await (const chunk of req) {
      data += chunk;
    }
    const request = {
      method: req.method ?? "",
      url: req.url ?? "",
      body: JSON.parse(data || "null"),
    };
    requests.push(request);
    const result = handler(request, requests.length - 1) ?? defaultResponse(request);
    if (result === "hang") {
      return;
    }
    res.writeHead(result.status, { "Content-Type": "application/json" });
    res.end(result.raw ?? JSON.stringify(result.body ?? {}));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  onTestFinished(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  const { port } = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${port}`;
  return {
    url,
    requests,
    runs: () => requests.filter((request) => request.url === "/run"),
    creations: () => requests.filter((request) => request.url.startsWith("/apps/")),
  };
}

function memoryLog() {
  const entries: { details: object; message: string }[] = [];
  return {
    entries,
    log: { info: (details: object, message: string) => entries.push({ details, message }) },
  };
}

function agentFor(url: string, extra: Partial<Parameters<typeof createAdkAgent>[0]> = {}) {
  return createAdkAgent({
    url,
    appName: "translog_agent",
    timeoutMs: 2000,
    log: memoryLog().log,
    ...extra,
  });
}

function ask(
  agent: ReturnType<typeof agentFor>,
  sessionId: string,
  message = "Quando chega?",
  order: Order | null = null,
) {
  return agent.reply({ sessionId, message, order });
}

describe("adk-agent: sessões", () => {
  it("cria a sessão só na primeira mensagem de cada conversa, com userId do servidor", async () => {
    const fake = await startFakeAgent();
    const agent = agentFor(fake.url);

    expect(await ask(agent, SESSION_A)).toBe("Resposta do agente");
    await ask(agent, SESSION_A, "E agora?");
    await ask(agent, SESSION_B);

    expect(fake.requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      `POST /apps/translog_agent/users/portal-${SESSION_A}/sessions/${SESSION_A}`,
      "POST /run",
      "POST /run",
      `POST /apps/translog_agent/users/portal-${SESSION_B}/sessions/${SESSION_B}`,
      "POST /run",
    ]);
    expect(fake.creations()[0]?.body).toEqual({});
    expect(fake.runs()[0]?.body).toEqual({
      appName: "translog_agent",
      userId: `portal-${SESSION_A}`,
      sessionId: SESSION_A,
      newMessage: { role: "user", parts: [{ text: "Quando chega?" }] },
    });
  });

  it("409 'already exists' na criação conta como sucesso", async () => {
    const fake = await startFakeAgent((request) =>
      request.url.startsWith("/apps/")
        ? { status: 409, body: { detail: `Session already exists: ${SESSION_A}` } }
        : undefined,
    );

    await expect(ask(agentFor(fake.url), SESSION_A)).resolves.toBe("Resposta do agente");
    expect(fake.runs()).toHaveLength(1);
  });

  it("falha na criação da sessão vira AgentUnavailableError, sem chamar o /run", async () => {
    const fake = await startFakeAgent((request) =>
      request.url.startsWith("/apps/") ? { status: 500, raw: "Internal Server Error" } : undefined,
    );

    const error = await ask(agentFor(fake.url), SESSION_A).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AgentUnavailableError);
    expect((error as Error).message).toBe("HTTP 500 ao criar sessão");
    expect(fake.runs()).toHaveLength(0);
  });

  it("404 'Session not found' no /run: recria a sessão e reenvia uma vez", async () => {
    let runs = 0;
    const fake = await startFakeAgent((request) => {
      if (request.url !== "/run") {
        return undefined;
      }
      runs += 1;
      return runs === 1
        ? { status: 404, body: { detail: `Session not found: ${SESSION_A}` } }
        : undefined;
    });
    const { entries, log } = memoryLog();
    const agent = agentFor(fake.url, { log });

    await expect(ask(agent, SESSION_A)).resolves.toBe("Resposta do agente");

    expect(fake.requests.map((request) => request.url.split("/")[1])).toEqual([
      "apps",
      "run",
      "apps",
      "run",
    ]);
    expect(fake.runs()[1]?.body).toEqual(fake.runs()[0]?.body);
    expect(entries).toEqual([
      { details: { sessionId: SESSION_A }, message: expect.stringContaining("recriando") },
    ]);
  });

  it("reenvia só uma vez: um segundo 404 vira AgentUnavailableError", async () => {
    const fake = await startFakeAgent((request) =>
      request.url === "/run"
        ? { status: 404, body: { detail: `Session not found: ${SESSION_A}` } }
        : undefined,
    );

    await expect(ask(agentFor(fake.url), SESSION_A)).rejects.toThrow(
      new AgentUnavailableError("HTTP 404 em POST /run"),
    );
    expect(fake.runs()).toHaveLength(2);
    expect(fake.creations()).toHaveLength(2);
  });

  it("404 que não é de sessão perdida não reenvia", async () => {
    const fake = await startFakeAgent((request) =>
      request.url === "/run" ? { status: 404, body: { detail: "Not Found" } } : undefined,
    );

    await expect(ask(agentFor(fake.url), SESSION_A)).rejects.toBeInstanceOf(AgentUnavailableError);
    expect(fake.runs()).toHaveLength(1);
  });
});

describe("adk-agent: falhas", () => {
  it("HTTP 500 no /run (modelo sem chave, sem cota...) vira AgentUnavailableError sem reenviar", async () => {
    const fake = await startFakeAgent((request) =>
      request.url === "/run"
        ? { status: 500, raw: '{"detail":"eco: MENSAGEM-SIGILOSA"}' }
        : undefined,
    );

    const error = await ask(agentFor(fake.url), SESSION_A, "MENSAGEM-SIGILOSA").catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(AgentUnavailableError);
    expect((error as Error).message).toBe("HTTP 500 em POST /run");
    expect(fake.runs()).toHaveLength(1);
  });

  it("tempo esgotado vira AgentTimeoutError", async () => {
    const fake = await startFakeAgent((request) => (request.url === "/run" ? "hang" : undefined));

    await expect(ask(agentFor(fake.url, { timeoutMs: 100 }), SESSION_A)).rejects.toThrow(
      new AgentTimeoutError("sem resposta do agente em 100 ms (POST /run)"),
    );
    expect(fake.runs()).toHaveLength(1);
  });

  it("lista sem resposta final vira AgentUnavailableError", async () => {
    const fake = await startFakeAgent((request) =>
      request.url === "/run" ? { status: 200, body: finalEvents("x").slice(0, 2) } : undefined,
    );

    await expect(ask(agentFor(fake.url), SESSION_A)).rejects.toBeInstanceOf(AgentUnavailableError);
  });

  it("evento de erro do modelo vira AgentUnavailableError com o código, sem a mensagem", async () => {
    const fake = await startFakeAgent((request) =>
      request.url === "/run"
        ? {
            status: 200,
            body: [{ errorCode: "RESOURCE_EXHAUSTED", errorMessage: "detalhes privados" }],
          }
        : undefined,
    );

    const error = await ask(agentFor(fake.url), SESSION_A).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AgentUnavailableError);
    expect((error as Error).message).toContain("RESOURCE_EXHAUSTED");
    expect((error as Error).message).not.toContain("privados");
  });

  it("JSON inválido vira AgentUnavailableError", async () => {
    const fake = await startFakeAgent((request) =>
      request.url === "/run" ? { status: 200, raw: "<html>proxy</html>" } : undefined,
    );

    await expect(ask(agentFor(fake.url), SESSION_A)).rejects.toThrow(
      new AgentUnavailableError("JSON inválido na resposta do agente (POST /run)"),
    );
  });

  it("agente fora do ar vira AgentUnavailableError com o código de rede", async () => {
    // Porta que acabou de ser liberada: a conexão é recusada.
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    await new Promise((resolve) => server.close(resolve));

    const error = await ask(agentFor(`http://127.0.0.1:${port}`), SESSION_A).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(AgentUnavailableError);
    expect((error as Error).message).toBe(
      "falha de conexão com o agente (criar sessão, ECONNREFUSED)",
    );
  });
});

describe("adk-agent: pedido de contexto no texto", () => {
  it("withOrderContext prefixa o número do pedido; sem pedido, mantém a mensagem", () => {
    expect(withOrderContext("Quando chega?", order375)).toBe(
      "[Pedido aberto no portal: 375] Quando chega?",
    );
    expect(withOrderContext("Quando chega?", null)).toBe("Quando chega?");
  });

  it("o texto enviado ao /run leva o contexto do pedido", async () => {
    const fake = await startFakeAgent();

    await ask(agentFor(fake.url), SESSION_A, "Por que atrasou?", order375);

    expect(fake.runs()[0]?.body).toMatchObject({
      newMessage: { parts: [{ text: "[Pedido aberto no portal: 375] Por que atrasou?" }] },
    });
  });
});

describe("adk-agent: memória de sessões", () => {
  it("esquece a sessão depois de 2 h sem uso e a cria de novo", async () => {
    const fake = await startFakeAgent();
    let now = 0;
    const agent = agentFor(fake.url, { now: () => now });
    const twoHours = 2 * 60 * 60 * 1000;

    await ask(agent, SESSION_A);
    now += twoHours; // exatamente 2 h: ainda lembra
    await ask(agent, SESSION_A);
    now += twoHours + 1; // 2 h e 1 ms desde o último uso: esqueceu
    await ask(agent, SESSION_A);

    expect(fake.creations()).toHaveLength(2);
    expect(fake.runs()).toHaveLength(3);
  });

  it("guarda no máximo N sessões e esquece as usadas há mais tempo", async () => {
    const fake = await startFakeAgent();
    let now = 0;
    const agent = agentFor(fake.url, { now: () => now++, maxSessions: 2 });

    await ask(agent, SESSION_A);
    await ask(agent, SESSION_B);
    await ask(agent, SESSION_A); // A passa a ser a mais recente
    await ask(agent, SESSION_C); // passa do limite: esquece B
    await ask(agent, SESSION_A);
    await ask(agent, SESSION_B);

    const created = fake.creations().map((request) => request.url.split("/").at(-1));
    expect(created).toEqual([SESSION_A, SESSION_B, SESSION_C, SESSION_B]);
  });
});

describe("POST /api/chat com AGENT=adk (servidor falso)", () => {
  it("responde pelo agente, com o pedido citado, e o health informa o modo", async () => {
    const fake = await startFakeAgent();
    const app = await buildServer(loadConfig({ AGENT: "adk", AGENT_URL: fake.url }), {
      logger: false,
    });
    onTestFinished(() => app.close());

    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: { sessionId: SESSION_A, message: "E o pedido 15?", orderId: 375 },
    });
    const health = await app.inject({ method: "GET", url: "/api/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toStrictEqual({
      sessionId: SESSION_A,
      reply: "Resposta do agente",
      mentionedOrderId: 15,
    });
    expect(fake.runs()[0]?.body).toMatchObject({
      newMessage: { parts: [{ text: "[Pedido aberto no portal: 15] E o pedido 15?" }] },
    });
    expect(health.json().agent).toBe("adk");
  });

  it("falha do agente vira 502 e tempo esgotado vira 504", async () => {
    const fake = await startFakeAgent((request, index) => {
      if (request.url !== "/run") {
        return undefined;
      }
      return index === 1 ? { status: 500, raw: "erro" } : "hang";
    });
    const app = await buildServer(
      loadConfig({ AGENT: "adk", AGENT_URL: fake.url, AGENT_TIMEOUT_MS: "1000" }),
      { logger: false },
    );
    onTestFinished(() => app.close());
    const payload = { sessionId: SESSION_A, message: "Quando chega?" };

    const unavailable = await app.inject({ method: "POST", url: "/api/chat", payload });
    const timeout = await app.inject({ method: "POST", url: "/api/chat", payload });

    expect(unavailable.statusCode).toBe(502);
    expect(unavailable.json().error.code).toBe("AGENT_UNAVAILABLE");
    expect(timeout.statusCode).toBe(504);
    expect(timeout.json().error.code).toBe("AGENT_TIMEOUT");
  });
});

// Integração com o agente real: chama o Gemini (gasta cota). Desligado por padrão.
// Uso: AGENT_IT_URL=http://127.0.0.1:8001 pnpm --filter @translog/api test adk-agent
const AGENT_IT_URL = process.env.AGENT_IT_URL;

describe.skipIf(!AGENT_IT_URL)("integração com o agente real (AGENT_IT_URL)", () => {
  it("responde uma pergunta simples pelo agente ADK", { timeout: 150_000 }, async () => {
    const agent = createAdkAgent({
      url: AGENT_IT_URL ?? "",
      appName: process.env.AGENT_IT_APP_NAME ?? "translog_agent",
      timeoutMs: 120_000,
      log: memoryLog().log,
    });

    const reply = await agent.reply({
      sessionId: crypto.randomUUID(),
      message: "Quais são as modalidades de envio?",
      order: null,
    });

    expect(reply.trim().length).toBeGreaterThan(0);
  });
});
