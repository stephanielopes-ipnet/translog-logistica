import { describe, expect, it } from "vitest";
import { findFixtureOrder } from "@/api/fixtures.ts";
import {
  ASK_NUMBER_REPLY,
  buildAssistantReply,
  CHAT_SUGGESTIONS,
  getChatSuggestions,
  MODES_REPLY,
} from "./mock-chat-service.ts";

describe("mock-chat-service", () => {
  it("explains probable cause for order 375 without claiming certainty", () => {
    const order375 = findFixtureOrder(375);
    const res = buildAssistantReply({
      message: "Por que meu pedido atrasou?",
      currentOrder: order375,
    });

    expect(res.reply).toContain("**Promessa irreal**");
    expect(res.reply).toContain("provavelmente foi curto");
    expect(res.reply).toContain("Texas → Saltillo (México)");
  });

  it("answers delivery estimate and delay for order 375", () => {
    const order375 = findFixtureOrder(375);
    const res = buildAssistantReply({
      message: "Quando meu pedido chega?",
      currentOrder: order375,
    });

    expect(res.reply).toContain("**Em Trânsito**");
    expect(res.reply).toContain("08/01/2015");
    expect(res.reply).toContain("4 dias de atraso");
  });

  it("detects order number mentioned in chat and resolves it", () => {
    const res = buildAssistantReply({
      message: "Qual o status do pedido 15?",
      currentOrder: null,
    });

    expect(res.detectedOrderId).toBe(15);
    expect(res.reply).toContain("**#15**");
    expect(res.reply).toContain("**Entregue**");
  });

  it("asks for order number when no order is active", () => {
    const res = buildAssistantReply({
      message: "Quando meu pedido chega?",
      currentOrder: null,
    });

    expect(res.reply).toBe(ASK_NUMBER_REPLY);
  });

  it("returns shipping modes explanation", () => {
    const res = buildAssistantReply({
      message: "Quais são as modalidades de envio?",
      currentOrder: null,
    });

    expect(res.reply).toBe(MODES_REPLY);
  });

  it("adapts suggested questions to the active order context", () => {
    expect(getChatSuggestions(null)).toEqual(CHAT_SUGGESTIONS);

    const order375 = findFixtureOrder(375);
    expect(getChatSuggestions(order375 ?? null)[0]).toContain("#375 atrasou");

    const order562 = findFixtureOrder(562);
    expect(getChatSuggestions(order562 ?? null)[1]).toContain("#562 ainda não foi liberado");
  });
});
