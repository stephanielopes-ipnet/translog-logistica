import { describe, expect, it } from "vitest";
import {
  guardRedirect,
  headerKind,
  matchRoute,
  pageTitle,
  safeReturnPath,
  staffAccessHref,
  staffLoginHref,
  staffOrderHref,
  staffSearchHref,
  trackingHref,
} from "./router.ts";

describe("matchRoute", () => {
  it("opens the three areas by clean URLs", () => {
    expect(matchRoute("/", "")).toEqual({ name: "home" });
    expect(matchRoute("/rastreio", "?pedido=76902")).toEqual({
      name: "tracking",
      orderParam: "76902",
    });
    expect(matchRoute("/rastreio", "")).toEqual({ name: "tracking", orderParam: null });
    expect(matchRoute("/colaborador", "")).toEqual({ name: "staffTower" });
    expect(matchRoute("/colaborador/pedidos/76902", "")).toEqual({
      name: "staffOrder",
      orderParam: "76902",
    });
    expect(matchRoute("/colaborador/entrar", "")).toEqual({
      name: "staffLogin",
      returnTo: null,
      expired: false,
    });
  });

  it("keeps the old address /?pedido=N opening the tracking page", () => {
    expect(matchRoute("/", "?pedido=375")).toEqual({ name: "tracking", orderParam: "375" });
  });

  it("ignores a trailing slash and flags unknown paths", () => {
    expect(matchRoute("/rastreio/", "")).toEqual({ name: "tracking", orderParam: null });
    expect(matchRoute("/colaborador/", "")).toEqual({ name: "staffTower" });
    expect(matchRoute("/qualquer", "")).toEqual({ name: "notFound" });
    expect(matchRoute("/colaborador/pedidos/", "")).toEqual({ name: "staffSearch", search: "" });
    expect(matchRoute("/colaborador/pedidos/1/2", "")).toEqual({ name: "notFound" });
  });

  it("keeps a malformed order segment as text (the page shows 'not found')", () => {
    expect(matchRoute("/colaborador/pedidos/%E0", "")).toEqual({
      name: "staffOrder",
      orderParam: "%E0",
    });
  });

  it("reads the return page of the login, only when it is a staff page", () => {
    expect(matchRoute("/colaborador/entrar", "?voltar=%2Fcolaborador%2Fpedidos%2F34")).toEqual({
      name: "staffLogin",
      returnTo: "/colaborador/pedidos/34",
      expired: false,
    });
    expect(matchRoute("/colaborador/entrar", "?voltar=https://evil.example")).toEqual({
      name: "staffLogin",
      returnTo: null,
      expired: false,
    });
    expect(matchRoute("/colaborador/entrar", "?expirou=1")).toMatchObject({ expired: true });
  });
});

describe("hrefs", () => {
  it("builds the tracking, staff order and login addresses", () => {
    expect(trackingHref(76902)).toBe("/rastreio?pedido=76902");
    expect(trackingHref(null)).toBe("/rastreio");
    expect(trackingHref("")).toBe("/rastreio");
    expect(staffOrderHref(34)).toBe("/colaborador/pedidos/34");
    expect(staffLoginHref("/colaborador/pedidos/34")).toBe(
      "/colaborador/entrar?voltar=%2Fcolaborador%2Fpedidos%2F34",
    );
    expect(staffLoginHref("/colaborador")).toBe("/colaborador/entrar");
    expect(staffLoginHref(null)).toBe("/colaborador/entrar");
    expect(staffLoginHref("/colaborador", { expired: true })).toBe("/colaborador/entrar?expirou=1");
    expect(staffLoginHref("/colaborador/pedidos/34", { expired: true })).toBe(
      "/colaborador/entrar?voltar=%2Fcolaborador%2Fpedidos%2F34&expirou=1",
    );
  });
});

describe("safeReturnPath", () => {
  it("accepts only internal staff pages", () => {
    expect(safeReturnPath("/colaborador")).toBe("/colaborador");
    expect(safeReturnPath("/colaborador/pedidos/76902")).toBe("/colaborador/pedidos/76902");
    expect(safeReturnPath("/colaborador?x=1")).toBe("/colaborador?x=1");
    expect(safeReturnPath("/rastreio?pedido=1")).toBeNull();
    expect(safeReturnPath("/colaborador/entrar")).toBeNull();
    expect(safeReturnPath("//evil.example/colaborador")).toBeNull();
    expect(safeReturnPath("/\\evil.example")).toBeNull();
    expect(safeReturnPath("https://evil.example/colaborador")).toBeNull();
    expect(safeReturnPath("/colaboradorx")).toBeNull();
    expect(safeReturnPath("")).toBeNull();
    expect(safeReturnPath(null)).toBeNull();
  });
});

