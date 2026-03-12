import {
  Agent,
  AppBootstrapState,
  AuthUser,
  BotConfig,
  ChatThread,
  ConversationMessage,
  Friend,
  FriendRequest,
  KnowledgeDataset,
  MiniApp,
  MiniAppTemplate,
  NPC,
  NPCSkillBinding,
  RealtimeEvent,
  SettingsSkillItem,
  TaskItem,
  ThreadDisplayLanguage,
  ThreadMember,
  ThreadMemberType,
} from "@/src/types";
import { getE2ELaunchArgs, isE2ETestMode } from "@/src/utils/e2e";
import { resolveApiBaseUrl } from "./api-base-url";

export interface BootstrapPayload extends AppBootstrapState {}

export interface AuthSessionPayload {
  token: string;
  user: AuthUser;
}

export interface AuthPasswordResetSendCodeResponse {
  message?: string;
  expiresAt?: string;
  verificationCode?: string;
  devCode?: string;
  retryAfterSeconds?: number;
}

export interface AuthPasswordResetVerifyCodeResponse {
  message?: string;
  resetToken: string;
  resetTokenExpiresAt?: string;
}

export interface AuthPasswordResetCompleteResponse {
  ok?: boolean;
  message?: string;
}

export interface SendThreadMessageInput {
  content: string;
  type?: string;
  voiceDuration?: string;
  replyContext?: string;
  imageUri?: string;
  imageName?: string;
  senderId?: string;
  senderName?: string;
  senderAvatar?: string;
  senderType?: string;
  isMe?: boolean;
  requestAI?: boolean;
  systemInstruction?: string;
  history?: Array<{ role: "user" | "model"; text: string }>;
  mentionedMemberIds?: string[];
  mentionedAll?: boolean;
}

export interface SendThreadMessageOutput {
  userMessage: ConversationMessage;
  aiMessage?: ConversationMessage;
  messages: ConversationMessage[];
}

export interface UploadV2FileInput {
  uri: string;
  name?: string;
  mimeType?: string;
}

export interface UploadV2FileOutput {
  id?: string;
  url?: string;
  name?: string;
  mimeType?: string;
  size?: number;
  raw: unknown;
}

export interface CreateTaskFromMessageInput {
  threadId: string;
  messageId: string;
  title?: string;
  assignee?: string;
  priority?: "High" | "Medium" | "Low";
  dueAt?: string;
}

export interface CreateTaskInput extends TaskItem {
  description?: string;
  target_type?: string;
  target_id?: string;
  targetType?: string;
  targetId?: string;
}

export interface ThreadDisplayLanguagePreferenceResponse {
  thread_id: string;
  language: ThreadDisplayLanguage;
  updated_at?: string;
}

export interface PatchTaskInput {
  title?: string;
  assignee?: string;
  priority?: "High" | "Medium" | "Low";
  status?: "Pending" | "In Progress" | "Done";
  dueAt?: string;
}

export interface CreateAgentInput {
  name: string;
  avatar?: string;
  description?: string;
  rolePrompt?: string;
  persona?: string;
  tools?: string[];
  safetyLevel?: string;
}

export interface PatchAgentInput {
  name?: string;
  avatar?: string;
  description?: string;
  rolePrompt?: string;
  persona?: string;
  tools?: string[];
  safetyLevel?: string;
  status?: "online" | "offline";
}

export interface AgentChatInput {
  threadId?: string;
  message: string;
  history?: Array<{ role: "user" | "model"; text: string }>;
}

export interface AgentChatOutput {
  agentId: string;
  reply: string;
  message?: ConversationMessage;
}

export interface GenerateMiniAppInput {
  query: string;
  sources: string[];
}

export interface RunMiniAppInput {
  input?: string;
  params?: Record<string, unknown>;
  threadId?: string;
}

export interface RunMiniAppOutput {
  appId: string;
  output: string;
  outputData?: Record<string, unknown>;
  ranAt: string;
  message?: ConversationMessage;
}

export interface ATSession {
  id: string;
  title?: string;
  target_type?: string;
  target_id?: string;
  message_count?: number;
  updated_at?: string;
}

export interface ATBotSettings {
  bot_enabled?: boolean;
  visibility?: "private" | "group" | "public" | string;
  bot_prompt?: string;
  bot_name?: string;
  bot_avatar?: string;
}

export interface ATCreateSessionInput {
  target_type: "user" | "group" | "agent" | "user_bot";
  target_id: string;
  title?: string;
}

export interface ATListSessionsInput {
  targetType?: string;
  targetId?: string;
  limit?: number;
}

export interface ATListSessionMessagesInput {
  role?: string;
  messageType?: string;
  from?: string;
  to?: string;
  includeTool?: boolean;
  beforeSeqNo?: number;
  afterSeqNo?: number;
  limit?: number;
}

export interface ATQueryChatHistoryInput {
  targetType?: string;
  targetId?: string;
  sessionType?: string;
  role?: string;
  messageType?: string;
  from?: string;
  to?: string;
  includeTool?: boolean;
  cursor?: string;
  pageSize?: number;
}

