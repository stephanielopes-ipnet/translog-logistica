import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { orderSchema } from "@translog/contracts";
import Fastify, { type FastifyInstance } from "fastify";
import { describe, expect, it, onTestFinished } from "vitest";
import { z } from "zod";
import { loadConfig } from "./config.ts";
import { type ContainerOverrides, createContainer } from "./container.ts";
import { FIXTURES_FILE } from "./orders/fixtures-repository.ts";
import { type OrderRecord, orderRecordSchema } from "./orders/order-record.ts";
import type { OrderRepository } from "./orders/order-repository.ts";
import { createOrderSearch } from "./orders/order-search.ts";
import { computeOrderStats } from "./orders/order-stats.ts";
import { NO_PROMISE_SCENARIO } from "./orders/promise-scenario.ts";
import { buildServer } from "./server.ts";
import { startFakeDatabricks } from "./testing/fake-databricks.ts";
import { tempDir } from "./testing/temp-dir.ts";

// Regra fixa do portal: nenhuma resposta traz dado do cliente, de pagamento ou financeiro
// interno. Estes testes varrem todas as chaves (em qualquer nível) de todas as respostas.

/**
 * Palavras de dados proibidos que não podem aparecer no texto das respostas do chat.
 * "pagamento" sozinho é permitido: as situações "Aguardando pagamento" e "Não pago (expirado)"
 * são dados do pedido. Proibido é o tipo/forma de pagamento.
 */
const FORBIDDEN_TEXT =
  /cliente|customer|segment|tipo de pagamento|forma de pagamento|payment|lucro|profit|margem|margin|desconto|discount|preço unitário|unit price|valor bruto|latitude|longitude/i;

/** Colunas proibidas (antigas e das tabelas consumo_*) e equivalentes em inglês. */
const FORBIDDEN_KEY =
  /cliente|customer|client|segment|pagamento|payment|lucro|profit|margem|margin|desconto|discount|preco|price|bruto|gross|id_produto|productId|latitude|longitude|^lat$|^lng$|^lon$|resumo/i;

/**
 * Diagnóstico interno: só na visão do colaborador. O cliente recebe o motivo em linguagem dele,
 * sem a frase técnica da base, sem as causas nos termos da base e sem o mercado logístico.
 */
const INTERNAL_KEYS = [
  "explanation",
  "market",
  "routeService",
  "daysToDispatch",
  "dispatchDiagnosis",
  "transportDiagnosis",
  "stageDays",
  "dataOrigin",
  "context",
  "valueAtRisk",
  "aiSummary",
  "rawTimeline",
];

/** Termos da base que o cliente nunca vê (causas, estatística interna, mercados). */
const INTERNAL_TEXT =
  /Promessa irreal|Atraso operacional|não recuperado no transporte|Volume sem atualização|cumprido em apenas|\d\.\d%|Pacific Asia|LATAM|USCA|"Europe"|"Africa"/;

/** Todas as chaves de objetos, em qualquer nível. */
function allKeys(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(allKeys);
  }
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([key, child]) => [key, ...allKeys(child)]);
  }
  return [];
}

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

const fixtures = z.array(orderRecordSchema).parse(JSON.parse(readFileSync(FIXTURES_FILE, "utf8")));

/** Amostra das tabelas consumo_* com as colunas proibidas preenchidas com valores fictícios. */
const SAMPLE_DIR = fileURLToPath(new URL("./orders/fixtures/consumo/", import.meta.url));
const ALL_IDS = fixtures.map((order) => order.orderId);

/** Ambiente de cada fonte. `databricks` usa um Databricks falso que serve a mesma amostra. */
const SOURCES = [
  { source: "fixtures", env: async () => ({}) },
  { source: "file", env: async () => ({ DATA_SOURCE: "file", DATA_DIR: SAMPLE_DIR }) },
  {
    source: "databricks",
    env: async () => ({
      DATA_SOURCE: "databricks",
      DATABRICKS_HOST: (await startFakeDatabricks()).baseUrl,
      DATABRICKS_WAREHOUSE_ID: "wh-teste",
      DATABRICKS_TOKEN: "token-de-teste",
      DATA_DIR: tempDir(),
    }),
  },
];

/** Repositório sobre os fixtures que acrescenta campos (`leak`) a cada registro devolvido. */
function leakyRepository(leak: (record: OrderRecord) => object): OrderRepository {
  return {
    async findById(orderId) {
      const record = fixtures.find((candidate) => candidate.orderId === orderId);
      return record ? (Object.assign({}, record, leak(record)) as OrderRecord) : null;
    },
    count: async () => fixtures.length,
    search: createOrderSearch(fixtures),
    stats: () => computeOrderStats(fixtures),
    scenario: () => NO_PROMISE_SCENARIO,
  };
}

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
    "/api/orders/summary",
    "/api/auth/session",
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

  it.each([...SOURCES])("nenhuma resposta tem chave proibida (fonte $source)", async ({ env }) => {
    const app = await buildTestServer(await env());

    const bodies = await responseBodies(app, allUrls(ALL_IDS));

    for (const { url, body } of bodies) {
      expect(forbiddenKeys(body), url).toEqual([]);
    }
  });

  it.each(SOURCES.slice(1))(
    "nenhuma resposta traz valores das colunas proibidas ou sem uso das tabelas (fonte $source)",
    async ({ env }) => {
      // Na amostra, essas colunas têm valores FICTICIO-* e SEM-USO.
      const app = await buildTestServer(await env());

      const bodies = await responseBodies(app, allUrls(ALL_IDS));

      expect(bodies.map(({ body }) => body).filter((body) => body.orderId)).toHaveLength(9);
      for (const { url, body } of bodies) {
        expect(JSON.stringify(body), url).not.toMatch(/FICTICIO|SEM-USO/);
      }
    },
  );

  it("campos fora do contrato são descartados na resposta, mesmo se a fonte os trouxer", async () => {
    const app = await buildTestServer(
      {},
      {
        orderRepository: leakyRepository((record) => ({
          id_cliente: 123,
          segmento_cliente: "Consumer",
          valor_desconto: 99.9,
          items: record.items.map((item) =>
            Object.assign({}, item, { preco_unitario: 1.5, id_produto: 565 }),
          ),
        })),
      },
    );

    const response = await app.inject({ method: "GET", url: "/api/orders/76902" });

    expect(response.statusCode).toBe(200);
    expect(forbiddenKeys(response.json())).toEqual([]);
    expect(Object.keys(response.json()).sort()).toEqual(Object.keys(orderSchema.shape).sort());
  });
});

