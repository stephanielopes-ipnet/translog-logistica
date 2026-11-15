import type { Order } from "@translog/contracts";
import { OrderItemsTable } from "./order-items-table.tsx";
import { OrderManifestCard } from "./order-manifest-card.tsx";
import { OrderSearchForm } from "./order-search-form.tsx";
import type { ReleaseLabelMode } from "./timeline.ts";
import {
  TrackingEmptyState,
  TrackingErrorState,
  TrackingLoadingState,
  TrackingNotFoundState,
} from "./tracking-states.tsx";

export type TrackerViewMode = "empty" | "loading" | "result" | "notfound" | "error";

interface TrackingPanelProps {
  view: TrackerViewMode;
  queryValue: string;
  submittedQuery: string;
  onQueryChange: (value: string) => void;
  onSubmitOrder: (rawOrderId: string) => void;
  onClearOrder: () => void;
  onRetry: () => void;
  sampleOrderIds: readonly number[];
  activeOrder: Order | null;
  releaseLabel: ReleaseLabelMode;
  onAskAssistant: (question: string) => void;
}

export function TrackingPanel({
  view,
  queryValue,
  submittedQuery,
  onQueryChange,
  onSubmitOrder,
  onClearOrder,
  onRetry,
  sampleOrderIds,
  activeOrder,
  releaseLabel,
  onAskAssistant,
}: TrackingPanelProps) {
  return (
    <section className="min-h-0 overflow-y-auto scroll-thin -mr-2 pr-2 pb-2 space-y-4">
      <OrderSearchForm
        queryValue={queryValue}
        onQueryChange={onQueryChange}
        onSubmitOrder={onSubmitOrder}
        onClearOrder={onClearOrder}
        sampleOrderIds={sampleOrderIds}
        activeOrderId={view === "result" && activeOrder ? activeOrder.orderId : null}
        isLoading={view === "loading"}
      />

      {view === "loading" && <TrackingLoadingState />}
      {view === "empty" && <TrackingEmptyState />}
      {view === "notfound" && (
        <TrackingNotFoundState query={submittedQuery} onClearSearch={onClearOrder} />
      )}
      {view === "error" && <TrackingErrorState onRetry={onRetry} />}
      {view === "result" && activeOrder && (
        <div className="space-y-4">
          <OrderManifestCard
            order={activeOrder}
            releaseLabel={releaseLabel}
            onAskAssistant={onAskAssistant}
          />
          <OrderItemsTable items={activeOrder.items} total={activeOrder.total} />
        </div>
      )}
    </section>
  );
}
