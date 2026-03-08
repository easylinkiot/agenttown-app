import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { useRouter } from "expo-router";
import React from "react";
import { Alert } from "react-native";

import * as ImagePicker from "expo-image-picker";

import { uploadFileV2 } from "@/src/lib/api";
import { useAgentTown } from "@/src/state/agenttown-context";
import AgentsScreen from "../../app/agents";

jest.mock("expo-router", () => ({
  useRouter: jest.fn(),
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
  const { Text, View } = jest.requireActual("react-native");
  return {
    EmptyState: ({ title, hint }: { title?: string; hint?: string }) => (
      <View>
        <Text>{title || ""}</Text>
        <Text>{hint || ""}</Text>
      </View>
    ),
    LoadingSkeleton: () => <Text>Loading</Text>,
    StateBanner: ({ title, message }: { title?: string; message?: string }) => (
      <View>
        <Text>{title || ""}</Text>
        <Text>{message || ""}</Text>
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
  uploadFileV2: jest.fn(),
}));

jest.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

const mockedUseRouter = useRouter as jest.Mock;
const mockedUseAgentTown = useAgentTown as jest.Mock;
const mockedUploadFileV2 = uploadFileV2 as jest.Mock;
const mockedRequestMediaLibraryPermissionsAsync =
  ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock;
const mockedLaunchImageLibraryAsync = ImagePicker.launchImageLibraryAsync as jest.Mock;

describe("AgentsScreen avatar upload", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseRouter.mockReturnValue({ back: jest.fn() });
    mockedUseAgentTown.mockReturnValue({
      agents: [],
      skillCatalog: [],
      customSkills: [],
      language: "en",
      bootstrapReady: true,
      createAgent: jest.fn(),
      toggleAgentSkill: jest.fn(),
      createCustomSkill: jest.fn(),
      patchCustomSkill: jest.fn(),
      removeCustomSkill: jest.fn(),
      executeCustomSkill: jest.fn(),
    });
    jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("uploads a bot avatar from photo library and marks it selected", async () => {
    mockedRequestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true });
    mockedLaunchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: "file:///tmp/avatar.png",
          fileName: "avatar.png",
          mimeType: "image/png",
        },
      ],
    });
    mockedUploadFileV2.mockResolvedValue({
      url: "https://cdn.example.com/avatar.png",
    });

    render(<AgentsScreen />);

    fireEvent.press(screen.getByTestId("agents-open-create-modal-button"));
    expect(screen.getByTestId("agents-create-modal")).toBeTruthy();

    fireEvent.press(screen.getByTestId("agents-avatar-upload-button"));

    await waitFor(() => {
      expect(mockedRequestMediaLibraryPermissionsAsync).toHaveBeenCalledTimes(1);
      expect(mockedLaunchImageLibraryAsync).toHaveBeenCalledTimes(1);
      expect(mockedUploadFileV2).toHaveBeenCalledWith({
        uri: "file:///tmp/avatar.png",
        name: "avatar.png",
        mimeType: "image/png",
      });
    });

    expect(await screen.findByText("Selected")).toBeTruthy();
    expect(screen.queryByText("No file chosen")).toBeNull();
  });

  it("shows a permission alert when photo library access is denied", async () => {
    mockedRequestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: false });

    render(<AgentsScreen />);

    fireEvent.press(screen.getByTestId("agents-open-create-modal-button"));
    fireEvent.press(screen.getByTestId("agents-avatar-upload-button"));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        "Media library permission required",
        "Allow photo-library access before choosing an avatar."
      );
    });
    expect(mockedLaunchImageLibraryAsync).not.toHaveBeenCalled();
    expect(mockedUploadFileV2).not.toHaveBeenCalled();
  });
});
