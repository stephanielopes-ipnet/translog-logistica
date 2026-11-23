import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { access, mkdir, readFile, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip, createGzip } from "node:zlib";
import { z } from "zod";
import { type OrderRecord, orderRecordSchema } from "./order-record.ts";

// Cache local do adapter `databricks`: os pedidos já convertidos (o `OrderRecord` que a API
// guarda, sem nenhuma coluna proibida), com gzip dentro de `DATA_DIR` (fora do Git e da imagem Docker). Formato: uma linha de cabeçalho em JSON e um
// pedido por linha, lido em streaming. Medido em 18/11 com os 65.752 pedidos: ~11 MB no disco,
// leitura em ~3 s, contra 25 s a 5 min de consulta e download no Databricks.

/** Muda quando o formato do arquivo muda (o cache antigo é descartado). */
const FORMAT = 5;

/**
 * Código que define como as tabelas viram `OrderRecord`. Mudou um deles, os pedidos do cache podem
 * estar diferentes do que a API produziria: a chave muda e o cache é descartado.
 */
const CONVERSION_FILES = [
  new URL("./consumo-mapper.ts", import.meta.url),
  new URL("./consumo-sql.ts", import.meta.url),
  new URL("./escalation.ts", import.meta.url),
  new URL("./file-repository.ts", import.meta.url),
  new URL("./order-record.ts", import.meta.url),
  new URL("../../../contracts/src/orders.ts", import.meta.url),
  new URL("../../../contracts/src/staff-orders.ts", import.meta.url),
];

export interface OrderCache {
  /** Versão das tabelas no Databricks quando os pedidos foram baixados (`null` = desconhecida). */
  version: string | null;
  /** Quando o cache foi gravado (ISO 8601, UTC). */
  savedAt: string;
  orders: Map<number, OrderRecord>;
}

export type CacheReadResult =
  | { ok: true; cache: OrderCache }
  | { ok: false; reason: "ausente" | "de outra versão do código ou da fonte" | "ilegível" };

/** Primeira linha do arquivo; as seguintes são os pedidos, um por linha. */
const cacheHeaderSchema = z.object({
  format: z.number(),
  key: z.string(),
  version: z.string().nullable(),
  savedAt: z.string(),
  /** Quantos pedidos vêm depois: arquivo cortado no meio não passa como cache válido. */
  orders: z.number().int().nonnegative(),
});

/**
 * Identifica de onde e com que código os pedidos vieram: formato do arquivo, workspace,
 * `catalogo.schema` dos pedidos e o conteúdo dos arquivos da conversão.
 */
export async function cacheKey(source: { baseUrl: string; catalogSchema: string }) {
  const hash = createHash("sha256").update(
    `${FORMAT}\n${source.baseUrl}\n${source.catalogSchema}\n`,
  );
  for (const file of CONVERSION_FILES) {
    hash.update(await readFile(file));
  }
  return hash.digest("hex");
}

/**
 * Lê o cache em streaming, um pedido por linha (sem montar um texto de ~190 MB na memória, o
 * que levava o RSS a ~1,3 GB). Arquivo ausente, de outra chave ou ilegível (corrompido, formato
 * antigo, pedido fora do contrato) não é erro: devolve o motivo, e quem chama baixa
 * do Databricks.
 */
export async function readOrderCache(file: string, key: string): Promise<CacheReadResult> {
  try {
    await access(file);
  } catch {
    return { ok: false, reason: "ausente" };
  }
  const input = createReadStream(file);
  const lines = createInterface({ input: input.pipe(createGunzip()), crlfDelay: Infinity });
  const intern = createInterner();
  try {
    let header: z.infer<typeof cacheHeaderSchema> | undefined;
    const orders = new Map<number, OrderRecord>();
    for await (const line of lines) {
      if (header === undefined) {
        header = cacheHeaderSchema.parse(JSON.parse(line));
        if (header.format !== FORMAT || header.key !== key) {
          return { ok: false, reason: "de outra versão do código ou da fonte" };
        }
        continue;
      }
      const order = orderRecordSchema.parse(intern(JSON.parse(line)));
      orders.set(order.orderId, order);
    }
    if (header === undefined || orders.size !== header.orders) {
      return { ok: false, reason: "ilegível" };
    }
    return {
      ok: true,
      cache: { version: header.version, savedAt: header.savedAt, orders },
    };
  } catch {
    return { ok: false, reason: "ilegível" };
  } finally {
    lines.close();
    input.destroy();
  }
}

/**
 * Grava o cache (cabeçalho + um pedido por linha, com gzip) num arquivo temporário e troca pelo
 * definitivo: uma gravação interrompida nunca deixa um cache pela metade. Só o dono lê (0600).
 */
export async function writeOrderCache(
  file: string,
  key: string,
  version: string | null,
  { orders }: { orders: ReadonlyMap<number, OrderRecord> },
): Promise<void> {
  const header = {
    format: FORMAT,
    key,
    version,
    savedAt: new Date().toISOString(),
    orders: orders.size,
  } satisfies z.infer<typeof cacheHeaderSchema>;
  function* lines() {
    yield `${JSON.stringify(header)}\n`;
    for (const order of orders.values()) {
      yield `${JSON.stringify(order)}\n`;
    }
  }
  await mkdir(dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  try {
    await pipeline(Readable.from(lines()), createGzip(), createWriteStream(temp, { mode: 0o600 }));
    await rename(temp, file);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}

/**
 * Uma instância só de cada texto repetido (modalidades, regiões, datas, locais dos eventos),
 * como a leitura dos CSVs faz, com um dicionário compartilhado por todos os pedidos da leitura.
 * Sem isso, o heap dos 65.752 pedidos passa de ~83 para ~210 MB (medido em 17/11).
 */
function createInterner(): (value: unknown) => unknown {
  const pool = new Map<string, string>();
  const visit = (value: unknown): unknown => {
    if (typeof value === "string") {
      const known = pool.get(value);
      if (known !== undefined) {
        return known;
      }
      pool.set(value, value);
      return value;
    }
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index++) {
        value[index] = visit(value[index]);
      }
    } else if (typeof value === "object" && value !== null) {
      const record = value as Record<string, unknown>;
      for (const key of Object.keys(record)) {
        record[key] = visit(record[key]);
      }
    }
    return value;
  };
  return visit;
}
