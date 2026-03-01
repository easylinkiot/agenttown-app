import mockAsyncStorage from "@react-native-async-storage/async-storage/jest/async-storage-mock";
import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react-native";

import { AgentTownProvider, useAgentTown } from "../agenttown-context";
import { useAuth } from "../auth-context";
import {
  atCreateSession,
  createFriend as createFriendApi,
  fetchBootstrap,
  listAgents,
  listChatSessions,
  listChatThreads,
  listCustomSkills,
  listFriends,
  listMiniApps,
  listMiniAppTemplates,
  listSkillCatalog,
  listTasks,
  mapATSessionToThread,
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
  executeCustomSkill: jest.fn(),
  fetchBootstrap: jest.fn().mockResolvedValue(null),
  generateMiniApp: jest.fn(),
  generateRoleReplies: jest.fn(),
  installMiniApp: jest.fn(),
  listAgents: jest.fn(),
  listChatSessions: jest.fn(),
  listChatThreads: jest.fn(),
  listCustomSkills: jest.fn(),
  listFriends: jest.fn(),
  listMiniApps: jest.fn(),
  listMiniAppTemplates: jest.fn(),
  listSkillCatalog: jest.fn(),
  listTasks: jest.fn(),
  listThreadMembers: jest.fn(),
  listThreadMessages: jest.fn(),
  patchTask: jest.fn(),
  patchCustomSkill: jest.fn(),
  removeThreadMember: jest.fn(),
  runMiniApp: jest.fn(),
  saveBotConfig: jest.fn(),
  subscribeRealtime: jest.fn(),
  toggleAgentSkill: jest.fn(),
  atCreateSession: jest.fn(),
  mapATMessageToConversation: jest.fn(),
  mapATSessionToThread: jest.fn(),
}));

const mockedUseAuth = useAuth as jest.Mock;
const mockedCreateFriendApi = createFriendApi as jest.Mock;
const mockedAtCreateSession = atCreateSession as jest.Mock;
const mockedMapATSessionToThread = mapATSessionToThread as jest.Mock;
const mockedSubscribeRealtime = subscribeRealtime as jest.Mock;
const mockedListChatThreads = listChatThreads as jest.Mock;
const mockedListChatSessions = listChatSessions as jest.Mock;
const mockedListTasks = listTasks as jest.Mock;
const mockedListFriends = listFriends as jest.Mock;
const mockedListAgents = listAgents as jest.Mock;
const mockedListSkillCatalog = listSkillCatalog as jest.Mock;
const mockedListCustomSkills = listCustomSkills as jest.Mock;
const mockedListMiniApps = listMiniApps as jest.Mock;
const mockedListMiniAppTemplates = listMiniAppTemplates as jest.Mock;
const mockedFetchBootstrap = fetchBootstrap as jest.Mock;

function wrapper({ children }: { children: React.ReactNode }) {
  return <AgentTownProvider>{children}</AgentTownProvider>;
}

describe("AgentTown friend regression", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockedUseAuth.mockReturnValue({
      isSignedIn: true,
      user: {
        id: "u_owner",
        displayName: "Owner",
      },
    });

    mockedSubscribeRealtime.mockImplementation(() => () => {});
    mockedFetchBootstrap.mockResolvedValue({
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
    mockedListChatThreads.mockResolvedValue([]);
    mockedListChatSessions.mockResolvedValue([]);
    mockedListTasks.mockResolvedValue([]);
    mockedListFriends.mockResolvedValue([]);
    mockedListAgents.mockResolvedValue([]);
    mockedListSkillCatalog.mockResolvedValue([]);
    mockedListCustomSkills.mockResolvedValue([]);
    mockedListMiniApps.mockResolvedValue([]);
    mockedListMiniAppTemplates.mockResolvedValue([]);
  });

  it("adds friend thread immediately when backend returns friend.threadId", async () => {
    mockedCreateFriendApi.mockResolvedValue({
      mode: "friend",
      friend: {
        id: "f_1",
        userId: "u_1",
        name: "Jason Biceek",
        avatar: "https://example.com/a.png",
        kind: "human",
        threadId: "sess_friend_1",
      },
    });

    const { result } = renderHook(() => useAgentTown(), { wrapper });
    await waitFor(() => expect(result.current.bootstrapReady).toBe(true));

    await act(async () => {
      await result.current.createFriend({
        userId: "u_1",
        name: "Jason Biceek",
        kind: "human",
      });
    });

    await waitFor(() =>
      expect(result.current.chatThreads.some((t) => t.id === "sess_friend_1")).toBe(true)
    );
    expect(mockedAtCreateSession).not.toHaveBeenCalled();
  });

  it("falls back to creating a user session when friend.threadId is missing", async () => {
    mockedCreateFriendApi.mockResolvedValue({
      mode: "friend",
      friend: {
        id: "f_2",
        userId: "u_2",
        name: "Jason Du",
        avatar: "https://example.com/b.png",
        kind: "human",
      },
    });

    mockedAtCreateSession.mockResolvedValue({
      id: "sess_friend_2",
      title: "Jason Du",
      target_type: "user",
      target_id: "u_2",
      message_count: 0,
    });
    mockedMapATSessionToThread.mockImplementation((session: any) => ({
      id: session.id,
      name: session.title || session.id,
      avatar: "",
      message: "",
      time: "",
      isGroup: false,
      targetType: session.target_type,
      targetId: session.target_id,
    }));

    const { result } = renderHook(() => useAgentTown(), { wrapper });
    await waitFor(() => expect(result.current.bootstrapReady).toBe(true));

    await act(async () => {
      await result.current.createFriend({
        userId: "u_2",
        name: "Jason Du",
        kind: "human",
      });
    });

    await waitFor(() =>
      expect(result.current.chatThreads.some((t) => t.id === "sess_friend_2")).toBe(true)
    );
    expect(mockedAtCreateSession).toHaveBeenCalledWith({
      target_type: "user",
      target_id: "u_2",
      title: "Jason Du",
    });
  });

  it("does not create a thread immediately when backend returns invitation mode", async () => {
    mockedCreateFriendApi.mockResolvedValue({
      mode: "request",
      request: {
        id: "req_1",
        status: "pending",
      },
    });

    const { result } = renderHook(() => useAgentTown(), { wrapper });
    await waitFor(() => expect(result.current.bootstrapReady).toBe(true));

    await act(async () => {
      await result.current.createFriend({
        userId: "u_3",
        name: "Pending User",
        kind: "human",
      });
    });

    expect(result.current.chatThreads).toHaveLength(0);
    expect(mockedAtCreateSession).not.toHaveBeenCalled();
  });

  it("hydrates direct chat threads from threads list", async () => {
    mockedListChatThreads.mockResolvedValue([
      {
        id: "sess_u_1",
        name: "Direct User",
        avatar: "",
        message: "",
        time: "2026-02-27T00:00:00Z",
        isGroup: false,
        targetType: "user",
        targetId: "u_1",
      },
    ]);

    const { result } = renderHook(() => useAgentTown(), { wrapper });
    await waitFor(() => expect(result.current.bootstrapReady).toBe(true));

    await waitFor(() =>
      expect(result.current.chatThreads.some((t) => t.id === "sess_u_1" && t.targetType === "user")).toBe(true)
    );
  });
});
