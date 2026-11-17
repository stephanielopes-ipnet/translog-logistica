import { describe, expect, it } from "vitest";
import {
  activeTab,
  guardRedirect,
  matchRoute,
  pageTitle,
  safeReturnPath,
  staffLoginHref,
  staffOrderHref,
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
    expect(matchRoute("/colaborador/entrar", "")).toEqual({ name: "staffLogin", returnTo: null });
  });

  it("keeps the old address /?pedido=N opening the tracking page", () => {
    expect(matchRoute("/", "?pedido=375")).toEqual({ name: "tracking", orderParam: "375" });
  });

  it("ignores a trailing slash and flags unknown paths", () => {
    expect(matchRoute("/rastreio/", "")).toEqual({ name: "tracking", orderParam: null });
    expect(matchRoute("/colaborador/", "")).toEqual({ name: "staffTower" });
    expect(matchRoute("/qualquer", "")).toEqual({ name: "notFound" });
    expect(matchRoute("/colaborador/pedidos/", "")).toEqual({ name: "notFound" });
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
    });
    expect(matchRoute("/colaborador/entrar", "?voltar=https://evil.example")).toEqual({
      name: "staffLogin",
      returnTo: null,
    });
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

describe("activeTab", () => {
  it("marks the tab of the current area", () => {
    expect(activeTab({ name: "home" })).toBeNull();
    expect(activeTab({ name: "tracking", orderParam: null })).toBe("tracking");
    expect(activeTab({ name: "staffLogin", returnTo: null })).toBe("staff");
    expect(activeTab({ name: "staffTower" })).toBe("staff");
    expect(activeTab({ name: "staffOrder", orderParam: "1" })).toBe("staff");
    expect(activeTab({ name: "notFound" })).toBeNull();
  });
});

describe("guardRedirect", () => {
  const tower = { name: "staffTower" } as const;
  const order = { name: "staffOrder", orderParam: "76902" } as const;
  const login = { name: "staffLogin", returnTo: null } as const;

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
        { name: "staffLogin", returnTo: "/colaborador/pedidos/34" },
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
