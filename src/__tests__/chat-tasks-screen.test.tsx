import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";

import { getAuthToken } from "@/src/lib/api";
import { useAgentTown } from "@/src/state/agenttown-context";
import ChatTasksScreen from "../../app/chat/tasks";
import { getApiBaseUrl } from "../services/chatAssist";

jest.mock("expo-router", () => ({
  useRouter: jest.fn(),
  useLocalSearchParams: jest.fn(),
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: "Ionicons",
}));

jest.mock("react-native-safe-area-context", () => {
  const { View } = jest.requireActual("react-native");
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

jest.mock("@/src/components/KeyframeBackground", () => ({
  KeyframeBackground: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock("@/src/components/StateBlocks", () => {
  const { Pressable, Text, View } = jest.requireActual("react-native");
  return {
    EmptyState: ({ title, hint }: { title?: string; hint?: string }) => (
      <View>
        <Text>{title || ""}</Text>
        <Text>{hint || ""}</Text>
      </View>
    ),
    LoadingSkeleton: () => <Text>Loading</Text>,
    StateBanner: ({
      title,
      message,
      actionLabel,
      onAction,
    }: {
      title?: string;
      message?: string;
      actionLabel?: string;
      onAction?: () => void;
    }) => (
      <View>
        <Text>{title || ""}</Text>
        <Text>{message || ""}</Text>
        {actionLabel ? (
          <Pressable onPress={onAction}>
            <Text>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    ),
  };
});

jest.mock("@/src/i18n/translate", () => ({
  tx: (_language: string, _zh: string, en: string) => en,
}));

jest.mock("@/src/state/agenttown-context", () => ({
  useAgentTown: jest.fn(),
}));

jest.mock("@/src/lib/api", () => ({
  formatApiError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
  getAuthToken: jest.fn(),
}));

const mockedUseRouter = useRouter as jest.Mock;
const mockedUseLocalSearchParams = useLocalSearchParams as jest.Mock;
const mockedUseAgentTown = useAgentTown as jest.Mock;
const mockedGetAuthToken = getAuthToken as jest.Mock;

const mockBack = jest.fn();
const mockedFetch = jest.fn();
let fetchSpy: jest.SpyInstance | null = null;

function makeResponse(payload: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  });
}

function buildTask(id: string, title: string) {
  return {
    id,
    title,
    assignee: "AgentTown",
    priority: "Medium",
    status: "Pending",
  };
}

describe("ChatTasksScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseRouter.mockReturnValue({ back: mockBack });
    mockedUseLocalSearchParams.mockReturnValue({});
    mockedUseAgentTown.mockReturnValue({ language: "en" });
    mockedGetAuthToken.mockReturnValue("token_test");
    mockedFetch.mockReset();
    if (typeof global.fetch === "function") {
      fetchSpy = jest.spyOn(global, "fetch").mockImplementation(mockedFetch as typeof fetch);
      return;
    }
    Object.defineProperty(global, "fetch", {
      value: mockedFetch,
      writable: true,
      configurable: true,
    });
    fetchSpy = null;
  });

  afterEach(() => {
    fetchSpy?.mockRestore();
    fetchSpy = null;
  });

  it("loads first page with expected pagination params", async () => {
    mockedFetch.mockResolvedValueOnce(makeResponse([buildTask("task_1", "Initial Task")]));

    render(<ChatTasksScreen />);

    await waitFor(() => {
      expect(screen.getByText("Initial Task")).toBeTruthy();
    });

    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(mockedFetch).toHaveBeenCalledWith(
      expect.stringContaining(`${getApiBaseUrl()}/v1/tasks?limit=20&page=1&offset=0`),
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer token_test",
        }),
      })
    );
  });

  it("renders all tasks returned by backend response", async () => {
    mockedFetch.mockResolvedValueOnce(
      makeResponse([
        {
          id: "task_self",
          title: "My Task",
          assignee: "AgentTown",
          priority: "Medium",
          status: "Pending",
          ownerId: "user_1",
        },
        {
          id: "task_other",
          title: "Other User Task",
          assignee: "Other",
          priority: "Medium",
          status: "Pending",
        },
      ])
    );

    render(<ChatTasksScreen />);

    await waitFor(() => {
      expect(screen.getByText("My Task")).toBeTruthy();
    });
    expect(screen.getByText("Other User Task")).toBeTruthy();
  });

  it("supports pull-to-refresh and replaces list content", async () => {
    mockedFetch
      .mockResolvedValueOnce(makeResponse([buildTask("task_1", "Old Task")]))
      .mockResolvedValueOnce(makeResponse([buildTask("task_2", "Refreshed Task")]));

    render(<ChatTasksScreen />);

    await waitFor(() => {
      expect(screen.getByText("Old Task")).toBeTruthy();
    });

    const list = screen.getByTestId("chat-tasks-list");
    await act(async () => {
      await list.props.refreshControl.props.onRefresh();
    });

    await waitFor(() => {
      expect(screen.getByText("Refreshed Task")).toBeTruthy();
    });
    expect(screen.queryByText("Old Task")).toBeNull();
    expect(mockedFetch).toHaveBeenCalledTimes(2);
    expect(mockedFetch.mock.calls[1]?.[0]).toContain("page=1&offset=0");
  });

  it("sends chat target params for backend filtering", async () => {
    mockedUseLocalSearchParams.mockReturnValue({
      threadId: "thread_match",
      threadName: "Current Chat",
      sourceSessionId: "thread_match",
      targetType: "user",
      targetId: "user_2",
      chatUserId: "user_2",
    });
    mockedFetch.mockResolvedValueOnce(makeResponse([buildTask("task_match_1", "Thread Matched Task")]));

    render(<ChatTasksScreen />);

    await waitFor(() => {
      expect(screen.getByText("Thread Matched Task")).toBeTruthy();
    });
    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(mockedFetch.mock.calls[0]?.[0]).toContain("page=1&offset=0");
    expect(mockedFetch.mock.calls[0]?.[0]).toContain("chatUserId=user_2");
    expect(mockedFetch.mock.calls[0]?.[0]).not.toContain("threadId=thread_match");
    expect(mockedFetch.mock.calls[0]?.[0]).not.toContain("sourceSessionId=thread_match");
    expect(mockedFetch.mock.calls[0]?.[0]).not.toContain("targetType=user");
    expect(mockedFetch.mock.calls[0]?.[0]).not.toContain("targetId=user_2");
  });

  it("supports infinite loading and appends next page", async () => {
    const firstPage = Array.from({ length: 20 }, (_, idx) => buildTask(`task_${idx + 1}`, `Task ${idx + 1}`));
    mockedFetch
      .mockResolvedValueOnce(makeResponse(firstPage))
      .mockResolvedValueOnce(makeResponse([buildTask("task_21", "Task 21")]));

    render(<ChatTasksScreen />);

    await waitFor(() => {
      expect(screen.getByText("Task 1")).toBeTruthy();
    });

    const list = screen.getByTestId("chat-tasks-list");
    await act(async () => {
      await list.props.onEndReached();
    });

    await waitFor(() => {
      expect(mockedFetch).toHaveBeenCalledTimes(2);
    });
    const updatedList = screen.getByTestId("chat-tasks-list");
    expect(updatedList.props.data).toHaveLength(21);
    expect(mockedFetch.mock.calls[1]?.[0]).toContain("page=2&offset=20");
  });

  it("marks task as done when pressing complete button", async () => {
    mockedFetch
      .mockResolvedValueOnce(makeResponse([buildTask("task_1", "Need Completion")]))
      .mockResolvedValueOnce(
        makeResponse({
          id: "task_1",
          title: "Need Completion",
          assignee: "AgentTown",
          priority: "Medium",
          status: "Done",
        })
      );

    render(<ChatTasksScreen />);

    await waitFor(() => {
      expect(screen.getByText("Need Completion")).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId("chat-task-complete-task_1"));

    await waitFor(() => {
      expect(screen.getByText("Completed")).toBeTruthy();
    });
    expect(mockedFetch).toHaveBeenCalledTimes(2);
    expect(mockedFetch).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("/v1/tasks/task_1"),
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ status: "Done" }),
      })
    );
  });

  it("renders empty state when no tasks are returned", async () => {
    mockedFetch.mockResolvedValueOnce(makeResponse([]));

    render(<ChatTasksScreen />);

    await waitFor(() => {
      expect(screen.getByText("No tasks")).toBeTruthy();
    });
  });

  it("does not trigger append request when list is empty", async () => {
    mockedFetch.mockResolvedValueOnce(makeResponse([]));

    render(<ChatTasksScreen />);

    await waitFor(() => {
      expect(screen.getByText("No tasks")).toBeTruthy();
    });

    const list = screen.getByTestId("chat-tasks-list");
    await act(async () => {
      await list.props.onEndReached();
    });

    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });
});
