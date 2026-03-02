import mockAsyncStorage from "@react-native-async-storage/async-storage/jest/async-storage-mock";
import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { fetchBootstrap, listChatThreads, listThreadMessages, subscribeRealtime } from "@/src/lib/api";
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
const mockedListChatThreads = listChatThreads as jest.Mock;
const mockedListThreadMessages = listThreadMessages as jest.Mock;
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
  });
});