describe("privacidade no chat (assistente simulado)", () => {
  it.each([...SOURCES])(
    "nenhuma resposta do chat tem chave, valor ou texto proibido (fonte $source)",
    async ({ env }) => {
      const app = await buildTestServer(await env());

      const bodies = await chatBodies(app, chatPayloads(ALL_IDS));

      expect(bodies.filter(({ body }) => body.reply).length).toBe(bodies.length - 1);
      for (const { payload, body } of bodies) {
        const where = JSON.stringify(payload);
        expect(forbiddenKeys(body), where).toEqual([]);
        expect(JSON.stringify(body), where).not.toMatch(/FICTICIO|SEM-USO/);
        expect(body.reply ?? "", where).not.toMatch(FORBIDDEN_TEXT);
        expect(body.reply ?? "", where).not.toMatch(INTERNAL_TEXT);
      }
    },
  );

  it("o chat não repassa campos fora do contrato, mesmo se a fonte os trouxer", async () => {
    const app = await buildTestServer(
      {},
      {
        orderRepository: leakyRepository(() => ({
          id_cliente: 987654,
          segmento_cliente: "Consumer",
          valor_bruto_venda: 31.415,
        })),
      },
    );

    const bodies = await chatBodies(app, chatPayloads(ALL_IDS));

    for (const { payload, body } of bodies) {
      expect(JSON.stringify(body), JSON.stringify(payload)).not.toMatch(/987654|Consumer|31\.415/);
    }
  });
});

describe("visão do cliente × visão do colaborador", () => {
  it.each([...SOURCES])(
    "o cliente nunca recebe o diagnóstico nem os termos internos (fonte $source)",
    async ({ env }) => {
      const app = await buildTestServer(await env());

      const bodies = await responseBodies(
        app,
        ALL_IDS.map((id) => `/api/orders/${id}`),
      );

      for (const { url, body } of bodies) {
        const record = fixtures.find((candidate) => candidate.orderId === body.orderId);
        expect(record, url).toBeDefined();
        expect(
          allKeys(body).filter((key) => INTERNAL_KEYS.includes(key)),
          url,
        ).toEqual([]);
        const json = JSON.stringify(body);
        expect(json, url).not.toMatch(INTERNAL_TEXT);
        for (const text of [record?.explanation, record?.aiSummary, record?.rawTimeline]) {
          if (text) expect(json, url).not.toContain(text);
        }
        expect(orderSchema.strict().safeParse(body).success, url).toBe(true);
      }
    },
  );

  it.each([...SOURCES])(
    "a visão do colaborador tem o diagnóstico e nenhuma chave ou valor proibido (fonte $source)",
    async ({ env }) => {
      const config = loadConfig(await env());
      const container = await createContainer(config, { log: Fastify({ logger: false }).log });
      onTestFinished(() => container.close());

      const staffOrders = await Promise.all(
        ALL_IDS.map((id) => container.orderService.getStaffOrder(id)),
      );

      for (const staffOrder of staffOrders) {
        const where = `pedido ${staffOrder.orderId}`;
        expect(forbiddenKeys(staffOrder), where).toEqual([]);
        expect(JSON.stringify(staffOrder), where).not.toMatch(/FICTICIO|SEM-USO/);
        expect(Object.keys(staffOrder), where).toEqual(
          expect.arrayContaining(INTERNAL_KEYS.filter((key) => key !== "daysToDispatch")),
        );
      }
    },
  );

  it.each([...SOURCES])(
    "a Torre, a busca e o pedido do colaborador (com sessão) não têm chave ou valor proibido (fonte $source)",
    async ({ env }) => {
      const app = await buildTestServer({
        ...(await env()),
        AUTH_DEMO: "true",
        SESSION_SECRET: "segredo-de-teste-com-mais-de-32-caracteres",
      });
      const demo = await app.inject({ method: "POST", url: "/api/auth/demo", payload: {} });
      const cookie = String(demo.headers["set-cookie"]).split(";")[0] ?? "";

      const urls = [
        "/api/staff/tower",
        "/api/staff/orders?pageSize=50",
        "/api/staff/orders?q=brasil&sort=date",
        ...ALL_IDS.map((id) => `/api/staff/orders/${id}`),
      ];
      for (const url of urls) {
        const response = await app.inject({ method: "GET", url, headers: { cookie } });
        expect(response.statusCode, url).toBe(200);
        expect(forbiddenKeys(response.json()), url).toEqual([]);
        expect(response.body, url).not.toMatch(/FICTICIO|SEM-USO/);
      }
    },
  );
});
