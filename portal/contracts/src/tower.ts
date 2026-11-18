import { z } from "zod";
import { marketSchema, shippingModeSchema, stageSchema } from "./orders.ts";

// Torre de controle (`GET /api/staff/tower`, protegida) e resumo público do Início
// (`GET /api/orders/summary`). Só números agregados e pedidos, sem dados do cliente.

const count = z.number().int().nonnegative();

const percent = z
  .number()
  .min(0)
  .max(100)
  .nullable()
  .describe("Percentual com 1 casa decimal (0 a 100); null = sem pedidos para calcular");

/** Quantos atenderam ao prazo de quantos avaliados. */
const onTimeIndicatorSchema = z.object({
  onTime: count.describe("Pedidos no prazo (ou adiantados)"),
  total: count.describe("Pedidos avaliados"),
  pct: percent.describe("% no prazo"),
});

/** Um pedido em trânsito na fila de atenção (ordenada pelo atraso de entrega, maior primeiro). */
export const attentionOrderSchema = z.object({
  orderId: z.number().int().positive(),
  origin: z.string().describe("Origem do despacho: Cidade, Estado, País"),
  destination: z.string().describe("Destino: Cidade, Estado, País"),
  market: marketSchema,
  shippingMode: shippingModeSchema,
  stage: stageSchema.nullable().describe("Etapa atual"),
  location: z.string().nullable().describe("Local atual do volume"),
  delayDays: z.number().int().nullable().describe("Atraso de entrega até a data de referência"),
  probableCause: z
    .string()
    .nullable()
    .describe("Motivo provável nos termos da base (entrega; senão, despacho)"),
});
export type AttentionOrder = z.infer<typeof attentionOrderSchema>;

/** Promessa × realidade de uma modalidade. */
export const promiseByModeSchema = z.object({
  shippingMode: shippingModeSchema,
  promisedDays: count.describe("Prazo de despacho prometido, em dias"),
  dispatchedOrders: count.describe("Pedidos despachados"),
  lateDispatchPct: percent.describe("% dos despachos que atrasaram"),
  evaluatedDeliveries: count.describe("Entregas avaliadas (entregues ou em trânsito)"),
  lateDeliveryPct: percent.describe("% das entregas que atrasaram"),
  suggestedDays: count
    .nullable()
    .describe('Prazo sugerido ("Promessa ajustada" da Gold); null = sem cenário'),
  lateDispatchPctWithSuggested: percent.describe(
    "% dos despachos que estariam atrasados com o prazo sugerido",
  ),
});
export type PromiseByMode = z.infer<typeof promiseByModeSchema>;

export const stageCountSchema = z.object({
  stage: z.number().int().min(0).max(5),
  label: z.string().min(1),
  count,
});
export type StageCount = z.infer<typeof stageCountSchema>;

export const lateRouteSchema = z.object({
  routeService: z.string().min(1).describe("Rota de serviço (`rota_servico`)"),
  evaluatedDeliveries: count,
  lateDeliveryPct: percent,
});
export type LateRoute = z.infer<typeof lateRouteSchema>;

/** Resposta de `GET /api/staff/tower`: números calculados uma vez, na carga dos pedidos. */
export const towerResponseSchema = z.object({
  referenceDate: z.iso.date().nullable().describe('Data de referência da base (o "hoje")'),
  totalOrders: count,
  indicators: z.object({
    dispatchOnTime: onTimeIndicatorSchema.describe("Despachos no prazo (pedidos despachados)"),
    deliveryOnTime: onTimeIndicatorSchema.describe(
      "Entregas no prazo (entregues e em trânsito; extraviados fora)",
    ),
    inTransit: z.object({
      total: count.describe("Pedidos em trânsito agora"),
      late: count.describe("Com atraso de entrega"),
      lateForSupport: count.describe("Com 3 dias ou mais de atraso"),
    }),
    escalatedToSupport: count.describe("Pedidos encaminhados à central"),
    lost: count.describe("Pedidos extraviados (rastreio simulado)"),
  }),
  attention: z.array(attentionOrderSchema).describe("Pedidos em trânsito, mais atrasados primeiro"),
  promiseByMode: z.array(promiseByModeSchema),
  inTransitByStage: z.array(stageCountSchema),
  lostByStage: z.array(stageCountSchema),
  lateRoutes: z
    .array(lateRouteSchema)
    .describe("Rotas com mais atraso na entrega (mínimo de 300 entregas avaliadas)"),
  dashboardUrl: z
    .url()
    .nullable()
    .describe("Painel completo de performance (DASHBOARD_URL); null = link a definir"),
});
export type TowerResponse = z.infer<typeof towerResponseSchema>;

/** Resposta de `GET /api/orders/summary` (pública): pedidos por mercado, para o mapa do Início. */
export const ordersSummaryResponseSchema = z.object({
  totalOrders: count,
  markets: z
    .array(z.object({ market: marketSchema, orders: count }))
    .describe("Pedidos por mercado de destino, na ordem fixa do mapa"),
});
export type OrdersSummaryResponse = z.infer<typeof ordersSummaryResponseSchema>;
