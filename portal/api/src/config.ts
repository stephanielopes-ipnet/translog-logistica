import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { agentModeSchema, dataSourceSchema } from "@translog/contracts";
import { z } from "zod";

/** Pasta `portal/`: caminhos relativos em `DATA_DIR` partem daqui, de onde quer que a API rode. */
const PORTAL_DIR = fileURLToPath(new URL("../../", import.meta.url));

/** Número de pedido: só dígitos, até 10 (mesma regra do campo da tela). */
const ORDER_ID_TEXT = /^\d{1,10}$/;

const port = z.coerce.number().int().min(1).max(65535);

/** "15, 375,562" → [15, 375, 562], na ordem dada e sem repetir. */
const orderIdList = z.string().transform((value, ctx) => {
  const parts = value.split(",").map((part) => part.trim());
  if (!parts.every((part) => ORDER_ID_TEXT.test(part) && Number(part) > 0)) {
    ctx.addIssue({ code: "custom", message: "lista de pedidos inválida" });
    return z.NEVER;
  }
  return [...new Set(parts.map(Number))];
});

/** Endereço http(s) do agente; a barra do fim é removida (`http://x:8001/` → `http://x:8001`). */
const agentUrl = z.url({ protocol: /^https?$/ }).transform((value) => value.replace(/\/+$/, ""));

/** Nome do app no ADK: vai no caminho da URL, então só letras, números, `_` e `-`. */
const agentAppName = z.string().regex(/^[\w-]+$/);

/** Limite por resposta do agente, em milissegundos. */
const agentTimeoutMs = z.coerce.number().int().min(1000).max(600_000);

/**
 * Workspace do Databricks → endereço base da API. Aceita só o host (`dbc-xxx.cloud.databricks.com`,
 * como no painel) ou com `https://`. `http://` só para `localhost`/`127.0.0.1` (testes com
 * servidor falso): o token nunca trafega sem TLS para fora da máquina.
 */
const databricksHost = z.string().transform((value, ctx) => {
  const match = value
    .trim()
    .replace(/\/+$/, "")
    .match(/^(?:(https?):\/\/)?([a-z0-9.-]+(?::\d+)?)$/i);
  const [, scheme = "https", host = ""] = match ?? [];
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host);
  if (!match || (scheme === "http" && !local)) {
    ctx.addIssue({ code: "custom", message: "host do Databricks inválido" });
    return z.NEVER;
  }
  return `${scheme}://${host}`;
});

/** Id do SQL warehouse (o final do HTTP path `/sql/1.0/warehouses/<id>`). */
const databricksWarehouseId = z.string().regex(/^[\w-]+$/);

/** `catalogo.schema` das tabelas consumo_* (vai no SQL: só letras, números e `_`). */
const databricksCatalogSchema = z.string().regex(/^[A-Za-z_]\w*\.[A-Za-z_]\w*$/);

/** Variáveis que nunca aparecem nas mensagens de erro, nem o valor recebido. */
const SECRET_ENV: ReadonlySet<string> = new Set(["DATABRICKS_TOKEN"]);

/** Variáveis de ambiente aceitas, com os padrões que funcionam sem `.env`. */
const envSchema = z
  .object({
    API_PORT: port.default(3333),
    DATA_SOURCE: dataSourceSchema.default("fixtures"),
    DATA_DIR: z.string().default("dados"),
    SAMPLE_ORDER_IDS: orderIdList.prefault("76902,375,34,8"),
    AGENT: agentModeSchema.default("mock"),
    AGENT_URL: agentUrl.optional(),
    AGENT_APP_NAME: agentAppName.default("translog_agent"),
    AGENT_TIMEOUT_MS: agentTimeoutMs.default(90_000),
    DATABRICKS_HOST: databricksHost.optional(),
    DATABRICKS_WAREHOUSE_ID: databricksWarehouseId.optional(),
    DATABRICKS_TOKEN: z.string().optional(),
    DATABRICKS_CATALOG_SCHEMA: databricksCatalogSchema.default("workspace.silver"),
    NODE_ENV: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.DATA_SOURCE !== "databricks") {
      return;
    }
    for (const name of [
      "DATABRICKS_HOST",
      "DATABRICKS_WAREHOUSE_ID",
      "DATABRICKS_TOKEN",
    ] as const) {
      if (env[name] === undefined) {
        ctx.addIssue({
          code: "custom",
          path: [name],
          message: "obrigatória com DATA_SOURCE=databricks",
        });
      }
    }
  })
  .refine((env) => env.AGENT !== "adk" || env.AGENT_URL !== undefined, {
    path: ["AGENT_URL"],
    message: "obrigatória com AGENT=adk",
    // Roda mesmo com outras variáveis inválidas, para a mensagem listar tudo de uma vez.
    when: () => true,
  });

