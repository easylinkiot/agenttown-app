import {
  acceptMeeting,
  leaveMeeting,
  rejectMeeting,
  requestMeeting,
  setAuthToken,
} from "../api";

function mockResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
    headers: {
      get: () => null,
    },
  } as unknown as Response;
}

describe("meeting api", () => {
  const originalBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    process.env.EXPO_PUBLIC_API_BASE_URL = "https://api.example.com";
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    setAuthToken("access-token");
  });

  afterEach(() => {
    process.env.EXPO_PUBLIC_API_BASE_URL = originalBaseUrl;
    setAuthToken(null);
    fetchMock.mockReset();
  });

  it("posts meeting request using backend payload keys", async () => {
    fetchMock.mockResolvedValue(mockResponse({ meeting_session: { id: "ms_1" }, view_status: "ringing" }));

    await requestMeeting({
      threadId: "thread_1",
      mode: "video",
      defaultCameraOn: true,
      targetUserIds: ["user_2"],
      clientRequestId: "req_1",
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.example.com/v1/meetings/request");
    expect(init.method).toBe("POST");
    expect(JSON.parse((init.body as string) || "{}")).toEqual({
      thread_id: "thread_1",
      mode: "video",
      target_user_ids: ["user_2"],
      default_camera_on: true,
      client_request_id: "req_1",
    });
  });

  it("posts accept, reject, and leave actions to dedicated meeting endpoints", async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse({ meeting_session: { id: "ms_1" }, view_status: "connecting" }))
      .mockResolvedValueOnce(mockResponse({ meeting_session: { id: "ms_1" }, view_status: "failed" }))
      .mockResolvedValueOnce(mockResponse({ meeting_session: { id: "ms_1" }, view_status: "ended" }));

    await acceptMeeting("ms_1", { device: { platform: "ios" } });
    await rejectMeeting("ms_1", { reason: "busy" });
    await leaveMeeting("ms_1", { reason: "single_left" });

    expect(fetchMock.mock.calls[0][0]).toBe("https://api.example.com/v1/meetings/ms_1/accept");
    expect(JSON.parse((fetchMock.mock.calls[0][1].body as string) || "{}")).toEqual({
      device: { platform: "ios" },
    });

    expect(fetchMock.mock.calls[1][0]).toBe("https://api.example.com/v1/meetings/ms_1/reject");
    expect(JSON.parse((fetchMock.mock.calls[1][1].body as string) || "{}")).toEqual({
      reason: "busy",
    });

    expect(fetchMock.mock.calls[2][0]).toBe("https://api.example.com/v1/meetings/ms_1/leave");
    expect(JSON.parse((fetchMock.mock.calls[2][1].body as string) || "{}")).toEqual({
      reason: "single_left",
    });
  });
});
