import "react-native-gesture-handler";

import { Stack, useRouter, useSegments } from "expo-router";
import React, { useEffect } from "react";
import { ActivityIndicator, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { APP_SAFE_AREA_EDGES } from "@/src/constants/safe-area";
import { AgentTownProvider } from "@/src/state/agenttown-context";
import { AuthProvider, useAuth } from "@/src/state/auth-context";

export { ErrorBoundary } from "expo-router";

function RootStack() {
  const router = useRouter();
  const segments = useSegments();
  const { isHydrated, isSignedIn } = useAuth();

  useEffect(() => {
    if (!isHydrated) return;
    const firstSegment = String(segments[0] || "");
    const inPublicRoute =
      firstSegment === "sign-in" ||
      firstSegment === "sign-up" ||
      firstSegment === "forgot-password" ||
      firstSegment === "friend-qr";
    const inAuthOnlyRoute =
      firstSegment === "sign-in" ||
      firstSegment === "sign-up" ||
      firstSegment === "forgot-password";
    if (!isSignedIn && !inPublicRoute) {
      router.replace("/sign-in");
      return;
    }
    if (isSignedIn && inAuthOnlyRoute) {
      router.replace("/");
    }
  }, [isHydrated, isSignedIn, router, segments]);

  if (!isHydrated) {
    return (
      <SafeAreaView edges={APP_SAFE_AREA_EDGES} style={styles.loadingWrap}>
        <ActivityIndicator size="large" color="#2563eb" />
      </SafeAreaView>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#070a14" },
        animation: "slide_from_right",
      }}
    >
      <Stack.Screen name="sign-in" options={{ animation: "fade" }} />
      <Stack.Screen name="sign-up" options={{ animation: "fade" }} />
      <Stack.Screen name="forgot-password" options={{ animation: "fade" }} />
      <Stack.Screen name="friend-qr" options={{ animation: "fade" }} />
      <Stack.Screen
        name="friend-qr-scanner"
        options={{
          presentation: "transparentModal",
          animation: "slide_from_bottom",
          gestureDirection: "vertical",
          contentStyle: { backgroundColor: "transparent" },
        }}
      />
      <Stack.Screen name="index" />
      <Stack.Screen name="chat/[id]" />
      <Stack.Screen name="ai-chat" />
      <Stack.Screen name="npc-chat/[npcId]" />
      <Stack.Screen name="npc-create" />
      <Stack.Screen name="npc-config/[npcId]" />
      <Stack.Screen name="chat/tasks" />
      <Stack.Screen
        name="chat/media-picker"
        options={{
          presentation: "transparentModal",
          animation: "slide_from_bottom",
          gestureDirection: "vertical",
          contentStyle: { backgroundColor: "transparent" },
        }}
      />
      <Stack.Screen name="tasks" />
      <Stack.Screen name="agents" />
      <Stack.Screen name="groups" />
      <Stack.Screen name="miniapps" />
      <Stack.Screen name="miniapp/[id]" />
      <Stack.Screen name="config" />
      <Stack.Screen name="entity-config" />
      <Stack.Screen name="town-map" />
      <Stack.Screen name="living-room" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <AgentTownProvider>
        <RootStack />
      </AgentTownProvider>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#070a14",
  },
});
