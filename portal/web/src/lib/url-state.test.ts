import { describe, expect, it } from "vitest";
import { parseOrderId, readUrlPresets, withOrderQueryParam } from "./url-state.ts";

describe("url-state utilities", () => {
  it("parses valid positive order IDs up to 10 digits", () => {
    expect(parseOrderId("375")).toBe(375);
    expect(parseOrderId("0015")).toBe(15);
    expect(parseOrderId("0")).toBeNull();
    expect(parseOrderId("-5")).toBeNull();
    expect(parseOrderId("abc")).toBeNull();
    expect(parseOrderId("12345678901")).toBeNull();
  });

  it("reads empty URL as empty initial state", () => {
    expect(readUrlPresets("")).toEqual({
      orderId: null,
      trackerPreset: null,
      chatPreset: null,
      chatOnSwitch: null,
      releaseLabel: null,
      networkOnline: null,
      hideProtoBarCompletely: false,
    });
  });

  it("reads prototype URL presets", () => {
    expect(readUrlPresets("?t=375&c=conversation&s=divider&r=payment&n=off&bar=off")).toEqual({
      orderId: 375,
      trackerPreset: null,
      chatPreset: "conversation",
      chatOnSwitch: "divider",
      releaseLabel: "payment",
      networkOnline: false,
      hideProtoBarCompletely: true,
    });
  });

  it("updates ?pedido query parameter cleanly", () => {
    expect(withOrderQueryParam("", 375)).toBe("?pedido=375");
    expect(withOrderQueryParam("?pedido=375", null)).toBe("");
  });
});
