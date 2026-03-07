import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { KeyframeBackground } from "@/src/components/KeyframeBackground";
import { StateBanner } from "@/src/components/StateBlocks";
import { APP_SAFE_AREA_EDGES } from "@/src/constants/safe-area";
import { tx } from "@/src/i18n/translate";
import { createNPC, formatApiError } from "@/src/lib/api";
import { useAgentTown } from "@/src/state/agenttown-context";

const DEFAULT_MODEL_NAME = "gpt-4.1-mini";
const DEFAULT_SYSTEM_PROMPT = "You are a helpful demo npc.";

export default function NPCCreateScreen() {
  const router = useRouter();
  const { language } = useAgentTown();
  const tr = (zh: string, en: string) => tx(language, zh, en);

  const [name, setName] = useState("");
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const canSubmit = useMemo(
    () => name.trim().length > 0 && DEFAULT_MODEL_NAME.trim().length > 0 && systemPrompt.trim().length > 0 && !submitting,
    [name, submitting, systemPrompt]
  );

  const handleSubmit = async () => {
    if (!canSubmit) {
      Alert.alert(
        tr("信息不完整", "Incomplete"),
        tr("请填写完整的 NPC 名称与系统提示词。", "Please complete the NPC name and system prompt.")
      );
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      const created = await createNPC({
        name: name.trim(),
        model_name: DEFAULT_MODEL_NAME,
        system_prompt: systemPrompt.trim(),
      });
      router.replace({
        pathname: "/npc-config/[npcId]" as never,
        params: {
          npcId: created.id,
          entrySource: "create",
        } as never,
      });
    } catch (err) {
      setSubmitError(formatApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyframeBackground>
      <SafeAreaView edges={APP_SAFE_AREA_EDGES} style={styles.safeArea}>
        <View style={styles.container}>
          <View style={styles.headerRow}>
            <Pressable style={styles.backBtn} onPress={() => router.back()}>
              <Ionicons name="chevron-back" size={18} color="#e2e8f0" />
            </Pressable>
            <Text style={styles.title}>{tr("创建 NPC", "Create NPC")}</Text>
            <View style={styles.headerSpacer} />
          </View>

          {submitError ? (
            <StateBanner
              variant="error"
              title={tr("提交失败", "Submit failed")}
              message={submitError}
              actionLabel={tr("关闭", "Dismiss")}
              onAction={() => setSubmitError(null)}
            />
          ) : null}

          <KeyboardAvoidingView
            style={styles.body}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
          >
            <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled">
              <View style={styles.formCard}>
              <Text style={styles.formLabel}>{tr("Name *", "Name *")}</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder={tr("输入 NPC 名称", "Enter NPC name")}
                placeholderTextColor="rgba(148,163,184,0.88)"
                style={styles.input}
              />

              <Text style={styles.formLabel}>{tr("Model Name", "Model Name")}</Text>
              <TextInput value={DEFAULT_MODEL_NAME} editable={false} style={[styles.input, styles.inputReadonly]} />

              <Text style={styles.formLabel}>{tr("System Prompt *", "System Prompt *")}</Text>
              <TextInput
                value={systemPrompt}
                onChangeText={setSystemPrompt}
                multiline
                textAlignVertical="top"
                placeholder={DEFAULT_SYSTEM_PROMPT}
                placeholderTextColor="rgba(148,163,184,0.88)"
                style={[styles.input, styles.textarea]}
              />
              </View>
            </ScrollView>
          </KeyboardAvoidingView>

          <Pressable style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]} disabled={!canSubmit} onPress={handleSubmit}>
            {submitting ? (
              <ActivityIndicator size="small" color="#0b1220" />
            ) : (
              <Text style={styles.submitText}>{tr("提交", "Submit")}</Text>
            )}
          </Pressable>
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
    paddingBottom: 14,
    gap: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  title: {
    color: "#e2e8f0",
    fontSize: 16,
    fontWeight: "900",
  },
  headerSpacer: {
    width: 40,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingBottom: 16,
  },
  formCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(15,23,42,0.65)",
    padding: 16,
    gap: 10,
  },
  formLabel: {
    color: "rgba(191,219,254,0.95)",
    fontSize: 12,
    fontWeight: "800",
  },
  input: {
    minHeight: 46,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(2,6,23,0.45)",
    color: "#e2e8f0",
    paddingHorizontal: 14,
    fontSize: 14,
    fontWeight: "600",
  },
  inputReadonly: {
    color: "rgba(148,163,184,0.95)",
  },
  textarea: {
    minHeight: 144,
    paddingTop: 14,
    paddingBottom: 14,
  },
  submitBtn: {
    minHeight: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#bfdbfe",
  },
  submitBtnDisabled: {
    opacity: 0.45,
  },
  submitText: {
    color: "#0b1220",
    fontSize: 15,
    fontWeight: "900",
  },
});
