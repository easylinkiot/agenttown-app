import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system";
import * as LegacyFileSystem from "expo-file-system/legacy";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";

import { DEFAULT_MYBOT_AVATAR } from "@/src/constants/chat";
import {
  normalizeConversationDateTime,
  normalizeConversationMessageTimestamps,
  sortConversationMessagesChronologically,
} from "@/src/features/chat/chat-helpers";
import {
  friendAliasKeys,
  friendAliasStorageKey,
  normalizeFriendAliases,
  resolveFriendDisplayName as resolveFriendDisplayNameFromAliases,
} from "@/src/features/friends/alias";
import {
  extractMiniAppRuntimeContent,
  getMiniAppRuntimeType,
  mergeMiniAppRuntimeContent,
} from "@/src/features/miniapps/runtime";
import {
  acceptMeeting as acceptMeetingApi,
  addThreadMember as addThreadMemberApi,
  createAgent as createAgentApi,
  createChatThread,
  createCustomSkill as createCustomSkillApi,
  createFriend as createFriendApi,
  createTask as createTaskApi,
  createTaskFromMessage as createTaskFromMessageApi,
  deleteChatThread as deleteChatThreadApi,
  deleteCustomSkill as deleteCustomSkillApi,
  deleteAgent as deleteAgentApi,
  endMeeting as endMeetingApi,
  deleteFriend as deleteFriendApi,
  deleteMiniApp as deleteMiniAppApi,
  atCreateSession,
  executeCustomSkill as executeCustomSkillApi,
  fetchBootstrap,
  generateMiniApp as generateMiniAppApi,
  generateRoleReplies as generateRoleRepliesApi,
  installBotSkill as installBotSkillApi,
  installMiniApp as installMiniAppApi,
  installPresetMiniApp as installPresetMiniAppApi,
  leaveMeeting as leaveMeetingApi,
  listNPCs as listNPCsApi,
  listThreadMembers as listThreadMembersApi,
  listThreadMessages as listThreadMessagesApi,
  listChatThreads as listChatThreadsApi,
  listChatSessionMessages as listChatSessionMessagesApi,
  listV2ChatSessionMessages as listV2ChatSessionMessagesApi,
  getThreadDisplayLanguage as getThreadDisplayLanguageApi,
  patchCustomSkill as patchCustomSkillApi,
  patchTask as patchTaskApi,
  queryChatTargetHistory as queryChatTargetHistoryApi,
  removeThreadMember as removeThreadMemberApi,
  runMiniApp as runMiniAppApi,
  saveBotConfig,
  sendThreadMessage as sendThreadMessageApi,
  subscribeRealtime,
  toggleAgentSkill as toggleAgentSkillApi,
  updateThreadDisplayLanguage as updateThreadDisplayLanguageApi,
  uninstallBotSkill as uninstallBotSkillApi,
  mapATMessageToConversation,
  markThreadRead as markThreadReadApi,
  mapATSessionToThread,
  rejectMeeting as rejectMeetingApi,
  requestMeeting as requestMeetingApi,
  type AddThreadMemberInput,
  type ATChatMessage,
  type CreateAgentInput,
  type CreateCustomSkillInput,
  type MeetingRequestInput,
  type SendThreadMessageInput,
  type SendThreadMessageOutput,
  type V2ChatSessionMessage,
} from "@/src/lib/api";
import {
  buildMeetingRuntimeSessionFromOperationResponse,
  buildMeetingRuntimeSessionFromSignal,
  buildMeetingRuntimeSessionFromThreadSummary,
  getMeetingPreviewText,
  getMeetingPreviewTextFromMessageContent,
  isActiveMeetingSession,
  isIncomingMeetingSession,
  isMeetingSessionTerminal,
  parseMeetingSignalContent,
  pickNewestMeetingSession,
} from "@/src/features/meeting/meeting-helpers";
import {
  Agent,
  AppLanguage,
  BotConfig,
  ChatThread,
  ChatThreadMeetingSession,
  ConversationMessage,
  CustomSkill,
  Friend,
  MeetingRuntimeSession,
  MiniApp,
  MiniAppTemplate,
  NPC,
  RealtimeEvent,
  SkillCatalogItem,
  TaskItem,
  ThreadDisplayLanguage,
  ThreadMember,
  UiTheme,
} from "@/src/types";

import { useAuth } from "@/src/state/auth-context";
import { isE2ETestMode } from "@/src/utils/e2e";
import { notifyMentionReceived } from "@/src/services/chat-notifications";
import { isRemotePushRegistrationActive } from "@/src/services/push-registration";
import {
  clearTaskReminderNotifications,
  ensureTaskReminderPermission,
  syncTaskReminderNotifications,
} from "@/src/services/task-notifications";

interface AgentTownContextValue {
  botConfig: BotConfig;
  tasks: TaskItem[];
  chatThreads: ChatThread[];
  messagesByThread: Record<string, ConversationMessage[]>;
  friends: Friend[];
  friendAliases: Record<string, string>;
  threadMembers: Record<string, ThreadMember[]>;
  agents: Agent[];
  skillCatalog: SkillCatalogItem[];
  customSkills: CustomSkill[];
  miniApps: MiniApp[];
  miniAppTemplates: MiniAppTemplate[];
  miniAppGeneration: {
    active: boolean;
    stage: string;
    progress: number;
  };
  myHouseType: number;
  uiTheme: UiTheme;
  language: AppLanguage;
  threadLanguageById: Record<string, ThreadDisplayLanguage>;
  voiceModeEnabled: boolean;
  bootstrapReady: boolean;
  meetingSessionsById: Record<string, MeetingRuntimeSession>;
  incomingMeetingSession: MeetingRuntimeSession | null;
  activeMeetingSession: MeetingRuntimeSession | null;
  updateBotConfig: (next: BotConfig) => void;
  addTask: (task: TaskItem) => void;
  addChatThread: (thread: ChatThread) => void;
  removeChatThread: (threadId: string) => Promise<void>;
  updateHouseType: (next: number) => void;
  updateUiTheme: (next: UiTheme) => void;
  updateLanguage: (next: AppLanguage) => void;
  updateThreadLanguage: (threadId: string, next: ThreadDisplayLanguage) => Promise<void>;
  updateVoiceModeEnabled: (next: boolean) => void;
  refreshAll: () => Promise<void>;
  refreshThreadMessages: (
    threadId: string,
    options?: { preferV2SessionApi?: boolean }
  ) => Promise<void>;
  loadOlderMessages: (threadId: string) => Promise<number>;
  sendMessage: (threadId: string, payload: SendThreadMessageInput) => Promise<SendThreadMessageOutput | null>;
  requestMeeting: (input: MeetingRequestInput) => Promise<MeetingRuntimeSession | null>;
  acceptMeeting: (meetingSessionId: string) => Promise<MeetingRuntimeSession | null>;
  rejectMeeting: (meetingSessionId: string, reason?: string) => Promise<MeetingRuntimeSession | null>;
  leaveMeeting: (meetingSessionId: string, reason?: string) => Promise<MeetingRuntimeSession | null>;
  endMeeting: (meetingSessionId: string, reason?: string) => Promise<MeetingRuntimeSession | null>;
  createFriend: (input: {
    userId: string;
    name?: string;
    avatar?: string;
    kind?: "human" | "bot";
    role?: string;
    company?: string;
    threadId?: string;
  }) => Promise<Friend | null>;
  setFriendAlias: (friend: Friend, alias: string) => Promise<void>;
  resolveFriendDisplayName: (friend: Friend | null | undefined, fallback?: string) => string;
  removeFriend: (friendId: string) => Promise<void>;
  createAgent: (input: CreateAgentInput) => Promise<Agent | null>;
  removeAgent: (agentId: string) => Promise<void>;
  toggleAgentSkill: (agentId: string, skillId: string, install: boolean) => Promise<void>;
  toggleBotSkill: (skillId: string, install: boolean) => Promise<void>;
  createGroup: (input: {
    name: string;
    avatar?: string;
    memberCount?: number;
    groupType?: "toc" | "tob";
    groupSubCategory?: string;
    groupNpcName?: string;
    groupCommanderUserId?: string;
  }) => Promise<ChatThread | null>;
  listMembers: (threadId: string) => Promise<void>;
  addMember: (threadId: string, input: AddThreadMemberInput) => Promise<void>;
  removeMember: (threadId: string, memberId: string) => Promise<void>;
  createTaskFromMessage: (threadId: string, messageId: string, title?: string) => Promise<TaskItem | null>;
  updateTask: (taskId: string, patch: {
    title?: string;
    assignee?: string;
    priority?: "High" | "Medium" | "Low";
    status?: "Pending" | "In Progress" | "Done";
    dueAt?: string;
  }) => Promise<void>;
  createCustomSkill: (input: CreateCustomSkillInput) => Promise<CustomSkill | null>;
  patchCustomSkill: (
    skillId: string,
    patch: Partial<CreateCustomSkillInput> & { enabled?: boolean }
  ) => Promise<CustomSkill | null>;
  removeCustomSkill: (skillId: string) => Promise<void>;
  executeCustomSkill: (
    skillId: string,
    input: string,
    threadId?: string,
    variables?: Record<string, unknown>
  ) => Promise<string | null>;
  generateRoleReplies: (
    threadId: string,
    prompt: string,
    options?: { memberIds?: string[]; mentionedAll?: boolean; includeMyBot?: boolean }
  ) => Promise<ConversationMessage[]>;
  markThreadRead: (threadId: string, lastReadSeqNo?: number) => Promise<void>;
  generateMiniApp: (query: string, sources: string[]) => Promise<MiniApp | null>;
  installMiniApp: (appId: string, install?: boolean) => Promise<void>;
  installPresetMiniApp: (presetKey: "news" | "price" | "words") => Promise<MiniApp>;
  runMiniApp: (
    appId: string,
    input: string,
    params?: Record<string, unknown>,
    threadId?: string
  ) => Promise<string | null>;
  removeMiniApp: (appId: string) => Promise<void>;
}

const MESSAGE_PAGE_SIZE = 10;
const MESSAGE_RENDER_WINDOW = 160;
const MESSAGE_CACHE_LIMIT = 2000;
const THREAD_LANGUAGE_STORAGE_PREFIX = "agenttown.thread.display.language";
const APP_LANGUAGE_STORAGE_KEY = "agenttown.app.language";

function isThreadDisplayLanguage(value: unknown): value is ThreadDisplayLanguage {
  return value === "zh" || value === "en" || value === "de";
}

function normalizeThreadLanguageMap(value: unknown): Record<string, ThreadDisplayLanguage> {
  if (!value || typeof value !== "object") return {};
  const normalized: Record<string, ThreadDisplayLanguage> = {};
  for (const [threadId, language] of Object.entries(value as Record<string, unknown>)) {
    const id = threadId.trim();
    if (!id) continue;
    if (!isThreadDisplayLanguage(language)) continue;
    normalized[id] = language;
  }
  return normalized;
}

function safeThreadKey(threadId: string) {
  return threadId.trim().replace(/[^a-zA-Z0-9_-]/g, "_");
}

function safeUserKey(userId: string) {
  const key = userId.trim().replace(/[^a-zA-Z0-9_-]/g, "_");
  return key || "anonymous";
}

function threadLanguageStorageKey(userId: string) {
  return `${THREAD_LANGUAGE_STORAGE_PREFIX}:${safeUserKey(userId)}`;
}

function isAppLanguage(value: unknown): value is AppLanguage {
  return value === "zh" || value === "en" || value === "de";
}

