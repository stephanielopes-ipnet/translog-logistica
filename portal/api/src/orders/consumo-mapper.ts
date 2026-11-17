import { shouldEscalateToSupport } from "./escalation.ts";
import { type OrderRecord, orderRecordSchema } from "./order-record.ts";

// Único arquivo que conhece o formato das tabelas `consumo_*` da Silver (pedidos, itens e
// eventos). Mudança no contrato de dados do Mateus bate aqui. Levantamento das colunas e
// valores: portal/_contexto/databricks.md.

/** Nomes das tabelas (no Databricks) e dos arquivos `<nome>.csv` (no adapter `file`). */
export const CONSUMO_TABLES = {
  orders: "consumo_pedidos",
  items: "consumo_itens_pedido",
  events: "consumo_eventos_logisticos",
} as const;

export type ConsumoTable = keyof typeof CONSUMO_TABLES;

/** Colunas de `consumo_pedidos` que o portal lê (1 linha por pedido). */
export const ORDER_COLUMNS = [
  "id_pedido",
  "data_pedido",
  "data_referencia_base",
  "situacao_pedido",
  "modo_envio",
  "modal_transporte",
  "tipo_rota",
  "mercado_logistico",
  "origem_cliente_cidade",
  "origem_cliente_estado",
  "origem_cliente_pais",
  "destino_cidade",
  "destino_estado",
  "destino_pais",
  "destino_regiao",
  "prazo_despacho_dias",
  "dias_ate_despacho",
  "data_despacho_prevista",
  "data_despacho_real",
  "dias_atraso_despacho",
  "status_prazo_despacho",
  "causa_atraso_despacho",
  "data_entrega_prevista",
  "data_entrega_realizada",
  "dias_atraso_entrega",
  "causa_atraso_entrega",
  "motivo_ocorrencia",
  "etapa_atual_desc",
  "local_atual",
  "etapa_extravio",
  "rota_servico",
  "resumo_pedido",
  "linha_do_tempo",
] as const;

/** Colunas de `consumo_itens_pedido` que o portal lê (1 linha por item). */
export const ITEM_COLUMNS = [
  "id_pedido",
  "id_item_pedido",
  "nome_produto",
  "categoria_produto",
  "quantidade_item",
  "valor_item_pedido",
] as const;

/**
 * Colunas de `consumo_eventos_logisticos` que o portal lê (1 linha por evento). A
 * `destino_regiao` desta tabela está em inglês; a do pedido (em português) é a usada.
 */
export const EVENT_COLUMNS = [
  "id_pedido",
  "sequencia",
  "ts_evento",
  "codigo_evento",
  "descricao_evento",
  "etapa",
  "etapa_desc",
  "local_evento",
] as const;

/** Colunas lidas de cada tabela. Todas as outras são descartadas já na leitura. */
export const READ_COLUMNS = {
  orders: ORDER_COLUMNS,
  items: ITEM_COLUMNS,
  events: EVENT_COLUMNS,
} as const satisfies Record<ConsumoTable, readonly string[]>;

/**
 * Colunas que nunca saem do backend nem entram nas consultas: dados do cliente e financeiro
 * interno. A descrição da `consumo_pedidos` diz "sem PII", mas ela tem `id_cliente` e
 * `segmento_cliente`. Nenhuma está nas colunas lidas; a lista existe para os testes conferirem.
 */
export const FORBIDDEN_COLUMNS = [
  "id_cliente",
  "segmento_cliente",
  "valor_desconto",
  "valor_bruto_venda",
  "preco_unitario",
  "id_produto",
] as const;

export type OrderRow = Record<(typeof ORDER_COLUMNS)[number], string>;
export type ItemRow = Record<(typeof ITEM_COLUMNS)[number], string>;
export type EventRow = Record<(typeof EVENT_COLUMNS)[number], string>;

export type OrderMappingResult = ReturnType<typeof orderRecordSchema.safeParse>;

/** Guarda uma instância só de cada texto repetido (o adapter `file` passa o seu pool). */
export type Intern = (text: string) => string;

const keepText: Intern = (text) => text;

/**
 * Linha do pedido + linhas dos seus itens e eventos → `OrderRecord` (o que a API guarda; as
 * visões do cliente e do colaborador saem dele em `order-views.ts`), validado.
 * Itens em ordem de `id_item_pedido` e eventos em ordem de `sequencia`, venham como vierem.
 */
