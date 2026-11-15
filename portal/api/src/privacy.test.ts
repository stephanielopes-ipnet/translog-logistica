import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type Order, orderSchema } from "@translog/contracts";
import type { FastifyInstance } from "fastify";
import { describe, expect, it, onTestFinished } from "vitest";
import { z } from "zod";
import { loadConfig } from "./config.ts";
import type { ContainerOverrides } from "./container.ts";
import { FIXTURES_FILE } from "./orders/fixtures-repository.ts";
import { buildServer } from "./server.ts";

// Regra fixa do portal: nenhuma resposta traz dado do cliente, de pagamento ou financeiro
// interno. Estes testes varrem todas as chaves (em qualquer nível) de todas as respostas.

/** Palavras de dados proibidos que não podem aparecer no texto das respostas do chat. */
const FORBIDDEN_TEXT =
  /cliente|customer|segment|pagamento|payment|lucro|profit|margem|margin|desconto|discount|latitude|longitude/i;

/** Colunas proibidas da Silver e equivalentes que poderiam aparecer em inglês. */
const FORBIDDEN_KEY =
  /cliente|customer|client|segment|pagamento|payment|lucro|profit|margem|margin|desconto|discount|latitude|longitude|^lat$|^lng$|^lon$|resumo/i;

/** Todas as chaves de objetos em qualquer nível de `value` que casam com `FORBIDDEN_KEY`. */
function forbiddenKeys(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(forbiddenKeys);
  }
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([key, child]) => [
      ...(FORBIDDEN_KEY.test(key) ? [key] : []),
      ...forbiddenKeys(child),
    ]);
  }
  return [];
}

const fixtures = z.array(orderSchema).parse(JSON.parse(readFileSync(FIXTURES_FILE, "utf8")));

/** Amostra da Silver com colunas proibidas preenchidas com valores fictícios. */
const SAMPLE_CSV = fileURLToPath(new URL("./orders/fixtures/silver-amostra.csv", import.meta.url));

async function buildTestServer(env: NodeJS.ProcessEnv, overrides?: ContainerOverrides) {
  const app = await buildServer(loadConfig(env), { logger: false, overrides });
  onTestFinished(() => app.close());
  return app;
}

/** Todas as rotas da API, com sucesso e com erro, e o OpenAPI. */
function allUrls(orderIds: readonly number[]): string[] {
  return [
    "/api/health",
    "/api/orders/samples",
    ...orderIds.map((id) => `/api/orders/${id}`),
    "/api/orders/1", // 404
    "/api/orders/abc", // 400
    "/rota-inexistente", // 404 genérico
    "/docs/json",
  ];
}

/** Perguntas ao chat simulado sobre cada pedido, mais as respostas fixas e um erro de validação. */
function chatPayloads(orderIds: readonly number[]): object[] {
  const sessionId = "3f2b8c1e-7a4d-4e5f-9b6a-1c2d3e4f5a6b";
  return [
    ...orderIds.flatMap((id) => [
      { sessionId, message: `Quando chega o pedido ${id}?` },
      { sessionId, message: `Por que o pedido #${id} atrasou?` },
      { sessionId, message: "Qual a situação?", orderId: id },
    ]),
    { sessionId, message: "Quais são as modalidades de envio?" },
    { sessionId, message: "Quando chega?" },
    { sessionId, message: "Onde está o pedido 99999?" },
    { sessionId, message: "Bom dia" },
    { sessionId, message: "" }, // 400
  ];
}

/** Respostas do chat, uma pergunta por vez (a mesma conversa não aceita mensagens simultâneas). */
async function chatBodies(app: FastifyInstance, payloads: readonly object[]) {
  const bodies: { payload: object; body: { reply?: string } }[] = [];
  for (const payload of payloads) {
    const response = await app.inject({ method: "POST", url: "/api/chat", payload });
    bodies.push({ payload, body: response.json() });
  }
  return bodies;
}

async function responseBodies(app: FastifyInstance, urls: readonly string[]) {
  return Promise.all(
    urls.map(async (url) => ({ url, body: (await app.inject({ method: "GET", url })).json() })),
  );
}