describe("headerKind", () => {
  it("keeps the staff area out of the public header until signed in", () => {
    expect(headerKind({ name: "home" })).toBe("public");
    expect(headerKind({ name: "tracking", orderParam: null })).toBe("public");
    expect(headerKind({ name: "staffLogin", returnTo: null, expired: false })).toBe("public");
    expect(headerKind({ name: "notFound" })).toBe("public");
    expect(headerKind({ name: "staffTower" })).toBe("staff");
    expect(headerKind({ name: "staffOrder", orderParam: "1" })).toBe("staff");
  });
});

describe("staffAccessHref", () => {
  it("opens the login form directly, or the Tower when already signed in", () => {
    expect(staffAccessHref("anonymous")).toBe("/colaborador/entrar");
    expect(staffAccessHref("loading")).toBe("/colaborador/entrar");
    expect(staffAccessHref("authenticated")).toBe("/colaborador");
  });
});

describe("guardRedirect", () => {
  const tower = { name: "staffTower" } as const;
  const order = { name: "staffOrder", orderParam: "76902" } as const;
  const login = { name: "staffLogin", returnTo: null, expired: false } as const;

  it("sends anonymous visitors of staff pages to the login, remembering the page", () => {
    expect(guardRedirect(tower, "/colaborador", "anonymous")).toBe("/colaborador/entrar");
    expect(guardRedirect(order, "/colaborador/pedidos/76902", "anonymous")).toBe(
      "/colaborador/entrar?voltar=%2Fcolaborador%2Fpedidos%2F76902",
    );
  });

  it("shows staff pages with a session and waits while it loads", () => {
    expect(guardRedirect(tower, "/colaborador", "authenticated")).toBeNull();
    expect(guardRedirect(order, "/colaborador/pedidos/76902", "loading")).toBeNull();
  });

  it("leaves the login when already signed in, to the requested page or the Tower", () => {
    expect(guardRedirect(login, "/colaborador/entrar", "authenticated")).toBe("/colaborador");
    expect(
      guardRedirect(
        { name: "staffLogin", returnTo: "/colaborador/pedidos/34", expired: false },
        "/colaborador/entrar?voltar=%2Fcolaborador%2Fpedidos%2F34",
        "authenticated",
      ),
    ).toBe("/colaborador/pedidos/34");
    expect(guardRedirect(login, "/colaborador/entrar", "anonymous")).toBeNull();
  });

  it("never guards customer pages", () => {
    expect(guardRedirect({ name: "home" }, "/", "anonymous")).toBeNull();
    expect(
      guardRedirect({ name: "tracking", orderParam: "1" }, "/rastreio", "anonymous"),
    ).toBeNull();
  });
});

describe("pageTitle", () => {
  it("names the browser tab after the page", () => {
    expect(pageTitle({ name: "tracking", orderParam: "76902" })).toBe("Pedido #76902 · TransLog");
    expect(pageTitle({ name: "tracking", orderParam: null })).toBe("Rastreamento · TransLog");
    expect(pageTitle({ name: "staffTower" })).toBe("Torre de controle · TransLog");
  });
});

describe("busca de pedidos do colaborador", () => {
  it("abre a lista em /colaborador/pedidos, sem conflito com /colaborador/pedidos/:id", () => {
    expect(matchRoute("/colaborador/pedidos", "")).toEqual({ name: "staffSearch", search: "" });
    expect(matchRoute("/colaborador/pedidos", "?q=769&page=2")).toEqual({
      name: "staffSearch",
      search: "?q=769&page=2",
    });
    expect(matchRoute("/colaborador/pedidos/76902", "?q=769")).toEqual({
      name: "staffOrder",
      orderParam: "76902",
    });
    expect(staffSearchHref()).toBe("/colaborador/pedidos");
    expect(staffSearchHref("?q=769")).toBe("/colaborador/pedidos?q=769");
  });

  it("é protegida: sem sessão vai ao login e volta à busca com os mesmos filtros", () => {
    const route = { name: "staffSearch", search: "?status=Extraviado" } as const;
    expect(headerKind(route)).toBe("staff");
    expect(pageTitle(route)).toBe("Pedidos · Área do colaborador · TransLog");
    const redirect = guardRedirect(route, "/colaborador/pedidos?status=Extraviado", "anonymous");
    expect(redirect).toBe(
      "/colaborador/entrar?voltar=%2Fcolaborador%2Fpedidos%3Fstatus%3DExtraviado",
    );
    expect(matchRoute("/colaborador/entrar", new URL(`http://x${redirect}`).search)).toMatchObject({
      returnTo: "/colaborador/pedidos?status=Extraviado",
    });
    expect(guardRedirect(route, "/colaborador/pedidos", "authenticated")).toBeNull();
  });
});
