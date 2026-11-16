import { setTimeout as sleep } from "node:timers/promises";
import { z } from "zod";

// Cliente mínimo da SQL Statement Execution API do Databricks, com `fetch` nativo:
// POST /api/2.0/sql/statements → espera o estado SUCCEEDED → baixa os pedaços em CSV pelos
// links pré-assinados (EXTERNAL_LINKS). O token só vai no header das chamadas ao workspace:
// nunca nos links pré-assinados, nas mensagens de erro ou no log.

export interface DatabricksClientOptions {
  /** `https://<host>` do workspace (nos testes, o servidor falso). Sem barra no fim. */
  baseUrl: string;
  warehouseId: string;
  token: string;
  /** Limite para a consulta terminar (o warehouse da edição gratuita dorme). Padrão 3 min. */
  timeoutMs?: number;
  /** Intervalo entre consultas de status enquanto PENDING/RUNNING. Padrão 2 s. */
  pollIntervalMs?: number;
}

/**
 * Resultado de uma consulta já concluída. `chunks()` baixa os pedaços (até
 * `DOWNLOAD_CONCURRENCY` ao mesmo tempo) e os entrega em ordem.
 */
export interface CsvResult {
  columns: string[];
  totalRows: number;
  /** CSV completo em pedaços: o cabeçalho uma vez só, no começo, e depois as linhas. */
  chunks(): AsyncGenerator<Buffer>;
}

export interface DatabricksClient {
  /** Executa a consulta e devolve o resultado em CSV. Erros em pt-BR, com o que fazer. */
  queryCsv(statement: string): Promise<CsvResult>;
}

/** Erro do Databricks com a orientação para quem opera; nunca contém o token. */
export class DatabricksError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabricksError";
  }
}

const externalLinkSchema = z.object({
  chunk_index: z.number(),
  external_link: z.string(),
  http_headers: z.record(z.string(), z.string()).optional(),
  next_chunk_internal_link: z.string().optional(),
});
type ExternalLink = z.infer<typeof externalLinkSchema>;

const statementSchema = z.object({
  statement_id: z.string(),
  status: z.object({
    state: z.string(),
    error: z
      .object({ error_code: z.string().optional(), message: z.string().optional() })
      .optional(),
  }),
  manifest: z
    .object({
      schema: z.object({ columns: z.array(z.object({ name: z.string() })).default([]) }),
      total_row_count: z.number().default(0),
      truncated: z.boolean().optional(),
    })
    .optional(),
  result: z.object({ external_links: z.array(externalLinkSchema).optional() }).optional(),
});
type Statement = z.infer<typeof statementSchema>;

const chunkSchema = z.object({ external_links: z.array(externalLinkSchema).optional() });

const RUNNING_STATES = new Set(["PENDING", "RUNNING"]);

/**
 * Pedaços baixados ao mesmo tempo por consulta. Medido em 16/11: cada link pré-assinado sai a
 * ~1,4 MB/s; baixar um de cada vez deixava a carga em ~90 s.
 */
const DOWNLOAD_CONCURRENCY = 4;

const TRY_FILE = "Para seguir sem o Databricks, use DATA_SOURCE=file com os CSVs em portal/dados/.";

