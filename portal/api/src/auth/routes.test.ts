import {
  errorResponseSchema,
  sessionResponseSchema,
  staffOrderSchema,
  towerResponseSchema,
} from "@translog/contracts";
import { beforeAll, describe, expect, it, onTestFinished } from "vitest";
import { loadConfig } from "../config.ts";
import { buildServer } from "../server.ts";
import { hashPassword } from "./password.ts";
import { createSessionToken } from "./session-token.ts";

const SECRET = "segredo-de-teste-com-mais-de-32-caracteres";
const PASSWORD = "Senha-de-teste-1";
let staffUsers = "";

beforeAll(async () => {
  staffUsers = `ana@translog.com:${await hashPassword(PASSWORD)}`;
});

async function buildTestServer(env: NodeJS.ProcessEnv = {}) {
  const app = await buildServer(
    loadConfig({ STAFF_USERS: staffUsers, SESSION_SECRET: SECRET, ...env }),
    { logger: false },
  );
  onTestFinished(() => app.close());
  return app;
}

type App = Awaited<ReturnType<typeof buildTestServer>>;

function login(app: App, email: string, password: string) {
  return app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password } });
}

/** `translog_session=<valor>` do Set-Cookie, para mandar de volta como Cookie. */
function sessionCookie(setCookie: string | string[] | undefined): string {
  const header = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  return header?.split(";")[0] ?? "";
}

describe("POST /api/auth/login", () => {
  it("entra com e-mail e senha certos e grava o cookie com os atributos certos", async () => {
    const app = await buildTestServer();

    const response = await login(app, "Ana@TransLog.com", PASSWORD);

    expect(response.statusCode).toBe(204);
    const setCookie = String(response.headers["set-cookie"]);
    expect(setCookie).toMatch(/^translog_session=[\w-]+\.[\w-]+;/);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain("Max-Age=28800");
    expect(setCookie).not.toContain("Secure");
    expect(setCookie).not.toContain(PASSWORD);
  });

  it("marca o cookie como Secure em produção", async () => {
    const app = await buildTestServer({ NODE_ENV: "production" });
    const response = await login(app, "ana@translog.com", PASSWORD);
    expect(String(response.headers["set-cookie"])).toContain("Secure");
  });

  it("responde igual para senha errada e e-mail inexistente", async () => {
    const app = await buildTestServer();

    const wrongPassword = await login(app, "ana@translog.com", "errada");
    const unknownEmail = await login(app, "ninguem@translog.com", PASSWORD);

    for (const response of [wrongPassword, unknownEmail]) {
      expect(response.statusCode).toBe(401);
      expect(errorResponseSchema.parse(response.json())).toEqual({
        error: { code: "INVALID_CREDENTIALS", message: "E-mail ou senha inválidos." },
      });
      expect(response.headers["set-cookie"]).toBeUndefined();
    }
  });

  it("bloqueia com 429 depois de 5 erros seguidos do mesmo IP", async () => {
    const app = await buildTestServer();
    for (let attempt = 0; attempt < 5; attempt++) {
      expect((await login(app, "ana@translog.com", "errada")).statusCode).toBe(401);
    }

    const blocked = await login(app, "ana@translog.com", PASSWORD);

    expect(blocked.statusCode).toBe(429);
    expect(blocked.json()).toMatchObject({ error: { code: "TOO_MANY_ATTEMPTS" } });
  });

  it("recusa POST sem JSON (CSRF por formulário)", async () => {
    const app = await buildTestServer();
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { "content-type": "text/plain" },
      payload: `{"email":"ana@translog.com","password":"${PASSWORD}"}`,
    });
    expect(response.statusCode).toBe(415);
  });

  it("ninguém entra sem STAFF_USERS", async () => {
    const app = await buildTestServer({ STAFF_USERS: "", SESSION_SECRET: "" });
    expect((await login(app, "ana@translog.com", PASSWORD)).statusCode).toBe(401);
  });
});

