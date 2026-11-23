import { staffSearchQuerySchema, staffSearchRowSchema } from "@translog/contracts";
import { describe, expect, it } from "vitest";
import { createFixturesRepository } from "./fixtures-repository.ts";
import { normalize } from "./order-search.ts";

// Busca do colaborador sobre os 9 pedidos da demo (fixtures), pela porta `OrderRepository`.

const repository = await createFixturesRepository();

/** Busca com os parâmetros como chegam na URL (texto), passando pelo contrato. */
function search(params: Record<string, string> = {}) {
  return repository.search(staffSearchQuerySchema.parse(params));
}

const ids = (params: Record<string, string> = {}) =>
  search(params).results.map((row) => row.orderId);

describe("search: número do pedido", () => {
  it("só dígitos: prefixo do número", () => {
    expect(ids({ q: "7" })).toEqual([76385, 76902]);
    expect(ids({ q: "769" })).toEqual([76902]);
    expect(ids({ q: "3" })).toEqual([34, 375, 31298]);
  });

  it("número completo acha só esse pedido (lista com uma linha)", () => {
    const response = search({ q: "76902" });

    expect(response.total).toBe(1);
    expect(response.results.map((row) => row.orderId)).toEqual([76902]);
  });

  it("número inexistente: lista vazia, sem erro", () => {
    expect(search({ q: "99999" })).toStrictEqual({ total: 0, page: 1, pageSize: 20, results: [] });
  });
});

describe("search: texto (cidade, estado ou país de origem ou destino)", () => {
  it("sem diferenciar acentos nem maiúsculas", () => {
    expect(ids({ q: "sao paulo" })).toEqual([8, 9]);
    expect(ids({ q: "SÃO PAULO" })).toEqual([8, 9]);
    expect(ids({ q: "mexico" })).toEqual([222, 375]); // Toluca (Estado do México) e Saltillo (México)
    expect(ids({ q: "medellin" })).toEqual([50]);
  });

  it("vale para a origem também", () => {
    expect(ids({ q: "porto rico" })).toEqual([8, 222]);
    expect(ids({ q: "califórnia" })).toEqual([34, 31298, 76902]);
  });

  it("não busca na rota, na região nem no local atual", () => {
    expect(ids({ q: "sudeste asiatico" })).toEqual([]); // região do 76902
    expect(ids({ q: "alfandega" })).toEqual([]); // local atual do 76902
  });
});

describe("search: filtros", () => {
  it("situação (uma ou várias, separadas por vírgula)", () => {
    expect(ids({ status: "Extraviado" })).toEqual([34]);
    expect(ids({ status: "Em trânsito,Cancelado" })).toEqual([50, 76385, 76902]);
  });

  it("modalidade e mercado", () => {
    expect(ids({ shippingMode: "First Class" })).toEqual([34, 222, 76902]);
    expect(ids({ shippingMode: "Second Class,Same Day" })).toEqual([375, 31298]);
    expect(ids({ market: "Pacific Asia,USCA" })).toEqual([31298, 76385, 76902]);
  });

  it("etapa atual (1 a 5); pedido sem etapa fica de fora", () => {
    expect(ids({ stage: "3" })).toEqual([34, 76902]);
    expect(ids({ stage: "2,3" })).toEqual([34, 76385, 76902]);
  });

  it("causa nos termos da base, no despacho ou na entrega, sem diferenciar acentos", () => {
    expect(ids({ cause: "Promessa irreal" })).toEqual([34, 222, 76902]);
    expect(ids({ cause: "volume sem atualizacao de rastreio" })).toEqual([76385, 76902]);
    expect(ids({ cause: "Atraso no despacho não recuperado no transporte" })).toEqual([222, 375]);
  });

  it("atraso mínimo de entrega (ordena pelo atraso por padrão)", () => {
    expect(ids({ minDelayDays: "1" })).toEqual([76385, 76902, 375, 222]);
    expect(ids({ minDelayDays: "5" })).toEqual([76385, 76902]);
  });

  it("encaminhados à central; escalated=false não filtra", () => {
    expect(ids({ escalated: "true" })).toEqual([34, 375, 76385, 76902]);
    expect(search({ escalated: "false" }).total).toBe(9);
  });

  it("combinações: E entre filtros, OU dentro de cada lista", () => {
    expect(ids({ stage: "3", shippingMode: "First Class" })).toEqual([34, 76902]);
    expect(ids({ q: "mexico", cause: "Promessa irreal" })).toEqual([222]);
    expect(ids({ status: "Em trânsito,Extraviado", escalated: "true", market: "LATAM" })).toEqual([
      34,
    ]);
    expect(ids({ q: "7", minDelayDays: "6" })).toEqual([76385]);
    expect(ids({ status: "Cancelado", escalated: "true" })).toEqual([]);
  });
});

