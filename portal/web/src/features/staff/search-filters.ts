import {
  type Market,
  marketSchema,
  type OrderStatus,
  orderStatusSchema,
  type ShippingMode,
  STAFF_SEARCH_TEXT_MAX_LENGTH,
  type StaffSearchSort,
  shippingModeSchema,
  staffSearchSortSchema,
} from "@translog/contracts";
import { STAGE_FILTERS } from "./tower-format.ts";

// Filtros da busca de pedidos do colaborador (`/colaborador/pedidos`). Ficam na query string da
// tela, com os mesmos nomes da API (`GET /api/staff/orders`), para a busca poder ser compartilhada,
// recarregada e voltar do pedido pelo "voltar" do navegador. Lógica pura, sem React.

export interface SearchFilters {
  /** Número (prefixo) ou cidade/estado/país; "" = sem texto. */
  q: string;
  status: OrderStatus[];
  shippingMode: ShippingMode[];
  market: Market[];
  /** Etapas atuais, de 1 (Coleta) a 5 (Última milha). */
  stage: number[];
  /** Motivo provável nos termos da base; "" = qualquer. */
  cause: string;
  /** Atraso de entrega mínimo, em dias; `null` = qualquer. */
  minDelayDays: number | null;
  /** Só os encaminhados à central. */
  escalated: boolean;
  /** `null` = ordem padrão da API (maior atraso com `minDelayDays`; número nos demais casos). */
  sort: StaffSearchSort | null;
  page: number;
}

export const DEFAULT_FILTERS: SearchFilters = {
  q: "",
  status: [],
  shippingMode: [],
  market: [],
  stage: [],
  cause: "",
  minDelayDays: null,
  escalated: false,
  sort: null,
  page: 1,
};

/** Linhas por página na tela. */
export const SEARCH_PAGE_SIZE = 20;

/** Opções da tela, na ordem de exibição (e na ordem em que vão para a URL). */
export const STATUS_OPTIONS: readonly OrderStatus[] = orderStatusSchema.options;
export const SHIPPING_MODE_OPTIONS: readonly ShippingMode[] = shippingModeSchema.options;
export const MARKET_OPTIONS: readonly Market[] = marketSchema.options;
export const STAGE_OPTIONS = STAGE_FILTERS.filter(
  (filter): filter is { stage: number; label: string } => filter.stage !== null,
);
/** Atraso mínimo: qualquer · 1+ · 3+ · 5+ dias. */
export const MIN_DELAY_OPTIONS: readonly (number | null)[] = [null, 1, 3, 5];
/** Causas da base (o campo aceita qualquer texto; estas são as que aparecem nos dados). */
export const CAUSE_OPTIONS: readonly string[] = [
  "Promessa irreal",
  "Atraso operacional",
  "Atraso no despacho não recuperado no transporte",
  "Volume sem atualização de rastreio",
];
export const SORT_LABELS: Record<StaffSearchSort, string> = {
  delay: "Maior atraso",
  order: "Número",
  date: "Mais recentes",
};

const MAX_PAGE = 10_000;
const MAX_DELAY = 365;

/** Lista separada por vírgula → valores válidos, sem repetir, na ordem das opções. */
function readList<T extends string | number>(
  raw: string | null,
  options: readonly T[],
  parse: (part: string) => T | undefined,
): T[] {
  if (!raw) {
    return [];
  }
  const chosen = new Set(
    raw
      .split(",")
      .map((part) => parse(part.trim()))
      .filter((value): value is T => value !== undefined),
  );
  return options.filter((option) => chosen.has(option));
}

function readInt(raw: string | null, min: number, max: number): number | null {
  if (!raw || !/^\d{1,6}$/.test(raw)) {
    return null;
  }
  const value = Number(raw);
  return value >= min && value <= max ? value : null;
}

function readText(raw: string | null): string {
  const text = (raw ?? "").trim();
  return text.length > STAFF_SEARCH_TEXT_MAX_LENGTH ? "" : text;
}

/** Filtros a partir da query string (`?q=769&status=Extraviado`); valor inválido é ignorado. */
export function readFilters(search: string): SearchFilters {
  const params = new URLSearchParams(search);
  const sort = staffSearchSortSchema.safeParse(params.get("sort"));
  return {
    q: readText(params.get("q")),
    status: readList(
      params.get("status"),
      STATUS_OPTIONS,
      (part) => orderStatusSchema.safeParse(part).data,
    ),
    shippingMode: readList(
      params.get("shippingMode"),
      SHIPPING_MODE_OPTIONS,
      (part) => shippingModeSchema.safeParse(part).data,
    ),
    market: readList(
      params.get("market"),
      MARKET_OPTIONS,
      (part) => marketSchema.safeParse(part).data,
    ),
    stage: readList(
      params.get("stage"),
      STAGE_OPTIONS.map((option) => option.stage),
      (part) => readInt(part, 1, 5) ?? undefined,
    ),
    cause: readText(params.get("cause")),
    minDelayDays: readInt(params.get("minDelayDays"), 1, MAX_DELAY),
    escalated: params.get("escalated") === "true",
    sort: sort.success ? sort.data : null,
    page: readInt(params.get("page"), 1, MAX_PAGE) ?? 1,
  };
}

