import type { Order } from "@translog/contracts";
import { describe, expect, it } from "vitest";
import { createFixturesRepository } from "../orders/fixtures-repository.ts";
import { createOrderService } from "../orders/order-service.ts";
import { NO_PROMISE_SCENARIO } from "../orders/promise-scenario.ts";
import { ChatBusyError, type ChatLogger, createChatService } from "./chat-service.ts";
import {
  AgentTimeoutError,
  AgentUnavailableError,
  type SupportAgent,
  type SupportAgentInput,
} from "./support-agent.ts";

const SESSION_A = "11111111-1111-4111-8111-111111111111";
const SESSION_B = "22222222-2222-4222-8222-222222222222";

const orders = createOrderService({
  orders: await createFixturesRepository(),
  sampleOrderIds: [],
  promiseScenario: NO_PROMISE_SCENARIO,
});

/** Log em memória, para conferir o que foi (e o que não foi) registrado. */
function memoryLog() {
  const entries: { level: string; details: object; message: string }[] = [];
  const log: ChatLogger = {
    info: (details, message) => entries.push({ level: "info", details, message }),
    warn: (details, message) => entries.push({ level: "warn", details, message }),
  };
  return { log, entries };
}

/** Agente que guarda o que recebeu e responde "Resposta para #<pedido>". */
function recordingAgent() {
  const calls: SupportAgentInput[] = [];
  const agent: SupportAgent = {
    async reply(input) {
      calls.push(input);
      return `Resposta para #${input.order?.orderId ?? "nenhum"}`;
    },
  };
  return { agent, calls };
}

/** Agente que só responde quando o teste chamar `release()`. */
function blockedAgent() {
  const pending: { resolve: (reply: string) => void; input: SupportAgentInput }[] = [];
  const agent: SupportAgent = {
    reply: (input) => new Promise<string>((resolve) => pending.push({ resolve, input })),
  };
  return {
    agent,
    pending,
    release: (index: number) => pending[index]?.resolve(`ok ${pending[index]?.input.sessionId}`),
  };
}

function orderIdOf(order: Order | null) {
  return order?.orderId ?? null;
}

describe("chat-service: pedido de contexto", () => {
  it("pedido citado existente vira mentionedOrderId e o contexto do agente", async () => {
    const { agent, calls } = recordingAgent();
    const chat = createChatService({ agent, orders, log: memoryLog().log });

    const result = await chat.send({
      sessionId: SESSION_A,
      message: "E o pedido #8, já chegou?",
      orderId: 375,
    });

    expect(result).toStrictEqual({ reply: "Resposta para #8", mentionedOrderId: 8 });
    expect(orderIdOf(calls[0]?.order ?? null)).toBe(8);
  });

  it("pedido citado inexistente é ignorado: o contexto é o pedido aberto", async () => {
    const { agent, calls } = recordingAgent();
    const chat = createChatService({ agent, orders, log: memoryLog().log });

    const result = await chat.send({
      sessionId: SESSION_A,
      message: "Onde está o pedido 99999?",
      orderId: 375,
    });

    expect(result.mentionedOrderId).toBeNull();
    expect(orderIdOf(calls[0]?.order ?? null)).toBe(375);
  });

  it("usa o primeiro número citado que existe; mais de 10 dígitos não conta", async () => {
    const { agent } = recordingAgent();
    const chat = createChatService({ agent, orders, log: memoryLog().log });

    const result = await chat.send({
      sessionId: SESSION_A,
      message: "Meu telefone é 11987654321, pedidos 99999 e 34",
      orderId: null,
    });

    expect(result.mentionedOrderId).toBe(34);
  });

  it("pedido aberto inexistente é ignorado, sem erro", async () => {
    const { agent, calls } = recordingAgent();
    const chat = createChatService({ agent, orders, log: memoryLog().log });

    const result = await chat.send({
      sessionId: SESSION_A,
      message: "Quando chega?",
      orderId: 99999,
    });

    expect(result).toStrictEqual({ reply: "Resposta para #nenhum", mentionedOrderId: null });
    expect(calls[0]?.order).toBeNull();
  });

  it("repassa sessão e mensagem ao agente", async () => {
    const { agent, calls } = recordingAgent();
    const chat = createChatService({ agent, orders, log: memoryLog().log });

    await chat.send({ sessionId: SESSION_B, message: "Quando chega?", orderId: 375 });

    expect(calls[0]).toMatchObject({ sessionId: SESSION_B, message: "Quando chega?" });
  });
});

