import { setAuthToken, subscribeRealtime } from "../api";

class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  static instances: MockWebSocket[] = [];

  readonly url: string;
  readyState = MockWebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  open() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.({ type: "open" } as Event);
  }

  emitMessage(payload: unknown) {
    const data = typeof payload === "string" ? payload : JSON.stringify(payload);
    this.onmessage?.({ data } as MessageEvent);
  }

  close() {
    if (this.readyState === MockWebSocket.CLOSED) return;
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ type: "close" } as CloseEvent);
  }
}

describe("subscribeRealtime", () => {
  const originalBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  const originalWebSocket = global.WebSocket;

  beforeEach(() => {
    jest.useFakeTimers();
    process.env.EXPO_PUBLIC_API_BASE_URL = "https://api.example.com";
    MockWebSocket.instances = [];
    setAuthToken("access-token");
    global.WebSocket = MockWebSocket as unknown as typeof WebSocket;
  });

  afterEach(() => {
    jest.useRealTimers();
    setAuthToken(null);
    process.env.EXPO_PUBLIC_API_BASE_URL = originalBaseUrl;
    global.WebSocket = originalWebSocket;
  });

  it("reconnects after close and keeps forwarding realtime events", () => {
    const onEvent = jest.fn();

    const unsubscribe = subscribeRealtime(onEvent, "thread_group_1");
    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.instances[0]?.url).toBe(
      "wss://api.example.com/v1/realtime/ws?threadId=thread_group_1&token=access-token"
    );

    MockWebSocket.instances[0]?.open();
    MockWebSocket.instances[0]?.emitMessage({
      type: "chat.message.created",
      threadId: "thread_group_1",
      sentAt: "2026-03-09T00:00:00Z",
      payload: { id: "msg_1" },
    });
    expect(onEvent).toHaveBeenCalledTimes(1);

    MockWebSocket.instances[0]?.close();
    jest.advanceTimersByTime(499);
    expect(MockWebSocket.instances).toHaveLength(1);
    jest.advanceTimersByTime(1);
    expect(MockWebSocket.instances).toHaveLength(2);

    MockWebSocket.instances[1]?.open();
    MockWebSocket.instances[1]?.emitMessage({
      type: "chat.message.created",
      threadId: "thread_group_1",
      sentAt: "2026-03-09T00:01:00Z",
      payload: { id: "msg_2" },
    });
    expect(onEvent).toHaveBeenCalledTimes(2);

    unsubscribe();
    MockWebSocket.instances[1]?.close();
    jest.advanceTimersByTime(5000);
    expect(MockWebSocket.instances).toHaveLength(2);
  });
});
