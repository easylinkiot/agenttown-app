import { Platform } from "react-native";
import type { EventSourceEvent } from "react-native-sse";

import { getAuthToken } from "@/src/lib/api";
import { SSEClient } from "@/src/lib/sse-client";

const DEFAULT_API_BASE_URL = "https://agenttown-api.kittens.cloud";
const ASK_ANYTHING_STREAM_CANDIDATE_ID = "__assist_ask_anything_stream__";
const ASSIST_DEBUG_PREFIX = "[chatAssist]";
const AGENTTOWN_FALLBACK_PREFIX = "[agenttown-fallback]";
const ASSIST_ACTION_TO_SKILL_ID: Record<Exclude<ChatAssistAction, "ask_anything">, string> = {
  auto_reply: "professional-reply",
  add_task: "action-needs",
  translate: "translate",
  follow_up: "generate-idea",
};

export type ChatAssistAction = "auto_reply" | "add_task" | "ask_anything" | "translate" | "follow_up";

export interface ChatAssistRequest {
  action: ChatAssistAction;
  input?: string;
  question?: string;
  target_type?: string;
  target_id?: string;
  target_language?: "zh" | "en" | "de";
  selected_message_id?: string;
  selected_message_content?: string;
  session_id?: string;
}

export interface ChatCompletionsRequest {
  stream?: boolean;
  input?: string;
  prompt?: string;
  session_id?: string;
  target_type?: string;
  target_id?: string;
  bot_owner_user_id?: string;
  skill_ids?: string[];
}

export interface AssistCandidate {
  id?: string;
  kind: "reply" | "task" | "text" | "translate" | "follow_up";
  text: string;
  title?: string;
  description?: string;
  priority?: string;
  targetLanguage?: "zh" | "en" | "de";
}

interface ChatAssistPayloadEnvelope {
  assist_candidates?: {
    reply_candidates?: unknown;
    task_candidates?: unknown;
    translate_candidates?: unknown;
    follow_up_candidates?: unknown;
    followup_candidates?: unknown;
  };
  reply_candidates?: unknown;
  task_candidates?: unknown;
  reply_candidate?: unknown;
  task_candidate?: unknown;
  translate_candidates?: unknown;
  follow_up_candidates?: unknown;
  followup_candidates?: unknown;
  translate_candidate?: unknown;
  follow_up_candidate?: unknown;
  followup_candidate?: unknown;
  delta?: {
    text?: unknown;
  };
  text?: unknown;
  message?: unknown;
  payload?: unknown;
  data?: unknown;
  result?: unknown;
  body?: unknown;
}

interface RunChatAssistHandlers {
  onCandidates?: (candidates: AssistCandidate[]) => void;
  onEvent?: (eventName: string, payload: unknown) => void;
  onDone?: () => void;
  onError?: (error: Error) => void;
}

interface RunChatCompletionsHandlers {
  onText?: (text: string) => void;
  onEvent?: (eventName: string, payload: unknown) => void;
  onDone?: () => void;
  onError?: (error: Error) => void;
}

type ChatAssistSSEEventName =
  | "message"
  | "assist_candidates"
  | "message_delta"
  | "trace"
  | "message_start"
  | "message_end"
  | "done"
  | "ping"
  | "error"
  | "response.output_text.delta"
  | "response.output_text.done"
  | "response.completed"
  | "response.error"
  | "delta"
  | "output_text.delta"
  | "output_text.done";

const CHAT_ASSIST_CUSTOM_EVENTS: ChatAssistSSEEventName[] = [
  "assist_candidates",
  "message_delta",
  "trace",
  "message_start",
  "message_end",
  "done",
  "ping",
  "error",
  "response.output_text.delta",
  "response.output_text.done",
  "response.completed",
  "response.error",
  "delta",
  "output_text.delta",
  "output_text.done",
];

export function getApiBaseUrl() {
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

function toText(value: unknown) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed;
}

function toRawText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function isDebugEnabled() {
  return typeof __DEV__ !== "undefined" && __DEV__;
}

function debugLog(stage: string, payload?: unknown) {
  if (!isDebugEnabled()) return;
  if (payload === undefined) {
    console.log(`${ASSIST_DEBUG_PREFIX} ${stage}`);
    return;
  }
  console.log(`${ASSIST_DEBUG_PREFIX} ${stage}`, payload);
}