export interface ATChatMessage {
  id: string;
  session_id?: string;
  owner_user_id?: string;
  target_type?: string;
  target_id?: string;
  seq_no?: number;
  role?: string;
  message_type?: string;
  content?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ATChatSessionListResponse {
  list: ATSession[];
}

export interface ATChatMessageListResponse {
  list: ATChatMessage[];
}

export interface V2ChatSession {
  id: string;
  title?: string;
  created_at?: number;
  updated_at?: number;
}

export interface V2ChatSessionsResponse {
  list: V2ChatSession[];
  has_more?: boolean;
  next_before?: number;
}

export interface V2ChatSessionMessage {
  id?: string;
  role?: string;
  content?: string;
  message_type?: string;
  created_at?: string | number;
  updated_at?: string | number;
}

export interface V2ChatSessionMessagesResponse {
  list: V2ChatSessionMessage[];
}

export interface CreateNPCInput {
  scope?: "user" | "system";
  name: string;
  avatar_url?: string;
  intro?: string;
  system_prompt: string;
  model_name?: string;
}

export interface UpdateNPCInput {
  name?: string;
  avatar_url?: string;
  intro?: string;
  system_prompt?: string;
  model_name?: string;
  status?: "active" | "inactive" | string;
}

export interface ATChatHistoryPagination {
  page_size?: number;
  next_cursor?: string;
}

export interface ATChatHistoryResponse {
  list: ATChatMessage[];
  pagination?: ATChatHistoryPagination;
}

export interface CreateFriendInput {
  userId: string;
  name?: string;
  avatar?: string;
  kind?: "human" | "bot";
  role?: string;
  company?: string;
  threadId?: string;
}

export interface CreateFriendResponse {
  mode: "friend" | "request";
  friend?: Friend;
  request?: FriendRequest;
}

export interface CreateFriendQRResponse {
  token: string;
  expiresAt: string;
}

export interface ScanFriendQRInput {
  token: string;
}

export interface DiscoverUser {
  id: string;
  displayName: string;
  email?: string;
  provider: string;
  role: "admin" | "member" | "guest";
  avatar: string;
}

export interface AddThreadMemberInput {
  friendId?: string;
  agentId?: string;
  npcId?: string;
  memberType?: ThreadMemberType;
  name?: string;
  avatar?: string;
}

export interface CreateCustomSkillInput {
  name: string;
  description?: string;
  markdown: string;
  permissionScope?: string;
  executor?: string;
  version?: string;
  enabled?: boolean;
}

export interface CreateKnowledgeDatasetInput {
  name: string;
  entries?: Array<{
    type?: string;
    name: string;
    text?: string;
    fileUrl?: string;
    contentType?: string;
    size?: number;
  }>;
}

export interface UpdateKnowledgeDatasetInput {
  name?: string;
  addEntries?: Array<{
    type?: string;
    name: string;
    text?: string;
    fileUrl?: string;
    contentType?: string;
    size?: number;
  }>;
  removeEntryIds?: string[];
}

export interface ExecuteCustomSkillInput {
  input: string;
  threadId?: string;
  variables?: Record<string, unknown>;
}

export interface ExecuteCustomSkillOutput {
  skillId: string;
  output: string;
  message?: ConversationMessage;
}

type V2SkillCatalogItem = {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  category?: unknown;
  icon?: unknown;
  installed?: unknown;
};

type V2UserSkill = {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  skill_content?: unknown;
  content?: unknown;
  scope?: unknown;
  enabled?: unknown;
  installed?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
  version?: unknown;
};

type V2NPCSkillBinding = {
  id?: unknown;
  npc_id?: unknown;
  skill_id?: unknown;
  skill_name?: unknown;
  skill_scope?: unknown;
  enabled?: unknown;
  priority?: unknown;
  created_at?: unknown;
};

type V2NPC = {
  id?: unknown;
  scope?: unknown;
  owner_user_id?: unknown;
  name?: unknown;
  avatar_url?: unknown;
  intro?: unknown;
  system_prompt?: unknown;
  model_name?: unknown;
  status?: unknown;
  skill_bindings?: unknown;
  knowledge_ids?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
};

type V2KnowledgeEntry = {
  id?: unknown;
  dataset_id?: unknown;
  type?: unknown;
  name?: unknown;
  created_at?: unknown;
};

type V2KnowledgeDataset = {
  id?: unknown;
  user_id?: unknown;
  name?: unknown;
  entries?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
};

export interface RoleRepliesInput {
  prompt: string;
  memberIds?: string[];
  mentionedAll?: boolean;
  includeMyBot?: boolean;
  appendUserMessage?: boolean;
}

export interface MarkThreadReadInput {
  lastReadSeqNo?: number;
}

export interface MarkThreadReadOutput {
  ok?: boolean;
  threadId: string;
  lastReadSeqNo?: number;
  unreadCount?: number;
  mentionUnreadCount?: number;
}

export interface RoleRepliesOutput {
  threadId: string;
  userMessage?: ConversationMessage;
  replies: ConversationMessage[];
}

export interface RegisterPushDeviceInput {
  expoPushToken: string;
  platform?: string;
  appVersion?: string;
}

export interface UnregisterPushDeviceInput {
  expoPushToken: string;
}

type ApiErrorBody = {
  error?: {
    code?: unknown;
    message?: unknown;
    details?: unknown;
    requestId?: unknown;
  };
  code?: unknown;
  message?: unknown;
  details?: unknown;
  requestId?: unknown;
};

export class ApiError extends Error {
  status: number;
  method: string;
  path: string;
  baseUrl: string;
  code?: string;
  details?: unknown;
  requestId?: string;
  retryAfterSeconds?: number;

  constructor(params: {
    status: number;
    method: string;
    path: string;
    baseUrl: string;
    message: string;
    code?: string;
    details?: unknown;
    requestId?: string;
    retryAfterSeconds?: number;
  }) {
    super(params.message);
    this.name = "ApiError";
    this.status = params.status;
    this.method = params.method;
    this.path = params.path;
    this.baseUrl = params.baseUrl;
    this.code = params.code;
    this.details = params.details;
    this.requestId = params.requestId;
    this.retryAfterSeconds = params.retryAfterSeconds;
  }
}

function parseApiErrorBody(rawText: string) {
  if (!rawText) return null;
  try {
    return JSON.parse(rawText) as ApiErrorBody;
  } catch {
    return null;
  }
}

function coerceString(value: unknown) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function coerceNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

const EXPLICIT_TIMEZONE_SUFFIX = /(z|[+-]\d{2}:?\d{2})$/i;
const NAIVE_DATETIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})[t\s](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?$/i;

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

function parseDateTimeToMillis(value: string): number | null {
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
  if (Number.isFinite(directParsed)) return directParsed;

  if (!hasExplicitTimezone) {
    const forcedUtcParsed = Date.parse(`${normalized}Z`);
    if (Number.isFinite(forcedUtcParsed)) {
      return forcedUtcParsed;
    }
  }

  return null;
}

function normalizeDateTime(value: unknown) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";
    const asDate = parseDateTimeToMillis(trimmed);
    return typeof asDate === "number" ? new Date(asDate).toISOString() : trimmed;
  }
  const unix = coerceNumber(value);
  if (typeof unix !== "number") return "";
  const millis = unix > 1_000_000_000_000 ? unix : unix * 1000;
  const asDate = new Date(millis);
  return Number.isFinite(asDate.getTime()) ? asDate.toISOString() : "";
}

function normalizeV2SessionRow(row: V2ChatSession | null | undefined): V2ChatSession | null {
  const id = coerceString(row?.id);
  if (!id) return null;
  const normalized: V2ChatSession = {
    id,
    title: coerceString(row?.title),
    created_at: coerceNumber(row?.created_at),
    updated_at: coerceNumber(row?.updated_at),
  };
  return normalized;
}

function normalizeNPCSkillBinding(
  row: V2NPCSkillBinding | null | undefined,
  index: number
): NPCSkillBinding | null {
  const id = coerceString(row?.id) || `npc_binding_${index}`;
  const skillId = coerceString(row?.skill_id) || "";
  const skillName = coerceString(row?.skill_name) || skillId || "Unnamed Skill";
  return {
    id,
    npcId: coerceString(row?.npc_id) || "",
    skillId,
    skillName,
    skillScope: coerceString(row?.skill_scope) || "system",
    enabled: typeof row?.enabled === "boolean" ? row.enabled : true,
    priority: coerceNumber(row?.priority) || 0,
    createdAt: normalizeDateTime(row?.created_at),
  };
}

function normalizeNPC(row: V2NPC | null | undefined, index: number): NPC | null {
  const id = coerceString(row?.id);
  if (!id) return null;
  const bindings = Array.isArray(row?.skill_bindings)
    ? row.skill_bindings
        .map((item, bindingIndex) => normalizeNPCSkillBinding(item as V2NPCSkillBinding, bindingIndex))
        .filter((item): item is NPCSkillBinding => Boolean(item))
    : [];
  const knowledgeIds = Array.isArray(row?.knowledge_ids)
    ? row.knowledge_ids.map((item) => coerceString(item)).filter((item): item is string => Boolean(item))
    : [];
  return {
    id,
    scope: coerceString(row?.scope) || "user",
    ownerUserId: coerceString(row?.owner_user_id),
    name: coerceString(row?.name) || `NPC ${index + 1}`,
    avatarUrl: coerceString(row?.avatar_url),
    intro: coerceString(row?.intro),
    systemPrompt: coerceString(row?.system_prompt) || "",
    modelName: coerceString(row?.model_name),
    status: coerceString(row?.status),
    skillBindings: bindings,
    knowledgeIds,
    createdAt: normalizeDateTime(row?.created_at),
    updatedAt: normalizeDateTime(row?.updated_at),
  };
}

function normalizeKnowledgeDataset(row: V2KnowledgeDataset | null | undefined, index: number): KnowledgeDataset | null {
  const id = coerceString(row?.id);
  if (!id) return null;
  const entries = Array.isArray(row?.entries)
    ? row.entries
        .map((item, entryIndex) => {
          const entry = item as V2KnowledgeEntry;
          const entryId = coerceString(entry?.id) || `${id}_entry_${entryIndex}`;
          return {
            id: entryId,
            datasetId: coerceString(entry?.dataset_id) || id,
            type: coerceString(entry?.type) || "text",
            name: coerceString(entry?.name) || `Entry ${entryIndex + 1}`,
            createdAt: normalizeDateTime(entry?.created_at),
          };
        })
        .filter(Boolean)
    : [];
  return {
    id,
    userId: coerceString(row?.user_id),
    name: coerceString(row?.name) || `Dataset ${index + 1}`,
    entries,
    createdAt: normalizeDateTime(row?.created_at),
    updatedAt: normalizeDateTime(row?.updated_at),
  };
}

