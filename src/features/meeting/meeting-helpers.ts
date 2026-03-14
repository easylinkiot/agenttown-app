import {
  ChatThread,
  ChatThreadMeetingParticipant,
  ChatThreadMeetingSession,
  MeetingRuntimeSession,
  MeetingSignalPayload,
} from "@/src/types";

type RecordLike = Record<string, unknown>;

function asRecord(value: unknown): RecordLike | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as RecordLike;
}

function coerceString(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() || undefined : undefined;
}

function coerceBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function coerceNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeParticipants(value: unknown): ChatThreadMeetingParticipant[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const participants: ChatThreadMeetingParticipant[] = [];
  for (const item of value) {
    const record = asRecord(item);
    if (!record) continue;
    participants.push({
      userId: coerceString(record.userId ?? record.user_id),
      name: coerceString(record.name),
      avatar: coerceString(record.avatar),
      inviteDecision: coerceString(record.inviteDecision ?? record.invite_decision),
      joinState: coerceString(record.joinState ?? record.join_state),
    });
  }
  return participants.length > 0 ? participants : undefined;
}

export function parseMeetingSignalContent(raw: string): MeetingSignalPayload | null {
  const content = (raw || "").trim();
  if (!content) return null;

  try {
    const parsed = JSON.parse(content);
    return normalizeMeetingSignalPayload(parsed);
  } catch {
    return null;
  }
}

export function normalizeMeetingSignalPayload(value: unknown): MeetingSignalPayload | null {
  const record = asRecord(value);
  if (!record) return null;

  const action = coerceString(record.action);
  const id = coerceString(record.id);
  if (!action || !id) return null;

  return {
    ver: coerceString(record.ver),
    action,
    id,
    threadId: coerceString(record.threadId ?? record.thread_id),
    mode: coerceString(record.mode),
    platform: coerceString(record.platform),
    meetingId: coerceString(record.meetingId ?? record.meeting_id),
    inviteState: coerceString(record.inviteState ?? record.invite_state),
    sessionState: coerceString(record.sessionState ?? record.session_state),
    reason: coerceString(record.reason),
    viewStatus: coerceString(record.viewStatus ?? record.view_status),
    acceptable: coerceBoolean(record.acceptable),
    rejectable: coerceBoolean(record.rejectable),
    durationSec: coerceNumber(record.durationSec ?? record.duration_sec),
    authToken: coerceString(record.authToken ?? record.auth_token),
    creatorUserId: coerceString(record.creatorUserId ?? record.creator_user_id),
  };
}

export function buildMeetingThreadSummaryFromSignal(
  signal: MeetingSignalPayload,
  existing?: ChatThreadMeetingSession
): ChatThreadMeetingSession {
  return {
    id: signal.id,
    mode: signal.mode || existing?.mode,
    inviteState: signal.inviteState || existing?.inviteState,
    sessionState: signal.sessionState || existing?.sessionState,
    closeReason: signal.reason || existing?.closeReason,
    viewStatus: signal.viewStatus || existing?.viewStatus,
    acceptable: signal.acceptable ?? existing?.acceptable ?? false,
    rejectable: signal.rejectable ?? existing?.rejectable ?? false,
    durationSec: signal.durationSec ?? existing?.durationSec ?? 0,
    creatorUserId: signal.creatorUserId || existing?.creatorUserId,
    participants: existing?.participants,
  };
}

