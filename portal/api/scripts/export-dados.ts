// pnpm export:dados — baixa as tabelas consumo_* do Databricks (e o cenário "Promessa ajustada"
// da Gold, gold_param_cenario_prazo.csv) para os CSVs do plano B
// (portal/dados/ ou DATA_DIR), já sem as colunas proibidas e com as datas cortadas no SQL.
//
// Credenciais do ambiente ou do portal/.env (nunca impressas): DATABRICKS_HOST,
// DATABRICKS_WAREHOUSE_ID, DATABRICKS_TOKEN; opcionais DATABRICKS_CATALOG_SCHEMA e DATABRICKS_GOLD_SCHEMA
// (padrões workspace.silver e workspace.gold). Cada arquivo é gravado num temporário e só substitui o
// anterior quando o download termina: uma falha no meio não estraga a cópia que já existe.

import { createWriteStream, existsSync } from "node:fs";
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { CONSUMO_TABLES, type ConsumoTable } from "../src/orders/consumo-mapper.ts";
import {
  EXPORT_COLUMNS,
  GOLD_SCENARIO_TABLE,
  goldScenarioStatement,
  selectStatement,
} from "../src/orders/consumo-sql.ts";
import { createDatabricksClient } from "../src/orders/databricks-client.ts";
import { consumoFiles } from "../src/orders/file-repository.ts";
import { GOLD_SCENARIO_FILE, parseScenarioCsv } from "../src/orders/promise-scenario.ts";

const PORTAL_DIR = fileURLToPath(new URL("../../", import.meta.url));
const envFile = resolve(PORTAL_DIR, ".env");
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`${name} não definida (no ambiente ou em portal/.env).`);
    process.exit(1);
  }
  return value;
}

const host = required("DATABRICKS_HOST")
  .replace(/^https?:\/\//, "")
  .replace(/\/+$/, "");
const client = createDatabricksClient({
  baseUrl: `https://${host}`,
  warehouseId: required("DATABRICKS_WAREHOUSE_ID"),
  token: required("DATABRICKS_TOKEN"),
});
const catalogSchema = process.env.DATABRICKS_CATALOG_SCHEMA?.trim() || "workspace.silver";
const goldSchema = process.env.DATABRICKS_GOLD_SCHEMA?.trim() || "workspace.gold";
const dataDir = resolve(PORTAL_DIR, process.env.DATA_DIR?.trim() || "dados");
const files = consumoFiles(dataDir);

async function exportTable(table: ConsumoTable) {
  const startedAt = performance.now();
  const target = files[table];
  const temporary = `${target}.parcial`;
  const result = await client.queryCsv(
    selectStatement(catalogSchema, table, EXPORT_COLUMNS[table]),
  );
  try {
    await pipeline(Readable.from(result.chunks()), createWriteStream(temporary));
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
  const { size } = await stat(target);
  const seconds = ((performance.now() - startedAt) / 1000).toFixed(1);
  const megabytes = (size / 1024 / 1024).toFixed(1);
  console.log(
    `${CONSUMO_TABLES[table]}: ${result.totalRows.toLocaleString("pt-BR")} linhas, ` +
      `${result.columns.length} colunas, ${megabytes} MB, ${seconds} s → ${target}`,
  );
}

/**
 * Cenário "Promessa ajustada" da Gold (4 linhas) → `gold_param_cenario_prazo.csv`. Conferido
 * antes de gravar: um cenário inválido nunca substitui o arquivo bom.
 */
async function exportScenario() {
  const result = await client.queryCsv(goldScenarioStatement(goldSchema));
  const chunks: Buffer[] = [];
  for await (const chunk of result.chunks()) {
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  const scenario = parseScenarioCsv(text);
  const target = join(dataDir, GOLD_SCENARIO_FILE);
  await writeFile(`${target}.parcial`, text);
  await rename(`${target}.parcial`, target);
  const days = [...scenario].map(([mode, value]) => `${mode} ${value}`).join(", ");
  console.log(`${goldSchema}.${GOLD_SCENARIO_TABLE} (Promessa ajustada): ${days} → ${target}`);
}

try {
  const startedAt = performance.now();
  await mkdir(dataDir, { recursive: true });
  console.log(`Exportando ${catalogSchema}.consumo_* para ${dataDir}`);
  for (const table of ["orders", "items", "events"] as const) {
    await exportTable(table);
  }
  await exportScenario();
  console.log(`Concluído em ${((performance.now() - startedAt) / 1000).toFixed(1)} s.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
