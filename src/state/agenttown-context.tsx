import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system";
import * as LegacyFileSystem from "expo-file-system/legacy";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";

import { DEFAULT_MYBOT_AVATAR } from "@/src/constants/chat";
import {
  friendAliasKeys,
  friendAliasStorageKey,
  normalizeFriendAliases,
  resolveFriendDisplayName as resolveFriendDisplayNameFromAliases,
} from "@/src/features/friends/alias";
import {
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
  mapATSessionToThread,
  type AddThreadMemberInput,
  type CreateAgentInput,
  type CreateCustomSkillInput,
  type SendThreadMessageInput,
  type SendThreadMessageOutput,
  type V2ChatSessionMessage,
} from "@/src/lib/api";
import {
  Agent,
  AppLanguage,
  BotConfig,
  ChatThread,
  ConversationMessage,
  CustomSkill,
  Friend,
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
  generateRoleReplies: (threadId: string, prompt: string, memberIds?: string[]) => Promise<ConversationMessage[]>;
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

function mergePrependUnique(base: ConversationMessage[], incoming: ConversationMessage[]) {
  const seen = new Set(base.map((m) => m.id));
  const head: ConversationMessage[] = [];
  for (const msg of incoming) {
    if (!msg?.id) continue;
    if (seen.has(msg.id)) continue;
    seen.add(msg.id);
    head.push(msg);
  }
  return [...head, ...base];
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
    "You are a helpful and friendly digital assistant living in AgentTown.",
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

function sortMessagesBySeqOrTime(messages: ConversationMessage[]): ConversationMessage[] {
  return [...messages].sort((a, b) => {
    if (typeof a.seqNo === "number" && typeof b.seqNo === "number") {
      return a.seqNo - b.seqNo;
    }
    const at = Date.parse(a.time || "");
    const bt = Date.parse(b.time || "");
    if (Number.isFinite(at) && Number.isFinite(bt)) return at - bt;
    return 0;
  });
}

function normalizeLooseDateTime(value: unknown) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";
    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : trimmed;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const millis = value > 1_000_000_000_000 ? value : value * 1000;
    const parsed = new Date(millis);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : "";
  }
  return "";
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
  const timestamp = normalizeLooseDateTime(row.updated_at ?? row.created_at) || new Date().toISOString();
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
  };
}

function previewMessage(message: ConversationMessage): string {
  if (message.type === "image") {
    return message.content ? `[Image] ${message.content}` : "[Image]";
  }
  if (message.type === "voice") {
    return "[Voice]";
  }
  return message.content;
}

