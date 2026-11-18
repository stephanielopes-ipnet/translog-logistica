import { staffSearchQuerySchema } from "@translog/contracts";
import { describe, expect, it } from "vitest";
import {
  activeFilterChips,
  DEFAULT_FILTERS,
  hasActiveFilters,
  minDelayLabel,
  pageCount,
  readFilters,
  type SearchFilters,
  searchApiPath,
  updateFilters,
  writeFilters,
} from "./search-filters.ts";

const FULL: SearchFilters = {
  q: "769",
  status: ["Em trânsito", "Extraviado"],
  shippingMode: ["First Class"],
  market: ["Pacific Asia"],
  stage: [3, 5],
  cause: "Promessa irreal",
  minDelayDays: 3,
  escalated: true,
  sort: "delay",
  page: 2,
};

describe("filtros na URL", () => {
  it("sem filtros, a URL fica limpa e a leitura devolve os padrões", () => {
    expect(writeFilters(DEFAULT_FILTERS)).toBe("");
    expect(readFilters("")).toEqual(DEFAULT_FILTERS);
  });

  it("vai e volta sem perder nada", () => {
    const search = writeFilters(FULL);
    expect(search).toBe(
      "?q=769&status=Em+tr%C3%A2nsito%2CExtraviado&shippingMode=First+Class&market=Pacific+Asia" +
        "&stage=3%2C5&cause=Promessa+irreal&minDelayDays=3&escalated=true&sort=delay&page=2",
    );
    expect(readFilters(search)).toEqual(FULL);
  });

  it("lê o exemplo do enunciado", () => {
    expect(readFilters("?q=769&status=Extraviado&minDelayDays=3&sort=delay&page=2")).toEqual({
      ...DEFAULT_FILTERS,
      q: "769",
      status: ["Extraviado"],
      minDelayDays: 3,
      sort: "delay",
      page: 2,
    });
  });

  it("ignora valores inválidos e mantém os válidos", () => {
    expect(
      readFilters(
        "?status=Extraviado,Perdido&shippingMode=Foguete&market=USCA,Marte&stage=0,3,9,x" +
          "&minDelayDays=0&escalated=sim&sort=preco&page=-1",
      ),
    ).toEqual({ ...DEFAULT_FILTERS, status: ["Extraviado"], market: ["USCA"], stage: [3] });
    expect(readFilters(`?minDelayDays=999&page=99999&q=${"a".repeat(61)}`)).toEqual(
      DEFAULT_FILTERS,
    );
    expect(readFilters("?page=1.5&minDelayDays=2e1")).toEqual(DEFAULT_FILTERS);
  });

  it("tira repetidos e põe as escolhas na ordem das opções (URL estável)", () => {
    expect(readFilters("?status=Extraviado,Em trânsito,Extraviado").status).toEqual([
      "Em trânsito",
      "Extraviado",
    ]);
    expect(readFilters("?stage=5,3,3").stage).toEqual([3, 5]);
  });

  it("apara o texto e remove os padrões (página 1, sem ordenação, escalated false)", () => {
    expect(writeFilters({ ...DEFAULT_FILTERS, q: "  São Paulo  ", page: 1 })).toBe(
      "?q=S%C3%A3o+Paulo",
    );
    expect(readFilters("?q=%20%20&escalated=false&page=1")).toEqual(DEFAULT_FILTERS);
  });
});

describe("consulta à API", () => {
  it("leva os filtros e o pageSize de 20, e a API aceita a consulta", () => {
    const path = searchApiPath(FULL);
    expect(path.startsWith("/staff/orders?")).toBe(true);
    const query = Object.fromEntries(new URLSearchParams(path.split("?")[1]));
    expect(query.pageSize).toBe("20");
    expect(staffSearchQuerySchema.parse(query)).toEqual({
      q: "769",
      status: ["Em trânsito", "Extraviado"],
      shippingMode: ["First Class"],
      market: ["Pacific Asia"],
      stage: [3, 5],
      cause: "Promessa irreal",
      minDelayDays: 3,
      escalated: true,
      sort: "delay",
      page: 2,
      pageSize: 20,
    });
  });

  it("sem filtros, pede só a primeira página", () => {
    expect(searchApiPath(DEFAULT_FILTERS)).toBe("/staff/orders?pageSize=20");
  });
});

describe("chips e paginação", () => {
  it("um chip por filtro ativo, com rótulos claros", () => {
    expect(activeFilterChips(FULL).map((chip) => chip.label)).toEqual([
      "Busca: 769",
      "Situação: Em trânsito",
      "Situação: Extraviado",
      "Modalidade: First Class",
      "Mercado: Pacific Asia",
      "Etapa: Alfândega",
      "Etapa: Última milha",
      "Motivo: Promessa irreal",
      "Atraso: 3+ dias",
      "Só encaminhados à central",
    ]);
    expect(activeFilterChips(DEFAULT_FILTERS)).toEqual([]);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, sort: "date", page: 3 })).toBe(false);
  });

  it("remover um chip tira só aquele valor e volta à página 1", () => {
    const chip = activeFilterChips(FULL).find((item) => item.key === "status:Extraviado");
    expect(chip?.remove(FULL)).toEqual({ ...FULL, status: ["Em trânsito"], page: 1 });
    const escalated = activeFilterChips(FULL).find((item) => item.key === "escalated");
    expect(escalated?.remove(FULL)).toMatchObject({ escalated: false, page: 1 });
  });

  it("mudar filtro volta à página 1; mudar a página não mexe nos filtros", () => {
    expect(updateFilters(FULL, { minDelayDays: 5 })).toEqual({ ...FULL, minDelayDays: 5, page: 1 });
    expect(updateFilters(FULL, { page: 4 })).toEqual({ ...FULL, page: 4 });
  });

  it("rótulos do atraso e total de páginas", () => {
    expect(minDelayLabel(null)).toBe("qualquer");
    expect(minDelayLabel(1)).toBe("1+ dia");
    expect(minDelayLabel(5)).toBe("5+ dias");
    expect(pageCount(7222)).toBe(362);
    expect(pageCount(20)).toBe(1);
    expect(pageCount(0)).toBe(1);
  });
});
