import type { DeadlineStatus, Order } from "@translog/contracts";
import {
  Ban,
  Check,
  Clock,
  Copy,
  FileCheck2,
  MapPinCheck,
  MessageSquareMore,
  PackageCheck,
  Plane,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  formatCurrency,
  formatDate,
  formatManifestCode,
  pluralize,
  SHIPPING_MODE_SLA,
  splitPlace,
} from "@/lib/format.ts";
import {
  buildTimelineSteps,
  getDisplayTrackingStatus,
  type ReleaseLabelMode,
  type TimelineStepView,
} from "./timeline.ts";

interface OrderManifestCardProps {
  order: Order;
  releaseLabel: ReleaseLabelMode;
  onAskAssistant: (question: string) => void;
}

const STATUS_BADGE_STYLE: Record<string, { cls: string; dot: string }> = {
  Entregue: {
    cls: "bg-emerald-50 text-emerald-800 border-emerald-300",
    dot: "bg-emerald-600",
  },
  "Em Trânsito": {
    cls: "bg-primary-50 text-primary border-primary-200",
    dot: "bg-primary",
  },
  "Aguardando Liberação": {
    cls: "bg-amber-50 text-amber-800 border-amber-300",
    dot: "bg-amber-500",
  },
  "Pagamento não processado": {
    cls: "bg-amber-50 text-amber-800 border-amber-300",
    dot: "bg-amber-500",
  },
  Cancelado: {
    cls: "bg-slate-100 text-slate-700 border-slate-300",
    dot: "bg-slate-400",
  },
};

const DEADLINE_BADGE_STYLE: Partial<Record<DeadlineStatus, string>> = {
  Atrasado: "bg-red-50 text-red-700 border-red-300",
  "No Prazo": "bg-emerald-50/70 text-emerald-800 border-emerald-300",
  Adiantado: "bg-emerald-50/70 text-emerald-800 border-emerald-300",
};

function StepIcon({ stepKey }: { stepKey: TimelineStepView["key"] }) {
  switch (stepKey) {
    case "placed":
      return <FileCheck2 className="w-3.5 h-3.5" />;
    case "released":
      return <PackageCheck className="w-3.5 h-3.5" />;
    case "in_transit":
      return <Plane className="w-3.5 h-3.5" />;
    case "delivered":
      return <MapPinCheck className="w-3.5 h-3.5" />;
  }
}

function getCardAccentClass(order: Order): string {
  if (order.trackingStatus === "Cancelado") return "bg-slate-400";
  if (order.deadlineStatus === "Atrasado") return "bg-red-600";
  if (order.trackingStatus === "Aguardando Liberação") return "bg-accent";
  if (order.trackingStatus === "Entregue") return "bg-emerald-600";
  return "bg-primary";
}

