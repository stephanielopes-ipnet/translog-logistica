import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type LoginRequest,
  type SessionResponse,
  type StaffOrder,
  type StaffSearchResponse,
  sessionResponseSchema,
  staffOrderSchema,
  staffSearchResponseSchema,
  type TowerResponse,
  towerResponseSchema,
} from "@translog/contracts";
import { useEffect } from "react";
import { type SearchFilters, searchApiPath } from "@/features/staff/search-filters.ts";
import { staffLoginHref } from "@/lib/router.ts";
import { navigate } from "@/lib/use-location.tsx";
import { ApiError, getJson, postNoContent } from "./client.ts";

// Área do colaborador: sessão, login e dados protegidos (`/api/staff/*`). O cookie de sessão é
// `HttpOnly`: a tela nunca lê nem guarda o token, só pergunta `GET /api/auth/session`.

const ANONYMOUS: SessionResponse = { authenticated: false, email: null, demoAvailable: false };

export const SESSION_QUERY_KEY = ["auth", "session"] as const;

/** Sessão do colaborador. Rota ausente (`404`) conta como "sem sessão". */
export function useSession() {
  return useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: async () => {
      try {
        return await getJson("/auth/session", sessionResponseSchema);
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          return ANONYMOUS;
        }
        throw error;
      }
    },
    retry: false,
  });
}

/** Depois de entrar: busca a sessão nova (a guarda leva à página pedida ou à Torre). */
function useRefreshSessionOnSuccess() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
}

/** `POST /api/auth/login`. Erros: `401` genérico, `429` muitas tentativas. */
export function useLogin() {
  const refresh = useRefreshSessionOnSuccess();
  return useMutation({
    mutationFn: (body: LoginRequest) => postNoContent("/auth/login", body),
    onSuccess: refresh,
    retry: false,
  });
}

/** `POST /api/auth/demo` (só existe com a demonstração ligada). */
export function useDemoLogin() {
  const refresh = useRefreshSessionOnSuccess();
  return useMutation({
    mutationFn: () => postNoContent("/auth/demo", {}),
    onSuccess: refresh,
    retry: false,
  });
}

/** Encerra a sessão (`POST /api/auth/logout`) e esquece os dados da Área do colaborador. */
export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => postNoContent("/auth/logout", {}),
    onSettled: () => {
      queryClient.setQueryData(SESSION_QUERY_KEY, (prev: SessionResponse | undefined) => ({
        ...ANONYMOUS,
        demoAvailable: prev?.demoAvailable ?? false,
      }));
      queryClient.removeQueries({ queryKey: ["staff"] });
    },
  });
}

/** Repete só falha de rede ou 5xx, uma vez; nunca 4xx (401, 400, 404). */
export function staffRetry(failureCount: number, error: unknown): boolean {
  return (
    error instanceof ApiError && (error.status === 0 || error.status >= 500) && failureCount < 1
  );
}

/**
 * Sessão expirada (qualquer `401` em `/api/staff/*`): volta ao login com aviso, lembrando a
 * página, e marca a tela como "sem sessão".
 */
function useExpireOn401(error: unknown) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!(error instanceof ApiError) || error.status !== 401) {
      return;
    }
    const here = `${window.location.pathname}${window.location.search}`;
    navigate(staffLoginHref(here, { expired: true }), { replace: true });
    queryClient.setQueryData(SESSION_QUERY_KEY, (prev: SessionResponse | undefined) => ({
      ...ANONYMOUS,
      demoAvailable: prev?.demoAvailable ?? false,
    }));
    queryClient.removeQueries({ queryKey: ["staff"] });
  }, [error, queryClient]);
}

/** Torre de controle (`GET /api/staff/tower`). */
export function useTower() {
  const query = useQuery<TowerResponse>({
    queryKey: ["staff", "tower"],
    queryFn: () => getJson("/staff/tower", towerResponseSchema),
    retry: staffRetry,
    staleTime: 60_000,
  });
  useExpireOn401(query.error);
  return query;
}

/** Pedido na visão do colaborador (`GET /api/staff/orders/:id`). */
export function useStaffOrder(orderId: number | null) {
  const query = useQuery<StaffOrder>({
    queryKey: ["staff", "orders", orderId],
    queryFn: () => getJson(`/staff/orders/${orderId}`, staffOrderSchema),
    enabled: orderId !== null,
    retry: staffRetry,
  });
  useExpireOn401(query.error);
  return query;
}

/**
 * Busca de pedidos (`GET /api/staff/orders`). Enquanto a próxima página (ou outro filtro)
 * carrega, a tela continua mostrando o resultado anterior (`isPlaceholderData`). `401` = sessão
 * vencida: volta ao login com aviso e, depois de entrar, à mesma busca.
 */
export function useStaffSearch(filters: SearchFilters) {
  const path = searchApiPath(filters);
  const query = useQuery<StaffSearchResponse>({
    queryKey: ["staff", "search", path],
    queryFn: () => getJson(path, staffSearchResponseSchema),
    placeholderData: keepPreviousData,
    retry: staffRetry,
    staleTime: 60_000,
  });
  useExpireOn401(query.error);
  return query;
}
