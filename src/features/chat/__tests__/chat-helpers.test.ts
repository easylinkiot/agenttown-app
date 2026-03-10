import {
  formatConversationDisplayTime,
  parseConversationTimestamp,
  sortConversationMessagesChronologically,
} from "../chat-helpers";
import type { ConversationMessage } from "@/src/types";

function createMessage(overrides?: Partial<ConversationMessage>): ConversationMessage {
  return {
    id: "msg-1",
    senderName: "User",
    senderAvatar: "",
    content: "hello",
    type: "text",
    isMe: false,
    time: "10:00",
    ...overrides,
  };
}

describe("chat helpers", () => {
  it("parses time-only values for local ordering", () => {
    const parsed = parseConversationTimestamp("02:10");
    expect(typeof parsed).toBe("number");
    expect(Number.isFinite(parsed)).toBe(true);
  });

  it("sorts messages by seq number before fallback time", () => {
    const messages = sortConversationMessagesChronologically([
      createMessage({ id: "reply", seqNo: 12, time: "02:10", content: "reply" }),
      createMessage({ id: "question", seqNo: 11, time: "02:10", content: "question" }),
    ]);

    expect(messages.map((item) => item.id)).toEqual(["question", "reply"]);
  });

  it("sorts time-only messages chronologically when seq numbers are missing", () => {
    const messages = sortConversationMessagesChronologically([
      createMessage({ id: "later", time: "02:11" }),
      createMessage({ id: "earlier", time: "02:10" }),
    ]);

    expect(messages.map((item) => item.id)).toEqual(["earlier", "later"]);
  });

  it("formats ISO timestamps in the device locale", () => {
    const now = new Date();
    now.setHours(10, 15, 0, 0);
    const iso = now.toISOString();
    expect(formatConversationDisplayTime(iso)).toBe(
      new Date(iso).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    );
  });
});
