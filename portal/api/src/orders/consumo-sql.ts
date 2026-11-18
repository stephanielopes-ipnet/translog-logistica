import {
  CONSUMO_TABLES,
  type ConsumoTable,
  FORBIDDEN_COLUMNS,
  READ_COLUMNS,
} from "./consumo-mapper.ts";

// Consultas às tabelas `consumo_*` no Databricks. Sempre com colunas explícitas: as colunas
// proibidas (dados do cliente e financeiro interno) nunca entram no SELECT.

/**
 * Colunas do `pnpm export:dados`: todas as das tabelas, menos as proibidas. O CSV exportado
 * fica igual ao do Mateus sem essas colunas (e com as datas já cortadas no SQL).
 */
export const EXPORT_COLUMNS = {
  orders: [
    "id_pedido",
    "data_pedido",
    "situacao_pedido",
    "data_referencia_base",
    "modo_envio",
    "modal_transporte",
    "tipo_rota",
    "mercado_logistico",
    "origem_cliente_pais",
    "origem_cliente_estado",
    "origem_cliente_cidade",
    "destino_pais",
    "destino_estado",
    "destino_cidade",
    "destino_regiao",
    "prazo_despacho_dias",
    "dias_ate_despacho",
    "data_despacho_prevista",
    "data_despacho_real",
    "status_prazo_despacho",
    "flag_atraso_despacho",
    "dias_atraso_despacho",
    "causa_atraso_despacho",
    "data_entrega_prevista",
    "data_entrega_realizada",
    "flag_atraso_entrega",
    "dias_atraso_entrega",
    "causa_atraso_entrega",
    "etapa_extravio",
    "etapa_atual_desc",
    "local_atual",
    "ultimo_evento_desc",
    "ts_ultimo_evento",
    "motivo_ocorrencia",
    "rota_servico",
    "qtd_itens",
    "lista_itens",
    "valor_total_pedido",
    "linha_do_tempo",
    "resumo_pedido",
  ],
  items: [
    "id_item_pedido",
    "id_pedido",
    "nome_produto",
    "categoria_produto",
    "departamento",
    "quantidade_item",
    "valor_item_pedido",
  ],
  events: [
    "id_pedido",
    "sequencia",
    "codigo_evento",
    "descricao_evento",
    "etapa",
    "etapa_desc",
    "ts_evento",
    "id_hub",
    "local_evento",
    "ultimo_evento",
    "tipo_rota",
    "modal_transporte",
    "modo_envio",
    "destino_regiao",
  ],
} as const satisfies Record<ConsumoTable, readonly string[]>;

/**
 * Colunas `timestamp` (UTC na base). Saem como texto ISO 8601 com fuso (`2015-01-15T14:20:00.000Z`)
 * já no SQL, para o horário nunca passar por conversão de fuso no Node. O agente de IA (`csv_v2`)
 * exige data, hora e fuso nesses campos; o portal só usa os 10 primeiros caracteres (a data).
 * O warehouse usa UTC como fuso da sessão: o `XXX` sai como `Z` (conferido em 18/11).
 * Até 17/11 saía só `yyyy-MM-dd`, e o agente recusava os CSVs ("Instante do evento inválido").
 */
const TIMESTAMP_COLUMNS: ReadonlySet<string> = new Set([
  "data_pedido",
  "ts_ultimo_evento",
  "ts_evento",
]);

/** Ordem estável: o mesmo export gera o mesmo arquivo. */
const ORDER_BY: Record<ConsumoTable, string> = {
  orders: "id_pedido",
  items: "id_pedido, id_item_pedido",
  events: "id_pedido, sequencia",
};

/**
 * Coluna como texto. O CSV do Databricks escreve NULL como `null`; com `coalesce(..., '')`
 * o valor ausente sai vazio, como nos CSVs do Mateus, e o leitor não precisa adivinhar.
 */
function asText(column: string): string {
  return TIMESTAMP_COLUMNS.has(column)
    ? `date_format(${column}, "yyyy-MM-dd'T'HH:mm:ss.SSSXXX")`
    : `CAST(${column} AS STRING)`;
}

/** `catalogo.schema` (ex.: `workspace.silver`): só letras, números e `_`, para ir no SQL. */
const CATALOG_SCHEMA = /^[A-Za-z_]\w*\.[A-Za-z_]\w*$/;
const COLUMN_NAME = /^[a-z_]\w*$/;

/**
 * `SELECT` explícito de uma tabela `consumo_*`. Recusa schema ou coluna com caracteres fora
 * do padrão e qualquer coluna proibida.
 */
export function selectStatement(
  catalogSchema: string,
  table: ConsumoTable,
  columns: readonly string[] = READ_COLUMNS[table],
): string {
  if (!CATALOG_SCHEMA.test(catalogSchema)) {
    throw new Error(`Schema inválido: "${catalogSchema}" (esperado catalogo.schema).`);
  }
  const forbidden: readonly string[] = FORBIDDEN_COLUMNS;
  const refused = columns.filter(
    (column) => forbidden.includes(column) || !COLUMN_NAME.test(column),
  );
  if (refused.length > 0) {
    throw new Error(`Colunas recusadas na consulta: ${refused.join(", ")}.`);
  }
  const select = columns.map((column) => `coalesce(${asText(column)}, '') AS ${column}`).join(", ");
  return `SELECT ${select} FROM ${catalogSchema}.${CONSUMO_TABLES[table]} ORDER BY ${ORDER_BY[table]}`;
}
