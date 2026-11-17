import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { promisify } from "node:util";
import { gunzip, gzip } from "node:zlib";
import { type Order, orderSchema } from "@translog/contracts";
import { z } from "zod";

// Cache local do adapter `databricks`: os pedidos já convertidos (o view model `Order`, o mesmo
// que a API devolve, sem nenhuma coluna proibida) num JSON com gzip dentro de `DATA_DIR`, que
// fica fora do Git e da imagem Docker. Medido em 17/11 com os 65.752 pedidos: ~7 MB no disco,
// leitura em ~3 s, contra 25 s a 3 min de consulta e download no Databricks.

/** Muda quando o formato do arquivo muda (o cache antigo é descartado). */
const FORMAT = 1;

/**
 * Código que define como as tabelas viram `Order`. Mudou um deles, os pedidos do cache podem
 * estar diferentes do que a API produziria: a chave muda e o cache é descartado.
 */
const CONVERSION_FILES = [
  new URL("./consumo-mapper.ts", import.meta.url),
  new URL("./consumo-sql.ts", import.meta.url),
  new URL("./escalation.ts", import.meta.url),
  new URL("./file-repository.ts", import.meta.url),
  new URL("../../../contracts/src/orders.ts", import.meta.url),
];

export interface OrderCache {
  /** Versão das tabelas no Databricks quando os pedidos foram baixados (`null` = desconhecida). */
  version: string | null;
  /** Quando o cache foi gravado (ISO 8601, UTC). */
  savedAt: string;
  orders: Map<number, Order>;
}

export type CacheReadResult =
  | { ok: true; cache: OrderCache }
  | { ok: false; reason: "ausente" | "de outra versão do código ou da fonte" | "ilegível" };

const cacheFileSchema = z.object({
  format: z.number(),
  key: z.string(),
  version: z.string().nullable(),
  savedAt: z.string(),
  orders: z.array(z.unknown()),
});

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

/**
 * Identifica de onde e com que código os pedidos vieram: formato do arquivo, workspace,
 * `catalogo.schema` e o conteúdo dos arquivos da conversão.
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
 * Lê o cache. Arquivo ausente, de outra chave ou ilegível (corrompido, formato antigo, pedido
 * fora do contrato) não é erro: devolve o motivo, e quem chama baixa do Databricks.
 */
export async function readOrderCache(file: string, key: string): Promise<CacheReadResult> {
  let raw: Buffer;
  try {
    raw = await readFile(file);
  } catch {
    return { ok: false, reason: "ausente" };
  }
  try {
    const content = cacheFileSchema.parse(JSON.parse((await gunzipAsync(raw)).toString("utf8")));
    if (content.format !== FORMAT || content.key !== key) {
      return { ok: false, reason: "de outra versão do código ou da fonte" };
    }
    internStrings(content.orders);
    const orders = new Map<number, Order>();
    for (const value of content.orders) {
      const order = orderSchema.parse(value);
      orders.set(order.orderId, order);
    }
    return { ok: true, cache: { version: content.version, savedAt: content.savedAt, orders } };
  } catch {
    return { ok: false, reason: "ilegível" };
  }
}

/**
 * Grava o cache num arquivo temporário e troca pelo definitivo: uma gravação interrompida
 * nunca deixa um cache pela metade. Só o dono lê (0600).
 */
export async function writeOrderCache(
  file: string,
  key: string,
  version: string | null,
  orders: ReadonlyMap<number, Order>,
): Promise<void> {
  const content = JSON.stringify({
    format: FORMAT,
    key,
    version,
    savedAt: new Date().toISOString(),
    orders: [...orders.values()],
  });
  const zipped = await gzipAsync(content);
  await mkdir(dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  try {
    await writeFile(temp, zipped, { mode: 0o600 });
    await rename(temp, file);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}

/**
 * Uma instância só de cada texto repetido (modalidades, regiões, datas, locais dos eventos),
 * como a leitura dos CSVs faz. Sem isso, o heap dos 65.752 pedidos passa de ~83 para ~210 MB
 * (medido em 17/11); o custo é ~0,7 s na leitura.
 */
function internStrings(values: unknown[]): void {
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
  visit(values);
}
