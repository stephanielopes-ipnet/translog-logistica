import { chatResponseSchema, healthResponseSchema, orderSchema } from "@translog/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, getJson, postJson, postNoContent, shouldRetry } from "./client.ts";

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

  it("postJson sends the JSON body and validates the response", async () => {
    const reply = {
      sessionId: "3f2b8c1e-7a4d-4e5f-9b6a-1c2d3e4f5a6b",
      reply: "O pedido **#375** está **Em Trânsito**.",
      mentionedOrderId: 375,
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(reply), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const body = { sessionId: reply.sessionId, message: "Quando chega?", orderId: 375 };

    await expect(postJson("/chat", body, chatResponseSchema)).resolves.toEqual(reply);

    expect(fetchMock).toHaveBeenCalledWith("/api/chat", {
      method: "POST",
      credentials: "same-origin",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  });

  it.each([
    { status: 409, code: "CHAT_BUSY" },
    { status: 502, code: "AGENT_UNAVAILABLE" },
    { status: 504, code: "AGENT_TIMEOUT" },
  ])("postJson maps $status $code to ApiError", async ({ status, code }) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { code, message: "Mensagem da API." } }), {
          status,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(postJson("/chat", {}, chatResponseSchema)).rejects.toMatchObject({
      name: "ApiError",
      status,
      code,
      message: "Mensagem da API.",
    });
  });

  it("postJson rejects a 200 response outside the contract", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ reply: "" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(postJson("/chat", {}, chatResponseSchema)).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });

  it("postNoContent accepts a 204 without body and sends the session cookie", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(postNoContent("/auth/logout", {})).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/logout",
      expect.objectContaining({ method: "POST", credentials: "same-origin" }),
    );
  });

  it("postNoContent maps a 429 to ApiError with the API message", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ error: { code: "TOO_MANY_ATTEMPTS", message: "Muitas tentativas." } }),
            { status: 429, headers: { "Content-Type": "application/json" } },
          ),
        ),
    );

    await expect(postNoContent("/auth/login", {})).rejects.toMatchObject({
      status: 429,
      message: "Muitas tentativas.",
    });
  });
});
