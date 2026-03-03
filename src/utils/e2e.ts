import { NativeModules, Platform } from "react-native";

function normalizeLaunchArgValue(value: unknown) {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "1" || normalized === "true" || normalized === "yes") return true;
    if (normalized === "0" || normalized === "false" || normalized === "no") return false;
  }
  return value;
}

function extractDetoxFlags(source: Record<string, unknown> | null | undefined) {
  if (!source || typeof source !== "object") return null;

  const picked: Record<string, unknown> = {};
  for (const [key, rawValue] of Object.entries(source)) {
    const normalizedKey = key.startsWith("-") ? key.slice(1) : key;
    const canonical = normalizedKey.trim().toLowerCase();

    if (canonical === "detoxserver") {
      picked.detoxServer = normalizeLaunchArgValue(rawValue);
      continue;
    }
    if (canonical === "detoxsessionid") {
      picked.detoxSessionId = normalizeLaunchArgValue(rawValue);
      continue;
    }
    if (canonical === "e2emode") {
      picked.e2eMode = normalizeLaunchArgValue(rawValue);
      continue;
    }
    if (canonical === "e2eauthemail") {
      picked.e2eAuthEmail = typeof rawValue === "string" ? rawValue : String(rawValue ?? "");
      continue;
    }
    if (canonical === "e2eauthpassword") {
      picked.e2eAuthPassword = typeof rawValue === "string" ? rawValue : String(rawValue ?? "");
      continue;
    }
    if (canonical === "detoxdebugvisibility") {
      picked.detoxDebugVisibility = normalizeLaunchArgValue(rawValue);
      continue;
    }
    if (canonical === "detoxdisablehierarchydump") {
      picked.detoxDisableHierarchyDump = normalizeLaunchArgValue(rawValue);
    }
  }

  return Object.keys(picked).length > 0 ? picked : null;
}

function readDetoxLaunchArgs() {
  const modulesToCheck = [
    NativeModules?.Detox,
    NativeModules?.DTXDetox,
    NativeModules?.DTXDetoxManager,
    NativeModules?.DetoxManager,
  ];

  for (const entry of modulesToCheck) {
    if (!entry || typeof entry !== "object") continue;

    const launchArgs = (entry as { launchArgs?: unknown }).launchArgs;
    if (launchArgs && typeof launchArgs === "object") {
      const extracted = extractDetoxFlags(launchArgs as Record<string, unknown>);
      if (extracted) return extracted;
    }

    const extracted = extractDetoxFlags(entry as Record<string, unknown>);
    if (extracted) return extracted;
  }

  if (Platform.OS === "ios") {
    const settings = NativeModules?.SettingsManager?.settings;
    if (settings && typeof settings === "object") {
      const extracted = extractDetoxFlags(settings as Record<string, unknown>);
      if (extracted) return extracted;
    }
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

  const args = readDetoxLaunchArgs();
  if (args && (args.detoxServer || args.detoxSessionId || args.e2eMode === true)) {
    return true;
  }
  if (args && (args.detoxDebugVisibility !== undefined || args.detoxDisableHierarchyDump !== undefined)) {
    return true;
  }

  // Fallback for environments where launch args are not bridged into JS.
  // Detox usually injects native modules containing "detox" / "dtx" in name.
  const nativeModuleKeys = Object.keys(NativeModules || {});
  return nativeModuleKeys.some((key) => /detox|dtx/i.test(key));
}