function parseRetryAfterSeconds(headerValue: string | null) {
  if (!headerValue) return undefined;
  const raw = headerValue.trim();
  if (!raw) return undefined;

  const asInt = Number.parseInt(raw, 10);
  if (Number.isFinite(asInt) && asInt >= 0) return asInt;

  const at = Date.parse(raw);
  if (!Number.isFinite(at)) return undefined;
  const seconds = Math.ceil((at - Date.now()) / 1000);
  return seconds > 0 ? seconds : 0;
}

function sanitizeRawErrorText(rawText: string) {
  const text = rawText.trim();
  if (!text) return undefined;
  if (text.startsWith("<!DOCTYPE") || text.startsWith("<html")) {
    return "Server error response";
  }
  return text.length > 280 ? `${text.slice(0, 280)}...` : text;
}

export function formatApiError(error: unknown) {
  if (error instanceof ApiError) {
    const parts: string[] = [];
    const code = error.code || `HTTP_${error.status}`;
    parts.push(`[${code}] ${error.message}`);
    if (error.status === 429) {
      if (typeof error.retryAfterSeconds === "number" && Number.isFinite(error.retryAfterSeconds)) {
        parts.push(`Rate limited. Retry after ${error.retryAfterSeconds}s.`);
      } else {
        parts.push("Rate limited. Please retry later.");
      }
    } else if (error.status >= 500) {
      parts.push("Server error. Please retry later.");
    } else if (error.status >= 400) {
      parts.push("Request failed. Please check your input or permissions.");
    }
    if (error.requestId) {
      parts.push(`Request ID: ${error.requestId}`);
    }
    return parts.join(" ");
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

let authToken: string | null = null;

export function setAuthToken(token?: string | null) {
  authToken = token?.trim() || null;
}

export function getAuthToken() {
  return authToken;
}

function getApiBaseUrl() {
  const e2eArgs = getE2ELaunchArgs();
  const e2eApiBaseUrl =
    typeof e2eArgs?.e2eApiBaseUrl === "string" ? e2eArgs.e2eApiBaseUrl.trim() : "";
  return resolveApiBaseUrl({
    e2eBaseUrl: e2eApiBaseUrl || process.env.EXPO_PUBLIC_E2E_API_BASE_URL,
    explicitBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
    allowLocalhostInRelease: isE2ETestMode() || Boolean(e2eApiBaseUrl || process.env.EXPO_PUBLIC_E2E_API_BASE_URL),
  });
}

function getRealtimeBaseUrl() {
  const base = getApiBaseUrl();
  if (base.startsWith("https://")) return `wss://${base.slice(8)}`;
  if (base.startsWith("http://")) return `ws://${base.slice(7)}`;
  return base;
}

async function apiFetch<T>(
  path: string,
  init?: RequestInit,
  options?: { skipAuth?: boolean; rawText?: boolean }
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers ? (init.headers as Record<string, string>) : {}),
  };
  if (!options?.skipAuth && authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }
  const url = `${getApiBaseUrl()}${path}`
  const response = await fetch(url, {
    ...init,
    headers,
  });
  
  if (!response.ok) {
    const text = await response.text();
    const base = getApiBaseUrl();
    const method = init?.method || "GET";
    const parsed = parseApiErrorBody(text);
    const bodyError = parsed?.error;
    const code = coerceString(bodyError?.code) || coerceString(parsed?.code);
    const canonicalMessage =
      coerceString(bodyError?.message) ||
      coerceString(parsed?.message) ||
      sanitizeRawErrorText(text) ||
      "API request failed";
    const requestId =
      coerceString(bodyError?.requestId) ||
      coerceString(parsed?.requestId) ||
      coerceString(response.headers.get("x-request-id")) ||
      coerceString(response.headers.get("x-correlation-id"));
    const retryAfterSeconds = parseRetryAfterSeconds(response.headers.get("retry-after"));
    const details = bodyError?.details ?? parsed?.details;

    throw new ApiError({
      status: response.status,
      method,
      path,
      baseUrl: base,
      code,
      details,
      requestId,
      retryAfterSeconds,
      message: canonicalMessage,
    });
  }

  if (response.status === 204) {
    return {} as T;
  }

  if (options?.rawText) {
    return (await response.text()) as unknown as T;
  }
  const resBody = (await response.json()) as T;
  if (__DEV__) {
    console.group(`api Fetch (${path}) --------------- Start`)
    if (init) console.log(`init: `, init)
    console.log(resBody)
    console.groupEnd()
    console.log('------------------------------------- End')
  }
  return resBody;
}

