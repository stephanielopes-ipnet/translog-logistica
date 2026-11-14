import { errorResponseSchema, healthResponseSchema } from "@translog/contracts";
import { describe, expect, it, onTestFinished } from "vitest";
import { z } from "zod";
import { loadConfig } from "./config.ts";
import { buildServer } from "./server.ts";

async function buildTestServer(env: NodeJS.ProcessEnv = {}) {
  const app = await buildServer(loadConfig(env), { logger: false });
  onTestFinished(() => app.close());
  return app;
}

/** Servidor com rotas temporárias, registradas só para os testes (antes do ready). */
async function buildServerWithTestRoutes() {
  const app = await buildTestServer();

  app.get(
    "/test/items/:id",
    { schema: { params: z.object({ id: z.coerce.number().int().positive() }) } },
    async (request) => ({ id: request.params.id }),
  );
  app.post(
    "/test/echo",
    { schema: { body: z.object({ message: z.string().min(1) }) } },
    async (request) => request.body,
  );
  app.get("/test/crash", async () => {
    throw new Error("detalhe interno: senha=123");
  });

  return app;
}

/** Confere o formato padrão de erro e devolve o corpo já validado. */
function parseError(payload: string) {
  const result = errorResponseSchema.safeParse(JSON.parse(payload));
  expect(result.success, `corpo fora do formato padrão: ${payload}`).toBe(true);
  return result.data?.error;
}

describe("GET /api/health", () => {
  it("responde 200 no contrato, com a origem dos dados", async () => {
    const app = await buildTestServer();

    const response = await app.inject({ method: "GET", url: "/api/health" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/json");
    const body = healthResponseSchema.parse(response.json());
    expect(body.status).toBe("ok");
    expect(body.dataSource).toBe("fixtures");
  });
});

describe("tratamento de erro", () => {
  it("rota inexistente devolve 404 NOT_FOUND", async () => {
    const app = await buildServerWithTestRoutes();

    const response = await app.inject({ method: "GET", url: "/nao-existe" });

    expect(response.statusCode).toBe(404);
    expect(parseError(response.payload)).toStrictEqual({
      code: "NOT_FOUND",
      message: "Recurso não encontrado.",
    });
  });

  it("params inválidos devolvem 400 VALIDATION_ERROR citando o campo em pt-BR", async () => {
    const app = await buildServerWithTestRoutes();

    const response = await app.inject({ method: "GET", url: "/test/items/-5" });

    expect(response.statusCode).toBe(400);
    expect(parseError(response.payload)).toStrictEqual({
      code: "VALIDATION_ERROR",
      message: "Requisição inválida: id: Pequeno demais: esperava que o número fosse > 0.",
    });
  });

  it("params válidos passam pela validação", async () => {
    const app = await buildServerWithTestRoutes();

    const response = await app.inject({ method: "GET", url: "/test/items/7" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toStrictEqual({ id: 7 });
  });

  it("corpo inválido devolve 400 VALIDATION_ERROR citando o campo", async () => {
    const app = await buildServerWithTestRoutes();

    const response = await app.inject({ method: "POST", url: "/test/echo", payload: {} });

    expect(response.statusCode).toBe(400);
    const error = parseError(response.payload);
    expect(error?.code).toBe("VALIDATION_ERROR");
    expect(error?.message).toMatch(/^Requisição inválida: message: /);
  });

  it("JSON malformado devolve 400 VALIDATION_ERROR", async () => {
    const app = await buildServerWithTestRoutes();

    const response = await app.inject({
      method: "POST",
      url: "/test/echo",
      headers: { "content-type": "application/json" },
      payload: '{"message":',
    });

    expect(response.statusCode).toBe(400);
    expect(parseError(response.payload)).toStrictEqual({
      code: "VALIDATION_ERROR",
      message: "Requisição inválida.",
    });
  });

  it("outros 4xx mantêm o status e usam BAD_REQUEST", async () => {
    const app = await buildServerWithTestRoutes();

    const response = await app.inject({
      method: "POST",
      url: "/test/echo",
      headers: { "content-type": "text/xml" },
      payload: "<message>oi</message>",
    });

    expect(response.statusCode).toBe(415);
    expect(parseError(response.payload)).toStrictEqual({
      code: "BAD_REQUEST",
      message: "Tipo de conteúdo não suportado.",
    });
  });

  it("erro inesperado devolve 500 INTERNAL_ERROR sem vazar detalhes", async () => {
    const app = await buildServerWithTestRoutes();

    const response = await app.inject({ method: "GET", url: "/test/crash" });

    expect(response.statusCode).toBe(500);
    expect(parseError(response.payload)).toStrictEqual({
      code: "INTERNAL_ERROR",
      message: "Ocorreu um erro inesperado. Tente novamente.",
    });
    expect(response.payload).not.toContain("senha");
  });
});

describe("documentação", () => {
  it("GET /docs/json devolve o OpenAPI com a narrativa da TransLog", async () => {
    const app = await buildTestServer();

    const response = await app.inject({ method: "GET", url: "/docs/json" });

    expect(response.statusCode).toBe(200);
    const spec = response.json();
    expect(spec.openapi).toMatch(/^3\./);
    expect(spec.info.title).toBe("TransLog — Portal de Rastreamento");
    expect(spec.info.description).toContain("operadora logística internacional");
    expect(spec.paths).toHaveProperty("/api/health");
  });

  it("GET /docs devolve a interface do Swagger UI", async () => {
    const app = await buildTestServer();

    const response = await app.inject({ method: "GET", url: "/docs" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
  });
});
