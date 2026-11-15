import { describe, expect, it } from "vitest";
import { buildPresetConversation } from "./chat-presets.ts";

function counter() {
  let next = 1;
  return () => next++;
}

describe("buildPresetConversation", () => {
  it("conversation: two answered questions about order 375", () => {
    const items = buildPresetConversation("conversation", counter());

    expect(items.map((item) => item.role)).toEqual(["user", "assistant", "user", "assistant"]);
    expect(items.map((item) => item.id)).toEqual([1, 2, 3, 4]);
    expect(items[3]).toMatchObject({ text: expect.stringContaining("motivo provável") });
  });

  it("typing and error: the second question waits or fails", () => {
    expect(buildPresetConversation("typing", counter()).at(-1)).toMatchObject({
      role: "user",
      status: "sent",
    });
    expect(buildPresetConversation("error", counter()).at(-1)).toMatchObject({
      role: "user",
      status: "failed",
    });
  });
});
