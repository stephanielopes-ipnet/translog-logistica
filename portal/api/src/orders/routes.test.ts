import { readFileSync } from "node:fs";
import { errorResponseSchema, orderSamplesResponseSchema, orderSchema } from "@translog/contracts";
import { describe, expect, it, onTestFinished } from "vitest";
import { z } from "zod";
import { loadConfig } from "../config.ts";
import { buildServer } from "../server.ts";
import { FIXTURES_FILE } from "./fixtures-repository.ts";

const fixtures = z.array(orderSchema).parse(JSON.parse(readFileSync(FIXTURES_FILE, "utf8")));

async function buildTestServer(env: NodeJS.ProcessEnv = {}) {
  const app = await buildServer(loadConfig(env), { logger: false });
  onTestFinished(() => app.close());
  return app;
}

describe("GET /api/orders/:orderId", () => {
  it("responde 200 com o pedido 76902 (demo) no contrato novo", async () => {
    const app = await buildTestServer();

    const response = await app.inject({ method: "GET", url: "/api/orders/76902" });

    expect(response.statusCode).toBe(200);
    expect(orderSchema.strict().parse(response.json())).toMatchObject({
      orderId: 76902,
      orderDate: "2018-01-27",
      referenceDate: "2018-02-06",
      status: "Em trânsito",
      shippingMode: "First Class",
      transportMode: "Aéreo expresso",
      routeType: "Internacional",
      origin: "San Jose, Califórnia, Estados Unidos",
      destination: "Jacarta, Jacarta, Indonésia",
      region: "Sudeste Asiático",
      market: "Pacific Asia",
      dispatch: { status: "Atrasado", delayDays: 1, probableCause: "Promessa irreal" },
      delivery: { expectedDate: "2018-02-01", actualDate: null, delayDays: 5 },
      currentStage: { number: 3, label: "Alfândega" },
      currentLocation: "Alfândega Jacarta (Indonésia)",
      lostAtStage: null,
      total: 194.24,
      escalateToSupport: true,
    });
  });

  it.each(fixtures.map((order) => [order.orderId, order] as const))(
    "devolve o pedido %i dos fixtures sem alteração",
    async (orderId, order) => {
      const app = await buildTestServer();

      const response = await app.inject({ method: "GET", url: `/api/orders/${orderId}` });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toStrictEqual(order);
    },
  );

  it.each(["1", "9999999999"])("responde 404 ORDER_NOT_FOUND para o pedido %s", async (orderId) => {
    const app = await buildTestServer();

    const response = await app.inject({ method: "GET", url: `/api/orders/${orderId}` });

    expect(response.statusCode).toBe(404);
    expect(errorResponseSchema.parse(response.json()).error).toStrictEqual({
      code: "ORDER_NOT_FOUND",
      message: "Pedido não encontrado. Confira o número e tente novamente.",
    });
  });

  it.each(["abc", "0", "-1", "1.5", "1e3", "0x1F", "%2015", "12345678901"])(
    "responde 400 VALIDATION_ERROR para %s",
    async (orderId) => {
      const app = await buildTestServer();

      const response = await app.inject({ method: "GET", url: `/api/orders/${orderId}` });

      expect(response.statusCode).toBe(400);
      expect(errorResponseSchema.parse(response.json()).error).toStrictEqual({
        code: "VALIDATION_ERROR",
        message:
          "Requisição inválida: orderId: deve ser um número inteiro positivo de até 10 dígitos.",
      });
    },
  );

  it("aceita zeros à esquerda, como o campo da tela", async () => {
    const app = await buildTestServer();

    const response = await app.inject({ method: "GET", url: "/api/orders/00375" });

    expect(response.statusCode).toBe(200);
    expect(response.json().orderId).toBe(375);
  });
});

describe("GET /api/orders/samples", () => {
  it("responde os pedidos da demo por padrão, na ordem configurada", async () => {
    const app = await buildTestServer();

    const response = await app.inject({ method: "GET", url: "/api/orders/samples" });

    expect(response.statusCode).toBe(200);
    expect(orderSamplesResponseSchema.parse(response.json())).toStrictEqual({
      orderIds: [76902, 375, 34, 8],
    });
  });

  it("devolve só os configurados que existem na fonte, mantendo a ordem", async () => {
    const app = await buildTestServer({ SAMPLE_ORDER_IDS: "8,99999,34,76902" });

    const response = await app.inject({ method: "GET", url: "/api/orders/samples" });

    expect(response.json()).toStrictEqual({ orderIds: [8, 34, 76902] });
  });

  it("devolve lista vazia se nenhum configurado existir", async () => {
    const app = await buildTestServer({ SAMPLE_ORDER_IDS: "1,2" });

    const response = await app.inject({ method: "GET", url: "/api/orders/samples" });

    expect(response.json()).toStrictEqual({ orderIds: [] });
  });
});

describe("documentação", () => {
  it("o OpenAPI lista as rotas de pedidos, com o número do pedido como texto de dígitos", async () => {
    const app = await buildTestServer();

    const spec = (await app.inject({ method: "GET", url: "/docs/json" })).json();

    expect(Object.keys(spec.paths)).toEqual(
      expect.arrayContaining(["/api/orders/samples", "/api/orders/{orderId}"]),
    );
    const [param] = spec.paths["/api/orders/{orderId}"].get.parameters;
    expect(param).toMatchObject({
      name: "orderId",
      in: "path",
      schema: { type: "string", pattern: "^\\d{1,10}$" },
    });
  });
});
