import type { DataOrigin, StaffOrder } from "@translog/contracts";
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  FlaskConical,
  Loader2,
  ScanBarcode,
  ShieldCheck,
} from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { ApiError } from "@/api/client.ts";
import { useStaffOrder } from "@/api/session.ts";
import { OrderItemsTable } from "@/features/tracking/order-items-table.tsx";
import { OrderManifestCard } from "@/features/tracking/order-manifest-card.tsx";
import { formatCurrency, onlyDigits } from "@/lib/format.ts";
import { STAFF_HOME_PATH, staffOrderHref, trackingHref } from "@/lib/router.ts";
import { parseOrderId } from "@/lib/url-state.ts";
import { Link, navigate } from "@/lib/use-location.tsx";
import { lastSearch } from "./last-search.ts";
import { formatPercent, formatSignedDays } from "./tower-format.ts";

/**
 * Rastreio do colaborador (`/colaborador/pedidos/:id`): o mesmo pedido do cliente, mais denso, com
 * a faixa "Visão do colaborador" e os blocos de diagnóstico do `StaffOrder`. Sem o chat do LogBot
 * (ferramenta interna). Tem o atalho "Ver como o cliente vê" (abre o rastreio público em outra
 * aba), útil para quem atende a central conferir exatamente a tela do cliente.
 */
export function StaffOrderPage({ orderParam }: { orderParam: string }) {
  const orderId = parseOrderId(orderParam);
  const query = useStaffOrder(orderId);

  let body: ReactNode;
  if (orderId === null || (query.error instanceof ApiError && query.error.status === 404)) {
    body = (
      <Notice>
        Pedido <span className="font-mono font-semibold">#{orderParam}</span> não encontrado.
        Confira o número.
      </Notice>
    );
  } else if (query.isPending) {
    body = (
      <Notice>
        <Loader2 aria-hidden="true" className="inline w-4 h-4 mr-2 animate-spin text-primary" />
        Carregando o pedido…
      </Notice>
    );
  } else if (query.isError || !query.data) {
    body = <Notice>Não foi possível carregar o pedido. Tente novamente.</Notice>;
  } else {
    body = <StaffOrderContent order={query.data} />;
  }

  return (
    <div className="mx-auto max-w-[1440px] px-6 py-5 space-y-4">
      <StaffBand orderParam={orderParam} orderId={orderId} />
      {body}
    </div>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <p
      role="status"
      className="bg-surface border border-slate-300/90 rounded-lg shadow-sm px-5 py-10 text-center text-sm text-slate-600"
    >
      {children}
    </p>
  );
}

/**
 * Faixa escura "Visão do colaborador": voltar à busca (se veio dela), voltar à Torre, abrir outro
 * pedido e ver como o cliente vê.
 */
function StaffBand({ orderParam, orderId }: { orderParam: string; orderId: number | null }) {
  const [value, setValue] = useState(orderParam);
  useEffect(() => setValue(orderParam), [orderParam]);
  // Veio da busca de pedidos nesta aba: oferece voltar a ela com os mesmos filtros.
  const backToSearch = lastSearch();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleaned = onlyDigits(value);
    if (cleaned) {
      navigate(staffOrderHref(Number(cleaned)));
    }
  }

  return (
    <div className="rounded-lg bg-band text-band-fg px-4 py-2.5 flex items-center gap-4 shadow-sm">
      <span className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-accent">
        <ShieldCheck aria-hidden="true" className="w-4 h-4" />
        Visão do colaborador
      </span>
      {backToSearch && (
        <Link
          href={backToSearch}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-white hover:text-accent rounded"
        >
          <ArrowLeft aria-hidden="true" className="w-4 h-4" />
          Voltar à busca
        </Link>
      )}
      <Link
        href={STAFF_HOME_PATH}
        className="inline-flex items-center gap-1.5 text-sm text-band-muted hover:text-white rounded"
      >
        {!backToSearch && <ArrowLeft aria-hidden="true" className="w-4 h-4" />}
        Torre de controle
      </Link>
      <form onSubmit={handleSubmit} className="ml-auto flex items-center gap-2" noValidate>
        <label htmlFor="staffOrderInput" className="text-xs text-slate-400">
          Abrir outro pedido
        </label>
        <div className="relative">
          <ScanBarcode
            aria-hidden="true"
            className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2"
          />
          <input
            id="staffOrderInput"
            inputMode="numeric"
            autoComplete="off"
            maxLength={10}
            value={value}
            onChange={(event) => setValue(onlyDigits(event.target.value))}
            className="w-32 h-8 rounded border border-band-line bg-band-field pl-8 pr-2 font-mono text-sm text-white focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
          />
        </div>
        <button
          type="submit"
          aria-label="Abrir pedido"
          className="h-8 w-8 rounded bg-accent text-slate-900 grid place-items-center hover:bg-accent-200"
        >
          <ArrowRight aria-hidden="true" className="w-4 h-4" />
        </button>
      </form>
      {orderId !== null && (
        <a
          href={trackingHref(orderId)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-band-muted hover:text-white rounded"
        >
          Ver como o cliente vê
          <ExternalLink aria-hidden="true" className="w-3.5 h-3.5" />
        </a>
      )}
    </div>
  );
}

