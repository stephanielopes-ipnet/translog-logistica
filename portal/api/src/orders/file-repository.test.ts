import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse/sync";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { z } from "zod";
import { type ConsumoTable, FORBIDDEN_COLUMNS } from "./consumo-mapper.ts";
import { consumoFiles, loadFileRepository } from "./file-repository.ts";
import { FIXTURES_FILE } from "./fixtures-repository.ts";
import { orderRecordSchema } from "./order-record.ts";

/**
 * Amostra das 3 tabelas com os 9 pedidos da demo (gerada por `pnpm --filter @translog/api
 * fixtures`). Colunas lidas com valores reais; proibidas com `FICTICIO-*`; sem uso com `SEM-USO`.
 */
const SAMPLE_DIR = fileURLToPath(new URL("./fixtures/consumo/", import.meta.url));
const SAMPLE = consumoFiles(SAMPLE_DIR);

/** Cópia local das tabelas (fora do Git). O teste de integração só roda se ela existir. */
const DATA_DIR = fileURLToPath(new URL("../../../dados/", import.meta.url));

const fixtures = z.array(orderRecordSchema).parse(JSON.parse(readFileSync(FIXTURES_FILE, "utf8")));
const DEMO_IDS = fixtures.map((order) => order.orderId);

function fakeLog() {
  return { info: vi.fn(), warn: vi.fn() };
}

type CsvRecord = Record<string, string>;
const sampleText = (table: ConsumoTable) => readFileSync(SAMPLE[table], "utf8");
const sampleRecords = (table: ConsumoTable): CsvRecord[] =>
  parse(sampleText(table), { columns: true });

function toCsv(records: readonly CsvRecord[], columns: readonly string[]): string {
  const quote = (value = "") => `"${value.replaceAll('"', '""')}"`;
  const lines = records.map((record) => columns.map((column) => quote(record[column])).join(","));
  return `${[columns.join(","), ...lines].join("\n")}\n`;
}

/**
 * Pasta temporária com as 3 tabelas da amostra; `changes` substitui o conteúdo de uma tabela
 * (texto pronto) ou a omite (`null`).
 */
async function tempDir(changes: Partial<Record<ConsumoTable, string | null>> = {}) {
  const dir = await mkdtemp(join(tmpdir(), "translog-consumo-"));
  onTestFinished(() => rm(dir, { recursive: true, force: true }));
  const files = consumoFiles(dir);
  for (const table of ["orders", "items", "events"] as const) {
    const content = table in changes ? changes[table] : sampleText(table);
    if (content !== null && content !== undefined) {
      await writeFile(files[table], content);
    }
  }
  return dir;
}

/** Tabela da amostra com linhas a mais (e o mesmo cabeçalho). */
function withExtraRows(table: ConsumoTable, extra: readonly CsvRecord[]): string {
  const records = sampleRecords(table);
  return toCsv([...records, ...extra], Object.keys(records[0] ?? {}));
}

