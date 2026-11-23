import { describe, expect, it } from "vitest";
import { ApiError } from "@/api/client.ts";
import { loginErrorMessage } from "./login-errors.ts";

describe("mensagem de erro do login", () => {
  it("é genérica para credencial errada e avisa sobre muitas tentativas", () => {
    expect(loginErrorMessage(new ApiError(401, "INVALID_CREDENTIALS", "x"))).toBe(
      "E-mail ou senha inválidos.",
    );
    expect(loginErrorMessage(new ApiError(429, "TOO_MANY_ATTEMPTS", "x"))).toBe(
      "Muitas tentativas de login. Aguarde um minuto e tente novamente.",
    );
    expect(loginErrorMessage(new ApiError(0, "NETWORK_ERROR", "x"))).toContain("conectar");
    expect(loginErrorMessage(new Error("?"))).toBe(
      "Não foi possível entrar agora. Tente novamente.",
    );
  });
});