function parseEventData(data: string | null | undefined) {
  if (typeof data !== "string") return null;
  const text = data.trim();
  if (!text || text === "[DONE]") return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function normalizeReplyCandidate(candidate: unknown, index: number): AssistCandidate | null {
  if (!candidate || typeof candidate !== "object") return null;
  const row = candidate as { id?: unknown; text?: unknown };
  const text = toText(row.text);
  if (!text) return null;
  const id = toText(row.id) || `reply_${index}`;
  return {
    id,
    kind: "reply",
    text,
  };
}

function normalizeTaskCandidate(candidate: unknown, index: number): AssistCandidate | null {
  if (!candidate || typeof candidate !== "object") return null;
  const row = candidate as {
    id?: unknown;
    title?: unknown;
    description?: unknown;
    priority?: unknown;
  };
  const title = toText(row.title);
  const description = toText(row.description);
  const priority = toText(row.priority);
  const combined = [title, description].filter(Boolean).join("\n");
  if (!combined) return null;
  const id = toText(row.id) || `task_${index}`;
  return {
    id,
    kind: "task",
    text: combined,
    title: title || undefined,
    description: description || undefined,
    priority: priority || undefined,
  };
}

function normalizeCandidateTargetLanguage(value: unknown) {
  switch (toText(value).toLowerCase()) {
    case "zh":
      return "zh" as const;
    case "de":
      return "de" as const;
    case "en":
      return "en" as const;
    default:
      return undefined;
  }
}

function normalizeTranslateCandidate(candidate: unknown, index: number): AssistCandidate | null {
  if (typeof candidate === "string") {
    const text = toText(candidate);
    if (!text) return null;
    return {
      id: `translate_${index}`,
      kind: "translate",
      text,
    };
  }
  if (!candidate || typeof candidate !== "object") return null;
  const row = candidate as {
    id?: unknown;
    text?: unknown;
    translation?: unknown;
    translated_text?: unknown;
    content?: unknown;
    output?: unknown;
    target_language?: unknown;
    targetLanguage?: unknown;
    language?: unknown;
  };
  const text =
    toText(row.text) ||
    toText(row.translation) ||
    toText(row.translated_text) ||
    toText(row.content) ||
    toText(row.output);
  if (!text) return null;
  const id = toText(row.id) || `translate_${index}`;
  const targetLanguage = normalizeCandidateTargetLanguage(
    row.target_language ?? row.targetLanguage ?? row.language
  );
  return {
    id,
    kind: "translate",
    text,
    targetLanguage,
  };
}

function normalizeFollowUpCandidate(candidate: unknown, index: number): AssistCandidate | null {
  if (typeof candidate === "string") {
    const text = toText(candidate);
    if (!text) return null;
    return {
      id: `follow_up_${index}`,
      kind: "follow_up",
      text,
    };
  }
  if (!candidate || typeof candidate !== "object") return null;
  const row = candidate as {
    id?: unknown;
    title?: unknown;
    text?: unknown;
    content?: unknown;
    description?: unknown;
    owner?: unknown;
    assignee?: unknown;
    status?: unknown;
    priority?: unknown;
  };
  const title = toText(row.title);
  const body = toText(row.content) || toText(row.text) || toText(row.description);
  const owner = toText(row.owner) || toText(row.assignee);
  const status = toText(row.status);
  const priority = toText(row.priority);
  const composed = [title, body].filter(Boolean).join("\n");
  if (!composed) return null;
  const id = toText(row.id) || `follow_up_${index}`;
  const meta = [owner, status].filter(Boolean).join(" · ");
  return {
    id,
    kind: "follow_up",
    text: composed,
    title: title || undefined,
    description: meta || undefined,
    priority: priority || undefined,
  };
}

function extractCandidateArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== "object") return [];
  const row = raw as {
    items?: unknown;
    list?: unknown;
    candidates?: unknown;
  };
  if (Array.isArray(row.items)) return row.items;
  if (Array.isArray(row.list)) return row.list;
  if (Array.isArray(row.candidates)) return row.candidates;
  return [];
}

function hasCandidateArray(raw: unknown) {
  if (Array.isArray(raw)) return true;
  if (!raw || typeof raw !== "object") return false;
  const row = raw as {
    items?: unknown;
    list?: unknown;
    candidates?: unknown;
  };
  return Array.isArray(row.items) || Array.isArray(row.list) || Array.isArray(row.candidates);
}

