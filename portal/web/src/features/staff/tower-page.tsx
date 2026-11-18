import type { StageCount, TowerResponse } from "@translog/contracts";
import { ArrowUpRight, ChartNoAxesColumn, FlaskConical, Loader2, RotateCcw } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTower } from "@/api/session.ts";
import { formatDate } from "@/lib/format.ts";
import { staffOrderHref } from "@/lib/router.ts";
import { Link, navigate } from "@/lib/use-location.tsx";
import {
  filterByStage,
  formatInt,
  formatPercent,
  routeLabel,
  STAGE_FILTERS,
} from "./tower-format.ts";

const ATTENTION_ROWS = 12;

/** Torre de controle (`/colaborador`): indicadores, fila de atenção e números por modalidade, etapa e rota. */
export function TowerPage() {
  const tower = useTower();

  if (tower.isPending) {
    return (
      <StaffShell>
        <p role="status" className="py-16 text-center text-sm text-slate-500">
          <Loader2 aria-hidden="true" className="inline w-4 h-4 mr-2 animate-spin text-primary" />
          Carregando a Torre de controle…
        </p>
      </StaffShell>
    );
  }
  if (tower.isError || !tower.data) {
    return (
      <StaffShell>
        <div className="py-16 text-center text-sm text-slate-600 space-y-3">
          <p>Não foi possível carregar a Torre de controle.</p>
          <button
            type="button"
            onClick={() => void tower.refetch()}
            className="h-9 px-3.5 rounded-md border border-slate-300 bg-surface text-sm font-medium inline-flex items-center gap-2 hover:bg-slate-50"
          >
            <RotateCcw aria-hidden="true" className="w-4 h-4" />
            Tentar novamente
          </button>
        </div>
      </StaffShell>
    );
  }
  return <TowerContent data={tower.data} />;
}

