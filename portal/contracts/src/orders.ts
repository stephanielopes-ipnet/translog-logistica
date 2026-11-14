import { z } from "zod";

// Valores de dados como vêm da base (Silver em português; modalidade e mercado em inglês).

/** Número de pedido: inteiro positivo de até 10 dígitos, como o campo da tela. */
export const orderIdSchema = z
  .number()
  .int()
  .positive()
  .max(9_999_999_999)
  .describe("Número do pedido");

export const trackingStatusSchema = z
  .enum(["Entregue", "Em Trânsito", "Aguardando Liberação", "Cancelado"])
  .describe("Situação do pedido, como vem da base");
export type TrackingStatus = z.infer<typeof trackingStatusSchema>;

export const deadlineStatusSchema = z
  .enum(["Atrasado", "No Prazo", "Adiantado", "Não Avaliado", "Cancelado"])
  .describe(
    "Situação do prazo, independente da situação do pedido. Não Avaliado: aguardando liberação",
  );
export type DeadlineStatus = z.infer<typeof deadlineStatusSchema>;

export const shippingModeSchema = z
  .enum(["Standard Class", "Second Class", "First Class", "Same Day"])
  .describe("Modalidade de envio (nível de serviço), em inglês como na base");
export type ShippingMode = z.infer<typeof shippingModeSchema>;

export const marketSchema = z
  .enum(["LATAM", "Europe", "Pacific Asia", "USCA", "Africa"])
  .describe("Mercado logístico de destino, em inglês como na base");
export type Market = z.infer<typeof marketSchema>;

/** Data de calendário `AAAA-MM-DD`, sem hora nem fuso. */
const calendarDate = z.iso.date();

/** Um item do pedido. */
export const orderItemSchema = z.object({
  productName: z.string().min(1).describe("Nome do produto, como vem da base"),
  category: z
    .string()
    .describe("Categoria do produto (às vezes não combina com o produto: é assim na base)"),
  quantity: z.number().int().positive().describe("Quantidade"),
  total: z.number().nonnegative().describe("Valor do item em dólar, já com desconto"),
});
export type OrderItem = z.infer<typeof orderItemSchema>;

/**
 * Pedido pronto para a tela (view model). Não tem dados do cliente, de pagamento
 * nem financeiros internos (lucro, margem, desconto).
 */
export const orderSchema = z.object({
  orderId: orderIdSchema,
  orderDate: calendarDate.describe("Data do pedido (AAAA-MM-DD)"),
  shippingMode: shippingModeSchema,
  trackingStatus: trackingStatusSchema,
  deadlineStatus: deadlineStatusSchema,
  delayDays: z
    .number()
    .int()
    .nullable()
    .describe("Dias de atraso; negativo = adiantado; null = não se aplica"),
  delayWindow: z.string().describe("Faixa de atraso, ex.: Atraso Crítico (3+ dias)"),
  estimatedDeliveryDate: calendarDate.describe("Entrega prevista (AAAA-MM-DD)"),
  actualDeliveryDate: calendarDate
    .nullable()
    .describe("Entrega realizada (AAAA-MM-DD); só em pedidos entregues"),
  origin: z.string().describe("Origem do despacho: Cidade, Estado, País"),
  destination: z.string().describe("Destino: Cidade, Estado, País"),
  region: z.string().describe("Região de destino, ex.: América Central"),
  market: marketSchema,
  items: z.array(orderItemSchema).min(1).describe("Itens do pedido"),
  total: z.number().nonnegative().describe("Total do pedido em dólar: soma dos itens"),
  probableCause: z
    .string()
    .nullable()
    .describe("Motivo provável do atraso, quando houver. Nunca é causa comprovada"),
});
export type Order = z.infer<typeof orderSchema>;

const orderIdParamError = "deve ser um número inteiro positivo de até 10 dígitos";

/** Parâmetros de `GET /api/orders/:orderId`: só dígitos, até 10, maior que zero. */
export const orderIdParamsSchema = z.object({
  orderId: z
    .string()
    .regex(/^\d{1,10}$/, { error: orderIdParamError })
    .transform(Number)
    .pipe(z.number().positive({ error: orderIdParamError }))
    .describe("Número do pedido: só dígitos, até 10"),
});

/** Resposta de `GET /api/orders/samples`. */
export const orderSamplesResponseSchema = z.object({
  orderIds: z
    .array(orderIdSchema)
    .describe("Pedidos de exemplo para a tela, na ordem de exibição; só os que existem"),
});
export type OrderSamplesResponse = z.infer<typeof orderSamplesResponseSchema>;
