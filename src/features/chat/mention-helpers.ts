import type { ThreadMemberType } from "@/src/types";

export type MentionDraftCandidate = {
  key: string;
  kind: "all" | "mybot" | "member";
  token: string;
  memberId?: string;
  memberType?: ThreadMemberType;
};

export function extractActiveMention(text: string) {
  const match = text.match(/(?:^|\s)@([^\s@]*)$/);
  if (!match || typeof match.index !== "number") return null;
  const raw = match[1] || "";
  const prefix = match[0].startsWith("@") ? "" : " ";
  return {
    query: raw.trim().toLowerCase(),
    start: match.index + prefix.length,
  };
}

export function replaceActiveMention(text: string, token: string) {
  const active = extractActiveMention(text);
  if (!active) return text;
  const before = text.slice(0, active.start);
  return `${before}@${token} `;
}

function escapeMentionToken(token: string) {
  return token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function collectMentionMatches(content: string, candidates: MentionDraftCandidate[]) {
  const safeContent = content || "";
  const ordered = [...candidates].sort((left, right) => right.token.length - left.token.length);
  const matched: { start: number; candidate: MentionDraftCandidate }[] = [];
  const seen = new Set<string>();
  const occupiedRanges: { start: number; end: number }[] = [];
  const trailingBoundary = String.raw`(?=$|[\s,.;:!?，。！？；：、)\]"'”’】）])`;

  for (const candidate of ordered) {
    const token = candidate.token.trim();
    if (!token || seen.has(candidate.key)) continue;
    const matcher = new RegExp(`(^|\\s)@${escapeMentionToken(token)}${trailingBoundary}`, "gi");
    for (const result of safeContent.matchAll(matcher)) {
      const matchedText = result[0] || "";
      const prefixOffset = matchedText.startsWith("@") ? 0 : 1;
      const start = (result.index || 0) + prefixOffset;
      const end = start + token.length + 1;
      const overlaps = occupiedRanges.some((range) => start < range.end && end > range.start);
      if (overlaps) continue;
      occupiedRanges.push({ start, end });
      matched.push({ start, candidate });
      seen.add(candidate.key);
      break;
    }
  }

  return matched.sort((left, right) => left.start - right.start).map((item) => item.candidate);
}
