import {
  dedupeConversationMessagesById,
  formatConversationDisplayTime,
  formatConversationMessageDisplayTime,
  normalizeConversationMessageId,
  normalizeConversationMessageTimestamps,
  parseConversationTimestamp,
  resolveConversationSortTimestamp,
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

  it("normalizes backend timestamps onto the message model", () => {
    const message = normalizeConversationMessageTimestamps({
      ...createMessage(),
      time: "18:32",
      createdAt: "",
      updatedAt: "",
      receivedAt: "",
      // emulate raw API aliases
      created_at: "2026-03-10T18:32:10.123Z",
      updated_at: "2026-03-10T18:32:10.123Z",
    } as ConversationMessage & { created_at: string; updated_at: string });

    expect(message.createdAt).toBe("2026-03-10T18:32:10.123Z");
    expect(message.receivedAt).toBe("2026-03-10T18:32:10.123Z");
  });

  it("normalizes message ids before list rendering uses them as keys", () => {
    expect(normalizeConversationMessageId(createMessage({ id: "  msg_1  " }))).toBe("msg_1");
    expect(normalizeConversationMessageId(createMessage({ id: "   " }), "fallback_1")).toBe("fallback_1");
  });

  it("dedupes repeated messages by normalized id and keeps the latest payload", () => {
    const messages = dedupeConversationMessagesById([
      createMessage({
        id: " msg_1 ",
        content: "first",
        receivedAt: "2026-03-10T18:32:10.123Z",
      }),
      createMessage({
        id: "msg_1",
        content: "latest",
        receivedAt: "2026-03-10T18:32:10.456Z",
      }),
      createMessage({
        id: "msg_2",
        content: "other",
        receivedAt: "2026-03-10T18:32:10.789Z",
      }),
    ]);

    expect(messages).toHaveLength(2);
    expect(messages.map((item) => item.id)).toEqual(["msg_1", "msg_2"]);
    expect(messages[0]?.content).toBe("latest");
  });

  it("sorts messages by received timestamp before seq number", () => {
    const messages = sortConversationMessagesChronologically([
      createMessage({
        id: "reply",
        seqNo: 12,
        time: "02:10",
        content: "reply",
        receivedAt: "2026-03-10T18:32:10.456Z",
      }),
      createMessage({
        id: "question",
        seqNo: 11,
        time: "02:10",
        content: "question",
        receivedAt: "2026-03-10T18:32:10.123Z",
      }),
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

  it("formats conversation message time from absolute timestamps instead of display-only time", () => {
    const sameDay = new Date();
    sameDay.setHours(18, 32, 10, 123);
    const iso = sameDay.toISOString();
    const message = createMessage({
      time: "18:32",
      createdAt: iso,
    });

    expect(formatConversationMessageDisplayTime(message)).toBe(
      new Date(iso).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    );
  });

  it("prefers receivedAt over createdAt for display", () => {
    const created = new Date();
    created.setHours(18, 32, 10, 123);
    const received = new Date(created.getTime() + 864);
    const message = createMessage({
      time: "18:32",
      createdAt: created.toISOString(),
      receivedAt: received.toISOString(),
    });

    expect(formatConversationMessageDisplayTime(message)).toBe(
      received.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    );
  });

  it("normalizes naive UTC datetime strings without timezone", () => {
    const timestamp = resolveConversationSortTimestamp(
      createMessage({
        receivedAt: "2026-03-10 18:32:10.987654",
      })
    );

    expect(timestamp).toBe(Date.parse("2026-03-10T18:32:10.987Z"));
  });

  it("treats naive datetime display values as UTC", () => {
    const display = formatConversationDisplayTime("2026-03-10 18:32:10");
    const expectedDate = new Date("2026-03-10T18:32:10.000Z");
    const now = new Date();
    const sameDay =
      expectedDate.getFullYear() === now.getFullYear() &&
      expectedDate.getMonth() === now.getMonth() &&
      expectedDate.getDate() === now.getDate();
    const expected = sameDay
      ? expectedDate.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })
      : expectedDate.toLocaleString([], expectedDate.getFullYear() === now.getFullYear()
        ? {
            month: "numeric",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }
        : {
            year: "numeric",
            month: "numeric",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });

    expect(display).toBe(expected);
  });

  it("parses UTC suffix datetime strings used by backend", () => {
    const timestamp = resolveConversationSortTimestamp(
      createMessage({
        receivedAt: "2026-03-11 19:14:17.096676 +0000 UTC",
      })
    );

    expect(timestamp).toBe(Date.parse("2026-03-11T19:14:17.096Z"));
  });

  it("uses receivedAt for millisecond sorting precision", () => {
    const timestamp = resolveConversationSortTimestamp(
      createMessage({
        time: "18:32",
        createdAt: "2026-03-10T18:32:10Z",
        receivedAt: "2026-03-10T18:32:10.321Z",
      })
    );

    expect(timestamp).toBe(Date.parse("2026-03-10T18:32:10.321Z"));
  });
});
