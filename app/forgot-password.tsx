import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
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
import { APP_SAFE_AREA_EDGES } from "@/src/constants/safe-area";
import { AUTH_COLORS, AUTH_PLACEHOLDER_COLOR, authStyles } from "@/src/features/auth/authStyles";
import { tx } from "@/src/i18n/translate";
import { useAgentTown } from "@/src/state/agenttown-context";
import { useAuth } from "@/src/state/auth-context";

type ResetStep = "identify" | "verify" | "reset" | "done";
type BusyKey = "send" | "verify" | "reset" | null;

const PASSWORD_MIN_LENGTH = 8;
const RESEND_DEFAULT_SECONDS = 60;

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { language, updateLanguage } = useAgentTown();
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
    <KeyframeBackground>
      <SafeAreaView edges={APP_SAFE_AREA_EDGES} style={authStyles.safeArea}>
        <KeyboardAvoidingView
          style={authStyles.keyboardAvoid}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
        >
          <ScrollView
            contentContainerStyle={authStyles.container}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={authStyles.heroCard}>
              <View style={authStyles.heroBadge}>
                <Text style={authStyles.heroBadgeText}>{tr("恢复访问", "Recover access")}</Text>
              </View>
              <View style={authStyles.heroHeader}>
                <View style={authStyles.logoCircle}>
                  <Ionicons name="key" size={22} color={AUTH_COLORS.primary} />
                </View>
                <View style={authStyles.heroCopy}>
                  <Text style={authStyles.title}>{tr("找回密码", "Forgot Password")}</Text>
                  <Text style={authStyles.subtitle}>
                    {tr("通过邮箱验证身份，重新设置你的登录密码。", "Verify your email identity and set a new password safely.")}
                  </Text>
                </View>
              </View>
              <View style={authStyles.heroPillRow}>
                <View style={authStyles.heroPill}>
                  <Text style={authStyles.heroPillText}>{stepLabel}</Text>
                </View>
                <View style={authStyles.heroPill}>
                  <Text style={authStyles.heroPillText}>{tr("邮箱验证码", "Email verification")}</Text>
                </View>
              </View>
              <View style={authStyles.langRow}>
                <Pressable
                  style={[authStyles.langBtn, language === "zh" && authStyles.langBtnActive]}
                  onPress={() => updateLanguage("zh")}
                >
                  <Text style={[authStyles.langBtnText, language === "zh" && authStyles.langBtnTextActive]}>
                    {tr("中文", "Chinese")}
                  </Text>
                </Pressable>
                <Pressable
                  style={[authStyles.langBtn, language === "en" && authStyles.langBtnActive]}
                  onPress={() => updateLanguage("en")}
                >
                  <Text style={[authStyles.langBtnText, language === "en" && authStyles.langBtnTextActive]}>
                    {tr("英文", "English")}
                  </Text>
                </Pressable>
              </View>
            </View>

            <View style={authStyles.card}>
          {step === "identify" ? (
            <>
              <View style={authStyles.cardHeader}>
                <Text style={authStyles.cardTitle}>{tr("验证账号", "Account Verification")}</Text>
                <Text style={authStyles.cardSubtitle}>
                  {tr("先确认需要重置密码的邮箱。", "Confirm the email address for the account you want to recover.")}
                </Text>
              </View>
              <View style={authStyles.inputGroup}>
                <Text style={authStyles.label}>{tr("邮箱", "Email")}</Text>
                <TextInput
                  style={[authStyles.input, submitted && emailInvalid && styles.inputError]}
                  value={email}
                  onChangeText={setEmail}
                  placeholder={tr("you@example.com", "you@example.com")}
                  placeholderTextColor={AUTH_PLACEHOLDER_COLOR}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  returnKeyType="done"
                  onSubmitEditing={handleSendCode}
                />
              </View>
              <Text style={authStyles.helperText}>
                {tr("请输入注册时使用的邮箱。", "Enter the email used for registration.")}
              </Text>
              <Pressable style={[authStyles.primaryBtn, sendCodeDisabled && authStyles.btnDisabled]} disabled={sendCodeDisabled} onPress={handleSendCode}>
                {busyKey === "send" ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Ionicons name="mail-open-outline" size={16} color="#ffffff" />
                )}
                <Text style={authStyles.primaryBtnText}>{tr("发送验证码", "Send Code")}</Text>
              </Pressable>
            </>
          ) : null}

          {step === "verify" ? (
            <>
              <View style={authStyles.cardHeader}>
                <Text style={authStyles.cardTitle}>{tr("输入验证码", "Enter Verification Code")}</Text>
                <Text style={authStyles.cardSubtitle}>
                  {tr("收到邮件验证码后，在这里完成校验。", "Enter the email verification code to unlock password reset.")}
                </Text>
              </View>
              <View style={authStyles.inputGroup}>
                <Text style={authStyles.label}>{tr("邮箱", "Email")}</Text>
                <TextInput
                  style={[authStyles.input, submitted && emailInvalid && styles.inputError]}
                  value={email}
                  onChangeText={setEmail}
                  placeholder={tr("you@example.com", "you@example.com")}
                  placeholderTextColor={AUTH_PLACEHOLDER_COLOR}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                />
              </View>
              <View style={authStyles.inputGroup}>
                <Text style={authStyles.label}>{tr("验证码", "Verification Code")}</Text>
                <TextInput
                  style={[authStyles.input, submitted && codeInvalid && styles.inputError]}
                  value={code}
                  onChangeText={setCode}
                  placeholder={tr("输入邮件里的验证码", "Enter the code from your email")}
                  placeholderTextColor={AUTH_PLACEHOLDER_COLOR}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="one-time-code"
                  textContentType="oneTimeCode"
                  returnKeyType="done"
                  onSubmitEditing={handleVerifyCode}
                />
              </View>
              <Pressable
                style={[authStyles.primaryBtn, verifyCodeDisabled && authStyles.btnDisabled]}
                disabled={verifyCodeDisabled}
                onPress={handleVerifyCode}
              >
                {busyKey === "verify" ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Ionicons name="shield-checkmark-outline" size={16} color="#ffffff" />
                )}
                <Text style={authStyles.primaryBtnText}>{tr("校验验证码", "Verify Code")}</Text>
              </Pressable>
              <Pressable style={[authStyles.secondaryBtn, sendCodeDisabled && authStyles.btnDisabled]} disabled={sendCodeDisabled} onPress={handleSendCode}>
                <Ionicons name="refresh-outline" size={16} color={AUTH_COLORS.text} />
                <Text style={authStyles.secondaryBtnText}>
                  {resendBlocked
                    ? tr(`重新发送（${resendCountdown}s）`, `Resend (${resendCountdown}s)`)
                    : tr("重新发送验证码", "Resend Code")}
                </Text>
              </Pressable>
              {codeExpiresAt ? (
                <Text style={authStyles.helperText}>
                  {tr("验证码有效期至", "Code expires at")} {new Date(codeExpiresAt).toLocaleString()}
                </Text>
              ) : null}
              {__DEV__ && devCodeHint ? (
                <Text style={authStyles.devHint}>{tr("开发验证码", "DEV CODE")}: {devCodeHint}</Text>
              ) : null}
              <Pressable
                style={[authStyles.ghostBtn, busyKey !== null && authStyles.btnDisabled]}
                disabled={busyKey !== null}
                onPress={() => setStep("identify")}
              >
                <Text style={authStyles.ghostBtnText}>{tr("返回上一步", "Back")}</Text>
              </Pressable>
            </>
          ) : null}

          {step === "reset" ? (
            <>
              <View style={authStyles.cardHeader}>
                <Text style={authStyles.cardTitle}>{tr("设置新密码", "Set New Password")}</Text>
                <Text style={authStyles.cardSubtitle}>
                  {tr("创建一个新的登录密码，完成后将直接回到登录页。", "Create a new sign-in password. When finished, return to the sign-in page.")}
                </Text>
              </View>
              <View style={authStyles.inputGroup}>
                <Text style={authStyles.label}>{tr("新密码", "New Password")}</Text>
                <TextInput
                  style={[authStyles.input, submitted && passwordInvalid && styles.inputError]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder={tr("至少 8 位", "At least 8 characters")}
                  placeholderTextColor={AUTH_PLACEHOLDER_COLOR}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="new-password"
                  textContentType="newPassword"
                />
              </View>
              <View style={authStyles.inputGroup}>
                <Text style={authStyles.label}>{tr("确认新密码", "Confirm New Password")}</Text>
                <TextInput
                  style={[authStyles.input, submitted && confirmPasswordInvalid && styles.inputError]}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder={tr("再次输入新密码", "Enter the new password again")}
                  placeholderTextColor={AUTH_PLACEHOLDER_COLOR}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="new-password"
                  textContentType="newPassword"
                  returnKeyType="done"
                  onSubmitEditing={handleResetPassword}
                />
              </View>
              <Text style={authStyles.helperText}>{tr("密码至少 8 位", "Password must be at least 8 characters")}</Text>
              {resetTokenExpiresAt ? (
                <Text style={authStyles.helperText}>
                  {tr("重置会话有效期至", "Reset token valid until")} {new Date(resetTokenExpiresAt).toLocaleString()}
                </Text>
              ) : null}
              <Pressable
                style={[authStyles.primaryBtn, resetDisabled && authStyles.btnDisabled]}
                disabled={resetDisabled}
                onPress={handleResetPassword}
              >
                {busyKey === "reset" ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Ionicons name="key-outline" size={16} color="#ffffff" />
                )}
                <Text style={authStyles.primaryBtnText}>{tr("确认重置", "Reset Password")}</Text>
              </Pressable>
            </>
          ) : null}

          {step === "done" ? (
            <>
              <View style={authStyles.doneIconWrap}>
                <Ionicons name="checkmark-circle" size={30} color="#16a34a" />
              </View>
              <Text style={authStyles.doneTitle}>{tr("密码已重置", "Password Updated")}</Text>
              <Text style={authStyles.helperText}>{tr("请返回登录页使用新密码登录。", "Return to sign in with your new password.")}</Text>
              <Pressable style={authStyles.primaryBtn} onPress={goToSignIn}>
                <Ionicons name="log-in-outline" size={16} color="#ffffff" />
                <Text style={authStyles.primaryBtnText}>{tr("返回登录", "Back to Sign In")}</Text>
              </Pressable>
            </>
          ) : null}

              <Pressable style={[authStyles.secondaryBtn, busyKey !== null && authStyles.btnDisabled]} disabled={busyKey !== null} onPress={goToSignIn}>
                <Ionicons name="arrow-back-outline" size={16} color={AUTH_COLORS.text} />
                <Text style={authStyles.secondaryBtnText}>{tr("取消并返回登录", "Cancel and Return")}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </KeyframeBackground>
  );
}

const styles = StyleSheet.create({
  inputError: {
    borderColor: AUTH_COLORS.danger,
  },
});
