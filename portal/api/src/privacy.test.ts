import { readFileSync } from "node:fs";
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

  it.each([{ source: "fixtures", env: {}, orderIds: fixtures.map((order) => order.orderId) }])(
    "nenhuma resposta tem chave proibida (fonte $source)",
    async ({ env, orderIds }) => {
      const app = await buildTestServer(env);

      const bodies = await responseBodies(app, allUrls(orderIds));

      for (const { url, body } of bodies) {
        expect(forbiddenKeys(body), url).toEqual([]);
      }
    },
  );

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