describe("loadFileRepository (amostra das tabelas consumo_*)", () => {
  it("monta os 9 pedidos da demo iguais aos fixtures", async () => {
    const orders = await loadFileRepository(SAMPLE_DIR, fakeLog());

    expect(await orders.count()).toBe(9);
    for (const order of fixtures) {
      expect(await orders.findById(order.orderId), `pedido ${order.orderId}`).toStrictEqual(order);
    }
  });

  it("loga ao fim a pasta, os pedidos carregados, as linhas inválidas e o tempo", async () => {
    const log = fakeLog();

    await loadFileRepository(SAMPLE_DIR, log);

    expect(log.info).toHaveBeenCalledExactlyOnceWith(
      { dataDir: SAMPLE_DIR, orders: 9, invalidRows: 0, durationMs: expect.any(Number) },
      "Pedidos carregados",
    );
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("descarta na leitura as colunas proibidas e as sem uso", async () => {
    // Sanidade: as 3 tabelas da amostra têm todas as colunas proibidas, com valores fictícios.
    for (const table of ["orders", "items", "events"] as const) {
      const [first] = sampleRecords(table);
      for (const column of FORBIDDEN_COLUMNS) {
        expect(first?.[column], `${table}.${column}`).toMatch(/^FICTICIO-/);
      }
    }

    const orders = await loadFileRepository(SAMPLE_DIR, fakeLog());
    const loaded = await Promise.all(DEMO_IDS.map((id) => orders.findById(id)));

    expect(loaded).not.toContain(null);
    expect(JSON.stringify(loaded)).not.toMatch(/FICTICIO|SEM-USO/);
  });

  it("conta e loga linhas inválidas sem conteúdo, e carrega o resto", async () => {
    const [order375] = sampleRecords("orders").filter((r) => r.id_pedido === "375");
    const [item375] = sampleRecords("items").filter((r) => r.id_pedido === "375");
    const events375 = sampleRecords("events").filter((r) => r.id_pedido === "375");
    const dir = await tempDir({
      orders: `${withExtraRows("orders", [
        { ...order375, id_pedido: "abc" }, // registro 10: não dá para agrupar
        { ...order375 }, // registro 11: pedido repetido
        { ...order375, id_pedido: "99001", situacao_pedido: "Perdido" }, // fora do contrato
      ])}99002,SEM-USO\n`, // registro 13: colunas faltando
      items: withExtraRows("items", [
        { ...item375, id_pedido: "99001" },
        { ...item375, id_pedido: "99003" }, // item sem pedido
      ]),
      events: withExtraRows(
        "events",
        events375.map((event) => ({ ...event, id_pedido: "99001" })),
      ),
    });
    const log = fakeLog();

    const orders = await loadFileRepository(dir, log);

    expect(await orders.count()).toBe(9);
    expect(await orders.findById(99001)).toBeNull();
    expect(await orders.findById(375)).toStrictEqual(fixtures.find((o) => o.orderId === 375));
    // 3 linhas de pedido + 1 item sem pedido + o 99001 (1 pedido, 1 item, 9 eventos).
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({ orders: 9, invalidRows: 15 }),
      "Pedidos carregados",
    );
    expect(log.warn.mock.calls).toEqual([
      [
        { table: "consumo_pedidos.csv", record: 10, reason: "id_pedido inválido" },
        "Linha inválida; ignorada",
      ],
      [{ table: "consumo_pedidos.csv", record: 11, orderId: 375 }, "Pedido repetido; ignorado"],
      [
        { table: "consumo_pedidos.csv", record: 13, reason: "colunas faltando" },
        "Linha inválida; ignorada",
      ],
      [{ orderId: 99001, rows: 11, fields: ["status"] }, "Pedido fora do contrato; ignorado"],
      [
        { table: "consumo_itens_pedido.csv", orderId: 99003, rows: 1 },
        "Linhas sem pedido; ignoradas",
      ],
    ]);
    // Nada do conteúdo das linhas vai para o log.
    expect(JSON.stringify(log.warn.mock.calls)).not.toMatch(/FICTICIO|adidas|Saltillo|Perdido/);
  });

  it("limita os avisos detalhados no log, mas conta todas as linhas inválidas", async () => {
    const [base] = sampleRecords("orders");
    const invalid = Array.from({ length: 25 }, () => ({ ...base, id_pedido: "x" }));
    const log = fakeLog();

    await loadFileRepository(await tempDir({ orders: withExtraRows("orders", invalid) }), log);

    expect(log.warn).toHaveBeenCalledTimes(10);
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({ invalidRows: 25 }),
      "Pedidos carregados",
    );
  });

  it("agrupa itens e eventos fora de ordem", async () => {
    const reversed = (table: ConsumoTable) => {
      const records = sampleRecords(table);
      return toCsv(records.toReversed(), Object.keys(records[0] ?? {}));
    };
    const dir = await tempDir({
      orders: reversed("orders"),
      items: reversed("items"),
      events: reversed("events"),
    });

    const orders = await loadFileRepository(dir, fakeLog());

    for (const order of fixtures) {
      expect(await orders.findById(order.orderId)).toStrictEqual(order);
    }
  });

  it("aceita CSV com BOM no início e com quebras de linha CRLF", async () => {
    const dir = await tempDir({
      orders: `﻿${sampleText("orders")}`,
      events: sampleText("events").replaceAll("\n", "\r\n"),
    });

    expect(await (await loadFileRepository(dir, fakeLog())).count()).toBe(9);
  });

  it("pasta inexistente impede a carga com mensagem clara", async () => {
    await expect(loadFileRepository("/nao/existe", fakeLog())).rejects.toThrow(
      "Não foi possível ler DATA_DIR (/nao/existe): consumo_pedidos.csv não encontrado.",
    );
  });

  it("tabela faltando na pasta impede a carga, citando o arquivo", async () => {
    const dir = await tempDir({ events: null });

    await expect(loadFileRepository(dir, fakeLog())).rejects.toThrow(
      `Não foi possível ler DATA_DIR (${dir}): consumo_eventos_logisticos.csv não encontrado.`,
    );
  });

  it("tabela vazia impede a carga com mensagem clara", async () => {
    await expect(loadFileRepository(await tempDir({ items: "" }), fakeLog())).rejects.toThrow(
      "consumo_itens_pedido.csv está vazio.",
    );
  });

  it("cabeçalho sem uma coluna lida impede a carga, citando a coluna", async () => {
    const records = sampleRecords("orders");
    const columns = Object.keys(records[0] ?? {}).filter((c) => c !== "situacao_pedido");
    const dir = await tempDir({ orders: toCsv(records, columns) });

    await expect(loadFileRepository(dir, fakeLog())).rejects.toThrow(
      "consumo_pedidos.csv não tem as colunas situacao_pedido.",
    );
  });
});

describe.skipIf(!existsSync(consumoFiles(DATA_DIR).orders))(
  "loadFileRepository (tabelas reais em portal/dados)",
  () => {
    it("carrega os 65.752 pedidos sem linha inválida, e os da demo batem com os fixtures", async () => {
      const log = fakeLog();

      const orders = await loadFileRepository(DATA_DIR, log);

      expect(await orders.count()).toBe(65_752);
      expect(log.info).toHaveBeenCalledWith(
        expect.objectContaining({ orders: 65_752, invalidRows: 0 }),
        "Pedidos carregados",
      );
      for (const order of fixtures) {
        expect(await orders.findById(order.orderId), `pedido ${order.orderId}`).toStrictEqual(
          order,
        );
      }
    }, 120_000);
  },
);
