import {
  errorResponseSchema,
  orderIdParamsSchema,
  type StaffOrder,
  staffOrderSchema,
  type TowerResponse,
  towerResponseSchema,
} from "@translog/contracts";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { type AuthService, UnauthenticatedError } from "../auth/auth-service.ts";
import { readSessionCookie } from "../auth/session-cookie.ts";
import type { OrderService } from "../orders/order-service.ts";

export interface StaffRoutesOptions {
  auth: AuthService;
  orderService: OrderService;
}

/** Rotas do colaborador (`/api/staff/*`). Todas exigem sessão válida: o hook abaixo é o único guarda. */
export const staffRoutes: FastifyPluginAsyncZod<StaffRoutesOptions> = async (
  app,
  { auth, orderService },
) => {
  app.addHook("onRequest", async (request, reply) => {
    reply.header("cache-control", "no-store");
    if (auth.session(readSessionCookie(request)) === null) {
      throw new UnauthenticatedError();
    }
  });

  app.get(
    "/staff/orders/:orderId",
    {
      schema: {
        summary: "Pedido na visão do colaborador",
        description:
          "Tudo o que o cliente vê, mais o diagnóstico (despacho, transporte, dias por etapa, " +
          "origem do dado, contexto, valor em risco, causas da base). Exige sessão (401). " +
          'Pedido inexistente: 404 "ORDER_NOT_FOUND".',
        tags: ["colaborador"],
        params: orderIdParamsSchema,
        response: {
          200: staffOrderSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request): Promise<StaffOrder> => orderService.getStaffOrder(request.params.orderId),
  );

  app.get(
    "/staff/tower",
    {
      schema: {
        summary: "Torre de controle",
        description:
          "Indicadores, pedidos que precisam de atenção, promessa × realidade por modalidade, " +
          "em trânsito e extravios por etapa e rotas com mais atraso. Calculados na carga. " +
          "Exige sessão (401).",
        tags: ["colaborador"],
        response: { 200: towerResponseSchema, 401: errorResponseSchema },
      },
    },
    async (): Promise<TowerResponse> => orderService.getTower(),
  );
};
