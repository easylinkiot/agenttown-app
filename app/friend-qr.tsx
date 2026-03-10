import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { KeyframeBackground } from "@/src/components/KeyframeBackground";
import { StateBanner } from "@/src/components/StateBlocks";
import { APP_SAFE_AREA_EDGES } from "@/src/constants/safe-area";
import { tx } from "@/src/i18n/translate";
import { extractFriendQrToken, formatApiError, scanFriendQR } from "@/src/lib/api";
import { useAgentTown } from "@/src/state/agenttown-context";
import { useAuth } from "@/src/state/auth-context";

export default function FriendQrScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string }>();
  const { language, refreshAll } = useAgentTown();
  const { isHydrated, isSignedIn } = useAuth();
  const tr = useCallback((zh: string, en: string) => tx(language, zh, en), [language]);
  const goToSignIn = useCallback(() => {
    const encodedToken = typeof params.token === "string" ? params.token : "";
    router.replace({
      pathname: "/sign-in",
      params: {
        redirect: `/friend-qr?token=${encodeURIComponent(encodedToken)}`,
      },
    });
  }, [params.token, router]);

  const token = useMemo(() => extractFriendQrToken(typeof params.token === "string" ? params.token : ""), [params.token]);
  const [status, setStatus] = useState<"idle" | "working" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!isHydrated) return;
    if (!token) {
      setStatus("error");
      setMessage(tr("二维码无效或已损坏。", "The QR code is invalid or corrupted."));
      return;
    }
    if (!isSignedIn) {
      setStatus("error");
      setMessage(tr("请先登录 UsChat，再重新扫码添加好友。", "Please sign in to UsChat and scan again."));
      return;
    }
    if (status !== "idle") return;

    let cancelled = false;
    setStatus("working");
    void (async () => {
      try {
        const created = await scanFriendQR({ token });
        await refreshAll();
        if (cancelled) return;
        setStatus("done");
        setMessage(
          created?.mode === "friend"
            ? tr("好友已添加成功。", "Friend added successfully.")
            : tr("邀请已发送，等待对方接受。", "Invite sent. Waiting for acceptance.")
        );
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setMessage(formatApiError(err));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isHydrated, isSignedIn, refreshAll, status, token, tr]);

  return (
    <KeyframeBackground>
      <SafeAreaView edges={APP_SAFE_AREA_EDGES} style={styles.safeArea}>
        <View style={styles.container}>
          <Pressable style={styles.backBtn} onPress={() => router.replace("/")}>
            <Ionicons name="chevron-back" size={18} color="#e2e8f0" />
          </Pressable>

          <View style={styles.card}>
            <View style={styles.iconWrap}>
              {status === "working" ? (
                <ActivityIndicator size="large" color="#93c5fd" />
              ) : (
                <Ionicons
                  name={status === "done" ? "checkmark-circle" : status === "error" ? "alert-circle" : "qr-code-outline"}
                  size={36}
                  color={status === "done" ? "#86efac" : status === "error" ? "#fca5a5" : "#93c5fd"}
                />
              )}
            </View>
            <Text style={styles.title}>{tr("处理好友二维码", "Processing Friend QR")}</Text>
            <Text style={styles.message}>
              {status === "working"
                ? tr("正在处理好友邀请...", "Processing the friend invite...")
                : message || tr("准备中...", "Preparing...")}
            </Text>

            {status === "error" ? (
              <StateBanner
                variant="error"
                title={tr("无法完成添加", "Unable to add friend")}
                message={message || tr("请稍后重试。", "Please try again later.")}
              />
            ) : null}

            {!isSignedIn ? (
              <Pressable style={styles.secondaryBtn} onPress={goToSignIn}>
                <Text style={styles.secondaryBtnText}>{tr("先去登录", "Sign in first")}</Text>
              </Pressable>
            ) : null}

            <Pressable style={styles.primaryBtn} onPress={() => router.replace("/")}>
              <Text style={styles.primaryBtnText}>{tr("返回首页", "Back to Home")}</Text>
            </Pressable>
          </View>
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
    paddingHorizontal: 18,
    paddingTop: 12,
    gap: 16,
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
  card: {
    marginTop: 48,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(15,23,42,0.72)",
    padding: 20,
    gap: 14,
    alignItems: "center",
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,23,42,0.9)",
  },
  title: {
    color: "#e2e8f0",
    fontSize: 18,
    fontWeight: "900",
  },
  message: {
    color: "rgba(191,219,254,0.95)",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  primaryBtn: {
    alignSelf: "stretch",
    minHeight: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#bfdbfe",
  },
  secondaryBtn: {
    alignSelf: "stretch",
    minHeight: 46,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(147,197,253,0.45)",
    backgroundColor: "rgba(15,23,42,0.52)",
  },
  secondaryBtnText: {
    color: "#dbeafe",
    fontSize: 15,
    fontWeight: "800",
  },
  primaryBtnText: {
    color: "#0b1220",
    fontSize: 15,
    fontWeight: "900",
  },
});
