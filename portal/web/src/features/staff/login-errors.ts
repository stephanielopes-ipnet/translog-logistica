import { ApiError } from "@/api/client.ts";

/** Mensagem da falha do login, sem dizer se o e-mail existe. */
export function loginErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return "E-mail ou senha inválidos.";
    }
    if (error.status === 429) {
      return "Muitas tentativas de login. Aguarde um minuto e tente novamente.";
    }
    if (error.status === 0) {
      return "Não foi possível conectar ao sistema. Tente novamente.";
    }
  }
  return "Não foi possível entrar agora. Tente novamente.";
}
