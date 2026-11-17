import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { ApiError, getJson, postNoContent } from "./client.ts";

/**
 * Resposta de `GET /api/auth/session`. Espelha o contrato do backend (prompt do backend, tarefa 3:
 * `{ authenticated, email?, demoAvailable }`). Quando `contracts/src/auth.ts` estiver na branch,
 * troque por `authSessionSchema` de `@translog/contracts`.
 */
export const sessionResponseSchema = z.object({
  authenticated: z.boolean(),
  email: z.string().nullish(),
  demoAvailable: z.boolean(),
});

export type SessionResponse = z.output<typeof sessionResponseSchema>;

const ANONYMOUS: SessionResponse = { authenticated: false, email: null, demoAvailable: false };

export const SESSION_QUERY_KEY = ["auth", "session"] as const;

/**
 * Sessão do colaborador. A tela nunca lê o cookie (`HttpOnly`): pergunta à API.
 * Rota ausente (`404`, API sem login configurado) conta como "sem sessão".
 */
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

/** Encerra a sessão (`POST /api/auth/logout`) e limpa o que a tela guardou da Área do colaborador. */
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
