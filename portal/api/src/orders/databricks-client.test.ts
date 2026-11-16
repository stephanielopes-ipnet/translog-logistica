import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it, onTestFinished } from "vitest";
import { createDatabricksClient, DatabricksError } from "./databricks-client.ts";

// Servidor HTTP falso no lugar do Databricks: API do workspace em /api/2.0/... e os links
// "pré-assinados" em /storage/... no mesmo servidor. Nenhum teste chama o Databricks real.

const TOKEN = "token-de-teste";

interface Recorded {
  method: string;
  url: string;
  authorization: string | undefined;
  body: string;
}

type Handler = (request: Recorded, response: ServerResponse) => void;

async function fakeDatabricks(handler: Handler) {
  const requests: Recorded[] = [];
  const server = createServer((req: IncomingMessage, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      const recorded = {
        method: req.method ?? "",
        url: req.url ?? "",
        authorization: req.headers.authorization,
        body,
      };
      requests.push(recorded);
      handler(recorded, res);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  onTestFinished(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { baseUrl, requests };
}

function json(response: ServerResponse, status: number, body: object) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

function succeeded(baseUrl: string, links: object[] = [link(baseUrl, 0, 1)]) {
  return {
    statement_id: "st-1",
    status: { state: "SUCCEEDED" },
    manifest: {
      format: "CSV",
      schema: { columns: [{ name: "id_pedido" }, { name: "situacao_pedido" }] },
      total_row_count: 3,
      total_chunk_count: links.length,
    },
    result: { external_links: links },
  };
}

function link(baseUrl: string, index: number, total: number) {
  return {
    chunk_index: index,
    external_link: `${baseUrl}/storage/chunk-${index}?assinatura=x`,
    ...(index + 1 < total
      ? { next_chunk_internal_link: `/api/2.0/sql/statements/st-1/result/chunks/${index + 1}` }
      : {}),
  };
}

const CHUNKS = [
  "id_pedido,situacao_pedido\n375,Entregue com atraso\n",
  "id_pedido,situacao_pedido\r\n34,Extraviado\n",
  "9,Não pago (expirado)",
];

function client(baseUrl: string, options: { timeoutMs?: number } = {}) {
  return createDatabricksClient({
    baseUrl,
    warehouseId: "wh-1",
    token: TOKEN,
    pollIntervalMs: 5,
    ...options,
  });
}

async function readAll(chunks: AsyncGenerator<Buffer>): Promise<string> {
  const parts: Buffer[] = [];
  for await (const chunk of chunks) {
    parts.push(chunk);
  }
  return Buffer.concat(parts).toString("utf8");
}

describe("createDatabricksClient", () => {
  it("envia a consulta com EXTERNAL_LINKS + CSV e o token só para a API do workspace", async () => {
    const { baseUrl, requests } = await fakeDatabricks((request, response) => {
      if (request.url === "/api/2.0/sql/statements") {
        json(response, 200, succeeded(baseUrl));
      } else {
        response.end(CHUNKS[0]);
      }
    });

    const result = await client(baseUrl).queryCsv("SELECT 1");
    const csv = await readAll(result.chunks());

    expect(result).toMatchObject({ columns: ["id_pedido", "situacao_pedido"], totalRows: 3 });
    expect(csv).toBe(CHUNKS[0]);
    const [submit, download] = requests;
    expect(JSON.parse(submit?.body ?? "")).toStrictEqual({
      statement: "SELECT 1",
      warehouse_id: "wh-1",
      wait_timeout: "30s",
      on_wait_timeout: "CONTINUE",
      disposition: "EXTERNAL_LINKS",
      format: "CSV",
    });
    expect(submit?.authorization).toBe(`Bearer ${TOKEN}`);
    // Link pré-assinado: nunca recebe o header Authorization.
    expect(download?.url).toBe("/storage/chunk-0?assinatura=x");
    expect(download?.authorization).toBeUndefined();
  });

  it("espera PENDING → RUNNING → SUCCEEDED consultando o status", async () => {
    const states = ["RUNNING", "SUCCEEDED"];
    const { baseUrl, requests } = await fakeDatabricks((request, response) => {
      if (request.method === "POST") {
        json(response, 200, { statement_id: "st-1", status: { state: "PENDING" } });
      } else if (request.url === "/api/2.0/sql/statements/st-1") {
        const state = states.shift();
        json(
          response,
          200,
          state === "SUCCEEDED" ? succeeded(baseUrl) : { ...succeeded(baseUrl), status: { state } },
        );
      } else {
        response.end(CHUNKS[0]);
      }
    });

    const csv = await readAll((await client(baseUrl).queryCsv("SELECT 1")).chunks());

    expect(csv).toBe(CHUNKS[0]);
    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual([
      "POST /api/2.0/sql/statements",
      "GET /api/2.0/sql/statements/st-1",
      "GET /api/2.0/sql/statements/st-1",
      "GET /storage/chunk-0?assinatura=x",
    ]);
    expect(requests.filter((r) => r.url.startsWith("/api/")).map((r) => r.authorization)).toEqual(
      Array(3).fill(`Bearer ${TOKEN}`),
    );
  });

  it("baixa vários pedaços seguindo next_chunk_internal_link, com o cabeçalho uma vez só", async () => {
    const { baseUrl, requests } = await fakeDatabricks((request, response) => {
      const chunkLink = request.url.match(/\/result\/chunks\/(\d+)$/);
      const storage = request.url.match(/^\/storage\/chunk-(\d+)/);
      if (request.method === "POST") {
        json(response, 200, succeeded(baseUrl, [link(baseUrl, 0, 3)]));
      } else if (chunkLink) {
        json(response, 200, { external_links: [link(baseUrl, Number(chunkLink[1]), 3)] });
      } else if (storage) {
        response.end(CHUNKS[Number(storage[1])]);
      }
    });

    const csv = await readAll((await client(baseUrl).queryCsv("SELECT 1")).chunks());

    expect(csv).toBe(
      "id_pedido,situacao_pedido\n375,Entregue com atraso\n34,Extraviado\n9,Não pago (expirado)\n",
    );
    // Primeiro os links (API, com token); depois os pedaços em paralelo (sem token).
    expect(requests.slice(0, 3).map((r) => [r.url, r.authorization])).toEqual([
      ["/api/2.0/sql/statements", `Bearer ${TOKEN}`],
      ["/api/2.0/sql/statements/st-1/result/chunks/1", `Bearer ${TOKEN}`],
      ["/api/2.0/sql/statements/st-1/result/chunks/2", `Bearer ${TOKEN}`],
    ]);
    expect(
      requests
        .slice(3)
        .map((r) => [r.url, r.authorization])
        .sort(),
    ).toEqual([
      ["/storage/chunk-0?assinatura=x", undefined],
      ["/storage/chunk-1?assinatura=x", undefined],
      ["/storage/chunk-2?assinatura=x", undefined],
    ]);
  });

  it.each([401, 403])(
    "HTTP %i: diz para conferir o token e sugere DATA_SOURCE=file",
    async (status) => {
      const { baseUrl } = await fakeDatabricks((_request, response) => {
        json(response, status, {
          error_code: "PERMISSION_DENIED",
          message: "Invalid access token",
        });
      });

      const error = await client(baseUrl)
        .queryCsv("SELECT 1")
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(DatabricksError);
      expect(String(error)).toContain(
        `O Databricks recusou o acesso (HTTP ${status}). Confira DATABRICKS_TOKEN`,
      );
      expect(String(error)).toContain("use DATA_SOURCE=file");
      expect(String(error)).not.toContain(TOKEN);
    },
  );

  it("FAILED (tabela ausente): repassa o código e a mensagem do Databricks", async () => {
    const { baseUrl } = await fakeDatabricks((_request, response) => {
      json(response, 200, {
        statement_id: "st-1",
        status: {
          state: "FAILED",
          error: {
            error_code: "BAD_REQUEST",
            message:
              "[TABLE_OR_VIEW_NOT_FOUND] The table or view `workspace`.`silver`.`x` cannot be found.",
          },
        },
      });
    });

    await expect(client(baseUrl).queryCsv("SELECT 1")).rejects.toThrow(
      /^A consulta terminou com FAILED \(BAD_REQUEST\): \[TABLE_OR_VIEW_NOT_FOUND\].*Confira se a tabela existe.*DATA_SOURCE=file/,
    );
  });

  it("timeout: cancela a consulta e explica que o warehouse pode estar ligando", async () => {
    const { baseUrl, requests } = await fakeDatabricks((request, response) => {
      json(response, 200, {
        statement_id: "st-1",
        status: {
          state:
            request.method === "POST" && request.url.endsWith("/cancel") ? "CANCELED" : "PENDING",
        },
      });
    });

    await expect(client(baseUrl, { timeoutMs: 30 }).queryCsv("SELECT 1")).rejects.toThrow(
      /^A consulta não terminou em 0 s \(estado PENDING\)\. O warehouse pode estar ligando/,
    );
    expect(requests.at(-1)?.url).toBe("/api/2.0/sql/statements/st-1/cancel");
  });

  it("erro HTTP de outro tipo mostra o status e a mensagem curta", async () => {
    const { baseUrl } = await fakeDatabricks((_request, response) => {
      json(response, 404, {
        error_code: "RESOURCE_DOES_NOT_EXIST",
        message: "Warehouse wh-1 not found",
      });
    });

    await expect(client(baseUrl).queryCsv("SELECT 1")).rejects.toThrow(
      "O Databricks respondeu HTTP 404: Warehouse wh-1 not found. Confira DATABRICKS_HOST e DATABRICKS_WAREHOUSE_ID.",
    );
  });

  it("host inacessível: diz para conferir o endereço e a rede", async () => {
    // Porta que acabou de ser liberada: ninguém escuta nela.
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    await new Promise<void>((resolve) => server.close(() => resolve()));

    await expect(client(`http://127.0.0.1:${port}`).queryCsv("SELECT 1")).rejects.toThrow(
      /^Não foi possível conectar ao Databricks \(ECONNREFUSED\)\. Confira DATABRICKS_HOST/,
    );
  });

  it("baixa os pedaços em paralelo e os entrega na ordem, mesmo se o primeiro chegar por último", async () => {
    const { baseUrl } = await fakeDatabricks((request, response) => {
      const chunkLink = request.url.match(/\/result\/chunks\/(\d+)$/);
      const storage = request.url.match(/^\/storage\/chunk-(\d+)/);
      if (request.method === "POST") {
        json(response, 200, succeeded(baseUrl, [link(baseUrl, 0, 3)]));
      } else if (chunkLink) {
        json(response, 200, { external_links: [link(baseUrl, Number(chunkLink[1]), 3)] });
      } else if (storage) {
        const index = Number(storage[1]);
        // O pedaço 0 demora mais: só um download paralelo deixa os outros terminarem antes.
        setTimeout(() => response.end(CHUNKS[index]), index === 0 ? 80 : 0);
      }
    });

    const started = performance.now();
    const csv = await readAll((await client(baseUrl).queryCsv("SELECT 1")).chunks());

    expect(csv).toBe(
      "id_pedido,situacao_pedido\n375,Entregue com atraso\n34,Extraviado\n9,Não pago (expirado)\n",
    );
    expect(performance.now() - started).toBeLessThan(500);
  });

  it("falha no download de um pedaço vira erro claro", async () => {
    const { baseUrl } = await fakeDatabricks((request, response) => {
      if (request.method === "POST") {
        json(response, 200, succeeded(baseUrl));
      } else {
        response.writeHead(403).end("expired");
      }
    });

    const result = await client(baseUrl).queryCsv("SELECT 1");

    await expect(readAll(result.chunks())).rejects.toThrow(
      "Falha ao baixar o pedaço 0 do resultado (HTTP 403).",
    );
  });
});