export async function authRegister(payload: {
  email: string;
  password: string;
  displayName?: string;
}) {
  return apiFetch<AuthSessionPayload>("/v1/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  }, { skipAuth: true });
}

export async function authLogin(payload: { email: string; password: string }) {
  return apiFetch<AuthSessionPayload>("/v1/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  }, { skipAuth: true });
}

export async function authRequestPasswordResetCode(payload: { email: string }) {
  return apiFetch<AuthPasswordResetSendCodeResponse>("/v1/auth/forgot", {
    method: "POST",
    body: JSON.stringify(payload),
  }, { skipAuth: true });
}

export async function authVerifyPasswordResetCode(payload: { email: string; code: string }) {
  return apiFetch<AuthPasswordResetVerifyCodeResponse>("/v1/auth/verify", {
    method: "POST",
    body: JSON.stringify(payload),
  }, { skipAuth: true });
}

export async function authResetPassword(payload: { email: string; resetToken: string; password: string }) {
  return apiFetch<AuthPasswordResetCompleteResponse>("/v1/auth/reset", {
    method: "POST",
    body: JSON.stringify(payload),
  }, { skipAuth: true });
}

export async function authGuest(displayName?: string) {
  return apiFetch<AuthSessionPayload>("/v1/auth/guest", {
    method: "POST",
    body: JSON.stringify({ displayName }),
  }, { skipAuth: true });
}

export async function authProvider(payload: {
  provider: "google" | "apple" | "phone";
  providerUserId: string;
  idToken?: string;
  email?: string;
  displayName?: string;
  avatar?: string;
}) {
  return apiFetch<AuthSessionPayload>("/v1/auth/provider", {
    method: "POST",
    body: JSON.stringify(payload),
  }, { skipAuth: true });
}

export async function authMe() {
  return apiFetch<AuthUser>("/v1/auth/me");
}

export async function authUpdateProfile(payload: { displayName: string; email: string; avatar?: string }) {
  return apiFetch<AuthSessionPayload>("/v1/auth/me/profile", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function fetchBootstrap() {
  return apiFetch<BootstrapPayload>("/v1/bootstrap");
}

export async function saveBotConfig(payload: BotConfig) {
  return apiFetch<BotConfig>("/v1/bot-config", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function atGetBotSettings(): Promise<ATBotSettings> {
  const config = await apiFetch<BotConfig>("/v1/bot-config");
  return {
    bot_enabled: true,
    visibility: "private",
    bot_prompt: config.systemInstruction || "",
    bot_name: config.name || "",
    bot_avatar: config.avatar || "",
  };
}

export async function atUpdateBotSettings(
  payload: Partial<ATBotSettings>
): Promise<ATBotSettings> {
  const current = await apiFetch<BotConfig>("/v1/bot-config");
  const next: BotConfig = {
    ...current,
    name: payload.bot_name ?? current.name,
    avatar: payload.bot_avatar ?? current.avatar,
    systemInstruction: payload.bot_prompt ?? current.systemInstruction,
  };
  const saved = await saveBotConfig(next);
  return {
    bot_enabled: payload.bot_enabled ?? true,
    visibility: payload.visibility ?? "private",
    bot_prompt: saved.systemInstruction || "",
    bot_name: saved.name || "",
    bot_avatar: saved.avatar || "",
  };
}

export async function installBotSkill(skillId: string) {
  return apiFetch<BotConfig>(`/v1/bot/skills/${encodeURIComponent(skillId)}`, {
    method: "POST",
  });
}

export async function uninstallBotSkill(skillId: string) {
  return apiFetch<BotConfig>(`/v1/bot/skills/${encodeURIComponent(skillId)}`, {
    method: "DELETE",
  });
}

export async function listTasks() {
  return apiFetch<TaskItem[]>("/v1/tasks");
}

export async function createTask(payload: CreateTaskInput) {
  return apiFetch<TaskItem>("/v1/tasks", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function createTaskFromMessage(payload: CreateTaskFromMessageInput) {
  return apiFetch<TaskItem>("/v1/tasks/from-message", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function patchTask(taskId: string, payload: PatchTaskInput) {
  return apiFetch<TaskItem>(`/v1/tasks/${encodeURIComponent(taskId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteTask(taskId: string) {
  return apiFetch<{ ok: boolean; id: string }>(`/v1/tasks/${encodeURIComponent(taskId)}`, {
    method: "DELETE",
  });
}

export async function listChatThreads() {
  return apiFetch<ChatThread[]>("/v1/chat/threads");
}

export async function createChatThread(payload: ChatThread) {
  return apiFetch<ChatThread>("/v1/chat/threads", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function deleteChatThread(threadId: string) {
  return apiFetch<{ ok: boolean; id: string }>(`/v1/chat/threads/${encodeURIComponent(threadId)}`, {
    method: "DELETE",
  });
}

export async function getThreadDisplayLanguage(threadId: string) {
  return apiFetch<ThreadDisplayLanguagePreferenceResponse>(
    `/v1/chat/threads/${encodeURIComponent(threadId)}/display-language`
  );
}

export async function updateThreadDisplayLanguage(threadId: string, language: ThreadDisplayLanguage) {
  return apiFetch<ThreadDisplayLanguagePreferenceResponse>(
    `/v1/chat/threads/${encodeURIComponent(threadId)}/display-language`,
    {
      method: "PUT",
      body: JSON.stringify({ language }),
    }
  );
}

export async function atCreateSession(payload: ATCreateSessionInput): Promise<ATSession> {
  const created = await apiFetch<ChatThread>("/v1/chat/threads", {
    method: "POST",
    body: JSON.stringify({
      name: payload.title || "",
      isGroup: payload.target_type !== "user",
      targetType: payload.target_type,
      targetId: payload.target_id,
    }),
  });
  return {
    id: created.id,
    title: created.name,
    target_type: created.targetType || payload.target_type,
    target_id: created.targetId || payload.target_id,
  };
}

export function mapATSessionToThread(session: ATSession): ChatThread {
  const isGroup = (session.target_type || "").toLowerCase() === "group";
  const updatedAt = (session.updated_at || "").trim();
  return {
    id: session.id,
    name: session.title || session.id,
    avatar: "",
    message: "",
    time: updatedAt || "Now",
    isGroup,
    targetType: session.target_type,
    targetId: session.target_id,
  };
}

export function mapATMessageToConversation(
  row: ATChatMessage,
  currentUserId: string,
  threadId?: string
): ConversationMessage {
  const role = (row.role || "").trim().toLowerCase();
  const isUserRole = role === "user";
  const isMe = isUserRole && Boolean(currentUserId);
  const messageType = (row.message_type || "text").trim() || "text";
  const content = row.content || "";
  const createdAt = normalizeDateTime(row.created_at);
  const updatedAt = normalizeDateTime(row.updated_at);
  const senderName = isUserRole ? "Me" : role === "assistant" ? "Assistant" : "System";
  const senderType = isUserRole ? "human" : role === "assistant" ? "agent" : "system";
  return {
    id: row.id,
    threadId: threadId || row.session_id,
    seqNo: typeof row.seq_no === "number" ? row.seq_no : undefined,
    senderId: isUserRole ? currentUserId : row.target_id,
    senderName,
    senderAvatar: "",
    senderType,
    content,
    type: messageType,
    isMe,
    time: createdAt || updatedAt,
    createdAt: createdAt || undefined,
    updatedAt: updatedAt || undefined,
    receivedAt: createdAt || updatedAt || undefined,
  };
}

export async function listV2ChatSessions(options: {
  limit?: number;
  before?: number;
  eventNum?: number;
} = {}): Promise<V2ChatSession[]> {
  const params = new URLSearchParams();
  if (typeof options.limit === "number" && options.limit > 0) {
    params.set("limit", String(options.limit));
  }
  if (typeof options.before === "number" && Number.isFinite(options.before) && options.before > 0) {
    params.set("before", String(options.before));
  }
  if (typeof options.eventNum === "number" && options.eventNum > 0) {
    params.set("event_num", String(options.eventNum));
  }
  const qs = params.toString();
  const payload = await apiFetch<V2ChatSessionsResponse | V2ChatSession[]>(
    `/v2/chat/sessions${qs ? `?${qs}` : ""}`
  );
  const rows = Array.isArray(payload)
    ? payload
    : payload && Array.isArray(payload.list)
      ? payload.list
      : [];
  return rows
    .map((row) => normalizeV2SessionRow(row))
    .filter((row): row is V2ChatSession => Boolean(row));
}

export async function listV2ChatSessionMessages(sessionId: string): Promise<V2ChatSessionMessage[]> {
  const payload = await apiFetch<V2ChatSessionMessagesResponse | V2ChatSessionMessage[]>(
    `/v2/chat/sessions/${encodeURIComponent(sessionId)}/messages`
  );
  const rows = Array.isArray(payload)
    ? payload
    : payload && Array.isArray(payload.list)
      ? payload.list
      : [];
  return rows.map((row) => ({
    id: coerceString(row?.id),
    role: coerceString(row?.role),
    content: typeof row?.content === "string" ? row.content : "",
    message_type: coerceString(row?.message_type) || "text",
    created_at: row?.created_at,
    updated_at: row?.updated_at,
  }));
}

export async function listNPCSessions(
  npcId: string,
  options: {
    limit?: number;
    before?: number;
    eventNum?: number;
  } = {}
): Promise<V2ChatSession[]> {
  const params = new URLSearchParams();
  if (typeof options.limit === "number" && options.limit > 0) {
    params.set("limit", String(options.limit));
  }
  if (typeof options.before === "number" && Number.isFinite(options.before) && options.before > 0) {
    params.set("before", String(options.before));
  }
  if (typeof options.eventNum === "number" && options.eventNum > 0) {
    params.set("event_num", String(options.eventNum));
  }
  const qs = params.toString();
  const payload = await apiFetch<V2ChatSessionsResponse | V2ChatSession[]>(
    `/v2/npc/${encodeURIComponent(npcId)}/sessions${qs ? `?${qs}` : ""}`
  );
  const rows = Array.isArray(payload)
    ? payload
    : payload && Array.isArray(payload.list)
      ? payload.list
      : [];
  return rows
    .map((row) => normalizeV2SessionRow(row))
    .filter((row): row is V2ChatSession => Boolean(row));
}

export async function listNPCSessionMessages(npcId: string, sessionId: string): Promise<V2ChatSessionMessage[]> {
  const payload = await apiFetch<V2ChatSessionMessagesResponse | V2ChatSessionMessage[]>(
    `/v2/npc/${encodeURIComponent(npcId)}/sessions/${encodeURIComponent(sessionId)}/messages`
  );
  const rows = Array.isArray(payload)
    ? payload
    : payload && Array.isArray(payload.list)
      ? payload.list
      : [];
  return rows.map((row) => ({
    id: coerceString(row?.id),
    role: coerceString(row?.role),
    content: typeof row?.content === "string" ? row.content : "",
    message_type: coerceString(row?.message_type) || "text",
    created_at: row?.created_at,
    updated_at: row?.updated_at,
  }));
}

export async function listChatSessions(options: ATListSessionsInput = {}): Promise<ATSession[]> {
  const params = new URLSearchParams();
  if (options.targetType?.trim()) params.set("target_type", options.targetType.trim());
  if (options.targetId?.trim()) params.set("target_id", options.targetId.trim());
  if (typeof options.limit === "number" && options.limit > 0) params.set("limit", String(options.limit));
  const qs = params.toString();
  const payload = await apiFetch<ATChatSessionListResponse | ATSession[]>(
    `/v1/chat/sessions${qs ? `?${qs}` : ""}`
  );
  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload.list) ? payload.list : [];
}

export async function listChatSessionMessages(
  sessionId: string,
  options: ATListSessionMessagesInput = {}
): Promise<ATChatMessage[]> {
  const params = new URLSearchParams();
  if (options.role?.trim()) params.set("role", options.role.trim());
  if (options.messageType?.trim()) params.set("message_type", options.messageType.trim());
  if (options.from?.trim()) params.set("from", options.from.trim());
  if (options.to?.trim()) params.set("to", options.to.trim());
  if (typeof options.includeTool === "boolean") params.set("include_tool", String(options.includeTool));
  if (typeof options.beforeSeqNo === "number" && Number.isFinite(options.beforeSeqNo)) {
    params.set("before_seq_no", String(options.beforeSeqNo));
  }
  if (typeof options.afterSeqNo === "number" && Number.isFinite(options.afterSeqNo)) {
    params.set("after_seq_no", String(options.afterSeqNo));
  }
  if (typeof options.limit === "number" && options.limit > 0) params.set("limit", String(options.limit));
  const qs = params.toString();
  const payload = await apiFetch<ATChatMessageListResponse | ATChatMessage[]>(
    `/v1/chat/sessions/${encodeURIComponent(sessionId)}/messages${qs ? `?${qs}` : ""}`
  );
  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload.list) ? payload.list : [];
}

export async function queryChatHistory(options: ATQueryChatHistoryInput = {}): Promise<ATChatHistoryResponse> {
  const params = new URLSearchParams();
  if (options.targetType?.trim()) params.set("target_type", options.targetType.trim());
  if (options.targetId?.trim()) params.set("target_id", options.targetId.trim());
  if (options.sessionType?.trim()) params.set("session_type", options.sessionType.trim());
  if (options.role?.trim()) params.set("role", options.role.trim());
  if (options.messageType?.trim()) params.set("message_type", options.messageType.trim());
  if (options.from?.trim()) params.set("from", options.from.trim());
  if (options.to?.trim()) params.set("to", options.to.trim());
  if (typeof options.includeTool === "boolean") params.set("include_tool", String(options.includeTool));
  if (options.cursor?.trim()) params.set("cursor", options.cursor.trim());
  if (typeof options.pageSize === "number" && options.pageSize > 0) {
    params.set("page_size", String(options.pageSize));
  }
  const qs = params.toString();
  const payload = await apiFetch<ATChatHistoryResponse | ATChatMessage[]>(
    `/v1/chat/history${qs ? `?${qs}` : ""}`
  );
  if (Array.isArray(payload)) {
    return {
      list: payload,
      pagination: {},
    };
  }
  return {
    list: Array.isArray(payload.list) ? payload.list : [],
    pagination: payload.pagination || {},
  };
}

export async function queryChatTargetHistory(
  targetType: string,
  targetId: string,
  options: Omit<ATQueryChatHistoryInput, "targetType" | "targetId"> = {}
): Promise<ATChatHistoryResponse> {
  const params = new URLSearchParams();
  if (options.sessionType?.trim()) params.set("session_type", options.sessionType.trim());
  if (options.role?.trim()) params.set("role", options.role.trim());
  if (options.messageType?.trim()) params.set("message_type", options.messageType.trim());
  if (options.from?.trim()) params.set("from", options.from.trim());
  if (options.to?.trim()) params.set("to", options.to.trim());
  if (typeof options.includeTool === "boolean") params.set("include_tool", String(options.includeTool));
  if (options.cursor?.trim()) params.set("cursor", options.cursor.trim());
  if (typeof options.pageSize === "number" && options.pageSize > 0) {
    params.set("page_size", String(options.pageSize));
  }
  const qs = params.toString();
  const payload = await apiFetch<ATChatHistoryResponse | ATChatMessage[]>(
    `/v1/chat/targets/${encodeURIComponent(targetType)}/${encodeURIComponent(targetId)}/history${qs ? `?${qs}` : ""}`
  );
  if (Array.isArray(payload)) {
    return {
      list: payload,
      pagination: {},
    };
  }
  return {
    list: Array.isArray(payload.list) ? payload.list : [],
    pagination: payload.pagination || {},
  };
}

export async function listThreadMessages(
  threadId: string,
  options?: { limit?: number; before?: string }
) {
  const params = new URLSearchParams();
  if (options?.limit && options.limit > 0) params.set("limit", String(options.limit));
  if (options?.before) params.set("before", options.before);
  const qs = params.toString();
  return apiFetch<ConversationMessage[]>(
    `/v1/chat/threads/${encodeURIComponent(threadId)}/messages${qs ? `?${qs}` : ""}`
  );
}

export async function sendThreadMessage(threadId: string, payload: SendThreadMessageInput) {
  const requestBody: {
    content: string;
    type?: string;
    voiceDuration?: string;
    replyContext?: string;
    imageUri?: string;
    imageName?: string;
    mentionedMemberIds?: string[];
    mentionedAll?: boolean;
  } = {
    content: payload.content,
  };
  if (payload.type?.trim()) requestBody.type = payload.type;
  if (payload.voiceDuration?.trim()) requestBody.voiceDuration = payload.voiceDuration;
  if (payload.replyContext?.trim()) requestBody.replyContext = payload.replyContext;
  if (payload.imageUri?.trim()) requestBody.imageUri = payload.imageUri;
  if (payload.imageName?.trim()) requestBody.imageName = payload.imageName;
  if (payload.mentionedMemberIds?.length) requestBody.mentionedMemberIds = payload.mentionedMemberIds;
  if (payload.mentionedAll) requestBody.mentionedAll = true;

  return apiFetch<SendThreadMessageOutput>(
    `/v1/chat/threads/${encodeURIComponent(threadId)}/messages`,
    {
      method: "POST",
      body: JSON.stringify(requestBody),
    }
  );
}

export async function uploadFileV2(input: UploadV2FileInput): Promise<UploadV2FileOutput> {
  const uri = (input.uri || "").trim();
  if (!uri) {
    throw new Error("File uri is required.");
  }

  const filename = (input.name || "").trim() || `upload_${Date.now()}`;
  const mimeType = (input.mimeType || "").trim() || "application/octet-stream";
  const path = "/v2/files/upload";
  const base = getApiBaseUrl();

  const headers: Record<string, string> = {};
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }
  const parseUploadPayload = (payload: unknown): UploadV2FileOutput => {
    const root = asRecord(payload) || {};
    const nestedCandidates = [
      asRecord(root.data),
      asRecord(root.file),
      asRecord(root.result),
      asRecord(root.payload),
      asRecord(root.document),
    ].filter((item): item is Record<string, unknown> => Boolean(item));
    const parseKeys = (obj: Record<string, unknown>) => ({
      id:
        coerceString(obj.id) ||
        coerceString(obj.file_id) ||
        coerceString(obj.fileId) ||
        coerceString(obj.object_key) ||
        coerceString(obj.objectKey),
      url:
        coerceString(obj.url) ||
        coerceString(obj.file_url) ||
        coerceString(obj.fileUrl) ||
        coerceString(obj.download_url) ||
        coerceString(obj.downloadUrl) ||
        coerceString(obj.cdn_url) ||
        coerceString(obj.cdnUrl) ||
        coerceString(obj.signed_url) ||
        coerceString(obj.signedUrl) ||
        coerceString(obj.public_url) ||
        coerceString(obj.publicUrl) ||
        coerceString(obj.path) ||
        coerceString(obj.uri),
      name:
        coerceString(obj.name) ||
        coerceString(obj.filename) ||
        coerceString(obj.file_name) ||
        coerceString(obj.fileName) ||
        coerceString(obj.original_name) ||
        coerceString(obj.originalName),
      mimeType:
        coerceString(obj.mime_type) ||
        coerceString(obj.mimeType) ||
        coerceString(obj.content_type) ||
        coerceString(obj.contentType),
      size: coerceNumber(obj.size) || coerceNumber(obj.file_size) || coerceNumber(obj.fileSize),
    });
    const resolved = nestedCandidates
      .map(parseKeys)
      .find((candidate) => candidate.id || candidate.url || candidate.name) || parseKeys(root);
    return {
      id: resolved.id,
      url: resolved.url,
      name: resolved.name || filename,
      mimeType: resolved.mimeType || mimeType,
      size: resolved.size,
      raw: payload,
    };
  };

  const form = new FormData();
  form.append("file", {
    uri,
    name: filename,
    type: mimeType,
  } as any);
  form.append("filename", filename);

  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers,
    body: form,
  });
  if (!response.ok) {
    const text = await response.text();
    const parsed = parseApiErrorBody(text);
    const bodyError = parsed?.error;
    const code = coerceString(bodyError?.code) || coerceString(parsed?.code);
    const canonicalMessage =
      coerceString(bodyError?.message) ||
      coerceString(parsed?.message) ||
      sanitizeRawErrorText(text) ||
      "API request failed";
    const requestId =
      coerceString(bodyError?.requestId) ||
      coerceString(parsed?.requestId) ||
      coerceString(response.headers.get("x-request-id")) ||
      coerceString(response.headers.get("x-correlation-id"));
    const retryAfterSeconds = parseRetryAfterSeconds(response.headers.get("retry-after"));
    const details = bodyError?.details ?? parsed?.details;
    throw new ApiError({
      status: response.status,
      method: "POST",
      path,
      baseUrl: base,
      code,
      details,
      requestId,
      retryAfterSeconds,
      message: canonicalMessage,
    });
  }

  const rawText = response.status === 204 ? "" : await response.text();
  let payload: unknown = {};
  if (rawText) {
    try {
      payload = JSON.parse(rawText);
    } catch {
      payload = { url: rawText };
    }
  }
  return parseUploadPayload(payload);
}

export async function generateRoleReplies(threadId: string, payload: RoleRepliesInput) {
  return apiFetch<RoleRepliesOutput>(
    `/v1/chat/threads/${encodeURIComponent(threadId)}/role-replies`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}

export async function listFriends() {
  return apiFetch<Friend[]>("/v1/friends");
}

export async function createFriend(payload: CreateFriendInput) {
  return apiFetch<CreateFriendResponse>("/v1/friends", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listFriendRequests() {
  return apiFetch<FriendRequest[]>("/v1/friend-requests");
}

export async function acceptFriendRequest(requestId: string) {
  return apiFetch<{ ok: boolean; request: FriendRequest; thread?: ChatThread; friend?: Friend }>(
    `/v1/friend-requests/${encodeURIComponent(requestId)}/accept`,
    { method: "POST" }
  );
}

export async function rejectFriendRequest(requestId: string) {
  return apiFetch<{ ok: boolean; request: FriendRequest }>(
    `/v1/friend-requests/${encodeURIComponent(requestId)}/reject`,
    { method: "POST" }
  );
}

export async function registerPushDevice(payload: RegisterPushDeviceInput) {
  return apiFetch<{ ok: boolean }>("/v1/notifications/push-devices", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function unregisterPushDevice(payload: UnregisterPushDeviceInput) {
  return apiFetch<{ ok: boolean }>("/v1/notifications/push-devices", {
    method: "DELETE",
    body: JSON.stringify(payload),
  });
}

export async function createFriendQR() {
  return apiFetch<CreateFriendQRResponse>("/v1/friend-qr/create", {
    method: "POST",
  });
}

export function buildFriendQrDeepLink(token: string) {
  const safeToken = token.trim();
  if (!safeToken) return "";
  return `agenttown://friend-qr?token=${encodeURIComponent(safeToken)}`;
}

export function extractFriendQrToken(input: string) {
  const value = input.trim();
  if (!value) return "";
  if (value.startsWith("fq1.")) {
    return value;
  }

  const tokenMatch = value.match(/\bfq1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/);
  if (tokenMatch?.[0]) {
    return tokenMatch[0];
  }

  try {
    const parsed = new URL(value);
    const token = parsed.searchParams.get("token")?.trim() || "";
    if (token.startsWith("fq1.")) {
      return token;
    }
  } catch {
    // Ignore non-URL input and keep trying.
  }

  return "";
}

export async function scanFriendQR(payload: ScanFriendQRInput) {
  const token = extractFriendQrToken(payload.token || "");
  return apiFetch<CreateFriendResponse>("/v1/friend-qr/scan", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export async function discoverUsers(query?: string) {
  const params = new URLSearchParams();
  if (query?.trim()) params.set("q", query.trim());
  const qs = params.toString();
  return apiFetch<DiscoverUser[]>(`/v1/users/discover${qs ? `?${qs}` : ""}`);
}

export async function deleteFriend(friendId: string) {
  return apiFetch<{ ok: boolean; id: string }>(`/v1/friends/${encodeURIComponent(friendId)}`, {
    method: "DELETE",
  });
}

export async function listThreadMembers(threadId: string) {
  return apiFetch<ThreadMember[]>(`/v1/chat/threads/${encodeURIComponent(threadId)}/members`);
}

export async function addThreadMember(threadId: string, payload: AddThreadMemberInput) {
  return apiFetch<ThreadMember>(`/v1/chat/threads/${encodeURIComponent(threadId)}/members`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function markThreadRead(threadId: string, payload: MarkThreadReadInput = {}) {
  return apiFetch<MarkThreadReadOutput>(`/v1/chat/threads/${encodeURIComponent(threadId)}/read`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function removeThreadMember(threadId: string, memberId: string) {
  return apiFetch<{ ok: boolean; id: string; threadId: string }>(
    `/v1/chat/threads/${encodeURIComponent(threadId)}/members/${encodeURIComponent(memberId)}`,
    {
      method: "DELETE",
    }
  );
}

export async function listAgents() {
  return apiFetch<Agent[]>("/v1/agents");
}

export async function createAgent(payload: CreateAgentInput) {
  return apiFetch<Agent>("/v1/agents", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function patchAgent(agentId: string, payload: PatchAgentInput) {
  return apiFetch<Agent>(`/v1/agents/${encodeURIComponent(agentId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteAgent(agentId: string) {
  return apiFetch<{ ok: boolean; id: string }>(`/v1/agents/${encodeURIComponent(agentId)}`, {
    method: "DELETE",
  });
}

export async function agentChat(agentId: string, payload: AgentChatInput) {
  return apiFetch<AgentChatOutput>(`/v1/agents/${encodeURIComponent(agentId)}/chat`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function toggleAgentSkill(agentId: string, skillId: string, install: boolean) {
  return apiFetch<Agent>(
    `/v1/agents/${encodeURIComponent(agentId)}/skills/${encodeURIComponent(skillId)}`,
    {
      method: "POST",
      body: JSON.stringify({ install }),
    }
  );
}

export async function listKnowledgeDatasets(): Promise<KnowledgeDataset[]> {
  const payload = await apiFetch<{ list?: V2KnowledgeDataset[] } | V2KnowledgeDataset[]>("/v2/knowledge");
  const rows = Array.isArray(payload)
    ? payload
    : payload && Array.isArray(payload.list)
      ? payload.list
      : [];
  return rows
    .map((row, index) => normalizeKnowledgeDataset(row, index))
    .filter((row): row is KnowledgeDataset => Boolean(row));
}

export async function createKnowledgeDataset(
  payload: CreateKnowledgeDatasetInput
): Promise<KnowledgeDataset> {
  const created = await apiFetch<V2KnowledgeDataset>("/v2/knowledge", {
    method: "POST",
    body: JSON.stringify({
      name: payload.name,
      entries: (payload.entries || []).map((entry) => ({
        type: entry.type || "file",
        name: entry.name,
        text: entry.text,
        s3_url: entry.fileUrl,
        content_type: entry.contentType,
        size: entry.size,
      })),
    }),
  });
  const normalized = normalizeKnowledgeDataset(created, 0);
  if (!normalized) {
    throw new Error("Create knowledge response missing id");
  }
  return normalized;
}

export async function updateKnowledgeDataset(
  datasetId: string,
  payload: UpdateKnowledgeDatasetInput
): Promise<KnowledgeDataset> {
  const updated = await apiFetch<V2KnowledgeDataset>(`/v2/knowledge/${encodeURIComponent(datasetId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      name: payload.name,
      add_entries: payload.addEntries
        ? payload.addEntries.map((entry) => ({
            type: entry.type || "file",
            name: entry.name,
            text: entry.text,
            s3_url: entry.fileUrl,
            content_type: entry.contentType,
            size: entry.size,
          }))
        : undefined,
      remove_entry_ids: payload.removeEntryIds,
    }),
  });
  const normalized = normalizeKnowledgeDataset(updated, 0);
  if (!normalized) {
    throw new Error("Update knowledge response missing id");
  }
  return normalized;
}

export async function deleteKnowledgeDataset(datasetId: string) {
  return apiFetch<{ ok?: boolean; id?: string }>(`/v2/knowledge/${encodeURIComponent(datasetId)}`, {
    method: "DELETE",
  });
}

export async function listNPCs(): Promise<NPC[]> {
  const payload = await apiFetch<{ list?: V2NPC[] } | V2NPC[]>("/v2/npc");
  const rows = Array.isArray(payload)
    ? payload
    : payload && Array.isArray(payload.list)
      ? payload.list
      : [];
  return rows
    .map((row, index) => normalizeNPC(row, index))
    .filter((row): row is NPC => Boolean(row));
}

export async function getNPC(npcId: string): Promise<NPC> {
  const payload = await apiFetch<V2NPC>(`/v2/npc/${encodeURIComponent(npcId)}`);
  const normalized = normalizeNPC(payload, 0);
  if (!normalized) {
    throw new Error("NPC payload missing id");
  }
  return normalized;
}

export async function createNPC(payload: CreateNPCInput): Promise<NPC> {
  const created = await apiFetch<V2NPC>("/v2/npc", {
    method: "POST",
    body: JSON.stringify({
      scope: payload.scope,
      name: payload.name,
      avatar_url: payload.avatar_url,
      intro: payload.intro,
      system_prompt: payload.system_prompt,
      model_name: payload.model_name,
    }),
  });
  const normalized = normalizeNPC(created, 0);
  if (!normalized) {
    throw new Error("Create NPC response missing id");
  }
  return normalized;
}

export async function updateNPC(npcId: string, payload: UpdateNPCInput): Promise<NPC> {
  const updated = await apiFetch<V2NPC>(`/v2/npc/${encodeURIComponent(npcId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      name: payload.name,
      avatar_url: payload.avatar_url,
      intro: payload.intro,
      system_prompt: payload.system_prompt,
      model_name: payload.model_name,
      status: payload.status,
    }),
  });
  const normalized = normalizeNPC(updated, 0);
  if (!normalized) {
    throw new Error("Update NPC response missing id");
  }
  return normalized;
}

export async function deleteNPC(npcId: string) {
  return apiFetch<{ ok?: boolean }>(`/v2/npc/${encodeURIComponent(npcId)}`, {
    method: "DELETE",
  });
}

export async function bindNPCSkill(npcId: string, skillId: string, skillScope: string = "system") {
  return apiFetch<{ ok?: boolean }>(
    `/v2/npc/${encodeURIComponent(npcId)}/skills/${encodeURIComponent(skillId)}`,
    {
      method: "POST",
      body: JSON.stringify({ skill_scope: skillScope }),
    }
  );
}

export async function unbindNPCSkill(npcId: string, bindingId: string) {
  return apiFetch<{ ok?: boolean }>(
    `/v2/npc/${encodeURIComponent(npcId)}/skills/${encodeURIComponent(bindingId)}`,
    {
      method: "DELETE",
    }
  );
}

export async function bindNPCKnowledge(npcId: string, datasetId: string) {
  return apiFetch<{ ok?: boolean }>(
    `/v2/npc/${encodeURIComponent(npcId)}/knowledge/${encodeURIComponent(datasetId)}`,
    {
      method: "POST",
    }
  );
}

export async function unbindNPCKnowledge(npcId: string, datasetId: string) {
  return apiFetch<{ ok?: boolean }>(
    `/v2/npc/${encodeURIComponent(npcId)}/knowledge/${encodeURIComponent(datasetId)}`,
    {
      method: "DELETE",
    }
  );
}

export async function listSkillCatalog() {
  const payload = await apiFetch<{ list?: V2SkillCatalogItem[] } | V2SkillCatalogItem[]>("/v2/skills/catalog");
  const rows = Array.isArray(payload)
    ? payload
    : payload && Array.isArray(payload.list)
      ? payload.list
      : [];
  return rows.map((item, index) => ({
    id: coerceString(item?.id) || `v2_skill_${index}`,
    name: coerceString(item?.name) || "Unnamed Skill",
    logo: coerceString(item?.icon) || "",
    description: coerceString(item?.description) || "",
    type: "builtin",
    source: "system" as const,
    installed: Boolean(item?.installed),
    editable: false,
    removable: true,
    permissionScope: "chat:read",
    version: "v2",
    tags: [coerceString(item?.category) || "system"],
  }));
}

export async function listCustomSkills() {
  const payload = await apiFetch<{ list?: V2UserSkill[] } | V2UserSkill[]>("/v2/skills");
  const rows = Array.isArray(payload)
    ? payload
    : payload && Array.isArray(payload.list)
      ? payload.list
      : [];
  return rows.map((item, index) => ({
    id: coerceString(item?.id) || `v2_custom_${index}`,
    name: coerceString(item?.name) || "Unnamed Skill",
    description: coerceString(item?.description) || "",
    markdown: coerceString(item?.skill_content) || coerceString(item?.content) || "",
    permissionScope: "chat:read",
    executor: "openai",
    version: String(coerceNumber(item?.version) || 1),
    enabled: typeof item?.enabled === "boolean" ? item.enabled : true,
    createdAt: normalizeDateTime(item?.created_at),
    updatedAt: normalizeDateTime(item?.updated_at),
  }));
}

export async function listInstalledSkillsV2(): Promise<SettingsSkillItem[]> {
  const payload = await apiFetch<{ list?: V2UserSkill[] } | V2UserSkill[]>("/v2/skills");
  const rows = Array.isArray(payload)
    ? payload
    : payload && Array.isArray(payload.list)
      ? payload.list
      : [];
  return rows.map((item, index) => {
    const scope = (coerceString(item?.scope) || "").toLowerCase();
    const source = scope === "system" ? "system" : "user";
    const version = String(coerceNumber(item?.version) || 1);
    return {
      id: coerceString(item?.id) || `v2_skill_${index}`,
      name: coerceString(item?.name) || "Unnamed Skill",
      description: coerceString(item?.description) || "",
      version,
      source,
      installed: typeof item?.installed === "boolean" ? Boolean(item.installed) : true,
      editable: source === "user",
      removable: source === "system",
      permissionScope: "chat:read",
      markdown: coerceString(item?.skill_content) || coerceString(item?.content) || "",
    };
  });
}

export async function createCustomSkill(payload: CreateCustomSkillInput) {
  const created = await apiFetch<V2UserSkill>("/v2/skills", {
    method: "POST",
    body: JSON.stringify({
      name: payload.name,
      description: payload.description || "",
      skill_content: payload.markdown,
    }),
  });
  return {
    id: coerceString(created?.id) || "",
    name: coerceString(created?.name) || payload.name,
    description: coerceString(created?.description) || payload.description || "",
    markdown: coerceString(created?.skill_content) || payload.markdown,
    permissionScope: payload.permissionScope || "chat:read",
    executor: payload.executor || "openai",
    version: String(coerceNumber(created?.version) || 1),
    enabled: typeof created?.enabled === "boolean" ? created.enabled : payload.enabled ?? true,
    createdAt: normalizeDateTime(created?.created_at),
    updatedAt: normalizeDateTime(created?.updated_at),
  };
}

export async function setV2SkillInstalled(skillId: string, install: boolean) {
  return apiFetch<{ ok?: boolean }>(`/v2/skills/${encodeURIComponent(skillId)}/install`, {
    method: "POST",
    body: JSON.stringify({ install }),
  });
}

export async function patchCustomSkill(
  skillId: string,
  payload: Partial<CreateCustomSkillInput> & { enabled?: boolean }
) {
  const updated = await apiFetch<V2UserSkill>(`/v2/skills/${encodeURIComponent(skillId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      name: payload.name,
      description: payload.description,
      skill_content: payload.markdown,
    }),
  });
  return {
    id: coerceString(updated?.id) || skillId,
    name: coerceString(updated?.name) || payload.name || "",
    description: coerceString(updated?.description) || payload.description || "",
    markdown: coerceString(updated?.skill_content) || payload.markdown || "",
    permissionScope: payload.permissionScope || "chat:read",
    executor: payload.executor || "openai",
    version: String(coerceNumber(updated?.version) || 1),
    enabled: typeof updated?.enabled === "boolean" ? updated.enabled : payload.enabled ?? true,
    createdAt: normalizeDateTime(updated?.created_at),
    updatedAt: normalizeDateTime(updated?.updated_at),
  };
}

export async function deleteCustomSkill(skillId: string) {
  await apiFetch<{ ok?: boolean }>(`/v2/skills/${encodeURIComponent(skillId)}`, {
    method: "DELETE",
  });
  return { ok: true, id: skillId };
}

export async function executeCustomSkill(skillId: string, payload: ExecuteCustomSkillInput) {
  return apiFetch<ExecuteCustomSkillOutput>(
    `/v1/skills/${encodeURIComponent(skillId)}/execute`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}

export async function listMiniApps() {
  const payload = await apiFetch<MiniApp[] | { list?: MiniApp[] }>("/v1/miniapps");
  if (Array.isArray(payload)) {
    return payload;
  }
  if (payload && Array.isArray(payload.list)) {
    return payload.list;
  }
  return [];
}

export async function listMiniAppTemplates() {
  return apiFetch<MiniAppTemplate[]>("/v1/miniapps/templates");
}

export async function generateMiniApp(payload: GenerateMiniAppInput) {
  return apiFetch<MiniApp>("/v1/miniapps/generate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function installMiniApp(appId: string, install = true) {
  return apiFetch<MiniApp>(`/v1/miniapps/${encodeURIComponent(appId)}/install`, {
    method: "POST",
    body: JSON.stringify({ install }),
  });
}

export async function installPresetMiniApp(presetKey: "news" | "price" | "words") {
  return apiFetch<MiniApp>(`/v1/miniapps/presets/${encodeURIComponent(presetKey)}/install`, {
    method: "POST",
  });
}

export async function runMiniApp(appId: string, payload: RunMiniAppInput) {
  return apiFetch<RunMiniAppOutput>(`/v1/miniapps/${encodeURIComponent(appId)}/run`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function deleteMiniApp(appId: string) {
  return apiFetch<{ ok: boolean; id: string }>(`/v1/miniapps/${encodeURIComponent(appId)}`, {
    method: "DELETE",
  });
}

export async function aiText(payload: {
  prompt: string;
  systemInstruction?: string;
  history?: Array<{ role: "user" | "model"; text: string }>;
  fallback?: string;
}) {
  return apiFetch<{ text: string }>("/v1/ai/text", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function aiJSON(payload: {
  prompt: string;
  systemInstruction?: string;
  history?: Array<{ role: "user" | "model"; text: string }>;
  fallback?: string;
}) {
  return apiFetch<{ jsonText: string }>("/v1/ai/json", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchAdminBackup() {
  return apiFetch<BootstrapPayload>("/v1/admin/backup");
}

export async function restoreAdminBackup(payload: BootstrapPayload) {
  return apiFetch<{ ok: boolean }>("/v1/admin/restore", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchMetricsText() {
  return apiFetch<string>("/metrics", undefined, { rawText: true });
}

export function subscribeRealtime(
  onEvent: (event: RealtimeEvent) => void,
  threadId?: string
): () => void {
  const params = new URLSearchParams();
  if (threadId) {
    params.set("threadId", threadId);
  }
  if (authToken) {
    params.set("token", authToken);
  }

  const query = params.toString() ? `?${params.toString()}` : "";
  const url = `${getRealtimeBaseUrl()}/v1/realtime/ws${query}`;
  const reconnectDelaysMs = [500, 1000, 2000, 5000] as const;

  let stopped = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let socket: WebSocket | null = null;
  let reconnectAttempt = 0;

  const clearReconnectTimer = () => {
    if (!reconnectTimer) return;
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  };

  const cleanupSocket = (target: WebSocket | null) => {
    if (!target) return;
    target.onopen = null;
    target.onmessage = null;
    target.onerror = null;
    target.onclose = null;
  };

  const scheduleReconnect = () => {
    if (stopped || reconnectTimer) return;
    const delay = reconnectDelaysMs[Math.min(reconnectAttempt, reconnectDelaysMs.length - 1)];
    reconnectAttempt += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  };

  const connect = () => {
    if (stopped) return;

    const nextSocket = new WebSocket(url);
    socket = nextSocket;

    nextSocket.onopen = () => {
      reconnectAttempt = 0;
      clearReconnectTimer();
    };

    nextSocket.onmessage = (event) => {
      if (!event?.data) return;
      try {
        const parsed = JSON.parse(String(event.data)) as RealtimeEvent;
        onEvent(parsed);
      } catch {
        // Ignore malformed event payloads.
      }
    };

    nextSocket.onerror = () => {
      if (nextSocket.readyState === WebSocket.OPEN || nextSocket.readyState === WebSocket.CONNECTING) {
        nextSocket.close();
      }
    };

    nextSocket.onclose = () => {
      if (socket === nextSocket) {
        socket = null;
      }
      cleanupSocket(nextSocket);
      scheduleReconnect();
    };
  };

  connect();

  return () => {
    stopped = true;
    clearReconnectTimer();
    const active = socket;
    socket = null;
    cleanupSocket(active);
    active?.close();
  };
}