describe("search: ordenação", () => {
  it("sem filtros: número crescente", () => {
    expect(ids()).toEqual([8, 9, 34, 50, 222, 375, 31298, 76385, 76902]);
  });

  it("delay: maior atraso de entrega primeiro, sem atraso calculado no fim, empate pelo número", () => {
    expect(ids({ sort: "delay" })).toEqual([76385, 76902, 375, 222, 8, 31298, 9, 34, 50]);
  });

  it("date: mais recentes primeiro, empate pelo número", () => {
    expect(ids({ sort: "date" })).toEqual([76902, 76385, 31298, 375, 222, 8, 9, 34, 50]);
  });

  it("order com filtro de atraso: o sort pedido vale", () => {
    expect(ids({ minDelayDays: "1", sort: "order" })).toEqual([222, 375, 76385, 76902]);
  });
});

describe("search: paginação", () => {
  it("total de todos os que casam; última página parcial; além do fim, lista vazia", () => {
    const first = search({ pageSize: "4" });
    const second = search({ pageSize: "4", page: "2" });
    const last = search({ pageSize: "4", page: "3" });
    const beyond = search({ pageSize: "4", page: "4" });

    expect([first.total, second.total, last.total, beyond.total]).toEqual([9, 9, 9, 9]);
    expect(first.results.map((row) => row.orderId)).toEqual([8, 9, 34, 50]);
    expect(second.results.map((row) => row.orderId)).toEqual([222, 375, 31298, 76385]);
    expect(last.results.map((row) => row.orderId)).toEqual([76902]);
    expect(beyond).toMatchObject({ total: 9, page: 4, pageSize: 4, results: [] });
  });
});

describe("search: linha do resultado", () => {
  it("só os campos do contrato, com a causa da base (entrega; senão, despacho)", () => {
    const [transit] = search({ q: "76902" }).results;
    const [lost] = search({ q: "34", status: "Extraviado" }).results;

    expect(staffSearchRowSchema.strict().parse(transit)).toStrictEqual({
      orderId: 76902,
      orderDate: "2018-01-27",
      status: "Em trânsito",
      shippingMode: "First Class",
      origin: "San Jose, Califórnia, Estados Unidos",
      destination: "Jacarta, Jacarta, Indonésia",
      stage: { number: 3, label: "Alfândega" },
      location: "Alfândega Jacarta (Indonésia)",
      delayDays: 5,
      escalateToSupport: true,
      probableCause: "Volume sem atualização de rastreio",
    });
    expect(lost).toMatchObject({ delayDays: null, probableCause: "Promessa irreal" });
  });

  it("nunca traz resumo para a IA, linha do tempo nem diagnóstico", () => {
    const keys = search({ pageSize: "50" }).results.flatMap((row) => Object.keys(row));

    for (const forbidden of ["aiSummary", "rawTimeline", "explanation", "market", "items"]) {
      expect(keys).not.toContain(forbidden);
    }
  });
});

describe("staffSearchQuerySchema", () => {
  it("padrões: página 1, 20 por página, sem ordenação fixa", () => {
    expect(staffSearchQuerySchema.parse({})).toStrictEqual({ page: 1, pageSize: 20 });
  });

  it("listas por vírgula, sem repetidos e sem espaços", () => {
    expect(
      staffSearchQuerySchema.parse({ status: "Extraviado, Cancelado,Extraviado", stage: "1,5" }),
    ).toMatchObject({ status: ["Extraviado", "Cancelado"], stage: [1, 5] });
  });

  it.each([
    [{ pageSize: "1000" }, "pageSize"],
    [{ pageSize: "0" }, "pageSize"],
    [{ page: "0" }, "page"],
    [{ minDelayDays: "0" }, "minDelayDays"],
    [{ minDelayDays: "1.5" }, "minDelayDays"],
    [{ stage: "0" }, "stage"],
    [{ stage: "6" }, "stage"],
    [{ status: "Inexistente" }, "status"],
    [{ status: "Extraviado,Inexistente" }, "status"],
    [{ status: "," }, "status"],
    [{ shippingMode: "Express" }, "shippingMode"],
    [{ market: "Brasil" }, "market"],
    [{ q: "x".repeat(61) }, "q"],
    [{ escalated: "sim" }, "escalated"],
    [{ sort: "orderId" }, "sort"],
  ])("recusa %j", (params, field) => {
    const result = staffSearchQuerySchema.safeParse(params);

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path[0])).toContain(field);
  });

  it("q é aparado antes de medir", () => {
    expect(staffSearchQuerySchema.parse({ q: `  ${"7".repeat(10)}  ` }).q).toBe("7777777777");
  });
});

describe("normalize", () => {
  it("minúsculas e sem acentos", () => {
    expect(normalize("São Paulo, MÉXICO, Medellín, Colômbia")).toBe(
      "sao paulo, mexico, medellin, colombia",
    );
  });
});
