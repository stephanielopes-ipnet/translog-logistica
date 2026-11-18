import {
  type OrderStatus,
  STAFF_SEARCH_TEXT_MAX_LENGTH,
  type StaffSearchResponse,
  type StaffSearchRow,
  type StaffSearchSort,
} from "@translog/contracts";
import {
  ChevronLeft,
  ChevronRight,
  Headset,
  RotateCcw,
  Search,
  SearchX,
  WifiOff,
  X,
} from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { useStaffSearch } from "@/api/session.ts";
import { STATUS_TONE, type StatusTone } from "@/features/tracking/order-status.ts";
import { formatDate } from "@/lib/format.ts";
import { staffOrderHref, staffSearchHref } from "@/lib/router.ts";
import { Link, navigate } from "@/lib/use-location.tsx";
import { rememberSearch } from "./last-search.ts";
import {
  activeFilterChips,
  CAUSE_OPTIONS,
  DEFAULT_FILTERS,
  hasActiveFilters,
  MARKET_OPTIONS,
  MIN_DELAY_OPTIONS,
  minDelayLabel,
  pageCount,
  readFilters,
  SEARCH_PAGE_SIZE,
  type SearchFilters,
  SHIPPING_MODE_OPTIONS,
  SORT_LABELS,
  STAGE_OPTIONS,
  STATUS_OPTIONS,
  updateFilters,
  writeFilters,
} from "./search-filters.ts";
import { formatInt, routeLabel } from "./tower-format.ts";

const SEARCH_DEBOUNCE_MS = 300;

/**
 * Busca de pedidos do colaborador (`/colaborador/pedidos`). Os filtros vivem na URL (a busca pode
 * ser compartilhada, recarregada e volta igual pelo "voltar" do navegador); cada linha abre a
 * visão do colaborador (`/colaborador/pedidos/:id`), nunca o rastreio do cliente.
 */
export function StaffSearchPage({ search }: { search: string }) {
  const filters = readFilters(search);
  const query = useStaffSearch(filters);

  // A visão do colaborador oferece "Voltar à busca" para esta mesma busca.
  const href = staffSearchHref(writeFilters(filters));
  useEffect(() => rememberSearch(href), [href]);

  function apply(next: SearchFilters) {
    navigate(staffSearchHref(writeFilters(next)), { replace: true });
  }

  return (
    <div className="mx-auto max-w-[1440px] px-6 py-5 space-y-4">
      <header className="bg-surface border border-slate-300/90 rounded-lg shadow-sm px-5 py-4">
        <p className="label-mono">Área do colaborador</p>
        <h1 className="text-[22px] font-bold tracking-tight text-slate-900">Pedidos</h1>
        <p className="text-sm text-slate-600">
          Busque por número, cidade ou país e filtre a lista. Clique num pedido (ou tecle Enter)
          para abrir a visão do colaborador.
        </p>
        <SearchBar filters={filters} onApply={apply} />
      </header>

      <FiltersPanel filters={filters} onApply={apply} />

      <ResultsPanel
        filters={filters}
        data={query.data}
        isPending={query.isPending}
        isRefreshing={query.isPlaceholderData || (query.isFetching && !query.isPending)}
        isError={query.isError}
        onRetry={() => void query.refetch()}
        onApply={apply}
      />
    </div>
  );
}

/* ---------------- Campo principal e ordenação ---------------- */

