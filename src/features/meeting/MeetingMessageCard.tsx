import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { isActiveMeetingSession, isIncomingMeetingSession, isMeetingSessionTerminal } from "@/src/features/meeting/meeting-helpers";
import { MeetingRuntimeSession } from "@/src/types";

type TranslateFn = (zh: string, en: string) => string;

function getModeLabel(session: MeetingRuntimeSession, tr: TranslateFn) {
  return (session.mode || "").trim().toLowerCase() === "audio" ? tr("语音通话", "Audio call") : tr("视频通话", "Video call");
}

function getStatusLabel(session: MeetingRuntimeSession, tr: TranslateFn) {
  const status = (session.viewStatus || "").trim().toLowerCase();
  if (status === "ringing") return tr("等待接听", "Ringing");
  if (status === "connecting") return tr("正在连接", "Connecting");
  if (status === "in_call") return tr("通话中", "In call");
  if (status === "ended") return tr("通话已结束", "Ended");
  if (status === "unanswered") return tr("未接听", "Unanswered");
  if (status === "failed") return tr("通话失败", "Failed");
  if (status === "closed") return tr("已关闭", "Closed");
  return tr("通话更新", "Call update");
}

export function MeetingMessageCard({
  session,
  isMe,
  tr,
  onAccept,
  onReject,
  onJoin,
}: {
  session: MeetingRuntimeSession;
  isMe: boolean;
  tr: TranslateFn;
  onAccept?: () => void;
  onReject?: () => void;
  onJoin?: () => void;
}) {
  const incoming = isIncomingMeetingSession(session);
  const active = isActiveMeetingSession(session);
  const terminal = isMeetingSessionTerminal(session);

  return (
    <View style={[styles.card, isMe && styles.cardMe]}>
      <View style={styles.header}>
        <View style={[styles.iconWrap, isMe && styles.iconWrapMe]}>
          <Ionicons
            name={(session.mode || "").trim().toLowerCase() === "audio" ? "call-outline" : "videocam-outline"}
            size={16}
            color={isMe ? "#eff6ff" : "#bfdbfe"}
          />
        </View>
        <View style={styles.copy}>
          <Text style={[styles.title, isMe && styles.titleMe]}>{getModeLabel(session, tr)}</Text>
          <Text style={[styles.subtitle, isMe && styles.subtitleMe]}>{getStatusLabel(session, tr)}</Text>
        </View>
      </View>
      {!terminal ? (
        <View style={styles.actions}>
          {active && onJoin ? (
            <Pressable style={[styles.button, styles.buttonPrimary]} onPress={onJoin}>
              <Text style={styles.buttonPrimaryText}>{tr("进入", "Join")}</Text>
            </Pressable>
          ) : null}
          {incoming && onAccept ? (
            <Pressable style={[styles.button, styles.buttonPrimary]} onPress={onAccept}>
              <Text style={styles.buttonPrimaryText}>{tr("接听", "Accept")}</Text>
            </Pressable>
          ) : null}
          {session.rejectable && onReject ? (
            <Pressable style={[styles.button, styles.buttonSecondary]} onPress={onReject}>
              <Text style={styles.buttonSecondaryText}>
                {incoming ? tr("拒绝", "Reject") : tr("挂断", "Leave")}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 12,
    minWidth: 220,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(59,130,246,0.28)",
    backgroundColor: "rgba(15,23,42,0.92)",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  cardMe: {
    backgroundColor: "rgba(30,64,175,0.95)",
    borderColor: "rgba(191,219,254,0.35)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconWrap: {
    height: 32,
    width: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(37,99,235,0.22)",
  },
  iconWrapMe: {
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: "#eff6ff",
    fontSize: 14,
    fontWeight: "700",
  },
  titleMe: {
    color: "#ffffff",
  },
  subtitle: {
    color: "rgba(191,219,254,0.92)",
    fontSize: 12,
  },
  subtitleMe: {
    color: "rgba(219,234,254,0.95)",
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  button: {
    minHeight: 34,
    minWidth: 74,
    borderRadius: 999,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonPrimary: {
    backgroundColor: "#2563eb",
  },
  buttonSecondary: {
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  buttonPrimaryText: {
    color: "#eff6ff",
    fontSize: 12,
    fontWeight: "700",
  },
  buttonSecondaryText: {
    color: "#e2e8f0",
    fontSize: 12,
    fontWeight: "600",
  },
});