function cacheDir() {
  // expo-file-system document paths are not stable on web; disable file cache there.
  if (Platform.OS === "web") return null;
  try {
    const base = FileSystem.Paths?.document?.uri;
    if (!base) return null;
    return `${base}agenttown_cache/messages`;
  } catch {
    return null;
  }
}

async function ensureCacheDir() {
  const dir = cacheDir();
  if (!dir) return null;
  try {
    const info = await LegacyFileSystem.getInfoAsync(dir);
    if (!info.exists) {
      await LegacyFileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }
  } catch {
    // ignore
  }
  return dir;
}

function cachePath(userId: string, threadId: string) {
  const dir = cacheDir();
  if (!dir) return null;
  return `${dir}/${safeUserKey(userId)}__${safeThreadKey(threadId)}.json`;
}

async function readThreadCache(userId: string, threadId: string): Promise<ConversationMessage[] | null> {
  try {
    const path = cachePath(userId, threadId);
    if (!path) return null;
    const info = await LegacyFileSystem.getInfoAsync(path);
    if (!info.exists) return null;
    const raw = await LegacyFileSystem.readAsStringAsync(path);
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed as ConversationMessage[];
  } catch {
    return null;
  }
}

async function writeThreadCache(userId: string, threadId: string, messages: ConversationMessage[]) {
  try {
    const dir = await ensureCacheDir();
    const path = cachePath(userId, threadId);
    if (!dir || !path) return;
    const next = messages.length > MESSAGE_CACHE_LIMIT ? messages.slice(-MESSAGE_CACHE_LIMIT) : messages;
    await LegacyFileSystem.writeAsStringAsync(path, JSON.stringify(next));
  } catch {
    // ignore
  }
}

function mergeAppendUnique(base: ConversationMessage[], incoming: ConversationMessage[]) {
  const seen = new Set(base.map((m) => m.id));
  const next = [...base];
  for (const msg of incoming) {
    if (!msg?.id) continue;
    if (seen.has(msg.id)) continue;
    seen.add(msg.id);
    next.push(msg);
  }
  return next;
}

function mergeMessagesPreferIncoming(base: ConversationMessage[], incoming: ConversationMessage[]) {
  const byId = new Map<string, ConversationMessage>();
  for (const message of base) {
    if (!message?.id) continue;
    byId.set(message.id, message);
  }
  for (const message of incoming) {
    if (!message?.id) continue;
    byId.set(message.id, message);
  }
  return Array.from(byId.values());
}

function mergePrependUnique(base: ConversationMessage[], incoming: ConversationMessage[]) {
  const seen = new Set(base.map((m) => m.id));
  const head: ConversationMessage[] = [];
  for (const msg of incoming) {
    if (!msg?.id) continue;
    if (seen.has(msg.id)) continue;
    seen.add(msg.id);
    head.push(msg);
  }
  return sortConversationMessagesChronologically([...head, ...base]);
}

async function upsertThreadCache(userId: string, threadId: string, messages: ConversationMessage[]) {
  if (!threadId || messages.length === 0) return;
  const cached = (await readThreadCache(userId, threadId)) || [];
  const merged = mergeAppendUnique(cached, messages);
  await writeThreadCache(userId, threadId, merged);
}

const defaultBotConfig: BotConfig = {
  name: "MyBot",
  avatar: DEFAULT_MYBOT_AVATAR,
  systemInstruction:
    "You are a helpful and friendly digital assistant living in UsChat.",
  documents: [],
  installedSkillIds: ["skill_task_decomposer", "skill_code_assistant"],
  knowledgeKeywords: ["startup", "product", "execution"],
};

const defaultTasks: TaskItem[] = [];
const defaultChatThreads: ChatThread[] = [];
const defaultMessagesByThread: Record<string, ConversationMessage[]> = {};

const defaultFriends: Friend[] = [];
const defaultThreadMembers: Record<string, ThreadMember[]> = {};
const defaultAgents: Agent[] = [];
const defaultSkills: SkillCatalogItem[] = [];
const defaultCustomSkills: CustomSkill[] = [];
const defaultMiniApps: MiniApp[] = [];
const defaultMiniAppTemplates: MiniAppTemplate[] = [];

const AgentTownContext = createContext<AgentTownContextValue | null>(null);

function upsertById<T extends { id: string }>(
  list: T[],
  item: T,
  placeAtFront = true
): T[] {
  const rest = list.filter((entry) => entry.id !== item.id);
  return placeAtFront ? [item, ...rest] : [...rest, item];
}

function removeById<T extends { id: string }>(list: T[], id: string): T[] {
  return list.filter((entry) => entry.id !== id);
}

function normalizeLabel(value?: string | null) {
  return (value || "").trim().toLowerCase();
}

function findMatchingGroupNpc(npcs: NPC[], currentUserId: string, groupNpcName: string) {
  const normalizedName = normalizeLabel(groupNpcName);
  if (!normalizedName) return null;
  const matches = npcs.filter((npc) => normalizeLabel(npc.name) === normalizedName);
  if (matches.length === 0) return null;
  const owned = matches.find((npc) => (npc.ownerUserId || "").trim() === currentUserId);
  return owned || matches[0] || null;
}

export function isMyBotThreadId(threadId: string): boolean {
  const id = (threadId || "").trim().toLowerCase();
  if (!id) return false;
  return id === "mybot" || id === "agent_mybot" || id.startsWith("agent_userbot_");
}

function isLegacySessionThreadId(threadId: string) {
  return /^sess_/i.test((threadId || "").trim());
}

export function syncMyBotThreads(threads: ChatThread[], config: BotConfig): ChatThread[] {
  if (!Array.isArray(threads) || threads.length === 0) return threads;

  const nextName = (config.name || "").trim();
  const nextAvatar = (config.avatar || "").trim();
  let changed = false;

  const nextThreads = threads.map((thread) => {
    if (!isMyBotThreadId(thread.id)) return thread;

    const mergedName = nextName || thread.name;
    const mergedAvatar = nextAvatar || thread.avatar || DEFAULT_MYBOT_AVATAR;
    if (thread.name === mergedName && thread.avatar === mergedAvatar) return thread;

    changed = true;
    return {
      ...thread,
      name: mergedName,
      avatar: mergedAvatar,
    };
  });

  return changed ? nextThreads : threads;
}

function updateThreadPreview(threads: ChatThread[], threadId: string, preview: string): ChatThread[] {
  const next = [...threads];
  const index = next.findIndex((item) => item.id === threadId);
  if (index < 0) return next;

  const updated: ChatThread = {
    ...next[index],
    message: preview,
    time: "Now",
  };

  next.splice(index, 1);
  next.unshift(updated);
  return next;
}

function updateThreadMeetingSession(
  threads: ChatThread[],
  threadId: string,
  meetingSession: ChatThreadMeetingSession
): ChatThread[] {
  return threads.map((thread) =>
    thread.id === threadId
      ? {
          ...thread,
          meetingSession,
        }
      : thread
  );
}

function updateThreadUnreadState(
  threads: ChatThread[],
  threadId: string,
  patch: { unreadCount?: number; incrementBy?: number; highlight?: boolean }
) {
  return threads.map((thread) => {
    if (thread.id !== threadId) return thread;
    const baseUnread = typeof thread.unreadCount === "number" ? thread.unreadCount : 0;
    const nextUnread =
      typeof patch.unreadCount === "number"
        ? Math.max(0, patch.unreadCount)
        : Math.max(0, baseUnread + (patch.incrementBy || 0));
    return {
      ...thread,
      unreadCount: nextUnread,
      highlight: typeof patch.highlight === "boolean" ? patch.highlight : thread.highlight,
    };
  });
}

function syncDirectThreadFromFriend(threads: ChatThread[], friend: Friend): ChatThread[] {
  const threadId = (friend.threadId || "").trim();
  const friendUserId = (friend.userId || "").trim();
  if (!threadId) return threads;

  let changed = false;
  const nextThreads = threads.map((thread) => {
    if (thread.id !== threadId) return thread;

    const nextName = (friend.name || "").trim() || thread.name;
    const nextAvatar = (friend.avatar || "").trim() || thread.avatar;
    const nextTargetType = thread.targetType || "user";
    const nextTargetId = friendUserId || thread.targetId;

    if (
      thread.name === nextName &&
      thread.avatar === nextAvatar &&
      thread.targetType === nextTargetType &&
      thread.targetId === nextTargetId
    ) {
      return thread;
    }

    changed = true;
    return {
      ...thread,
      name: nextName,
      avatar: nextAvatar,
      targetType: nextTargetType,
      targetId: nextTargetId,
    };
  });

  if (changed) return nextThreads;

  return upsertById(
    threads,
    {
      id: threadId,
      name: (friend.name || "").trim() || "Direct chat",
      avatar: (friend.avatar || "").trim(),
      message: "",
      time: "Now",
      isGroup: false,
      targetType: "user",
      targetId: friendUserId,
    },
    true
  );
}

function mergeThreadsById(...lists: ChatThread[][]): ChatThread[] {
  const order: string[] = [];
  const byId = new Map<string, ChatThread>();
  for (const list of lists) {
    for (const thread of list) {
      if (!thread?.id) continue;
      const prev = byId.get(thread.id);
      if (!prev) {
        byId.set(thread.id, thread);
        order.push(thread.id);
        continue;
      }
      byId.set(thread.id, {
        ...prev,
        ...thread,
        targetType: thread.targetType || prev.targetType,
        targetId: thread.targetId || prev.targetId,
      });
    }
  }
  return order.map((id) => byId.get(id)).filter((thread): thread is ChatThread => Boolean(thread));
}

function pickGroupOwnerId(thread?: ChatThread) {
  if (!thread) return "";
  const alias = thread as ChatThread & {
    group_commander_user_id?: string;
    commanderUserId?: string;
    ownerUserId?: string;
    owner_user_id?: string;
    createdByUserId?: string;
    created_by_user_id?: string;
    creatorUserId?: string;
    creator_user_id?: string;
  };
  const candidates = [
    thread.groupCommanderUserId,
    alias.group_commander_user_id,
    alias.commanderUserId,
    alias.ownerUserId,
    alias.owner_user_id,
    alias.createdByUserId,
    alias.created_by_user_id,
    alias.creatorUserId,
    alias.creator_user_id,
  ];
  for (const value of candidates) {
    const id = (value || "").trim();
    if (id) return id;
  }
  return "";
}

function normalizeLooseDateTime(value: unknown) {
  return normalizeConversationDateTime(value);
}

function mapV2SessionMessageToConversation(
  row: V2ChatSessionMessage,
  currentUserId: string,
  threadId: string,
  index: number
): ConversationMessage {
  const role = (row.role || "").trim().toLowerCase();
  const isUserRole = role === "user";
  const senderName = isUserRole ? "Me" : role === "assistant" ? "Assistant" : "System";
  const senderType = isUserRole ? "human" : role === "assistant" ? "agent" : "system";
  const createdAt = normalizeLooseDateTime(row.created_at);
  const updatedAt = normalizeLooseDateTime(row.updated_at);
  const timestamp = updatedAt || createdAt || new Date().toISOString();
  const fallbackId = `${threadId}_v2_${index}_${Date.now()}`;
  return {
    id: (row.id || "").trim() || fallbackId,
    threadId,
    senderId: isUserRole ? currentUserId : role === "assistant" ? "assistant" : "system",
    senderName,
    senderAvatar: "",
    senderType,
    content: (row.content || "").trim(),
    type: (row.message_type || "text").trim() || "text",
    isMe: isUserRole && Boolean(currentUserId),
    time: timestamp,
    createdAt: createdAt || undefined,
    updatedAt: updatedAt || undefined,
    receivedAt: timestamp,
  };
}

