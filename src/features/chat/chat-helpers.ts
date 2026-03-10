import { CHAT_DATA, DEFAULT_MYBOT_AVATAR, POWERHOO_MESSAGES } from "@/src/constants/chat";
import { BotConfig, ChatThread, ConversationMessage } from "@/src/types";

export function resolveChatThread(id: string, botConfig: BotConfig): ChatThread {
  if (id === "mybot") {
    return {
      id: "mybot",
      name: botConfig.name,
      avatar: botConfig.avatar || DEFAULT_MYBOT_AVATAR,
      message: "",
      time: "Now",
    };
  }

  return (
    CHAT_DATA.find((item) => item.id === id) ?? {
      id,
      name: "Unknown Chat",
      avatar: DEFAULT_MYBOT_AVATAR,
      message: "",
      time: "Now",
    }
  );
}

export function getInitialConversation(
  id: string,
  thread: ChatThread
): ConversationMessage[] {
  if (id === "group_14") {
    return POWERHOO_MESSAGES;
  }

  return [
    {
      id: "init",
      senderName: thread.name,
      senderAvatar: thread.avatar,
      content: "Hello! How can I help you today?",
      type: "text",
      isMe: false,
      time: "Just now",
    },
  ];
}

export function formatNowTime() {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function parseConversationTimestamp(value: string): number | null {
  const trimmed = (value || "").trim();
  if (!trimmed) return null;

  const parsed = Date.parse(trimmed);
  if (Number.isFinite(parsed)) {
    return parsed;
  }

  const timeOnlyMatch = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(trimmed);
  if (!timeOnlyMatch) return null;

  const hours = Number(timeOnlyMatch[1]);
  const minutes = Number(timeOnlyMatch[2]);
  const seconds = Number(timeOnlyMatch[3] || "0");
  if (![hours, minutes, seconds].every((part) => Number.isFinite(part))) {
    return null;
  }

  const date = new Date();
  date.setHours(hours, minutes, seconds, 0);
  return date.getTime();
}

export function sortConversationMessagesChronologically(messages: ConversationMessage[]): ConversationMessage[] {
  return [...messages].sort((a, b) => {
    if (typeof a.seqNo === "number" && typeof b.seqNo === "number" && a.seqNo !== b.seqNo) {
      return a.seqNo - b.seqNo;
    }

    const at = parseConversationTimestamp(a.time || "");
    const bt = parseConversationTimestamp(b.time || "");
    if (typeof at === "number" && typeof bt === "number" && at !== bt) {
      return at - bt;
    }

    return 0;
  });
}