function SearchBar({
  filters,
  onApply,
}: {
  filters: SearchFilters;
  onApply: (next: SearchFilters) => void;
}) {
  const [text, setText] = useState(filters.q);
  const hintId = useId();
  // Último texto que este campo mandou para a URL: distingue a mudança feita aqui da feita por
  // fora (chip removido, "Limpar tudo", voltar do navegador), sem apagar o que ainda se digita.
  const sentRef = useRef(filters.q);

  useEffect(() => {
    if (filters.q !== sentRef.current) {
      sentRef.current = filters.q;
      setText(filters.q);
    }
  }, [filters.q]);

  function send(value: string) {
    sentRef.current = value;
    onApply(updateFilters(filters, { q: value }));
  }

  // Debounce curto: busca enquanto digita, sem uma consulta por tecla.
  const pending = text.trim() !== filters.q ? text.trim() : null;
  const sendLatest = useRef(send);
  sendLatest.current = send;
  useEffect(() => {
    if (pending === null) {
      return;
    }
    const timer = setTimeout(() => sendLatest.current(pending), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [pending]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    send(text.trim());
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex items-end gap-3">
      <div className="flex-1 min-w-0">
        <label htmlFor="staffSearchInput" className="label-mono block mb-1.5">
          Buscar pedido, cidade ou país
        </label>
        <div className="relative">
          <Search
            aria-hidden="true"
            className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
          />
          <input
            id="staffSearchInput"
            type="search"
            autoComplete="off"
            maxLength={STAFF_SEARCH_TEXT_MAX_LENGTH}
            placeholder="Ex.: 769 ou São Paulo"
            value={text}
            aria-describedby={hintId}
            onChange={(event) => setText(event.target.value)}
            className="w-full h-10 rounded-md border border-slate-300 bg-slate-50/60 pl-10 pr-3 text-[15px] text-slate-900 placeholder:text-slate-400 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition"
          />
        </div>
        <p id={hintId} className="mt-1.5 text-xs text-slate-500">
          Número busca pelo início (769 acha 76902, 7690…). Texto busca na cidade, estado ou país de
          origem e destino, sem acentos.
        </p>
      </div>
      <div className="shrink-0 pb-[22px]">
        <label htmlFor="staffSearchSort" className="label-mono block mb-1.5">
          Ordenar por
        </label>
        <select
          id="staffSearchSort"
          value={filters.sort ?? ""}
          onChange={(event) =>
            onApply({
              ...filters,
              page: 1,
              sort: event.target.value === "" ? null : (event.target.value as StaffSearchSort),
            })
          }
          className="h-10 rounded-md border border-slate-300 bg-surface px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        >
          <option value="">Padrão</option>
          {(Object.keys(SORT_LABELS) as StaffSearchSort[]).map((sort) => (
            <option key={sort} value={sort}>
              {SORT_LABELS[sort]}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        className="mb-[22px] h-10 px-5 rounded-md bg-primary text-white text-sm font-semibold shadow-sm hover:bg-primary-700 inline-flex items-center gap-2 transition"
      >
        <Search aria-hidden="true" className="w-4 h-4" />
        Buscar
      </button>
    </form>
  );
}

/* ---------------- Filtros ---------------- */

function FiltersPanel({
  filters,
  onApply,
}: {
  filters: SearchFilters;
  onApply: (next: SearchFilters) => void;
}) {
  const chips = activeFilterChips(filters);

  function toggle<T>(list: readonly T[], value: T): T[] {
    return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  }

  return (
    <section
      aria-label="Filtros"
      className="bg-surface border border-slate-300/90 rounded-lg shadow-sm px-5 py-4 space-y-3"
    >
      <div className="grid grid-cols-1 min-[1180px]:grid-cols-2 gap-x-8 gap-y-3">
        <ToggleGroup
          legend="Situação"
          options={STATUS_OPTIONS.map((status) => ({ value: status, label: status }))}
          selected={filters.status}
          onToggle={(status) =>
            onApply(updateFilters(filters, { status: toggle(filters.status, status) }))
          }
        />
        <ToggleGroup
          legend="Modalidade"
          options={SHIPPING_MODE_OPTIONS.map((mode) => ({ value: mode, label: mode }))}
          selected={filters.shippingMode}
          onToggle={(mode) =>
            onApply(updateFilters(filters, { shippingMode: toggle(filters.shippingMode, mode) }))
          }
        />
        <ToggleGroup
          legend="Mercado"
          options={MARKET_OPTIONS.map((market) => ({ value: market, label: market }))}
          selected={filters.market}
          onToggle={(market) =>
            onApply(updateFilters(filters, { market: toggle(filters.market, market) }))
          }
        />
        <ToggleGroup
          legend="Etapa atual"
          options={STAGE_OPTIONS.map((option) => ({ value: option.stage, label: option.label }))}
          selected={filters.stage}
          onToggle={(stage) =>
            onApply(updateFilters(filters, { stage: toggle(filters.stage, stage) }))
          }
        />
        <ToggleGroup
          legend="Atraso mínimo da entrega"
          options={MIN_DELAY_OPTIONS.map((days) => ({ value: days, label: minDelayLabel(days) }))}
          selected={[filters.minDelayDays]}
          single
          onToggle={(days) => onApply(updateFilters(filters, { minDelayDays: days }))}
        />
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <div>
            <label htmlFor="staffSearchCause" className="label-mono block mb-1.5">
              Motivo (termos da base)
            </label>
            <select
              id="staffSearchCause"
              value={filters.cause}
              onChange={(event) => onApply(updateFilters(filters, { cause: event.target.value }))}
              className="h-8 rounded-md border border-slate-300 bg-surface px-2.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              <option value="">Qualquer</option>
              {CAUSE_OPTIONS.map((cause) => (
                <option key={cause} value={cause}>
                  {cause}
                </option>
              ))}
            </select>
          </div>
          <label className="h-8 inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={filters.escalated}
              onChange={(event) =>
                onApply(updateFilters(filters, { escalated: event.target.checked }))
              }
              className="w-4 h-4 accent-[var(--color-primary)]"
            />
            Só encaminhados à central
          </label>
        </div>
      </div>

      {chips.length > 0 && (
        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
          <span className="label-mono mr-1">Filtros ativos:</span>
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => onApply(chip.remove(filters))}
              aria-label={`Remover filtro ${chip.label}`}
              className="h-7 pl-2.5 pr-1.5 rounded-full border border-primary-200 bg-primary-50 text-xs font-medium text-primary inline-flex items-center gap-1 hover:border-primary transition"
            >
              {chip.label}
              <X aria-hidden="true" className="w-3.5 h-3.5" />
            </button>
          ))}
          <button
            type="button"
            onClick={() => onApply({ ...DEFAULT_FILTERS, sort: filters.sort })}
            className="ml-1 text-xs font-medium text-slate-500 hover:text-slate-900 underline-offset-4 hover:underline rounded"
          >
            Limpar tudo
          </button>
        </div>
      )}
    </section>
  );
}

function ToggleGroup<T extends string | number | null>({
  legend,
  options,
  selected,
  onToggle,
  single = false,
}: {
  legend: string;
  options: readonly { value: T; label: string }[];
  selected: readonly T[];
  onToggle: (value: T) => void;
  /** Escolha única (atraso mínimo): o botão marcado fica marcado. */
  single?: boolean;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="label-mono mb-1.5">{legend}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const active = selected.includes(option.value);
          return (
            <button
              key={String(option.value)}
              type="button"
              aria-pressed={active}
              onClick={() => (single && active ? undefined : onToggle(option.value))}
              className={`h-7 px-2.5 rounded border text-xs transition ${
                active
                  ? "border-primary bg-primary text-white font-semibold"
                  : "border-slate-300 bg-surface text-slate-700 hover:border-primary-200 hover:bg-primary-50 hover:text-primary"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/* ---------------- Resultados ---------------- */

function ResultsPanel({
  filters,
  data,
  isPending,
  isRefreshing,
  isError,
  onRetry,
  onApply,
}: {
  filters: SearchFilters;
  data: StaffSearchResponse | undefined;
  isPending: boolean;
  isRefreshing: boolean;
  isError: boolean;
  onRetry: () => void;
  onApply: (next: SearchFilters) => void;
}) {
  const filtered = hasActiveFilters(filters);
  const pages = data ? pageCount(data.total, SEARCH_PAGE_SIZE) : 1;

  let body: ReactNode;
  if (isError && !data) {
    body = (
      <StateMessage icon={<WifiOff aria-hidden="true" className="w-5 h-5" />} role="alert">
        <p className="font-semibold text-slate-900">Não foi possível carregar os pedidos.</p>
        <p>Confira a conexão com o servidor e tente de novo.</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 h-9 px-3.5 rounded-md border border-slate-300 bg-surface text-sm font-medium text-slate-700 inline-flex items-center gap-2 hover:bg-slate-50"
        >
          <RotateCcw aria-hidden="true" className="w-4 h-4" />
          Tentar novamente
        </button>
      </StateMessage>
    );
  } else if (isPending || !data) {
    body = <SkeletonRows />;
  } else if (data.results.length === 0) {
    const pastEnd = data.total > 0;
    body = (
      <StateMessage icon={<SearchX aria-hidden="true" className="w-5 h-5" />} role="status">
        <p className="font-semibold text-slate-900">
          {pastEnd ? "Esta página não existe mais." : "Nenhum pedido encontrado."}
        </p>
        <p>
          {pastEnd
            ? "A busca tem menos páginas agora."
            : filtered
              ? "Tente outro termo ou tire alguns filtros."
              : "Não há pedidos carregados."}
        </p>
        {pastEnd ? (
          <SecondaryButton onClick={() => onApply({ ...filters, page: 1 })}>
            Ir para a primeira página
          </SecondaryButton>
        ) : (
          filtered && (
            <SecondaryButton onClick={() => onApply({ ...DEFAULT_FILTERS, sort: filters.sort })}>
              Limpar filtros
            </SecondaryButton>
          )
        )}
      </StateMessage>
    );
  } else {
    body = <ResultsTable rows={data.results} dimmed={isRefreshing} />;
  }

  return (
    <section
      aria-label="Resultados"
      aria-busy={isPending || isRefreshing}
      className="bg-surface border border-slate-300/90 rounded-lg shadow-sm px-5 py-4"
    >
      <div className="flex items-baseline gap-4 mb-3">
        <h2 className="text-[15px] font-semibold text-slate-900" aria-live="polite">
          {data ? (
            <>
              {formatInt(data.total)} {data.total === 1 ? "pedido" : "pedidos"}
              {!filtered && (
                <span className="ml-2 text-xs font-normal text-slate-500">
                  (todos os pedidos; use a busca ou os filtros para encontrar um)
                </span>
              )}
            </>
          ) : isError ? (
            "Pedidos"
          ) : (
            "Carregando pedidos…"
          )}
        </h2>
        {isError && data && (
          <span role="alert" className="text-xs font-medium text-red-700">
            Não foi possível atualizar.{" "}
            <button type="button" onClick={onRetry} className="underline underline-offset-2">
              Tentar novamente
            </button>
          </span>
        )}
        {data && data.total > 0 && (
          <span className="ml-auto text-xs text-slate-500">
            Página {formatInt(data.page)} de {formatInt(pages)}
          </span>
        )}
      </div>

      {body}

      {data && data.total > SEARCH_PAGE_SIZE && data.results.length > 0 && (
        <nav aria-label="Paginação" className="mt-4 flex items-center justify-end gap-2">
          <PageButton
            disabled={data.page <= 1}
            onClick={() => onApply({ ...filters, page: data.page - 1 })}
          >
            <ChevronLeft aria-hidden="true" className="w-4 h-4" />
            Anterior
          </PageButton>
          <span className="text-sm text-slate-600 px-2">
            Página <strong className="text-slate-900">{formatInt(data.page)}</strong> de{" "}
            {formatInt(pages)}
          </span>
          <PageButton
            disabled={data.page >= pages}
            onClick={() => onApply({ ...filters, page: data.page + 1 })}
          >
            Próxima
            <ChevronRight aria-hidden="true" className="w-4 h-4" />
          </PageButton>
        </nav>
      )}
    </section>
  );
}

function ResultsTable({ rows, dimmed }: { rows: readonly StaffSearchRow[]; dimmed: boolean }) {
  return (
    <table
      className={`w-full text-sm motion-safe:transition-opacity ${dimmed ? "opacity-60" : ""}`}
    >
      <thead>
        <tr className="text-left border-b border-slate-200">
          <Th>Pedido</Th>
          <Th>Data</Th>
          <Th>Rota</Th>
          <Th>Modalidade</Th>
          <Th>Situação</Th>
          <Th>Etapa · local</Th>
          <Th className="text-right">Atraso</Th>
          <Th>Motivo provável</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.orderId}
            onClick={() => navigate(staffOrderHref(row.orderId))}
            className="border-b border-slate-100 last:border-0 hover:bg-primary-50/60 cursor-pointer align-top"
          >
            <td className="py-2 pr-3 whitespace-nowrap">
              <Link
                href={staffOrderHref(row.orderId)}
                onClick={(event) => event.stopPropagation()}
                className="font-mono font-semibold text-slate-900 hover:text-primary rounded"
              >
                #{row.orderId}
              </Link>
              {row.escalateToSupport && (
                <span
                  title="Encaminhado à central de atendimento"
                  className="ml-1.5 inline-flex items-center gap-0.5 rounded border border-accent-200 bg-accent-50 px-1 font-mono text-[10px] uppercase tracking-wider text-accent-700"
                >
                  <Headset aria-hidden="true" className="w-2.5 h-2.5" />
                  Central
                </span>
              )}
            </td>
            <td className="py-2 pr-3 font-mono text-xs tabular text-slate-600 whitespace-nowrap">
              {formatDate(row.orderDate)}
            </td>
            <td className="py-2 pr-3 text-slate-700">{routeLabel(row.origin, row.destination)}</td>
            <td className="py-2 pr-3 text-slate-700 whitespace-nowrap">{row.shippingMode}</td>
            <td className="py-2 pr-3">
              <StatusBadge status={row.status} />
            </td>
            <td className="py-2 pr-3 text-slate-700">
              {row.stage && (
                <span className="mr-2 inline-flex rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] text-slate-600">
                  {row.stage.label}
                </span>
              )}
              {row.location ?? "—"}
            </td>
            <td className="py-2 pr-3 text-right">
              <DelayBadge days={row.delayDays} />
            </td>
            <td className="py-2 text-slate-700">{row.probableCause ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const TONE_BADGE: Record<StatusTone, string> = {
  success: "border-emerald-300 bg-emerald-50 text-emerald-800",
  transit: "border-primary-200 bg-primary-50 text-primary",
  danger: "border-red-300 bg-red-50 text-red-700",
  waiting: "border-amber-300 bg-amber-50 text-amber-900",
  neutral: "border-slate-300 bg-slate-50 text-slate-700",
};

function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded border px-1.5 py-0.5 text-xs font-semibold ${TONE_BADGE[STATUS_TONE[status]]}`}
    >
      {status}
    </span>
  );
}

function DelayBadge({ days }: { days: number | null }) {
  if (days === null) {
    return <span className="font-mono text-xs text-slate-400">—</span>;
  }
  if (days <= 0) {
    return <span className="font-mono text-xs text-slate-400">no prazo</span>;
  }
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded border px-1.5 py-0.5 font-mono text-xs font-semibold tabular ${
        days >= 6
          ? "border-red-300 bg-red-50 text-red-700"
          : "border-amber-300 bg-amber-50 text-amber-800"
      }`}
    >
      +{days} {days === 1 ? "dia" : "dias"}
    </span>
  );
}

function Th({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <th className={`label-mono pb-2 pr-3 font-medium ${className}`}>{children}</th>;
}

function SkeletonRows() {
  return (
    <div role="status" aria-label="Carregando pedidos" className="space-y-2 py-1">
      {["a", "b", "c", "d", "e", "f"].map((key) => (
        <div key={key} className="h-8 rounded bg-slate-100 motion-safe:animate-pulse" />
      ))}
    </div>
  );
}

function StateMessage({
  icon,
  role,
  children,
}: {
  icon: ReactNode;
  role: "status" | "alert";
  children: ReactNode;
}) {
  return (
    <div
      role={role}
      className="py-12 flex flex-col items-center text-center text-sm text-slate-600 gap-1"
    >
      <span className="mb-2 w-10 h-10 rounded-full bg-slate-100 text-slate-500 grid place-items-center">
        {icon}
      </span>
      {children}
    </div>
  );
}

function SecondaryButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2 h-9 px-3.5 rounded-md border border-slate-300 bg-surface text-sm font-medium text-slate-700 hover:bg-slate-50"
    >
      {children}
    </button>
  );
}

function PageButton({
  disabled,
  onClick,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="h-9 px-3 rounded-md border border-slate-300 bg-surface text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1"
    >
      {children}
    </button>
  );
}