export function buildMeetingRuntimeSessionFromSignal(input: {
  threadId: string;
  signal: MeetingSignalPayload;
  existing?: MeetingRuntimeSession;
  updatedAt?: string;
  lastMessageId?: string;
}): MeetingRuntimeSession | null {
  const threadId = (input.threadId || input.signal.threadId || "").trim();
  if (!threadId || !input.signal.id) return null;

  const summary = buildMeetingThreadSummaryFromSignal(input.signal, input.existing);
  return {
    ...input.existing,
    ...summary,
    id: input.signal.id,
    threadId,
    meetingId: input.signal.meetingId || input.existing?.meetingId,
    authToken: input.signal.authToken || input.existing?.authToken,
    platform: input.signal.platform || input.existing?.platform,
    reason: input.signal.reason || input.existing?.reason,
    action: input.signal.action || input.existing?.action,
    updatedAt: input.updatedAt || input.existing?.updatedAt,
    lastMessageId: input.lastMessageId || input.existing?.lastMessageId,
  };
}

export function buildMeetingRuntimeSessionFromThreadSummary(input: {
  threadId: string;
  summary: ChatThreadMeetingSession;
  existing?: MeetingRuntimeSession;
  updatedAt?: string;
}): MeetingRuntimeSession | null {
  const threadId = (input.threadId || "").trim();
  const summaryId = (input.summary?.id || "").trim();
  if (!threadId || !summaryId) return null;

  return {
    ...input.existing,
    ...input.summary,
    id: summaryId,
    threadId,
    meetingId: input.existing?.meetingId,
    authToken: input.existing?.authToken,
    platform: input.existing?.platform,
    reason: input.summary.closeReason || input.existing?.reason,
    action: input.existing?.action,
    updatedAt: input.updatedAt || input.existing?.updatedAt,
    lastMessageId: input.existing?.lastMessageId,
  };
}

export function buildMeetingRuntimeSessionFromOperationResponse(input: {
  response: unknown;
  fallbackThreadId?: string;
  existing?: MeetingRuntimeSession;
  updatedAt?: string;
}): MeetingRuntimeSession | null {
  const root = asRecord(input.response);
  const meetingSession = asRecord(root?.meetingSession ?? root?.meeting_session ?? input.response);
  if (!meetingSession) return null;

  const id = coerceString(meetingSession.id);
  const threadId = coerceString(meetingSession.threadId ?? meetingSession.thread_id) || input.fallbackThreadId;
  if (!id || !threadId) return null;

  return {
    ...input.existing,
    id,
    threadId,
    mode: coerceString(meetingSession.mode) || input.existing?.mode,
    inviteState: coerceString(meetingSession.inviteState ?? meetingSession.invite_state) || input.existing?.inviteState,
    sessionState:
      coerceString(meetingSession.sessionState ?? meetingSession.session_state) || input.existing?.sessionState,
    closeReason:
      coerceString(meetingSession.closeReason ?? meetingSession.close_reason) || input.existing?.closeReason,
    viewStatus:
      coerceString(root?.viewStatus ?? root?.view_status ?? meetingSession.viewStatus ?? meetingSession.view_status) ||
      input.existing?.viewStatus,
    acceptable:
      coerceBoolean(root?.acceptable ?? meetingSession.acceptable) ?? input.existing?.acceptable ?? false,
    rejectable:
      coerceBoolean(root?.rejectable ?? meetingSession.rejectable) ?? input.existing?.rejectable ?? false,
    durationSec:
      coerceNumber(root?.durationSec ?? root?.duration_sec ?? meetingSession.durationSec ?? meetingSession.duration_sec) ??
      input.existing?.durationSec ??
      0,
    creatorUserId:
      coerceString(meetingSession.creatorUserId ?? meetingSession.creator_user_id) || input.existing?.creatorUserId,
    participants: normalizeParticipants(meetingSession.participants) || input.existing?.participants,
    meetingId:
      coerceString(
        meetingSession.meetingId ??
          meetingSession.meeting_id ??
          meetingSession.platformMeetingId ??
          meetingSession.platform_meeting_id
      ) || input.existing?.meetingId,
    authToken:
      coerceString(root?.authToken ?? root?.auth_token ?? meetingSession.authToken ?? meetingSession.auth_token) ||
      input.existing?.authToken,
    platform: coerceString(meetingSession.platform ?? root?.platform) || input.existing?.platform,
    reason:
      coerceString(root?.reason ?? meetingSession.reason ?? meetingSession.closeReason ?? meetingSession.close_reason) ||
      input.existing?.reason,
    action: input.existing?.action,
    updatedAt: input.updatedAt || input.existing?.updatedAt,
    lastMessageId: input.existing?.lastMessageId,
  };
}

