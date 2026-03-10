import React from "react";
import { StyleSheet, View } from "react-native";

import { useAgentTown } from "@/src/state/agenttown-context";

export function KeyframeBackground({ children }: { children: React.ReactNode }) {
  const { uiTheme } = useAgentTown();
  const isNeo = uiTheme === "neo";

  return (
    <View style={[styles.root, !isNeo && styles.rootClassic]}>
      <View pointerEvents="none" style={[styles.blob, isNeo ? styles.blobBlue : styles.blobBlueClassic]} />
      <View pointerEvents="none" style={[styles.blob, isNeo ? styles.blobPurple : styles.blobPurpleClassic]} />
      <View pointerEvents="none" style={[styles.blob, isNeo ? styles.blobPink : styles.blobPinkClassic]} />
      <View pointerEvents="none" style={[styles.vignette, !isNeo && styles.vignetteClassic]} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#070a14",
  },
  rootClassic: {
    backgroundColor: "#eef4ff",
  },
  blob: {
    position: "absolute",
    width: 440,
    height: 440,
    borderRadius: 440,
    opacity: 0.55,
  },
  blobBlue: {
    top: -170,
    left: -170,
    backgroundColor: "rgba(59,130,246,0.35)",
  },
  blobBlueClassic: {
    top: -170,
    left: -170,
    backgroundColor: "rgba(96,165,250,0.24)",
  },
  blobPurple: {
    top: 140,
    right: -220,
    backgroundColor: "rgba(139,92,246,0.28)",
  },
  blobPurpleClassic: {
    top: 120,
    right: -220,
    backgroundColor: "rgba(167,139,250,0.16)",
  },
  blobPink: {
    bottom: -220,
    left: -170,
    backgroundColor: "rgba(236,72,153,0.22)",
  },
  blobPinkClassic: {
    bottom: -220,
    left: -170,
    backgroundColor: "rgba(244,114,182,0.14)",
  },
  vignette: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(0,0,0,0.22)",
  },
  vignetteClassic: {
    backgroundColor: "rgba(255,255,255,0.08)",
  },
});
