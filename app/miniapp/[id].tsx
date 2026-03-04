import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { KeyframeBackground } from "@/src/components/KeyframeBackground";
import { EmptyState, StateBanner } from "@/src/components/StateBlocks";
import { APP_SAFE_AREA_EDGES } from "@/src/constants/safe-area";
import { MiniAppRenderer } from "@/src/features/miniapps/MiniAppRenderer";
import { buildMiniAppViewModel } from "@/src/features/miniapps/model";
import { tx } from "@/src/i18n/translate";
import { formatApiError } from "@/src/lib/api";
import { useAgentTown } from "@/src/state/agenttown-context";

export default function MiniAppDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const { miniApps, language, installMiniApp, runMiniApp } = useAgentTown();
  const tr = (zh: string, en: string) => tx(language, zh, en);

  const app = useMemo(() => miniApps.find((item) => item.id === String(params.id || "")) || null, [miniApps, params.id]);

  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runtimeOutput, setRuntimeOutput] = useState("");

  if (!app) {
    return (
      <KeyframeBackground>
        <SafeAreaView edges={APP_SAFE_AREA_EDGES} style={styles.safeArea}>
          <View style={styles.container}>
            <Pressable style={styles.backBtn} onPress={() => router.back()}>
              <Ionicons name="chevron-back" size={18} color="#e2e8f0" />
            </Pressable>
            <EmptyState title={tr("Mini App 不存在", "Mini app not found")} hint={tr("请返回列表刷新后重试", "Go back and refresh list")} icon="alert-circle-outline" />
          </View>
        </SafeAreaView>
      </KeyframeBackground>
    );
  }

  const vm = buildMiniAppViewModel(app);

  return (
    <KeyframeBackground>
      <SafeAreaView edges={APP_SAFE_AREA_EDGES} style={styles.safeArea}>
        <View style={styles.container}>
          <View style={styles.headerRow}>
            <Pressable style={styles.backBtn} onPress={() => router.back()}>
              <Ionicons name="chevron-back" size={18} color="#e2e8f0" />
            </Pressable>
            <Text style={styles.title} numberOfLines={1}>{app.name}</Text>
            <Pressable
              style={styles.installBtn}
              onPress={() => void installMiniApp(app.id, !app.installed).catch((err) => setError(formatApiError(err)))}
            >
              <Text style={styles.installText}>{app.installed ? tr("卸载", "Uninstall") : tr("安装", "Install")}</Text>
            </Pressable>
          </View>

          {error ? (
            <StateBanner variant="error" title={tr("操作失败", "Action failed")} message={error} actionLabel={tr("关闭", "Dismiss")} onAction={() => setError(null)} />
          ) : null}

          <ScrollView contentContainerStyle={styles.scrollWrap} showsVerticalScrollIndicator={false}>
            <View style={styles.posterShell}>
              <View style={styles.posterHeroWrap}>
                <Image source={{ uri: vm.heroImage }} style={styles.posterHeroImage} />
                <View style={styles.posterHeroMask} />
                <View style={styles.posterHeroTextWrap}>
                  <View style={styles.posterBadge}>
                    <Ionicons name={vm.icon as keyof typeof Ionicons.glyphMap} size={12} color={vm.color} />
                    <Text style={styles.posterBadgeText}>{vm.uiType.replace("_", " ").toUpperCase()}</Text>
                  </View>
                  <Text style={styles.posterHeroTitle} numberOfLines={2}>{app.name}</Text>
                </View>
              </View>

              <View style={styles.posterBodyWrap}>
                <MiniAppRenderer app={app} />

                <View style={styles.divider} />
                <Text style={styles.posterNote}>
                  {tr("每日早晨 8 点更新，可随时手动刷新。", "Updates daily at 8AM, can be refreshed manually.")}
                </Text>

                <View style={styles.runCard}>
                  <Text style={styles.runTitle}>{tr("运行 Mini App", "Run Mini App")}</Text>
                  <TextInput
                    value={input}
                    onChangeText={setInput}
                    multiline
                    placeholder={tr("输入运行指令，例如：刷新今日数据", "Type run instruction, e.g. refresh today data")}
                    placeholderTextColor="rgba(100,116,139,0.90)"
                    style={styles.input}
                  autoComplete="off"
                  textContentType="oneTimeCode"
                  importantForAutofill="no"
                  />
                  <Pressable
                    style={[styles.runBtn, (!app.installed || running) && styles.runBtnDisabled]}
                    onPress={async () => {
                      if (!app.installed || running) return;
                      setRunning(true);
                      try {
                        const out = await runMiniApp(app.id, input.trim() || tr("执行一次标准流程", "Run a standard workflow"));
                        setRuntimeOutput(out || "");
                      } catch (err) {
                        setError(formatApiError(err));
                      } finally {
                        setRunning(false);
                      }
                    }}
                  >
                    <Ionicons name="play-outline" size={16} color="#ffffff" />
                    <Text style={styles.runBtnText}>{running ? tr("运行中...", "Running...") : tr("Run", "Run")}</Text>
                  </Pressable>

                  {runtimeOutput || vm.lastRunOutput ? (
                    <View style={styles.outputCard}>
                      <Text style={styles.outputTitle}>{tr("运行输出", "Output")}</Text>
                      <Text style={styles.outputText}>{runtimeOutput || vm.lastRunOutput}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </View>
          </ScrollView>
        </View>
      </SafeAreaView>
    </KeyframeBackground>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "transparent" },
  container: { flex: 1, paddingHorizontal: 14, paddingTop: 10, gap: 12 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
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
  title: {
    flex: 1,
    textAlign: "center",
    color: "#e2e8f0",
    fontSize: 16,
    fontWeight: "900",
  },
  installBtn: {
    minWidth: 64,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  installText: {
    color: "#e2e8f0",
    fontSize: 11,
    fontWeight: "900",
  },
  scrollWrap: {
    gap: 12,
    paddingBottom: 36,
  },
  posterShell: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "#f8fafc",
    overflow: "hidden",
  },
  posterHeroWrap: {
    height: 188,
    position: "relative",
  },
  posterHeroImage: {
    width: "100%",
    height: "100%",
  },
  posterHeroMask: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15,23,42,0.42)",
  },
  posterHeroTextWrap: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 14,
    gap: 10,
  },
  posterBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.90)",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  posterBadgeText: {
    color: "#0f172a",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  posterHeroTitle: {
    color: "#ffffff",
    fontSize: 38,
    fontWeight: "900",
    lineHeight: 42,
  },
  posterBodyWrap: {
    padding: 14,
    gap: 12,
    backgroundColor: "#f8fafc",
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(15,23,42,0.08)",
    marginTop: 2,
  },
  posterNote: {
    color: "rgba(15,23,42,0.55)",
    fontSize: 12,
    lineHeight: 16,
    fontStyle: "italic",
    fontWeight: "600",
  },
  runCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.10)",
    backgroundColor: "#ffffff",
    padding: 12,
    gap: 10,
  },
  runTitle: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "900",
  },
  input: {
    minHeight: 100,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.10)",
    backgroundColor: "#f8fafc",
    color: "#0f172a",
    fontSize: 13,
    lineHeight: 18,
    padding: 10,
  },
  runBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "#0f172a",
  },
  runBtnDisabled: {
    opacity: 0.55,
  },
  runBtnText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
  },
  outputCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(37,99,235,0.18)",
    backgroundColor: "rgba(219,234,254,0.75)",
    padding: 10,
    gap: 8,
  },
  outputTitle: {
    color: "#1e3a8a",
    fontSize: 12,
    fontWeight: "900",
  },
  outputText: {
    color: "#0f172a",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
});