function StaffShell({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-[1440px] px-6 py-5 space-y-4">{children}</div>;
}

function TowerContent({ data }: { data: TowerResponse }) {
  const { indicators } = data;
  return (
    <StaffShell>
      <header className="bg-surface border border-slate-300/90 rounded-lg shadow-sm px-5 py-4 flex items-center gap-4">
        <div>
          <p className="label-mono">Área do colaborador</p>
          <h1 className="text-[22px] font-bold tracking-tight text-slate-900">Torre de controle</h1>
          <p className="text-sm text-slate-600">
            Situação em {formatDate(data.referenceDate)} (data de referência da base) ·{" "}
            {formatInt(data.totalOrders)} pedidos
          </p>
        </div>
        <DashboardLink url={data.dashboardUrl} />
      </header>

      <section aria-label="Indicadores" className="grid grid-cols-5 gap-3">
        <Indicator
          tone="danger"
          label="Despachos no prazo"
          value={formatPercent(indicators.dispatchOnTime.pct)}
          detail={`${formatInt(indicators.dispatchOnTime.onTime)} de ${formatInt(indicators.dispatchOnTime.total)} despachados`}
        />
        <Indicator
          tone="accent"
          label="Entregas no prazo"
          value={formatPercent(indicators.deliveryOnTime.pct)}
          detail={`${formatInt(indicators.deliveryOnTime.onTime)} de ${formatInt(indicators.deliveryOnTime.total)} avaliadas`}
        />
        <Indicator
          tone="primary"
          label="Em trânsito agora"
          value={formatInt(indicators.inTransit.total)}
          detail={`${formatInt(indicators.inTransit.late)} atrasados · ${formatInt(indicators.inTransit.lateForSupport)} com 3+ dias`}
        />
        <Indicator
          tone="accent"
          label="Encaminhados à central"
          value={formatInt(indicators.escalatedToSupport)}
          detail="atraso de 3+ dias ou extravio"
        />
        <Indicator
          tone="danger"
          label="Extravios"
          value={formatInt(indicators.lost)}
          detail="rastreio simulado"
        />
      </section>

      <AttentionTable data={data} />

      <PromiseTable data={data} />

      <div className="grid grid-cols-3 gap-4">
        <StageBars
          title="Em trânsito por etapa"
          subtitle="Onde estão os pedidos que ainda não chegaram."
          counts={data.inTransitByStage}
          barClass="bg-primary"
        />
        <StageBars
          title="Extravios por etapa"
          subtitle="Etapa em que o volume foi extraviado."
          counts={data.lostByStage}
          barClass="bg-red-500"
          simulated
        />
        <Block
          title="Rotas com mais atraso"
          subtitle="Entregas atrasadas (rotas com 300+ entregas)."
        >
          <ol className="space-y-1.5">
            {data.lateRoutes.map((route) => (
              <li key={route.routeService} className="flex items-baseline gap-3 text-sm">
                <span className="flex-1 min-w-0 truncate text-slate-700" title={route.routeService}>
                  {route.routeService}
                </span>
                <span className="font-mono tabular text-xs text-slate-400">
                  {formatInt(route.evaluatedDeliveries)}
                </span>
                <span className="font-mono tabular text-sm font-semibold text-red-700 w-14 text-right">
                  {formatPercent(route.lateDeliveryPct)}
                </span>
              </li>
            ))}
            {data.lateRoutes.length === 0 && (
              <li className="text-sm text-slate-500">Nenhuma rota com 300 entregas ou mais.</li>
            )}
          </ol>
        </Block>
      </div>
    </StaffShell>
  );
}

/** "Painel completo de performance": link do `DASHBOARD_URL`, ou "link a definir" desabilitado. */
function DashboardLink({ url }: { url: string | null }) {
  if (url === null) {
    return (
      <span
        aria-disabled="true"
        title="O link do painel ainda não foi definido"
        className="ml-auto h-9 px-3.5 rounded-md border border-dashed border-slate-300 text-sm text-slate-400 inline-flex items-center gap-2 cursor-not-allowed"
      >
        <ChartNoAxesColumn aria-hidden="true" className="w-4 h-4" />
        Painel completo de performance · link a definir
      </span>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="ml-auto h-9 px-3.5 rounded-md border border-slate-300 bg-surface text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-primary inline-flex items-center gap-2 transition"
    >
      <ChartNoAxesColumn aria-hidden="true" className="w-4 h-4" />
      Painel completo de performance
      <ArrowUpRight aria-hidden="true" className="w-3.5 h-3.5" />
    </a>
  );
}

const TONE_TOP: Record<"danger" | "accent" | "primary", string> = {
  danger: "border-t-red-500",
  accent: "border-t-accent",
  primary: "border-t-primary",
};

function Indicator({
  tone,
  label,
  value,
  detail,
}: {
  tone: keyof typeof TONE_TOP;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div
      className={`bg-surface border border-slate-300/90 border-t-[3px] ${TONE_TOP[tone]} rounded-lg shadow-sm px-4 py-3`}
    >
      <p className="label-mono">{label}</p>
      <p className="mt-1 text-[28px] leading-none font-bold tracking-tight text-slate-900 tabular">
        {value}
      </p>
      <p className="mt-1.5 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

function Block({
  title,
  subtitle,
  aside,
  children,
}: {
  title: string;
  subtitle: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="bg-surface border border-slate-300/90 rounded-lg shadow-sm px-5 py-4 min-w-0">
      <div className="flex items-start gap-4 mb-3">
        <div className="flex-1 min-w-0">
          <h2 className="text-[15px] font-semibold text-slate-900">{title}</h2>
          <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

function SimulatedBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-violet-700">
      <FlaskConical aria-hidden="true" className="w-3 h-3" />
      Rastreio simulado
    </span>
  );
}

function AttentionTable({ data }: { data: TowerResponse }) {
  const [stage, setStage] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);
  const rows = filterByStage(data.attention, stage);
  const visible = showAll ? rows : rows.slice(0, ATTENTION_ROWS);

  return (
    <Block
      title="Pedidos que precisam de atenção"
      subtitle="Em trânsito, com mais atraso na entrega primeiro. Clique ou tecle Enter para abrir a visão do colaborador."
      aside={
        <fieldset className="flex flex-wrap gap-1.5">
          <legend className="sr-only">Filtrar por etapa</legend>
          {STAGE_FILTERS.map((filter) => {
            const active = filter.stage === stage;
            return (
              <button
                key={filter.label}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setStage(filter.stage);
                  setShowAll(false);
                }}
                className={`h-7 px-2.5 rounded border font-mono text-xs transition ${
                  active
                    ? "border-primary bg-primary text-white font-semibold"
                    : "border-slate-300 bg-surface text-slate-700 hover:border-primary-200 hover:bg-primary-50 hover:text-primary"
                }`}
              >
                {filter.label}
              </button>
            );
          })}
        </fieldset>
      }
    >
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b border-slate-200">
            <Th>Pedido</Th>
            <Th>Rota</Th>
            <Th>Modalidade</Th>
            <Th>Etapa · local atual</Th>
            <Th className="text-right">Atraso</Th>
            <Th>Motivo provável</Th>
          </tr>
        </thead>
        <tbody>
          {visible.map((order) => (
            <tr
              key={order.orderId}
              onClick={() => navigate(staffOrderHref(order.orderId))}
              className="border-b border-slate-100 last:border-0 hover:bg-primary-50/60 cursor-pointer"
            >
              <td className="py-2 pr-3">
                <Link
                  href={staffOrderHref(order.orderId)}
                  onClick={(event) => event.stopPropagation()}
                  className="font-mono font-semibold text-slate-900 hover:text-primary rounded"
                >
                  #{order.orderId}
                </Link>
              </td>
              <td className="py-2 pr-3 text-slate-700">
                {routeLabel(order.origin, order.destination)}
              </td>
              <td className="py-2 pr-3 text-slate-700 whitespace-nowrap">{order.shippingMode}</td>
              <td className="py-2 pr-3 text-slate-700">
                {order.stage && (
                  <span className="mr-2 inline-flex rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] text-slate-600">
                    {order.stage.label}
                  </span>
                )}
                {order.location}
              </td>
              <td className="py-2 pr-3 text-right">
                <DelayBadge days={order.delayDays} />
              </td>
              <td className="py-2 text-slate-700">{order.probableCause ?? "—"}</td>
            </tr>
          ))}
          {visible.length === 0 && (
            <tr>
              <td colSpan={6} className="py-6 text-center text-sm text-slate-500">
                Nenhum pedido em trânsito nesta etapa.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {rows.length > ATTENTION_ROWS && (
        <button
          type="button"
          onClick={() => setShowAll((value) => !value)}
          className="mt-3 text-sm font-medium text-primary hover:underline underline-offset-4 rounded"
        >
          {showAll ? "Mostrar menos" : `Mostrar todos (${formatInt(rows.length)})`}
        </button>
      )}
    </Block>
  );
}

function Th({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <th className={`label-mono pb-2 pr-3 font-medium ${className}`}>{children}</th>;
}

function DelayBadge({ days }: { days: number | null }) {
  if (days === null || days <= 0) {
    return <span className="font-mono text-xs text-slate-400">no prazo</span>;
  }
  const strong = days >= 6;
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded border px-1.5 py-0.5 font-mono text-xs font-semibold tabular ${
        strong
          ? "border-red-300 bg-red-50 text-red-700"
          : "border-amber-300 bg-amber-50 text-amber-800"
      }`}
    >
      +{days} {days === 1 ? "dia" : "dias"}
    </span>
  );
}

function PromiseTable({ data }: { data: TowerResponse }) {
  return (
    <Block
      title="Promessa × realidade por modalidade"
      subtitle='Prazo prometido, quanto atrasou e o prazo sugerido pela "Promessa ajustada" (cenário da Gold, param_cenario_prazo).'
    >
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b border-slate-200">
            <Th>Modalidade</Th>
            <Th className="text-right">Prazo prometido</Th>
            <Th className="text-right">Despachos</Th>
            <Th className="text-right">Despachos atrasados</Th>
            <Th className="text-right">Entregas atrasadas</Th>
            <Th className="text-right">Prazo sugerido</Th>
            <Th className="text-right">Atrasados com o sugerido</Th>
          </tr>
        </thead>
        <tbody>
          {data.promiseByMode.map((mode) => (
            <tr key={mode.shippingMode} className="border-b border-slate-100 last:border-0">
              <td className="py-2 pr-3 font-medium text-slate-900">{mode.shippingMode}</td>
              <Num>{days(mode.promisedDays)}</Num>
              <Num>{formatInt(mode.dispatchedOrders)}</Num>
              <Num strong={(mode.lateDispatchPct ?? 0) >= 50}>
                {formatPercent(mode.lateDispatchPct)}
              </Num>
              <Num>{formatPercent(mode.lateDeliveryPct)}</Num>
              <Num>{mode.suggestedDays === null ? "—" : days(mode.suggestedDays)}</Num>
              <Num good>{formatPercent(mode.lateDispatchPctWithSuggested)}</Num>
            </tr>
          ))}
        </tbody>
      </table>
    </Block>
  );
}

function days(value: number): string {
  return value === 0 ? "mesmo dia" : `${value} ${value === 1 ? "dia" : "dias"}`;
}

function Num({
  children,
  strong = false,
  good = false,
}: {
  children: ReactNode;
  strong?: boolean;
  good?: boolean;
}) {
  return (
    <td
      className={`py-2 pr-3 text-right font-mono tabular ${
        strong ? "font-semibold text-red-700" : good ? "text-emerald-700" : "text-slate-700"
      }`}
    >
      {children}
    </td>
  );
}

function StageBars({
  title,
  subtitle,
  counts,
  barClass,
  simulated = false,
}: {
  title: string;
  subtitle: string;
  counts: readonly StageCount[];
  barClass: string;
  simulated?: boolean;
}) {
  const max = Math.max(1, ...counts.map((item) => item.count));
  return (
    <Block title={title} subtitle={subtitle} aside={simulated ? <SimulatedBadge /> : undefined}>
      <ul className="space-y-2">
        {counts.map((item) => (
          <li
            key={item.stage}
            className="grid grid-cols-[92px_minmax(0,1fr)_56px] items-center gap-3"
          >
            <span className="text-sm text-slate-700">{item.label}</span>
            <span className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
              <span
                className={`block h-full rounded-full ${barClass}`}
                style={{ width: `${(100 * item.count) / max}%` }}
              />
            </span>
            <span className="font-mono tabular text-sm text-right text-slate-900">
              {formatInt(item.count)}
            </span>
          </li>
        ))}
        {counts.length === 0 && <li className="text-sm text-slate-500">Nenhum pedido.</li>}
      </ul>
    </Block>
  );
}
