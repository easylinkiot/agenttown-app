import { CHAT_DATA, DEFAULT_MYBOT_AVATAR, POWERHOO_MESSAGES } from "@/src/constants/chat";
import { BotConfig, ChatThread, ConversationMessage } from "@/src/types";

const RELATIVE_CONVERSATION_TIME_LABELS = new Set(["now", "just now", "刚刚"]);
const EXPLICIT_TIMEZONE_SUFFIX = /(z|[+-]\d{2}:?\d{2})$/i;
const NAIVE_DATETIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})[t\s](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?$/i;

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

function isRelativeConversationTime(value: string) {
  return RELATIVE_CONVERSATION_TIME_LABELS.has((value || "").trim().toLowerCase());
}

function isTimeOnlyConversationValue(value: string) {
  return /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.test((value || "").trim());
}

function normalizeFractionToMillis(value?: string) {
  if (!value) return "000";
  const digits = value.replace(/\D/g, "");
  if (!digits) return "000";
  return digits.slice(0, 3).padEnd(3, "0");
}

function normalizeDateTimeSeparator(value: string) {
  const trimmed = (value || "").trim();
  return trimmed.replace(
    /^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?)/,
    "$1T$2"
  );
}

function parseBackendUtcSuffixTimestamp(value: string): number | null {
  const match = value.match(
    /^(\d{4}-\d{2}-\d{2})[t\s](\d{2}:\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?\s+([+-]\d{2}):?(\d{2})\s+UTC$/i
  );
  if (!match) return null;

  const [, datePart, hourMinute, secondRaw, fractionRaw, offsetHour, offsetMinute] = match;
  const second = secondRaw || "00";
  const millis = normalizeFractionToMillis(fractionRaw);
  const iso = `${datePart}T${hourMinute}:${second}.${millis}${offsetHour}:${offsetMinute}`;
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : null;
}

function toLocalDateFromUtcTimeOnly(hours: number, minutes: number, seconds: number, now = new Date()) {
  const utcMillis = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    hours,
    minutes,
    seconds,
    0
  );
  let localDate = new Date(utcMillis);
  // If a UTC time-only value maps to the future in local time, treat it as previous day.
  if (localDate.getTime() - now.getTime() > 5 * 60 * 1000) {
    localDate = new Date(localDate.getTime() - 24 * 60 * 60 * 1000);
  }
  return localDate;
}

function parseAbsoluteConversationTimestamp(value: string): number | null {
  const trimmed = (value || "").trim();
  if (!trimmed) return null;

  const normalized = normalizeDateTimeSeparator(trimmed);
  const backendUtcParsed = parseBackendUtcSuffixTimestamp(normalized);
  if (typeof backendUtcParsed === "number") {
    return backendUtcParsed;
  }
  const naiveMatch = normalized.match(NAIVE_DATETIME_PATTERN);
  const hasExplicitTimezone = EXPLICIT_TIMEZONE_SUFFIX.test(normalized);
  if (naiveMatch && !hasExplicitTimezone) {
    const [, year, month, day, hour, minute, secondRaw, fractionRaw] = naiveMatch;
    const second = secondRaw || "00";
    const millis = normalizeFractionToMillis(fractionRaw);
    const utcIso = `${year}-${month}-${day}T${hour}:${minute}:${second}.${millis}Z`;
    const utcParsed = Date.parse(utcIso);
    if (Number.isFinite(utcParsed)) {
      return utcParsed;
    }
  }

  const directParsed = Date.parse(normalized);
  if (Number.isFinite(directParsed)) {
    return directParsed;
  }

  if (!hasExplicitTimezone) {
    const forcedUtcParsed = Date.parse(`${normalized}Z`);
    if (Number.isFinite(forcedUtcParsed)) {
      return forcedUtcParsed;
    }
  }

  return null;
}

export function normalizeConversationDateTime(value: unknown) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || isRelativeConversationTime(trimmed) || isTimeOnlyConversationValue(trimmed)) {
      return "";
    }
    const parsed = parseAbsoluteConversationTimestamp(trimmed);
    return typeof parsed === "number" ? new Date(parsed).toISOString() : "";
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const millis = value > 1_000_000_000_000 ? value : value * 1000;
    const parsed = new Date(millis);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : "";
  }

  return "";
}

export function normalizeConversationMessageTimestamps(message: ConversationMessage): ConversationMessage {
  const raw = message as ConversationMessage & {
    created_at?: unknown;
    updated_at?: unknown;
    received_at?: unknown;
    sentAt?: unknown;
  };
  const time = typeof message.time === "string" ? message.time.trim() : "";
  const createdAt =
    normalizeConversationDateTime(message.createdAt) ||
    normalizeConversationDateTime(raw.created_at);
  const updatedAt =
    normalizeConversationDateTime(message.updatedAt) ||
    normalizeConversationDateTime(raw.updated_at);
  const receivedAt =
    normalizeConversationDateTime(message.receivedAt) ||
    normalizeConversationDateTime(raw.received_at) ||
    normalizeConversationDateTime(raw.sentAt) ||
    createdAt ||
    updatedAt;

  return {
    ...message,
    time: time || undefined,
    createdAt: createdAt || undefined,
    updatedAt: updatedAt || undefined,
    receivedAt: receivedAt || undefined,
  };
}

