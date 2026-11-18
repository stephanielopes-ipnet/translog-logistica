import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { goldScenarioStatement } from "./consumo-sql.ts";
import { createFixturesRepository } from "./fixtures-repository.ts";
import {
  FIXTURE_SCENARIO_FILE,
  loadFixtureScenario,
  parseScenarioCsv,
  scenarioFromJson,
  scenarioToJson,
} from "./promise-scenario.ts";

const HEADER = "cenario,classe_servico,prazo_despacho_dias,criterio,ativo,dt_atualizacao";
const csv = (...rows: string[]) => [HEADER, ...rows].join("\n");

const GOLD = {
  "First Class": 2,
  "Same Day": 1,
  "Second Class": 4,
  "Standard Class": 4,
};

describe("parseScenarioCsv", () => {
  it("lê as linhas ativas da Promessa ajustada e ignora inativas e outros cenários", () => {
    const scenario = parseScenarioCsv(
      csv(
        "Promessa ajustada,First Class,2,Despacho real é sempre 2 dias,true,2026-11-17",
        "Promessa ajustada,Second Class,4,x,true,2026-11-17",
        "Promessa ajustada,Same Day,9,antigo,false,2026-11-01",
        "Promessa atual,Same Day,0,atual,true,2026-11-17",
      ),
    );

    expect(Object.fromEntries(scenario)).toStrictEqual({ "First Class": 2, "Second Class": 4 });
  });

  it.each([
    ["Promessa ajustada,Express,2,x,true,d", /modalidade desconhecida: "Express"/],
    ["Promessa ajustada,First Class,-1,x,true,d", /prazo inválido para First Class/],
    ["Promessa ajustada,First Class,1.5,x,true,d", /prazo inválido/],
    ["Promessa ajustada,First Class,,x,true,d", /prazo inválido/],
    ["Promessa ajustada,First Class,2,x,false,d", /nenhuma linha ativa/],
  ])("recusa %j", (row, error) => {
    expect(() => parseScenarioCsv(csv(row))).toThrow(error);
  });

  it("recusa modalidade repetida no cenário ativo", () => {
    expect(() =>
      parseScenarioCsv(
        csv("Promessa ajustada,First Class,2,x,true,d", "Promessa ajustada,First Class,3,x,true,d"),
      ),
    ).toThrow(/First Class aparece mais de uma vez/);
  });

  it("recusa CSV sem as colunas necessárias", () => {
    expect(() => parseScenarioCsv("cenario,classe\nPromessa ajustada,First Class")).toThrow(
      /faltam as colunas classe_servico, prazo_despacho_dias, ativo/,
    );
  });

  it("aceita o formato do Databricks (BOM e TRUE em maiúsculas)", () => {
    expect(
      parseScenarioCsv(`﻿${csv("Promessa ajustada,Same Day,1,x,TRUE,d")}`).get("Same Day"),
    ).toBe(1);
  });
});

describe("cenário nos fixtures", () => {
  it("o JSON gerado tem a fonte, a data de geração e os 4 prazos da Gold", async () => {
    const content = JSON.parse(readFileSync(FIXTURE_SCENARIO_FILE, "utf8"));

    expect(content.source).toContain("workspace.gold.param_cenario_prazo");
    expect(content.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(Object.fromEntries(await loadFixtureScenario())).toStrictEqual(GOLD);
  });

  it("o adapter fixtures entrega o cenário", async () => {
    expect(Object.fromEntries((await createFixturesRepository()).scenario())).toStrictEqual(GOLD);
  });

  it("JSON ida e volta", () => {
    const scenario = scenarioFromJson(GOLD);

    expect(scenarioToJson(scenario)).toStrictEqual(GOLD);
    expect(() => scenarioFromJson({ Express: 1 })).toThrow();
  });
});

describe("goldScenarioStatement", () => {
  it("colunas explícitas, só as linhas ativas da Promessa ajustada", () => {
    expect(goldScenarioStatement("workspace.gold")).toBe(
      "SELECT coalesce(CAST(cenario AS STRING), '') AS cenario, " +
        "coalesce(CAST(classe_servico AS STRING), '') AS classe_servico, " +
        "coalesce(CAST(prazo_despacho_dias AS STRING), '') AS prazo_despacho_dias, " +
        "coalesce(CAST(criterio AS STRING), '') AS criterio, " +
        "coalesce(CAST(ativo AS STRING), '') AS ativo, " +
        "coalesce(CAST(dt_atualizacao AS STRING), '') AS dt_atualizacao " +
        "FROM workspace.gold.param_cenario_prazo " +
        "WHERE ativo = true AND cenario = 'Promessa ajustada' ORDER BY classe_servico",
    );
  });

  it.each(["gold", "workspace.gold; DROP TABLE x", "a.b.c"])("recusa o schema %j", (schema) => {
    expect(() => goldScenarioStatement(schema)).toThrow(/Schema inválido/);
  });
});