/** Parâmetros dos filtros, sem os valores padrão (comum à URL da tela e à da API). */
function filterParams(filters: SearchFilters): URLSearchParams {
  const params = new URLSearchParams();
  const q = filters.q.trim();
  if (q) params.set("q", q);
  if (filters.status.length) params.set("status", filters.status.join(","));
  if (filters.shippingMode.length) params.set("shippingMode", filters.shippingMode.join(","));
  if (filters.market.length) params.set("market", filters.market.join(","));
  if (filters.stage.length) params.set("stage", filters.stage.join(","));
  const cause = filters.cause.trim();
  if (cause) params.set("cause", cause);
  if (filters.minDelayDays !== null) params.set("minDelayDays", String(filters.minDelayDays));
  if (filters.escalated) params.set("escalated", "true");
  if (filters.sort !== null) params.set("sort", filters.sort);
  if (filters.page > 1) params.set("page", String(filters.page));
  return params;
}

/** Query string da tela (`""` sem filtros, ou `"?q=769&page=2"`). */
export function writeFilters(filters: SearchFilters): string {
  const query = filterParams(filters).toString();
  return query ? `?${query}` : "";
}

/** Caminho da consulta à API (sem o `/api`): `/staff/orders?…&pageSize=20`. */
export function searchApiPath(filters: SearchFilters, pageSize = SEARCH_PAGE_SIZE): string {
  const params = filterParams(filters);
  params.set("pageSize", String(pageSize));
  return `/staff/orders?${params.toString()}`;
}

/**
 * Muda filtros e volta à página 1 (um filtro novo muda o total). Para trocar só a página, passe
 * `page` no `patch`.
 */
export function updateFilters(
  filters: SearchFilters,
  patch: Partial<SearchFilters>,
): SearchFilters {
  return { ...filters, page: 1, ...patch };
}

/** Algum filtro ou texto ativo (a ordenação e a página não contam). */
export function hasActiveFilters(filters: SearchFilters): boolean {
  return activeFilterChips(filters).length > 0;
}

export interface FilterChip {
  /** Chave estável para a lista (`status:Extraviado`). */
  key: string;
  label: string;
  /** Filtros sem este chip (página 1). */
  remove: (filters: SearchFilters) => SearchFilters;
}

/** Um chip por filtro ativo (um por valor nas escolhas múltiplas), cada um removível. */
export function activeFilterChips(filters: SearchFilters): FilterChip[] {
  const chips: FilterChip[] = [];
  const q = filters.q.trim();
  if (q) {
    chips.push({ key: "q", label: `Busca: ${q}`, remove: (f) => updateFilters(f, { q: "" }) });
  }
  for (const status of filters.status) {
    chips.push({
      key: `status:${status}`,
      label: `Situação: ${status}`,
      remove: (f) => updateFilters(f, { status: f.status.filter((value) => value !== status) }),
    });
  }
  for (const mode of filters.shippingMode) {
    chips.push({
      key: `shippingMode:${mode}`,
      label: `Modalidade: ${mode}`,
      remove: (f) =>
        updateFilters(f, { shippingMode: f.shippingMode.filter((value) => value !== mode) }),
    });
  }
  for (const market of filters.market) {
    chips.push({
      key: `market:${market}`,
      label: `Mercado: ${market}`,
      remove: (f) => updateFilters(f, { market: f.market.filter((value) => value !== market) }),
    });
  }
  for (const stage of filters.stage) {
    const label = STAGE_OPTIONS.find((option) => option.stage === stage)?.label ?? String(stage);
    chips.push({
      key: `stage:${stage}`,
      label: `Etapa: ${label}`,
      remove: (f) => updateFilters(f, { stage: f.stage.filter((value) => value !== stage) }),
    });
  }
  const cause = filters.cause.trim();
  if (cause) {
    chips.push({
      key: "cause",
      label: `Motivo: ${cause}`,
      remove: (f) => updateFilters(f, { cause: "" }),
    });
  }
  if (filters.minDelayDays !== null) {
    chips.push({
      key: "minDelayDays",
      label: `Atraso: ${minDelayLabel(filters.minDelayDays)}`,
      remove: (f) => updateFilters(f, { minDelayDays: null }),
    });
  }
  if (filters.escalated) {
    chips.push({
      key: "escalated",
      label: "Só encaminhados à central",
      remove: (f) => updateFilters(f, { escalated: false }),
    });
  }
  return chips;
}

/** `null` → "qualquer"; `3` → "3+ dias"; `1` → "1+ dia". */
export function minDelayLabel(days: number | null): string {
  if (days === null) {
    return "qualquer";
  }
  return `${days}+ ${days === 1 ? "dia" : "dias"}`;
}

/** Total de páginas (mínimo 1). */
export function pageCount(total: number, pageSize = SEARCH_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize));
}
