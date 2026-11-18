import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { type ShippingMode, shippingModeSchema } from "@translog/contracts";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import { ADJUSTED_SCENARIO_NAME, GOLD_SCENARIO_TABLE } from "./consumo-sql.ts";

// Cenário "Promessa ajustada" da Gold (`workspace.gold.param_cenario_prazo`): prazo de despacho
// sugerido por modalidade, usado no diagnóstico do colaborador e na Torre. Vem da mesma fonte
// dos pedidos em cada modo: `databricks` consulta a tabela (e guarda no cache local), `file` lê o
// CSV gravado pelo `pnpm export:dados`, `fixtures` lê o JSON gerado com os fixtures.

/** Prazo sugerido, em dias, por modalidade. Modalidade ausente = sem sugestão (`null`). */
export type PromiseScenario = ReadonlyMap<ShippingMode, number>;

/** Sem cenário: nenhuma modalidade tem prazo sugerido (só testes). */
export const NO_PROMISE_SCENARIO: PromiseScenario = new Map();

/** Arquivo do cenário dentro de `DATA_DIR` (adapter `file`). */
export const GOLD_SCENARIO_FILE = `gold_${GOLD_SCENARIO_TABLE}.csv`;

/** Cenário como objeto (`{ "First Class": 2, ... }`), para JSON (fixtures e cache). */
export const scenarioJsonSchema = z.partialRecord(
  shippingModeSchema,
  z.number().int().nonnegative(),
);

export function scenarioToJson(scenario: PromiseScenario): z.infer<typeof scenarioJsonSchema> {
  return Object.fromEntries(scenario);
}

export function scenarioFromJson(value: unknown): PromiseScenario {
  const parsed = scenarioJsonSchema.parse(value);
  return new Map(
    Object.entries(parsed).map(([mode, days]) => [shippingModeSchema.parse(mode), days ?? 0]),
  );
}

/** Colunas sem as quais o cenário não pode ser lido. */
const REQUIRED_COLUMNS = ["cenario", "classe_servico", "prazo_despacho_dias", "ativo"];

/**
 * CSV da `param_cenario_prazo` (do Databricks ou do export) → cenário. Considera só as linhas
 * com `ativo = true` do cenário "Promessa ajustada". Modalidade desconhecida, prazo inválido,
 * modalidade repetida ou nenhuma linha válida lançam erro (a API não sobe com cenário errado).
 */
export function parseScenarioCsv(text: string): PromiseScenario {
  const rows: Record<string, string>[] = parse(text, {
    bom: true,
    columns: true,
    skip_empty_lines: true,
  });
  const missing = REQUIRED_COLUMNS.filter((column) => !(column in (rows[0] ?? {})));
  if (rows.length > 0 && missing.length > 0) {
    throw new Error(`faltam as colunas ${missing.join(", ")}.`);
  }
  const scenario = new Map<ShippingMode, number>();
  for (const row of rows) {
    if (row.cenario !== ADJUSTED_SCENARIO_NAME || row.ativo?.toLowerCase() !== "true") {
      continue;
    }
    const mode = shippingModeSchema.safeParse(row.classe_servico);
    const days = Number(row.prazo_despacho_dias);
    if (!mode.success) {
      throw new Error(`modalidade desconhecida: "${row.classe_servico}".`);
    }
    if (row.prazo_despacho_dias?.trim() === "" || !Number.isInteger(days) || days < 0) {
      throw new Error(`prazo inválido para ${mode.data}.`);
    }
    if (scenario.has(mode.data)) {
      throw new Error(`${mode.data} aparece mais de uma vez no cenário ativo.`);
    }
    scenario.set(mode.data, days);
  }
  if (scenario.size === 0) {
    throw new Error(`nenhuma linha ativa do cenário "${ADJUSTED_SCENARIO_NAME}".`);
  }
  return scenario;
}

/** Adapter `file`: lê `DATA_DIR/gold_param_cenario_prazo.csv`. Sem o arquivo, a API não sobe. */
export async function loadScenarioFile(dir: string): Promise<PromiseScenario> {
  const file = join(dir, GOLD_SCENARIO_FILE);
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch {
    throw new Error(
      `${GOLD_SCENARIO_FILE} não encontrado em DATA_DIR (${dir}): rode pnpm export:dados ` +
        '(ele grava o cenário "Promessa ajustada" da Gold junto com os CSVs).',
    );
  }
  try {
    return parseScenarioCsv(text);
  } catch (error) {
    throw new Error(
      `${GOLD_SCENARIO_FILE} inválido: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** Gerado por `pnpm --filter @translog/api fixtures` a partir do CSV exportado da Gold. */
export const FIXTURE_SCENARIO_FILE = new URL("./fixtures/promise-scenario.json", import.meta.url);

const fixtureScenarioSchema = z.object({
  source: z.string(),
  generatedAt: z.string(),
  scenario: scenarioJsonSchema,
});

/** Adapter `fixtures`: cenário gerado junto com os fixtures (com a data de geração). */
export async function loadFixtureScenario(
  file: URL = FIXTURE_SCENARIO_FILE,
): Promise<PromiseScenario> {
  const content = fixtureScenarioSchema.parse(JSON.parse(await readFile(file, "utf8")));
  return scenarioFromJson(content.scenario);
}

export function fixtureScenarioContent(scenario: PromiseScenario, generatedAt: Date) {
  return {
    source: `workspace.gold.${GOLD_SCENARIO_TABLE} (linhas ativas do cenário "${ADJUSTED_SCENARIO_NAME}")`,
    generatedAt: generatedAt.toISOString(),
    scenario: scenarioToJson(scenario),
  };
}