describe("chat-service: uma mensagem por vez por conversa", () => {
  it("segunda mensagem da mesma conversa antes da resposta recebe ChatBusyError", async () => {
    const { agent, pending, release } = blockedAgent();
    const chat = createChatService({ agent, orders, log: memoryLog().log });

    const first = chat.send({ sessionId: SESSION_A, message: "Quando chega?", orderId: null });
    const second = chat.send({ sessionId: SESSION_A, message: "E agora?", orderId: null });

    await expect(second).rejects.toBeInstanceOf(ChatBusyError);
    await expect.poll(() => pending.length).toBe(1);
    release(0);
    await expect(first).resolves.toMatchObject({ reply: `ok ${SESSION_A}` });
  });

  it("libera a conversa depois da resposta", async () => {
    const { agent } = recordingAgent();
    const chat = createChatService({ agent, orders, log: memoryLog().log });

    await chat.send({ sessionId: SESSION_A, message: "Oi", orderId: null });

    await expect(
      chat.send({ sessionId: SESSION_A, message: "Oi de novo", orderId: null }),
    ).resolves.toBeDefined();
  });

  it("libera a conversa também depois de uma falha", async () => {
    let fail = true;
    const agent: SupportAgent = {
      async reply() {
        if (fail) {
          fail = false;
          throw new AgentUnavailableError("HTTP 500 em POST /run");
        }
        return "Resposta";
      },
    };
    const chat = createChatService({ agent, orders, log: memoryLog().log });

    await expect(
      chat.send({ sessionId: SESSION_A, message: "Oi", orderId: null }),
    ).rejects.toBeInstanceOf(AgentUnavailableError);
    await expect(
      chat.send({ sessionId: SESSION_A, message: "Oi", orderId: null }),
    ).resolves.toMatchObject({ reply: "Resposta" });
  });

  it("conversas diferentes são atendidas em paralelo", async () => {
    const { agent, pending, release } = blockedAgent();
    const chat = createChatService({ agent, orders, log: memoryLog().log });

    const a = chat.send({ sessionId: SESSION_A, message: "Quando chega?", orderId: null });
    const b = chat.send({ sessionId: SESSION_B, message: "Quando chega?", orderId: null });

    await expect.poll(() => pending.length).toBe(2);
    release(1);
    release(0);
    await expect(Promise.all([a, b])).resolves.toMatchObject([
      { reply: `ok ${SESSION_A}` },
      { reply: `ok ${SESSION_B}` },
    ]);
  });
});

describe("chat-service: falhas e log", () => {
  it("resposta vazia do agente vira AgentUnavailableError", async () => {
    const agent: SupportAgent = { reply: async () => "   " };
    const chat = createChatService({ agent, orders, log: memoryLog().log });

    await expect(
      chat.send({ sessionId: SESSION_A, message: "Oi", orderId: null }),
    ).rejects.toBeInstanceOf(AgentUnavailableError);
  });

  it("apara a resposta do agente", async () => {
    const agent: SupportAgent = { reply: async () => "\n  Resposta  \n" };
    const chat = createChatService({ agent, orders, log: memoryLog().log });

    await expect(
      chat.send({ sessionId: SESSION_A, message: "Oi", orderId: null }),
    ).resolves.toMatchObject({ reply: "Resposta" });
  });

  it("registra sessão, tamanho, tempo e resultado, nunca a mensagem nem a resposta", async () => {
    const { log, entries } = memoryLog();
    const agent: SupportAgent = { reply: async () => "RESPOSTA-SIGILOSA" };
    const chat = createChatService({ agent, orders, log });

    await chat.send({ sessionId: SESSION_A, message: "MENSAGEM-SIGILOSA", orderId: 375 });

    expect(entries).toHaveLength(1);
    expect(entries[0]?.level).toBe("info");
    expect(entries[0]?.details).toStrictEqual({
      sessionId: SESSION_A,
      messageLength: "MENSAGEM-SIGILOSA".length,
      outcome: "ok",
      durationMs: expect.any(Number),
    });
    expect(JSON.stringify(entries)).not.toMatch(/SIGILOSA/);
  });

  it.each([
    { error: new AgentUnavailableError("HTTP 500 em POST /run"), outcome: "unavailable" },
    { error: new AgentTimeoutError("sem resposta em 90000 ms"), outcome: "timeout" },
  ])("registra a falha ($outcome) com o motivo técnico", async ({ error, outcome }) => {
    const { log, entries } = memoryLog();
    const agent: SupportAgent = {
      reply: async () => {
        throw error;
      },
    };
    const chat = createChatService({ agent, orders, log });

    await expect(
      chat.send({ sessionId: SESSION_A, message: "MENSAGEM-SIGILOSA", orderId: null }),
    ).rejects.toBe(error);

    expect(entries[0]?.level).toBe("warn");
    expect(entries[0]?.details).toMatchObject({ outcome, reason: error.message });
    expect(JSON.stringify(entries)).not.toMatch(/SIGILOSA/);
  });

  it("registra a conversa ocupada sem a mensagem", async () => {
    const { log, entries } = memoryLog();
    const { agent, pending, release } = blockedAgent();
    const chat = createChatService({ agent, orders, log });

    const first = chat.send({ sessionId: SESSION_A, message: "Oi", orderId: null });
    await expect(
      chat.send({ sessionId: SESSION_A, message: "MENSAGEM-SIGILOSA", orderId: null }),
    ).rejects.toBeInstanceOf(ChatBusyError);
    await expect.poll(() => pending.length).toBe(1);
    release(0);
    await first;

    expect(entries[0]?.details).toStrictEqual({
      sessionId: SESSION_A,
      messageLength: "MENSAGEM-SIGILOSA".length,
      outcome: "busy",
    });
    expect(JSON.stringify(entries)).not.toMatch(/SIGILOSA/);
  });
});