export function mapConsumoOrder(
  row: OrderRow,
  items: readonly ItemRow[],
  events: readonly EventRow[],
  intern: Intern = keepText,
): OrderMappingResult {
  const sortedItems = items.toSorted((a, b) => Number(a.id_item_pedido) - Number(b.id_item_pedido));
  const itemCents = sortedItems.map((item) => toCents(item.valor_item_pedido));
  const delivery = {
    expectedDate: calendarDate(row.data_entrega_prevista, intern),
    actualDate: calendarDate(row.data_entrega_realizada, intern),
    delayDays: optionalInteger(row.dias_atraso_entrega),
    probableCause: cause(row.causa_atraso_entrega),
  };

  return orderRecordSchema.safeParse({
    orderId: toNumber(row.id_pedido),
    orderDate: calendarDate(row.data_pedido, intern),
    referenceDate: calendarDate(row.data_referencia_base, intern),
    status: row.situacao_pedido,
    shippingMode: row.modo_envio,
    transportMode: optionalText(row.modal_transporte),
    routeType: row.tipo_rota,
    origin: intern(
      place(row.origem_cliente_cidade, row.origem_cliente_estado, row.origem_cliente_pais),
    ),
    destination: intern(place(row.destino_cidade, row.destino_estado, row.destino_pais)),
    region: row.destino_regiao,
    market: row.mercado_logistico,
    routeService: row.rota_servico,
    dispatch: {
      promisedDays: toNumber(row.prazo_despacho_dias),
      expectedDate: calendarDate(row.data_despacho_prevista, intern),
      actualDate: calendarDate(row.data_despacho_real, intern),
      delayDays: optionalInteger(row.dias_atraso_despacho),
      status: row.status_prazo_despacho,
      probableCause: cause(row.causa_atraso_despacho),
    },
    daysToDispatch: optionalInteger(row.dias_ate_despacho),
    delivery,
    explanation: optionalText(row.motivo_ocorrencia),
    currentStage: stage(row.etapa_atual_desc, intern),
    currentLocation: optionalText(row.local_atual),
    lostAtStage: stage(row.etapa_extravio, intern),
    events: events
      .toSorted((a, b) => Number(a.sequencia) - Number(b.sequencia))
      .map((event) => ({
        date: calendarDate(event.ts_evento, intern) ?? "",
        code: event.codigo_evento,
        description: event.descricao_evento,
        stage: toNumber(event.etapa),
        stageLabel: intern(stageLabel(event.etapa_desc)),
        location: optionalText(event.local_evento),
      })),
    items: sortedItems.map((item, index) => ({
      productName: item.nome_produto,
      category: item.categoria_produto,
      quantity: toNumber(item.quantidade_item),
      total: (itemCents[index] ?? Number.NaN) / 100,
    })),
    // Soma em centavos: evita 0.1 + 0.2 = 0.30000000000000004.
    total: itemCents.reduce((sum, cents) => sum + cents, 0) / 100,
    escalateToSupport: shouldEscalateToSupport({ status: row.situacao_pedido, delivery }),
    // No Databricks, o resumo dos não despachados termina com espaço (no CSV do Mateus, não):
    // aparado, sai igual nos dois modos.
    aiSummary: optionalText(row.resumo_pedido.trim()),
    rawTimeline: optionalText(row.linha_do_tempo),
  } satisfies Record<keyof OrderRecord, unknown>);
}

/**
 * `2015-01-09T01:02:00.000Z` ou `2015-01-09` → `2015-01-09`, cortando o texto; vazio → `null`.
 * Nunca `new Date()`: em UTC-3, horários antes de 03:00Z mudariam para o dia anterior.
 */
function calendarDate(text: string, intern: Intern): string | null {
  return text === "" ? null : intern(text.slice(0, 10));
}

/** Texto vazio vira `NaN` (e falha na validação), não `0` como em `Number("")`. */
function toNumber(text: string): number {
  return text.trim() === "" ? Number.NaN : Number(text);
}

/** Vazio → `null`; senão o número (que a validação recusa se não for inteiro). */
function optionalInteger(text: string): number | null {
  return text === "" ? null : toNumber(text);
}

function optionalText(text: string): string | null {
  return text === "" ? null : text;
}

/** Causa de atraso da base; "Sem atraso" e vazio → `null`. */
function cause(text: string): string | null {
  return text === "" || text === "Sem atraso" ? null : text;
}

/** `"3 - Alfândega"` → `{ number: 3, label: "Alfândega" }`; vazio → `null`. */
function stage(text: string, intern: Intern): { number: number; label: string } | null {
  if (text === "") {
    return null;
  }
  return { number: toNumber(text.split(" - ")[0] ?? ""), label: intern(stageLabel(text)) };
}

/** `"3 - Alfândega"` → `"Alfândega"` (texto sem o número fica como está). */
function stageLabel(text: string): string {
  const separator = text.indexOf(" - ");
  return separator === -1 ? text : text.slice(separator + 3);
}

/** Valor em dólar (até 2 casas) → centavos inteiros. */
function toCents(text: string): number {
  return Math.round(toNumber(text) * 100);
}

/** "Cidade, Estado, País", sem partes vazias. */
function place(...parts: string[]): string {
  return parts.filter((part) => part !== "").join(", ");
}