function normalizeCandidatesFromArray(raw: unknown, kind: "reply" | "task") {
  const list = extractCandidateArray(raw);
  if (list.length === 0) return [] as AssistCandidate[];
  if (kind === "reply") {
    return list
      .map((item, index) => normalizeReplyCandidate(item, index))
      .filter((item): item is AssistCandidate => Boolean(item));
  }
  return list
    .map((item, index) => normalizeTaskCandidate(item, index))
    .filter((item): item is AssistCandidate => Boolean(item));
}

function extractPayloadEnvelope(payload: unknown) {
  if (!payload || typeof payload !== "object") return {} as ChatAssistPayloadEnvelope;
  let cursor: unknown = payload;
  for (let depth = 0; depth < 5; depth += 1) {
    if (!cursor || typeof cursor !== "object") return {} as ChatAssistPayloadEnvelope;
    const row = cursor as ChatAssistPayloadEnvelope;
    const hasKnownAssistFields =
      row.assist_candidates !== undefined ||
      row.reply_candidates !== undefined ||
      row.task_candidates !== undefined ||
      row.translate_candidates !== undefined ||
      row.follow_up_candidates !== undefined ||
      row.reply_candidate !== undefined ||
      row.task_candidate !== undefined ||
      row.translate_candidate !== undefined ||
      row.follow_up_candidate !== undefined ||
      row.delta !== undefined ||
      row.text !== undefined;
    if (hasKnownAssistFields) {
      return row;
    }
    const nested = row.payload ?? row.data ?? row.result ?? row.body;
    if (!nested || typeof nested !== "object") {
      return row;
    }
    cursor = nested;
  }
  return cursor as ChatAssistPayloadEnvelope;
}

function extractTextDelta(eventName: string, payload: unknown) {
  if (typeof payload === "string") {
    if (eventName === "message" || eventName.includes("delta")) return payload;
    return "";
  }
  const envelope = extractPayloadEnvelope(payload);
  const deltaText = toRawText(envelope.delta?.text);
  if (deltaText !== "") return deltaText;
  const deltaRaw = toRawText((envelope as { delta?: unknown }).delta);
  if (deltaRaw !== "") return deltaRaw;
  if (eventName === "message" || eventName === "delta" || eventName.includes("delta")) {
    const text = toRawText(envelope.text);
    if (text !== "") return text;
    const messageText = toRawText(envelope.message);
    if (messageText !== "") return messageText;
    const outputText = toRawText((envelope as { output_text?: unknown }).output_text);
    if (outputText !== "") return outputText;
  }
  return "";
}

function sanitizeAskAnythingText(input: string) {
  const text = input.trim();
  if (!text.startsWith(AGENTTOWN_FALLBACK_PREFIX)) return input;

  const questionMatch = text.match(/UserQuestion:\s*([^\n]+)/i);
  const question = (questionMatch?.[1] || "").trim();
  const useZh = /[\u3400-\u9FFF]/.test(`${text}${question}`);
  const suffix = question
    ? useZh
      ? `（问题：${question}）`
      : ` (Question: ${question})`
    : "";
  return useZh
    ? `当前后端未返回真实模型答案，正在使用回退输出。请检查 agenttown-api 的模型配置${suffix}`
    : `The backend did not return a real model answer. Showing fallback output. Please check the agenttown-api model configuration${suffix}`;
}

function toEventError(payload: unknown, fallback = "Assist stream error") {
  if (payload && typeof payload === "object") {
    const row = payload as { message?: unknown; error?: { message?: unknown } };
    const message = toText(row.message) || toText(row.error?.message);
    if (message) return new Error(message);
  }
  if (typeof payload === "string" && payload.trim()) return new Error(payload.trim());
  return new Error(fallback);
}

export function mergeAssistCandidates(previous: AssistCandidate[], incoming: AssistCandidate[]) {
  if (incoming.length === 0) return previous;
  const next = [...previous];

  for (const candidate of incoming) {
    const id = toText(candidate.id);
    if (!id) {
      next.push(candidate);
      continue;
    }
    const foundIndex = next.findIndex((item) => toText(item.id) === id);
    if (foundIndex < 0) {
      next.push(candidate);
      continue;
    }
    next[foundIndex] = {
      ...next[foundIndex],
      ...candidate,
      id,
      text: candidate.text || next[foundIndex].text,
    };
  }
  return next;
}