function previewMessage(message: ConversationMessage): string {
  if (message.type === "meeting") {
    return getMeetingPreviewTextFromMessageContent(message.content) || "[Call]";
  }
  if (message.type === "image") {
    return message.content ? `[Image] ${message.content}` : "[Image]";
  }
  if (message.type === "video") {
    return "[Video]";
  }
  if (message.type === "voice") {
    return "[Voice]";
  }
  return message.content;
}

function normalizeMessageForUser(message: ConversationMessage, userID: string): ConversationMessage {
  const normalized = normalizeConversationMessageTimestamps(message);
  const senderID = (message.senderId || "").trim();
  const current = (userID || "").trim();
  const isMe = senderID !== "" && current !== "" ? senderID === current : Boolean(message.isMe);
  return {
    ...normalized,
    isMe,
  };
}

function normalizeMessagesForUser(messages: ConversationMessage[], userID: string) {
  return messages.map((message) => normalizeMessageForUser(message, userID));
}

function normalizeMessagesByThreadForUser(
  messagesByThread: Record<string, ConversationMessage[]>,
  userID: string
) {
  const nextEntries: Record<string, ConversationMessage[]> = {};
  for (const [threadId, messages] of Object.entries(messagesByThread || {})) {
    nextEntries[threadId] = sortConversationMessagesChronologically(normalizeMessagesForUser(messages, userID));
  }
  return nextEntries;
}

function pickMessagesForThreadFromTargetHistory(rows: ATChatMessage[], threadId: string) {
  const matching = rows.filter((row) => {
    const sessionId = (row.session_id || "").trim();
    return !sessionId || sessionId === threadId;
  });
  if (matching.length > 0) return matching;
  const hasForeignSession = rows.some((row) => {
    const sessionId = (row.session_id || "").trim();
    return sessionId && sessionId !== threadId;
  });
  return hasForeignSession ? [] : rows;
}

function stampMissingReceivedAt(
  messages: ConversationMessage[],
  knownMessageIds: Set<string>,
  baseTimestamp = Date.now()
) {
  let offset = 0;
  return messages.map((message) => {
    const normalized = normalizeConversationMessageTimestamps(message);
    if (normalized.receivedAt || normalized.createdAt || normalized.updatedAt || knownMessageIds.has(normalized.id)) {
      return normalized;
    }
    const receivedAt = new Date(baseTimestamp + offset).toISOString();
    offset += 1;
    return {
      ...normalized,
      receivedAt,
    };
  });
}

function syncCurrentUserProfileInMessages(
  messagesByThread: Record<string, ConversationMessage[]>,
  userID: string,
  displayName?: string,
  avatar?: string
) {
  const currentUserId = (userID || "").trim();
  const nextDisplayName = (displayName || "").trim();
  const nextAvatar = (avatar || "").trim();
  if (!currentUserId || (!nextDisplayName && !nextAvatar)) {
    return messagesByThread;
  }

  let changed = false;
  const nextEntries: Record<string, ConversationMessage[]> = {};
  for (const [threadId, messages] of Object.entries(messagesByThread)) {
    let threadChanged = false;
    const nextMessages = messages.map((message) => {
      const senderId = (message.senderId || "").trim();
      const isOwnMessage = senderId ? senderId === currentUserId : Boolean(message.isMe);
      if (!isOwnMessage) return message;

      const mergedName = nextDisplayName || message.senderName || "";
      const mergedAvatar = nextAvatar || message.senderAvatar || "";
      if (message.senderName === mergedName && message.senderAvatar === mergedAvatar) {
        return message;
      }

      threadChanged = true;
      return {
        ...message,
        senderName: mergedName,
        senderAvatar: mergedAvatar,
      };
    });
    nextEntries[threadId] = threadChanged ? nextMessages : messages;
    changed = changed || threadChanged;
  }

  return changed ? nextEntries : messagesByThread;
}

function syncCurrentUserProfileInThreadMembers(
  threadMembers: Record<string, ThreadMember[]>,
  userID: string,
  displayName?: string,
  avatar?: string
) {
  const currentUserId = (userID || "").trim();
  const nextDisplayName = (displayName || "").trim();
  const nextAvatar = (avatar || "").trim();
  if (!currentUserId || (!nextDisplayName && !nextAvatar)) {
    return threadMembers;
  }

  let changed = false;
  const nextEntries: Record<string, ThreadMember[]> = {};
  for (const [threadId, members] of Object.entries(threadMembers)) {
    let threadChanged = false;
    const nextMembers = members.map((member) => {
      const isSelfMember = member.memberType === "human" && (member.id || "").trim() === currentUserId;
      if (!isSelfMember) return member;

      const mergedName = nextDisplayName || member.name || "";
      const mergedAvatar = nextAvatar || member.avatar || "";
      if (member.name === mergedName && member.avatar === mergedAvatar) {
        return member;
      }

      threadChanged = true;
      return {
        ...member,
        name: mergedName,
        avatar: mergedAvatar,
      };
    });
    nextEntries[threadId] = threadChanged ? nextMembers : members;
    changed = changed || threadChanged;
  }

  return changed ? nextEntries : threadMembers;
}

