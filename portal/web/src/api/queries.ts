import { useQuery } from "@tanstack/react-query";
import {
  healthResponseSchema,
  type Order,
  orderSamplesResponseSchema,
  orderSchema,
} from "@translog/contracts";
import { getJson, shouldRetry } from "./client.ts";
import { DEFAULT_SAMPLE_IDS } from "./fixtures.ts";

/** Verifica periodicamente `/api/health` para o indicador de conexão do cabeçalho. */
export function useHealth(enabled = true) {
  return useQuery({
    queryKey: ["health"],
    queryFn: () => getJson("/health", healthResponseSchema),
    enabled,
    refetchInterval: 15_000,
    retry: shouldRetry,
  });
}

/** Busca os códigos de exemplo em `/api/orders/samples` (fallback para `[15, 375, 562, 1002]`). */
export function useOrderSamples() {
  const query = useQuery({
    queryKey: ["orders", "samples"],
    queryFn: () => getJson("/orders/samples", orderSamplesResponseSchema),
    staleTime: Number.POSITIVE_INFINITY,
    retry: shouldRetry,
  });

  return {
    ...query,
    orderIds: query.data?.orderIds ?? [...DEFAULT_SAMPLE_IDS],
  };
}

/** Busca um pedido em `/api/orders/:orderId` quando há um `orderId` selecionado. */
export function useOrderQuery(orderId: number | null, enabled = true) {
  return useQuery<Order>({
    queryKey: ["orders", orderId],
    queryFn: () => getJson(`/orders/${orderId}`, orderSchema),
    enabled: enabled && orderId !== null && orderId > 0,
    retry: shouldRetry,
  });
}
