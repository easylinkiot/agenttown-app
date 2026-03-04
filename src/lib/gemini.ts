import { Platform } from "react-native";

interface GeminiHistoryItem {
  role: "user" | "model";
  text: string;
}

interface GenerateTextInput {
  prompt: string;
  systemInstruction?: string;
  history?: GeminiHistoryItem[];
  responseMimeType?: "text/plain" | "application/json";
}

const DEFAULT_BACKEND_BASE_URL = "https://agenttown-api.kittens.cloud";

function getBackendBaseUrl(): string {
  const raw = process.env.EXPO_PUBLIC_API_BASE_URL || DEFAULT_BACKEND_BASE_URL;
  const trimmed = raw.replace(/\/+$/, "");
  const normalized =
    Platform.OS !== "android"
      ? trimmed
      : trimmed
    .replace(/^http:\/\/localhost(?=[:/]|$)/i, "http://10.0.2.2")
    .replace(/^http:\/\/127\.0\.0\.1(?=[:/]|$)/i, "http://10.0.2.2");
  const isReleaseBuild = typeof __DEV__ === "undefined" ? true : !__DEV__;
  if (isReleaseBuild && /^http:\/\/(?:localhost|127\.0\.0\.1|10\.0\.2\.2)(?=[:/]|$)/i.test(normalized)) {
    return DEFAULT_BACKEND_BASE_URL;
  }
  return normalized;
}

export async function generateGeminiText({
  prompt,
  systemInstruction,
  history = [],
  responseMimeType = "text/plain",
}: GenerateTextInput): Promise<string | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3_000);

  try {
    const response = await fetch(`${getBackendBaseUrl()}/v1/ai/text`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        systemInstruction,
        history,
        responseMimeType,
      }),
      signal: controller.signal,
    });

    if (!response.ok) return null;
    const payload = await response.json();
    return typeof payload?.text === "string" ? payload.text.trim() || null : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

function cleanJsonText(input: string): string {
  return input
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

export function parseGeminiJson<T>(input: string): T | null {
  const cleaned = cleanJsonText(input);
  if (!cleaned) return null;
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}

export async function generateGeminiJson<T>(
  prompt: string,
  fallback: T,
  systemInstruction?: string,
  history?: GeminiHistoryItem[]
): Promise<T> {
  const text = await generateGeminiText({
    prompt,
    systemInstruction,
    history,
    responseMimeType: "application/json",
  });

  if (!text) return fallback;
  const parsed = parseGeminiJson<T>(text);
  return parsed ?? fallback;
}
