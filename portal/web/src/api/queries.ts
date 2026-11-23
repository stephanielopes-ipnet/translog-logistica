import { useMutation, useQuery } from "@tanstack/react-query";
import {
  type ChatRequest,
  chatResponseSchema,
  type Order,
  orderSamplesResponseSchema,
  orderSchema,
  ordersSummaryResponseSchema,
} from "@translog/contracts";
import { getJson, postJson, shouldRetry } from "./client.ts";
import { DEFAULT_SAMPLE_IDS } from "./fixtures.ts";

/** Busca os códigos de exemplo em `/api/orders/samples` (fallback para `DEFAULT_SAMPLE_IDS`). */
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

/** Pedidos por mercado (`/api/orders/summary`), para o mapa do Início. */
export function useOrdersSummary() {
  return useQuery({
    queryKey: ["orders", "summary"],
    queryFn: () => getJson("/orders/summary", ordersSummaryResponseSchema),
    staleTime: Number.POSITIVE_INFINITY,
    retry: shouldRetry,
  });
}

/** Busca um pedido em `/api/orders/:orderId` quando há um `orderId` selecionado. */
export function useOrderQuery(orderId: number | null) {
  return useQuery<Order>({
    queryKey: ["orders", orderId],
    queryFn: () => getJson(`/orders/${orderId}`, orderSchema),
    enabled: orderId !== null && orderId > 0,
    retry: shouldRetry,
  });
}

/**
 * Envia uma pergunta ao assistente (`POST /api/chat`). Sem retry: o agente pode já ter
 * processado a mensagem, então o reenvio é só manual ("Tentar novamente").
 */
export function useSendChatMessage() {
  return useMutation({
    mutationFn: (request: ChatRequest) => postJson("/chat", request, chatResponseSchema),
    retry: false,
  });
}
