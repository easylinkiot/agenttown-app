type FriendQrPayloadListener = (payload: string) => void;

const listeners = new Set<FriendQrPayloadListener>();
let pendingPayload = "";

export function publishPendingFriendQrPayload(payload: string) {
  const value = payload.trim();
  if (!value) return;

  if (listeners.size === 0) {
    pendingPayload = value;
    return;
  }

  pendingPayload = "";
  listeners.forEach((listener) => listener(value));
}

export function subscribePendingFriendQrPayload(listener: FriendQrPayloadListener) {
  listeners.add(listener);

  if (pendingPayload) {
    const nextPayload = pendingPayload;
    pendingPayload = "";
    listener(nextPayload);
  }

  return () => {
    listeners.delete(listener);
  };
}
