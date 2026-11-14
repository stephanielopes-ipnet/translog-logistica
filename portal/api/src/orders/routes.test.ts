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
  it("responde 200 com o pedido exatamente como no contrato", async () => {
    const app = await buildTestServer();

    const response = await app.inject({ method: "GET", url: "/api/orders/15" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toStrictEqual({
      orderId: 15,
      orderDate: "2015-01-01",
      shippingMode: "Standard Class",
      trackingStatus: "Entregue",
      deadlineStatus: "Atrasado",
      delayDays: 2,
      delayWindow: "Atraso Leve (1 a 2 dias)",
      estimatedDeliveryDate: "2015-01-05",
      actualDeliveryDate: "2015-01-07",
      origin: "Memphis, Tennessee, Estados Unidos",
      destination: "Brasília, Distrito Federal, Brasil",
      region: "América do Sul",
      market: "LATAM",
      items: [
        {
          productName: "Nike Men's Dri-FIT Victory Golf Polo",
          category: "Women's Apparel",
          quantity: 1,
          total: 37.5,
        },
        {
          productName: "Pelican Sunstream 100 Kayak",
          category: "Water Sports",
          quantity: 1,
          total: 163.99,
        },
        {
          productName: "Bridgestone e6 Straight Distance NFL San Dieg",
          category: "Electronics",
          quantity: 3,
          total: 89.25,
        },
        {
          productName: "Perfect Fitness Perfect Rip Deck",
          category: "Cleats",
          quantity: 3,
          total: 151.17,
        },
        {
          productName: "Field & Stream Sportsman 16 Gun Fire Safe",
          category: "Fishing",
          quantity: 1,
          total: 331.98,
        },
      ],
      total: 773.89,
      probableCause: null,
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

    const response = await app.inject({ method: "GET", url: "/api/orders/0015" });

    expect(response.statusCode).toBe(200);
    expect(response.json().orderId).toBe(15);
  });
});

describe("GET /api/orders/samples", () => {
  it("responde os pedidos da demo por padrão, na ordem configurada", async () => {
    const app = await buildTestServer();

    const response = await app.inject({ method: "GET", url: "/api/orders/samples" });

    expect(response.statusCode).toBe(200);
    expect(orderSamplesResponseSchema.parse(response.json())).toStrictEqual({
      orderIds: [15, 375, 562, 1002],
    });
  });

  it("devolve só os configurados que existem na fonte, mantendo a ordem", async () => {
    const app = await buildTestServer({ SAMPLE_ORDER_IDS: "1002,99999,16,15" });

    const response = await app.inject({ method: "GET", url: "/api/orders/samples" });

    expect(response.json()).toStrictEqual({ orderIds: [1002, 16, 15] });
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
