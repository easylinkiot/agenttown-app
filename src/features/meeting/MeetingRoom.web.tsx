import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { MeetingRuntimeSession } from "@/src/types";

export function MeetingRoom({ session }: { session: MeetingRuntimeSession; onLocalLeave: () => void }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Native call screen only</Text>
      <Text style={styles.body}>
        {session.mode === "audio" ? "Audio" : "Video"} calls are wired for iOS and Android. Web keeps the route stable
        so exports continue to build.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#020817",
    gap: 8,
  },
  title: {
    color: "#f8fafc",
    fontSize: 22,
    fontWeight: "800",
  },
  body: {
    color: "#cbd5e1",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
});