export function AgentTownProvider({ children }: { children: React.ReactNode }) {
  const isE2E = isE2ETestMode();
  const { isSignedIn, user } = useAuth();
  const userID = (user?.id || "").trim();

  const [botConfig, setBotConfig] = useState<BotConfig>(defaultBotConfig);
  const [tasks, setTasks] = useState<TaskItem[]>(defaultTasks);
  const [chatThreads, setChatThreads] = useState<ChatThread[]>(defaultChatThreads);
  const chatThreadsRef = useRef<ChatThread[]>(defaultChatThreads);
  useEffect(() => {
    chatThreadsRef.current = chatThreads;
  }, [chatThreads]);
  const [messagesByThread, setMessagesByThread] =
    useState<Record<string, ConversationMessage[]>>(defaultMessagesByThread);
  const messagesByThreadRef = useRef<Record<string, ConversationMessage[]>>(defaultMessagesByThread);
  const historyCursorByThreadRef = useRef<Record<string, string | null>>({});
  useEffect(() => {
    messagesByThreadRef.current = messagesByThread;
  }, [messagesByThread]);
  useEffect(() => {
    if (!userID) return;
    setMessagesByThread((previous) =>
      syncCurrentUserProfileInMessages(previous, userID, user?.displayName, user?.avatar)
    );
    setThreadMembers((previous) =>
      syncCurrentUserProfileInThreadMembers(previous, userID, user?.displayName, user?.avatar)
    );
  }, [user?.avatar, user?.displayName, userID]);
  const [friends, setFriends] = useState<Friend[]>(defaultFriends);
  const friendsRef = useRef<Friend[]>(defaultFriends);
  useEffect(() => {
    friendsRef.current = friends;
  }, [friends]);
  const [friendAliases, setFriendAliases] = useState<Record<string, string>>({});
  const [threadMembers, setThreadMembers] =
    useState<Record<string, ThreadMember[]>>(defaultThreadMembers);
  const [agents, setAgents] = useState<Agent[]>(defaultAgents);
  const [skillCatalog, setSkillCatalog] = useState<SkillCatalogItem[]>(defaultSkills);
  const [customSkills, setCustomSkills] = useState<CustomSkill[]>(defaultCustomSkills);
  const [miniApps, setMiniApps] = useState<MiniApp[]>(defaultMiniApps);
  const [miniAppTemplates, setMiniAppTemplates] =
    useState<MiniAppTemplate[]>(defaultMiniAppTemplates);
  const [miniAppGeneration, setMiniAppGeneration] = useState({
    active: false,
    stage: "idle",
    progress: 0,
  });
  const [myHouseType, setMyHouseType] = useState<number>(3);
  const [uiTheme, setUiTheme] = useState<UiTheme>("neo");
  const [language, setLanguage] = useState<AppLanguage>("en");
  const [threadLanguageById, setThreadLanguageById] = useState<Record<string, ThreadDisplayLanguage>>({});
  const [voiceModeEnabled, setVoiceModeEnabled] = useState(false);
  const [bootstrapReady, setBootstrapReady] = useState(false);
  const [meetingSessionsById, setMeetingSessionsById] = useState<Record<string, MeetingRuntimeSession>>({});
  const meetingSessionsRef = useRef<Record<string, MeetingRuntimeSession>>({});
  useEffect(() => {
    meetingSessionsRef.current = meetingSessionsById;
  }, [meetingSessionsById]);
  const notificationSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const threadLanguageSyncSignatureRef = useRef("");
  const explicitLanguagePreferenceRef = useRef(false);
  const threadReadSyncStateRef = useRef<
    Record<string, { lastAckedSeqNo?: number; inflightSeqNo?: number }>
  >({});

  useEffect(() => {
    threadReadSyncStateRef.current = {};
  }, []);

  const persistThreadLanguageMap = useCallback(
    async (next: Record<string, ThreadDisplayLanguage>) => {
      if (!isSignedIn || !userID) return;
      try {
        await AsyncStorage.setItem(threadLanguageStorageKey(userID), JSON.stringify(next));
      } catch {
        // Ignore persistence failure.
      }
    },
    [isSignedIn, userID]
  );

  const persistFriendAliases = useCallback(
    async (next: Record<string, string>) => {
      if (!isSignedIn || !userID) return;
      try {
        await AsyncStorage.setItem(friendAliasStorageKey(userID), JSON.stringify(next));
      } catch {
        // Ignore persistence failure.
      }
    },
    [isSignedIn, userID]
  );

  const persistAppLanguage = useCallback(async (next: AppLanguage) => {
    try {
      await AsyncStorage.setItem(APP_LANGUAGE_STORAGE_KEY, next);
    } catch {
      // Ignore persistence failure.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const raw = await AsyncStorage.getItem(APP_LANGUAGE_STORAGE_KEY);
        if (cancelled) return;
        if (!isAppLanguage(raw)) return;
        explicitLanguagePreferenceRef.current = true;
        setLanguage(raw);
      } catch {
        // Ignore persistence failure.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const markThreadRead = useCallback(async (threadId: string, lastReadSeqNo?: number) => {
    const normalizedThreadID = threadId.trim();
    if (!normalizedThreadID) return;
    if (typeof lastReadSeqNo !== "number" || !Number.isFinite(lastReadSeqNo)) {
      return;
    }

    const nextSeqNo = Math.trunc(lastReadSeqNo);
    const syncState = threadReadSyncStateRef.current[normalizedThreadID] || {};
    if (typeof syncState.lastAckedSeqNo === "number" && syncState.lastAckedSeqNo >= nextSeqNo) {
      return;
    }
    if (syncState.inflightSeqNo === nextSeqNo) {
      return;
    }

    threadReadSyncStateRef.current[normalizedThreadID] = {
      ...syncState,
      inflightSeqNo: nextSeqNo,
    };

    try {
      const response = await markThreadReadApi(normalizedThreadID, {
        lastReadSeqNo: nextSeqNo,
      });
      threadReadSyncStateRef.current[normalizedThreadID] = {
        lastAckedSeqNo: nextSeqNo,
      };
      setChatThreads((prev) =>
        updateThreadUnreadState(prev, normalizedThreadID, {
          unreadCount: typeof response.unreadCount === "number" ? response.unreadCount : 0,
          highlight: Boolean((response.mentionUnreadCount || 0) > 0),
        })
      );
    } catch {
      const current = threadReadSyncStateRef.current[normalizedThreadID];
      if (!current) return;
      threadReadSyncStateRef.current[normalizedThreadID] = {
        lastAckedSeqNo: current.lastAckedSeqNo,
      };
      // Ignore read sync failure.
    }
  }, []);

  const patchThreadLanguageMap = useCallback(
    (
      patcher: (
        previous: Record<string, ThreadDisplayLanguage>
      ) => Record<string, ThreadDisplayLanguage>
    ) => {
      setThreadLanguageById((previous) => {
        const next = patcher(previous);
        if (next === previous) return previous;
        void persistThreadLanguageMap(next);
        return next;
      });
    },
    [persistThreadLanguageMap]
  );

  const shouldUseThreadMessageCache = useCallback((threadId: string) => {
    const id = threadId.trim();
    if (!id) return true;

    const thread = chatThreadsRef.current.find((item) => item.id === id);
    const targetType = (thread?.targetType || "").trim().toLowerCase();
    if (targetType === "user") return false;

    if (friendsRef.current.some((friend) => (friend.threadId || "").trim() === id && friend.kind === "human")) {
      return false;
    }

    return true;
  }, []);

  const syncMeetingSessionToState = useCallback(
    (nextSession: MeetingRuntimeSession, options?: { updatePreview?: boolean; reorderThread?: boolean }) => {
      if (!nextSession?.id || !nextSession.threadId) return;

      setMeetingSessionsById((prev) => ({
        ...prev,
        [nextSession.id]: nextSession,
      }));

      const nextSummary: ChatThreadMeetingSession = {
        id: nextSession.id,
        mode: nextSession.mode,
        inviteState: nextSession.inviteState,
        sessionState: nextSession.sessionState,
        closeReason: nextSession.closeReason || nextSession.reason,
        viewStatus: nextSession.viewStatus,
        acceptable: nextSession.acceptable,
        rejectable: nextSession.rejectable,
        durationSec: nextSession.durationSec,
        creatorUserId: nextSession.creatorUserId,
        participants: nextSession.participants,
      };

      setChatThreads((prev) => {
        let nextThreads = updateThreadMeetingSession(prev, nextSession.threadId, nextSummary);
        if (options?.updatePreview) {
          nextThreads = updateThreadPreview(nextThreads, nextSession.threadId, getMeetingPreviewText(nextSession));
        }
        return nextThreads;
      });
    },
    []
  );

  const hydrateMeetingSessionsFromThreads = useCallback(
    (threads: ChatThread[]) => {
      for (const thread of threads) {
        const summary = thread.meetingSession;
        if (!summary?.id) continue;
        const existing = meetingSessionsRef.current[summary.id];
        const nextSession = buildMeetingRuntimeSessionFromThreadSummary({
          threadId: thread.id,
          summary,
          existing,
          updatedAt: existing?.updatedAt || new Date().toISOString(),
        });
        if (!nextSession) continue;
        syncMeetingSessionToState(nextSession);
      }
    },
    [syncMeetingSessionToState]
  );

  const applyMeetingSignalMessage = useCallback(
    (message: ConversationMessage, fallbackThreadId: string, receivedAt?: string) => {
      const signal = parseMeetingSignalContent(message.content);
      if (!signal?.id) return null;
      const threadId = (signal.threadId || fallbackThreadId || "").trim();
      if (!threadId) return null;
      const existing = meetingSessionsRef.current[signal.id];
      const nextSession = buildMeetingRuntimeSessionFromSignal({
        threadId,
        signal,
        existing,
        updatedAt: receivedAt || message.receivedAt || new Date().toISOString(),
        lastMessageId: message.id,
      });
      if (!nextSession) return null;
      syncMeetingSessionToState(nextSession, { updatePreview: true });
      return nextSession;
    },
    [syncMeetingSessionToState]
  );

  const upsertMeetingOperationSession = useCallback(
    (response: unknown, fallbackThreadId?: string) => {
      const existingSession = fallbackThreadId
        ? pickNewestMeetingSession(
            meetingSessionsRef.current,
            (session) => session.threadId === fallbackThreadId && !isMeetingSessionTerminal(session)
          )
        : null;
      const nextSession = buildMeetingRuntimeSessionFromOperationResponse({
        response,
        fallbackThreadId,
        existing: existingSession || undefined,
        updatedAt: new Date().toISOString(),
      });
      if (!nextSession) return null;
      syncMeetingSessionToState(nextSession, { updatePreview: true, reorderThread: true });
      return nextSession;
    },
    [syncMeetingSessionToState]
  );

  const incomingMeetingSession = useMemo(
    () => pickNewestMeetingSession(meetingSessionsById, (session) => isIncomingMeetingSession(session)),
    [meetingSessionsById]
  );
  const activeMeetingSession = useMemo(
    () => pickNewestMeetingSession(meetingSessionsById, (session) => isActiveMeetingSession(session)),
    [meetingSessionsById]
  );

  const refreshAll = useCallback(async () => {
    const [bootstrapResult, threadsResult] = await Promise.allSettled([
      fetchBootstrap(),
      // Home does not need to call /v1/chat/sessions for now.
      // listChatSessionsApi({ limit: 200 }),
      listChatThreadsApi(),
    ]);
    const payload = bootstrapResult.status === "fulfilled" ? bootstrapResult.value : null;

    // const sessionThreads =
    //   sessionsResult.status === "fulfilled"
    //     ? sessionsResult.value.map((session) => mapATSessionToThread(session))
    //     : [];
    const listedThreads = threadsResult.status === "fulfilled" && Array.isArray(threadsResult.value)
      ? threadsResult.value
      : [];
    const mergedThreadsRaw = mergeThreadsById(listedThreads);
    const currentById = new Map(chatThreadsRef.current.map((thread) => [thread.id, thread] as const));
    const mergedThreads = mergedThreadsRaw.map((thread) => {
      const current = currentById.get(thread.id);
      const ownerId = pickGroupOwnerId(thread) || pickGroupOwnerId(current);
      if (!ownerId) return thread;
      return {
        ...thread,
        groupCommanderUserId: ownerId,
      };
    });

    if (payload?.botConfig) {
      setBotConfig(payload.botConfig);
      setChatThreads((prev) => syncMyBotThreads(prev, payload.botConfig));
    }
    if (Array.isArray(payload?.tasks)) setTasks(payload.tasks);
    if (mergedThreads.length > 0) {
      setChatThreads(
        payload?.botConfig ? syncMyBotThreads(mergedThreads, payload.botConfig) : mergedThreads
      );
      hydrateMeetingSessionsFromThreads(mergedThreads);
    }
    if (payload?.messages && typeof payload.messages === "object") {
      setMessagesByThread(normalizeMessagesByThreadForUser(payload.messages, userID));
    }
    if (Array.isArray(payload?.friends)) {
      setFriends(payload.friends);
    }
    if (payload?.threadMembers && typeof payload.threadMembers === "object") {
      setThreadMembers(payload.threadMembers);
    }
    if (Array.isArray(payload?.agents)) {
      setAgents(payload.agents);
    }
    if (Array.isArray(payload?.skillCatalog)) {
      setSkillCatalog(payload.skillCatalog);
    }
    if (Array.isArray(payload?.customSkills)) {
      setCustomSkills(payload.customSkills);
    }
    if (Array.isArray(payload?.miniApps)) {
      setMiniApps(payload.miniApps);
    }
    if (Array.isArray(payload?.miniAppTemplates)) {
      setMiniAppTemplates(payload.miniAppTemplates);
    }
    if (typeof payload?.myHouseType === "number") {
      setMyHouseType(payload.myHouseType);
    }
    if (payload?.uiTheme === "classic" || payload?.uiTheme === "neo") {
      setUiTheme(payload.uiTheme);
    }
    if (isAppLanguage(payload?.language) && !explicitLanguagePreferenceRef.current) {
      setLanguage(payload.language);
      void persistAppLanguage(payload.language);
    }
    if (typeof payload?.voiceModeEnabled === "boolean") {
      setVoiceModeEnabled(payload.voiceModeEnabled);
    }

    if (
      bootstrapResult.status === "rejected" &&
      threadsResult.status === "rejected"
    ) {
      throw bootstrapResult.reason;
    }
  }, [hydrateMeetingSessionsFromThreads, persistAppLanguage, userID]);

  const updateThreadLanguage = useCallback(
    async (threadId: string, next: ThreadDisplayLanguage) => {
      const id = threadId.trim();
      if (!id || !isThreadDisplayLanguage(next)) return;
      patchThreadLanguageMap((previous) => {
        if (previous[id] === next) return previous;
        return {
          ...previous,
          [id]: next,
        };
      });
      try {
        const response = await updateThreadDisplayLanguageApi(id, next);
        if (isThreadDisplayLanguage(response.language)) {
          patchThreadLanguageMap((previous) => {
            if (previous[id] === response.language) return previous;
            return {
              ...previous,
              [id]: response.language,
            };
          });
        }
      } catch {
        // Keep local fallback preference when backend persistence fails.
      }
    },
    [patchThreadLanguageMap]
  );

  useEffect(() => {
    let cancelled = false;

    if (!isSignedIn || !userID) {
      setThreadLanguageById({});
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      try {
        const raw = await AsyncStorage.getItem(threadLanguageStorageKey(userID));
        if (cancelled) return;
        if (!raw) {
          setThreadLanguageById({});
          return;
        }
        const parsed = JSON.parse(raw) as unknown;
        const normalized = normalizeThreadLanguageMap(parsed);
        setThreadLanguageById(normalized);
      } catch {
        if (!cancelled) {
          setThreadLanguageById({});
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isSignedIn, userID]);

  useEffect(() => {
    let cancelled = false;

    if (!isSignedIn || !userID) {
      setFriendAliases({});
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      try {
        const raw = await AsyncStorage.getItem(friendAliasStorageKey(userID));
        if (cancelled) return;
        if (!raw) {
          setFriendAliases({});
          return;
        }
        const parsed = JSON.parse(raw) as unknown;
        setFriendAliases(normalizeFriendAliases(parsed));
      } catch {
        if (!cancelled) {
          setFriendAliases({});
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isSignedIn, userID]);

  useEffect(() => {
    let cancelled = false;

    if (!isSignedIn || !userID) {
      threadLanguageSyncSignatureRef.current = "";
      return () => {
        cancelled = true;
      };
    }
    const threadIds = chatThreads
      .map((item) => item.id?.trim() || "")
      .filter(Boolean)
      .slice(0, 40);
    const uniqueThreadIds = Array.from(new Set(threadIds));
    if (uniqueThreadIds.length === 0) {
      threadLanguageSyncSignatureRef.current = "";
      return () => {
        cancelled = true;
      };
    }
    const signature = [...uniqueThreadIds].sort().join("|");
    if (signature === threadLanguageSyncSignatureRef.current) {
      return () => {
        cancelled = true;
      };
    }
    threadLanguageSyncSignatureRef.current = signature;

    (async () => {
      const remoteMap: Record<string, ThreadDisplayLanguage> = {};
      await Promise.all(
        uniqueThreadIds.map(async (threadId) => {
          try {
            const pref = await getThreadDisplayLanguageApi(threadId);
            if (isThreadDisplayLanguage(pref.language)) {
              remoteMap[threadId] = pref.language;
            }
          } catch {
            // Ignore per-thread fetch failure.
          }
        })
      );
      if (cancelled || Object.keys(remoteMap).length === 0) return;
      patchThreadLanguageMap((previous) => {
        const next = { ...previous };
        let changed = false;
        for (const [threadId, language] of Object.entries(remoteMap)) {
          if (next[threadId] === language) continue;
          next[threadId] = language;
          changed = true;
        }
        return changed ? next : previous;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [chatThreads, isSignedIn, patchThreadLanguageMap, userID]);

  const refreshThreadMessages = useCallback(async (
    threadId: string,
    options?: { preferV2SessionApi?: boolean }
  ) => {
    if (!threadId) return;
    const useThreadCache = shouldUseThreadMessageCache(threadId);
    const thread = chatThreadsRef.current.find((item) => item.id === threadId);
    const targetType = (thread?.targetType || "").trim();
    const targetId = (thread?.targetId || "").trim();

    // Load from local cache first for instant paint.
    const cached = useThreadCache ? await readThreadCache(userID, threadId) : null;
    if (cached && cached.length > 0) {
      const normalizedCached = sortConversationMessagesChronologically(normalizeMessagesForUser(cached, userID));
      setMessagesByThread((prev) => ({
        ...prev,
        [threadId]: normalizedCached.slice(-MESSAGE_RENDER_WINDOW),
      }));
    }

    let latest: ConversationMessage[] = [];
    historyCursorByThreadRef.current[threadId] = null;
    const preferV2SessionApi = Boolean(options?.preferV2SessionApi);
    let loadedViaV2SessionApi = false;
    if (preferV2SessionApi) {
      try {
        const rows = await listV2ChatSessionMessagesApi(threadId);
        latest = rows.map((row, index) => mapV2SessionMessageToConversation(row, userID, threadId, index));
        loadedViaV2SessionApi = true;
      } catch {
        // Fallback to legacy chain below.
      }
    }
    if (loadedViaV2SessionApi) {
      latest = sortConversationMessagesChronologically(latest);
      const merged = cached && cached.length > 0 ? mergeMessagesPreferIncoming(cached, latest) : latest;
      const safeMerged = Array.isArray(merged) ? sortConversationMessagesChronologically(merged) : [];
      if (useThreadCache) {
        void writeThreadCache(userID, threadId, safeMerged);
      }
      setMessagesByThread((prev) => ({
        ...prev,
        [threadId]: safeMerged.slice(-MESSAGE_RENDER_WINDOW),
      }));
      return;
    }

    if (targetType && targetId) {
      try {
        const response = await queryChatTargetHistoryApi(targetType, targetId, {
          pageSize: MESSAGE_PAGE_SIZE,
        });
        const rows = pickMessagesForThreadFromTargetHistory(response.list || [], threadId);
        if (rows.length > 0 || (response.list || []).length === 0) {
          latest = rows.map((row) => mapATMessageToConversation(row, userID, threadId));
          historyCursorByThreadRef.current[threadId] = response.pagination?.next_cursor || null;
        }
      } catch {
        // Fall through to the session endpoint below.
      }
    }
    if (latest.length === 0) {
      if (isLegacySessionThreadId(threadId)) {
        try {
          const rows = await listChatSessionMessagesApi(threadId, { limit: MESSAGE_PAGE_SIZE });
          if (Array.isArray(rows) && rows.length > 0) {
            latest = rows.map((row) => mapATMessageToConversation(row, userID, threadId));
          }
        } catch {
          // Fall through to the thread endpoint below.
        }
      }
      if (latest.length === 0) {
        const latestRaw = await listThreadMessagesApi(threadId, { limit: MESSAGE_PAGE_SIZE });
        latest = normalizeMessagesForUser(Array.isArray(latestRaw) ? latestRaw : [], userID);
      }
    }
    latest = sortConversationMessagesChronologically(latest);
    const merged = cached && cached.length > 0 ? mergeMessagesPreferIncoming(cached, latest) : latest;
    const safeMerged = Array.isArray(merged) ? sortConversationMessagesChronologically(merged) : [];
    if (useThreadCache) {
      void writeThreadCache(userID, threadId, safeMerged);
    }

    setMessagesByThread((prev) => ({
      ...prev,
      [threadId]: safeMerged.slice(-MESSAGE_RENDER_WINDOW),
    }));
  }, [shouldUseThreadMessageCache, userID]);

  const loadOlderMessages = useCallback(async (threadId: string) => {
    if (!threadId) return 0;
    const current = messagesByThreadRef.current[threadId] || [];
    if (current.length === 0) return 0;
    const oldest = current[0]?.id;
    if (!oldest) return 0;
    const useThreadCache = shouldUseThreadMessageCache(threadId);
    const thread = chatThreadsRef.current.find((item) => item.id === threadId);
    const targetType = (thread?.targetType || "").trim();
    const targetId = (thread?.targetId || "").trim();

    // Try local cache first.
    const cached = useThreadCache ? await readThreadCache(userID, threadId) : null;
    if (cached && cached.length > 0) {
      const idx = cached.findIndex((m) => m.id === oldest);
      if (idx > 0) {
        const start = Math.max(0, idx - MESSAGE_PAGE_SIZE);
        const chunk = cached.slice(start, idx);
        if (chunk.length > 0) {
          setMessagesByThread((prev) => {
            const history = prev[threadId] || [];
            return {
              ...prev,
              [threadId]: sortConversationMessagesChronologically([...chunk, ...history]),
            };
          });
          return chunk.length;
        }
      }
    }

    let older: ConversationMessage[] = [];
    const cursor = historyCursorByThreadRef.current[threadId];
    if (targetType && targetId && cursor) {
      try {
        const response = await queryChatTargetHistoryApi(targetType, targetId, {
          cursor,
          pageSize: MESSAGE_PAGE_SIZE,
        });
        older = pickMessagesForThreadFromTargetHistory(response.list || [], threadId).map((row) =>
          mapATMessageToConversation(row, userID, threadId)
        );
        historyCursorByThreadRef.current[threadId] = response.pagination?.next_cursor || null;
      } catch {
        // Fall through to the session endpoint below.
      }
    }
    if (older.length === 0) {
      const oldestSeqNo = current[0]?.seqNo;
      if (
        isLegacySessionThreadId(threadId) &&
        typeof oldestSeqNo === "number" &&
        Number.isFinite(oldestSeqNo)
      ) {
        try {
          const response = await listChatSessionMessagesApi(threadId, {
            limit: MESSAGE_PAGE_SIZE,
            beforeSeqNo: oldestSeqNo,
          });
          older = response.map((row) => mapATMessageToConversation(row, userID, threadId));
        } catch {
          // Fall through to the legacy thread endpoint below.
        }
      }
    }
    if (older.length === 0) {
      older = normalizeMessagesForUser(
        await listThreadMessagesApi(threadId, { limit: MESSAGE_PAGE_SIZE, before: oldest }),
        userID
      );
    }
    older = sortConversationMessagesChronologically(older);
    if (!Array.isArray(older) || older.length === 0) return 0;

    setMessagesByThread((prev) => {
      const history = prev[threadId] || [];
      const historyIds = new Set(history.map((item) => item.id));
      const uniqueOlder = older.filter((item) => item.id && !historyIds.has(item.id));
      if (uniqueOlder.length === 0) return prev;
      return {
        ...prev,
        [threadId]: sortConversationMessagesChronologically([...uniqueOlder, ...history]),
      };
    });
    if (useThreadCache) {
      void (async () => {
        const base = (await readThreadCache(userID, threadId)) || [];
        const merged = mergePrependUnique(base, older);
        await writeThreadCache(userID, threadId, merged);
      })();
    }

    return older.length;
  }, [shouldUseThreadMessageCache, userID]);

  const listMembers = useCallback(async (threadId: string) => {
    if (!threadId) return;
    try {
      const members = await listThreadMembersApi(threadId);
      const thread = chatThreadsRef.current.find((item) => item.id === threadId);
      let nextMembers = members;
      const groupNpcName = (thread?.groupNpcName || "").trim();

      if (thread?.isGroup && groupNpcName) {
        try {
          const npcPool = await listNPCsApi();
          const matchedNpc = findMatchingGroupNpc(npcPool, userID, groupNpcName);
          if (matchedNpc?.id) {
            const normalizedGroupNpc = normalizeLabel(groupNpcName);
            const matchedNpcId = (matchedNpc.id || "").trim();
            const hasGroupNpcMember = members.some((member) => {
              if (member.memberType !== "role") return false;
              if ((member.npcId || "").trim() === matchedNpcId) return true;
              return normalizeLabel(member.name) === normalizedGroupNpc;
            });

            if (!hasGroupNpcMember) {
              const addedMember = await addThreadMemberApi(threadId, {
                npcId: matchedNpc.id,
                memberType: "role",
              });
              const alreadyPresent = members.some((member) => member.id === addedMember.id);
              if (!alreadyPresent) {
                nextMembers = [...members, addedMember];
              }
            }
          }
        } catch {
          // Keep current members when default NPC backfill fails.
        }
      }

      setThreadMembers((prev) => ({
        ...prev,
        [threadId]: nextMembers,
      }));
    } catch {
      // Ignore loading failure.
    }
  }, [userID]);

  useEffect(() => {
    let cancelled = false;

    if (!isSignedIn) {
      setBotConfig(defaultBotConfig);
      setTasks(defaultTasks);
      setChatThreads(defaultChatThreads);
      setMessagesByThread(defaultMessagesByThread);
      historyCursorByThreadRef.current = {};
      setFriends(defaultFriends);
      setThreadMembers(defaultThreadMembers);
      setAgents(defaultAgents);
      setSkillCatalog(defaultSkills);
      setCustomSkills(defaultCustomSkills);
      setMiniApps(defaultMiniApps);
      setMiniAppTemplates(defaultMiniAppTemplates);
      setThreadLanguageById({});
      setMeetingSessionsById({});
      setBootstrapReady(true);
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      try {
        await refreshAll();
      } catch {
        // Keep local fallback state when backend is unavailable.
      } finally {
        if (!cancelled) {
          setBootstrapReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isSignedIn, refreshAll, userID]);

  useEffect(() => {
    if (!isSignedIn || isE2E) {
      void clearTaskReminderNotifications();
      return;
    }
    void ensureTaskReminderPermission();
  }, [isE2E, isSignedIn]);

  useEffect(() => {
    if (!isSignedIn || !bootstrapReady || isE2E) return;

    if (notificationSyncTimerRef.current) {
      clearTimeout(notificationSyncTimerRef.current);
    }
    notificationSyncTimerRef.current = setTimeout(() => {
      void syncTaskReminderNotifications(tasks, language);
    }, 250);

    return () => {
      if (notificationSyncTimerRef.current) {
        clearTimeout(notificationSyncTimerRef.current);
        notificationSyncTimerRef.current = null;
      }
    };
  }, [bootstrapReady, isE2E, isSignedIn, language, tasks]);

  useEffect(() => {
    if (!isSignedIn) return;

    const unsubscribe = subscribeRealtime((event: RealtimeEvent) => {
      if (!event?.type) return;

      switch (event.type) {
        case "chat.thread.created": {
          const payload = event.payload as ChatThread;
          if (!payload?.id) break;
          setChatThreads((prev) => upsertById(prev, payload, true));
          if (payload.meetingSession?.id) {
            hydrateMeetingSessionsFromThreads([payload]);
          }
          break;
        }
        case "chat.thread.deleted": {
          const payload = event.payload as { id?: string };
          const threadId = payload?.id || event.threadId;
          if (!threadId) break;
          setChatThreads((prev) => prev.filter((item) => item.id !== threadId));
          setMessagesByThread((prev) => {
            const next = { ...prev };
            delete next[threadId];
            return next;
          });
          delete historyCursorByThreadRef.current[threadId];
          setThreadMembers((prev) => {
            const next = { ...prev };
            delete next[threadId];
            return next;
          });
          setFriends((prev) => prev.filter((item) => item.threadId !== threadId));
          patchThreadLanguageMap((previous) => {
            if (!(threadId in previous)) return previous;
            const next = { ...previous };
            delete next[threadId];
            return next;
          });
          setMeetingSessionsById((prev) => {
            const entries = Object.entries(prev).filter(([, session]) => session.threadId !== threadId);
            if (entries.length === Object.keys(prev).length) return prev;
            return Object.fromEntries(entries);
          });
          break;
        }
        case "chat.message.created": {
          const payload = event.payload as ConversationMessage;
          const threadId = event.threadId || payload?.threadId;
          if (!threadId || !payload?.id) break;
          const eventTimestamp = normalizeConversationDateTime(event.sentAt) || new Date().toISOString();
          const normalizedPayload = normalizeMessageForUser(
            {
              ...payload,
              threadId,
              createdAt: payload.createdAt || undefined,
              updatedAt: payload.updatedAt || undefined,
              receivedAt: payload.receivedAt || eventTimestamp,
            },
            userID
          );

          setMessagesByThread((prev) => {
            const history = prev[threadId] || [];
            if (history.some((item) => item.id === normalizedPayload.id)) {
              return prev;
            }
            const nextHistory = sortConversationMessagesChronologically([...history, normalizedPayload]);
            return {
              ...prev,
              [threadId]: nextHistory,
            };
          });

          if (shouldUseThreadMessageCache(threadId)) {
            void upsertThreadCache(userID, threadId, [normalizedPayload]);
          }
          if (normalizedPayload.type === "meeting") {
            applyMeetingSignalMessage(normalizedPayload, threadId, eventTimestamp);
          }
          setChatThreads((prev) => updateThreadPreview(prev, threadId, previewMessage(normalizedPayload)));
          if (!normalizedPayload.isMe) {
            setChatThreads((prev) =>
              updateThreadUnreadState(prev, threadId, {
                incrementBy: 1,
                highlight: Boolean(normalizedPayload.mentionedUserIds?.includes(userID || "")),
              })
            );
          }
          break;
        }
        case "chat.unread.updated": {
          const payload = event.payload as {
            ownerId?: string;
            threadId?: string;
            unreadCount?: number;
            mentionUnreadCount?: number;
          };
          const ownerId = (payload?.ownerId || "").trim();
          if (ownerId && ownerId !== (userID || "").trim()) break;
          const threadId = (payload?.threadId || "").trim();
          if (!threadId) break;
          setChatThreads((prev) =>
            updateThreadUnreadState(prev, threadId, {
              unreadCount: typeof payload?.unreadCount === "number" ? payload.unreadCount : 0,
              highlight: Boolean((payload?.mentionUnreadCount || 0) > 0),
            })
          );
          break;
        }
        case "chat.mention.created": {
          const payload = event.payload as {
            ownerId?: string;
            threadId?: string;
            unreadCount?: number;
            mentionUnreadCount?: number;
          };
          const ownerId = (payload?.ownerId || "").trim();
          if (ownerId && ownerId !== (userID || "").trim()) break;
          const threadId = (payload?.threadId || "").trim();
          if (!threadId) break;
          setChatThreads((prev) =>
            updateThreadUnreadState(prev, threadId, {
              unreadCount: typeof payload?.unreadCount === "number" ? payload.unreadCount : undefined,
              highlight: true,
            })
          );
          if (!isRemotePushRegistrationActive()) {
            const thread = chatThreadsRef.current.find((item) => item.id === threadId);
            void notifyMentionReceived(thread?.name || "UsChat", thread?.message || "", language);
          }
          break;
        }
        case "task.created":
        case "task.created_from_message": {
          const payload = event.payload as TaskItem;
          if (!payload?.id) break;
          setTasks((prev) => [payload, ...prev.filter((item) => item.id !== payload.id)]);
          break;
        }
        case "task.updated": {
          const payload = event.payload as TaskItem;
          if (!payload?.id) break;
          setTasks((prev) => prev.map((item) => (item.id === payload.id ? payload : item)));
          break;
        }
        case "task.deleted": {
          const payload = event.payload as { id?: string };
          if (!payload?.id) break;
          setTasks((prev) => prev.filter((item) => item.id !== payload.id));
          break;
        }
        case "agent.created":
        case "agent.updated":
        case "agent.skills.updated": {
          const payload = event.payload as Agent;
          if (!payload?.id) break;
          setAgents((prev) => upsertById(prev, payload, true));
          break;
        }
        case "agent.deleted": {
          const payload = event.payload as { id?: string };
          if (!payload?.id) break;
          setAgents((prev) => prev.filter((item) => item.id !== payload.id));
          break;
        }
        case "friend.created": {
          const payload = event.payload as Friend;
          if (!payload?.id) break;
          setFriends((prev) => upsertById(prev, payload, true));
          setChatThreads((prev) => syncDirectThreadFromFriend(prev, payload));
          break;
        }
        case "friend.deleted": {
          const payload = event.payload as { id?: string; threadId?: string };
          if (!payload?.id) break;
          const removedThreadID = payload.threadId || "";
          setFriends((prev) => prev.filter((item) => item.id !== payload.id));
          if (removedThreadID) {
            setChatThreads((prev) => prev.filter((item) => item.id !== removedThreadID));
            setMessagesByThread((prev) => {
              const next = { ...prev };
              delete next[removedThreadID];
              return next;
            });
            setThreadMembers((prev) => {
              const next = { ...prev };
              delete next[removedThreadID];
              return next;
            });
            patchThreadLanguageMap((previous) => {
              if (!(removedThreadID in previous)) return previous;
              const next = { ...previous };
              delete next[removedThreadID];
              return next;
            });
          }
          break;
        }
        case "thread.member.added": {
          const payload = event.payload as ThreadMember;
          const threadId = event.threadId || payload?.threadId;
          if (!threadId || !payload?.id) break;
          setThreadMembers((prev) => {
            const members = prev[threadId] || [];
            if (members.some((item) => item.id === payload.id)) {
              return prev;
            }
            setChatThreads((threads) =>
              threads.map((thread) =>
                thread.id === threadId && thread.isGroup
                  ? { ...thread, memberCount: (thread.memberCount || 0) + 1 }
                  : thread
              )
            );
            return {
              ...prev,
              [threadId]: [...members, { ...payload, threadId }],
            };
          });
          break;
        }
        case "thread.member.removed": {
          const payload = event.payload as { id?: string; threadId?: string };
          const threadId = event.threadId || payload?.threadId;
          if (!threadId || !payload?.id) break;
          setThreadMembers((prev) => {
            const hasCachedMembers = threadId in prev;
            const members = prev[threadId] || [];
            if (hasCachedMembers && !members.some((item) => item.id === payload.id)) {
              return prev;
            }
            setChatThreads((threads) =>
              threads.map((thread) =>
                thread.id === threadId && thread.isGroup
                  ? { ...thread, memberCount: Math.max(1, (thread.memberCount || 1) - 1) }
                  : thread
              )
            );
            if (!hasCachedMembers) {
              return prev;
            }
            return {
              ...prev,
              [threadId]: members.filter((item) => item.id !== payload.id),
            };
          });
          break;
        }
        case "bot.updated": {
          const payload = event.payload as BotConfig;
          if (!payload?.name) break;
          setBotConfig(payload);
          setChatThreads((prev) => syncMyBotThreads(prev, payload));
          break;
        }
        case "miniapp.generated":
        case "miniapp.updated": {
          const payload = event.payload as MiniApp;
          if (!payload?.id) break;
          setMiniApps((prev) => upsertById(prev, payload, true));
          setMiniAppGeneration({
            active: false,
            stage: "ready",
            progress: 100,
          });
          break;
        }
        case "miniapp.deleted": {
          const payload = event.payload as { id?: string };
          if (!payload?.id) break;
          setMiniApps((prev) => prev.filter((item) => item.id !== payload.id));
          break;
        }
        case "miniapp.generation.progress": {
          const payload = event.payload as { stage?: string; progress?: number };
          const progress = typeof payload?.progress === "number" ? payload.progress : 0;
          const stage = payload?.stage || "working";
          setMiniAppGeneration({
            active: progress < 100,
            stage,
            progress,
          });
          break;
        }
        case "skill.custom.created": {
          const payload = event.payload as CustomSkill;
          if (!payload?.id) break;
          setCustomSkills((prev) => upsertById(prev, payload, true));
          break;
        }
        case "skill.custom.updated": {
          const payload = event.payload as CustomSkill;
          if (!payload?.id) break;
          setCustomSkills((prev) => upsertById(prev, payload, true));
          setSkillCatalog((prev) =>
            prev.map((item) =>
              item.id === payload.id
                ? {
                    ...item,
                    name: payload.name,
                    description: payload.description || "Custom Markdown Skill",
                    permissionScope: payload.permissionScope,
                    version: payload.version,
                  }
                : item
            )
          );
          break;
        }
        case "skill.custom.deleted": {
          const payload = event.payload as { id?: string };
          if (!payload?.id) break;
          setCustomSkills((prev) => prev.filter((item) => item.id !== payload.id));
          setSkillCatalog((prev) => prev.filter((item) => item.id !== payload.id));
          setBotConfig((prev) => ({
            ...prev,
            installedSkillIds: prev.installedSkillIds.filter((id) => id !== payload.id),
          }));
          setAgents((prev) =>
            prev.map((agent) => ({
              ...agent,
              installedSkillIds: agent.installedSkillIds.filter((id) => id !== payload.id),
            }))
          );
          break;
        }
        default:
          break;
      }
    });

    return () => {
      unsubscribe();
    };
  }, [
    applyMeetingSignalMessage,
    hydrateMeetingSessionsFromThreads,
    isSignedIn,
    language,
    patchThreadLanguageMap,
    shouldUseThreadMessageCache,
    userID,
  ]);

  const requestMeeting = useCallback(
    async (input: MeetingRequestInput) => {
      const threadId = (input.threadId || "").trim();
      if (!threadId) return null;

      const currentSession = pickNewestMeetingSession(
        meetingSessionsRef.current,
        (session) => session.threadId === threadId && !isMeetingSessionTerminal(session)
      );
      if (currentSession) {
        return currentSession;
      }

      try {
        const response = await requestMeetingApi({
          ...input,
          threadId,
          defaultCameraOn: input.defaultCameraOn ?? input.mode === "video",
        });
        return upsertMeetingOperationSession(response, threadId);
      } catch {
        return null;
      }
    },
    [upsertMeetingOperationSession]
  );

  const acceptMeeting = useCallback(
    async (meetingSessionId: string) => {
      const id = (meetingSessionId || "").trim();
      if (!id) return null;
      try {
        const response = await acceptMeetingApi(id);
        const fallbackThreadId = meetingSessionsRef.current[id]?.threadId;
        return upsertMeetingOperationSession(response, fallbackThreadId);
      } catch {
        return null;
      }
    },
    [upsertMeetingOperationSession]
  );

  const rejectMeeting = useCallback(
    async (meetingSessionId: string, reason?: string) => {
      const id = (meetingSessionId || "").trim();
      if (!id) return null;
      try {
        const response = await rejectMeetingApi(id, { reason });
        const fallbackThreadId = meetingSessionsRef.current[id]?.threadId;
        return upsertMeetingOperationSession(response, fallbackThreadId);
      } catch {
        return null;
      }
    },
    [upsertMeetingOperationSession]
  );

  const leaveMeeting = useCallback(
    async (meetingSessionId: string, reason?: string) => {
      const id = (meetingSessionId || "").trim();
      if (!id) return null;
      try {
        const response = await leaveMeetingApi(id, { reason });
        const fallbackThreadId = meetingSessionsRef.current[id]?.threadId;
        return upsertMeetingOperationSession(response, fallbackThreadId);
      } catch {
        return null;
      }
    },
    [upsertMeetingOperationSession]
  );

  const endMeeting = useCallback(
    async (meetingSessionId: string, reason?: string) => {
      const id = (meetingSessionId || "").trim();
      if (!id) return null;
      try {
        const response = await endMeetingApi(id, { reason });
        const fallbackThreadId = meetingSessionsRef.current[id]?.threadId;
        return upsertMeetingOperationSession(response, fallbackThreadId);
      } catch {
        return null;
      }
    },
    [upsertMeetingOperationSession]
  );

  const value = useMemo<AgentTownContextValue>(() => {
    return {
      botConfig,
      tasks,
      chatThreads,
      messagesByThread,
      friends,
      friendAliases,
      threadMembers,
      agents,
      skillCatalog,
      customSkills,
      miniApps,
      miniAppTemplates,
      miniAppGeneration,
      myHouseType,
      uiTheme,
      language,
      threadLanguageById,
      voiceModeEnabled,
      bootstrapReady,
      meetingSessionsById,
      incomingMeetingSession,
      activeMeetingSession,
      updateBotConfig: (next) => {
        setBotConfig(next);
        setChatThreads((prev) => syncMyBotThreads(prev, next));
        void saveBotConfig(next).catch(() => {
          // Keep optimistic state.
        });
      },
      addTask: (task) => {
        const nextTask: TaskItem = {
          ...task,
          id: task.id || `task_${Date.now()}`,
        };
        setTasks((prev) => [nextTask, ...prev]);
        void createTaskApi(nextTask).catch(() => {
          // Keep optimistic state.
        });
      },
      addChatThread: (thread) => {
        const nextThread: ChatThread = {
          ...thread,
          id: thread.id || `thread_${Date.now()}`,
          time: thread.time || "Now",
        };
        setChatThreads((prev) => upsertById(prev, nextThread, true));
        void createChatThread(nextThread).catch(() => {
          // Keep optimistic state.
        });
      },
      removeChatThread: async (threadId) => {
        if (!threadId) return;
        setChatThreads((prev) => removeById(prev, threadId));
        setMessagesByThread((prev) => {
          const next = { ...prev };
          delete next[threadId];
          return next;
        });
        delete historyCursorByThreadRef.current[threadId];
        setThreadMembers((prev) => {
          const next = { ...prev };
          delete next[threadId];
          return next;
        });
        setFriends((prev) => prev.filter((item) => item.threadId !== threadId));
        patchThreadLanguageMap((previous) => {
          if (!(threadId in previous)) return previous;
          const next = { ...previous };
          delete next[threadId];
          return next;
        });
        try {
          await deleteChatThreadApi(threadId);
        } catch {
          // Keep optimistic state.
        }
      },
      updateHouseType: setMyHouseType,
      updateUiTheme: setUiTheme,
      updateLanguage: (next) => {
        if (!isAppLanguage(next)) return;
        explicitLanguagePreferenceRef.current = true;
        setLanguage(next);
        void persistAppLanguage(next);
      },
      updateThreadLanguage,
      updateVoiceModeEnabled: setVoiceModeEnabled,
      refreshAll,
      refreshThreadMessages,
      loadOlderMessages,
      requestMeeting,
      acceptMeeting,
      rejectMeeting,
      leaveMeeting,
      endMeeting,
      sendMessage: async (threadId, payload) => {
        if (!threadId) return null;
        const useThreadCache = shouldUseThreadMessageCache(threadId);
        if (isE2E) {
          const nowIso = new Date().toISOString();
          const senderId = (payload.senderId || userID || "e2e-guest-user").trim();
          const userMessage: ConversationMessage = {
            id: `e2e_msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            threadId,
            senderId,
            senderName: payload.senderName || "E2E Guest",
            senderAvatar: payload.senderAvatar || botConfig.avatar,
            senderType: payload.senderType || "human",
            content: payload.content || "",
            type: payload.type || "text",
            imageUri: payload.imageUri,
            imageName: payload.imageName,
            isMe: payload.isMe ?? true,
            time: "Now",
            createdAt: nowIso,
            updatedAt: nowIso,
            receivedAt: nowIso,
          };
          const base = messagesByThreadRef.current[threadId] || [];
          const nextMessages = sortConversationMessagesChronologically([...base, userMessage]);
          setMessagesByThread((prev) => ({
            ...prev,
            [threadId]: nextMessages,
          }));
          if (useThreadCache) {
            void upsertThreadCache(userID, threadId, nextMessages);
          }
          setChatThreads((prev) => updateThreadPreview(prev, threadId, previewMessage(userMessage)));
          return {
            userMessage,
            messages: nextMessages,
          };
        }
        try {
          const result = await sendThreadMessageApi(threadId, payload);
          const currentMessages = messagesByThreadRef.current[threadId] || [];
          const existingIds = new Set(currentMessages.map((message) => message.id));
          const normalizedUserMessage = result.userMessage
            ? stampMissingReceivedAt([normalizeMessageForUser(result.userMessage, userID)], existingIds)[0]
            : undefined;
          const nextMessages = normalizedUserMessage
            ? sortConversationMessagesChronologically(
                mergeMessagesPreferIncoming(currentMessages, [normalizedUserMessage])
              )
            : currentMessages;

          if (normalizedUserMessage) {
            setMessagesByThread((prev) => ({
              ...prev,
              [threadId]: nextMessages,
            }));
            if (useThreadCache) {
              void writeThreadCache(userID, threadId, nextMessages);
            }
          }

          const previewSource = normalizedUserMessage || nextMessages[nextMessages.length - 1];
          const preview = previewSource ? previewMessage(previewSource) : "";
          setChatThreads((prev) => updateThreadPreview(prev, threadId, preview));
          return {
            ...result,
            messages: nextMessages,
            userMessage: normalizedUserMessage || result.userMessage,
            aiMessage: result.aiMessage,
          };
        } catch {
          return null;
        }
      },
      markThreadRead,
      createFriend: async (input) => {
        const created = await createFriendApi(input);
        if (created.mode === "friend" && created.friend) {
          const nextFriend = created.friend as Friend;
          setFriends((prev) => upsertById(prev, nextFriend, true));
          setChatThreads((prev) => syncDirectThreadFromFriend(prev, nextFriend));

          const threadId = (nextFriend.threadId || "").trim();
          if (threadId) {
            return nextFriend;
          }

          if (nextFriend.userId) {
            try {
              const createdSession = await atCreateSession({
                target_type: "user",
                target_id: nextFriend.userId,
                title: nextFriend.name || undefined,
              });
              const mappedThread = mapATSessionToThread(createdSession);
              if (mappedThread?.id) {
                setChatThreads((prev) => upsertById(prev, mappedThread, true));
                setFriends((prev) =>
                  prev.map((friend) =>
                    friend.id === nextFriend.id
                      ? {
                          ...friend,
                          threadId: mappedThread.id,
                        }
                      : friend
                  )
                );
              }
            } catch {
              // Keep friend added even when direct thread creation fails.
            }
          }

          return nextFriend;
        }

        // mode === "request": request created successfully, wait for the other side to accept.
        return null;
      },
      setFriendAlias: async (friend, alias) => {
        const keys = friendAliasKeys(friend);
        if (keys.length === 0) return;
        const normalizedAlias = alias.trim();
        setFriendAliases((previous) => {
          const next = { ...previous };
          let changed = false;
          if (normalizedAlias) {
            for (const key of keys) {
              if (next[key] === normalizedAlias) continue;
              next[key] = normalizedAlias;
              changed = true;
            }
          } else {
            for (const key of keys) {
              if (!(key in next)) continue;
              delete next[key];
              changed = true;
            }
          }
          if (!changed) return previous;
          void persistFriendAliases(next);
          return next;
        });
      },
      resolveFriendDisplayName: (friend, fallback = "") =>
        resolveFriendDisplayNameFromAliases(friendAliases, friend, fallback),
      removeFriend: async (friendId) => {
        if (!friendId) return;
        const existing = friends.find((item) => item.id === friendId);
        const linkedThreadID = existing?.threadId || "";
        setFriends((prev) => removeById(prev, friendId));
        if (linkedThreadID) {
          setChatThreads((prev) => prev.filter((item) => item.id !== linkedThreadID));
          setMessagesByThread((prev) => {
            const next = { ...prev };
            delete next[linkedThreadID];
            return next;
          });
          delete historyCursorByThreadRef.current[linkedThreadID];
          setThreadMembers((prev) => {
            const next = { ...prev };
            delete next[linkedThreadID];
            return next;
          });
          patchThreadLanguageMap((previous) => {
            if (!(linkedThreadID in previous)) return previous;
            const next = { ...previous };
            delete next[linkedThreadID];
            return next;
          });
        }
        try {
          await deleteFriendApi(friendId);
        } catch {
          // Keep optimistic state.
        }
      },
      createAgent: async (input) => {
        try {
          const created = await createAgentApi(input);
          setAgents((prev) => upsertById(prev, created, true));
          return created;
        } catch {
          return null;
        }
      },
      removeAgent: async (agentId) => {
        const targetID = (agentId || "").trim();
        if (!targetID) return;
        const linkedThreadIDs = chatThreads
          .filter((thread) => {
            const threadID = (thread.id || "").trim();
            const targetType = (thread.targetType || "").trim().toLowerCase();
            const targetEntityID = (thread.targetId || "").trim();
            if (threadID === targetID) return true;
            return targetType === "agent" && targetEntityID === targetID;
          })
          .map((thread) => thread.id)
          .filter(Boolean);

        setAgents((prev) => prev.filter((item) => item.id !== targetID));
        if (linkedThreadIDs.length > 0) {
          const linkedSet = new Set(linkedThreadIDs);
          setChatThreads((prev) => prev.filter((item) => !linkedSet.has(item.id)));
          setMessagesByThread((prev) => {
            const next = { ...prev };
            for (const threadID of linkedSet) {
              delete next[threadID];
              delete historyCursorByThreadRef.current[threadID];
            }
            return next;
          });
          setThreadMembers((prev) => {
            const next = { ...prev };
            for (const threadID of linkedSet) {
              delete next[threadID];
            }
            return next;
          });
          setFriends((prev) => prev.filter((item) => !linkedSet.has((item.threadId || "").trim())));
          patchThreadLanguageMap((previous) => {
            let changed = false;
            const next = { ...previous };
            for (const threadID of linkedSet) {
              if (threadID in next) {
                delete next[threadID];
                changed = true;
              }
            }
            return changed ? next : previous;
          });
        }

        try {
          await deleteAgentApi(targetID);
        } catch {
          // Keep optimistic state.
        }
      },
      toggleAgentSkill: async (agentId, skillId, install) => {
        if (!agentId || !skillId) return;
        try {
          const updated = await toggleAgentSkillApi(agentId, skillId, install);
          setAgents((prev) => upsertById(prev, updated, true));
        } catch {
          // Keep local state untouched.
        }
      },
      toggleBotSkill: async (skillId, install) => {
        if (!skillId) return;
        setBotConfig((prev) => ({
          ...prev,
          installedSkillIds: install
            ? Array.from(new Set([...prev.installedSkillIds, skillId]))
            : prev.installedSkillIds.filter((id) => id !== skillId),
        }));
        try {
          const updated = install ? await installBotSkillApi(skillId) : await uninstallBotSkillApi(skillId);
          setBotConfig(updated);
          setChatThreads((prev) => syncMyBotThreads(prev, updated));
        } catch {
          // Keep optimistic state.
        }
      },
      createGroup: async (input) => {
        if (!input.name.trim()) return null;
        const commanderUserId = input.groupCommanderUserId?.trim() || userID || undefined;

        const draft: ChatThread = {
          id: `group_${Date.now()}`,
          name: input.name.trim(),
          avatar:
            input.avatar?.trim() ||
            "https://img.freepik.com/free-psd/3d-illustration-human-avatar-profile_23-2150671142.jpg?w=200",
          message: "Say hello",
          time: "Now",
          isGroup: true,
          memberCount: input.memberCount || 1,
          supportsVideo: true,
          groupType: input.groupType || "toc",
          groupSubCategory: input.groupSubCategory?.trim() || undefined,
          groupNpcName: input.groupNpcName?.trim() || undefined,
          groupCommanderUserId: commanderUserId,
        };

        setChatThreads((prev) => upsertById(prev, draft, true));
        try {
          const created = await createChatThread(draft);
          const mergedCreated: ChatThread = {
            ...created,
            groupCommanderUserId: pickGroupOwnerId(created) || commanderUserId,
          };
          setChatThreads((prev) => upsertById(prev, mergedCreated, true));
          return mergedCreated;
        } catch (err) {
          setChatThreads((prev) => prev.filter((thread) => thread.id !== draft.id));
          throw err;
        }
      },
      listMembers,
      addMember: async (threadId, input) => {
        if (!threadId) return;
        try {
          const member = await addThreadMemberApi(threadId, input);
          setThreadMembers((prev) => {
            const members = prev[threadId] || [];
            const alreadyExists = members.some((item) => {
              if (item.id === member.id) return true;
              if (member.memberType === "human" && member.friendId && item.friendId === member.friendId) return true;
              if (member.memberType === "agent" && member.agentId && item.agentId === member.agentId) return true;
              if (member.memberType === "role" && member.npcId && item.npcId === member.npcId) return true;
              return false;
            });
            if (alreadyExists) {
              return prev;
            }
            setChatThreads((threads) =>
              threads.map((thread) =>
                thread.id === threadId && thread.isGroup
                  ? { ...thread, memberCount: (thread.memberCount || 0) + 1 }
                  : thread
              )
            );
            return {
              ...prev,
              [threadId]: [...members, member],
            };
          });
        } catch (err) {
          throw err;
        }
      },
      removeMember: async (threadId, memberId) => {
        if (!threadId || !memberId) return;
        setThreadMembers((prev) => {
          const members = prev[threadId] || [];
          return {
            ...prev,
            [threadId]: members.filter((item) => item.id !== memberId),
          };
        });
        setChatThreads((prev) =>
          prev.map((thread) =>
            thread.id === threadId && thread.isGroup
              ? { ...thread, memberCount: Math.max(0, (thread.memberCount || 1) - 1) }
              : thread
          )
        );
        try {
          await removeThreadMemberApi(threadId, memberId);
        } catch {
          // Keep optimistic state.
        }
      },
      createTaskFromMessage: async (threadId, messageId, title) => {
        if (!threadId || !messageId) {
          throw new Error("invalid task source message");
        }
        const created = await createTaskFromMessageApi({
          threadId,
          messageId,
          title,
        });
        setTasks((prev) => [created, ...prev.filter((item) => item.id !== created.id)]);
        return created;
      },
      updateTask: async (taskId, patch) => {
        if (!taskId) return;
        try {
          const updated = await patchTaskApi(taskId, patch);
          setTasks((prev) => prev.map((item) => (item.id === taskId ? updated : item)));
        } catch {
          // Ignore update failure.
        }
      },
      createCustomSkill: async (input) => {
        try {
          const created = await createCustomSkillApi(input);
          setCustomSkills((prev) => upsertById(prev, created, true));
          setSkillCatalog((prev) =>
            upsertById(prev, {
              id: created.id,
              name: created.name,
              description: created.description || "Custom Markdown Skill",
              type: "custom",
              permissionScope: created.permissionScope,
              version: created.version,
              tags: ["custom", "markdown"],
            }, true)
          );
          return created;
        } catch {
          return null;
        }
      },
      patchCustomSkill: async (skillId, patch) => {
        if (!skillId) return null;
        try {
          const updated = await patchCustomSkillApi(skillId, patch);
          setCustomSkills((prev) => upsertById(prev, updated, true));
          setSkillCatalog((prev) =>
            prev.map((item) =>
              item.id === skillId
                ? {
                    ...item,
                    name: updated.name,
                    description: updated.description || "Custom Markdown Skill",
                    permissionScope: updated.permissionScope,
                    version: updated.version,
                  }
                : item
            )
          );
          return updated;
        } catch {
          return null;
        }
      },
      removeCustomSkill: async (skillId) => {
        if (!skillId) return;
        setCustomSkills((prev) => prev.filter((item) => item.id !== skillId));
        setSkillCatalog((prev) => prev.filter((item) => item.id !== skillId));
        setAgents((prev) =>
          prev.map((agent) => ({
            ...agent,
            installedSkillIds: agent.installedSkillIds.filter((id) => id !== skillId),
          }))
        );

        try {
          await deleteCustomSkillApi(skillId);
        } catch {
          // Keep optimistic state.
        }
      },
      executeCustomSkill: async (skillId, input, threadId, variables) => {
        if (!skillId) return null;
        try {
          const result = await executeCustomSkillApi(skillId, {
            input,
            threadId,
            variables,
          });
          const existingIds = new Set((messagesByThreadRef.current[threadId || ""] || []).map((item) => item.id));
          const message = result.message
            ? stampMissingReceivedAt([normalizeMessageForUser(result.message, userID)], existingIds)[0]
            : undefined;
          if (threadId && message) {
            setMessagesByThread((prev) => {
              const history = prev[threadId] || [];
              if (history.some((item) => item.id === message.id)) {
                return prev;
              }
              return {
                ...prev,
                [threadId]: sortConversationMessagesChronologically([...history, message]),
              };
            });
            setChatThreads((prev) => updateThreadPreview(prev, threadId, previewMessage(message)));
          }
          return result.output;
        } catch {
          return null;
        }
      },
      generateRoleReplies: async (threadId, prompt, options) => {
        if (!threadId || !prompt.trim()) return [];
        try {
          const result = await generateRoleRepliesApi(threadId, {
            prompt,
            memberIds: options?.memberIds,
            mentionedAll: options?.mentionedAll,
            includeMyBot: options?.includeMyBot,
            appendUserMessage: true,
          });
          const existingIds = new Set((messagesByThreadRef.current[threadId] || []).map((item) => item.id));
          const normalizedUserMessage = result.userMessage
            ? stampMissingReceivedAt([normalizeMessageForUser(result.userMessage, userID)], existingIds)[0]
            : undefined;
          const normalizedReplies = stampMissingReceivedAt(
            normalizeMessagesForUser(result.replies || [], userID),
            existingIds,
            Date.now() + 1
          );

          setMessagesByThread((prev) => {
            const history = prev[threadId] || [];
            const next = [...history];
            if (normalizedUserMessage && !next.some((item) => item.id === normalizedUserMessage.id)) {
              next.push(normalizedUserMessage);
            }
            for (const reply of normalizedReplies) {
              if (!next.some((item) => item.id === reply.id)) {
                next.push(reply);
              }
            }
            return {
              ...prev,
              [threadId]: sortConversationMessagesChronologically(next),
            };
          });

          const cacheBatch: ConversationMessage[] = [];
          if (normalizedUserMessage) cacheBatch.push(normalizedUserMessage);
          if (normalizedReplies.length > 0) {
            cacheBatch.push(...normalizedReplies);
          }
          void upsertThreadCache(userID, threadId, cacheBatch);

          const latest = normalizedReplies[normalizedReplies.length - 1];
          if (latest) {
            setChatThreads((prev) => updateThreadPreview(prev, threadId, previewMessage(latest)));
          }

          return normalizedReplies;
        } catch (err) {
          // Do not swallow errors: the chat screen needs to surface failures (e.g. rate limits)
          // instead of silently clearing the input and showing nothing.
          throw err;
        }
      },
      generateMiniApp: async (query, sources) => {
        if (!query.trim()) return null;
        setMiniAppGeneration({
          active: true,
          stage: "request",
          progress: 5,
        });
        try {
          const created = await generateMiniAppApi({
            query,
            sources,
          });
          setMiniApps((prev) => upsertById(prev, created, true));
          setMiniAppGeneration({
            active: false,
            stage: "ready",
            progress: 100,
          });
          return created;
        } catch {
          setMiniAppGeneration({
            active: false,
            stage: "error",
            progress: 0,
          });
          return null;
        }
      },
      installMiniApp: async (appId, install = true) => {
        if (!appId) return;
        const updated = await installMiniAppApi(appId, install);
        setMiniApps((prev) => upsertById(prev, updated, true));
      },
      installPresetMiniApp: async (presetKey) => {
        const updated = await installPresetMiniAppApi(presetKey);
        setMiniApps((prev) => upsertById(prev, updated, true));
        return updated;
      },
      runMiniApp: async (appId, input, params, threadId) => {
        if (!appId || (!input.trim() && !params)) return null;
        const result = await runMiniAppApi(appId, {
          input,
          params,
          threadId,
        });

        setMiniApps((prev) =>
          prev.map((item) =>
            item.id === appId
              ? (() => {
                  const preview = ((item.preview || {}) as Record<string, unknown>) || {};
                  const previewContentRaw = preview.content;
                  const previewContent =
                    previewContentRaw && typeof previewContentRaw === "object" && !Array.isArray(previewContentRaw)
                      ? (previewContentRaw as Record<string, unknown>)
                      : {};
                  const runtimePatchContent = extractMiniAppRuntimeContent(result.outputData);
                  return {
                    ...item,
                    type: getMiniAppRuntimeType(item, result.outputData),
                    content: mergeMiniAppRuntimeContent(item, result.outputData),
                    preview: {
                      ...preview,
                      ...(typeof result.outputData?.uiType === "string" ? { uiType: result.outputData.uiType } : {}),
                      content: {
                        ...previewContent,
                        ...runtimePatchContent,
                      },
                      lastRun: {
                        input,
                        params,
                        output: result.output,
                        outputData: result.outputData,
                        ranAt: result.ranAt,
                      },
                    },
                  };
                })()
              : item
          )
        );

        const message = result.message;
        if (threadId && message) {
          setMessagesByThread((prev) => {
            const history = prev[threadId] || [];
            if (history.some((item) => item.id === message.id)) {
              return prev;
            }
            return {
              ...prev,
              [threadId]: [...history, message],
            };
          });
          setChatThreads((prev) => updateThreadPreview(prev, threadId, previewMessage(message)));
        }

        return result.output;
      },
      removeMiniApp: async (appId) => {
        if (!appId) return;
        await deleteMiniAppApi(appId);
        setMiniApps((prev) => prev.filter((item) => item.id !== appId));
      },
    };
  }, [
    acceptMeeting,
    activeMeetingSession,
    agents,
    bootstrapReady,
    botConfig,
    chatThreads,
    customSkills,
    endMeeting,
    friendAliases,
    friends,
    incomingMeetingSession,
    isE2E,
    language,
    leaveMeeting,
    listMembers,
    loadOlderMessages,
    meetingSessionsById,
    messagesByThread,
    miniAppTemplates,
    miniAppGeneration,
    miniApps,
    myHouseType,
    markThreadRead,
    patchThreadLanguageMap,
    persistFriendAliases,
    refreshAll,
    refreshThreadMessages,
    rejectMeeting,
    requestMeeting,
    shouldUseThreadMessageCache,
    skillCatalog,
    tasks,
    threadLanguageById,
    threadMembers,
    uiTheme,
    updateThreadLanguage,
    voiceModeEnabled,
    userID,
  ]);

  return <AgentTownContext.Provider value={value}>{children}</AgentTownContext.Provider>;
}

export function useAgentTown(): AgentTownContextValue {
  const value = useContext(AgentTownContext);
  if (!value) {
    throw new Error("useAgentTown must be used inside AgentTownProvider");
  }
  return value;
}