export function reduceAssistCandidatesFromEvent(
  eventName: string,
  payload: unknown,
  previous: AssistCandidate[]
): AssistCandidate[] {
  const envelope = extractPayloadEnvelope(payload);
  const candidatesNode = envelope.assist_candidates;

  const replyListRaw =
    candidatesNode?.reply_candidates ??
    (candidatesNode as { replyCandidates?: unknown } | undefined)?.replyCandidates ??
    envelope.reply_candidates ??
    (envelope as { replyCandidates?: unknown }).replyCandidates;
  const taskListRaw =
    candidatesNode?.task_candidates ??
    (candidatesNode as { taskCandidates?: unknown } | undefined)?.taskCandidates ??
    envelope.task_candidates ??
    (envelope as { taskCandidates?: unknown }).taskCandidates;
  const translateListRaw =
    candidatesNode?.translate_candidates ??
    (candidatesNode as { translateCandidates?: unknown } | undefined)?.translateCandidates ??
    (candidatesNode as { translations?: unknown } | undefined)?.translations ??
    envelope.translate_candidates ??
    (envelope as { translateCandidates?: unknown }).translateCandidates ??
    (envelope as { translations?: unknown }).translations;
  const followUpListRaw =
    candidatesNode?.follow_up_candidates ??
    candidatesNode?.followup_candidates ??
    (candidatesNode as { followUpCandidates?: unknown } | undefined)?.followUpCandidates ??
    envelope.follow_up_candidates ??
    envelope.followup_candidates ??
    (envelope as { followUpCandidates?: unknown }).followUpCandidates;
  const replyList = normalizeCandidatesFromArray(replyListRaw, "reply");
  const taskList = normalizeCandidatesFromArray(taskListRaw, "task");
  const translateList = extractCandidateArray(translateListRaw)
    .map((item, index) => normalizeTranslateCandidate(item, index))
    .filter((item): item is AssistCandidate => Boolean(item));
  const followUpList = extractCandidateArray(followUpListRaw)
    .map((item, index) => normalizeFollowUpCandidate(item, index))
    .filter((item): item is AssistCandidate => Boolean(item));
  const hasReplyList = hasCandidateArray(replyListRaw);
  const hasTaskList = hasCandidateArray(taskListRaw);
  const hasTranslateList = hasCandidateArray(translateListRaw);
  const hasFollowUpList = hasCandidateArray(followUpListRaw);

  if (hasReplyList || hasTaskList || hasTranslateList || hasFollowUpList) {
    return [...replyList, ...taskList, ...translateList, ...followUpList];
  }

  const singleReply = normalizeReplyCandidate(
    envelope.reply_candidate ?? (envelope as { replyCandidate?: unknown }).replyCandidate,
    previous.length
  );
  if (singleReply) {
    return mergeAssistCandidates(previous, [singleReply]);
  }

  const singleTask = normalizeTaskCandidate(
    envelope.task_candidate ?? (envelope as { taskCandidate?: unknown }).taskCandidate,
    previous.length
  );
  if (singleTask) {
    return mergeAssistCandidates(previous, [singleTask]);
  }

  const singleTranslate = normalizeTranslateCandidate(
    envelope.translate_candidate ??
      (envelope as { translateCandidate?: unknown }).translateCandidate ??
      (envelope as { translation?: unknown }).translation,
    previous.length
  );
  if (singleTranslate) {
    return mergeAssistCandidates(previous, [singleTranslate]);
  }

  const singleFollowUp = normalizeFollowUpCandidate(
    envelope.follow_up_candidate ??
      envelope.followup_candidate ??
      (envelope as { followUpCandidate?: unknown }).followUpCandidate,
    previous.length
  );
  if (singleFollowUp) {
    return mergeAssistCandidates(previous, [singleFollowUp]);
  }

  const hasDeltaText = typeof envelope.delta?.text === "string";
  const isIgnoredNonTextEvent =
    eventName === "trace" ||
    eventName === "ping" ||
    eventName === "done" ||
    eventName === "error" ||
    eventName === "response.error" ||
    eventName === "message_start" ||
    eventName === "message_end" ||
    eventName.startsWith("tool_");
  const looksLikeDeltaEvent =
    eventName === "message_delta" ||
    eventName === "response.output_text.delta" ||
    eventName === "output_text.delta" ||
    eventName === "delta" ||
    eventName.includes(".delta") ||
    eventName.endsWith("_delta");
  const isTextStreamEvent =
    !isIgnoredNonTextEvent &&
    (looksLikeDeltaEvent || eventName === "message" || hasDeltaText);
  if (
    isTextStreamEvent
  ) {
    const deltaText = extractTextDelta(eventName, payload);
    if (!deltaText) return previous;
    const safeText = sanitizeAskAnythingText(deltaText);
    const found = previous.find((item) => item.id === ASK_ANYTHING_STREAM_CANDIDATE_ID);
    if (!found) {
      const streamCandidate: AssistCandidate = {
        id: ASK_ANYTHING_STREAM_CANDIDATE_ID,
        kind: "text",
        text: safeText,
      };
      return [
        ...previous,
        streamCandidate,
      ];
    }
    return mergeAssistCandidates(previous, [
      {
        ...found,
        text: `${found.text}${safeText}`,
      },
    ]);
  }

  return previous;
}