describe("varredura de chaves proibidas", () => {
  it("o detector encontra chaves proibidas em qualquer nível", () => {
    expect(
      forbiddenKeys({ a: 1, items: [{ lucro_item: 1, ok: { customerId: 2 } }], lat: 0 }),
    ).toEqual(["lucro_item", "customerId", "lat"]);
  });

  it.each([
    { source: "fixtures", env: {}, orderIds: fixtures.map((order) => order.orderId) },
    {
      source: "file",
      env: { DATA_SOURCE: "file", ORDERS_FILE: SAMPLE_CSV },
      orderIds: [15, 375, 552, 562, 1002],
    },
  ])("nenhuma resposta tem chave proibida (fonte $source)", async ({ env, orderIds }) => {
    const app = await buildTestServer(env);

    const bodies = await responseBodies(app, allUrls(orderIds));

    for (const { url, body } of bodies) {
      expect(forbiddenKeys(body), url).toEqual([]);
    }
  });

  it("nenhuma resposta traz valores das colunas proibidas ou sem uso da Silver", async () => {
    // Na amostra, essas colunas têm valores FICTICIO-* e SEM-USO.
    const app = await buildTestServer({ DATA_SOURCE: "file", ORDERS_FILE: SAMPLE_CSV });

    const bodies = await responseBodies(app, allUrls([15, 375, 552, 562, 1002]));

    expect(bodies.map(({ body }) => body).filter((body) => body.orderId)).toHaveLength(5);
    for (const { url, body } of bodies) {
      expect(JSON.stringify(body), url).not.toMatch(/FICTICIO|SEM-USO/);
    }
  });

  it("campos fora do contrato são descartados na resposta, mesmo se a fonte os trouxer", async () => {
    const leak = { id_cliente: 123, segmento_cliente: "Consumer", lucro_total_pedido: 99.9 };
    const leakyRepository: ContainerOverrides["orderRepository"] = {
      async findById(orderId) {
        const order = fixtures.find((candidate) => candidate.orderId === orderId);
        if (!order) {
          return null;
        }
        const items = order.items.map((item) => Object.assign({}, item, { lucro_item: 1.5 }));
        const leaky: Order = Object.assign({}, order, leak, { items });
        return leaky;
      },
      count: async () => fixtures.length,
    };
    const app = await buildTestServer({}, { orderRepository: leakyRepository });

    const response = await app.inject({ method: "GET", url: "/api/orders/15" });

    expect(response.statusCode).toBe(200);
    expect(forbiddenKeys(response.json())).toEqual([]);
    expect(Object.keys(response.json()).sort()).toEqual(Object.keys(orderSchema.shape).sort());
  });
});

describe("privacidade no chat (assistente simulado)", () => {
  it.each([
    { source: "fixtures", env: {}, orderIds: fixtures.map((order) => order.orderId) },
    {
      source: "file",
      env: { DATA_SOURCE: "file", ORDERS_FILE: SAMPLE_CSV },
      orderIds: [15, 375, 552, 562, 1002],
    },
  ])(
    "nenhuma resposta do chat tem chave, valor ou texto proibido (fonte $source)",
    async ({ env, orderIds }) => {
      const app = await buildTestServer(env);

      const bodies = await chatBodies(app, chatPayloads(orderIds));

      expect(bodies.filter(({ body }) => body.reply).length).toBe(bodies.length - 1);
      for (const { payload, body } of bodies) {
        const where = JSON.stringify(payload);
        expect(forbiddenKeys(body), where).toEqual([]);
        expect(JSON.stringify(body), where).not.toMatch(/FICTICIO|SEM-USO/);
        expect(body.reply ?? "", where).not.toMatch(FORBIDDEN_TEXT);
      }
    },
  );

  it("o chat não repassa campos fora do contrato, mesmo se a fonte os trouxer", async () => {
    const leakyRepository: ContainerOverrides["orderRepository"] = {
      async findById(orderId) {
        const order = fixtures.find((candidate) => candidate.orderId === orderId);
        if (!order) {
          return null;
        }
        const leaky: Order = Object.assign({}, order, {
          id_cliente: 987654,
          segmento_cliente: "Consumer",
          lucro_total_pedido: 31.415,
        });
        return leaky;
      },
      count: async () => fixtures.length,
    };
    const app = await buildTestServer({}, { orderRepository: leakyRepository });

    const bodies = await chatBodies(app, chatPayloads([15, 375, 562, 1002]));

    for (const { payload, body } of bodies) {
      expect(JSON.stringify(body), JSON.stringify(payload)).not.toMatch(/987654|Consumer|31\.415/);
    }
  });
});
