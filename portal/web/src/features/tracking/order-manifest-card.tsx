import type { Order } from "@translog/contracts";
import {
  Ban,
  Check,
  Clock,
  Copy,
  Headset,
  MapPin,
  MapPinCheck,
  PackageX,
  Plane,
  Truck,
} from "lucide-react";
import { useEffect, useState } from "react";
import { formatDate, formatManifestCode, splitPlace } from "@/lib/format.ts";
import { DeadlinesBlock } from "./deadlines-block.tsx";
import {
  type DeadlineStatus,
  deliveryDeadline,
  deliveryDelay,
  endedBeforeDispatch,
  isDelivered,
  STATUS_TONE,
  type StatusTone,
  SUPPORT_HOURS,
  statusHeadline,
  supportReason,
} from "./order-status.ts";
import { StageTimelineView } from "./stage-timeline-view.tsx";

interface OrderManifestCardProps {
  order: Order;
  onAskAssistant: (question: string) => void;
}

const TONE_BADGE: Record<StatusTone, { cls: string; dot: string }> = {
  success: { cls: "bg-emerald-50 text-emerald-800 border-emerald-300", dot: "bg-emerald-600" },
  transit: { cls: "bg-primary-50 text-primary border-primary-200", dot: "bg-primary" },
  danger: { cls: "bg-red-50 text-red-700 border-red-300", dot: "bg-red-600" },
  waiting: { cls: "bg-amber-50 text-amber-800 border-amber-300", dot: "bg-amber-500" },
  neutral: { cls: "bg-slate-100 text-slate-700 border-slate-300", dot: "bg-slate-400" },
};

const DEADLINE_BADGE: Record<DeadlineStatus, string> = {
  Atrasado: "bg-red-50 text-red-700 border-red-300",
  "No Prazo": "bg-emerald-50/70 text-emerald-800 border-emerald-300",
  Adiantado: "bg-emerald-50/70 text-emerald-800 border-emerald-300",
};

function accentClass(order: Order): string {
  if (endedBeforeDispatch(order)) return "bg-slate-400";
  if (order.status === "Extraviado" || deliveryDelay(order) !== null) return "bg-red-600";
  if (order.status === "Aguardando pagamento") return "bg-accent";
  if (isDelivered(order)) return "bg-emerald-600";
  return "bg-primary";
}

