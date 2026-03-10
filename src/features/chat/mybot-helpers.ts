import type { CreateTaskInput } from "@/src/lib/api";
import { normalizeTaskPriority } from "@/src/features/chat/ask-ai-helpers";
import type { TaskItem } from "@/src/types";

export interface MyBotTaskDraft {
  title: string;
  assignee: string;
  priority: TaskItem["priority"];
  dueAt?: string;
  reason?: string;
}

export interface MyBotReminderBuckets {
  overdue: TaskItem[];
  upcoming: TaskItem[];
  unscheduled: TaskItem[];
}

function toText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeDueAt(value: unknown) {
  const raw = toText(value);
  if (!raw) return undefined;
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : undefined;
}

export function parseMyBotTaskDrafts(jsonText: string, fallbackAssignee: string): MyBotTaskDraft[] {
  const trimmed = (jsonText || "").trim();
  if (!trimmed) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return [];
  }

  const rows = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { tasks?: unknown[] }).tasks)
      ? (parsed as { tasks: unknown[] }).tasks
      : [];

  const seen = new Set<string>();
  const drafts: MyBotTaskDraft[] = [];

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const item = row as Record<string, unknown>;
    const title = toText(item.title).slice(0, 160);
    if (!title) continue;

    const draft: MyBotTaskDraft = {
      title,
      assignee: toText(item.assignee) || fallbackAssignee,
      priority: normalizeTaskPriority(toText(item.priority)),
      dueAt: normalizeDueAt(item.dueAt),
      reason: toText(item.reason) || undefined,
    };

    const dedupeKey = `${draft.title.toLowerCase()}::${draft.dueAt || ""}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    drafts.push(draft);
  }

  return drafts.slice(0, 8);
}

export function buildMyBotTaskPayload(
  draft: MyBotTaskDraft,
  options: {
    targetType?: string;
    targetId?: string;
    sourceThreadId?: string;
    owner: string;
  }
): CreateTaskInput {
  const targetType = (options.targetType || "").trim() || "self";
  const targetId = (options.targetId || "").trim() || "root";

  return {
    title: draft.title,
    description: draft.reason || undefined,
    target_type: targetType,
    target_id: targetId,
    targetType,
    targetId,
    assignee: draft.assignee,
    priority: draft.priority,
    status: "Pending",
    dueAt: draft.dueAt,
    owner: options.owner,
    sourceThreadId: options.sourceThreadId,
  };
}

function compareTaskDueAt(a: TaskItem, b: TaskItem) {
  const aTime = a.dueAt ? new Date(a.dueAt).getTime() : Number.POSITIVE_INFINITY;
  const bTime = b.dueAt ? new Date(b.dueAt).getTime() : Number.POSITIVE_INFINITY;
  return aTime - bTime;
}

export function bucketMyBotReminderTasks(tasks: TaskItem[], threadId: string, nowMs = Date.now()): MyBotReminderBuckets {
  const result: MyBotReminderBuckets = {
    overdue: [],
    upcoming: [],
    unscheduled: [],
  };

  const targetThreadId = (threadId || "").trim();
  if (!targetThreadId) return result;

  for (const task of tasks) {
    if ((task.sourceThreadId || "").trim() !== targetThreadId) continue;
    if ((task.status || "").trim() === "Done") continue;
    const dueAt = toText(task.dueAt);
    if (!dueAt) {
      result.unscheduled.push(task);
      continue;
    }
    const parsed = new Date(dueAt).getTime();
    if (!Number.isFinite(parsed)) {
      result.unscheduled.push(task);
      continue;
    }
    if (parsed <= nowMs) {
      result.overdue.push(task);
    } else {
      result.upcoming.push(task);
    }
  }

  result.overdue.sort(compareTaskDueAt);
  result.upcoming.sort(compareTaskDueAt);
  result.unscheduled.sort((a, b) => a.title.localeCompare(b.title));
  return result;
}