function toCandidateId(value: unknown, fallback: string) {
  const id = toText(value);
  return id || fallback;
}

function normalizeV2AssistResponseCandidates(action: ChatAssistAction, payload: unknown) {
  if (!payload || typeof payload !== "object") return [] as AssistCandidate[];
  const row = payload as {
    candidates?: unknown;
    tasks?: unknown;
    ideas?: unknown;
    summaries?: unknown;
  };
  const rawCandidates = row.candidates;
  const listFromCandidates = extractCandidateArray(rawCandidates);

  if (action === "add_task") {
    const taskSource = extractCandidateArray(row.tasks).length > 0 ? row.tasks : rawCandidates;
    return extractCandidateArray(taskSource)
      .map((item, index) => normalizeTaskCandidate(item, index))
      .filter((item): item is AssistCandidate => Boolean(item));
  }

  if (action === "translate") {
    return extractCandidateArray(rawCandidates)
      .map((item, index) => normalizeTranslateCandidate(item, index))
      .filter((item): item is AssistCandidate => Boolean(item));
  }

  if (action === "follow_up") {
    const ideaList = extractCandidateArray(row.ideas);
    if (ideaList.length > 0) {
      const out: AssistCandidate[] = [];
      for (let index = 0; index < ideaList.length; index += 1) {
        const item = ideaList[index];
        if (!item || typeof item !== "object") continue;
        const idea = item as { id?: unknown; title?: unknown; description?: unknown };
        const title = toText(idea.title);
        const description = toText(idea.description);
        const text = [title, description].filter(Boolean).join("\n");
        if (!text) continue;
        out.push({
          id: toCandidateId(idea.id, `follow_up_${index}`),
          kind: "follow_up",
          text,
          title: title || undefined,
          description: description || undefined,
        });
      }
      return out;
    }
    const summaries = extractCandidateArray(row.summaries);
    if (summaries.length > 0) {
      const out: AssistCandidate[] = [];
      for (let index = 0; index < summaries.length; index += 1) {
        const item = summaries[index];
        if (!item || typeof item !== "object") continue;
        const summary = item as { id?: unknown; title?: unknown; summary?: unknown };
        const title = toText(summary.title);
        const content = toText(summary.summary);
        const text = [title, content].filter(Boolean).join("\n");
        if (!text) continue;
        out.push({
          id: toCandidateId(summary.id, `follow_up_${index}`),
          kind: "follow_up",
          text,
          title: title || undefined,
        });
      }
      return out;
    }
    return extractCandidateArray(rawCandidates)
      .map((item, index) => normalizeFollowUpCandidate(item, index))
      .filter((item): item is AssistCandidate => Boolean(item));
  }

  if (listFromCandidates.length > 0) {
    return listFromCandidates
      .map((item, index) => normalizeReplyCandidate(item, index))
      .filter((item): item is AssistCandidate => Boolean(item));
  }
  return [];
}

function buildV2AssistMessages(request: ChatAssistRequest) {
  const primary = toText(request.question) || toText(request.input);
  const selected = toText(request.selected_message_content);
  const combined = [selected, primary].filter(Boolean).join("\n\n");
  if (!combined) return [] as Array<{ role: "user"; content: string }>;
  return [{ role: "user" as const, content: combined }];
}

