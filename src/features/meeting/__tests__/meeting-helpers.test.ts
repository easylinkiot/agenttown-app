import {
  buildMeetingRuntimeSessionFromOperationResponse,
  buildMeetingRuntimeSessionFromSignal,
  isMeetingSessionTerminal,
  parseMeetingSignalContent,
} from "../meeting-helpers";

describe("meeting helpers", () => {
  it("parses meeting signal content with snake_case fields", () => {
    const signal = parseMeetingSignalContent(
      JSON.stringify({
        action: "state",
        id: "ms_1",
        thread_id: "thread_1",
        meeting_id: "cf_1",
        view_status: "connecting",
        auth_token: "token_1",
      })
    );

    expect(signal).toEqual({
      action: "state",
      id: "ms_1",
      threadId: "thread_1",
      meetingId: "cf_1",
      viewStatus: "connecting",
      authToken: "token_1",
      acceptable: undefined,
      creatorUserId: undefined,
      durationSec: undefined,
      inviteState: undefined,
      mode: undefined,
      platform: undefined,
      reason: undefined,
      rejectable: undefined,
      sessionState: undefined,
      ver: undefined,
    });
  });

  it("preserves auth token when later realtime states omit it", () => {
    const connecting = buildMeetingRuntimeSessionFromSignal({
      threadId: "thread_1",
      signal: {
        action: "state",
        id: "ms_1",
        threadId: "thread_1",
        viewStatus: "connecting",
        meetingId: "cf_1",
        authToken: "token_1",
      },
      updatedAt: "2026-03-13T10:00:00.000Z",
    });

    const inCall = buildMeetingRuntimeSessionFromSignal({
      threadId: "thread_1",
      signal: {
        action: "state",
        id: "ms_1",
        threadId: "thread_1",
        viewStatus: "in_call",
      },
      existing: connecting || undefined,
      updatedAt: "2026-03-13T10:00:01.000Z",
    });

    expect(inCall?.authToken).toBe("token_1");
    expect(inCall?.meetingId).toBe("cf_1");
    expect(inCall?.viewStatus).toBe("in_call");
  });

  it("maps meeting operation responses into runtime sessions", () => {
    const session = buildMeetingRuntimeSessionFromOperationResponse({
      response: {
        meeting_session: {
          id: "ms_2",
          thread_id: "thread_2",
          mode: "audio",
          invite_state: "ringing",
          session_state: "not_started",
          platform_meeting_id: "cf_2",
        },
        view_status: "ringing",
        acceptable: false,
        rejectable: true,
      },
    });

    expect(session).toMatchObject({
      id: "ms_2",
      threadId: "thread_2",
      mode: "audio",
      inviteState: "ringing",
      sessionState: "not_started",
      meetingId: "cf_2",
      viewStatus: "ringing",
      rejectable: true,
    });
  });

  it("treats unanswered and ended sessions as terminal", () => {
    expect(isMeetingSessionTerminal({ viewStatus: "unanswered" })).toBe(true);
    expect(isMeetingSessionTerminal({ sessionState: "ended" })).toBe(true);
    expect(isMeetingSessionTerminal({ viewStatus: "connecting", inviteState: "accepted" })).toBe(false);
  });
});