export function normalizeConversationMessageId(
  message: Pick<ConversationMessage, "id">,
  fallbackId = ""
) {
  const normalizedId = typeof message.id === "string" ? message.id.trim() : "";
  return normalizedId || fallbackId;
}

export function dedupeConversationMessagesById(messages: ConversationMessage[]) {
  const byId = new Map<string, ConversationMessage>();
  const withoutId: ConversationMessage[] = [];

  for (const message of messages) {
    const normalized = normalizeConversationMessageTimestamps(message);
    const normalizedId = normalizeConversationMessageId(normalized);
    if (!normalizedId) {
      withoutId.push(normalized);
      continue;
    }
    byId.set(normalizedId, {
      ...normalized,
      id: normalizedId,
    });
  }

  return sortConversationMessagesChronologically([...byId.values(), ...withoutId]);
}

export function resolveConversationDisplayTimeValue(message: Pick<ConversationMessage, "time" | "createdAt" | "updatedAt" | "receivedAt">) {
  const normalized = normalizeConversationMessageTimestamps(message as ConversationMessage);
  return normalized.receivedAt || normalized.createdAt || normalized.updatedAt || normalized.time || "";
}

export function formatConversationMessageDisplayTime(
  message: Pick<ConversationMessage, "time" | "createdAt" | "updatedAt" | "receivedAt">
) {
  return formatConversationDisplayTime(resolveConversationDisplayTimeValue(message));
}

export function formatConversationDisplayTime(value: string) {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";

  if (isRelativeConversationTime(trimmed)) {
    return trimmed;
  }

  const parsed = parseAbsoluteConversationTimestamp(trimmed);
  if (typeof parsed === "number") {
    const date = new Date(parsed);
    const now = new Date();
    const sameDay =
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate();

    if (sameDay) {
      return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    }

    const sameYear = date.getFullYear() === now.getFullYear();
    return date.toLocaleString([], sameYear
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
  }

  const timeOnlyMatch = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(trimmed);
  if (timeOnlyMatch) {
    const hours = Number(timeOnlyMatch[1]);
    const minutes = Number(timeOnlyMatch[2]);
    const seconds = Number(timeOnlyMatch[3] || "0");
    const local = toLocalDateFromUtcTimeOnly(hours, minutes, seconds);
    const now = new Date();
    const sameDay =
      local.getFullYear() === now.getFullYear() &&
      local.getMonth() === now.getMonth() &&
      local.getDate() === now.getDate();
    if (sameDay) {
      return local.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    const sameYear = local.getFullYear() === now.getFullYear();
    return local.toLocaleString([], sameYear
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
  }

  return trimmed;
}

function parseTimeOnlyToLocalTimestamp(value: string): number | null {
  const timeOnlyMatch = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec((value || "").trim());
  if (!timeOnlyMatch) return null;
  const hours = Number(timeOnlyMatch[1]);
  const minutes = Number(timeOnlyMatch[2]);
  const seconds = Number(timeOnlyMatch[3] || "0");
  if (![hours, minutes, seconds].every((part) => Number.isFinite(part))) {
    return null;
  }

  const local = toLocalDateFromUtcTimeOnly(hours, minutes, seconds);
  return local.getTime();
}

export function parseConversationTimestamp(value: string): number | null {
  const trimmed = (value || "").trim();
  if (!trimmed) return null;
  if (isRelativeConversationTime(trimmed)) return null;

  const parsedAbsolute = parseAbsoluteConversationTimestamp(trimmed);
  if (typeof parsedAbsolute === "number") {
    return parsedAbsolute;
  }

  const parsedTimeOnly = parseTimeOnlyToLocalTimestamp(trimmed);
  if (typeof parsedTimeOnly === "number") {
    return parsedTimeOnly;
  }

  return null;
}

export function resolveConversationSortTimestamp(
  message: Pick<ConversationMessage, "time" | "createdAt" | "updatedAt" | "receivedAt">
): number | null {
  const normalized = normalizeConversationMessageTimestamps(message as ConversationMessage);
  const candidates = [
    normalized.receivedAt,
    normalized.createdAt,
    normalized.updatedAt,
    normalized.time,
  ];
  for (const candidate of candidates) {
    const parsed = parseConversationTimestamp(candidate || "");
    if (typeof parsed === "number") {
      return parsed;
    }
  }
  return null;
}

export function sortConversationMessagesChronologically(messages: ConversationMessage[]): ConversationMessage[] {
  return [...messages]
    .map((message, index) => ({
      index,
      message: normalizeConversationMessageTimestamps(message),
    }))
    .sort((left, right) => {
      const aSeq = typeof left.message.seqNo === "number" ? left.message.seqNo : null;
      const bSeq = typeof right.message.seqNo === "number" ? right.message.seqNo : null;
      if (aSeq !== null && bSeq !== null && aSeq !== bSeq) {
        return aSeq - bSeq;
      }

      const at = resolveConversationSortTimestamp(left.message);
      const bt = resolveConversationSortTimestamp(right.message);
      if (typeof at === "number" && typeof bt === "number" && at !== bt) {
        return at - bt;
      }
      if (typeof at === "number" && typeof bt !== "number") return -1;
      if (typeof bt === "number" && typeof at !== "number") return 1;

      const idCompare = String(left.message.id || "").localeCompare(String(right.message.id || ""));
      if (idCompare !== 0) return idCompare;

      return left.index - right.index;
    })
    .map((entry) => entry.message);
}
