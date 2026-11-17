import { describe, expect, it } from "vitest";
import { parseOrderId, readOrderIdFromUrl, withOrderQueryParam } from "./url-state.ts";

describe("url-state utilities", () => {
  it("parses valid positive order IDs up to 10 digits", () => {
    expect(parseOrderId("375")).toBe(375);
    expect(parseOrderId("0015")).toBe(15);
    expect(parseOrderId("0")).toBeNull();
    expect(parseOrderId("-5")).toBeNull();
    expect(parseOrderId("abc")).toBeNull();
    expect(parseOrderId("12345678901")).toBeNull();
  });

  it("reads the order opened by the URL", () => {
    expect(readOrderIdFromUrl("")).toBeNull();
    expect(readOrderIdFromUrl("?pedido=76902")).toBe(76902);
    expect(readOrderIdFromUrl("?pedido=abc")).toBeNull();
  });

  it("updates ?pedido query parameter cleanly", () => {
    expect(withOrderQueryParam("", 375)).toBe("?pedido=375");
    expect(withOrderQueryParam("?pedido=375", null)).toBe("");
  });
});
