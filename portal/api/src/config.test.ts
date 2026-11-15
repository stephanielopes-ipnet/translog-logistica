import { isAbsolute, join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.ts";

const defaults = {
  apiPort: 3333,
  dataSource: "fixtures",
  ordersFile: undefined,
  sampleOrderIds: [15, 375, 562, 1002],
  agent: "mock",
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
      ORDERS_FILE: "",
      SAMPLE_ORDER_IDS: "",
      AGENT: "",
      NODE_ENV: "",
    });

    expect(config).toStrictEqual(defaults);
  });

  it("aceita valores válidos diferentes dos padrões", () => {
    const config = loadConfig({
      API_PORT: "4000",
      DATA_SOURCE: "file",
      ORDERS_FILE: "/data/silver_pedidos_rastreio.csv",
      SAMPLE_ORDER_IDS: "1002,15",
      AGENT: "mock",
      NODE_ENV: "production",
    });

    expect(config).toStrictEqual({
      apiPort: 4000,
      dataSource: "file",
      ordersFile: "/data/silver_pedidos_rastreio.csv",
      sampleOrderIds: [1002, 15],
      agent: "mock",
      nodeEnv: "production",
    });
  });

  it("resolve ORDERS_FILE relativo a partir da pasta portal/", () => {
    const { ordersFile } = loadConfig({ ORDERS_FILE: "dados/silver.csv" });

    expect(ordersFile && isAbsolute(ordersFile)).toBe(true);
    expect(ordersFile).toBe(join(import.meta.dirname, "..", "..", "dados", "silver.csv"));
  });

  it("lê SAMPLE_ORDER_IDS com espaços, na ordem dada e sem repetir", () => {
    expect(loadConfig({ SAMPLE_ORDER_IDS: " 562 , 15,562, 9999999999 " }).sampleOrderIds).toEqual([
      562, 15, 9999999999,
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
      'Configuração inválida:\n  - AGENT deve ser "mock" (recebido: "gpt")',
    );
  });

  it("exige ORDERS_FILE com DATA_SOURCE=file", () => {
    expect(configError({ DATA_SOURCE: "file" })).toBe(
      "Configuração inválida:\n  - ORDERS_FILE é obrigatória com DATA_SOURCE=file: " +
        "caminho do CSV da Silver (não definida)",
    );
  });

  it("aceita ORDERS_FILE definida com DATA_SOURCE=fixtures (fica sem uso)", () => {
    expect(loadConfig({ ORDERS_FILE: "/data/x.csv" }).dataSource).toBe("fixtures");
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

  it("aponta ORDERS_FILE ausente mesmo quando outra variável também é inválida", () => {
    const lines = configError({ DATA_SOURCE: "file", API_PORT: "abc" }).split("\n");

    expect(lines.slice(1).map((line) => line.trim().split(" ")[1])).toEqual([
      "API_PORT",
      "ORDERS_FILE",
    ]);
  });
});
