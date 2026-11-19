import type { UseQueryResult } from "@tanstack/react-query";
import type { Order } from "@translog/contracts";
import { useEffect, useState } from "react";
import { ApiError } from "@/api/client.ts";
import { useOrderSamples } from "@/api/queries.ts";
import { trackingHref } from "@/lib/router.ts";
import { parseOrderId } from "@/lib/url-state.ts";
import { navigate } from "@/lib/use-location.tsx";
import { type TrackerViewMode, TrackingPanel } from "./tracking-panel.tsx";

interface TrackingPageProps {
  /** Texto de `?pedido=` (a URL é a fonte da verdade do pedido aberto). */
  orderParam: string | null;
  orderQuery: UseQueryResult<Order>;
  /** Pergunta enviada ao LogBot a partir do cartão ("Perguntar ao assistente"). */
  onAskAssistant: (question: string) => void;
}

/**
 * Rastreio do cliente (`/rastreio?pedido=N`): busca e cartão do pedido, na altura da tela com
 * rolagem própria. O LogBot fica no painel lateral do layout do cliente.
 */
export function TrackingPage({ orderParam, orderQuery, onAskAssistant }: TrackingPageProps) {
  const samplesQuery = useOrderSamples();
  const submittedQuery = orderParam ?? "";
  const selectedOrderId = parseOrderId(orderParam);
  // Número fora do formato: mostra "não encontrado" sem consultar a API.
  const invalidQuery = submittedQuery !== "" && selectedOrderId === null;

  const [queryValue, setQueryValue] = useState(submittedQuery);
  useEffect(() => {
    setQueryValue(submittedQuery);
  }, [submittedQuery]);

  const view = trackerView(invalidQuery, selectedOrderId, orderQuery);
  const activeOrder = view === "result" ? (orderQuery.data ?? null) : null;

  // Troca de pedido dentro do rastreio substitui o endereço (como antes, sem encher o histórico).
  function openOrder(rawOrderId: string) {
    navigate(trackingHref(rawOrderId), { replace: true });
  }

  function clearOrder() {
    setQueryValue("");
    navigate(trackingHref(null), { replace: true });
  }

  function retry() {
    if (selectedOrderId !== null) {
      void orderQuery.refetch();
      return;
    }
    const fallback = parseOrderId(submittedQuery || queryValue || "375");
    if (fallback) {
      openOrder(String(fallback));
    }
  }

  return (
    <div className="min-h-[calc(100dvh-var(--header-h))] py-5">
      <TrackingPanel
        view={view}
        queryValue={queryValue}
        submittedQuery={submittedQuery}
        onQueryChange={setQueryValue}
        onSubmitOrder={openOrder}
        onClearOrder={clearOrder}
        onRetry={retry}
        sampleOrderIds={samplesQuery.orderIds}
        activeOrder={activeOrder}
        onAskAssistant={onAskAssistant}
      />
    </div>
  );
}

function trackerView(
  invalidQuery: boolean,
  selectedOrderId: number | null,
  orderQuery: UseQueryResult<Order>,
): TrackerViewMode {
  if (invalidQuery) {
    return "notfound";
  }
  if (selectedOrderId === null) {
    return "empty";
  }
  if (orderQuery.isPending) {
    return "loading";
  }
  if (orderQuery.isError) {
    const err = orderQuery.error;
    return err instanceof ApiError && err.status === 404 ? "notfound" : "error";
  }
  return orderQuery.data ? "result" : "empty";
}
