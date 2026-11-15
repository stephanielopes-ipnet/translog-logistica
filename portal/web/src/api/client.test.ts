import { healthResponseSchema, orderSchema } from "@translog/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, getJson, shouldRetry } from "./client.ts";

describe("api client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses valid response matching schema", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ status: "ok", dataSource: "fixtures", orders: 11, agent: "mock" }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    );

    const data = await getJson("/health", healthResponseSchema);
    expect(data).toEqual({ status: "ok", dataSource: "fixtures", orders: 11, agent: "mock" });
  });

  it("maps standard API error payload to ApiError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { code: "ORDER_NOT_FOUND", message: "Pedido não encontrado." },
          }),
          { status: 404, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    await expect(getJson("/orders/9999", orderSchema)).rejects.toMatchObject({
      name: "ApiError",
      status: 404,
      code: "ORDER_NOT_FOUND",
      message: "Pedido não encontrado.",
    });
  });

  it("throws NETWORK_ERROR when fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(getJson("/health", healthResponseSchema)).rejects.toMatchObject({
      status: 0,
      code: "NETWORK_ERROR",
    });
  });

  it("retries once on network/5xx errors and never on 404", () => {
    expect(shouldRetry(0, new ApiError(0, "NETWORK_ERROR", "Falha"))).toBe(true);
    expect(shouldRetry(1, new ApiError(0, "NETWORK_ERROR", "Falha"))).toBe(false);
    expect(shouldRetry(0, new ApiError(404, "ORDER_NOT_FOUND", "Não encontrado"))).toBe(false);
  });
});
