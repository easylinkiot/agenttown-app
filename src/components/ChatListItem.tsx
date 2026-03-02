import { Ionicons } from "@expo/vector-icons";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import { DEFAULT_MYBOT_AVATAR } from "@/src/constants/chat";
import { AppLanguage, ChatThread, UiTheme } from "@/src/types";

interface ChatListItemProps {
  chat: ChatThread;
  onPress: () => void;
  onAvatarPress?: (chat: ChatThread) => void;
  theme?: UiTheme;
  language?: AppLanguage;
}

function isBotLikeName(name: string) {
  const safe = (name || "").trim();
  if (!safe) return false;
  return /\bbot\b/i.test(safe) || safe.includes("助理");
}

function inferAvatarTag(chat: ChatThread): "NPC" | "Bot" | null {
  const id = (chat.id || "").trim().toLowerCase();
  const tag = (chat.tag || "").trim().toLowerCase();
  if (id === "mybot" || id.startsWith("agent_userbot_")) return "Bot";
  if (isBotLikeName(chat.name)) return "Bot";
  if (id.startsWith("agent_") || tag === "npc" || tag === "agent") return "NPC";
  return null;
}

function resolveAvatarUri(chat: ChatThread) {
  const avatar = (chat.avatar || "").trim();
  if (avatar) return avatar;
  const id = (chat.id || "").trim().toLowerCase();
  const name = (chat.name || "").trim().toLowerCase();
  if (id === "mybot" || id === "agent_mybot" || id.startsWith("agent_userbot_") || name === "mybot") {
    return DEFAULT_MYBOT_AVATAR;
  }
  return "";
}

export function ChatListItem({
  chat,
  onPress,
  onAvatarPress,
  theme = "classic",
  language = "en",
}: ChatListItemProps) {
  const isNeo = theme === "neo";
  const avatarTag = inferAvatarTag(chat);
  const avatarUri = resolveAvatarUri(chat);
  const preview = chat.isVoiceCall
    ? language === "zh"
      ? "[语音通话]"
      : "[Voice Call]"
    : chat.message;

  return (
    <Pressable
      testID={`chat-list-item-${chat.id}`}
      style={[styles.container, isNeo && styles.containerNeo]}
      onPress={onPress}
    >
      {onAvatarPress ? (
        <Pressable
          style={styles.avatarWrap}
          onPress={(e) => {
            e.stopPropagation?.();
            onAvatarPress(chat);
          }}
        >
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={[styles.avatar, isNeo && styles.avatarNeo]} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback, isNeo && styles.avatarNeo]}>
              <Ionicons name="person-outline" size={18} color="rgba(226,232,240,0.82)" />
            </View>
          )}
          {avatarTag ? (
            <View style={[styles.avatarTag, avatarTag === "NPC" ? styles.avatarTagNpc : styles.avatarTagBot]}>
              <Text style={styles.avatarTagText}>{avatarTag}</Text>
            </View>
          ) : null}
          {!!chat.unreadCount && (
            <View style={[styles.unreadBadge, isNeo && styles.unreadBadgeNeo]}>
              <Text style={styles.unreadText}>{chat.unreadCount}</Text>
            </View>
          )}
        </Pressable>
      ) : (
        <View style={styles.avatarWrap}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={[styles.avatar, isNeo && styles.avatarNeo]} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback, isNeo && styles.avatarNeo]}>
              <Ionicons name="person-outline" size={18} color="rgba(226,232,240,0.82)" />
            </View>
          )}
          {avatarTag ? (
            <View style={[styles.avatarTag, avatarTag === "NPC" ? styles.avatarTagNpc : styles.avatarTagBot]}>
              <Text style={styles.avatarTagText}>{avatarTag}</Text>
            </View>
          ) : null}
          {!!chat.unreadCount && (
            <View style={[styles.unreadBadge, isNeo && styles.unreadBadgeNeo]}>
              <Text style={styles.unreadText}>{chat.unreadCount}</Text>
            </View>
          )}
        </View>
      )}
      <View style={styles.body}>
        <View style={styles.rowTop}>
          <View style={styles.nameWrap}>
            {chat.isGroup ? (
              <Ionicons
                name="people"
                size={14}
                color={isNeo ? "rgba(226,232,240,0.75)" : "#64748b"}
              />
            ) : null}
            <Text style={[styles.name, isNeo && styles.nameNeo]} numberOfLines={1}>
              {chat.name}
            </Text>
            {chat.isGroup && chat.memberCount ? (
              <Text style={[styles.memberCount, isNeo && styles.memberCountNeo]}>
                {chat.memberCount}
              </Text>
            ) : null}
          </View>
          <Text style={[styles.time, isNeo && styles.timeNeo]}>{chat.time}</Text>
        </View>
        <Text
          style={[
            styles.message,
            chat.highlight && styles.highlight,
            isNeo && styles.messageNeo,
            isNeo && chat.highlight && styles.highlightNeo,
          ]}
          numberOfLines={1}
        >
          {chat.highlight && chat.unreadCount
            ? language === "zh"
              ? `[${chat.unreadCount} 条通知] `
              : `[${chat.unreadCount} notifications] `
            : ""}
          {preview}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
  },
  containerNeo: {
    borderBottomWidth: 0,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(15,23,42,0.55)",
  },
  avatarWrap: {
    position: "relative",
  },
  avatarTag: {
    position: "absolute",
    left: 6,
    right: 6,
    bottom: -7,
    height: 12,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarTagBot: {
    backgroundColor: "rgba(37,99,235,0.96)",
    borderColor: "rgba(191,219,254,0.78)",
  },
  avatarTagNpc: {
    backgroundColor: "rgba(15,118,110,0.96)",
    borderColor: "rgba(167,243,208,0.78)",
  },
  avatarTagText: {
    color: "#f8fafc",
    fontSize: 8,
    lineHeight: 9,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#d1d5db",
  },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(148,163,184,0.45)",
  },
  avatarNeo: {
    width: 46,
    height: 46,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  unreadBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#ef4444",
    borderWidth: 1,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  unreadBadgeNeo: {
    borderColor: "rgba(15,23,42,0.9)",
  },
  unreadText: {
    color: "white",
    fontSize: 10,
    fontWeight: "700",
  },
  body: {
    flex: 1,
    gap: 4,
  },
  rowTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  nameWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  name: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
    maxWidth: "84%",
  },
  nameNeo: {
    color: "#f8fafc",
  },
  memberCount: {
    fontSize: 11,
    color: "#64748b",
    fontWeight: "600",
  },
  memberCountNeo: {
    color: "rgba(148,163,184,0.95)",
  },
  time: {
    fontSize: 13,
    color: "#6b7280",
  },
  timeNeo: {
    color: "rgba(148,163,184,0.78)",
  },
  message: {
    fontSize: 14,
    color: "#4b5563",
  },
  messageNeo: {
    color: "rgba(203,213,225,0.74)",
  },
  highlight: {
    color: "#111827",
    fontWeight: "600",
  },
  highlightNeo: {
    color: "#60a5fa",
    fontWeight: "700",
  },
});
