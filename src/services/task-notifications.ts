import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import type { AppLanguage, TaskItem } from "@/src/types";

const CHANNEL_ID = "task-reminders";
const REMINDER_KIND = "task-reminder";
const REMINDER_DATA_KEY = "kind";
const REMINDER_TASK_ID_KEY = "taskId";
const REMINDER_DUE_AT_KEY = "dueAt";

let handlerConfigured = false;

function isMobile() {
  if (process.env.NODE_ENV === "test") return false;
  return Platform.OS === "ios" || Platform.OS === "android";
}

function hasNotificationRuntime() {
  return (
    typeof Notifications.getPermissionsAsync === "function" &&
    typeof Notifications.requestPermissionsAsync === "function" &&
    typeof Notifications.getAllScheduledNotificationsAsync === "function" &&
    typeof Notifications.scheduleNotificationAsync === "function" &&
    typeof Notifications.cancelScheduledNotificationAsync === "function"
  );
}

function ensureHandlerConfigured() {
  if (!isMobile() || !hasNotificationRuntime() || handlerConfigured) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  handlerConfigured = true;
}

function parseDueAt(task: TaskItem): Date | null {
  const raw = String(task.dueAt || "").trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.getTime() <= Date.now() + 5_000) return null;
  return parsed;
}

function shouldSchedule(task: TaskItem) {
  const status = String(task.status || "").trim().toLowerCase();
  if (status === "done") return false;
  return Boolean(parseDueAt(task));
}

function reminderTitle(language: AppLanguage) {
  return language === "zh" ? "UsChat 提醒" : "UsChat Reminder";
}

function reminderBody(task: TaskItem, language: AppLanguage) {
  const title = String(task.title || "").trim() || (language === "zh" ? "未命名任务" : "Untitled task");
  return language === "zh" ? `到时间了：${title}` : `It's time: ${title}`;
}

async function ensureChannel() {
  if (Platform.OS !== "android") return;
  if (typeof Notifications.setNotificationChannelAsync !== "function") return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: "Task reminders",
    importance: Notifications.AndroidImportance.HIGH,
    sound: "default",
    vibrationPattern: [0, 250, 150, 250],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

export async function ensureTaskReminderPermission() {
  if (!isMobile() || !hasNotificationRuntime()) return false;
  ensureHandlerConfigured();
  await ensureChannel();

  const current = await Notifications.getPermissionsAsync();
  if (current?.granted) return true;

  const requested = await Notifications.requestPermissionsAsync();
  return Boolean(requested?.granted);
}

export async function clearTaskReminderNotifications() {
  if (!isMobile() || !hasNotificationRuntime()) return;
  const pending = await Notifications.getAllScheduledNotificationsAsync();
  const targets = pending.filter((item) => item.content.data?.[REMINDER_DATA_KEY] === REMINDER_KIND);
  await Promise.all(targets.map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier)));
}

export async function syncTaskReminderNotifications(tasks: TaskItem[], language: AppLanguage) {
  if (!isMobile() || !hasNotificationRuntime()) return;
  ensureHandlerConfigured();

  const granted = await ensureTaskReminderPermission();
  if (!granted) return;

  const candidates = new Map<string, TaskItem>();
  for (const task of tasks) {
    const taskId = String(task.id || "").trim();
    if (!taskId || !shouldSchedule(task)) continue;
    candidates.set(taskId, task);
  }

  const pending = await Notifications.getAllScheduledNotificationsAsync();
  const existingByTask = new Map<string, Notifications.NotificationRequest[]>();
  for (const item of pending) {
    if (item.content.data?.[REMINDER_DATA_KEY] !== REMINDER_KIND) continue;
    const taskId = String(item.content.data?.[REMINDER_TASK_ID_KEY] || "").trim();
    if (!taskId) continue;
    const list = existingByTask.get(taskId) || [];
    list.push(item);
    existingByTask.set(taskId, list);
  }

  const toCancel: string[] = [];
  for (const [taskId, requests] of existingByTask.entries()) {
    const target = candidates.get(taskId);
    if (!target) {
      for (const req of requests) toCancel.push(req.identifier);
      continue;
    }
    const dueAtISO = parseDueAt(target)?.toISOString() || "";
    let kept = false;
    for (const req of requests) {
      const savedDueAt = String(req.content.data?.[REMINDER_DUE_AT_KEY] || "");
      if (!kept && savedDueAt === dueAtISO) {
        kept = true;
        continue;
      }
      toCancel.push(req.identifier);
    }
  }
  if (toCancel.length > 0) {
    await Promise.all(toCancel.map((id) => Notifications.cancelScheduledNotificationAsync(id)));
  }

  const scheduledTaskIds = new Set<string>();
  const refreshedPending = await Notifications.getAllScheduledNotificationsAsync();
  for (const item of refreshedPending) {
    if (item.content.data?.[REMINDER_DATA_KEY] !== REMINDER_KIND) continue;
    const taskId = String(item.content.data?.[REMINDER_TASK_ID_KEY] || "").trim();
    if (taskId) scheduledTaskIds.add(taskId);
  }

  for (const [taskId, task] of candidates.entries()) {
    if (scheduledTaskIds.has(taskId)) continue;
    const dueAt = parseDueAt(task);
    if (!dueAt) continue;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: reminderTitle(language),
        body: reminderBody(task, language),
        sound: "default",
        ...(Platform.OS === "android" ? { channelId: CHANNEL_ID } : {}),
        data: {
          [REMINDER_DATA_KEY]: REMINDER_KIND,
          [REMINDER_TASK_ID_KEY]: taskId,
          [REMINDER_DUE_AT_KEY]: dueAt.toISOString(),
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: dueAt,
      },
    });
  }
}
