import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { publishPendingFriendQrPayload } from "@/src/features/friends/friend-qr-scanner-bridge";
import { tx } from "@/src/i18n/translate";
import { extractFriendQrToken } from "@/src/lib/api";
import { useAgentTown } from "@/src/state/agenttown-context";

export default function FriendQrScannerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string }>();
  const insets = useSafeAreaInsets();
  const { language } = useAgentTown();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [scannerLocked, setScannerLocked] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const tr = useCallback((zh: string, en: string) => tx(language, zh, en), [language]);
  const returnTo = useMemo(() => {
    const raw = typeof params.returnTo === "string" ? params.returnTo.trim() : "";
    return raw || "/";
  }, [params.returnTo]);

  useEffect(() => {
    if (cameraPermission?.granted) return;
    void requestCameraPermission();
  }, [cameraPermission?.granted, requestCameraPermission]);

  const permissionDenied = useMemo(() => {
    if (!cameraPermission) return false;
    return !cameraPermission.granted && !cameraPermission.canAskAgain;
  }, [cameraPermission]);

  const handleClose = useCallback(() => {
    router.dismissTo(returnTo as never);
  }, [returnTo, router]);

  const handleRetryPermission = useCallback(async () => {
    setScanError(null);
    await requestCameraPermission();
  }, [requestCameraPermission]);

  const handleBarcodeScanned = useCallback(
    ({ data }: BarcodeScanningResult) => {
      if (scannerLocked) return;
      const raw = typeof data === "string" ? data : "";
      const token = extractFriendQrToken(raw);
      if (!token) {
        setScanError(tr("未识别到好友二维码。", "No valid friend QR code was detected."));
        return;
      }

      setScannerLocked(true);
      setScanError(null);
      publishPendingFriendQrPayload(raw);
      handleClose();
    },
    [handleClose, scannerLocked, tr]
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={handleClose} />
        <View style={styles.sheetWrap}>
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 14) }]}>
            <View style={styles.header}>
              <View style={styles.headerCopy}>
                <Text style={styles.title}>{tr("扫描好友二维码", "Scan Friend QR")}</Text>
                <Text style={styles.subtitle}>
                  {tr(
                    "识别成功后会返回 Add Friend，并继续走 Paste QR payload 的添加逻辑。",
                    "After a successful scan, this returns to Add Friend and continues with the same Paste QR payload flow."
                  )}
                </Text>
              </View>
              <Pressable style={styles.closeBtn} onPress={handleClose}>
                <Ionicons name="close" size={18} color="rgba(226,232,240,0.92)" />
              </Pressable>
            </View>

            {cameraPermission?.granted ? (
              <View style={styles.preview}>
                <CameraView
                  style={styles.camera}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                  onBarcodeScanned={scannerLocked ? undefined : handleBarcodeScanned}
                />
                <View pointerEvents="none" style={styles.frame} />
              </View>
            ) : (
              <View style={styles.permissionCard}>
                <Ionicons
                  name={permissionDenied ? "alert-circle-outline" : "camera-outline"}
                  size={28}
                  color={permissionDenied ? "#fca5a5" : "#93c5fd"}
                />
                <Text style={styles.permissionTitle}>
                  {permissionDenied
                    ? tr("没有相机权限", "Camera permission denied")
                    : tr("请求相机权限中", "Requesting camera permission")}
                </Text>
                <Text style={styles.permissionBody}>
                  {permissionDenied
                    ? tr("请开启相机权限后再扫码添加好友。", "Enable camera permission before scanning a friend QR code.")
                    : tr("授权后即可直接识别好友二维码。", "Grant access to start scanning the friend QR code.")}
                </Text>
                <Pressable style={styles.primaryBtn} onPress={handleRetryPermission}>
                  <Text style={styles.primaryBtnText}>{tr("重试授权", "Try again")}</Text>
                </Pressable>
              </View>
            )}

            <Text style={styles.helperText}>
              {tr(
                "请把好友二维码放入取景框中央。识别到无效内容时会停留在当前页，方便继续扫描。",
                "Place your friend's QR code inside the frame. Invalid scans stay here so you can keep scanning."
              )}
            </Text>

            {scanError ? <Text style={styles.errorText}>{scanError}</Text> : null}
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "transparent",
  },
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
  },
  sheetWrap: {
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(9,14,28,0.98)",
    paddingHorizontal: 18,
    paddingTop: 18,
    gap: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  headerCopy: {
    flex: 1,
    gap: 6,
  },
  title: {
    color: "#e2e8f0",
    fontSize: 18,
    fontWeight: "900",
  },
  subtitle: {
    color: "rgba(191,219,254,0.92)",
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 19,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  preview: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 24,
    aspectRatio: 1,
    backgroundColor: "#020617",
  },
  camera: {
    flex: 1,
  },
  frame: {
    position: "absolute",
    left: "16%",
    right: "16%",
    top: "16%",
    bottom: "16%",
    borderRadius: 22,
    borderWidth: 2,
    borderColor: "rgba(191,219,254,0.94)",
  },
  permissionCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(147,197,253,0.24)",
    backgroundColor: "rgba(15,23,42,0.78)",
    paddingHorizontal: 18,
    paddingVertical: 22,
    alignItems: "center",
    gap: 10,
  },
  permissionTitle: {
    color: "#e2e8f0",
    fontSize: 16,
    fontWeight: "900",
  },
  permissionBody: {
    color: "rgba(191,219,254,0.9)",
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 19,
    textAlign: "center",
  },
  primaryBtn: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#bfdbfe",
  },
  primaryBtnText: {
    color: "#0b1220",
    fontSize: 14,
    fontWeight: "900",
  },
  helperText: {
    color: "rgba(148,163,184,0.96)",
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 18,
  },
  errorText: {
    color: "#fca5a5",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
  },
});
