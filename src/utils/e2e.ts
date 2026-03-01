import { NativeModules, Platform } from "react-native";

function readDetoxLaunchArgs() {
  if (Platform.OS === "ios") {
    const settings = NativeModules?.SettingsManager?.settings;
    if (settings && typeof settings === "object") {
      return settings as Record<string, unknown>;
    }
  }

  const detox = NativeModules?.Detox;
  if (detox && typeof detox.launchArgs === "object" && detox.launchArgs) {
    return detox.launchArgs as Record<string, unknown>;
  }

  return null;
}

export function getE2ELaunchArgs() {
  return readDetoxLaunchArgs();
}

export function isE2ETestMode() {
  const envMode = (process.env.EXPO_PUBLIC_E2E_MODE || "").trim().toLowerCase();
  if (envMode === "1" || envMode === "true") {
    return true;
  }
  const args = getE2ELaunchArgs();
  if (!args) return false;
  return Boolean(args.detoxServer || args.detoxSessionId || args.e2eMode);
}
