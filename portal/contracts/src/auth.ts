import { z } from "zod";

// Login do colaborador. A sessão vai num cookie `HttpOnly` assinado: a tela nunca vê o token,
// só pergunta `GET /api/auth/session`.

/** Corpo de `POST /api/auth/login`. */
export const loginRequestSchema = z.object({
  email: z.string().trim().min(1).max(254).describe("E-mail corporativo do colaborador"),
  password: z.string().min(1).max(200).describe("Senha (nunca vai para o log)"),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

/** Resposta de `GET /api/auth/session`. */
export const sessionResponseSchema = z.object({
  authenticated: z.boolean().describe("Há uma sessão válida de colaborador neste navegador"),
  email: z.string().nullable().describe("E-mail do colaborador conectado; null sem sessão"),
  demoAvailable: z
    .boolean()
    .describe(
      "A entrada rápida de demonstração está ligada (AUTH_DEMO=true): a tela mostra o botão",
    ),
});
export type SessionResponse = z.infer<typeof sessionResponseSchema>;

/** Usuário de demonstração criado por `POST /api/auth/demo`. */
export const DEMO_STAFF_EMAIL = "demo@translog.local";
