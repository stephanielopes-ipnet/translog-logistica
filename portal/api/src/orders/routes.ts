import {
  errorResponseSchema,
  type Order,
  type OrderSamplesResponse,
  type OrdersSummaryResponse,
  orderIdParamsSchema,
  orderSamplesResponseSchema,
  orderSchema,
  ordersSummaryResponseSchema,
} from "@translog/contracts";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { OrderService } from "./order-service.ts";

export const orderRoutes: FastifyPluginAsyncZod<{ orderService: OrderService }> = async (
  app,
  { orderService },
) => {
  // Rota estática: o Fastify a prioriza sobre /orders/:orderId.
  app.get(
    "/orders/samples",
    {
      schema: {
        summary: "Pedidos de exemplo",
        description:
          "Números de pedido para os atalhos da tela (SAMPLE_ORDER_IDS), na ordem configurada. " +
          "Só aparecem os que existem na fonte de dados.",
        tags: ["pedidos"],
        response: { 200: orderSamplesResponseSchema },
      },
    },
    async (): Promise<OrderSamplesResponse> => ({ orderIds: await orderService.sampleOrderIds() }),
  );

  app.get(
    "/orders/summary",
    {
      schema: {
        summary: "Pedidos por mercado",
        description:
          "Total de pedidos e quantos vão para cada mercado (mapa do Início). Só números " +
          "agregados, calculados na carga.",
        tags: ["pedidos"],
        response: { 200: ordersSummaryResponseSchema },
      },
    },
    async (): Promise<OrdersSummaryResponse> => orderService.getSummary(),
  );

  app.get(
    "/orders/:orderId",
    {
      schema: {
        summary: "Consulta um pedido",
        description:
          "Situação, prazo, rota e itens do pedido, prontos para exibir. Pedido inexistente: " +
          '404 "ORDER_NOT_FOUND". Número fora do formato: 400 "VALIDATION_ERROR".',
        tags: ["pedidos"],
        params: orderIdParamsSchema,
        response: {
          200: orderSchema,
          400: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request): Promise<Order> => orderService.getOrder(request.params.orderId),
  );
};
