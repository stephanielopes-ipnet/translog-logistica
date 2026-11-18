import { isAbsolute, join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.ts";

const defaults = {
  apiPort: 3333,
  dataSource: "fixtures",
  dataDir: join(import.meta.dirname, "..", "..", "dados"),
  sampleOrderIds: [76902, 375, 34, 8],
  agent: "mock",
  agentUrl: undefined,
  agentAppName: "translog_agent",
  agentTimeoutMs: 90000,
  databricks: undefined,
  auth: { users: new Map(), sessionSecret: undefined, demo: false },
  dashboardUrl: null,
  nodeEnv: undefined,
};

const DATABRICKS_ENV = {
  DATA_SOURCE: "databricks",
  DATABRICKS_HOST: "dbc-0000-test.cloud.databricks.com",
  DATABRICKS_WAREHOUSE_ID: "abc123",
  DATABRICKS_TOKEN: "dapi-segredo-de-teste",
};

/** Mensagem do erro lançado por `loadConfig`, ou "" se não lançar. */
function configError(env: NodeJS.ProcessEnv): string {
  try {
    loadConfig(env);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return "";
}

describe("loadConfig", () => {
  it("usa os padrões quando nenhuma variável está definida", () => {
    expect(loadConfig({})).toStrictEqual(defaults);
  });

  it("trata strings vazias como variáveis não definidas", () => {
    const config = loadConfig({
      API_PORT: "",
      DATA_SOURCE: "",
      DATA_DIR: "",
      SAMPLE_ORDER_IDS: "",
      AGENT: "",
      AGENT_URL: "",
      AGENT_APP_NAME: "",
      AGENT_TIMEOUT_MS: "",
      DATABRICKS_HOST: "",
      DATABRICKS_WAREHOUSE_ID: "",
      DATABRICKS_TOKEN: "",
      DATABRICKS_CATALOG_SCHEMA: "",
      NODE_ENV: "",
    });

    expect(config).toStrictEqual(defaults);
  });

  it("aceita valores válidos diferentes dos padrões", () => {
    const config = loadConfig({
      API_PORT: "4000",
      DATA_SOURCE: "file",
      DATA_DIR: "/data",
      SAMPLE_ORDER_IDS: "34,375",
      AGENT: "adk",
      AGENT_URL: "http://agent:8001",
      AGENT_APP_NAME: "outro_agente",
      AGENT_TIMEOUT_MS: "60000",
      NODE_ENV: "production",
    });

    expect(config).toStrictEqual({
      apiPort: 4000,
      dataSource: "file",
      dataDir: "/data",
      sampleOrderIds: [34, 375],
      agent: "adk",
      agentUrl: "http://agent:8001",
      agentAppName: "outro_agente",
      agentTimeoutMs: 60000,
      databricks: undefined,
      auth: { users: new Map(), sessionSecret: undefined, demo: false },
      dashboardUrl: null,
      nodeEnv: "production",
    });
  });

  it("resolve DATA_DIR relativo a partir da pasta portal/", () => {
    const { dataDir } = loadConfig({ DATA_DIR: "dados/copia" });

    expect(isAbsolute(dataDir)).toBe(true);
    expect(dataDir).toBe(join(import.meta.dirname, "..", "..", "dados", "copia"));
  });

  it("lê SAMPLE_ORDER_IDS com espaços, na ordem dada e sem repetir", () => {
    expect(loadConfig({ SAMPLE_ORDER_IDS: " 34 , 8,34, 9999999999 " }).sampleOrderIds).toEqual([
      34, 8, 9999999999,
    ]);
  });

  it.each(["15,abc", "15,,375", "0", "-1", "1.5", "12345678901"])(
    "rejeita SAMPLE_ORDER_IDS=%s",
    (value) => {
      expect(configError({ SAMPLE_ORDER_IDS: value })).toBe(
        "Configuração inválida:\n  - SAMPLE_ORDER_IDS deve ser uma lista de números de pedido " +
          "separados por vírgula (inteiros positivos de até 10 dígitos) " +
          `(recebido: ${JSON.stringify(value)})`,
      );
    },
  );

  it("rejeita porta não numérica citando a variável e o valor recebido", () => {
    expect(configError({ API_PORT: "abc" })).toBe(
      'Configuração inválida:\n  - API_PORT deve ser um número inteiro entre 1 e 65535 (recebido: "abc")',
    );
  });

  it("rejeita porta fora do intervalo", () => {
    expect(configError({ API_PORT: "70000" })).toMatch(/API_PORT .* \(recebido: "70000"\)/);
  });

  it("rejeita AGENT desconhecido", () => {
    expect(configError({ AGENT: "gpt" })).toBe(
      'Configuração inválida:\n  - AGENT deve ser "mock" ou "adk" (recebido: "gpt")',
    );
  });

  it("exige AGENT_URL com AGENT=adk", () => {
    expect(configError({ AGENT: "adk" })).toBe(
      "Configuração inválida:\n  - AGENT_URL deve ser o endereço http(s) do agente, obrigatório " +
        "com AGENT=adk (ex.: http://127.0.0.1:8001) (não definida)",
    );
  });

  it("remove a barra do fim de AGENT_URL", () => {
    expect(loadConfig({ AGENT: "adk", AGENT_URL: "http://127.0.0.1:8001/" }).agentUrl).toBe(
      "http://127.0.0.1:8001",
    );
  });

  it.each(["127.0.0.1:8001", "ftp://agente", "agente"])("rejeita AGENT_URL=%s", (value) => {
    expect(configError({ AGENT: "adk", AGENT_URL: value })).toMatch(
      new RegExp(`AGENT_URL .* \\(recebido: "${value}"\\)$`),
    );
  });

  it.each(["0", "999", "600001", "1.5", "abc"])("rejeita AGENT_TIMEOUT_MS=%s", (value) => {
    expect(configError({ AGENT_TIMEOUT_MS: value })).toBe(
      "Configuração inválida:\n  - AGENT_TIMEOUT_MS deve ser um número inteiro de milissegundos " +
        `entre 1000 e 600000 (recebido: "${value}")`,
    );
  });

  it("rejeita AGENT_APP_NAME com caracteres de caminho", () => {
    expect(configError({ AGENT_APP_NAME: "../admin" })).toMatch(
      /^Configuração inválida:\n {2}- AGENT_APP_NAME /,
    );
  });

  it("aceita AGENT_URL definida com AGENT=mock (fica sem uso)", () => {
    expect(loadConfig({ AGENT_URL: "http://127.0.0.1:8001" }).agent).toBe("mock");
  });

  it("com DATA_SOURCE=file, usa a pasta dados/ por padrão", () => {
    expect(loadConfig({ DATA_SOURCE: "file" }).dataDir).toBe(defaults.dataDir);
  });

  it("ignora ORDERS_FILE, que saiu com as tabelas consumo_* (16/11)", () => {
    expect(loadConfig({ DATA_SOURCE: "file", ORDERS_FILE: "/data/x.csv" })).not.toHaveProperty(
      "ordersFile",
    );
  });

  it("lista todas as variáveis inválidas, cada uma uma única vez", () => {
    const lines = configError({ API_PORT: "0.5", SAMPLE_ORDER_IDS: "x", DATA_SOURCE: "xyz" }).split(
      "\n",
    );

    expect(lines[0]).toBe("Configuração inválida:");
    expect(lines.slice(1).map((line) => line.trim().split(" ")[1])).toEqual([
      "API_PORT",
      "DATA_SOURCE",
      "SAMPLE_ORDER_IDS",
    ]);
  });

  it("aponta AGENT_URL ausente mesmo quando outra variável também é inválida", () => {
    const lines = configError({ AGENT: "adk", API_PORT: "abc" }).split("\n");

    expect(lines.slice(1).map((line) => line.trim().split(" ")[1])).toEqual([
      "API_PORT",
      "AGENT_URL",
    ]);
  });

  it("com DATA_SOURCE=databricks, monta o acesso com https e o schema padrão", () => {
    expect(loadConfig(DATABRICKS_ENV)).toMatchObject({
      dataSource: "databricks",
      databricks: {
        baseUrl: "https://dbc-0000-test.cloud.databricks.com",
        warehouseId: "abc123",
        token: "dapi-segredo-de-teste",
        catalogSchema: "workspace.silver",
        cacheFile: join(defaults.dataDir, "cache-databricks.json.gz"),
        refreshIntervalMs: 600_000,
      },
    });
  });

  it("cache do databricks dentro de DATA_DIR e conferência a cada DATABRICKS_REFRESH_MINUTES", () => {
    const config = loadConfig({
      ...DATABRICKS_ENV,
      DATA_DIR: "/tmp/dados-teste",
      DATABRICKS_REFRESH_MINUTES: "0",
    });

    expect(config.databricks).toMatchObject({
      cacheFile: "/tmp/dados-teste/cache-databricks.json.gz",
      refreshIntervalMs: 0,
    });
  });

  it.each(["-1", "1441", "2.5", "dez"])("rejeita DATABRICKS_REFRESH_MINUTES=%s", (minutes) => {
    expect(configError({ ...DATABRICKS_ENV, DATABRICKS_REFRESH_MINUTES: minutes })).toMatch(
      /DATABRICKS_REFRESH_MINUTES deve ser um número inteiro de minutos entre 0 \(só ao subir\) e 1440/,
    );
  });

  it.each([
    ["https://dbc-0000-test.cloud.databricks.com/", "https://dbc-0000-test.cloud.databricks.com"],
    ["http://127.0.0.1:9999", "http://127.0.0.1:9999"],
    ["http://localhost:9999", "http://localhost:9999"],
  ])("aceita DATABRICKS_HOST=%s", (host, baseUrl) => {
    expect(loadConfig({ ...DATABRICKS_ENV, DATABRICKS_HOST: host }).databricks?.baseUrl).toBe(
      baseUrl,
    );
  });

  it.each(["http://dbc-0000-test.cloud.databricks.com", "ftp://x", "dbc/caminho", "a b"])(
    "rejeita DATABRICKS_HOST=%s (http só para a própria máquina)",
    (host) => {
      expect(configError({ ...DATABRICKS_ENV, DATABRICKS_HOST: host })).toMatch(
        /^Configuração inválida:\n {2}- DATABRICKS_HOST deve ser o host do workspace/,
      );
    },
  );

  it("exige host, warehouse e token com DATA_SOURCE=databricks, listando os três", () => {
    const lines = configError({ DATA_SOURCE: "databricks" }).split("\n");

    expect(lines.slice(1).map((line) => line.trim().split(" ")[1])).toEqual([
      "DATABRICKS_HOST",
      "DATABRICKS_WAREHOUSE_ID",
      "DATABRICKS_TOKEN",
    ]);
  });

  it("nunca mostra o valor do token na mensagem de erro", () => {
    const message = configError({
      ...DATABRICKS_ENV,
      API_PORT: "abc",
      DATABRICKS_WAREHOUSE_ID: "../x",
    });

    expect(message).toContain("DATABRICKS_WAREHOUSE_ID");
    expect(message).not.toContain("dapi-segredo-de-teste");
  });

  it.each(["workspace", "workspace.silver; DROP", "a.b.c"])(
    "rejeita DATABRICKS_CATALOG_SCHEMA=%s",
    (schema) => {
      expect(configError({ ...DATABRICKS_ENV, DATABRICKS_CATALOG_SCHEMA: schema })).toMatch(
        /DATABRICKS_CATALOG_SCHEMA deve ser catalogo\.schema/,
      );
    },
  );

  it("credenciais do Databricks sem DATA_SOURCE=databricks ficam sem uso no adapter", () => {
    const { DATA_SOURCE: _source, ...credentials } = DATABRICKS_ENV;

    expect(loadConfig(credentials).dataSource).toBe("fixtures");
  });

  it("rejeita DATA_SOURCE desconhecido listando as três fontes", () => {
    expect(configError({ DATA_SOURCE: "postgres" })).toBe(
      'Configuração inválida:\n  - DATA_SOURCE deve ser "fixtures" ou "file" ou "databricks" (recebido: "postgres")',
    );
  });

  describe("login do colaborador", () => {
    const HASH = `scrypt.${"a".repeat(22)}.${"b".repeat(43)}`;
    const SECRET = "s".repeat(32);

    it("lê STAFF_USERS (e-mail em minúsculas), SESSION_SECRET, AUTH_DEMO e DASHBOARD_URL", () => {
      const config = loadConfig({
        STAFF_USERS: ` Ana@TransLog.com:${HASH} , bia@translog.com:${HASH}`,
        SESSION_SECRET: SECRET,
        AUTH_DEMO: "true",
        DASHBOARD_URL: "https://exemplo.cloud.databricks.com/dashboards/1",
      });

      expect([...config.auth.users.keys()]).toEqual(["ana@translog.com", "bia@translog.com"]);
      expect(config.auth.demo).toBe(true);
      expect(config.auth.sessionSecret).toBe(SECRET);
      expect(config.dashboardUrl).toBe("https://exemplo.cloud.databricks.com/dashboards/1");
    });

    it("exige SESSION_SECRET com usuários ou demonstração, sem mostrar o valor", () => {
      expect(configError({ AUTH_DEMO: "true" })).toContain("SESSION_SECRET");
      expect(configError({ STAFF_USERS: `a@b.com:${HASH}` })).toContain("SESSION_SECRET");
      const short = configError({ AUTH_DEMO: "true", SESSION_SECRET: "curto-demais" });
      expect(short).toContain("SESSION_SECRET");
      expect(short).toContain("valor oculto");
      expect(short).not.toContain("curto-demais");
    });

    it("recusa STAFF_USERS fora do formato, sem mostrar o valor", () => {
      const message = configError({
        STAFF_USERS: "ana@translog.com:senha123",
        SESSION_SECRET: SECRET,
      });
      expect(message).toContain("STAFF_USERS");
      expect(message).not.toContain("senha123");
    });
  });
});
