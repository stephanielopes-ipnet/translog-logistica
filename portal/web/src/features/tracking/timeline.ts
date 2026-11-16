import type { Order } from "@translog/contracts";
import { formatDate } from "@/lib/format.ts";

// Linha do tempo resumida em 4 passos, adaptada ao contrato novo (16/11). A linha do tempo por
// etapas (Pedido, Coleta, Voo, Alfândega, Transferência, Última milha) vem na tarefa da tela.

export type StepState = "done" | "current" | "pending";
export type ReleaseLabelMode = "waiting" | "payment";

export interface TimelineStepView {
  key: "placed" | "released" | "in_transit" | "delivered";
  label: string;
  state: StepState;
  subtitle: string | null;
  isCurrent: boolean;
}

type StepStates = readonly [StepState, StepState, StepState, StepState];

/** Situações com os 4 passos; "Cancelado" e "Não pago (expirado)" mostram só o registro. */
const TIMELINE_STATES: Partial<Record<Order["status"], StepStates>> = {
  "Entregue no prazo": ["done", "done", "done", "done"],
  "Entregue com atraso": ["done", "done", "done", "done"],
  "Em trânsito": ["done", "done", "current", "pending"],
  Extraviado: ["done", "done", "current", "pending"],
  "Aguardando pagamento": ["done", "current", "pending", "pending"],
};

/** Rótulo exibido para a situação do pedido considerando a variante da barra de protótipo. */
export function getDisplayTrackingStatus(
  order: Pick<Order, "status">,
  releaseLabel: ReleaseLabelMode = "waiting",
): string {
  if (order.status === "Aguardando pagamento" && releaseLabel === "payment") {
    return "Pagamento não processado";
  }
  return order.status;
}

/** Pedido sem os 4 passos (terminal antes do despacho): só "Pedido realizado". */
export function isTerminalBeforeDispatch(order: Pick<Order, "status">): boolean {
  return TIMELINE_STATES[order.status] === undefined;
}

/** Constrói os passos da linha do tempo resumida. */
export function buildTimelineSteps(
  order: Pick<Order, "status" | "orderDate" | "dispatch" | "delivery">,
): TimelineStepView[] {
  const placed: TimelineStepView = {
    key: "placed",
    label: "Pedido realizado",
    state: "done",
    subtitle: formatDate(order.orderDate),
    isCurrent: false,
  };
  const states = TIMELINE_STATES[order.status];
  if (!states) {
    return [placed];
  }

  const steps: ReadonlyArray<Pick<TimelineStepView, "key" | "label">> = [
    { key: "placed", label: "Pedido realizado" },
    { key: "released", label: "Pedido despachado" },
    { key: "in_transit", label: order.status === "Extraviado" ? "Extraviado" : "Em trânsito" },
    { key: "delivered", label: "Entregue" },
  ];

  return steps.map((step, index) => {
    const state = states[index] ?? "pending";
    let subtitle: string | null = null;
    if (index === 0) {
      subtitle = formatDate(order.orderDate);
    } else if (index === 1 && state === "done") {
      subtitle = formatDate(order.dispatch.actualDate);
    } else if (index === 3) {
      subtitle =
        state === "done"
          ? formatDate(order.delivery.actualDate)
          : order.delivery.expectedDate
            ? `previsto ${formatDate(order.delivery.expectedDate)}`
            : null;
    } else if (state === "current") {
      subtitle = "Etapa atual";
    }
    return { ...step, state, subtitle, isCurrent: state === "current" };
  });
}
