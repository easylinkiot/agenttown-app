import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useMemo } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { MeetingRoom } from "@/src/features/meeting/MeetingRoom";
import { getMeetingThreadRoute, isMeetingSessionTerminal } from "@/src/features/meeting/meeting-helpers";
import { useAgentTown } from "@/src/state/agenttown-context";

export default function MeetingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const meetingSessionId = String(params.id || "");
  const { chatThreads, meetingSessionsById, leaveMeeting } = useAgentTown();

  const session = meetingSessionsById[meetingSessionId] || null;
  const thread = useMemo(
    () => chatThreads.find((item) => item.id === session?.threadId),
    [chatThreads, session?.threadId]
  );

  const fallbackRoute = getMeetingThreadRoute(thread);

  const handleLeave = useCallback(async () => {
    if (session?.id && !isMeetingSessionTerminal(session)) {
      await leaveMeeting(session.id);
    }
    router.replace(fallbackRoute as never);
  }, [fallbackRoute, leaveMeeting, router, session]);

  const handleLocalLeave = useCallback(() => {
    if (!session?.id || isMeetingSessionTerminal(session)) return;
    void leaveMeeting(session.id);
  }, [leaveMeeting, session]);

  if (!session) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}>
          <Text style={styles.title}>Call unavailable</Text>
          <Pressable style={styles.leaveButton} onPress={() => router.replace(fallbackRoute as never)}>
            <Text style={styles.leaveText}>Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable style={styles.headerButton} onPress={handleLeave}>
          <Ionicons name="close" size={20} color="#e2e8f0" />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {thread?.name || "Meeting"}
          </Text>
          <Text style={styles.headerSubtitle}>
            {session.mode === "audio" ? "Audio call" : "Video call"}
          </Text>
        </View>
      </View>
      <View style={styles.body}>
        {(session.authToken || "").trim() ? (
          <MeetingRoom session={session} onLocalLeave={handleLocalLeave} />
        ) : (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#60a5fa" />
            <Text style={styles.title}>Connecting call</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#020817",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  headerButton: {
    height: 38,
    width: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  headerCopy: {
    flex: 1,
    gap: 2,
  },
  headerTitle: {
    color: "#f8fafc",
    fontSize: 16,
    fontWeight: "700",
  },
  headerSubtitle: {
    color: "#cbd5e1",
    fontSize: 12,
  },
  body: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 24,
  },
  title: {
    color: "#f8fafc",
    fontSize: 18,
    fontWeight: "700",
  },
  leaveButton: {
    minHeight: 40,
    minWidth: 96,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    backgroundColor: "#1d4ed8",
    paddingHorizontal: 18,
  },
  leaveText: {
    color: "#eff6ff",
    fontSize: 14,
    fontWeight: "700",
  },
});