export function OrderManifestCard({ order, onAskAssistant }: OrderManifestCardProps) {
  const [copiedCode, setCopiedCode] = useState(false);

  useEffect(() => {
    if (!copiedCode) return;
    const t = setTimeout(() => setCopiedCode(false), 1800);
    return () => clearTimeout(t);
  }, [copiedCode]);

  const manifestCode = formatManifestCode(order);

  async function handleCopyManifest() {
    try {
      await navigator.clipboard.writeText(manifestCode);
      setCopiedCode(true);
    } catch {
      setCopiedCode(false);
    }
  }

  const badge = TONE_BADGE[STATUS_TONE[order.status]];
  const deadline = deliveryDeadline(order);
  const headline = statusHeadline(order);
  const reason = supportReason(order);
  const orig = splitPlace(order.origin);
  const dest = splitPlace(order.destination);
  const RouteIcon = order.transportMode === "Rodoviário" ? Truck : Plane;

  return (
    <article className="bg-white border border-slate-300/90 rounded-lg shadow-sm overflow-hidden fade-in">
      <div className={`h-[3px] w-full ${accentClass(order)}`} />
      {/* Topo de Guia de Remessa */}
      <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="label-mono">Pedido nº</span>
          <h2 className="font-mono text-2xl font-bold tracking-tight text-slate-900 tabular">
            #{order.orderId}
          </h2>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${badge.cls}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
              {order.status}
            </span>
            {deadline && (
              <span
                className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${DEADLINE_BADGE[deadline]}`}
              >
                <Clock className="w-3 h-3" />
                {deadline}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 font-mono text-[11px] text-slate-500">
          <span>Pedido em {formatDate(order.orderDate)}</span>
          <button
            type="button"
            onClick={() => void handleCopyManifest()}
            title="Copiar código da guia de remessa"
            className="px-2.5 py-1 rounded border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900 inline-flex items-center gap-1.5 transition"
          >
            <span>{manifestCode}</span>
            {copiedCode ? (
              <Check className="w-3 h-3 text-emerald-600" />
            ) : (
              <Copy className="w-3 h-3 text-slate-400" />
            )}
          </button>
        </div>
      </div>

      {/* Resposta principal + onde está agora */}
      <div className="px-5 pt-4 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4 items-start">
        <div className="min-w-0">
          <p className="text-[22px] leading-tight font-semibold text-slate-900">{headline.title}</p>
          <p className="mt-1 text-sm text-slate-600">{headline.detail}</p>
        </div>
        <WhereNow order={order} />
      </div>

      {reason && (
        <div className="mx-5 mt-4 flex items-start gap-3 rounded-md border border-primary-200 bg-primary-50/70 px-4 py-3">
          <Headset className="w-5 h-5 text-primary shrink-0 mt-0.5" aria-hidden="true" />
          <div className="text-sm">
            <p className="font-semibold text-slate-900">Encaminhado à central de atendimento</p>
            <p className="text-slate-700">
              Como {reason}, este pedido é acompanhado pela nossa central de atendimento, que
              funciona de <strong className="font-semibold">{SUPPORT_HOURS}</strong>.
            </p>
          </div>
        </div>
      )}

      <div className="p-5 space-y-4">
        {endedBeforeDispatch(order) ? (
          <div className="flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs">
            <Ban className="w-4 h-4 text-slate-500 shrink-0" />
            <span>
              <span className="font-semibold text-slate-800">Sem despacho nem entrega.</span>
              <span className="text-slate-500 ml-1">
                Em caso de dúvida, pergunte ao assistente ao lado.
              </span>
            </span>
          </div>
        ) : (
          <DeadlinesBlock order={order} onAskAssistant={onAskAssistant} />
        )}

        {/* Cabeçalho de Rota */}
        <div className="rounded-md border border-slate-200 bg-slate-50/70 px-4 py-3">
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4">
            <div className="min-w-0">
              <p className="label-mono flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full border-2 border-primary bg-white shrink-0" />
                De · Origem
              </p>
              <p className="mt-0.5 text-base font-bold text-slate-900 leading-tight truncate">
                {orig.city}
              </p>
              <p className="text-xs text-slate-500 truncate">{orig.rest}</p>
            </div>

            <div className="flex flex-col items-center justify-center px-2 min-w-[200px]">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-xs text-slate-500 whitespace-nowrap">{order.region}</span>
              </div>
              <div className="w-full flex items-center gap-2">
                <div className="flex-1 route-line" />
                <RouteIcon className="w-3.5 h-3.5 text-primary shrink-0" />
                <div className="flex-1 route-line" />
              </div>
              <span className="mt-1 font-mono text-[10px] uppercase tracking-wider text-slate-400 whitespace-nowrap">
                {order.shippingMode} · {order.transportMode ?? "Sem despacho"} · {order.routeType}
              </span>
            </div>

            <div className="text-right min-w-0">
              <p className="label-mono flex items-center justify-end gap-1.5">
                Para · Destino
                <span className="w-2 h-2 rounded-full bg-accent shrink-0" />
              </p>
              <p className="mt-0.5 text-base font-bold text-slate-900 leading-tight truncate">
                {dest.city}
              </p>
              <p className="text-xs text-slate-500 truncate">{dest.rest}</p>
            </div>
          </div>
        </div>

        <StageTimelineView order={order} />
      </div>
    </article>
  );
}

/** "Onde está agora" (em trânsito), "Último local conhecido" (extravio) ou o local da entrega. */
function WhereNow({ order }: { order: Order }) {
  if (!order.currentLocation) {
    return null;
  }
  const since = formatDate(order.events.at(-1)?.date);
  if (order.status === "Extraviado") {
    return (
      <Spot
        tone="danger"
        icon={<PackageX className="w-5 h-5" />}
        label={`Extraviado na etapa ${order.lostAtStage?.label ?? "—"}`}
        place={order.currentLocation}
        note={`Extravio confirmado em ${since}`}
      />
    );
  }
  if (isDelivered(order)) {
    return (
      <Spot
        tone="success"
        icon={<MapPinCheck className="w-5 h-5" />}
        label="Local da entrega"
        place={order.currentLocation}
        note={`Em ${formatDate(order.delivery.actualDate)}`}
      />
    );
  }
  const delayed = deliveryDelay(order) !== null;
  return (
    <Spot
      tone={delayed ? "danger" : "transit"}
      icon={<MapPin className="w-5 h-5" />}
      label={`Onde está agora · ${order.currentStage?.label ?? ""}`}
      place={order.currentLocation}
      note={`Desde ${since}`}
    />
  );
}

const SPOT_STYLE: Record<"danger" | "success" | "transit", { box: string; icon: string }> = {
  danger: { box: "border-red-300 bg-red-50/70", icon: "bg-red-600 text-white" },
  success: { box: "border-emerald-300 bg-emerald-50/60", icon: "bg-emerald-600 text-white" },
  transit: { box: "border-primary-200 bg-primary-50/70", icon: "bg-primary text-white" },
};

function Spot({
  tone,
  icon,
  label,
  place,
  note,
}: {
  tone: keyof typeof SPOT_STYLE;
  icon: React.ReactNode;
  label: string;
  place: string;
  note: string;
}) {
  const style = SPOT_STYLE[tone];
  return (
    <div className={`flex items-center gap-3 rounded-md border px-3.5 py-2.5 min-w-0 ${style.box}`}>
      <div className={`w-9 h-9 shrink-0 rounded grid place-items-center ${style.icon}`}>{icon}</div>
      <div className="min-w-0">
        <p className="label-mono !text-slate-700 font-semibold truncate">{label}</p>
        <p className="text-[15px] font-semibold text-slate-900 leading-snug">{place}</p>
        <p className="font-mono text-[11px] text-slate-500 tabular">{note}</p>
      </div>
    </div>
  );
}
