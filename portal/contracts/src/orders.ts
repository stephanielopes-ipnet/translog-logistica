import { z } from "zod";

// Valores de dados como vêm da base (tabelas `consumo_*` da Silver, em português; modalidade
// e mercado em inglês). Fonte e regras: portal/docs/backend.md, seção "Fontes de dados".

/** Número de pedido: inteiro positivo de até 10 dígitos, como o campo da tela. */
export const orderIdSchema = z
  .number()
  .int()
  .positive()
  .max(9_999_999_999)
  .describe("Número do pedido");

export const orderStatusSchema = z
  .enum([
    "Entregue no prazo",
    "Entregue com atraso",
    "Em trânsito",
    "Extraviado",
    "Cancelado",
    "Não pago (expirado)",
    "Aguardando pagamento",
  ])
  .describe("Situação do pedido na data de referência da base, como vem da base");
export type OrderStatus = z.infer<typeof orderStatusSchema>;

export const shippingModeSchema = z
  .enum(["Standard Class", "Second Class", "First Class", "Same Day"])
  .describe("Modalidade de envio (nível de serviço), em inglês como na base");
export type ShippingMode = z.infer<typeof shippingModeSchema>;

export const transportModeSchema = z
  .enum(["Aéreo consolidado", "Aéreo expresso", "Rodoviário"])
  .describe("Modal de transporte; só existe depois do despacho");
export type TransportMode = z.infer<typeof transportModeSchema>;

export const routeTypeSchema = z
  .enum(["Internacional", "Doméstica"])
  .describe("Tipo de rota. Rota doméstica nunca passa por alfândega");
export type RouteType = z.infer<typeof routeTypeSchema>;

export const marketSchema = z
  .enum(["LATAM", "Europe", "Pacific Asia", "USCA", "Africa"])
  .describe("Mercado logístico de destino, em inglês como na base");
export type Market = z.infer<typeof marketSchema>;

export const dispatchStatusSchema = z
  .enum(["Atrasado", "No Prazo", "Adiantado", "Não Avaliado", "Cancelado"])
  .describe("Situação do prazo de despacho. Não Avaliado: pedido não pago, sem despacho");
export type DispatchStatus = z.infer<typeof dispatchStatusSchema>;

/** Data de calendário `AAAA-MM-DD`, sem hora nem fuso. */
const calendarDate = z.iso.date();

const delayDays = z
  .number()
  .int()
  .nullable()
  .describe("Dias de atraso; negativo = adiantado; null = não se aplica (ainda sem data)");

const probableCause = z
  .string()
  .min(1)
  .nullable()
  .describe(
    "Motivo provável do atraso nesta etapa, como vem da base (ex.: Promessa irreal). " +
      "null = sem atraso ou não se aplica. Nunca é causa comprovada",
  );

/** Etapa da viagem: 0 Pedido · 1 Coleta · 2 Voo · 3 Alfândega · 4 Transferência · 5 Última milha. */
export const stageSchema = z.object({
  number: z.number().int().min(0).max(5).describe("Número da etapa, de 0 (Pedido) a 5"),
  label: z.string().min(1).describe("Nome da etapa, ex.: Alfândega"),
});
export type Stage = z.infer<typeof stageSchema>;

/** Prazo de despacho: do pedido até sair da expedição de origem. */
export const dispatchSchema = z.object({
  promisedDays: z
    .number()
    .int()
    .nonnegative()
    .describe("Prazo de despacho prometido pela modalidade, em dias"),
  expectedDate: calendarDate.nullable().describe("Despacho previsto (AAAA-MM-DD)"),
  actualDate: calendarDate.nullable().describe("Despacho realizado (AAAA-MM-DD)"),
  delayDays,
  status: dispatchStatusSchema,
  probableCause,
});
export type Dispatch = z.infer<typeof dispatchSchema>;

/** Prazo de entrega ao destinatário. */
export const deliverySchema = z.object({
  expectedDate: calendarDate.nullable().describe("Entrega prevista (AAAA-MM-DD)"),
  actualDate: calendarDate.nullable().describe("Entrega realizada (AAAA-MM-DD)"),
  delayDays: delayDays.describe(
    "Dias de atraso na entrega; em trânsito, conta até a data de referência. " +
      "Negativo = adiantado; null = não se aplica",
  ),
  probableCause,
});
export type Delivery = z.infer<typeof deliverySchema>;

/** Um evento da linha do tempo. */
export const orderEventSchema = z.object({
  date: calendarDate.describe("Data do evento (AAAA-MM-DD)"),
  code: z.string().min(1).describe("Código do evento, ex.: CHEGADA_ALFANDEGA"),
  description: z.string().min(1).describe("Descrição, ex.: Chegada à alfândega"),
  stage: z.number().int().min(0).max(5).describe("Número da etapa do evento"),
  stageLabel: z.string().min(1).describe("Nome da etapa do evento"),
  location: z.string().min(1).nullable().describe("Local ou situação do volume no evento"),
});
export type OrderEvent = z.infer<typeof orderEventSchema>;

/** Um item do pedido (uma linha; `quantity` pode ser maior que 1). */
export const orderItemSchema = z.object({
  productName: z.string().min(1).describe("Nome do produto, como vem da base"),
  category: z
    .string()
    .describe("Categoria do produto (às vezes não combina com o produto: é assim na base)"),
  quantity: z.number().int().positive().describe("Quantidade (unidades)"),
  total: z.number().nonnegative().describe("Valor do item em dólar, já com desconto"),
});
export type OrderItem = z.infer<typeof orderItemSchema>;

/**
 * Pedido pronto para a tela (view model). Não tem dados do cliente, de pagamento
 * nem financeiros internos (preço unitário, valor bruto, desconto).
 */
export const orderSchema = z.object({
  orderId: orderIdSchema,
  orderDate: calendarDate.describe("Data do pedido (AAAA-MM-DD)"),
  referenceDate: calendarDate.describe(
    'Data de referência da base (o "hoje" dos dados, AAAA-MM-DD). A situação vale nesta data',
  ),
  status: orderStatusSchema,
  shippingMode: shippingModeSchema,
  transportMode: transportModeSchema.nullable(),
  routeType: routeTypeSchema,
  origin: z.string().describe("Origem do despacho: Cidade, Estado, País"),
  destination: z.string().describe("Destino: Cidade, Estado, País"),
  region: z.string().describe("Região de destino, ex.: América Central"),
  market: marketSchema,
  dispatch: dispatchSchema,
  delivery: deliverySchema,
  explanation: z
    .string()
    .min(1)
    .nullable()
    .describe("Explicação pronta da base sobre prazos e ocorrências do pedido"),
  currentStage: stageSchema.nullable().describe("Etapa atual (ou última) da viagem"),
  currentLocation: z
    .string()
    .min(1)
    .nullable()
    .describe("Onde o volume está agora (ou onde foi entregue ou visto pela última vez)"),
  lostAtStage: stageSchema.nullable().describe("Etapa em que o volume foi extraviado"),
  events: z.array(orderEventSchema).min(1).describe("Linha do tempo, em ordem"),
  items: z.array(orderItemSchema).min(1).describe("Itens do pedido"),
  total: z.number().nonnegative().describe("Total do pedido em dólar: soma dos itens"),
  escalateToSupport: z
    .boolean()
    .describe(
      "Encaminhar à central de atendimento (atraso de entrega de 3 dias ou mais, ou extravio)",
    ),
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