export function createDatabricksClient({
  baseUrl,
  warehouseId,
  token,
  timeoutMs = 180_000,
  pollIntervalMs = 2000,
}: DatabricksClientOptions): DatabricksClient {
  const authHeaders = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  /** Chamada à API do workspace (com o token). */
  async function callApi(method: "GET" | "POST", path: string, body?: object): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: authHeaders,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (error) {
      throw new DatabricksError(
        `Não foi possível conectar ao Databricks (${describeFetchError(error)}). ` +
          `Confira DATABRICKS_HOST e a rede. ${TRY_FILE}`,
      );
    }
    if (response.status === 401 || response.status === 403) {
      throw new DatabricksError(
        `O Databricks recusou o acesso (HTTP ${response.status}). Confira DATABRICKS_TOKEN ` +
          `(expirado ou sem permissão no warehouse). ${TRY_FILE}`,
      );
    }
    const text = await response.text();
    if (!response.ok) {
      throw new DatabricksError(
        `O Databricks respondeu HTTP ${response.status}: ${apiMessage(text)}. ` +
          `Confira DATABRICKS_HOST e DATABRICKS_WAREHOUSE_ID. ${TRY_FILE}`,
      );
    }
    return JSON.parse(text);
  }

  async function getStatement(id: string): Promise<Statement> {
    return statementSchema.parse(
      await callApi("GET", `/api/2.0/sql/statements/${encodeURIComponent(id)}`),
    );
  }

  /** Todos os links do resultado (as chamadas à API são rápidas; o download é que demora). */
  async function allLinks(first: readonly ExternalLink[]): Promise<ExternalLink[]> {
    const links = [...first];
    let next = links.at(-1)?.next_chunk_internal_link;
    while (next) {
      const page = chunkSchema.parse(await callApi("GET", next)).external_links ?? [];
      links.push(...page);
      next = page.at(-1)?.next_chunk_internal_link;
    }
    return links;
  }

  async function* downloadChunks(first: readonly ExternalLink[], header: string) {
    const headerBytes = Buffer.from(header);
    yield Buffer.from(`${header}\n`);
    const links = await allLinks(first);
    const pending: Promise<Buffer>[] = [];
    const start = (index: number) => {
      const link = links[index];
      if (link) {
        const promise = download(link);
        // Falha de um pedaço adiantado só aparece quando chegar a vez dele (sem rejeição solta).
        promise.catch(() => undefined);
        pending[index] = promise;
      }
    };
    for (let index = 0; index < DOWNLOAD_CONCURRENCY; index++) {
      start(index);
    }
    for (let index = 0; index < links.length; index++) {
      const chunk = await pending[index];
      start(index + DOWNLOAD_CONCURRENCY);
      if (chunk) {
        yield withoutHeader(chunk, headerBytes);
      }
    }
  }

  return {
    async queryCsv(statement) {
      const startedAt = performance.now();
      let current = statementSchema.parse(
        await callApi("POST", "/api/2.0/sql/statements", {
          statement,
          warehouse_id: warehouseId,
          wait_timeout: "30s",
          on_wait_timeout: "CONTINUE",
          disposition: "EXTERNAL_LINKS",
          format: "CSV",
        }),
      );
      while (RUNNING_STATES.has(current.status.state)) {
        if (performance.now() - startedAt > timeoutMs) {
          await cancel(current.statement_id);
          throw new DatabricksError(
            `A consulta não terminou em ${Math.round(timeoutMs / 1000)} s (estado ` +
              `${current.status.state}). O warehouse pode estar ligando ou sem cota; tente de ` +
              `novo em alguns minutos. ${TRY_FILE}`,
          );
        }
        await sleep(pollIntervalMs);
        current = await getStatement(current.statement_id);
      }
      if (current.status.state !== "SUCCEEDED") {
        const { error_code: code, message } = current.status.error ?? {};
        throw new DatabricksError(
          `A consulta terminou com ${current.status.state}` +
            `${code ? ` (${code})` : ""}: ${message?.split("\n")[0] ?? "sem detalhes"} ` +
            `Confira se a tabela existe e se o token tem acesso a ela. ${TRY_FILE}`,
        );
      }
      if (current.manifest?.truncated) {
        throw new DatabricksError("O Databricks truncou o resultado da consulta.");
      }
      const columns = current.manifest?.schema.columns.map((column) => column.name) ?? [];
      const firstLinks = current.result?.external_links ?? [];
      return {
        columns,
        totalRows: current.manifest?.total_row_count ?? 0,
        chunks: () => downloadChunks(firstLinks, columns.join(",")),
      };
    },
  };

  /** Cancela a consulta no warehouse (melhor esforço: o erro de timeout é o que importa). */
  async function cancel(id: string) {
    await callApi("POST", `/api/2.0/sql/statements/${encodeURIComponent(id)}/cancel`).catch(
      () => undefined,
    );
  }
}

/**
 * Baixa um pedaço pelo link pré-assinado. Sem o header `Authorization`: o link já carrega a
 * autorização, e o armazenamento recusa (ou registraria) o token do Databricks.
 */
async function download(link: ExternalLink): Promise<Buffer> {
  let response: Response;
  try {
    response = await fetch(link.external_link, {
      headers: link.http_headers ?? {},
      signal: AbortSignal.timeout(300_000),
    });
  } catch (error) {
    throw new DatabricksError(
      `Falha ao baixar o pedaço ${link.chunk_index} do resultado (${describeFetchError(error)}).`,
    );
  }
  if (!response.ok) {
    throw new DatabricksError(
      `Falha ao baixar o pedaço ${link.chunk_index} do resultado (HTTP ${response.status}).`,
    );
  }
  // Bytes, não texto: um pedaço de ~20 MB como string ocuparia o dobro (UTF-16) no heap.
  return Buffer.from(await response.arrayBuffer());
}

const LF = 0x0a;
const CR = 0x0d;

/**
 * Tira o cabeçalho do começo do pedaço, se vier repetido (no Databricks real só o primeiro
 * pedaço o traz), e garante a quebra de linha final.
 */
function withoutHeader(chunk: Buffer, header: Buffer): Buffer {
  let body = chunk;
  if (chunk.subarray(0, header.length).equals(header)) {
    const next = chunk[header.length];
    if (next === LF) {
      body = chunk.subarray(header.length + 1);
    } else if (next === CR && chunk[header.length + 1] === LF) {
      body = chunk.subarray(header.length + 2);
    }
  }
  return body.length === 0 || body[body.length - 1] === LF
    ? body
    : Buffer.concat([body, Buffer.from("\n")]);
}

/** Mensagem do corpo de erro da API (`{ error_code, message }`), curta e sem dados sensíveis. */
function apiMessage(text: string): string {
  try {
    const body: unknown = JSON.parse(text);
    if (typeof body === "object" && body !== null && "message" in body) {
      return String(body.message).slice(0, 300);
    }
  } catch {
    // corpo não é JSON
  }
  return text.slice(0, 300) || "sem detalhes";
}

function describeFetchError(error: unknown): string {
  if (error instanceof Error && error.name === "TimeoutError") {
    return "tempo esgotado";
  }
  // `fetch` falha com "fetch failed"; o motivo de rede (ECONNREFUSED, ENOTFOUND…) vem na causa.
  const cause = error instanceof Error ? error.cause : undefined;
  if (typeof cause === "object" && cause !== null && "code" in cause) {
    return String(cause.code);
  }
  return error instanceof Error ? error.message : String(error);
}