describe("sessão, rotas do colaborador e logout", () => {
  it("GET /api/auth/session mostra a sessão e se a demonstração está ligada", async () => {
    const app = await buildTestServer();
    const anonymous = await app.inject({ method: "GET", url: "/api/auth/session" });
    expect(sessionResponseSchema.parse(anonymous.json())).toEqual({
      authenticated: false,
      email: null,
      demoAvailable: false,
    });

    const cookie = sessionCookie(
      (await login(app, "ana@translog.com", PASSWORD)).headers["set-cookie"],
    );
    const signedIn = await app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { cookie },
    });
    expect(signedIn.json()).toEqual({
      authenticated: true,
      email: "ana@translog.com",
      demoAvailable: false,
    });
  });

  it("exige sessão em /api/staff/* (401), e com sessão devolve a Torre e o pedido", async () => {
    const app = await buildTestServer();
    for (const url of ["/api/staff/tower", "/api/staff/orders/76902"]) {
      const response = await app.inject({ method: "GET", url });
      expect(response.statusCode, url).toBe(401);
      expect(response.json(), url).toMatchObject({ error: { code: "UNAUTHENTICATED" } });
    }

    const cookie = sessionCookie(
      (await login(app, "ana@translog.com", PASSWORD)).headers["set-cookie"],
    );
    const tower = await app.inject({ method: "GET", url: "/api/staff/tower", headers: { cookie } });
    const order = await app.inject({
      method: "GET",
      url: "/api/staff/orders/76902",
      headers: { cookie },
    });
    const missing = await app.inject({
      method: "GET",
      url: "/api/staff/orders/1",
      headers: { cookie },
    });

    expect(tower.statusCode).toBe(200);
    expect(towerResponseSchema.strict().safeParse(tower.json()).success).toBe(true);
    expect(order.statusCode).toBe(200);
    expect(staffOrderSchema.parse(order.json())).toMatchObject({
      orderId: 76902,
      market: "Pacific Asia",
      dispatch: { probableCause: "Promessa irreal" },
      dispatchDiagnosis: { suggestedDays: 2, onTimeWithSuggested: true },
    });
    expect(missing.statusCode).toBe(404);
  });

  it("recusa cookie adulterado e sessão expirada", async () => {
    const app = await buildTestServer();
    const valid = sessionCookie(
      (await login(app, "ana@translog.com", PASSWORD)).headers["set-cookie"],
    );
    const expired = `translog_session=${createSessionToken(
      { email: "ana@translog.com", expiresAt: Date.now() - 1000 },
      SECRET,
    )}`;
    const forged = `translog_session=${createSessionToken(
      { email: "ana@translog.com", expiresAt: Date.now() + 60_000 },
      "outro-segredo-com-mais-de-32-caracteres!!",
    )}`;

    for (const cookie of [`${valid}x`, expired, forged]) {
      const response = await app.inject({
        method: "GET",
        url: "/api/staff/tower",
        headers: { cookie },
      });
      expect(response.statusCode, cookie).toBe(401);
    }
  });

  it("logout apaga o cookie", async () => {
    const app = await buildTestServer();
    const response = await app.inject({ method: "POST", url: "/api/auth/logout", payload: {} });
    expect(response.statusCode).toBe(204);
    expect(String(response.headers["set-cookie"])).toMatch(/^translog_session=;.*Max-Age=0/);
  });
});

describe("entrada de demonstração", () => {
  it("com AUTH_DEMO=true cria a sessão de demo@translog.local", async () => {
    const app = await buildTestServer({ AUTH_DEMO: "true" });

    const response = await app.inject({ method: "POST", url: "/api/auth/demo", payload: {} });
    const cookie = sessionCookie(response.headers["set-cookie"]);
    const session = await app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { cookie },
    });

    expect(response.statusCode).toBe(204);
    expect(session.json()).toEqual({
      authenticated: true,
      email: "demo@translog.local",
      demoAvailable: true,
    });
  });

  it("sem AUTH_DEMO a rota não existe (404)", async () => {
    const app = await buildTestServer();
    const response = await app.inject({ method: "POST", url: "/api/auth/demo", payload: {} });
    expect(response.statusCode).toBe(404);
  });
});
