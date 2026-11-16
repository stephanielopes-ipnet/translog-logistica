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
  nodeEnv: undefined,
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

  it("rejeita DATA_SOURCE desconhecido", () => {
    expect(configError({ DATA_SOURCE: "postgres" })).toBe(
      'Configuração inválida:\n  - DATA_SOURCE deve ser "fixtures" ou "file" (recebido: "postgres")',
    );
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
});