type EnvName = keyof z.input<typeof envSchema>;

const oneOf = (options: readonly string[]) =>
  `deve ser ${options.map((option) => `"${option}"`).join(" ou ")}`;

/** O que cada variável espera, usado na mensagem de erro. */
const expectations: Record<EnvName, string> = {
  API_PORT: "deve ser um número inteiro entre 1 e 65535",
  DATA_SOURCE: oneOf(dataSourceSchema.options),
  DATA_DIR: "deve ser o caminho da pasta com os CSVs das tabelas consumo_*",
  SAMPLE_ORDER_IDS:
    "deve ser uma lista de números de pedido separados por vírgula (inteiros positivos de até 10 dígitos)",
  AGENT: oneOf(agentModeSchema.options),
  AGENT_URL:
    "deve ser o endereço http(s) do agente, obrigatório com AGENT=adk (ex.: http://127.0.0.1:8001)",
  AGENT_APP_NAME: "deve ter só letras, números, _ ou -",
  AGENT_TIMEOUT_MS: "deve ser um número inteiro de milissegundos entre 1000 e 600000",
  DATABRICKS_HOST:
    "deve ser o host do workspace, obrigatório com DATA_SOURCE=databricks (ex.: dbc-xxxxxxxx-xxxx.cloud.databricks.com)",
  DATABRICKS_WAREHOUSE_ID:
    "deve ser o id do SQL warehouse (letras, números, _ ou -), obrigatório com DATA_SOURCE=databricks",
  DATABRICKS_TOKEN: "é obrigatória com DATA_SOURCE=databricks (token de acesso, só no portal/.env)",
  DATABRICKS_CATALOG_SCHEMA: "deve ser catalogo.schema (ex.: workspace.silver)",
  NODE_ENV: "deve ser um texto",
};

const configSchema = envSchema.transform((env) => ({
  apiPort: env.API_PORT,
  dataSource: env.DATA_SOURCE,
  /** Pasta absoluta dos CSVs (`DATA_SOURCE=file`); relativo no ambiente = relativo a `portal/`. */
  dataDir: resolve(PORTAL_DIR, env.DATA_DIR),
  /** Pedidos de exemplo da tela, na ordem configurada. */
  sampleOrderIds: env.SAMPLE_ORDER_IDS,
  /** Assistente do chat. */
  agent: env.AGENT,
  /** Endereço do agente ADK, sem barra no fim; obrigatório com `adk`. */
  agentUrl: env.AGENT_URL,
  agentAppName: env.AGENT_APP_NAME,
  agentTimeoutMs: env.AGENT_TIMEOUT_MS,
  /** Acesso ao Databricks (`DATA_SOURCE=databricks`); o token nunca vai para log nem resposta. */
  databricks:
    env.DATABRICKS_HOST !== undefined &&
    env.DATABRICKS_WAREHOUSE_ID !== undefined &&
    env.DATABRICKS_TOKEN !== undefined
      ? {
          baseUrl: env.DATABRICKS_HOST,
          warehouseId: env.DATABRICKS_WAREHOUSE_ID,
          token: env.DATABRICKS_TOKEN,
          catalogSchema: env.DATABRICKS_CATALOG_SCHEMA,
        }
      : undefined,
  nodeEnv: env.NODE_ENV,
}));

export type Config = z.output<typeof configSchema>;

/**
 * Lê e valida a configuração. Variáveis vazias contam como não definidas
 * (o compose repassa `AGENT_URL=` vazio, por exemplo).
 * Lança um erro que lista cada variável inválida com o valor recebido.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const defined = Object.fromEntries(
    Object.entries(env).filter(([, value]) => value !== undefined && value !== ""),
  );
  const result = configSchema.safeParse(defined);
  if (!result.success) {
    throw new Error(formatError(result.error, defined));
  }
  return result.data;
}

function formatError(error: z.ZodError, env: NodeJS.ProcessEnv): string {
  const names = new Set(error.issues.map((issue) => String(issue.path[0])));
  const lines = [...names].map((name) => {
    const expectation = isEnvName(name) ? expectations[name] : "é inválida";
    const value = env[name];
    const received =
      value === undefined
        ? "não definida"
        : SECRET_ENV.has(name)
          ? "valor oculto"
          : `recebido: ${JSON.stringify(value)}`;
    return `  - ${name} ${expectation} (${received})`;
  });
  return ["Configuração inválida:", ...lines].join("\n");
}

function isEnvName(name: string): name is EnvName {
  return Object.hasOwn(expectations, name);
}
