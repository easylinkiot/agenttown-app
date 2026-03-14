import React, { useEffect, useRef } from "react";

import { RealtimeKitProvider, useRealtimeKitClient, useRealtimeKitSelector } from "@cloudflare/realtimekit-react-native";
import { RtkMeeting, RtkUIProvider, RtkWaitingScreen } from "@cloudflare/realtimekit-react-native-ui";

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
  const [meeting, initMeeting] = useRealtimeKitClient();
  const initKeyRef = useRef("");

  useEffect(() => {
    const authToken = (session.authToken || "").trim();
    if (!authToken) return;

    const initKey = `${session.id}:${authToken}`;
    if (initKeyRef.current === initKey) return;
    initKeyRef.current = initKey;

    initMeeting({
      authToken,
      defaults: {
        audio: true,
        video: (session.mode || "").trim().toLowerCase() !== "audio",
      },
    });
  }, [initMeeting, session.authToken, session.id, session.mode]);

  return (
    <RealtimeKitProvider value={meeting}>
      <RtkUIProvider>
        {meeting ? (
          <>
            <MeetingLifecycleWatcher onLocalLeave={onLocalLeave} />
            <RtkMeeting meeting={meeting} showSetupScreen iOSScreenshareEnabled />
          </>
        ) : (
          <RtkWaitingScreen />
        )}
      </RtkUIProvider>
    </RealtimeKitProvider>
  );
}
