import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { registerPushDevice, unregisterPushDevice } from "@/src/lib/api";

const PUSH_CHANNEL_ID = "chat-messages";
const PUSH_CACHE_KEY = "agenttown.push.registration.v1";

type CachedPushRegistration = {
  userId: string;
  expoPushToken: string;
};

let notificationHandlerConfigured = false;
let remotePushRegistrationActive = false;

function isMobile() {
  if (process.env.NODE_ENV === "test") return false;
  return Platform.OS === "ios" || Platform.OS === "android";
}

function hasNotificationRuntime() {
  return (
    typeof Notifications.getPermissionsAsync === "function" &&
    typeof Notifications.requestPermissionsAsync === "function" &&
    typeof Notifications.getExpoPushTokenAsync === "function"
  );
}

export function ensureNotificationHandlerConfigured() {
  if (!isMobile() || notificationHandlerConfigured) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  notificationHandlerConfigured = true;
}

async function ensureAndroidNotificationChannel() {
  if (Platform.OS !== "android" || typeof Notifications.setNotificationChannelAsync !== "function") return;
  await Notifications.setNotificationChannelAsync(PUSH_CHANNEL_ID, {
    name: "Messages",
    importance: Notifications.AndroidImportance.HIGH,
    sound: "default",
    vibrationPattern: [0, 250, 150, 250],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

async function ensurePushPermission() {
  if (!isMobile() || !hasNotificationRuntime()) return false;
  ensureNotificationHandlerConfigured();
  await ensureAndroidNotificationChannel();
  const current = await Notifications.getPermissionsAsync();
  if (current?.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return Boolean(requested?.granted);
}

async function readCachedRegistration(): Promise<CachedPushRegistration | null> {
  try {
    const raw = await AsyncStorage.getItem(PUSH_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedPushRegistration>;
    const userId = typeof parsed?.userId === "string" ? parsed.userId.trim() : "";
    const expoPushToken = typeof parsed?.expoPushToken === "string" ? parsed.expoPushToken.trim() : "";
    if (!userId || !expoPushToken) return null;
    return { userId, expoPushToken };
  } catch {
    return null;
  }
}

async function writeCachedRegistration(next: CachedPushRegistration | null) {
  if (!next) {
    await AsyncStorage.removeItem(PUSH_CACHE_KEY);
    return;
  }
  await AsyncStorage.setItem(PUSH_CACHE_KEY, JSON.stringify(next));
}

function resolveProjectId() {
  const fromEasConfig = typeof Constants.easConfig?.projectId === "string" ? Constants.easConfig.projectId.trim() : "";
  if (fromEasConfig) return fromEasConfig;
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  const fromExpoConfig = typeof extra?.eas?.projectId === "string" ? extra.eas.projectId.trim() : "";
  return fromExpoConfig;
}

function resolveAppVersion() {
  const fromExpoConfig = typeof Constants.expoConfig?.version === "string" ? Constants.expoConfig.version.trim() : "";
  if (fromExpoConfig) return fromExpoConfig;
  const fromNative = typeof Constants.nativeAppVersion === "string" ? Constants.nativeAppVersion.trim() : "";
  return fromNative;
}

export function isRemotePushRegistrationActive() {
  return remotePushRegistrationActive;
}

export async function syncRemotePushRegistration(userId: string) {
  const ownerUserID = userId.trim();
  if (!ownerUserID || !isMobile() || !hasNotificationRuntime()) return null;
  const granted = await ensurePushPermission();
  if (!granted) {
    remotePushRegistrationActive = false;
    return null;
  }
  const projectId = resolveProjectId();
  if (!projectId) {
    remotePushRegistrationActive = false;
    return null;
  }
  const tokenResult = await Notifications.getExpoPushTokenAsync({ projectId });
  const expoPushToken = tokenResult.data.trim();
  if (!expoPushToken) {
    remotePushRegistrationActive = false;
    return null;
  }

  const cached = await readCachedRegistration();
  if (cached?.userId === ownerUserID && cached.expoPushToken === expoPushToken) {
    remotePushRegistrationActive = true;
    return expoPushToken;
  }

  await registerPushDevice({
    expoPushToken,
    platform: Platform.OS,
    appVersion: resolveAppVersion() || undefined,
  });
  await writeCachedRegistration({ userId: ownerUserID, expoPushToken });
  remotePushRegistrationActive = true;
  return expoPushToken;
}

export async function unregisterRemotePushRegistration() {
  const cached = await readCachedRegistration();
  if (!cached?.expoPushToken) {
    remotePushRegistrationActive = false;
    return;
  }
  try {
    await unregisterPushDevice({ expoPushToken: cached.expoPushToken });
  } finally {
    await writeCachedRegistration(null);
    remotePushRegistrationActive = false;
  }
}
