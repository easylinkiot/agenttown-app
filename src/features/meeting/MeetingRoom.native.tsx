import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import type RealtimeKitClient from "@cloudflare/realtimekit";

import { RealtimeKitProvider, useRealtimeKitSelector } from "@cloudflare/realtimekit-react-native";
import { RtkMeeting, RtkUIProvider } from "@cloudflare/realtimekit-react-native-ui";

import { buildMeetingClientInitKey, forgetMeetingClient, getOrInitMeetingClient } from "@/src/features/meeting/meeting-client";
import { MeetingRuntimeSession } from "@/src/types";

function MeetingLifecycleWatcher({ onLocalLeave }: { onLocalLeave: () => void }) {
  const roomJoined = useRealtimeKitSelector((meeting) => Boolean(meeting?.self.roomJoined));
  const roomState = useRealtimeKitSelector((meeting) => meeting?.self.roomState || "init");
  const joinedRef = useRef(false);
  const leaveNotifiedRef = useRef(false);

  useEffect(() => {
    if (roomJoined) {
      joinedRef.current = true;
    }
  }, [roomJoined]);

  useEffect(() => {
    if (!joinedRef.current || leaveNotifiedRef.current) return;
    if (
      roomState === "left" ||
      roomState === "ended" ||
      roomState === "disconnected" ||
      roomState === "failed" ||
      roomState === "rejected" ||
      roomState === "stageLeft" ||
      roomState === "kicked"
    ) {
      leaveNotifiedRef.current = true;
      onLocalLeave();
    }
  }, [onLocalLeave, roomState]);

  return null;
}

export function MeetingRoom({
  session,
  onLocalLeave,
}: {
  session: MeetingRuntimeSession;
  onLocalLeave: () => void;
}) {
  const [meeting, setMeeting] = useState<RealtimeKitClient | null>(null);
  const [initError, setInitError] = useState("");
  const loadedMeetingKeyRef = useRef("");
  const initKey = useMemo(
    () => buildMeetingClientInitKey({ id: session.id, authToken: session.authToken }),
    [session.authToken, session.id]
  );

  useEffect(() => {
    const authToken = (session.authToken || "").trim();
    if (!authToken || !initKey) {
      loadedMeetingKeyRef.current = "";
      setMeeting(null);
      setInitError("");
      return;
    }

    if (loadedMeetingKeyRef.current === initKey && meeting) return;

    let cancelled = false;
    setInitError("");
    setMeeting((current) => (loadedMeetingKeyRef.current === initKey ? current : null));

    void getOrInitMeetingClient(initKey, {
      authToken,
      defaults: {
        audio: true,
        video: (session.mode || "").trim().toLowerCase() !== "audio",
      },
    })
      .then((client) => {
        if (cancelled) return;
        loadedMeetingKeyRef.current = initKey;
        setMeeting(client);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        loadedMeetingKeyRef.current = "";
        forgetMeetingClient(initKey);
        setMeeting(null);
        setInitError(error instanceof Error ? error.message : "Call failed to initialize");
      });

    return () => {
      cancelled = true;
    };
  }, [initKey, meeting, session.authToken, session.mode]);

  const handleLocalLeave = useCallback(() => {
    forgetMeetingClient(initKey);
    onLocalLeave();
  }, [initKey, onLocalLeave]);

  if (!meeting) {
    return initError ? (
      <View style={styles.center}>
        <Text style={styles.title}>Unable to start call</Text>
        <Text style={styles.body}>{initError}</Text>
      </View>
    ) : (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#60a5fa" />
        <Text style={styles.title}>Starting call</Text>
        <Text style={styles.body}>Initializing audio session...</Text>
      </View>
    );
  }

  return (
    <RealtimeKitProvider value={meeting}>
      <RtkUIProvider>
        <MeetingLifecycleWatcher onLocalLeave={handleLocalLeave} />
        <RtkMeeting meeting={meeting} showSetupScreen iOSScreenshareEnabled />
      </RtkUIProvider>
    </RealtimeKitProvider>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 24,
    backgroundColor: "#020817",
  },
  title: {
    color: "#f8fafc",
    fontSize: 18,
    fontWeight: "700",
  },
  body: {
    color: "#cbd5e1",
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
});
