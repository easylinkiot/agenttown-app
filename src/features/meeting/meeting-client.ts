import RealtimeKitClient from "@cloudflare/realtimekit-react-native";
import type { RealtimeKitClientOptions } from "@cloudflare/realtimekit";

const meetingClientCache = new Map<string, RealtimeKitClient>();
const meetingClientInitPromises = new Map<string, Promise<RealtimeKitClient>>();

export function buildMeetingClientInitKey(input: { id?: string; authToken?: string }): string {
  const id = (input.id || "").trim();
  const authToken = (input.authToken || "").trim();
  if (!id || !authToken) return "";
  return `${id}:${authToken}`;
}

export async function getOrInitMeetingClient(
  initKey: string,
  options: RealtimeKitClientOptions,
  initClient: (nextOptions: RealtimeKitClientOptions) => Promise<RealtimeKitClient> = RealtimeKitClient.init
): Promise<RealtimeKitClient> {
  const normalizedKey = initKey.trim();
  if (!normalizedKey) {
    throw new Error("meeting init key is required");
  }

  const cachedClient = meetingClientCache.get(normalizedKey);
  if (cachedClient) return cachedClient;

  const pendingInit = meetingClientInitPromises.get(normalizedKey);
  if (pendingInit) return pendingInit;

  const nextInit = initClient(options)
    .then((client) => {
      meetingClientCache.set(normalizedKey, client);
      meetingClientInitPromises.delete(normalizedKey);
      return client;
    })
    .catch((error) => {
      meetingClientInitPromises.delete(normalizedKey);
      throw error;
    });

  meetingClientInitPromises.set(normalizedKey, nextInit);
  return nextInit;
}

export function forgetMeetingClient(initKey?: string) {
  const normalizedKey = (initKey || "").trim();
  if (!normalizedKey) return;
  meetingClientCache.delete(normalizedKey);
  meetingClientInitPromises.delete(normalizedKey);
}

export function clearMeetingClientCache() {
  meetingClientCache.clear();
  meetingClientInitPromises.clear();
}
