import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Order, orderSchema } from "@translog/contracts";
import { parse } from "csv-parse/sync";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { z } from "zod";
import { loadFileRepository } from "./file-repository.ts";
import { FIXTURES_FILE } from "./fixtures-repository.ts";
import { FORBIDDEN_COLUMNS } from "./silver-mapper.ts";

/**
 * Amostra da Silver com os pedidos 15, 375, 552, 562 e 1002 (15 linhas, 41 colunas).
 * Colunas lidas com os valores reais; proibidas com `FICTICIO-*`; sem uso com `SEM-USO`.
 */
const SAMPLE_CSV = fileURLToPath(new URL("./fixtures/silver-amostra.csv", import.meta.url));
const SAMPLE_TEXT = readFileSync(SAMPLE_CSV, "utf8");
const SAMPLE_IDS = [15, 375, 552, 562, 1002];

/** Cópia local da Silver (fora do Git). O teste de integração só roda se ela existir. */
const SILVER_CSV = fileURLToPath(
  new URL("../../../dados/silver_pedidos_rastreio.csv", import.meta.url),
);

const fixtures = z.array(orderSchema).parse(JSON.parse(readFileSync(FIXTURES_FILE, "utf8")));

/**
 * O que a Silver deve produzir: o pedido dos fixtures (copiados de mocks-silver.json),
 * mas sem motivo provável. "Promessa irreal" no 375 é exemplo da demo; a coluna não existe.
 */
function expectedFromSilver(orderId: number): Order {
  const order = fixtures.find((candidate) => candidate.orderId === orderId);
  if (!order) {
    throw new Error(`Pedido ${orderId} não está nos fixtures`);
  }
  return { ...order, probableCause: null };
}

function fakeLog() {
  return { info: vi.fn(), warn: vi.fn() };
}

async function tempCsv(content: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "translog-silver-"));
  onTestFinished(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, "silver.csv");
  await writeFile(file, content);
  return file;
}

/** Linhas da amostra como objetos (cabeçalho completo), para montar CSVs de teste. */
const sampleRecords: Record<string, string>[] = parse(SAMPLE_TEXT, { columns: true });
const header = Object.keys(sampleRecords[0] ?? {});

function toCsv(records: readonly Record<string, string>[], columns = header): string {
  const quote = (value = "") => `"${value.replaceAll('"', '""')}"`;
  const lines = records.map((record) => columns.map((column) => quote(record[column])).join(","));
  return `${[columns.join(","), ...lines].join("\n")}\n`;
}

