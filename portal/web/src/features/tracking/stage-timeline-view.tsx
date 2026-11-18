import type { Order } from "@translog/contracts";
import {
  Check,
  FileCheck2,
  type LucideIcon,
  PackageCheck,
  PackageX,
  Plane,
  ShieldCheck,
  Truck,
  Warehouse,
} from "lucide-react";
import { formatDate, pluralize } from "@/lib/format.ts";
import { deliveryDelay } from "./order-status.ts";
import { buildStageTimeline, type StageState, type StageView } from "./stage-timeline.ts";

const STAGE_ICONS: Record<number, LucideIcon> = {
  0: FileCheck2,
  1: PackageCheck,
  2: Plane,
  3: ShieldCheck,
  4: Warehouse,
  5: Truck,
};

/** Quadrado do ícone e selo de cada estado. */
const STATE_STYLE: Record<StageState, { box: string; chip: string; chipText: string }> = {
  done: {
    box: "bg-ink text-ink-fg",
    chip: "text-slate-500",
    chipText: "Concluída",
  },
  current: {
    box: "bg-primary text-white ring-4 ring-primary-100",
    chip: "bg-primary-50 text-primary border border-primary-200",
    chipText: "Agora",
  },
  delayed: {
    box: "bg-red-600 text-white ring-4 ring-red-100",
    chip: "bg-red-50 text-red-700 border border-red-300",
    chipText: "Agora · com atraso",
  },
  lost: {
    box: "bg-red-600 text-white ring-4 ring-red-100",
    chip: "bg-red-50 text-red-700 border border-red-300",
    chipText: "Extraviado aqui",
  },
  pending: {
    box: "border-2 border-dashed border-slate-300 bg-surface text-slate-300",
    chip: "text-slate-400",
    chipText: "Aguardando",
  },
  not_reached: {
    box: "border-2 border-dashed border-slate-200 bg-slate-50 text-slate-300",
    chip: "text-slate-400",
    chipText: "Não alcançada",
  },
};

const ACTIVE: ReadonlySet<StageState> = new Set(["current", "delayed", "lost"]);

interface StageTimelineViewProps {
  order: Order;
}

/**
 * Linha do tempo por etapas (Pedido, Coleta, Voo, Alfândega, Transferência, Última milha), com os
 * eventos de cada uma. Etapas que a rota não tem não aparecem.
 */
export function StageTimelineView({ order }: StageTimelineViewProps) {
  const stages = buildStageTimeline(order);
  const delay = deliveryDelay(order);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="label-mono">
          Linha do tempo · {pluralize(stages.length, "etapa", "etapas")}
        </span>
        <span className="font-mono text-[11px] text-slate-400">
          Situação em {formatDate(order.referenceDate)}
        </span>
      </div>
      <ol>
        {stages.map((stage, index) => (
          <StageRow
            key={stage.number}
            stage={stage}
            next={stages[index + 1]?.state ?? null}
            delay={stage.state === "delayed" ? delay : null}
          />
        ))}
      </ol>
    </div>
  );
}

function StageRow({
  stage,
  next,
  delay,
}: {
  stage: StageView;
  /** Estado da etapa seguinte (`null` na última): o conector é sólido se ela já foi alcançada. */
  next: StageState | null;
  delay: number | null;
}) {
  const style = STATE_STYLE[stage.state];
  const Icon = stage.state === "lost" ? PackageX : (STAGE_ICONS[stage.number] ?? Check);
  const active = ACTIVE.has(stage.state);
  const reached = stage.state === "done" || active;

  return (
    <li className="relative flex gap-3.5 pb-4 last:pb-0">
      {next !== null && (
        <div
          className={`absolute left-[13px] top-8 bottom-0 ${
            next === "done" || ACTIVE.has(next)
              ? "w-0.5 bg-slate-800"
              : "border-l-2 border-dashed border-slate-300"
          }`}
        />
      )}
      <div
        className={`relative z-10 w-7 h-7 shrink-0 rounded grid place-items-center ${style.box}`}
        aria-hidden="true"
      >
        <Icon className="w-3.5 h-3.5" />
      </div>
      <div
        className={`flex-1 min-w-0 ${
          active
            ? `rounded-md border px-3 py-2 -mt-1 ${
                stage.state === "current"
                  ? "border-primary-200 bg-primary-50/50"
                  : "border-red-200 bg-red-50/50"
              }`
            : "pt-1"
        }`}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <p
            className={`text-sm ${
              reached ? "font-semibold text-slate-900" : "font-medium text-slate-400"
            }`}
          >
            {stage.label}
          </p>
          <span
            className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider font-semibold ${style.chip}`}
          >
            {style.chipText}
            {delay !== null && ` (+${pluralize(delay, "dia", "dias")})`}
          </span>
        </div>
        {stage.events.length > 0 && (
          <ul className="mt-1.5 space-y-1">
            {stage.events.map((event) => (
              <li
                key={`${event.date}-${event.code}-${event.location ?? ""}`}
                className="grid grid-cols-[84px_minmax(0,1fr)] gap-2 text-xs"
              >
                <span className="font-mono tabular text-slate-500 pt-px">
                  {formatDate(event.date)}
                </span>
                <span className="min-w-0">
                  <span
                    className={`font-medium ${
                      event.code === "EXTRAVIO_CONFIRMADO" ? "text-red-700" : "text-slate-800"
                    }`}
                  >
                    {event.description}
                  </span>
                  {event.location && (
                    <span className="block text-slate-500 truncate" title={event.location}>
                      {event.location}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}
