import type { Order, TrackingStatus } from "@translog/contracts";
import { formatDate } from "@/lib/format.ts";

export type StepState = "done" | "current" | "pending";
export type ReleaseLabelMode = "waiting" | "payment";

export interface TimelineStepView {
  key: "placed" | "released" | "in_transit" | "delivered";
  label: string;
  state: StepState;
  subtitle: string | null;
  isCurrent: boolean;
}

const TIMELINE_STATES: Record<
  Exclude<TrackingStatus, "Cancelado">,
  readonly [StepState, StepState, StepState, StepState]
> = {
  Entregue: ["done", "done", "done", "done"],
  "Em Trânsito": ["done", "done", "current", "pending"],
  "Aguardando Liberação": ["done", "current", "pending", "pending"],
};

/** Rótulo exibido para a situação do pedido considerando a variante de liberação. */
export function getDisplayTrackingStatus(
  order: Pick<Order, "trackingStatus">,
  releaseLabel: ReleaseLabelMode = "waiting",
): string {
  if (order.trackingStatus === "Aguardando Liberação" && releaseLabel === "payment") {
    return "Pagamento não processado";
  }
  return order.trackingStatus;
}

/** Constrói as 4 etapas da linha do tempo para pedidos não cancelados. */
export function buildTimelineSteps(
  order: Pick<
    Order,
    "trackingStatus" | "orderDate" | "estimatedDeliveryDate" | "actualDeliveryDate"
  >,
  releaseLabel: ReleaseLabelMode = "waiting",
): TimelineStepView[] {
  if (order.trackingStatus === "Cancelado") {
    return [
      {
        key: "placed",
        label: "Pedido realizado",
        state: "done",
        subtitle: formatDate(order.orderDate),
        isCurrent: false,
      },
    ];
  }

  const states = TIMELINE_STATES[order.trackingStatus];
  const baseSteps: ReadonlyArray<{
    key: TimelineStepView["key"];
    label: string;
  }> = [
    { key: "placed", label: "Pedido realizado" },
    {
      key: "released",
      label:
        order.trackingStatus === "Aguardando Liberação" && releaseLabel === "payment"
          ? "Confirmação pendente"
          : "Pedido liberado",
    },
    { key: "in_transit", label: "Em trânsito" },
    { key: "delivered", label: "Entregue" },
  ];

  return baseSteps.map((step, index) => {
    const state = states[index] ?? "pending";
    let subtitle: string | null = null;

    if (index === 0) {
      subtitle = formatDate(order.orderDate);
    } else if (index === 3) {
      subtitle =
        state === "done"
          ? formatDate(order.actualDeliveryDate)
          : `previsto ${formatDate(order.estimatedDeliveryDate)}`;
    } else if (state === "current") {
      subtitle = "Etapa atual";
    }

    return {
      key: step.key,
      label: step.label,
      state,
      subtitle,
      isCurrent: state === "current",
    };
  });
}
