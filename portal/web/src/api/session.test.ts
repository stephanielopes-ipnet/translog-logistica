import { describe, expect, it } from "vitest";
import { ApiError } from "./client.ts";
import { staffRetry } from "./session.ts";

describe("consultas da Área do colaborador", () => {
  it("repetem só falha de rede ou do servidor, uma vez; nunca 4xx", () => {
    expect(staffRetry(0, new ApiError(0, "NETWORK_ERROR", "x"))).toBe(true);
    expect(staffRetry(0, new ApiError(503, "INTERNAL_ERROR", "x"))).toBe(true);
    expect(staffRetry(1, new ApiError(503, "INTERNAL_ERROR", "x"))).toBe(false);
    for (const status of [400, 401, 404, 429]) {
      expect(staffRetry(0, new ApiError(status, "X", "x"))).toBe(false);
    }
    expect(staffRetry(0, new Error("?"))).toBe(false);
  });
});
