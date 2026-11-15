import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dataSourceSchema } from "@translog/contracts";
import { z } from "zod";

/** Pasta `portal/`: caminhos relativos em `ORDERS_FILE` partem daqui, de onde quer que a API rode. */
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

/** Assistente do chat. Nesta etapa só existe o simulado; o `adk` entra com o adapter do agente. */
const agentMode = z.enum(["mock"]);

/** Variáveis de ambiente aceitas, com os padrões que funcionam sem `.env`. */
const envSchema = z
  .object({
    API_PORT: port.default(3333),
    DATA_SOURCE: dataSourceSchema.default("fixtures"),
    ORDERS_FILE: z.string().optional(),
    SAMPLE_ORDER_IDS: orderIdList.prefault("15,375,562,1002"),
    AGENT: agentMode.default("mock"),
    NODE_ENV: z.string().optional(),
  })
  .refine((env) => env.DATA_SOURCE !== "file" || env.ORDERS_FILE !== undefined, {
    path: ["ORDERS_FILE"],
    message: "obrigatória com DATA_SOURCE=file",
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
  ORDERS_FILE: "é obrigatória com DATA_SOURCE=file: caminho do CSV da Silver",
  SAMPLE_ORDER_IDS:
    "deve ser uma lista de números de pedido separados por vírgula (inteiros positivos de até 10 dígitos)",
  AGENT: oneOf(agentMode.options),
  NODE_ENV: "deve ser um texto",
};

const configSchema = envSchema.transform((env) => ({
  apiPort: env.API_PORT,
  dataSource: env.DATA_SOURCE,
  /** Caminho absoluto da Silver; relativo no ambiente = relativo à pasta `portal/`. */
  ordersFile: env.ORDERS_FILE === undefined ? undefined : resolve(PORTAL_DIR, env.ORDERS_FILE),
  /** Pedidos de exemplo da tela, na ordem configurada. */
  sampleOrderIds: env.SAMPLE_ORDER_IDS,
  /** Assistente do chat. */
  agent: env.AGENT,
  nodeEnv: env.NODE_ENV,
}));

export type Config = z.output<typeof configSchema>;

/**
 * Lê e valida a configuração. Variáveis vazias contam como não definidas
 * (o compose repassa `ORDERS_FILE=` vazio, por exemplo).
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
    const received = value === undefined ? "não definida" : `recebido: ${JSON.stringify(value)}`;
    return `  - ${name} ${expectation} (${received})`;
  });
  return ["Configuração inválida:", ...lines].join("\n");
}

function isEnvName(name: string): name is EnvName {
  return Object.hasOwn(expectations, name);
}
