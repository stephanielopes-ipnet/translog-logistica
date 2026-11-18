// Rotas da tela (History API, URLs limpas). Lógica pura: o hook que lê e muda a URL fica em
// `use-location.ts`. Roteador feito à mão porque são cinco rotas fixas, sem rotas aninhadas nem
// carregamento de dados por rota: uma dependência (react-router) traria mais do que usamos.

export type Route =
  | { name: "home" }
  /** `orderParam` é o texto de `?pedido=` como veio (pode ser inválido: a tela mostra "não encontrado"). */
  | { name: "tracking"; orderParam: string | null }
  /**
   * `returnTo` é a página da Área do colaborador pedida antes do login (já validada);
   * `expired` = a sessão expirou (a tela mostra o aviso).
   */
  | { name: "staffLogin"; returnTo: string | null; expired: boolean }
  | { name: "staffTower" }
  /** Busca de pedidos; `search` é a query string com os filtros (lida em `search-filters.ts`). */
  | { name: "staffSearch"; search: string }
  | { name: "staffOrder"; orderParam: string }
  | { name: "notFound" };

/** Cabeçalho da página: público (cliente e login) ou da Área do colaborador (com sessão). */
export type HeaderKind = "public" | "staff";

export const STAFF_LOGIN_PATH = "/colaborador/entrar";
export const STAFF_HOME_PATH = "/colaborador";
export const STAFF_SEARCH_PATH = "/colaborador/pedidos";

/** Interpreta o endereço atual. `/?pedido=N` (endereço antigo) abre o rastreio. */
export function matchRoute(pathname: string, search: string): Route {
  const path = normalizePath(pathname);
  const params = new URLSearchParams(search);

  if (path === "/") {
    const legacyOrder = params.get("pedido");
    return legacyOrder === null ? { name: "home" } : { name: "tracking", orderParam: legacyOrder };
  }
  if (path === "/rastreio") {
    return { name: "tracking", orderParam: params.get("pedido") };
  }
  if (path === STAFF_LOGIN_PATH) {
    return {
      name: "staffLogin",
      returnTo: safeReturnPath(params.get("voltar")),
      expired: params.get("expirou") === "1",
    };
  }
  if (path === STAFF_HOME_PATH) {
    return { name: "staffTower" };
  }
  // Antes de `/colaborador/pedidos/:id`: sem número, é a lista de busca.
  if (path === STAFF_SEARCH_PATH) {
    return { name: "staffSearch", search: params.toString() ? `?${params.toString()}` : "" };
  }
  const staffOrder = /^\/colaborador\/pedidos\/([^/]+)$/.exec(path);
  if (staffOrder?.[1]) {
    return { name: "staffOrder", orderParam: safeDecode(staffOrder[1]) };
  }
  return { name: "notFound" };
}

/** Endereço do rastreio do cliente (`/rastreio?pedido=N`, ou `/rastreio` sem pedido). */
export function trackingHref(orderParam?: string | number | null): string {
  if (orderParam === undefined || orderParam === null || orderParam === "") {
    return "/rastreio";
  }
  return `/rastreio?${new URLSearchParams({ pedido: String(orderParam) }).toString()}`;
}

/** Endereço da busca de pedidos com os filtros (`search` = "" ou "?…", de `writeFilters`). */
export function staffSearchHref(search = ""): string {
  return `${STAFF_SEARCH_PATH}${search}`;
}

/** Endereço da visão do colaborador de um pedido. */
export function staffOrderHref(orderId: number): string {
  return `/colaborador/pedidos/${orderId}`;
}

/**
 * Login do colaborador, lembrando a página pedida (só se for da Área do colaborador) e, se for o
 * caso, avisando que a sessão expirou.
 */
export function staffLoginHref(
  returnTo?: string | null,
  options: { expired?: boolean } = {},
): string {
  const params = new URLSearchParams();
  const safe = safeReturnPath(returnTo);
  if (safe !== null && safe !== STAFF_HOME_PATH) {
    params.set("voltar", safe);
  }
  if (options.expired) {
    params.set("expirou", "1");
  }
  const query = params.toString();
  return query ? `${STAFF_LOGIN_PATH}?${query}` : STAFF_LOGIN_PATH;
}

/**
 * Página para onde voltar depois do login. Só aceita caminhos internos da Área do colaborador
 * (nada de `//outro-site`, `https://…` ou `/colaborador/entrar`), para o `?voltar=` não virar
 * um redirecionamento aberto.
 */
export function safeReturnPath(value: string | null | undefined): string | null {
  if (!value?.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return null;
  }
  const pathOnly = normalizePath(value.split(/[?#]/)[0] ?? "");
  if (pathOnly === STAFF_LOGIN_PATH) {
    return null;
  }
  if (pathOnly === STAFF_HOME_PATH || pathOnly.startsWith(`${STAFF_HOME_PATH}/`)) {
    return value;
  }
  return null;
}

export function isStaffRoute(route: Route): boolean {
  return route.name === "staffTower" || route.name === "staffSearch" || route.name === "staffOrder";
}

/**
 * Qual cabeçalho mostrar. O login usa o público: a Área do colaborador não aparece no menu
 * público, só no link discreto "Acesso colaborador".
 */
export function headerKind(route: Route): HeaderKind {
  return isStaffRoute(route) ? "staff" : "public";
}

/** Estado da sessão do colaborador visto pela guarda de rota. */
export type SessionState = "loading" | "authenticated" | "anonymous";

/** Destino do link "Acesso colaborador": com sessão, a Torre; sem sessão, o formulário de login. */
export function staffAccessHref(session: SessionState): string {
  return session === "authenticated" ? STAFF_HOME_PATH : STAFF_LOGIN_PATH;
}

/**
 * Guarda da Área do colaborador. Devolve o endereço para onde redirecionar, ou `null` para
 * mostrar a página. Sem sessão → login (lembrando a página pedida); já com sessão no login →
 * a página pedida ou a Torre. Enquanto a sessão carrega, não decide (`null`).
 */
export function guardRedirect(
  route: Route,
  currentHref: string,
  session: SessionState,
): string | null {
  if (session === "loading") {
    return null;
  }
  if (isStaffRoute(route) && session === "anonymous") {
    return staffLoginHref(currentHref);
  }
  if (route.name === "staffLogin" && session === "authenticated") {
    return route.returnTo ?? STAFF_HOME_PATH;
  }
  return null;
}

/** Título da aba do navegador em cada página. */
export function pageTitle(route: Route): string {
  switch (route.name) {
    case "home":
      return "TransLog · Sua carga pelo mundo";
    case "tracking":
      return route.orderParam
        ? `Pedido #${route.orderParam} · TransLog`
        : "Rastreamento · TransLog";
    case "staffLogin":
      return "Entrar · Área do colaborador · TransLog";
    case "staffTower":
      return "Torre de controle · TransLog";
    case "staffSearch":
      return "Pedidos · Área do colaborador · TransLog";
    case "staffOrder":
      return `Pedido #${route.orderParam} · Visão do colaborador · TransLog`;
    case "notFound":
      return "Página não encontrada · TransLog";
  }
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizePath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}
