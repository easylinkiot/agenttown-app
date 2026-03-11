import mockAsyncStorage from "@react-native-async-storage/async-storage/jest/async-storage-mock";
import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import {
  fetchBootstrap,
  getThreadDisplayLanguage,
  listChatSessionMessages,
  listChatThreads,
  listThreadMessages,
  listV2ChatSessionMessages,
  mapATMessageToConversation,
  sendThreadMessage,
  subscribeRealtime,
} from "@/src/lib/api";
import { useAuth } from "../auth-context";
import { AgentTownProvider, useAgentTown } from "../agenttown-context";

const mockFs = {
  getInfoAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
  Paths: {} as Record<string, unknown>,
};
Object.defineProperty(mockFs.Paths, "document", {
  get() {
    throw new Error("this.validatePath is not a function");
  },
});

jest.mock("expo-file-system", () => mockFs);

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
  atCreateSession: jest.fn(),
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
  fetchBootstrap: jest.fn(),
  generateMiniApp: jest.fn(),
  generateRoleReplies: jest.fn(),
  getThreadDisplayLanguage: jest.fn(),
  installBotSkill: jest.fn(),
  installMiniApp: jest.fn(),
  listChatSessionMessages: jest.fn(),
  listChatThreads: jest.fn(),
  listThreadMembers: jest.fn(),
  listThreadMessages: jest.fn(),
  listV2ChatSessionMessages: jest.fn(),
  mapATMessageToConversation: jest.fn(),
  mapATSessionToThread: jest.fn(),
  patchCustomSkill: jest.fn(),
  patchTask: jest.fn(),
  queryChatTargetHistory: jest.fn(),
  removeThreadMember: jest.fn(),
  runMiniApp: jest.fn(),
  saveBotConfig: jest.fn(),
  sendThreadMessage: jest.fn(),
  subscribeRealtime: jest.fn(),
  toggleAgentSkill: jest.fn(),
  uninstallBotSkill: jest.fn(),
  updateThreadDisplayLanguage: jest.fn(),
}));

const mockedUseAuth = useAuth as jest.Mock;
const mockedFetchBootstrap = fetchBootstrap as jest.Mock;
const mockedGetThreadDisplayLanguage = getThreadDisplayLanguage as jest.Mock;
const mockedListChatSessionMessages = listChatSessionMessages as jest.Mock;
const mockedListChatThreads = listChatThreads as jest.Mock;
const mockedListThreadMessages = listThreadMessages as jest.Mock;
const mockedListV2ChatSessionMessages = listV2ChatSessionMessages as jest.Mock;
const mockedMapATMessageToConversation = mapATMessageToConversation as jest.Mock;
const mockedSendThreadMessage = sendThreadMessage as jest.Mock;
const mockedSubscribeRealtime = subscribeRealtime as jest.Mock;

function wrapper({ children }: { children: React.ReactNode }) {
  return <AgentTownProvider>{children}</AgentTownProvider>;
}

describe("agenttown-context cache safety", () => {
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
    mockedGetThreadDisplayLanguage.mockResolvedValue({
      thread_id: "qatr03011208",
      language: "en",
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
    mockedListChatThreads.mockResolvedValue([
      {
        id: "qatr03011208",
        name: "QA LIVE Translate",
        avatar: "",
        message: "",
        time: "Now",
        isGroup: true,
      },
    ]);
    mockedListChatSessionMessages.mockResolvedValue([]);
    mockedListThreadMessages.mockResolvedValue([
      {
        id: "msg_1",
        threadId: "qatr03011208",
        senderId: "u_2",
        senderName: "Lina",
        senderAvatar: "",
        senderType: "human",
        content: "需要在周五前提交版本更新。",
        type: "text",
        isMe: false,
        time: "Now",
      },
    ]);
    mockedListV2ChatSessionMessages.mockResolvedValue([]);
    mockedMapATMessageToConversation.mockImplementation(
      (row: { id?: string; content?: string }, userId: string, threadId: string) => ({
        id: row.id || "mapped_msg",
        threadId,
        senderId: userId,
        senderName: "Owner",
        senderAvatar: "",
        senderType: "human",
        content: row.content || "",
        type: "text",
        isMe: true,
        time: "Now",
      })
    );
    mockedSendThreadMessage.mockImplementation(async (threadId: string, payload: { content?: string }) => {
      const content = (payload?.content || "").trim() || "fallback";
      return {
        userMessage: {
          id: "msg_local_send",
          threadId,
          senderId: "u_owner",
          senderName: "Owner",
          senderAvatar: "",
          senderType: "human",
          content,
          type: "text",
          isMe: true,
          time: "Now",
        },
        messages: [
          {
            id: "msg_local_send",
            threadId,
            senderId: "u_owner",
            senderName: "Owner",
            senderAvatar: "",
            senderType: "human",
            content,
            type: "text",
            isMe: true,
            time: "Now",
          },
        ],
      };
    });
  });

  it("does not crash when file-system path probing fails and still loads thread messages", async () => {
    const { result } = renderHook(() => useAgentTown(), { wrapper });
    await waitFor(() => expect(result.current.bootstrapReady).toBe(true));

    await act(async () => {
      await result.current.refreshThreadMessages("qatr03011208");
    });

    await waitFor(() =>
      expect(result.current.messagesByThread["qatr03011208"]?.length || 0).toBeGreaterThan(0)
    );

    expect(mockFs.getInfoAsync).not.toHaveBeenCalled();
    expect(mockFs.readAsStringAsync).not.toHaveBeenCalled();
    expect(mockFs.makeDirectoryAsync).not.toHaveBeenCalled();
    expect(mockFs.writeAsStringAsync).not.toHaveBeenCalled();
    expect(mockedListChatSessionMessages).not.toHaveBeenCalled();
  });

  it("does not auto-load ai session messages into the primary chat store for sess-prefixed ids", async () => {
    mockedListThreadMessages.mockRejectedValueOnce(new Error("thread endpoint unavailable"));
    mockedListChatSessionMessages.mockResolvedValueOnce([
      {
        id: "msg_session_1",
        content: "legacy session message",
      },
    ]);

    const { result } = renderHook(() => useAgentTown(), { wrapper });
    await waitFor(() => expect(result.current.bootstrapReady).toBe(true));

    await act(async () => {
      await result.current.refreshThreadMessages("sess_legacy_1");
    });

    await waitFor(() =>
      expect(result.current.messagesByThread["sess_legacy_1"]?.[0]?.content).toBe("legacy session message")
    );
    expect(mockedListV2ChatSessionMessages).not.toHaveBeenCalled();
  });

  it("does not refetch thread display language after sendMessage updates thread preview", async () => {
    const { result } = renderHook(() => useAgentTown(), { wrapper });
    await waitFor(() => expect(result.current.bootstrapReady).toBe(true));
    await waitFor(() => expect(mockedGetThreadDisplayLanguage).toHaveBeenCalledTimes(1));

    await act(async () => {
      await result.current.sendMessage("qatr03011208", {
        content: "hello",
      });
    });

    await waitFor(() => expect(mockedSendThreadMessage).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockedGetThreadDisplayLanguage).toHaveBeenCalledTimes(1));
  });
});
