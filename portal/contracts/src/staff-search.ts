import { z } from "zod";
import {
  marketSchema,
  orderIdSchema,
  orderStatusSchema,
  shippingModeSchema,
  stageSchema,
} from "./orders.ts";

// Busca de pedidos na Área do colaborador (`GET /api/staff/orders`, protegida). Varre os pedidos
// em memória e devolve linhas resumidas, paginadas. Sem dados do cliente nem financeiros.

/** Tamanho máximo do texto de busca, sem contar os espaços das pontas. */
export const STAFF_SEARCH_TEXT_MAX_LENGTH = 100;
/** Máximo de linhas por página. */
export const STAFF_SEARCH_MAX_PAGE_SIZE = 50;

export const staffSearchSortSchema = z
  .enum(["delay", "orderId", "orderDate"])
  .describe(
    "delay = maior atraso de entrega primeiro; orderId = número crescente; orderDate = mais recentes primeiro",
  );
export type StaffSearchSort = z.infer<typeof staffSearchSortSchema>;

const textError = `deve ter até ${STAFF_SEARCH_TEXT_MAX_LENGTH} caracteres`;

/** Query string de `GET /api/staff/orders` (todos os filtros são opcionais e se somam). */
export const staffSearchQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .max(STAFF_SEARCH_TEXT_MAX_LENGTH, { error: textError })
    .optional()
    .describe(
      "Só dígitos: número do pedido que começa com eles. Texto: cidade, estado, país, região ou " +
        "rota, sem diferença de acentos e maiúsculas",
    ),
  status: orderStatusSchema.optional(),
  shippingMode: shippingModeSchema.optional(),
  market: marketSchema.optional(),
  stage: z.coerce
    .number()
    .int()
    .min(0)
    .max(5)
    .optional()
    .describe("Etapa atual (0 Pedido a 5 Última milha)"),
  cause: z
    .string()
    .trim()
    .min(1)
    .max(STAFF_SEARCH_TEXT_MAX_LENGTH, { error: textError })
    .optional()
    .describe(
      "Motivo provável nos termos da base, no despacho ou na entrega (ex.: Promessa irreal)",
    ),
  minDelayDays: z.coerce
    .number()
    .int()
    .min(0)
    .max(365)
    .optional()
    .describe("Atraso de entrega mínimo, em dias"),
  escalated: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional()
    .describe("true = só os encaminhados à central; false = só os não encaminhados"),
  sort: staffSearchSortSchema.default("delay"),
  page: z.coerce.number().int().min(1).max(10_000).default(1).describe("Página, a partir de 1"),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(STAFF_SEARCH_MAX_PAGE_SIZE)
    .default(20)
    .describe(`Linhas por página (1 a ${STAFF_SEARCH_MAX_PAGE_SIZE})`),
});
export type StaffSearchQuery = z.infer<typeof staffSearchQuerySchema>;

/** Uma linha do resultado: o bastante para escolher o pedido e abrir a visão completa. */
export const staffSearchRowSchema = z.object({
  orderId: orderIdSchema,
  orderDate: z.iso.date().describe("Data do pedido (AAAA-MM-DD)"),
  status: orderStatusSchema,
  shippingMode: shippingModeSchema,
  market: marketSchema,
  routeService: z.string().min(1).describe("Rota de serviço da base (`rota_servico`)"),
  origin: z.string().describe("Origem do despacho: Cidade, Estado, País"),
  destination: z.string().describe("Destino: Cidade, Estado, País"),
  stage: stageSchema.nullable().describe("Etapa atual (ou última)"),
  location: z.string().nullable().describe("Local atual do volume"),
  dispatchDelayDays: z.number().int().nullable().describe("Atraso do despacho, em dias"),
  deliveryDelayDays: z
    .number()
    .int()
    .nullable()
    .describe("Atraso da entrega, em dias (em trânsito, até a data de referência)"),
  escalateToSupport: z.boolean().describe("Encaminhado à central"),
  probableCause: z
    .string()
    .nullable()
    .describe("Motivo provável nos termos da base (entrega; senão, despacho)"),
});
export type StaffSearchRow = z.infer<typeof staffSearchRowSchema>;

/** Resposta de `GET /api/staff/orders`. */
export const staffSearchResponseSchema = z.object({
  total: z.number().int().nonnegative().describe("Quantos pedidos atendem aos filtros"),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  results: z.array(staffSearchRowSchema).describe("Linhas da página pedida, na ordem pedida"),
});
export type StaffSearchResponse = z.infer<typeof staffSearchResponseSchema>;
