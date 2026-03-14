import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter, useSegments } from "expo-router";

import { getMeetingThreadRoute } from "@/src/features/meeting/meeting-helpers";
import { useAgentTown } from "@/src/state/agenttown-context";

export function MeetingCoordinator() {
  const router = useRouter();
  const segments = useSegments();
  const {
    chatThreads,
    incomingMeetingSession,
    activeMeetingSession,
    acceptMeeting,
    rejectMeeting,
  } = useAgentTown();
  const [busyAction, setBusyAction] = useState<"accept" | "reject" | "">("");
  const lastActiveThreadIdRef = useRef("");
  const lastRoutedMeetingIdRef = useRef("");
  const isMeetingRoute = String(segments[0] || "") === "meeting";
  const currentMeetingId = isMeetingRoute ? String(segments[1] || "") : "";

  const incomingThread = useMemo(
    () => chatThreads.find((thread) => thread.id === incomingMeetingSession?.threadId),
    [chatThreads, incomingMeetingSession?.threadId]
  );

  useEffect(() => {
    if (activeMeetingSession?.threadId) {
      lastActiveThreadIdRef.current = activeMeetingSession.threadId;
    }
  }, [activeMeetingSession?.threadId]);

  useEffect(() => {
    if (!activeMeetingSession?.id) return;
    if (currentMeetingId === activeMeetingSession.id) {
      lastRoutedMeetingIdRef.current = activeMeetingSession.id;
      return;
    }
    if (lastRoutedMeetingIdRef.current === activeMeetingSession.id) return;
    lastRoutedMeetingIdRef.current = activeMeetingSession.id;
    router.replace(`/meeting/${activeMeetingSession.id}` as never);
  }, [activeMeetingSession?.id, currentMeetingId, router]);

  useEffect(() => {
    if (activeMeetingSession) return;
    lastRoutedMeetingIdRef.current = "";
    if (!isMeetingRoute) return;

    const fallbackThread = chatThreads.find((thread) => thread.id === lastActiveThreadIdRef.current);
    router.replace(getMeetingThreadRoute(fallbackThread) as never);
  }, [activeMeetingSession, chatThreads, isMeetingRoute, router]);

  const handleAccept = useCallback(async () => {
    if (!incomingMeetingSession?.id || busyAction) return;
    setBusyAction("accept");
    await acceptMeeting(incomingMeetingSession.id);
    setBusyAction("");
  }, [acceptMeeting, busyAction, incomingMeetingSession?.id]);

  const handleReject = useCallback(async () => {
    if (!incomingMeetingSession?.id || busyAction) return;
    setBusyAction("reject");
    await rejectMeeting(incomingMeetingSession.id);
    setBusyAction("");
  }, [busyAction, incomingMeetingSession?.id, rejectMeeting]);

  return (
    <Modal
      animationType="fade"
      visible={Boolean(incomingMeetingSession && !activeMeetingSession && !isMeetingRoute)}
      transparent
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.kicker}>{incomingMeetingSession?.mode === "audio" ? "Audio Call" : "Video Call"}</Text>
          <Text style={styles.title} numberOfLines={1}>
            {incomingThread?.name || "Incoming call"}
          </Text>
          <Text style={styles.subtitle}>Incoming call request</Text>
          <View style={styles.actions}>
            <Pressable
              style={[styles.button, styles.secondaryButton, busyAction !== "" && styles.buttonDisabled]}
              onPress={handleReject}
              disabled={busyAction !== ""}
            >
              {busyAction === "reject" ? <ActivityIndicator color="#e2e8f0" /> : <Text style={styles.secondaryText}>Reject</Text>}
            </Pressable>
            <Pressable
              style={[styles.button, styles.primaryButton, busyAction !== "" && styles.buttonDisabled]}
              onPress={handleAccept}
              disabled={busyAction !== ""}
            >
              {busyAction === "accept" ? <ActivityIndicator color="#eff6ff" /> : <Text style={styles.primaryText}>Accept</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(2,6,23,0.72)",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 28,
    backgroundColor: "#08111f",
    paddingHorizontal: 22,
    paddingVertical: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(148,163,184,0.3)",
    gap: 8,
  },
  kicker: {
    color: "#93c5fd",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  title: {
    color: "#f8fafc",
    fontSize: 24,
    fontWeight: "800",
  },
  subtitle: {
    color: "#cbd5e1",
    fontSize: 14,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
  },
  button: {
    flex: 1,
    minHeight: 48,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButton: {
    backgroundColor: "#16a34a",
  },
  secondaryButton: {
    backgroundColor: "rgba(248,113,113,0.2)",
  },
  buttonDisabled: {
    opacity: 0.72,
  },
  primaryText: {
    color: "#f8fafc",
    fontSize: 14,
    fontWeight: "700",
  },
  secondaryText: {
    color: "#fecaca",
    fontSize: 14,
    fontWeight: "700",
  },
});
