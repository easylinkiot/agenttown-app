import RealtimeKitClient from "@cloudflare/realtimekit-react-native";
import type { default as RealtimeKitClientType } from "@cloudflare/realtimekit";

import {
  buildMeetingClientInitKey,
  clearMeetingClientCache,
  forgetMeetingClient,
  getOrInitMeetingClient,
} from "@/src/features/meeting/meeting-client";

jest.mock("@cloudflare/realtimekit-react-native", () => ({
  __esModule: true,
  default: {
    init: jest.fn(),
  },
}));

const initMock = RealtimeKitClient.init as jest.MockedFunction<typeof RealtimeKitClient.init>;

describe("meeting-client", () => {
  beforeEach(() => {
    clearMeetingClientCache();
    initMock.mockReset();
  });

  it("builds an init key only when session id and auth token exist", () => {
    expect(buildMeetingClientInitKey({ id: "ms_1", authToken: "token_1" })).toBe("ms_1:token_1");
    expect(buildMeetingClientInitKey({ id: "ms_1", authToken: "" })).toBe("");
    expect(buildMeetingClientInitKey({ id: "", authToken: "token_1" })).toBe("");
  });

  it("deduplicates concurrent init calls for the same meeting key", async () => {
    const client = { self: { roomJoined: false } } as unknown as RealtimeKitClientType;
    let resolveInit: ((value: RealtimeKitClientType) => void) | undefined;

    initMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveInit = resolve as (value: RealtimeKitClientType) => void;
        })
    );

    const first = getOrInitMeetingClient("ms_1:token_1", { authToken: "token_1" });
    const second = getOrInitMeetingClient("ms_1:token_1", { authToken: "token_1" });

    expect(initMock).toHaveBeenCalledTimes(1);
    resolveInit?.(client);

    await expect(first).resolves.toBe(client);
    await expect(second).resolves.toBe(client);
  });

  it("retries init after a failed attempt is forgotten", async () => {
    const client = {} as RealtimeKitClientType;
    initMock.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(client);

    await expect(getOrInitMeetingClient("ms_1:token_1", { authToken: "token_1" })).rejects.toThrow("boom");

    forgetMeetingClient("ms_1:token_1");
    await expect(getOrInitMeetingClient("ms_1:token_1", { authToken: "token_1" })).resolves.toBe(client);
    expect(initMock).toHaveBeenCalledTimes(2);
  });
});