export function isMeetingViewTerminal(viewStatus?: string): boolean {
  const normalized = (viewStatus || "").trim().toLowerCase();
  return normalized === "ended" || normalized === "unanswered" || normalized === "failed" || normalized === "closed";
}

export function isMeetingSessionTerminal(session?: Pick<MeetingRuntimeSession, "viewStatus" | "inviteState" | "sessionState"> | null) {
  if (!session) return true;
  if (isMeetingViewTerminal(session.viewStatus)) return true;

  const inviteState = (session.inviteState || "").trim().toLowerCase();
  if (
    inviteState === "busy" ||
    inviteState === "rejected" ||
    inviteState === "cancelled" ||
    inviteState === "timeout" ||
    inviteState === "closed" ||
    inviteState === "unanswered"
  ) {
    return true;
  }

  return (session.sessionState || "").trim().toLowerCase() === "ended";
}

export function isIncomingMeetingSession(session?: MeetingRuntimeSession | null): boolean {
  if (!session || isMeetingSessionTerminal(session)) return false;
  return (session.viewStatus || "").trim().toLowerCase() === "ringing" && Boolean(session.acceptable);
}

export function isActiveMeetingSession(session?: MeetingRuntimeSession | null): boolean {
  if (!session || isMeetingSessionTerminal(session)) return false;
  return Boolean((session.authToken || "").trim() && (session.meetingId || "").trim());
}

function modeLabel(mode?: string): string {
  return (mode || "").trim().toLowerCase() === "audio" ? "Audio" : "Video";
}

export function getMeetingPreviewText(session: Pick<MeetingRuntimeSession, "mode" | "viewStatus" | "inviteState">): string {
  const prefix = `[${modeLabel(session.mode)} Call]`;
  const viewStatus = (session.viewStatus || "").trim().toLowerCase();
  if (viewStatus === "ringing") return `${prefix} Ringing`;
  if (viewStatus === "connecting") return `${prefix} Connecting`;
  if (viewStatus === "in_call") return `${prefix} In call`;
  if (viewStatus === "ended") return `${prefix} Ended`;
  if (viewStatus === "unanswered") return `${prefix} Unanswered`;
  if (viewStatus === "failed") return `${prefix} Failed`;
  if (viewStatus === "closed") return `${prefix} Closed`;

  const inviteState = (session.inviteState || "").trim().toLowerCase();
  if (inviteState === "ringing") return `${prefix} Ringing`;
  return prefix;
}

export function getMeetingPreviewTextFromMessageContent(raw: string): string | null {
  const signal = parseMeetingSignalContent(raw);
  return signal ? getMeetingPreviewText(signal) : null;
}

export function getMeetingThreadRoute(thread?: Pick<ChatThread, "id" | "isGroup"> | null): string {
  if (!thread?.id) return "/";
  return thread.isGroup ? `/group-chat/${thread.id}` : `/chat/${thread.id}`;
}

export function pickNewestMeetingSession(
  sessionsById: Record<string, MeetingRuntimeSession>,
  predicate: (session: MeetingRuntimeSession) => boolean
): MeetingRuntimeSession | null {
  let winner: MeetingRuntimeSession | null = null;
  let winnerTime = 0;

  for (const session of Object.values(sessionsById || {})) {
    if (!predicate(session)) continue;
    const timestamp = session.updatedAt ? Date.parse(session.updatedAt) : 0;
    if (!winner || timestamp >= winnerTime) {
      winner = session;
      winnerTime = timestamp;
    }
  }

  return winner;
}
