import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { KeyframeBackground } from "@/src/components/KeyframeBackground";
import { APP_SAFE_AREA_EDGES } from "@/src/constants/safe-area";
import { getFriendAlias } from "@/src/features/friends/alias";
import { tx } from "@/src/i18n/translate";
import { useAgentTown } from "@/src/state/agenttown-context";
import { useAuth } from "@/src/state/auth-context";

type EntityType = "human" | "bot" | "npc";

function normalizeEntityType(raw: string): EntityType {
  const safe = (raw || "").trim().toLowerCase();
  if (safe === "bot") return "bot";
  if (safe === "npc") return "npc";
  return "human";
}

function isBotLikeName(name: string) {
  const safe = (name || "").trim();
  if (!safe) return false;
  return /\bbot\b/i.test(safe) || safe.includes("助理");
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value || "-"}</Text>
    </View>
  );
}

export default function EntityConfigScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    entityType?: string;
    entityId?: string;
    name?: string;
    avatar?: string;
  }>();

  const { user } = useAuth();
  const { friends, agents, botConfig, language, friendAliases, resolveFriendDisplayName, setFriendAlias } = useAgentTown();
  const tr = (zh: string, en: string) => tx(language, zh, en);

  const [friendAliasInput, setFriendAliasInput] = useState("");

  const entityType = normalizeEntityType(String(params.entityType || ""));
  const entityId = String(params.entityId || "").trim();
  const fallbackName = String(params.name || "").trim();
  const fallbackAvatar = String(params.avatar || "").trim();
  const currentUserId = (user?.id || "").trim();
  const isSelf = entityType === "human" && entityId !== "" && entityId === currentUserId;

  const friend = useMemo(
    () =>
      friends.find(
        (f) =>
          (entityId && ((f.id || "").trim() === entityId || (f.userId || "").trim() === entityId)) ||
          (fallbackName && (f.name || "").trim() === fallbackName)
      ) || null,
    [entityId, fallbackName, friends]
  );

  const agent = useMemo(
    () =>
      agents.find(
        (a) =>
          (entityId && (a.id || "").trim() === entityId) ||
          (fallbackName && (a.name || "").trim() === fallbackName)
      ) || null,
    [agents, entityId, fallbackName]
  );

  const resolvedName = useMemo(() => {
    if (isSelf) return (user?.displayName || "").trim() || tr("我", "Me");
    if (entityType === "human") {
      return resolveFriendDisplayName(friend, fallbackName || tr("未知用户", "Unknown user")).trim();
    }
    if (entityType === "bot" && entityId === "agent_mybot") return botConfig.name || "MyBot";
    if (entityType === "bot")
      return (friend?.name || agent?.name || fallbackName || tr("未知 Bot", "Unknown bot")).trim();
    return (agent?.name || fallbackName || tr("未知 NPC", "Unknown NPC")).trim();
  }, [
    agent?.name,
    botConfig.name,
    entityId,
    entityType,
    fallbackName,
    friend,
    isSelf,
    resolveFriendDisplayName,
    tr,
    user?.displayName,
  ]);

  const currentFriendAlias = useMemo(() => getFriendAlias(friendAliases, friend), [friend, friendAliases]);

  useEffect(() => {
    setFriendAliasInput(currentFriendAlias);
  }, [currentFriendAlias]);

  const resolvedAvatar = useMemo(() => {
    if (isSelf) return (user?.avatar || botConfig.avatar || "").trim();
    if (entityType === "bot" && entityId === "agent_mybot") return (botConfig.avatar || fallbackAvatar).trim();
    return (
      (friend?.avatar || agent?.avatar || fallbackAvatar || user?.avatar || botConfig.avatar || "").trim()
    );
  }, [
    agent?.avatar,
    botConfig.avatar,
    entityId,
    entityType,
    fallbackAvatar,
    friend?.avatar,
    isSelf,
    user?.avatar,
  ]);

  const resolvedTypeLabel = entityType === "human" ? "Human" : entityType === "bot" ? "Bot" : "NPC";
  const personaText =
    entityType === "bot" && entityId === "agent_mybot"
      ? botConfig.systemInstruction || tr("未设置", "Not set")
      : agent?.persona || agent?.description || tr("未设置", "Not set");
  const promptText =
    entityType === "bot" && entityId === "agent_mybot"
      ? botConfig.systemInstruction || tr("未设置", "Not set")
      : agent?.rolePrompt || tr("未设置", "Not set");
  const toolText =
    entityType === "bot" && entityId === "agent_mybot"
      ? (botConfig.installedSkillIds || []).join(", ") || tr("未安装", "Not installed")
      : (agent?.tools || []).join(", ") || tr("未安装", "Not installed");
  const skillText =
    entityType === "bot" && entityId === "agent_mybot"
      ? (botConfig.installedSkillIds || []).join(", ") || tr("未安装", "Not installed")
      : (agent?.installedSkillIds || []).join(", ") || tr("未安装", "Not installed");

  const inferredAsBot = entityType === "human" && isBotLikeName(resolvedName);

  return (
    <KeyframeBackground>
      <SafeAreaView edges={APP_SAFE_AREA_EDGES} style={styles.safeArea}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Pressable style={styles.backBtn} onPress={() => router.back()}>
              <Ionicons name="chevron-back" size={18} color="#e2e8f0" />
            </Pressable>
            <Text style={styles.headerTitle}>{tr("配置详情", "Configuration")}</Text>
            <View style={styles.headerSpacer} />
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
            <View style={styles.profileCard}>
              {resolvedAvatar ? (
                <Image source={{ uri: resolvedAvatar }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Ionicons name="person-outline" size={24} color="rgba(226,232,240,0.86)" />
                </View>
              )}
              <View style={styles.profileBody}>
                <Text style={styles.name}>{resolvedName}</Text>
                <View
                  style={[
                    styles.typeBadge,
                    entityType === "npc" ? styles.typeBadgeNpc : entityType === "bot" ? styles.typeBadgeBot : styles.typeBadgeHuman,
                  ]}
                >
                  <Text style={styles.typeBadgeText}>{inferredAsBot ? "Bot" : resolvedTypeLabel}</Text>
                </View>
              </View>
            </View>

            <View style={styles.card}>
              <Field label="ID" value={entityId || "-"} />
              {entityType === "human" ? (
                <>
                  {!isSelf ? <Field label={tr("账号名", "Account Name")} value={friend?.name || fallbackName || "-"} /> : null}
                  <Field label={tr("邮箱", "Email")} value={isSelf ? user?.email || "-" : "-"} />
                  <Field label={tr("电话", "Phone")} value={isSelf ? user?.phone || "-" : "-"} />
                  <Field label={tr("来源", "Provider")} value={isSelf ? user?.provider || "-" : tr("联系人", "Contact")} />
                </>
              ) : (
                <>
                  <Field label={tr("角色描述", "Persona")} value={personaText} />
                  <Field label={tr("系统提示词", "System Prompt")} value={promptText} />
                  <Field label={tr("工具", "Tools")} value={toolText} />
                  <Field label={tr("技能", "Skills")} value={skillText} />
                </>
              )}
            </View>

            {entityType === "human" && !isSelf && friend ? (
              <View style={styles.card}>
                <Field label={tr("你的备注名", "Your display name")} value={currentFriendAlias || tr("未设置", "Not set")} />
                <Text style={styles.aliasLabel}>{tr("显示名字", "Display Name")}</Text>
                <TextInput
                  style={styles.aliasInput}
                  value={friendAliasInput}
                  onChangeText={setFriendAliasInput}
                  placeholder={tr("例如：初中老师 / Jason from AWS", "For example: Middle school teacher / Jason from AWS")}
                  placeholderTextColor="rgba(148,163,184,0.82)"
                />
                <View style={styles.aliasActions}>
                  <Pressable
                    style={styles.secondaryBtn}
                    onPress={() => {
                      setFriendAliasInput("");
                      void setFriendAlias(friend, "");
                    }}
                  >
                    <Text style={styles.secondaryBtnText}>{tr("清除", "Clear")}</Text>
                  </Pressable>
                  <Pressable
                    style={styles.primaryBtn}
                    onPress={() => void setFriendAlias(friend, friendAliasInput)}
                  >
                    <Text style={styles.primaryBtnText}>{tr("保存备注", "Save Display Name")}</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            <View style={styles.actionRow}>
              {entityType === "human" && isSelf ? (
                <Pressable style={styles.primaryBtn} onPress={() => router.push("/config" as never)}>
                  <Text style={styles.primaryBtnText}>{tr("打开我的配置", "Open My Config")}</Text>
                </Pressable>
              ) : null}
              {entityType !== "human" ? (
                <Pressable style={styles.primaryBtn} onPress={() => router.push("/agents" as never)}>
                  <Text style={styles.primaryBtnText}>{tr("打开 Bot/NPC 配置", "Open Bot/NPC Config")}</Text>
                </Pressable>
              ) : null}
            </View>
          </ScrollView>
        </View>
      </SafeAreaView>
    </KeyframeBackground>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "transparent",
  },
  container: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    color: "#e2e8f0",
    fontSize: 20,
    fontWeight: "900",
  },
  headerSpacer: {
    width: 40,
    height: 40,
  },
  content: {
    gap: 12,
    paddingBottom: 18,
  },
  profileCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(15,23,42,0.62)",
    padding: 14,
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  avatar: {
    width: 58,
    height: 58,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  profileBody: {
    flex: 1,
    gap: 8,
  },
  name: {
    color: "#e2e8f0",
    fontSize: 18,
    fontWeight: "900",
  },
  typeBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  typeBadgeHuman: {
    borderColor: "rgba(191,219,254,0.45)",
    backgroundColor: "rgba(30,64,175,0.20)",
  },
  typeBadgeBot: {
    borderColor: "rgba(191,219,254,0.8)",
    backgroundColor: "rgba(37,99,235,0.8)",
  },
  typeBadgeNpc: {
    borderColor: "rgba(167,243,208,0.8)",
    backgroundColor: "rgba(15,118,110,0.8)",
  },
  typeBadgeText: {
    color: "#f8fafc",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(15,23,42,0.62)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
  },
  fieldRow: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 4,
  },
  fieldLabel: {
    color: "rgba(148,163,184,0.95)",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  fieldValue: {
    color: "#e2e8f0",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  aliasLabel: {
    color: "rgba(191,219,254,0.94)",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 4,
  },
  aliasInput: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(2,6,23,0.45)",
    color: "#e2e8f0",
    paddingHorizontal: 12,
    fontSize: 14,
    fontWeight: "600",
  },
  aliasActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
  },
  actionRow: {
    gap: 10,
  },
  secondaryBtn: {
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(15,23,42,0.62)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  secondaryBtnText: {
    color: "#e2e8f0",
    fontSize: 13,
    fontWeight: "800",
  },
  primaryBtn: {
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(191,219,254,0.52)",
    backgroundColor: "rgba(37,99,235,0.74)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  primaryBtnText: {
    color: "#f8fafc",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.2,
  },
});
