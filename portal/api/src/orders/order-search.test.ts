import { readFileSync } from "node:fs";
import {
  type StaffSearchQuery,
  staffSearchQuerySchema,
  staffSearchRowSchema,
} from "@translog/contracts";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { FIXTURES_FILE } from "./fixtures-repository.ts";
import { orderRecordSchema } from "./order-record.ts";
import { searchOrders } from "./order-search.ts";

const fixtures = z.array(orderRecordSchema).parse(JSON.parse(readFileSync(FIXTURES_FILE, "utf8")));

/** Consulta como a rota recebe (query string → padrões do contrato). */
function query(params: Record<string, string> = {}): StaffSearchQuery {
  return staffSearchQuerySchema.parse(params);
}

const ids = (params: Record<string, string> = {}) =>
  searchOrders(fixtures, query(params)).results.map((row) => row.orderId);

describe("searchOrders", () => {
  it("sem filtro: todos, maior atraso de entrega primeiro, sem atraso calculado no fim", () => {
    const response = searchOrders(fixtures, query());

    expect(response).toMatchObject({ total: 9, page: 1, pageSize: 20 });
    // 76385 (6 dias), 76902 (5), 375 (4), 222 (1), 8 e 31298 (0); depois os sem atraso, por número.
    expect(response.results.map((row) => row.orderId)).toEqual([
      76385, 76902, 375, 222, 8, 31298, 9, 34, 50,
    ]);
  });

  it("só dígitos: número do pedido que começa com eles", () => {
    expect(ids({ q: "7" })).toEqual([76385, 76902]);
    expect(ids({ q: "375" })).toEqual([375]);
    expect(ids({ q: "99999" })).toEqual([]);
  });

  it("texto: destino, origem, região ou rota, sem acentos nem maiúsculas", () => {
    expect(ids({ q: "jacarta" })).toEqual([76902]);
    expect(ids({ q: "MEXICO" })).toContain(375); // Saltillo, Coahuila, México
    expect(ids({ q: "sudeste asiatico" })).toEqual([76902]);
  });

  it("filtros de situação, modalidade, mercado e etapa se somam", () => {
    expect(ids({ status: "Em trânsito" })).toEqual([76385, 76902]);
    expect(ids({ shippingMode: "First Class", market: "LATAM" })).toEqual([222, 34]);
    expect(ids({ stage: "3" })).toEqual([76902, 34]);
    expect(ids({ status: "Extraviado", shippingMode: "Standard Class" })).toEqual([]);
  });

  it("causa nos termos da base (despacho ou entrega), sem diferença de acentos", () => {
    expect(ids({ cause: "Promessa irreal" })).toEqual([76902, 222, 34]);
    expect(ids({ cause: "volume sem atualizacao de rastreio" })).toEqual([76385, 76902]);
  });

  it("atraso mínimo de entrega e encaminhamento à central", () => {
    expect(ids({ minDelayDays: "4" })).toEqual([76385, 76902, 375]);
    expect(ids({ escalated: "true" })).toEqual([76385, 76902, 375, 34]);
    expect(ids({ escalated: "false" })).not.toContain(34);
  });

  it("ordena por número ou pela data do pedido (mais recentes primeiro)", () => {
    expect(ids({ sort: "orderId" })).toEqual([8, 9, 34, 50, 222, 375, 31298, 76385, 76902]);
    expect(ids({ sort: "orderDate" })[0]).toBe(76902); // 27/01/2018
  });

  it("pagina sem perder nem repetir linhas", () => {
    const first = searchOrders(fixtures, query({ sort: "orderId", pageSize: "4" }));
    const second = searchOrders(fixtures, query({ sort: "orderId", pageSize: "4", page: "2" }));
    const third = searchOrders(fixtures, query({ sort: "orderId", pageSize: "4", page: "3" }));

    expect(first.total).toBe(9);
    expect(
      [...first.results, ...second.results, ...third.results].map((row) => row.orderId),
    ).toEqual([8, 9, 34, 50, 222, 375, 31298, 76385, 76902]);
    expect(searchOrders(fixtures, query({ page: "9" })).results).toEqual([]);
  });

  it("linha resumida: só os campos do contrato, com a causa da base", () => {
    const [row] = searchOrders(fixtures, query({ q: "76902" })).results;

    expect(staffSearchRowSchema.strict().parse(row)).toStrictEqual({
      orderId: 76902,
      orderDate: "2018-01-27",
      status: "Em trânsito",
      shippingMode: "First Class",
      market: "Pacific Asia",
      routeService: "Ásia-Pacífico - Sudeste Asiático - First Class",
      origin: "San Jose, Califórnia, Estados Unidos",
      destination: "Jacarta, Jacarta, Indonésia",
      stage: { number: 3, label: "Alfândega" },
      location: "Alfândega Jacarta (Indonésia)",
      dispatchDelayDays: 1,
      deliveryDelayDays: 5,
      escalateToSupport: true,
      probableCause: "Volume sem atualização de rastreio",
    });
  });
});

describe("staffSearchQuerySchema", () => {
  it.each([
    [{ pageSize: "51" }, "pageSize"],
    [{ page: "0" }, "page"],
    [{ stage: "6" }, "stage"],
    [{ q: "x".repeat(101) }, "q"],
    [{ status: "Entregue" }, "status"],
    [{ escalated: "sim" }, "escalated"],
    [{ sort: "lucro" }, "sort"],
  ])("recusa %j", (params, field) => {
    const result = staffSearchQuerySchema.safeParse(params);

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join("."))).toContain(field);
  });
});
