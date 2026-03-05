import {
  Agent,
  AppBootstrapState,
  AuthUser,
  BotConfig,
  ChatThread,
  ConversationMessage,
  Friend,
  FriendRequest,
  MiniApp,
  MiniAppTemplate,
  RealtimeEvent,
  TaskItem,
  ThreadDisplayLanguage,
  ThreadMember,
  ThreadMemberType,
} from "@/src/types";
import { Platform } from "react-native";

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
}

export interface SendThreadMessageOutput {
  userMessage: ConversationMessage;
  aiMessage?: ConversationMessage;
  messages: ConversationMessage[];
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
};

type V2UserSkill = {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  skill_content?: unknown;
  content?: unknown;
  enabled?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
  version?: unknown;
};

export interface RoleRepliesInput {
  prompt: string;
  memberIds?: string[];
  appendUserMessage?: boolean;
}

export interface RoleRepliesOutput {
  threadId: string;
  userMessage?: ConversationMessage;
  replies: ConversationMessage[];
}

const DEFAULT_API_BASE_URL = "https://agenttown-api.kittens.cloud";

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

function coerceNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeDateTime(value: unknown) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";
    const asDate = Date.parse(trimmed);
    return Number.isFinite(asDate) ? new Date(asDate).toISOString() : trimmed;
  }
  const unix = coerceNumber(value);
  if (typeof unix !== "number") return "";
  const millis = unix > 1_000_000_000_000 ? unix : unix * 1000;
  const asDate = new Date(millis);
  return Number.isFinite(asDate.getTime()) ? asDate.toISOString() : "";
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
  const raw = process.env.EXPO_PUBLIC_API_BASE_URL || DEFAULT_API_BASE_URL;
  const trimmed = raw.replace(/\/+$/, "");
  const normalized =
    Platform.OS !== "android"
      ? trimmed
      : trimmed
    .replace(/^http:\/\/localhost(?=[:/]|$)/i, "http://10.0.2.2")
    .replace(/^http:\/\/127\.0\.0\.1(?=[:/]|$)/i, "http://10.0.2.2");
  const isReleaseBuild = typeof __DEV__ === "undefined" ? true : !__DEV__;
  if (isReleaseBuild && /^http:\/\/(?:localhost|127\.0\.0\.1|10\.0\.2\.2)(?=[:/]|$)/i.test(normalized)) {
    return DEFAULT_API_BASE_URL;
  }
  return normalized;
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
}) {
  return apiFetch<AuthSessionPayload>("/v1/auth/provider", {
    method: "POST",
    body: JSON.stringify(payload),
  }, { skipAuth: true });
}

export async function authMe() {
  return apiFetch<AuthUser>("/v1/auth/me");
}

export async function authUpdateProfile(payload: { displayName: string; email: string }) {
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
  const requestPayload: Record<string, unknown> = { ...payload };
  delete requestPayload.groupNpcName;
  delete requestPayload.groupCommanderUserId;
  return apiFetch<ChatThread>("/v1/chat/threads", {
    method: "POST",
    body: JSON.stringify(requestPayload),
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
  const createdAt = row.created_at || row.updated_at || "";
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
    time: createdAt,
  };
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
  return apiFetch<SendThreadMessageOutput>(
    `/v1/chat/threads/${encodeURIComponent(threadId)}/messages`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
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
  return apiFetch<{ ok: boolean; request: FriendRequest }>(
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

export async function createFriendQR() {
  return apiFetch<CreateFriendQRResponse>("/v1/friend-qr/create", {
    method: "POST",
  });
}

export async function scanFriendQR(payload: ScanFriendQRInput) {
  return apiFetch<CreateFriendResponse>("/v1/friend-qr/scan", {
    method: "POST",
    body: JSON.stringify(payload),
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
  const socket = new WebSocket(`${getRealtimeBaseUrl()}/v1/realtime/ws${query}`);

  socket.onmessage = (event) => {
    if (!event?.data) return;
    try {
      const parsed = JSON.parse(String(event.data)) as RealtimeEvent;
      onEvent(parsed);
    } catch {
      // Ignore malformed event payloads.
    }
  };

  return () => {
    socket.onmessage = null;
    socket.close();
  };
}
