import mockAsyncStorage from "@react-native-async-storage/async-storage/jest/async-storage-mock";
import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react-native";

import { AgentTownProvider, useAgentTown } from "../agenttown-context";
import { useAuth } from "../auth-context";
import {
  acceptMeeting,
  fetchBootstrap,
  listChatThreads,
  subscribeRealtime,
} from "@/src/lib/api";

jest.mock("../auth-context", () => ({
  useAuth: jest.fn(),
}));

jest.mock("@react-native-async-storage/async-storage", () => mockAsyncStorage);

jest.mock("@/src/services/task-notifications", () => ({
  clearTaskReminderNotifications: jest.fn(),
  ensureTaskReminderPermission: jest.fn().mockResolvedValue(true),
  syncTaskReminderNotifications: jest.fn(),
}));

jest.mock("@/src/lib/api", () => ({
  acceptMeeting: jest.fn(),
  addThreadMember: jest.fn(),
  createAgent: jest.fn(),
  createChatThread: jest.fn(),
  createCustomSkill: jest.fn(),
  createFriend: jest.fn(),
  createTask: jest.fn(),
  createTaskFromMessage: jest.fn(),
  deleteChatThread: jest.fn(),
  deleteCustomSkill: jest.fn(),
  deleteFriend: jest.fn(),
  deleteMiniApp: jest.fn(),
  endMeeting: jest.fn(),
  executeCustomSkill: jest.fn(),
  fetchBootstrap: jest.fn(),
  generateMiniApp: jest.fn(),
  generateRoleReplies: jest.fn(),
  installBotSkill: jest.fn(),
  installMiniApp: jest.fn(),
  installPresetMiniApp: jest.fn(),
  leaveMeeting: jest.fn(),
  listAgents: jest.fn(),
  listChatSessionMessages: jest.fn(),
  listChatThreads: jest.fn(),
  listNPCs: jest.fn(),
  listThreadMembers: jest.fn(),
  listThreadMessages: jest.fn(),
  listV2ChatSessionMessages: jest.fn(),
  getThreadDisplayLanguage: jest.fn(),
  markThreadRead: jest.fn(),
  mapATMessageToConversation: jest.fn(),
  mapATSessionToThread: jest.fn(),
  patchCustomSkill: jest.fn(),
  patchTask: jest.fn(),
  queryChatTargetHistory: jest.fn(),
  rejectMeeting: jest.fn(),
  removeThreadMember: jest.fn(),
  requestMeeting: jest.fn(),
  runMiniApp: jest.fn(),
  saveBotConfig: jest.fn(),
  sendThreadMessage: jest.fn(),
  subscribeRealtime: jest.fn(),
  toggleAgentSkill: jest.fn(),
  uninstallBotSkill: jest.fn(),
  updateThreadDisplayLanguage: jest.fn(),
  atCreateSession: jest.fn(),
}));

const mockedUseAuth = useAuth as jest.Mock;
const mockedFetchBootstrap = fetchBootstrap as jest.Mock;
const mockedListChatThreads = listChatThreads as jest.Mock;
const mockedSubscribeRealtime = subscribeRealtime as jest.Mock;
const mockedAcceptMeeting = acceptMeeting as jest.Mock;

function wrapper({ children }: { children: React.ReactNode }) {
  return <AgentTownProvider>{children}</AgentTownProvider>;
}

describe("AgentTown meeting state", () => {
  let realtimeCallback: ((event: any) => void) | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
    realtimeCallback = null;

    mockedUseAuth.mockReturnValue({
      isSignedIn: true,
      user: {
        id: "u_owner",
        displayName: "Owner",
      },
    });

    mockedFetchBootstrap.mockResolvedValue({
      botConfig: {
        name: "Nova",
        avatar: "",
        systemInstruction: "",
        documents: [],
        installedSkillIds: [],
        knowledgeKeywords: [],
      },
      chatThreads: [],
      tasks: [],
      messages: {},
      friends: [],
      threadMembers: {},
      agents: [],
      skillCatalog: [],
      customSkills: [],
      miniApps: [],
      miniAppTemplates: [],
    });
    mockedListChatThreads.mockResolvedValue([
      {
        id: "thread_1",
        name: "Jason",
        avatar: "",
        message: "",
        time: "Now",
        isGroup: false,
      },
    ]);
    mockedSubscribeRealtime.mockImplementation((callback: (event: any) => void) => {
      realtimeCallback = callback;
      return () => {};
    });
    mockedAcceptMeeting.mockResolvedValue({
      meeting_session: {
        id: "ms_1",
        thread_id: "thread_1",
        mode: "video",
        invite_state: "accepted",
        session_state: "not_started",
        platform_meeting_id: "cf_1",
      },
      view_status: "connecting",
      acceptable: false,
      rejectable: true,
    });
  });

  it("tracks incoming ringing and active meeting transitions from realtime signals", async () => {
    const { result } = renderHook(() => useAgentTown(), { wrapper });
    await waitFor(() => expect(result.current.bootstrapReady).toBe(true));
    expect(realtimeCallback).toBeTruthy();

    act(() => {
      realtimeCallback?.({
        type: "chat.message.created",
        threadId: "thread_1",
        sentAt: "2026-03-13T10:00:00.000Z",
        payload: {
          id: "msg_1",
          threadId: "thread_1",
          senderAvatar: "",
          senderId: "u_peer",
          senderName: "Jason",
          type: "meeting",
          isMe: false,
          content: JSON.stringify({
            action: "request",
            id: "ms_1",
            thread_id: "thread_1",
            mode: "video",
            view_status: "ringing",
            acceptable: true,
            rejectable: true,
          }),
        },
      });
    });

    await waitFor(() => expect(result.current.incomingMeetingSession?.id).toBe("ms_1"));

    act(() => {
      realtimeCallback?.({
        type: "chat.message.created",
        threadId: "thread_1",
        sentAt: "2026-03-13T10:00:01.000Z",
        payload: {
          id: "msg_2",
          threadId: "thread_1",
          senderAvatar: "",
          senderId: "system",
          senderName: "System",
          type: "meeting",
          isMe: false,
          content: JSON.stringify({
            action: "state",
            id: "ms_1",
            thread_id: "thread_1",
            mode: "video",
            meeting_id: "cf_1",
            view_status: "connecting",
            acceptable: false,
            rejectable: true,
            auth_token: "token_1",
          }),
        },
      });
    });

    await waitFor(() => expect(result.current.activeMeetingSession?.id).toBe("ms_1"));
    expect(result.current.incomingMeetingSession).toBeNull();
    expect(result.current.meetingSessionsById.ms_1.authToken).toBe("token_1");
  });
});