export function OrderManifestCard({ order, releaseLabel, onAskAssistant }: OrderManifestCardProps) {
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

  const statusLabel = getDisplayTrackingStatus(order, releaseLabel);
  const statusStyle = STATUS_BADGE_STYLE[statusLabel] ?? STATUS_BADGE_STYLE.Cancelado;
  const deadlineCls = DEADLINE_BADGE_STYLE[order.deadlineStatus];
  const orig = splitPlace(order.origin);
  const dest = splitPlace(order.destination);
  const steps = buildTimelineSteps(order, releaseLabel);
  const isOrderDelayed =
    order.deadlineStatus === "Atrasado" && order.delayDays !== null && order.delayDays > 0;

  // Célula 1: Previsão / Entrega
  let mainLabel = "Previsão de entrega";
  let mainDate = formatDate(order.estimatedDeliveryDate);
  let mainSub = "Data estimada";

  if (order.trackingStatus === "Entregue") {
    mainLabel = "Entregue em";
    mainDate = formatDate(order.actualDeliveryDate);
    mainSub = `Previsto para ${formatDate(order.estimatedDeliveryDate)}`;
  } else if (order.trackingStatus === "Em Trânsito") {
    mainLabel = "Previsão de entrega";
    mainDate = formatDate(order.estimatedDeliveryDate);
    mainSub = isOrderDelayed ? "Prazo estimado excedido" : "Dentro da janela prevista";
  } else if (order.trackingStatus === "Aguardando Liberação") {
    mainLabel = "Previsão após liberação";
    mainDate = formatDate(order.estimatedDeliveryDate);
    mainSub =
      releaseLabel === "payment"
        ? "Aguardando confirmação de pagamento"
        : "Aguardando liberação do pedido";
  } else {
    mainLabel = "Situação final";
    mainDate = "Cancelado";
    mainSub = `Previsão original: ${formatDate(order.estimatedDeliveryDate)}`;
  }

  // Célula 2: Cumprimento do prazo
  let delayCellCls = "bg-white";
  let delayLabelColor = "";

  if (order.deadlineStatus === "Atrasado" && order.delayDays !== null && order.delayDays > 0) {
    delayCellCls = "bg-red-50/55";
    delayLabelColor = "!text-red-700";
  } else if (
    order.deadlineStatus === "Adiantado" &&
    order.delayDays !== null &&
    order.delayDays < 0
  ) {
    delayCellCls = "bg-emerald-50/40";
    delayLabelColor = "!text-emerald-800";
  } else if (order.deadlineStatus === "No Prazo") {
    delayCellCls = "bg-emerald-50/30";
    delayLabelColor = "!text-emerald-800";
  } else if (order.trackingStatus === "Aguardando Liberação") {
    delayCellCls = "bg-amber-50/35";
    delayLabelColor = "!text-amber-800";
  }

  return (
    <article className="bg-white border border-slate-300/90 rounded-lg shadow-sm overflow-hidden fade-in">
      <div className={`h-[3px] w-full ${getCardAccentClass(order)}`} />
      {/* Topo de Guia de Remessa */}
      <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="label-mono">Pedido nº</span>
          <h2 className="font-mono text-2xl font-bold tracking-tight text-slate-900 tabular">
            #{order.orderId}
          </h2>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${statusStyle?.cls ?? ""}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${statusStyle?.dot ?? ""}`} />
              {statusLabel}
            </span>
            {deadlineCls && (
              <span
                className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${deadlineCls}`}
              >
                <Clock className="w-3 h-3" />
                {order.deadlineStatus}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 font-mono text-[11px] text-slate-500">
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

      {/* Grade de Resposta Principal (4 colunas) */}
      <dl className="grid grid-cols-4 divide-x divide-slate-200 border-b border-slate-200">
        <div className="px-5 py-3.5">
          <dt className="label-mono">{mainLabel}</dt>
          <dd className="mt-1 font-mono text-[22px] leading-tight font-semibold text-slate-900 tabular">
            {mainDate}
          </dd>
          <dd className="mt-0.5 text-xs text-slate-500">{mainSub}</dd>
        </div>

        <div className={`px-5 py-3.5 ${delayCellCls}`}>
          <dt className={`label-mono ${delayLabelColor}`}>Cumprimento do prazo</dt>
          <dd className="mt-1 leading-tight">
            {order.deadlineStatus === "Atrasado" &&
            order.delayDays !== null &&
            order.delayDays > 0 ? (
              <span className="font-mono text-[22px] font-bold text-red-700 tabular">
                +{pluralize(order.delayDays, "dia", "dias")}
              </span>
            ) : order.deadlineStatus === "Adiantado" &&
              order.delayDays !== null &&
              order.delayDays < 0 ? (
              <span className="font-mono text-[22px] font-bold text-emerald-700 tabular">
                {pluralize(-order.delayDays, "dia", "dias")} antes
              </span>
            ) : order.deadlineStatus === "No Prazo" ? (
              <span className="text-[18px] font-semibold text-emerald-700">Dentro do prazo</span>
            ) : order.trackingStatus === "Aguardando Liberação" ? (
              <span className="text-[16px] font-semibold text-amber-900">
                {releaseLabel === "payment" ? "Pagamento pendente" : "Aguardando liberação"}
              </span>
            ) : (
              <span className="text-[16px] font-medium text-slate-500">Envio cancelado</span>
            )}
          </dd>
          <dd className="mt-0.5">
            {order.deadlineStatus === "Atrasado" &&
            order.delayDays !== null &&
            order.delayDays > 0 ? (
              <span className="text-xs font-medium text-red-700/90">
                {order.delayWindow || "Fora do prazo estimado"}
              </span>
            ) : order.deadlineStatus === "Adiantado" ? (
              <span className="text-xs text-emerald-800/80">{order.delayWindow}</span>
            ) : order.deadlineStatus === "No Prazo" ? (
              <span className="text-xs text-slate-500">Sem atraso registrado</span>
            ) : order.trackingStatus === "Aguardando Liberação" ? (
              <span className="text-xs text-slate-500">Prazo conta após expedição</span>
            ) : (
              <span className="text-xs text-slate-400">Sem entrega programada</span>
            )}
          </dd>
        </div>

        <div className="px-5 py-3.5">
          <dt className="label-mono">Modalidade contratada</dt>
          <dd className="mt-1 text-[16px] leading-tight font-semibold text-slate-900">
            {order.shippingMode}
          </dd>
          <dd className="mt-0.5 text-xs text-slate-500">{SHIPPING_MODE_SLA[order.shippingMode]}</dd>
        </div>

        <div className="px-5 py-3.5">
          <dt className="label-mono">Pedido realizado em</dt>
          <dd className="mt-1 font-mono text-[17px] leading-tight font-medium text-slate-900 tabular">
            {formatDate(order.orderDate)}
          </dd>
          <dd className="mt-0.5 text-xs text-slate-500 tabular">
            {pluralize(order.items.length, "item", "itens")} · {formatCurrency(order.total)}
          </dd>
        </div>
      </dl>

      {/* Alerta de Motivo Provável (quando houver) */}
      {order.probableCause && (
        <div className="mx-5 mt-4 flex items-stretch rounded-md border border-amber-300 bg-amber-50/80 shadow-[0_1px_2px_rgba(245,158,11,0.12)] overflow-hidden">
          <div
            className="w-11 shrink-0 bg-accent text-slate-900 grid place-items-center"
            aria-hidden="true"
          >
            <TriangleAlert className="w-5 h-5" />
          </div>
          <div className="flex-1 px-4 py-3 min-w-0">
            <div className="flex items-center gap-2">
              <span className="label-mono !text-amber-900 font-semibold">
                Motivo provável do atraso
              </span>
              <span className="text-amber-400">·</span>
              <span className="font-mono text-[11px] text-amber-800">
                Análise histórica da rota
              </span>
            </div>
            <p className="mt-0.5 text-base font-bold text-slate-900">{order.probableCause}</p>
            <p className="text-xs text-slate-600 mt-0.5">
              Quer entender melhor? O assistente explica por que esse é o motivo provável para a
              modalidade{" "}
              <strong className="font-medium text-slate-800">{order.shippingMode}</strong> nesta
              rota.
            </p>
          </div>
          <div className="px-4 py-3 grid place-items-center shrink-0">
            <button
              type="button"
              onClick={() => onAskAssistant(`Por que o pedido #${order.orderId} atrasou?`)}
              className="h-9 px-3.5 rounded-md bg-slate-900 text-xs font-semibold text-white shadow-sm hover:bg-primary inline-flex items-center gap-2 transition"
            >
              <MessageSquareMore className="w-4 h-4" />
              <span>Perguntar ao assistente</span>
            </button>
          </div>
        </div>
      )}

      {/* Bloco Integrado: Rota Internacional + Andamento em 4 Etapas */}
      <div className="p-5 space-y-4">
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

            <div className="flex flex-col items-center justify-center px-2 min-w-[180px]">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="rounded bg-white border border-slate-200 px-2 py-0.5 font-mono text-[10.5px] font-semibold text-slate-700">
                  {order.market}
                </span>
                <span className="text-xs text-slate-500 whitespace-nowrap">{order.region}</span>
              </div>
              <div className="w-full flex items-center gap-2">
                <div className="flex-1 route-line" />
                <Plane className="w-3.5 h-3.5 text-primary shrink-0" />
                <div className="flex-1 route-line" />
              </div>
              <span className="mt-1 font-mono text-[10px] uppercase tracking-wider text-slate-400">
                {order.shippingMode}
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

        {/* Linha do tempo */}
        {order.trackingStatus === "Cancelado" ? (
          <div className="pt-1 flex items-center gap-5">
            <div className="flex items-center gap-3 shrink-0">
              <div className="w-8 h-8 rounded bg-slate-800 text-white grid place-items-center">
                <Check className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Pedido realizado</p>
                <p className="font-mono text-xs text-slate-500 tabular">
                  {formatDate(order.orderDate)}
                </p>
              </div>
            </div>
            <div className="h-px w-8 border-t-2 border-dashed border-slate-300" />
            <div className="flex-1 flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50 px-4 py-2.5">
              <Ban className="w-4 h-4 text-slate-500 shrink-0" />
              <div className="text-xs">
                <span className="font-semibold text-slate-800">Este pedido foi cancelado.</span>
                <span className="text-slate-500 ml-1">
                  Ele não será liberado nem despachado. Em caso de dúvida, pergunte ao assistente ao
                  lado.
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="pt-1">
            <div className="flex items-center justify-between mb-3">
              <span className="label-mono">Andamento do trajeto (4 etapas)</span>
              <span className="font-mono text-[11px] text-slate-400">
                Dados históricos consolidados
              </span>
            </div>
            <ol className="grid grid-cols-4">
              {steps.map((step, index) => {
                const nextStep = steps[index + 1];
                const isWaitingCurrent =
                  step.state === "current" && order.trackingStatus === "Aguardando Liberação";
                const isDelayedCurrent =
                  step.state === "current" &&
                  order.trackingStatus === "Em Trânsito" &&
                  isOrderDelayed;

                const connectorClass =
                  nextStep && nextStep.state !== "pending"
                    ? nextStep.state === "done"
                      ? "bg-slate-800"
                      : order.trackingStatus === "Aguardando Liberação"
                        ? "bg-accent"
                        : order.trackingStatus === "Em Trânsito" && isOrderDelayed
                          ? "bg-red-500"
                          : "bg-primary"
                    : null;

                return (
                  <li
                    key={step.key}
                    className={`relative flex flex-col items-start ${index < 3 ? "pr-4" : ""}`}
                  >
                    {index < 3 &&
                      (connectorClass ? (
                        <div
                          className={`absolute top-[13px] left-7 right-0 h-0.5 ${connectorClass}`}
                        />
                      ) : (
                        <div className="absolute top-[13px] left-7 right-0 border-t-2 border-dashed border-slate-300" />
                      ))}

                    {step.state === "done" ? (
                      <div className="relative z-10 w-7 h-7 rounded bg-slate-900 text-white grid place-items-center">
                        <Check className="w-4 h-4" />
                      </div>
                    ) : step.state === "current" ? (
                      <div
                        className={`relative z-10 w-7 h-7 rounded grid place-items-center ring-4 ${
                          isWaitingCurrent
                            ? "bg-accent text-slate-900 ring-amber-100"
                            : isDelayedCurrent
                              ? "bg-red-600 text-white ring-red-100"
                              : "bg-primary text-white ring-primary-100"
                        }`}
                      >
                        <StepIcon stepKey={step.key} />
                      </div>
                    ) : (
                      <div className="relative z-10 w-7 h-7 rounded border-2 border-dashed border-slate-300 bg-white text-slate-300 grid place-items-center" />
                    )}

                    <p
                      className={`mt-2.5 text-sm ${
                        step.state === "current"
                          ? "font-semibold text-slate-900"
                          : step.state === "pending"
                            ? "font-medium text-slate-400"
                            : "font-medium text-slate-800"
                      }`}
                    >
                      {step.label}
                    </p>
                    <p className="mt-0.5 leading-none min-h-[14px]">
                      {step.isCurrent ? (
                        <span
                          className={`font-mono text-[10.5px] uppercase tracking-wider font-semibold ${
                            isWaitingCurrent
                              ? "text-amber-800"
                              : isDelayedCurrent
                                ? "text-red-700"
                                : "text-primary"
                          }`}
                        >
                          {isDelayedCurrent && order.delayDays !== null
                            ? `Em atraso (+${order.delayDays}d)`
                            : step.subtitle}
                        </span>
                      ) : step.subtitle ? (
                        <span
                          className={`font-mono text-xs tabular ${
                            step.key === "delivered" && step.state === "done"
                              ? isOrderDelayed
                                ? "text-red-700 font-medium"
                                : "text-emerald-700 font-medium"
                              : "text-slate-500"
                          }`}
                        >
                          {step.subtitle}
                          {step.key === "delivered" &&
                            step.state === "done" &&
                            isOrderDelayed &&
                            order.delayDays !== null &&
                            ` (+${order.delayDays}d)`}
                        </span>
                      ) : null}
                    </p>
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </div>
    </article>
  );
}
