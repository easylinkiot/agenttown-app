import type { Friend } from "@/src/types";

const FRIEND_ALIAS_STORAGE_PREFIX = "agenttown.friend.aliases";

function safeUserKey(userId: string) {
  const key = userId.trim().replace(/[^a-zA-Z0-9_-]/g, "_");
  return key || "anonymous";
}

export function friendAliasStorageKey(userId: string) {
  return `${FRIEND_ALIAS_STORAGE_PREFIX}:${safeUserKey(userId)}`;
}

export function normalizeFriendAliases(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  const normalized: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(value as Record<string, unknown>)) {
    const key = rawKey.trim();
    const alias = typeof rawValue === "string" ? rawValue.trim() : "";
    if (!key || !alias) continue;
    normalized[key] = alias;
  }
  return normalized;
}

export function friendAliasKeys(friend: Pick<Friend, "id" | "userId"> | null | undefined) {
  const keys: string[] = [];
  const friendId = (friend?.id || "").trim();
  const userId = (friend?.userId || "").trim();
  if (friendId) keys.push(`friend:${friendId}`);
  if (userId) keys.push(`user:${userId}`);
  return keys;
}

export function getFriendAlias(
  aliases: Record<string, string>,
  friend: Pick<Friend, "id" | "userId"> | null | undefined
) {
  for (const key of friendAliasKeys(friend)) {
    const alias = (aliases[key] || "").trim();
    if (alias) return alias;
  }
  return "";
}

export function resolveFriendDisplayName(
  aliases: Record<string, string>,
  friend: Pick<Friend, "id" | "userId" | "name"> | null | undefined,
  fallback = ""
) {
  const alias = getFriendAlias(aliases, friend);
  if (alias) return alias;
  return (friend?.name || "").trim() || fallback.trim();
}
