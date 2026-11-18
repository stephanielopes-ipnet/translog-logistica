import {
  errorResponseSchema,
  loginRequestSchema,
  type SessionResponse,
  sessionResponseSchema,
} from "@translog/contracts";
import type { FastifyRequest } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { type AuthService, JsonRequiredError } from "./auth-service.ts";
import { readSessionCookie, writeSessionCookie } from "./session-cookie.ts";

export interface AuthRoutesOptions {
  auth: AuthService;
  /** `Secure` no cookie (produção). */
  secureCookie: boolean;
}

/** Pedidos de escrita só com JSON: junto com `SameSite=Lax`, cobre CSRF neste escopo. */
function isJson(request: FastifyRequest): boolean {
  return (request.headers["content-type"] ?? "").toLowerCase().startsWith("application/json");
}

export const authRoutes: FastifyPluginAsyncZod<AuthRoutesOptions> = async (
  app,
  { auth, secureCookie },
) => {
  app.addHook("onRequest", async (request) => {
    if (request.method === "POST" && !isJson(request)) {
      throw new JsonRequiredError();
    }
  });

  app.post(
    "/auth/login",
    {
      schema: {
        summary: "Entra na Área do colaborador",
        description:
          "Confere e-mail e senha (`STAFF_USERS`) e grava o cookie de sessão (`HttpOnly`, 8 h). " +
          'Erro: 401 "INVALID_CREDENTIALS" (mesma mensagem para e-mail ou senha errados); ' +
          '429 "TOO_MANY_ATTEMPTS" depois de 5 erros em 1 minuto do mesmo IP.',
        tags: ["colaborador"],
        body: loginRequestSchema,
        response: { 204: z.null(), 401: errorResponseSchema, 429: errorResponseSchema },
      },
    },
    async (request, reply) => {
      try {
        const token = await auth.login(request.body.email, request.body.password, request.ip);
        request.log.info({ outcome: "ok" }, "Login do colaborador");
        writeSessionCookie(reply, token, secureCookie);
        return reply.status(204).send(null);
      } catch (error) {
        // Sem senha, e-mail nem cookie no log.
        request.log.info({ outcome: "rejected" }, "Login do colaborador");
        throw error;
      }
    },
  );

  app.post(
    "/auth/logout",
    {
      schema: {
        summary: "Sai da Área do colaborador",
        description: "Apaga o cookie de sessão.",
        tags: ["colaborador"],
        response: { 204: z.null() },
      },
    },
    async (_request, reply) => {
      writeSessionCookie(reply, null, secureCookie);
      return reply.status(204).send(null);
    },
  );

  app.get(
    "/auth/session",
    {
      schema: {
        summary: "Sessão do colaborador neste navegador",
        description:
          "Diz se há sessão válida (e o e-mail) e se a entrada de demonstração está ligada. " +
          "A tela usa no lugar de ler o cookie, que é HttpOnly.",
        tags: ["colaborador"],
        response: { 200: sessionResponseSchema },
      },
    },
    async (request, reply): Promise<SessionResponse> => {
      reply.header("cache-control", "no-store");
      const session = auth.session(readSessionCookie(request));
      return {
        authenticated: session !== null,
        email: session?.email ?? null,
        demoAvailable: auth.demoAvailable,
      };
    },
  );

  // Entrada rápida para a banca e o desenvolvimento: sem AUTH_DEMO=true a rota nem existe (404).
  if (auth.demoAvailable) {
    app.post(
      "/auth/demo",
      {
        schema: {
          summary: "Entra como demonstração",
          description:
            "Cria a sessão do usuário demo@translog.local. Só existe com AUTH_DEMO=true.",
          tags: ["colaborador"],
          response: { 204: z.null() },
        },
      },
      async (request, reply) => {
        request.log.info({ outcome: "demo" }, "Login do colaborador");
        writeSessionCookie(reply, auth.demoLogin(), secureCookie);
        return reply.status(204).send(null);
      },
    );
  }
};
