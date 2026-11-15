import { describe, expect, it } from "vitest";
import { findFixtureOrder } from "@/api/fixtures.ts";
import { CHAT_SUGGESTIONS, getChatSuggestions } from "./chat-suggestions.ts";

describe("chat-suggestions", () => {
  it("adapts suggested questions to the active order context", () => {
    expect(getChatSuggestions(null)).toEqual(CHAT_SUGGESTIONS);

    const order375 = findFixtureOrder(375);
    expect(getChatSuggestions(order375 ?? null)[0]).toContain("#375 atrasou");

    const order562 = findFixtureOrder(562);
    expect(getChatSuggestions(order562 ?? null)[1]).toContain("#562 ainda não foi liberado");

    const order1002 = findFixtureOrder(1002);
    expect(getChatSuggestions(order1002 ?? null)[0]).toBe("Qual a situação do pedido #1002?");
  });

  it("every suggestion cites the order number so the API resolves it", () => {
    for (const orderId of [15, 375, 562, 1002, 10453, 31398]) {
      const order = findFixtureOrder(orderId);
      const [first, second] = getChatSuggestions(order);
      expect(first).toContain(`#${orderId}`);
      expect(second).toContain(`#${orderId}`);
    }
  });
});
