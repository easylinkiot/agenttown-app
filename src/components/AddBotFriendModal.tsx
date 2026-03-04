import { Ionicons } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { tx } from "@/src/i18n/translate";
import { AVATAR_PRESETS } from "@/src/constants/avatars";
import { AppLanguage, ChatThread, UiTheme } from "@/src/types";

interface AddBotFriendModalProps {
  visible: boolean;
  accentColor: string;
  theme?: UiTheme;
  language?: AppLanguage;
  onClose: () => void;
  onAdd: (thread: ChatThread) => void;
}

function randomAvatar() {
  return AVATAR_PRESETS[Math.floor(Math.random() * AVATAR_PRESETS.length)];
}

export function AddBotFriendModal({
  visible,
  accentColor,
  theme = "classic",
  language = "en",
  onClose,
  onAdd,
}: AddBotFriendModalProps) {
  const isNeo = theme === "neo";
  const tr = (zh: string, en: string) => tx(language, zh, en);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [company, setCompany] = useState("");
  const [avatar, setAvatar] = useState(() => randomAvatar());
  const [chatMode, setChatMode] = useState<"human" | "group">("human");

  const summary = useMemo(() => {
    const rolePart = role.trim();
    const companyPart = company.trim();
    if (rolePart && companyPart) return `${rolePart} · ${companyPart}`;
    if (rolePart) return rolePart;
    if (companyPart) return companyPart;
    return language === "zh" ? "新联系人" : "New Contact";
  }, [company, language, role]);

  const reset = () => {
    setName("");
    setRole("");
    setCompany("");
    setAvatar(randomAvatar());
    setChatMode("human");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleAdd = () => {
    const safeName = name.trim();
    if (!safeName) return;

    const created: ChatThread = {
      id: `${chatMode}_${Date.now()}`,
      name: safeName,
      avatar,
      message: summary,
      time: "Now",
      isGroup: chatMode === "group",
      memberCount: chatMode === "group" ? 6 : undefined,
      supportsVideo: true,
    };
    onAdd(created);
    reset();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.card, isNeo && styles.cardNeo]}>
          <View style={[styles.header, isNeo && styles.headerNeo]}>
            <View style={styles.headerTitleWrap}>
              <View style={styles.iconBadge}>
                <Ionicons name="person-add-outline" size={14} color="white" />
              </View>
              <Text style={[styles.title, isNeo && styles.titleNeo]}>
                {tr("添加联系人 / 群聊", "Add Contact / Group")}
              </Text>
            </View>
            <Pressable style={styles.closeBtn} onPress={handleClose}>
              <Ionicons
                name="close"
                size={18}
                color={isNeo ? "rgba(255,255,255,0.85)" : "#475569"}
              />
            </Pressable>
          </View>

          <View style={styles.body}>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={tr("Bot 名称", "Bot name")}
              placeholderTextColor={isNeo ? "rgba(203,213,225,0.6)" : "#94a3b8"}
              style={[styles.input, isNeo && styles.inputNeo]}
            autoComplete="off"
            textContentType="oneTimeCode"
            importantForAutofill="no"
            />
            <TextInput
              value={role}
              onChangeText={setRole}
              placeholder={tr("角色（可选）", "Role (optional)")}
              placeholderTextColor={isNeo ? "rgba(203,213,225,0.6)" : "#94a3b8"}
              style={[styles.input, isNeo && styles.inputNeo]}
            autoComplete="off"
            textContentType="oneTimeCode"
            importantForAutofill="no"
            />
            <TextInput
              value={company}
              onChangeText={setCompany}
              placeholder={tr("公司（可选）", "Company (optional)")}
              placeholderTextColor={isNeo ? "rgba(203,213,225,0.6)" : "#94a3b8"}
              style={[styles.input, isNeo && styles.inputNeo]}
            autoComplete="off"
            textContentType="oneTimeCode"
            importantForAutofill="no"
            />
            <TextInput
              value={avatar}
              onChangeText={setAvatar}
              placeholder={tr("头像 URL", "Avatar URL")}
              placeholderTextColor={isNeo ? "rgba(203,213,225,0.6)" : "#94a3b8"}
              style={[styles.input, isNeo && styles.inputNeo]}
            autoComplete="off"
            textContentType="oneTimeCode"
            importantForAutofill="no"
            />

            <View style={styles.actionRow}>
              <Pressable
                style={[styles.secondaryBtn, isNeo && styles.secondaryBtnNeo]}
                onPress={() => setAvatar(randomAvatar())}
              >
                <Ionicons
                  name="shuffle-outline"
                  size={14}
                  color={isNeo ? "#e2e8f0" : "#1f2937"}
                />
                <Text style={[styles.secondaryBtnText, isNeo && styles.secondaryBtnTextNeo]}>
                  {tr("随机头像", "Random Avatar")}
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.secondaryBtn,
                  isNeo && styles.secondaryBtnNeo,
                  chatMode === "human" && styles.secondaryBtnActive,
                ]}
                onPress={() => setChatMode("human")}
              >
                <Ionicons
                  name="person-outline"
                  size={14}
                  color={isNeo ? "#e2e8f0" : "#1f2937"}
                />
                <Text style={[styles.secondaryBtnText, isNeo && styles.secondaryBtnTextNeo]}>
                  {tr("人类", "Human")}
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.secondaryBtn,
                  isNeo && styles.secondaryBtnNeo,
                  chatMode === "group" && styles.secondaryBtnActive,
                ]}
                onPress={() => setChatMode("group")}
              >
                <Ionicons
                  name="people-outline"
                  size={14}
                  color={isNeo ? "#e2e8f0" : "#1f2937"}
                />
                <Text style={[styles.secondaryBtnText, isNeo && styles.secondaryBtnTextNeo]}>
                  {tr("群聊", "Group")}
                </Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.footer}>
            <Pressable style={[styles.cancelBtn, isNeo && styles.cancelBtnNeo]} onPress={handleClose}>
              <Text style={[styles.cancelBtnText, isNeo && styles.cancelBtnTextNeo]}>
                {tr("取消", "Cancel")}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.addBtn, { backgroundColor: accentColor }]}
              onPress={handleAdd}
              disabled={!name.trim()}
            >
              <Ionicons name="add-circle-outline" size={14} color="white" />
              <Text style={styles.addBtnText}>{tr("添加好友", "Add Friend")}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(2,6,23,0.7)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.97)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.85)",
    overflow: "hidden",
  },
  cardNeo: {
    backgroundColor: "rgba(15,23,42,0.96)",
    borderColor: "rgba(255,255,255,0.14)",
  },
  header: {
    minHeight: 56,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(226,232,240,0.9)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerNeo: {
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  headerTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconBadge: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: "#0f172a",
    fontSize: 17,
    fontWeight: "800",
  },
  titleNeo: {
    color: "#f8fafc",
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    padding: 14,
    gap: 10,
  },
  input: {
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "white",
    paddingHorizontal: 12,
    color: "#1f2937",
    fontSize: 14,
  },
  inputNeo: {
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(2,6,23,0.45)",
    color: "#e2e8f0",
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
  },
  secondaryBtn: {
    flex: 1,
    minHeight: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  secondaryBtnNeo: {
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  secondaryBtnActive: {
    backgroundColor: "rgba(34,197,94,0.25)",
    borderColor: "rgba(34,197,94,0.45)",
  },
  secondaryBtnText: {
    color: "#1f2937",
    fontSize: 12,
    fontWeight: "700",
  },
  secondaryBtnTextNeo: {
    color: "#e2e8f0",
  },
  footer: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  cancelBtn: {
    flex: 1,
    minHeight: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnNeo: {
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  cancelBtnText: {
    color: "#1f2937",
    fontSize: 13,
    fontWeight: "700",
  },
  cancelBtnTextNeo: {
    color: "#e2e8f0",
  },
  addBtn: {
    flex: 1.4,
    minHeight: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  addBtnText: {
    color: "white",
    fontSize: 13,
    fontWeight: "700",
  },
});
