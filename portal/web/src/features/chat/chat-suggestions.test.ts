import { describe, expect, it } from "vitest";
import { FIXTURE_ORDERS, findFixtureOrder } from "@/api/fixture-orders.ts";
import { CHAT_SUGGESTIONS, getChatSuggestions, SUPPORT_SUGGESTION } from "./chat-suggestions.ts";

describe("chat-suggestions", () => {
  it("adapts suggested questions to the active order context", () => {
    expect(getChatSuggestions(null)).toEqual(CHAT_SUGGESTIONS);
    expect(getChatSuggestions(findFixtureOrder(76902))[0]).toBe("Por que o pedido #76902 atrasou?");
    expect(getChatSuggestions(findFixtureOrder(375))[1]).toBe("Quando o pedido #375 foi entregue?");
    expect(getChatSuggestions(findFixtureOrder(34))[0]).toBe("O que aconteceu com o pedido #34?");
    expect(getChatSuggestions(findFixtureOrder(9))[1]).toBe("Por que o pedido #9 não foi enviado?");
    expect(getChatSuggestions(findFixtureOrder(8))[0]).toBe("Quando o pedido #8 foi entregue?");
  });

  it("without an open order, invites the customer to share the order number", () => {
    expect(CHAT_SUGGESTIONS[0]).toBe("Quero acompanhar meu pedido");
    expect(CHAT_SUGGESTIONS.some((suggestion) => /\d/.test(suggestion))).toBe(false);
  });

  it("every suggestion cites the order number so the API resolves it", () => {
    for (const order of FIXTURE_ORDERS) {
      const [first, second] = getChatSuggestions(order);
      expect(first).toContain(`#${order.orderId}`);
      expect(second).toContain(`#${order.orderId}`);
    }
  });

  it("offers 'Quero falar com a central' for late and lost orders", () => {
    expect(getChatSuggestions(findFixtureOrder(76902))).toContain(SUPPORT_SUGGESTION);
    expect(getChatSuggestions(findFixtureOrder(34))).toContain(SUPPORT_SUGGESTION);
    expect(getChatSuggestions(findFixtureOrder(8))).not.toContain(SUPPORT_SUGGESTION);
  });
});
