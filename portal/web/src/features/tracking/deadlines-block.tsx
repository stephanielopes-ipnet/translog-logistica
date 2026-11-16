import type { Order } from "@translog/contracts";
import { Info, MessageSquareMore, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { formatDate, pluralize } from "@/lib/format.ts";

interface DeadlinesBlockProps {
  order: Order;
  onAskAssistant: (question: string) => void;
}

/**
 * Despacho e entrega lado a lado (previsto, realizado e atraso de cada um) e, abaixo, o motivo
 * provável de cada etapa com a explicação da base. O rótulo da causa é sempre "Motivo provável", nunca certeza.
 */
export function DeadlinesBlock({ order, onAskAssistant }: DeadlinesBlockProps) {
  const { dispatch, delivery } = order;
  const hasCause = dispatch.probableCause !== null || delivery.probableCause !== null;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <DeadlineColumn
          title="Despacho"
          subtitle={`Prazo prometido: ${pluralize(dispatch.promisedDays, "dia", "dias")} (${order.shippingMode})`}
          expected={dispatch.expectedDate}
          actual={dispatch.actualDate}
          actualFallback={order.status === "Aguardando pagamento" ? "Aguardando pagamento" : "—"}
          delayDays={dispatch.delayDays}
        />
        <DeadlineColumn
          title="Entrega"
          subtitle={
            order.status === "Em trânsito"
              ? `Atraso contado até ${formatDate(order.referenceDate)}`
              : "Ao destinatário"
          }
          expected={delivery.expectedDate}
          actual={delivery.actualDate}
          actualFallback={deliveryFallback(order)}
          delayDays={delivery.delayDays}
        />
      </div>

      {hasCause ? (
        <div className="flex items-stretch rounded-md border border-amber-300 bg-amber-50/80 shadow-[0_1px_2px_rgba(245,158,11,0.12)] overflow-hidden">
          <div
            className="w-11 shrink-0 bg-accent text-slate-900 grid place-items-center"
            aria-hidden="true"
          >
            <TriangleAlert className="w-5 h-5" />
          </div>
          <div className="flex-1 px-4 py-3 min-w-0">
            <span className="label-mono !text-amber-900 font-semibold">Motivo provável</span>
            <p className="mt-0.5 text-sm text-slate-900">
              {dispatch.probableCause && (
                <span>
                  No despacho: <strong className="font-bold">{dispatch.probableCause}</strong>
                </span>
              )}
              {dispatch.probableCause && delivery.probableCause && (
                <span className="text-amber-400 mx-2">·</span>
              )}
              {delivery.probableCause && (
                <span>
                  Na entrega: <strong className="font-bold">{delivery.probableCause}</strong>
                </span>
              )}
            </p>
            {order.explanation && (
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">{order.explanation}</p>
            )}
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
      ) : (
        order.explanation && (
          <p className="flex items-start gap-2 text-xs text-slate-600 leading-relaxed">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-400" />
            {order.explanation}
          </p>
        )
      )}
    </div>
  );
}

function deliveryFallback(order: Order): string {
  switch (order.status) {
    case "Em trânsito":
      return "Em trânsito";
    case "Extraviado":
      return "Não entregue (extravio)";
    case "Aguardando pagamento":
      return "Após o despacho";
    default:
      return "—";
  }
}

function DeadlineColumn({
  title,
  subtitle,
  expected,
  actual,
  actualFallback,
  delayDays,
}: {
  title: string;
  subtitle: string;
  expected: string | null;
  actual: string | null;
  actualFallback: string;
  delayDays: number | null;
}) {
  return (
    <section className="rounded-md border border-slate-200 bg-white">
      <header className="px-3.5 py-2 border-b border-slate-100 flex items-baseline justify-between gap-2">
        <h3 className="label-mono !text-slate-700 font-semibold">{title}</h3>
        <span className="text-[11px] text-slate-500 truncate">{subtitle}</span>
      </header>
      <dl className="px-3.5 py-2.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
        <Row label="Previsto">
          <span className="font-mono tabular text-slate-900">{formatDate(expected)}</span>
        </Row>
        <Row label="Realizado">
          {actual ? (
            <span className="font-mono tabular text-slate-900">{formatDate(actual)}</span>
          ) : (
            <span className="text-slate-500">{actualFallback}</span>
          )}
        </Row>
        <Row label="Prazo">
          <DelayChip delayDays={delayDays} />
        </Row>
      </dl>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-xs text-slate-500 pt-0.5 whitespace-nowrap">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}

function DelayChip({ delayDays }: { delayDays: number | null }) {
  if (delayDays === null) {
    return <span className="text-slate-400">—</span>;
  }
  if (delayDays > 0) {
    return (
      <span className="inline-flex rounded border border-red-300 bg-red-50 px-1.5 py-0.5 font-mono text-xs font-semibold text-red-700 tabular">
        +{pluralize(delayDays, "dia", "dias")} de atraso
      </span>
    );
  }
  return (
    <span className="inline-flex rounded border border-emerald-300 bg-emerald-50/70 px-1.5 py-0.5 font-mono text-xs font-semibold text-emerald-800 tabular">
      {delayDays < 0 ? `${pluralize(-delayDays, "dia", "dias")} antes` : "No prazo"}
    </span>
  );
}