function StaffOrderContent({ order }: { order: StaffOrder }) {
  const { dispatchDiagnosis: dispatch, transportDiagnosis: transport, context } = order;
  const maxStageDays = Math.max(1, ...order.stageDays.map((stage) => stage.days));

  return (
    <>
      <section
        aria-label="Diagnóstico do pedido"
        className="bg-surface border border-slate-300/90 rounded-lg shadow-sm"
      >
        <header className="px-5 py-3 border-b border-slate-200 flex items-center gap-3 flex-wrap">
          <h1 className="font-mono text-xl font-bold text-slate-900">#{order.orderId}</h1>
          <span className="text-sm text-slate-600">{order.status}</span>
          <Chip>{order.market}</Chip>
          <Chip title="Rota de serviço (rota_servico)">{order.routeService}</Chip>
          <span className="ml-auto text-sm text-slate-600">
            Valor em risco:{" "}
            <strong
              className={`font-mono tabular ${order.valueAtRisk === null ? "text-slate-400" : "text-red-700"}`}
            >
              {order.valueAtRisk === null ? "nenhum" : formatCurrency(order.valueAtRisk)}
            </strong>
          </span>
        </header>

        <div className="grid grid-cols-4 divide-x divide-slate-200">
          <Diag title="Despacho" origin={order.dataOrigin.dispatch}>
            <Pair label="Prometido" value={days(dispatch.promisedDays)} />
            <Pair
              label="Real"
              value={
                dispatch.daysToDispatch === null ? "não despachado" : days(dispatch.daysToDispatch)
              }
            />
            <Pair
              label="Atraso"
              value={formatSignedDays(dispatch.delayDays)}
              tone={(dispatch.delayDays ?? 0) > 0 ? "bad" : undefined}
            />
            <Pair
              label="Prazo sugerido"
              value={dispatch.suggestedDays === null ? "—" : days(dispatch.suggestedDays)}
            />
            <Pair
              label="Com o sugerido"
              value={
                dispatch.onTimeWithSuggested === null
                  ? "—"
                  : dispatch.onTimeWithSuggested
                    ? "estaria no prazo"
                    : "atrasaria"
              }
              tone={
                dispatch.onTimeWithSuggested === null
                  ? undefined
                  : dispatch.onTimeWithSuggested
                    ? "good"
                    : "bad"
              }
            />
          </Diag>

          <Diag title="Transporte" origin={order.dataOrigin.transport}>
            <Pair label="Trânsito padrão" value={nullableDays(transport.standardTransitDays)} />
            <Pair
              label="Trânsito real"
              value={
                transport.actualTransitDays === null
                  ? "não entregue"
                  : days(transport.actualTransitDays)
              }
            />
            <Pair
              label="Dias recuperados"
              value={formatSignedDays(transport.recoveredDays)}
              tone={
                transport.recoveredDays === null
                  ? undefined
                  : transport.recoveredDays >= 0
                    ? "good"
                    : "bad"
              }
            />
            <Pair label="Entrega" value={formatSignedDays(order.delivery.delayDays)} />
          </Diag>

          <Diag title="Dias em cada etapa" origin={order.dataOrigin.transport}>
            <ul className="space-y-1.5">
              {order.stageDays.map((stage) => (
                <li
                  key={stage.stage}
                  className="grid grid-cols-[86px_minmax(0,1fr)_44px] items-center gap-2 text-xs"
                >
                  <span className="text-slate-600 truncate">{stage.label}</span>
                  <span className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <span
                      className={`block h-full rounded-full ${stage.ongoing ? "bg-accent" : "bg-primary"}`}
                      style={{ width: `${(100 * stage.days) / maxStageDays}%` }}
                    />
                  </span>
                  <span className="font-mono tabular text-right text-slate-900">
                    {stage.days}d{stage.ongoing ? "+" : ""}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-slate-400">Contado por data; + = ainda na etapa.</p>
          </Diag>

          <Diag title="Contexto">
            <Pair
              label={`Despachos atrasados (${order.shippingMode})`}
              value={formatPercent(context.shippingMode.lateDispatchPct)}
            />
            <Pair
              label="Entregas atrasadas na rota"
              value={formatPercent(context.route.lateDeliveryPct)}
            />
            <div className="pt-2 mt-2 border-t border-slate-100">
              <p className="label-mono mb-1">Origem do dado</p>
              <ul className="flex flex-wrap gap-1.5">
                <OriginBadge label="Despacho" origin={order.dataOrigin.dispatch} />
                <OriginBadge label="Transporte" origin={order.dataOrigin.transport} />
                <OriginBadge label="Entrega" origin={order.dataOrigin.delivery} />
                <OriginBadge label="Extravio" origin={order.dataOrigin.loss} />
              </ul>
            </div>
          </Diag>
        </div>

        <div className="px-5 py-3 border-t border-slate-200 bg-amber-50/50">
          <p className="label-mono !text-amber-900 font-semibold">Causas nos termos da base</p>
          <p className="mt-0.5 text-sm text-slate-900">
            Despacho: <strong>{order.dispatch.probableCause ?? "sem atraso"}</strong>
            <span className="mx-2 text-amber-400">·</span>
            Entrega: <strong>{order.delivery.probableCause ?? "sem atraso"}</strong>
          </p>
          {order.explanation && <p className="mt-1 text-sm text-slate-700">{order.explanation}</p>}
        </div>

        <div className="px-5 py-3 border-t border-slate-200 grid grid-cols-2 gap-4">
          <Collapsible title="Resumo para a IA (resumo_pedido)" text={order.aiSummary} />
          <Collapsible title="Linha do tempo bruta (linha_do_tempo)" text={order.rawTimeline} />
        </div>
      </section>

      <div className="text-[13px] space-y-4">
        <OrderManifestCard order={order} />
        <OrderItemsTable items={order.items} total={order.total} />
      </div>
    </>
  );
}

function days(value: number): string {
  return value === 0 ? "mesmo dia" : `${value} ${value === 1 ? "dia" : "dias"}`;
}

function nullableDays(value: number | null): string {
  return value === null ? "—" : days(value);
}

function Chip({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className="inline-flex rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] text-slate-600"
    >
      {children}
    </span>
  );
}

function Diag({
  title,
  origin,
  children,
}: {
  title: string;
  origin?: DataOrigin;
  children: ReactNode;
}) {
  return (
    <div className="px-4 py-3 min-w-0">
      <div className="flex items-center gap-2 mb-2">
        <h2 className="label-mono !text-slate-700 font-semibold">{title}</h2>
        {origin && <OriginTag origin={origin} />}
      </div>
      <dl className="space-y-1">{children}</dl>
    </div>
  );
}

function Pair({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd
        className={`font-mono tabular text-right ${
          tone === "bad"
            ? "font-semibold text-red-700"
            : tone === "good"
              ? "text-emerald-700"
              : "text-slate-900"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function OriginTag({ origin }: { origin: DataOrigin }) {
  return origin === "real" ? (
    <span className="rounded border border-emerald-200 bg-emerald-50 px-1 font-mono text-[9.5px] uppercase tracking-wider text-emerald-700">
      real
    </span>
  ) : (
    <span className="inline-flex items-center gap-0.5 rounded border border-violet-200 bg-violet-50 px-1 font-mono text-[9.5px] uppercase tracking-wider text-violet-700">
      <FlaskConical aria-hidden="true" className="w-2.5 h-2.5" />
      simulado
    </span>
  );
}

function OriginBadge({ label, origin }: { label: string; origin: DataOrigin }) {
  return (
    <li className="inline-flex items-center gap-1 text-xs text-slate-600">
      {label}
      <OriginTag origin={origin} />
    </li>
  );
}

function Collapsible({ title, text }: { title: string; text: string | null }) {
  return (
    <details className="group rounded border border-slate-200 bg-slate-50/60">
      <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-slate-700 rounded">
        {title}
      </summary>
      <pre className="px-3 pb-3 max-h-64 overflow-auto scroll-thin whitespace-pre-wrap font-mono text-[11.5px] leading-relaxed text-slate-700">
        {text ?? "Sem texto na base para este pedido."}
      </pre>
    </details>
  );
}