function normalizeMessageForUser(message: ConversationMessage, userID: string): ConversationMessage {
  const senderID = (message.senderId || "").trim();
  const current = (userID || "").trim();
  const isMe = senderID !== "" && current !== "" ? senderID === current : Boolean(message.isMe);
  return {
    ...message,
    isMe,
  };
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
  const notificationSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const threadLanguageSyncSignatureRef = useRef("");

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
    }
    if (payload?.messages && typeof payload.messages === "object") {
      setMessagesByThread(payload.messages);
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
    if (payload?.language === "zh" || payload?.language === "en" || payload?.language === "de") {
      setLanguage(payload.language);
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
  }, []);

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

    // Load from local cache first for instant paint.
    const cached = useThreadCache ? await readThreadCache(userID, threadId) : null;
    if (cached && cached.length > 0) {
      setMessagesByThread((prev) => ({
        ...prev,
        [threadId]: cached.slice(-MESSAGE_RENDER_WINDOW),
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
      latest = sortMessagesBySeqOrTime(latest);
      const merged = cached && cached.length > 0 ? mergeAppendUnique(cached, latest) : latest;
      const safeMerged = Array.isArray(merged) ? merged : [];
      if (useThreadCache) {
        void writeThreadCache(userID, threadId, safeMerged);
      }
      setMessagesByThread((prev) => ({
        ...prev,
        [threadId]: safeMerged.slice(-MESSAGE_RENDER_WINDOW),
      }));
      return;
    }
    try {
      const latestRaw = await listThreadMessagesApi(threadId, { limit: MESSAGE_PAGE_SIZE });
      latest = Array.isArray(latestRaw) ? latestRaw : [];
    } catch {
      const thread = chatThreadsRef.current.find((item) => item.id === threadId);
      const targetType = (thread?.targetType || "").trim();
      const targetId = (thread?.targetId || "").trim();

      if (targetType && targetId) {
        const response = await queryChatTargetHistoryApi(targetType, targetId, {
          pageSize: MESSAGE_PAGE_SIZE,
        });
        latest = (response.list || []).map((row) => mapATMessageToConversation(row, userID, threadId));
        historyCursorByThreadRef.current[threadId] = response.pagination?.next_cursor || null;
      } else {
        const response = await listChatSessionMessagesApi(threadId, { limit: MESSAGE_PAGE_SIZE });
        latest = response.map((row) => mapATMessageToConversation(row, userID, threadId));
      }
    }
    latest = sortMessagesBySeqOrTime(latest);
    const merged = cached && cached.length > 0 ? mergeAppendUnique(cached, latest) : latest;
    const safeMerged = Array.isArray(merged) ? merged : [];
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
              [threadId]: [...chunk, ...history],
            };
          });
          return chunk.length;
        }
      }
    }

    let older: ConversationMessage[] = [];
    try {
      older = await listThreadMessagesApi(threadId, { limit: MESSAGE_PAGE_SIZE, before: oldest });
    } catch {
      const thread = chatThreadsRef.current.find((item) => item.id === threadId);
      const targetType = (thread?.targetType || "").trim();
      const targetId = (thread?.targetId || "").trim();
      const cursor = historyCursorByThreadRef.current[threadId];
      if (targetType && targetId && cursor) {
        const response = await queryChatTargetHistoryApi(targetType, targetId, {
          cursor,
          pageSize: MESSAGE_PAGE_SIZE,
        });
        older = (response.list || []).map((row) => mapATMessageToConversation(row, userID, threadId));
        historyCursorByThreadRef.current[threadId] = response.pagination?.next_cursor || null;
      } else {
        const oldestSeqNo = current[0]?.seqNo;
        if (typeof oldestSeqNo === "number" && Number.isFinite(oldestSeqNo)) {
          const response = await listChatSessionMessagesApi(threadId, {
            limit: MESSAGE_PAGE_SIZE,
            beforeSeqNo: oldestSeqNo,
          });
          older = response.map((row) => mapATMessageToConversation(row, userID, threadId));
        }
      }
    }
    older = sortMessagesBySeqOrTime(older);
    if (!Array.isArray(older) || older.length === 0) return 0;

    setMessagesByThread((prev) => {
      const history = prev[threadId] || [];
      const historyIds = new Set(history.map((item) => item.id));
      const uniqueOlder = older.filter((item) => item.id && !historyIds.has(item.id));
      if (uniqueOlder.length === 0) return prev;
      return {
        ...prev,
        [threadId]: [...uniqueOlder, ...history],
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
      setBootstrapReady(true);
      return () => {
        cancelled = true;
      };
    }

    if (isE2E) {
      setBootstrapReady(true);
    } else {
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
    }

    return () => {
      cancelled = true;
    };
  }, [isE2E, isSignedIn, refreshAll, userID]);

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
    if (!isSignedIn || isE2E) return;

    const unsubscribe = subscribeRealtime((event: RealtimeEvent) => {
      if (!event?.type) return;

      switch (event.type) {
        case "chat.thread.created": {
          const payload = event.payload as ChatThread;
          if (!payload?.id) break;
          setChatThreads((prev) => upsertById(prev, payload, true));
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
          break;
        }
        case "chat.message.created": {
          const payload = event.payload as ConversationMessage;
          const threadId = event.threadId || payload?.threadId;
          if (!threadId || !payload?.id) break;
          const normalizedPayload = normalizeMessageForUser({ ...payload, threadId }, userID);

          setMessagesByThread((prev) => {
            const history = prev[threadId] || [];
            if (history.some((item) => item.id === normalizedPayload.id)) {
              return prev;
            }
            return {
              ...prev,
              [threadId]: [...history, normalizedPayload],
            };
          });

          if (shouldUseThreadMessageCache(threadId)) {
            void upsertThreadCache(userID, threadId, [normalizedPayload]);
          }
          setChatThreads((prev) => updateThreadPreview(prev, threadId, previewMessage(normalizedPayload)));
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
  }, [isE2E, isSignedIn, patchThreadLanguageMap, shouldUseThreadMessageCache, userID]);

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
      updateLanguage: setLanguage,
      updateThreadLanguage,
      updateVoiceModeEnabled: setVoiceModeEnabled,
      refreshAll,
      refreshThreadMessages,
      loadOlderMessages,
      sendMessage: async (threadId, payload) => {
        if (!threadId) return null;
        const useThreadCache = shouldUseThreadMessageCache(threadId);
        if (isE2E) {
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
          };
          const base = messagesByThreadRef.current[threadId] || [];
          const nextMessages = [...base, userMessage];
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
          if (Array.isArray(result.messages)) {
            setMessagesByThread((prev) => ({
              ...prev,
              [threadId]: result.messages,
            }));
            if (useThreadCache) {
              void upsertThreadCache(userID, threadId, result.messages);
            }
          }
          const preview = result.aiMessage
            ? previewMessage(result.aiMessage)
            : previewMessage(result.userMessage);
          setChatThreads((prev) => updateThreadPreview(prev, threadId, preview));
          return result;
        } catch {
          return null;
        }
      },
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
        } catch {
          return null;
        }
      },
      generateRoleReplies: async (threadId, prompt, memberIds) => {
        if (!threadId || !prompt.trim()) return [];
        try {
          const result = await generateRoleRepliesApi(threadId, {
            prompt,
            memberIds,
            appendUserMessage: true,
          });

          setMessagesByThread((prev) => {
            const history = prev[threadId] || [];
            const next = [...history];
            if (result.userMessage && !next.some((item) => item.id === result.userMessage?.id)) {
              next.push(result.userMessage);
            }
            for (const reply of result.replies || []) {
              if (!next.some((item) => item.id === reply.id)) {
                next.push(reply);
              }
            }
            return {
              ...prev,
              [threadId]: next,
            };
          });

          const cacheBatch: ConversationMessage[] = [];
          if (result.userMessage) cacheBatch.push(result.userMessage);
          if (Array.isArray(result.replies) && result.replies.length) {
            cacheBatch.push(...result.replies);
          }
          void upsertThreadCache(userID, threadId, cacheBatch);

          const latest = result.replies?.[result.replies.length - 1];
          if (latest) {
            setChatThreads((prev) => updateThreadPreview(prev, threadId, previewMessage(latest)));
          }

          return result.replies || [];
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
              ? {
                  ...item,
                  preview: {
                    ...(item.preview || {}),
                    ...(typeof result.outputData?.uiType === "string"
                      ? { uiType: result.outputData.uiType }
                      : {}),
                    content: {
                      ...(((item.preview || {}) as Record<string, unknown>).content as Record<string, unknown> || {}),
                      ...(Array.isArray(result.outputData?.items)
                        ? { items: result.outputData.items }
                        : {}),
                      ...(result.outputData?.card &&
                      typeof result.outputData.card === "object" &&
                      !Array.isArray(result.outputData.card)
                        ? { card: result.outputData.card }
                        : {}),
                      ...(Array.isArray(result.outputData?.panels)
                        ? { panels: result.outputData.panels }
                        : {}),
                      ...(Array.isArray(result.outputData?.blocks)
                        ? { blocks: result.outputData.blocks }
                        : {}),
                    },
                    lastRun: {
                      input,
                      params,
                      output: result.output,
                      outputData: result.outputData,
                      ranAt: result.ranAt,
                    },
                  },
                }
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
    agents,
    bootstrapReady,
    botConfig,
    chatThreads,
    customSkills,
    friendAliases,
    friends,
    isE2E,
    language,
    listMembers,
    loadOlderMessages,
    messagesByThread,
    miniAppTemplates,
    miniAppGeneration,
    miniApps,
    myHouseType,
    patchThreadLanguageMap,
    persistFriendAliases,
    refreshAll,
    refreshThreadMessages,
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
