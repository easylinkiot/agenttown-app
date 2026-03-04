import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { APP_SAFE_AREA_EDGES } from "@/src/constants/safe-area";
import { tx } from "@/src/i18n/translate";
import { useAgentTown } from "@/src/state/agenttown-context";
import { useAuth } from "@/src/state/auth-context";

type ResetStep = "identify" | "verify" | "reset" | "done";
type BusyKey = "send" | "verify" | "reset" | null;

const PASSWORD_MIN_LENGTH = 8;
const RESEND_DEFAULT_SECONDS = 60;

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { language } = useAgentTown();
  const { requestPasswordResetCode, verifyPasswordResetCode, resetPassword } = useAuth();
  const tr = (zh: string, en: string) => tx(language, zh, en);

  const [step, setStep] = useState<ResetStep>("identify");
  const [busyKey, setBusyKey] = useState<BusyKey>(null);
  const [submitted, setSubmitted] = useState(false);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [resetTokenExpiresAt, setResetTokenExpiresAt] = useState<string | null>(null);
  const [codeExpiresAt, setCodeExpiresAt] = useState<string | null>(null);
  const [devCodeHint, setDevCodeHint] = useState<string | null>(null);
  const [resendUntil, setResendUntil] = useState<number>(0);
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    if (resendUntil <= Date.now()) return;
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, [resendUntil]);

  const normalizedEmail = email.trim().toLowerCase();
  const emailInvalid = !normalizedEmail || !normalizedEmail.includes("@");
  const codeInvalid = !code.trim();
  const passwordInvalid = password.length < PASSWORD_MIN_LENGTH;
  const confirmPasswordInvalid = !confirmPassword || confirmPassword !== password;
  const resendCountdown = Math.max(0, Math.ceil((resendUntil - nowMs) / 1000));
  const resendBlocked = resendCountdown > 0;

  const sendCodeDisabled = busyKey !== null || emailInvalid || resendBlocked;
  const verifyCodeDisabled = busyKey !== null || emailInvalid || codeInvalid;
  const resetDisabled = useMemo(
    () =>
      busyKey !== null ||
      !resetToken ||
      passwordInvalid ||
      confirmPasswordInvalid,
    [busyKey, confirmPasswordInvalid, passwordInvalid, resetToken]
  );

  const stepLabel = {
    identify: tr("步骤 1/4：验证账号", "Step 1/4: Account"),
    verify: tr("步骤 2/4：验证身份", "Step 2/4: Verification"),
    reset: tr("步骤 3/4：设置新密码", "Step 3/4: New Password"),
    done: tr("步骤 4/4：完成", "Step 4/4: Complete"),
  }[step];

  const goToSignIn = () => {
    if (normalizedEmail) {
      router.replace({
        pathname: "/sign-in",
        params: { email: normalizedEmail },
      });
      return;
    }
    router.replace("/sign-in");
  };

  const handleSendCode = async () => {
    setSubmitted(true);
    if (emailInvalid) {
      Alert.alert(tr("信息不完整", "Incomplete"), tr("请输入有效邮箱。", "Please enter a valid email."));
      return;
    }

    try {
      setBusyKey("send");
      const result = await requestPasswordResetCode(normalizedEmail);
      const cooldownSeconds =
        typeof result.retryAfterSeconds === "number" && Number.isFinite(result.retryAfterSeconds) && result.retryAfterSeconds > 0
          ? result.retryAfterSeconds
          : RESEND_DEFAULT_SECONDS;
      setResendUntil(Date.now() + cooldownSeconds * 1000);
      setCodeExpiresAt(result.expiresAt || null);
      const simulatedCode = result.verificationCode || result.devCode || null;
      setDevCodeHint(simulatedCode);
      setCode("");
      setStep("verify");
      const successMessage = result.message || tr("请在下一步输入验证码。", "Enter the verification code in the next step.");
      const alertMessage = simulatedCode
        ? `${successMessage}\n${tr(`模拟验证码：${simulatedCode}`, `Mock verification code: ${simulatedCode}`)}`
        : successMessage;
      Alert.alert(
        tr("验证码已发送", "Code Sent"),
        alertMessage
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : tr("发送失败", "Failed to Send");
      Alert.alert(tr("发送失败", "Failed to Send"), msg);
    } finally {
      setBusyKey(null);
    }
  };

  const handleVerifyCode = async () => {
    setSubmitted(true);
    if (emailInvalid) {
      Alert.alert(tr("信息不完整", "Incomplete"), tr("请输入有效邮箱。", "Please enter a valid email."));
      return;
    }
    if (codeInvalid) {
      Alert.alert(tr("信息不完整", "Incomplete"), tr("请输入验证码。", "Please enter the verification code."));
      return;
    }

    try {
      setBusyKey("verify");
      const result = await verifyPasswordResetCode(normalizedEmail, code);
      setResetToken(result.resetToken);
      setResetTokenExpiresAt(result.resetTokenExpiresAt || null);
      setStep("reset");
    } catch (error) {
      const msg = error instanceof Error ? error.message : tr("验证失败", "Verification Failed");
      Alert.alert(tr("验证失败", "Verification Failed"), msg);
    } finally {
      setBusyKey(null);
    }
  };

  const handleResetPassword = async () => {
    setSubmitted(true);
    if (passwordInvalid) {
      Alert.alert(
        tr("信息不完整", "Incomplete"),
        tr("密码至少 8 位。", "Password must be at least 8 characters.")
      );
      return;
    }
    if (confirmPasswordInvalid) {
      Alert.alert(tr("信息不完整", "Incomplete"), tr("两次密码不一致。", "Passwords do not match."));
      return;
    }

    try {
      setBusyKey("reset");
      await resetPassword({
        email: normalizedEmail,
        resetToken,
        password,
      });
      setStep("done");
      setPassword("");
      setConfirmPassword("");
      Alert.alert(
        tr("密码重置成功", "Password Reset Successful"),
        tr("请使用新密码登录。", "Please sign in with your new password.")
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : tr("重置失败", "Reset Failed");
      Alert.alert(tr("重置失败", "Reset Failed"), msg);
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <SafeAreaView edges={APP_SAFE_AREA_EDGES} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.brandCard}>
          <View style={styles.logoCircle}>
            <Ionicons name="key" size={22} color="#2563eb" />
          </View>
          <Text style={styles.title}>{tr("找回密码", "Forgot Password")}</Text>
          <Text style={styles.subtitle}>{tr("按步骤验证并重置密码", "Verify and reset your password")}</Text>
          <Text style={styles.stepText}>{stepLabel}</Text>
        </View>

        <View style={styles.card}>
          {step === "identify" ? (
            <>
              <Text style={styles.cardTitle}>{tr("验证账号", "Account Verification")}</Text>
              <TextInput
                style={[styles.input, submitted && emailInvalid && styles.inputError]}
                value={email}
                onChangeText={setEmail}
                placeholder={tr("电子邮件", "Email")}
                keyboardType="email-address"
                autoCapitalize="none"
              autoComplete="off"
              textContentType="oneTimeCode"
              importantForAutofill="no"
              />
              <Text style={styles.helperText}>
                {tr("请输入注册时使用的邮箱。", "Enter the email used for registration.")}
              </Text>
              <Pressable style={[styles.primaryBtn, sendCodeDisabled && styles.btnDisabled]} disabled={sendCodeDisabled} onPress={handleSendCode}>
                {busyKey === "send" ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Ionicons name="mail-open-outline" size={16} color="white" />
                )}
                <Text style={styles.primaryBtnText}>{tr("发送验证码", "Send Code")}</Text>
              </Pressable>
            </>
          ) : null}

          {step === "verify" ? (
            <>
              <Text style={styles.cardTitle}>{tr("输入验证码", "Enter Verification Code")}</Text>
              <TextInput
                style={[styles.input, submitted && emailInvalid && styles.inputError]}
                value={email}
                onChangeText={setEmail}
                placeholder={tr("电子邮件", "Email")}
                keyboardType="email-address"
                autoCapitalize="none"
              autoComplete="off"
              textContentType="oneTimeCode"
              importantForAutofill="no"
              />
              <TextInput
                style={[styles.input, submitted && codeInvalid && styles.inputError]}
                value={code}
                onChangeText={setCode}
                placeholder={tr("验证码", "Verification Code")}
                autoCapitalize="none"
              autoComplete="off"
              textContentType="oneTimeCode"
              importantForAutofill="no"
              />
              <Pressable
                style={[styles.primaryBtn, verifyCodeDisabled && styles.btnDisabled]}
                disabled={verifyCodeDisabled}
                onPress={handleVerifyCode}
              >
                {busyKey === "verify" ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Ionicons name="shield-checkmark-outline" size={16} color="white" />
                )}
                <Text style={styles.primaryBtnText}>{tr("校验验证码", "Verify Code")}</Text>
              </Pressable>
              <Pressable style={[styles.secondaryBtn, sendCodeDisabled && styles.btnDisabled]} disabled={sendCodeDisabled} onPress={handleSendCode}>
                <Ionicons name="refresh-outline" size={16} color="#1f2937" />
                <Text style={styles.secondaryBtnText}>
                  {resendBlocked
                    ? tr(`重新发送（${resendCountdown}s）`, `Resend (${resendCountdown}s)`)
                    : tr("重新发送验证码", "Resend Code")}
                </Text>
              </Pressable>
              {codeExpiresAt ? (
                <Text style={styles.helperText}>
                  {tr("验证码有效期至", "Code expires at")} {new Date(codeExpiresAt).toLocaleString()}
                </Text>
              ) : null}
              {__DEV__ && devCodeHint ? (
                <Text style={styles.devHint}>{tr("开发验证码", "DEV CODE")}: {devCodeHint}</Text>
              ) : null}
              <Pressable
                style={[styles.ghostBtn, busyKey !== null && styles.btnDisabled]}
                disabled={busyKey !== null}
                onPress={() => setStep("identify")}
              >
                <Text style={styles.ghostBtnText}>{tr("返回上一步", "Back")}</Text>
              </Pressable>
            </>
          ) : null}

          {step === "reset" ? (
            <>
              <Text style={styles.cardTitle}>{tr("设置新密码", "Set New Password")}</Text>
              <TextInput
                style={[styles.input, submitted && passwordInvalid && styles.inputError]}
                value={password}
                onChangeText={setPassword}
                placeholder={tr("新密码", "New Password")}
                secureTextEntry
                autoCapitalize="none"
              autoComplete="off"
              textContentType="oneTimeCode"
              importantForAutofill="no"
              />
              <TextInput
                style={[styles.input, submitted && confirmPasswordInvalid && styles.inputError]}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder={tr("确认新密码", "Confirm New Password")}
                secureTextEntry
                autoCapitalize="none"
              autoComplete="off"
              textContentType="oneTimeCode"
              importantForAutofill="no"
              />
              <Text style={styles.helperText}>{tr("密码至少 8 位", "Password must be at least 8 characters")}</Text>
              {resetTokenExpiresAt ? (
                <Text style={styles.helperText}>
                  {tr("重置会话有效期至", "Reset token valid until")} {new Date(resetTokenExpiresAt).toLocaleString()}
                </Text>
              ) : null}
              <Pressable
                style={[styles.primaryBtn, resetDisabled && styles.btnDisabled]}
                disabled={resetDisabled}
                onPress={handleResetPassword}
              >
                {busyKey === "reset" ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Ionicons name="key-outline" size={16} color="white" />
                )}
                <Text style={styles.primaryBtnText}>{tr("确认重置", "Reset Password")}</Text>
              </Pressable>
            </>
          ) : null}

          {step === "done" ? (
            <>
              <View style={styles.doneIconWrap}>
                <Ionicons name="checkmark-circle" size={30} color="#16a34a" />
              </View>
              <Text style={styles.doneTitle}>{tr("密码已重置", "Password Updated")}</Text>
              <Text style={styles.helperText}>{tr("请返回登录页使用新密码登录。", "Return to sign in with your new password.")}</Text>
              <Pressable style={styles.primaryBtn} onPress={goToSignIn}>
                <Ionicons name="log-in-outline" size={16} color="white" />
                <Text style={styles.primaryBtnText}>{tr("返回登录", "Back to Sign In")}</Text>
              </Pressable>
            </>
          ) : null}

          <Pressable style={[styles.secondaryBtn, busyKey !== null && styles.btnDisabled]} disabled={busyKey !== null} onPress={goToSignIn}>
            <Ionicons name="arrow-back-outline" size={16} color="#1f2937" />
            <Text style={styles.secondaryBtnText}>{tr("取消并返回登录", "Cancel and Return")}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#eff6ff",
  },
  container: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 28,
    gap: 12,
  },
  brandCard: {
    borderRadius: 18,
    padding: 18,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#dbeafe",
    alignItems: "center",
    gap: 6,
  },
  logoCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#dbeafe",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0f172a",
  },
  subtitle: {
    fontSize: 13,
    color: "#475569",
  },
  stepText: {
    marginTop: 2,
    color: "#1d4ed8",
    fontSize: 12,
    fontWeight: "700",
  },
  card: {
    borderRadius: 16,
    padding: 14,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 10,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  input: {
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    paddingHorizontal: 12,
    backgroundColor: "white",
    fontSize: 14,
    color: "#111827",
  },
  inputError: {
    borderColor: "#ef4444",
  },
  helperText: {
    fontSize: 12,
    color: "#64748b",
  },
  primaryBtn: {
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: "#2563eb",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryBtnText: {
    color: "white",
    fontWeight: "700",
    fontSize: 14,
  },
  secondaryBtn: {
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d1d5db",
    backgroundColor: "#f8fafc",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  secondaryBtnText: {
    color: "#1f2937",
    fontWeight: "700",
    fontSize: 13,
  },
  ghostBtn: {
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  ghostBtnText: {
    color: "#2563eb",
    fontSize: 13,
    fontWeight: "700",
  },
  doneIconWrap: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  doneTitle: {
    textAlign: "center",
    color: "#111827",
    fontWeight: "800",
    fontSize: 18,
  },
  devHint: {
    fontSize: 12,
    color: "#16a34a",
    fontWeight: "700",
  },
  btnDisabled: {
    opacity: 0.55,
  },
});
