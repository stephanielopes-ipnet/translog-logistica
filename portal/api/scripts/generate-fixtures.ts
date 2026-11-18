// pnpm --filter @translog/api fixtures — regenera, a partir dos CSVs de portal/dados/ (ou
// DATA_DIR), os dados de exemplo que vêm no código:
//
// 1. api/src/orders/fixtures/consumo/*.csv: as linhas dos pedidos da demo nas 3 tabelas.
//    Colunas que o portal lê com os valores reais; as proibidas (sempre presentes, mesmo se o
//    CSV de origem já vier sem elas) com valores FICTICIO-*; as demais com SEM-USO. Os testes
//    usam esta amostra para provar que só as colunas lidas chegam às respostas.
//    Junto, gold_param_cenario_prazo.csv (cenário "Promessa ajustada" da Gold, do export).
// 2. api/src/orders/fixtures/orders.json: os mesmos pedidos convertidos pelo adapter `file`
//    (o caminho real de leitura), na ordem da demo. É a fonte DATA_SOURCE=fixtures.

import { createReadStream } from "node:fs";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse";
import {
  type ConsumoTable,
  FORBIDDEN_COLUMNS,
  READ_COLUMNS,
} from "../src/orders/consumo-mapper.ts";
import { consumoFiles, loadFileRepository } from "../src/orders/file-repository.ts";
import {
  FIXTURE_SCENARIO_FILE,
  fixtureScenarioContent,
  GOLD_SCENARIO_FILE,
  loadScenarioFile,
} from "../src/orders/promise-scenario.ts";

/** Pedidos da demo (escolhidos na base em 16/11), na ordem em que aparecem nos fixtures. */
export const DEMO_ORDER_IDS = [76902, 375, 34, 222, 8, 9, 50, 31298, 76385];

const PORTAL_DIR = fileURLToPath(new URL("../../", import.meta.url));
const FIXTURES_DIR = fileURLToPath(new URL("../src/orders/fixtures/", import.meta.url));
const SAMPLE_DIR = resolve(FIXTURES_DIR, "consumo");
const sourceDir = resolve(PORTAL_DIR, process.env.DATA_DIR?.trim() || "dados");

const wanted = new Set(DEMO_ORDER_IDS.map(String));

/** Cabeçalho e linhas dos pedidos da demo numa tabela, lidos em streaming. */
async function demoRows(file: string): Promise<{ header: string[]; rows: string[][] }> {
  let header: string[] | undefined;
  let idIndex = -1;
  const rows: string[][] = [];
  await pipeline(
    createReadStream(file),
    parse({ bom: true, relax_column_count: true, skip_empty_lines: true }),
    async (records: AsyncIterable<string[]>) => {
      for await (const fields of records) {
        if (!header) {
          header = fields;
          idIndex = header.indexOf("id_pedido");
          continue;
        }
        if (wanted.has(fields[idIndex] ?? "")) {
          rows.push(fields);
        }
      }
    },
  );
  if (!header) {
    throw new Error(`${file} está vazio.`);
  }
  return { header, rows };
}

function quote(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

async function writeSample(table: ConsumoTable, source: string, target: string) {
  const { header, rows } = await demoRows(source);
  const read: readonly string[] = READ_COLUMNS[table];
  const columns = [...header, ...FORBIDDEN_COLUMNS.filter((column) => !header.includes(column))];
  const lines = rows.map((fields, rowIndex) =>
    columns
      .map((column) => {
        if ((FORBIDDEN_COLUMNS as readonly string[]).includes(column)) {
          return `FICTICIO-${column}-${rowIndex + 1}`;
        }
        if (!read.includes(column)) {
          return "SEM-USO";
        }
        return quote(fields[header.indexOf(column)] ?? "");
      })
      .join(","),
  );
  await writeFile(target, `${[columns.join(","), ...lines].join("\n")}\n`);
  console.log(`${target}: ${rows.length} linhas`);
}

const sources = consumoFiles(sourceDir);
const samples = consumoFiles(SAMPLE_DIR);
await mkdir(SAMPLE_DIR, { recursive: true });
for (const table of ["orders", "items", "events"] as const) {
  await writeSample(table, sources[table], samples[table]);
}

// Cenário "Promessa ajustada" da Gold: o CSV do export vai para a amostra (adapter `file` e
// Databricks falso dos testes) e vira o JSON do adapter `fixtures`, com a data de geração.
const scenario = await loadScenarioFile(sourceDir);
await copyFile(resolve(sourceDir, GOLD_SCENARIO_FILE), resolve(SAMPLE_DIR, GOLD_SCENARIO_FILE));
const scenarioTarget = fileURLToPath(FIXTURE_SCENARIO_FILE);
await writeFile(
  scenarioTarget,
  `${JSON.stringify(fixtureScenarioContent(scenario, new Date()), null, 2)}\n`,
);
console.log(`${scenarioTarget}: ${scenario.size} modalidades`);

const repository = await loadFileRepository(SAMPLE_DIR, { info: () => {}, warn: console.warn });
const orders = await Promise.all(DEMO_ORDER_IDS.map((id) => repository.findById(id)));
const missing = DEMO_ORDER_IDS.filter((_id, index) => orders[index] === null);
if (missing.length > 0) {
  throw new Error(`Pedidos da demo fora da base: ${missing.join(", ")}`);
}
const target = resolve(FIXTURES_DIR, "orders.json");
await writeFile(target, `${JSON.stringify(orders, null, 2)}\n`);
console.log(`${target}: ${orders.length} pedidos`);
