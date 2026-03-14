import { Platform } from "react-native";

export const API_ENV_BASE_URLS = {
  stage: "https://api.agtown.ai",
  dev: "https://agenttown-api.kittens.cloud",
  local: "http://127.0.0.1:8080",
} as const;

export type ApiEnvironment = keyof typeof API_ENV_BASE_URLS;

export const DEFAULT_API_ENV: ApiEnvironment = "stage";
const LOCALHOST_PATTERN = /^http:\/\/(?:localhost|127\.0\.0\.1|10\.0\.2\.2)(?=[:/]|$)/i;
const KNOWN_REMOTE_API_BASE_URLS = new Set<string>(
  Object.entries(API_ENV_BASE_URLS)
    .filter(([env]) => env !== "local")
    .map(([, url]) => url)
);
let hasLoggedRuntimeApiEnv = false;

function normalizeApiEnvironment(value: string | undefined | null): ApiEnvironment {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "stage" || normalized === "staging") return "stage";
  if (normalized === "dev" || normalized === "development") return "dev";
  if (normalized === "local" || normalized === "localhost") return "local";
  return DEFAULT_API_ENV;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function normalizeLocalhostForAndroid(value: string, platformOS: string): string {
  if (platformOS !== "android") return value;
  return value
    .replace(/^http:\/\/localhost(?=[:/]|$)/i, "http://10.0.2.2")
    .replace(/^http:\/\/127\.0\.0\.1(?=[:/]|$)/i, "http://10.0.2.2");
}

function resolveConfiguredBaseUrl(
  env: ApiEnvironment,
  explicitBaseUrl: string,
  fallbackBaseUrl: string
): string {
  if (env !== "local") return explicitBaseUrl;
  if (!KNOWN_REMOTE_API_BASE_URLS.has(explicitBaseUrl)) return explicitBaseUrl;
  return fallbackBaseUrl;
}

export function getApiEnvironment(value?: string | null): ApiEnvironment {
  return normalizeApiEnvironment(value ?? process.env.EXPO_PUBLIC_API_ENV);
}

export function getDefaultApiBaseUrl(env = getApiEnvironment()): string {
  return API_ENV_BASE_URLS[env];
}

interface ResolveApiBaseUrlOptions {
  apiEnv?: string | null;
  explicitBaseUrl?: string | null;
  e2eBaseUrl?: string | null;
  platformOS?: string;
  isReleaseBuild?: boolean;
  allowLocalhostInRelease?: boolean;
}

export function resolveApiBaseUrl({
  apiEnv,
  explicitBaseUrl,
  e2eBaseUrl,
  platformOS = Platform.OS,
  isReleaseBuild = typeof __DEV__ === "undefined" ? true : !__DEV__,
  allowLocalhostInRelease = false,
}: ResolveApiBaseUrlOptions = {}): string {
  const env = getApiEnvironment(apiEnv);
  const fallbackBaseUrl = getDefaultApiBaseUrl(env);
  const rawExplicitBaseUrl = explicitBaseUrl?.trim() || "";
  const configuredBaseUrl = resolveConfiguredBaseUrl(env, rawExplicitBaseUrl, fallbackBaseUrl);
  const raw = e2eBaseUrl?.trim() || configuredBaseUrl || fallbackBaseUrl;
  const normalized = normalizeLocalhostForAndroid(trimTrailingSlash(raw), platformOS);

  if (isReleaseBuild && !allowLocalhostInRelease && LOCALHOST_PATTERN.test(normalized)) {
    return fallbackBaseUrl;
  }

  return normalized;
}

function logRuntimeApiEnvOnce(env: ApiEnvironment, baseUrl: string, isReleaseBuild: boolean) {
  if (isReleaseBuild || process.env.NODE_ENV === "test" || hasLoggedRuntimeApiEnv) return;
  hasLoggedRuntimeApiEnv = true;
  console.info(`[api-env] 访问环境 ${env} URL=${baseUrl}`);
}

export function getRuntimeApiBaseUrl() {
  const env = getApiEnvironment();
  const baseUrl = resolveApiBaseUrl({
    apiEnv: env,
    explicitBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
  });
  const isReleaseBuild = typeof __DEV__ === "undefined" ? true : !__DEV__;
  logRuntimeApiEnvOnce(env, baseUrl, isReleaseBuild);
  return baseUrl;
}
