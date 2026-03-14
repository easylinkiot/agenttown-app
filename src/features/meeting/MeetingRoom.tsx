import React from "react";
import { Platform } from "react-native";

import { MeetingRuntimeSession } from "@/src/types";
import { MeetingRoom as WebMeetingRoom } from "@/src/features/meeting/MeetingRoom.web";

type Props = {
  session: MeetingRuntimeSession;
  onLocalLeave: () => void;
};

export function MeetingRoom(props: Props) {
  if (Platform.OS === "web") {
    return <WebMeetingRoom {...props} />;
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const NativeMeetingRoom = require("@/src/features/meeting/MeetingRoom.native").MeetingRoom as (nativeProps: Props) => React.JSX.Element;
  return <NativeMeetingRoom {...props} />;
}
