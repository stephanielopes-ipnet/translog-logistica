import { z } from "zod";
import {
  marketSchema,
  orderIdSchema,
  orderStatusSchema,
  shippingModeSchema,
  stageSchema,
} from "./orders.ts";

// Busca de pedidos na Área do colaborador (`GET /api/staff/orders`, protegida). Filtra os pedidos
// em memória e devolve linhas resumidas, paginadas. Sem dados do cliente nem financeiros, e sem
// o resumo para a IA nem a linha do tempo bruta (só na visão completa do pedido).

/** Tamanho máximo do texto de busca, sem contar os espaços das pontas. */
export const STAFF_SEARCH_TEXT_MAX_LENGTH = 60;
/** Máximo de linhas por página. */
export const STAFF_SEARCH_MAX_PAGE_SIZE = 50;

export const staffSearchSortSchema = z
  .enum(["delay", "order", "date"])
  .describe(
    "delay = maior atraso de entrega primeiro; order = número crescente; date = mais recentes " +
      "primeiro. Padrão: delay com minDelayDays; order nos demais casos",
  );
export type StaffSearchSort = z.infer<typeof staffSearchSortSchema>;

/**
 * Lista separada por vírgula na URL (`status=Extraviado,Cancelado`) → array sem repetidos. Cada
 * campo encadeia o esquema dos itens com `.pipe(z.array(...).min(1))`; valor fora do esquema
 * recusa a lista inteira (`400`).
 */
const commaList = z.string().transform((value) => [
  ...new Set(
    value
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part !== ""),
  ),
]);

const listError = { error: "informe ao menos um valor" };

const textError = `deve ter até ${STAFF_SEARCH_TEXT_MAX_LENGTH} caracteres`;

/** Parâmetros de URL de `GET /api/staff/orders`. Tudo opcional; os filtros se somam (E). */
export const staffSearchQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .max(STAFF_SEARCH_TEXT_MAX_LENGTH, { error: textError })
    .optional()
    .describe(
      "Só dígitos (até 10): número do pedido que começa com eles (o número completo acha esse " +
        "pedido). Com letras: cidade, estado ou país de origem ou destino, sem diferenciar " +
        "maiúsculas nem acentos (ex.: sao paulo, mexico)",
    ),
  status: commaList
    .pipe(z.array(orderStatusSchema).min(1, listError))
    .optional()
    .describe("Uma ou mais situações, separadas por vírgula"),
  shippingMode: commaList
    .pipe(z.array(shippingModeSchema).min(1, listError))
    .optional()
    .describe("Uma ou mais modalidades, separadas por vírgula"),
  market: commaList
    .pipe(z.array(marketSchema).min(1, listError))
    .optional()
    .describe("Um ou mais mercados, separados por vírgula"),
  stage: commaList
    .pipe(z.array(z.coerce.number<string>().int().min(1).max(5)).min(1, listError))
    .optional()
    .describe("Uma ou mais etapas atuais, de 1 (Coleta) a 5 (Última milha), separadas por vírgula"),
  cause: z
    .string()
    .trim()
    .min(1)
    .max(STAFF_SEARCH_TEXT_MAX_LENGTH, { error: textError })
    .optional()
    .describe(
      "Motivo provável nos termos da base, no despacho ou na entrega (ex.: Promessa irreal); " +
        "sem diferenciar maiúsculas nem acentos",
    ),
  minDelayDays: z.coerce
    .number()
    .int()
    .min(1)
    .max(365)
    .optional()
    .describe("Atraso de entrega mínimo, em dias (1 ou mais)"),
  escalated: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional()
    .describe("true = só os encaminhados à central; false ou ausente = sem esse filtro"),
  sort: staffSearchSortSchema.optional(),
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

/** Uma linha do resultado: o bastante para escolher o pedido e abrir a visão do colaborador. */
export const staffSearchRowSchema = z.object({
  orderId: orderIdSchema,
  orderDate: z.iso.date().describe("Data do pedido (AAAA-MM-DD)"),
  status: orderStatusSchema,
  shippingMode: shippingModeSchema,
  origin: z.string().describe("Origem do despacho: Cidade, Estado, País"),
  destination: z.string().describe("Destino: Cidade, Estado, País"),
  stage: stageSchema.nullable().describe("Etapa atual (ou última)"),
  location: z.string().nullable().describe("Local atual do volume"),
  delayDays: z
    .number()
    .int()
    .nullable()
    .describe(
      "Atraso de entrega, em dias (em trânsito, até a data de referência); null = sem cálculo",
    ),
  escalateToSupport: z.boolean().describe("Encaminhado à central"),
  probableCause: z
    .string()
    .nullable()
    .describe("Motivo provável nos termos da base (entrega; senão, despacho)"),
});
export type StaffSearchRow = z.infer<typeof staffSearchRowSchema>;

/** Resposta de `GET /api/staff/orders`. */
export const staffSearchResponseSchema = z.object({
  total: z
    .number()
    .int()
    .nonnegative()
    .describe("Quantos pedidos atendem aos filtros (todos, não só os da página)"),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  results: z.array(staffSearchRowSchema).describe("Linhas da página pedida, na ordem pedida"),
});
export type StaffSearchResponse = z.infer<typeof staffSearchResponseSchema>;
