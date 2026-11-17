import type { Order, OrderEvent } from "@translog/contracts";
import { deliveryDelay, endedBeforeDispatch, isDelivered } from "./order-status.ts";

// Linha do tempo por etapas da viagem, a partir dos eventos do pedido. Só mostra as etapas que
// o pedido tem: rota doméstica nunca passa por alfândega e só tem voo quando o modal é aéreo
// (conferido nos dados em 16/11; rota internacional sempre tem voo e alfândega).

export const STAGES = [
  { number: 0, label: "Pedido" },
  { number: 1, label: "Coleta" },
  { number: 2, label: "Voo" },
  { number: 3, label: "Alfândega" },
  { number: 4, label: "Transferência" },
  { number: 5, label: "Última milha" },
] as const;

/**
 * - `done`: etapa concluída;
 * - `current`: onde o volume está agora (em trânsito, no prazo);
 * - `delayed`: onde o volume está agora, com a entrega atrasada;
 * - `lost`: etapa em que o volume foi extraviado;
 * - `pending`: ainda não alcançada;
 * - `not_reached`: não será alcançada (depois de um extravio).
 */
export type StageState = "done" | "current" | "delayed" | "lost" | "pending" | "not_reached";

export interface StageView {
  number: number;
  label: string;
  state: StageState;
  events: OrderEvent[];
}

type TimelineInput = Pick<
  Order,
  "status" | "routeType" | "transportMode" | "currentStage" | "lostAtStage" | "events" | "delivery"
>;

/** Etapas que a rota do pedido tem, em ordem. */
export function plannedStages(order: TimelineInput): number[] {
  if (endedBeforeDispatch(order)) {
    return [0];
  }
  const international = order.routeType === "Internacional";
  const byAir = order.transportMode === null ? international : order.transportMode !== "Rodoviário";
  const planned = STAGES.map((stage) => stage.number).filter(
    (number) => (number !== 2 || byAir) && (number !== 3 || international),
  );
  // Segurança: uma etapa com evento sempre aparece, mesmo fora da regra.
  const withEvents = order.events.map((event) => event.stage);
  return [...new Set([...planned, ...withEvents])].sort((a, b) => a - b);
}

export function buildStageTimeline(order: TimelineInput): StageView[] {
  const reached = order.lostAtStage?.number ?? order.currentStage?.number ?? 0;
  return plannedStages(order).map((number) => {
    const events = order.events.filter((event) => event.stage === number);
    const label =
      events[0]?.stageLabel ?? STAGES.find((stage) => stage.number === number)?.label ?? "";
    return { number, label, events, state: stageState(order, number, reached) };
  });
}

function stageState(order: TimelineInput, number: number, reached: number): StageState {
  if (isDelivered(order) || endedBeforeDispatch(order)) {
    return "done";
  }
  if (number < reached) {
    return "done";
  }
  switch (order.status) {
    case "Extraviado":
      return number === reached ? "lost" : "not_reached";
    case "Em trânsito":
      if (number === reached) {
        return deliveryDelay(order) === null ? "current" : "delayed";
      }
      return "pending";
    default:
      return number === 0 ? "done" : "pending";
  }
}
