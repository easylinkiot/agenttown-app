import { getRuntimeApiBaseUrl } from "./api-base-url";

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

function getBackendBaseUrl(): string {
  return getRuntimeApiBaseUrl();
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