describe("loadFileRepository (amostra da Silver)", () => {
  it("monta os pedidos 15, 375, 562, 1002 e 552 iguais aos mocks", async () => {
    const orders = await loadFileRepository(SAMPLE_CSV, fakeLog());

    expect(await orders.count()).toBe(SAMPLE_IDS.length);
    for (const orderId of SAMPLE_IDS) {
      expect(await orders.findById(orderId), `pedido ${orderId}`).toStrictEqual(
        expectedFromSilver(orderId),
      );
    }
  });

  it("loga ao fim os pedidos carregados, as linhas inválidas e o tempo de carga", async () => {
    const log = fakeLog();

    await loadFileRepository(SAMPLE_CSV, log);

    expect(log.info).toHaveBeenCalledExactlyOnceWith(
      { file: SAMPLE_CSV, orders: 5, invalidRows: 0, durationMs: expect.any(Number) },
      "Pedidos carregados da Silver",
    );
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("descarta na leitura as colunas proibidas e as sem uso", async () => {
    // Sanidade: a amostra tem todas as colunas proibidas, com valores fictícios.
    for (const column of FORBIDDEN_COLUMNS) {
      expect(header).toContain(column);
      expect(sampleRecords[0]?.[column]).toMatch(/^FICTICIO-/);
    }

    const orders = await loadFileRepository(SAMPLE_CSV, fakeLog());
    const loaded = await Promise.all(SAMPLE_IDS.map((id) => orders.findById(id)));

    expect(JSON.stringify(loaded)).not.toMatch(/FICTICIO|SEM-USO/);
  });

  it("conta e loga linhas inválidas sem conteúdo, e carrega o resto", async () => {
    const [base] = sampleRecords.filter((record) => record.id_pedido === "552");
    const invalid = [
      { ...base, id_pedido: "abc" }, // não dá para agrupar
      { ...base, id_pedido: "99001", situacao_rastreio: "Extraviado" }, // fora do contrato
      { ...base, id_pedido: "99001", situacao_rastreio: "Extraviado" },
    ];
    const shortLine = "99002,SEM-USO\n"; // colunas faltando
    const file = await tempCsv(toCsv([...sampleRecords, ...invalid]) + shortLine);
    const log = fakeLog();

    const orders = await loadFileRepository(file, log);

    expect(await orders.count()).toBe(5);
    expect(await orders.findById(99001)).toBeNull();
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({ orders: 5, invalidRows: 4 }),
      "Pedidos carregados da Silver",
    );
    expect(log.warn.mock.calls).toEqual([
      [{ record: 16, reason: "id_pedido inválido" }, "Linha inválida na Silver; ignorada"],
      [{ record: 19, reason: "colunas faltando" }, "Linha inválida na Silver; ignorada"],
      [
        { orderId: 99001, rows: 2, fields: ["trackingStatus"] },
        "Pedido inválido na Silver; ignorado",
      ],
    ]);
    // Nada do conteúdo das linhas vai para o log.
    expect(JSON.stringify(log.warn.mock.calls)).not.toMatch(/FICTICIO|Neoprene|Mexico|Extraviado/);
  });

  it("limita os avisos detalhados no log, mas conta todas as linhas inválidas", async () => {
    const [base] = sampleRecords;
    const invalid = Array.from({ length: 25 }, () => ({ ...base, id_pedido: "x" }));
    const log = fakeLog();

    await loadFileRepository(await tempCsv(toCsv([...sampleRecords, ...invalid])), log);

    expect(log.warn).toHaveBeenCalledTimes(10);
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({ invalidRows: 25 }),
      "Pedidos carregados da Silver",
    );
  });

  it("agrupa os itens de um pedido mesmo fora de sequência", async () => {
    const file = await tempCsv(toCsv(sampleRecords.toReversed()));

    const orders = await loadFileRepository(file, fakeLog());

    const order15 = await orders.findById(15);
    expect(order15?.total).toBe(773.89);
    expect(order15?.items.map((item) => item.total)).toEqual([331.98, 151.17, 89.25, 163.99, 37.5]);
  });

  it("aceita CSV com BOM no início", async () => {
    const file = await tempCsv(`﻿${SAMPLE_TEXT}`);

    expect(await (await loadFileRepository(file, fakeLog())).count()).toBe(5);
  });

  it("arquivo inexistente impede a carga com mensagem clara", async () => {
    await expect(loadFileRepository("/nao/existe.csv", fakeLog())).rejects.toThrow(
      "Não foi possível ler ORDERS_FILE (/nao/existe.csv): arquivo não encontrado.",
    );
  });

  it("pasta no lugar do arquivo impede a carga com mensagem clara", async () => {
    await expect(loadFileRepository(tmpdir(), fakeLog())).rejects.toThrow(
      "o caminho é uma pasta, não um arquivo.",
    );
  });

  it("arquivo vazio impede a carga com mensagem clara", async () => {
    await expect(loadFileRepository(await tempCsv(""), fakeLog())).rejects.toThrow(
      "o arquivo está vazio.",
    );
  });

  it("cabeçalho sem uma coluna lida impede a carga, citando a coluna", async () => {
    const columns = header.filter((column) => column !== "situacao_rastreio");
    const file = await tempCsv(toCsv(sampleRecords, columns));

    await expect(loadFileRepository(file, fakeLog())).rejects.toThrow(
      "o cabeçalho não tem as colunas situacao_rastreio.",
    );
  });
});

describe.skipIf(!existsSync(SILVER_CSV))("loadFileRepository (Silver real em portal/dados)", () => {
  it("carrega todos os pedidos sem linha inválida, e os 11 dos mocks batem", async () => {
    const log = fakeLog();

    const orders = await loadFileRepository(SILVER_CSV, log);

    // Perfil da cópia de 13/11 (180.519 linhas). Silver nova do Mateus: atualizar o número.
    expect(await orders.count()).toBe(65_752);
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({ orders: 65_752, invalidRows: 0 }),
      "Pedidos carregados da Silver",
    );
    for (const { orderId } of fixtures) {
      expect(await orders.findById(orderId), `pedido ${orderId}`).toStrictEqual(
        expectedFromSilver(orderId),
      );
    }
  }, 120_000);
});
