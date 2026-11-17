import { describe, expect, it } from "vitest";
import { parseOrderId } from "./url-state.ts";

describe("url-state utilities", () => {
  it("parses valid positive order IDs up to 10 digits", () => {
    expect(parseOrderId("375")).toBe(375);
    expect(parseOrderId("0015")).toBe(15);
    expect(parseOrderId("0")).toBeNull();
    expect(parseOrderId("-5")).toBeNull();
    expect(parseOrderId("abc")).toBeNull();
    expect(parseOrderId("12345678901")).toBeNull();
  });
});
