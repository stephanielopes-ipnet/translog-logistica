import { chatRequestSchema } from "@translog/contracts";
import { describe, expect, it } from "vitest";
import { ApiError } from "@/api/client.ts";
import {
  type ChatMessageItem,
  chatFailureLabel,
  createSessionId,
  messagesAfterOrderSwitch,
  startsNewConversation,
} from "./chat-session.ts";

const conversation: ChatMessageItem[] = [
  { id: 1, role: "user", text: "Quando chega?", time: "10:00", status: "sent" },
  { id: 2, role: "assistant", text: "Resposta", time: "10:01" },
];

function counter(start: number) {
  let next = start;
  return () => next++;
}

describe("createSessionId", () => {
  it("creates a different UUID per conversation, accepted by the chat contract", () => {
    const first = createSessionId();
    const second = createSessionId();

    expect(first).not.toBe(second);
    expect(chatRequestSchema.safeParse({ sessionId: first, message: "Oi" }).success).toBe(true);
  });
});

describe("startsNewConversation", () => {
  it("starts a new conversation only when switching orders clears the chat", () => {
    expect(startsNewConversation("clear", 375, 15)).toBe(true);
    expect(startsNewConversation("keep", 375, 15)).toBe(false);
    expect(startsNewConversation("divider", 375, 15)).toBe(false);
  });

  it("keeps the conversation when the order does not actually change", () => {
    expect(startsNewConversation("clear", 375, 375)).toBe(false);
    expect(startsNewConversation("clear", null, 375)).toBe(false);
    expect(startsNewConversation("clear", 375, null)).toBe(false);
  });
});

describe("messagesAfterOrderSwitch", () => {
  it("keep: leaves the conversation untouched", () => {
    expect(messagesAfterOrderSwitch(conversation, "keep", 375, 15, counter(3))).toBe(conversation);
  });

  it("clear: empties the conversation", () => {
    expect(messagesAfterOrderSwitch(conversation, "clear", 375, 15, counter(3))).toEqual([]);
  });

  it("divider: appends one divider for the new order, without repeating it", () => {
    const withDivider = messagesAfterOrderSwitch(conversation, "divider", 375, 15, counter(3));

    expect(withDivider.at(-1)).toEqual({ id: 3, role: "divider", orderId: 15 });
    expect(messagesAfterOrderSwitch(withDivider, "divider", 562, 15, counter(4))).toBe(withDivider);
  });

  it("does nothing for an empty chat or when the order stays the same", () => {
    expect(messagesAfterOrderSwitch([], "divider", 375, 15, counter(1))).toEqual([]);
    expect(messagesAfterOrderSwitch(conversation, "clear", 375, 375, counter(3))).toBe(
      conversation,
    );
    expect(messagesAfterOrderSwitch(conversation, "clear", null, 375, counter(3))).toBe(
      conversation,
    );
  });
});

describe("chatFailureLabel", () => {
  it("says the assistant took too long on 504", () => {
    expect(chatFailureLabel(new ApiError(504, "AGENT_TIMEOUT", "..."))).toBe(
      "O assistente demorou demais",
    );
  });

  it("asks to wait on 409", () => {
    expect(chatFailureLabel(new ApiError(409, "CHAT_BUSY", "..."))).toBe(
      "Aguarde a resposta anterior",
    );
  });

  it("falls back to 'Não enviada' for other failures", () => {
    expect(chatFailureLabel(new ApiError(502, "AGENT_UNAVAILABLE", "..."))).toBe("Não enviada");
    expect(chatFailureLabel(new ApiError(0, "NETWORK_ERROR", "..."))).toBe("Não enviada");
    expect(chatFailureLabel(new Error("boom"))).toBe("Não enviada");
  });
});
