import { type Order, orderSchema } from "@translog/contracts";

// Único arquivo que conhece o formato da Silver. Mudança no contrato de dados do Mateus
// bate aqui. Regras: portal/_contexto/projeto.md, seção "Silver".

/** Colunas da Silver que o portal lê. Todas as outras são descartadas já na leitura do CSV. */
export const SILVER_COLUMNS = [
  "id_pedido",
  "data_pedido",
  "data_envio",
  "data_prevista_entrega",
  "modo_envio",
  "situacao_rastreio",
  "status_entrega_pt",
  "dias_atraso",
  "janela_atraso",
  "origem_cliente_cidade",
  "origem_cliente_estado",
  "origem_cliente_pais",
  "destino_cidade",
  "destino_estado",
  "destino_pais",
  "destino_regiao",
  "mercado_logistico",
  "nome_produto",
  "categoria_produto",
  "quantidade_item",
  "valor_item_pedido",
] as const;

export type SilverColumn = (typeof SILVER_COLUMNS)[number];

/** Uma linha da Silver (um item de pedido), só com as colunas lidas. */
export type SilverRow = Record<SilverColumn, string>;

/**
 * Colunas que nunca saem do backend: dados do cliente, pagamento, financeiro interno,
 * coordenadas e o resumo para RAG (o texto cita "Cliente ID"). Não estão em
 * `SILVER_COLUMNS`, então nem chegam a ser lidas; a lista existe para os testes conferirem.
 */
export const FORBIDDEN_COLUMNS = [
  "id_cliente",
  "segmento_cliente",
  "tipo_pagamento",
  "lucro_item",
  "margem_lucro_item",
  "lucro_total_pedido",
  "valor_desconto",
  "latitude_origem",
  "longitude_origem",
  "resumo_rastreio_rag",
] as const;

export type OrderMappingResult = ReturnType<typeof orderSchema.safeParse>;

/**
 * Linhas (itens) de um mesmo `id_pedido` → `Order`, validado contra o contrato.
 * Os campos do pedido vêm da primeira linha: todos os itens de um pedido têm a mesma
 * situação, datas e rota na Silver.
 */
export function mapSilverOrder(rows: readonly [SilverRow, ...SilverRow[]]): OrderMappingResult {
  const [first] = rows;
  const itemCents = rows.map((row) => toCents(row.valor_item_pedido));

  return orderSchema.safeParse({
    orderId: toNumber(first.id_pedido),
    orderDate: calendarDate(first.data_pedido),
    shippingMode: first.modo_envio,
    trackingStatus: first.situacao_rastreio,
    deadlineStatus: first.status_entrega_pt,
    delayDays: first.dias_atraso === "" ? null : toNumber(first.dias_atraso),
    // "3. Atraso Leve (1 a 2 dias)" → "Atraso Leve (1 a 2 dias)": o número só ordena a faixa.
    delayWindow: first.janela_atraso.replace(/^\d+\.\s*/, ""),
    estimatedDeliveryDate: calendarDate(first.data_prevista_entrega),
    // `data_envio` vem preenchida em todos os pedidos; só é entrega realizada se Entregue.
    actualDeliveryDate:
      first.situacao_rastreio === "Entregue" ? calendarDate(first.data_envio) : null,
    origin: place(
      first.origem_cliente_cidade,
      first.origem_cliente_estado,
      first.origem_cliente_pais,
    ),
    destination: place(first.destino_cidade, first.destino_estado, first.destino_pais),
    region: first.destino_regiao,
    market: first.mercado_logistico,
    items: rows.map((row, index) => ({
      productName: row.nome_produto,
      category: row.categoria_produto,
      quantity: toNumber(row.quantidade_item),
      total: (itemCents[index] ?? Number.NaN) / 100,
    })),
    // Soma em centavos: evita 0.1 + 0.2 = 0.30000000000000004.
    total: itemCents.reduce((sum, cents) => sum + cents, 0) / 100,
    // Ainda não existe na Silver (depende do Mateus e do Marcelo).
    probableCause: null,
  } satisfies Record<keyof Order, unknown>);
}

/**
 * `2015-01-09T01:02:00.000Z` → `2015-01-09`, cortando o texto. Nunca `new Date()`: em UTC-3,
 * pedidos com hora antes de 03:00Z mudariam para o dia anterior.
 */
function calendarDate(isoText: string): string {
  return isoText.slice(0, 10);
}

/** Texto vazio vira `NaN` (e falha na validação), não `0` como em `Number("")`. */
function toNumber(text: string): number {
  return text.trim() === "" ? Number.NaN : Number(text);
}

/** Valor em dólar (até 2 casas) → centavos inteiros. */
function toCents(text: string): number {
  return Math.round(toNumber(text) * 100);
}

/** "Cidade, Estado, País", sem partes vazias. */
function place(...parts: string[]): string {
  return parts.filter((part) => part !== "").join(", ");
}
