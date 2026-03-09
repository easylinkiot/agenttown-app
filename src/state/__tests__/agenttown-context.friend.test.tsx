import mockAsyncStorage from "@react-native-async-storage/async-storage/jest/async-storage-mock";
import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react-native";

import { AgentTownProvider, useAgentTown } from "../agenttown-context";
import { useAuth } from "../auth-context";
import {
  addThreadMember,
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
  listNPCs,
  listSkillCatalog,
  listTasks,
  markThreadRead as markThreadReadApi,
  listThreadMembers,
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
  listNPCs: jest.fn(),
  listSkillCatalog: jest.fn(),
  listTasks: jest.fn(),
  markThreadRead: jest.fn(),
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
const mockedAddThreadMember = addThreadMember as jest.Mock;
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
const mockedListNPCs = listNPCs as jest.Mock;
const mockedFetchBootstrap = fetchBootstrap as jest.Mock;
const mockedListThreadMembers = listThreadMembers as jest.Mock;
const mockedMarkThreadReadApi = markThreadReadApi as jest.Mock;

function wrapper({ children }: { children: React.ReactNode }) {
  return <AgentTownProvider>{children}</AgentTownProvider>;
}

describe("AgentTown friend regression", () => {
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

    mockedSubscribeRealtime.mockImplementation((callback: (event: any) => void) => {
      realtimeCallback = callback;
      return () => {};
    });
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
    mockedListNPCs.mockResolvedValue([]);
    mockedListThreadMembers.mockResolvedValue([]);
    mockedMarkThreadReadApi.mockResolvedValue({
      ok: true,
      threadId: "thread_1",
      unreadCount: 0,
      mentionUnreadCount: 0,
    });
    mockedAddThreadMember.mockReset();
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

  it("keeps group memberCount in sync when realtime member events arrive", async () => {
    const groupThread = {
      id: "thread_group_1",
      name: "Group One",
      avatar: "https://example.com/group.png",
      message: "",
      time: "Now",
      isGroup: true,
      memberCount: 1,
    };

    mockedFetchBootstrap.mockResolvedValue({
      chatThreads: [groupThread],
      tasks: [],
      messages: {},
      friends: [],
      threadMembers: {
        thread_group_1: [
          {
            id: "member_owner",
            threadId: "thread_group_1",
            name: "Owner",
            avatar: "https://example.com/owner.png",
            memberType: "human",
            friendId: "u_owner",
          },
        ],
      },
      agents: [],
      skillCatalog: [],
      customSkills: [],
      miniApps: [],
      miniAppTemplates: [],
    });
    mockedListChatThreads.mockResolvedValue([groupThread]);

    const { result } = renderHook(() => useAgentTown(), { wrapper });
    await waitFor(() => expect(result.current.bootstrapReady).toBe(true));

    await act(async () => {
      realtimeCallback?.({
        type: "thread.member.added",
        threadId: "thread_group_1",
        sentAt: "2026-03-06T00:00:00Z",
        payload: {
          id: "member_friend",
          threadId: "thread_group_1",
          name: "Friend",
          avatar: "https://example.com/friend.png",
          memberType: "human",
          friendId: "u_friend",
        },
      });
    });

    expect(result.current.chatThreads.find((item) => item.id === "thread_group_1")?.memberCount).toBe(2);

    await act(async () => {
      realtimeCallback?.({
        type: "thread.member.removed",
        threadId: "thread_group_1",
        sentAt: "2026-03-06T00:01:00Z",
        payload: {
          id: "member_friend",
          threadId: "thread_group_1",
        },
      });
    });

    expect(result.current.chatThreads.find((item) => item.id === "thread_group_1")?.memberCount).toBe(1);
  });

  it("backfills the configured group NPC even when another npc is already present", async () => {
    const groupThread = {
      id: "thread_group_2",
      name: "Founders",
      avatar: "",
      message: "",
      time: "Now",
      isGroup: true,
      groupNpcName: "Elon Musk",
      memberCount: 2,
    };

    mockedFetchBootstrap.mockResolvedValue({
      chatThreads: [groupThread],
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
    mockedListChatThreads.mockResolvedValue([groupThread]);
    mockedListThreadMembers.mockResolvedValue([
      {
        id: "member_other_npc",
        threadId: "thread_group_2",
        name: "Coach NPC",
        avatar: "",
        memberType: "role",
        npcId: "npc_other",
      },
    ]);
    mockedListNPCs.mockResolvedValue([
      {
        id: "npc_other",
        ownerUserId: "u_owner",
        name: "Coach NPC",
      },
      {
        id: "npc_group",
        ownerUserId: "u_owner",
        name: "Elon Musk",
      },
    ]);
    mockedAddThreadMember.mockResolvedValue({
      id: "member_group_npc",
      threadId: "thread_group_2",
      name: "Elon Musk",
      avatar: "",
      memberType: "role",
      npcId: "npc_group",
    });

    const { result } = renderHook(() => useAgentTown(), { wrapper });
    await waitFor(() => expect(result.current.bootstrapReady).toBe(true));

    await act(async () => {
      await result.current.listMembers("thread_group_2");
    });

    await waitFor(() =>
      expect(result.current.threadMembers.thread_group_2).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "member_other_npc", npcId: "npc_other" }),
          expect.objectContaining({ id: "member_group_npc", npcId: "npc_group" }),
        ])
      )
    );
    expect(mockedAddThreadMember).toHaveBeenCalledWith("thread_group_2", {
      npcId: "npc_group",
      memberType: "role",
    });
  });

  it("personalizes direct threads when realtime friend.created arrives", async () => {
    mockedFetchBootstrap.mockResolvedValue({
      chatThreads: [
        {
          id: "thread_direct_1",
          name: "Unknown",
          avatar: "",
          message: "",
          time: "Now",
          isGroup: false,
        },
      ],
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
        id: "thread_direct_1",
        name: "Unknown",
        avatar: "",
        message: "",
        time: "Now",
        isGroup: false,
      },
    ]);

    const { result } = renderHook(() => useAgentTown(), { wrapper });
    await waitFor(() => expect(result.current.bootstrapReady).toBe(true));

    await act(async () => {
      realtimeCallback?.({
        type: "friend.created",
        sentAt: "2026-03-06T00:02:00Z",
        payload: {
          id: "friend_direct_1",
          ownerId: "u_owner",
          userId: "u_friend",
          name: "Friend Name",
          avatar: "https://example.com/friend.png",
          kind: "human",
          threadId: "thread_direct_1",
        },
      });
    });

    expect(result.current.chatThreads.find((item) => item.id === "thread_direct_1")).toMatchObject({
      id: "thread_direct_1",
      name: "Friend Name",
      avatar: "https://example.com/friend.png",
      targetType: "user",
      targetId: "u_friend",
    });
  });

  it("de-duplicates identical markThreadRead requests for the same thread sequence", async () => {
    const { result } = renderHook(() => useAgentTown(), { wrapper });
    await waitFor(() => expect(result.current.bootstrapReady).toBe(true));

    await act(async () => {
      await result.current.markThreadRead("thread_1", 12);
      await result.current.markThreadRead("thread_1", 12);
      await result.current.markThreadRead("thread_1", 13);
    });

    expect(mockedMarkThreadReadApi).toHaveBeenCalledTimes(2);
    expect(mockedMarkThreadReadApi).toHaveBeenNthCalledWith(1, "thread_1", {
      lastReadSeqNo: 12,
    });
    expect(mockedMarkThreadReadApi).toHaveBeenNthCalledWith(2, "thread_1", {
      lastReadSeqNo: 13,
    });
  });
});