export async function runChatAssist(
  request: ChatAssistRequest,
  handlers: RunChatAssistHandlers = {},
  abortSignal?: AbortSignal
) {
  if (abortSignal?.aborted) return;
  if (request.action === "ask_anything") {
    let fullText = "";
    await runChatCompletions(
      {
        prompt: request.question || request.input || "",
        session_id: request.session_id,
      },
      {
        onEvent: handlers.onEvent,
        onError: handlers.onError,
        onText: (text) => {
          fullText = text;
          handlers.onCandidates?.([
            {
              id: ASK_ANYTHING_STREAM_CANDIDATE_ID,
              kind: "text",
              text: sanitizeAskAnythingText(text),
            },
          ]);
        },
        onDone: handlers.onDone,
      },
      abortSignal
    );
    if (!fullText.trim()) {
      handlers.onCandidates?.([]);
    }
    return;
  }

  const skillID = ASSIST_ACTION_TO_SKILL_ID[request.action];
  const token = getAuthToken();
  const url = `${getApiBaseUrl()}/v2/chat/assist`;
  const response = await fetch(url, {
    method: "POST",
    signal: abortSignal,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      skill_id: skillID,
      thread_id: request.session_id || undefined,
      messages: buildV2AssistMessages(request),
      target_language: request.target_language || undefined,
      user_hint: request.input || request.question || undefined,
    }),
  });
  const text = await response.text();
  let body: unknown = {};
  if (text.trim()) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = { message: text };
    }
  }
  if (!response.ok) {
    const row = body as { message?: unknown; error?: { message?: unknown } };
    const message = toText(row?.error?.message) || toText(row?.message) || "Assist request failed";
    const error = new Error(message);
    handlers.onError?.(error);
    throw error;
  }

  const payload = (body as { candidates?: unknown })?.candidates;
  const candidates = normalizeV2AssistResponseCandidates(request.action, payload);
  handlers.onEvent?.("assist_candidates", body);
  handlers.onCandidates?.(candidates);
  debugLog("done:aggregated-candidates", {
    action: request.action,
    count: candidates.length,
    candidates,
  });
  handlers.onDone?.();
}

export async function runChatCompletions(
  request: ChatCompletionsRequest,
  handlers: RunChatCompletionsHandlers = {},
  abortSignal?: AbortSignal
) {
  if (abortSignal?.aborted) return;

  const url = `${getApiBaseUrl()}/v1/chat/completions`;
  const token = getAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const payload = {
    ...request,
    stream: true,
  };

  let streamText = "";

  await new Promise<void>((resolve, reject) => {
    let finished = false;

    const finish = (error?: Error) => {
      if (finished) return;
      finished = true;
      abortSignal?.removeEventListener("abort", handleAbort);
      client.stop();
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };

    const handleAbort = () => {
      finish();
    };

    const handleEvent = (eventName: string, event: EventSourceEvent<string, string>) => {
      const data = parseEventData(event.data);
      handlers.onEvent?.(eventName, data);

      if (eventName === "done") {
        handlers.onDone?.();
        finish();
        return;
      }
      if (eventName === "error" || eventName === "response.error") {
        const err = toEventError(data, "Chat completions stream error");
        handlers.onError?.(err);
        finish(err);
        return;
      }

      const delta = extractTextDelta(eventName, data);
      if (!delta) return;
      streamText = `${streamText}${delta}`;
      handlers.onText?.(streamText);
    };

    const client = new SSEClient<ChatAssistSSEEventName>({
      url,
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      reconnect: {
        enabled: false,
        initialDelayMs: 0,
        maxDelayMs: 0,
        multiplier: 1,
        jitterRatio: 0,
        maxAttempts: 0,
      },
      pauseWhenBackground: false,
      customEvents: CHAT_ASSIST_CUSTOM_EVENTS,
      onMessage: (event) => {
        handleEvent("message", event as EventSourceEvent<string, string>);
      },
      onCustomEvent: (eventName, event) => {
        handleEvent(eventName, event as EventSourceEvent<string, string>);
      },
      onError: (error) => {
        if (abortSignal?.aborted) {
          finish();
          return;
        }
        const err = new Error(error.message || "Completions stream disconnected");
        handlers.onError?.(err);
        finish(err);
      },
      onClose: () => {
        if (finished) return;
        if (abortSignal?.aborted) {
          finish();
          return;
        }
        handlers.onDone?.();
        finish();
      },
    });

    if (abortSignal) {
      abortSignal.addEventListener("abort", handleAbort, { once: true });
    }

    client.start();
  });
}
