import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useMemo, useRef, useState } from "react";
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

export default function SignUpScreen() {
  const router = useRouter();
  const { language, updateLanguage } = useAgentTown();
  const { signUpWithPassword } = useAuth();
  const tr = (zh: string, en: string) => tx(language, zh, en);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const submitLockRef = useRef(false);
  const passwordInputRef = useRef<TextInput>(null);
  const confirmPasswordInputRef = useRef<TextInput>(null);

  const normalizedEmail = email.trim();
  const emailInvalid = !normalizedEmail || !normalizedEmail.includes("@");
  const passwordInvalid = password.length < 8;
  const confirmPasswordInvalid = !confirmPassword || confirmPassword !== password;

  const canSubmit = useMemo(
    () => !submitting && !emailInvalid && !passwordInvalid && !confirmPasswordInvalid,
    [confirmPasswordInvalid, emailInvalid, passwordInvalid, submitting]
  );

  const handleSubmit = async () => {
    if (submitLockRef.current) {
      return;
    }
    setSubmitted(true);

    if (emailInvalid) {
      Alert.alert(tr("信息不完整", "Incomplete"), tr("请输入有效邮箱。", "Please enter a valid email."));
      return;
    }
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
      submitLockRef.current = true;
      setSubmitting(true);
      await signUpWithPassword(normalizedEmail, password);
    } catch (error) {
      const msg = error instanceof Error ? error.message : tr("注册失败", "Sign-Up Failed");
      Alert.alert(tr("注册失败", "Sign-Up Failed"), msg);
    } finally {
      setSubmitting(false);
      submitLockRef.current = false;
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
                <Text style={authStyles.heroBadgeText}>{tr("创建账号", "Create account")}</Text>
              </View>
              <View style={authStyles.heroHeader}>
                <View style={authStyles.logoCircle}>
                  <Ionicons name="person-add" size={22} color={AUTH_COLORS.primary} />
                </View>
                <View style={authStyles.heroCopy}>
                  <Text style={authStyles.title}>{tr("加入 AgentTown", "Join AgentTown")}</Text>
                  <Text style={authStyles.subtitle}>
                    {tr(
                      "用一个正式账号保存你的好友、NPC、群聊和跨端记录。",
                      "Use a permanent account to keep your contacts, NPCs, groups, and sync history."
                    )}
                  </Text>
                </View>
              </View>
              <View style={authStyles.heroPillRow}>
                <View style={authStyles.heroPill}>
                  <Text style={authStyles.heroPillText}>{tr("最少信息", "Minimal fields")}</Text>
                </View>
                <View style={authStyles.heroPill}>
                  <Text style={authStyles.heroPillText}>{tr("密码至少 8 位", "Password 8+ chars")}</Text>
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
              <View style={authStyles.cardHeader}>
                <Text style={authStyles.cardTitle}>{tr("邮箱注册", "Email Sign-Up")}</Text>
                <Text style={authStyles.cardSubtitle}>
                  {tr("建议使用常用邮箱，方便找回密码和设备切换。", "Use a long-term email so recovery and device changes stay simple.")}
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
                  returnKeyType="next"
                  onSubmitEditing={() => passwordInputRef.current?.focus()}
                />
              </View>

              <View style={authStyles.inputGroup}>
                <Text style={authStyles.label}>{tr("密码", "Password")}</Text>
                <TextInput
                  ref={passwordInputRef}
                  style={[authStyles.input, submitted && passwordInvalid && styles.inputError]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder={tr("至少 8 位，建议混合字母和数字", "At least 8 characters; mix letters and numbers")}
                  placeholderTextColor={AUTH_PLACEHOLDER_COLOR}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="new-password"
                  textContentType="newPassword"
                  returnKeyType="next"
                  onSubmitEditing={() => confirmPasswordInputRef.current?.focus()}
                />
              </View>

              <View style={authStyles.inputGroup}>
                <Text style={authStyles.label}>{tr("确认密码", "Confirm Password")}</Text>
                <TextInput
                  ref={confirmPasswordInputRef}
                  style={[authStyles.input, submitted && confirmPasswordInvalid && styles.inputError]}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder={tr("再次输入密码", "Enter password again")}
                  placeholderTextColor={AUTH_PLACEHOLDER_COLOR}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="new-password"
                  textContentType="newPassword"
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit}
                />
              </View>

              <Text style={authStyles.helperText}>{tr("创建后会自动登录当前设备。", "The app signs you in automatically after account creation.")}</Text>

              <Pressable style={[authStyles.primaryBtn, !canSubmit && authStyles.btnDisabled]} disabled={!canSubmit} onPress={handleSubmit}>
                {submitting ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Ionicons name="person-add-outline" size={16} color="#ffffff" />
                )}
                <Text style={authStyles.primaryBtnText}>{tr("注册并登录", "Create Account")}</Text>
              </Pressable>

              <Pressable
                style={[authStyles.secondaryBtn, submitting && authStyles.btnDisabled]}
                disabled={submitting}
                onPress={() => router.push("/sign-in")}
              >
                <Ionicons name="log-in-outline" size={16} color={AUTH_COLORS.text} />
                <Text style={authStyles.secondaryBtnText}>{tr("已有账号？去登录", "Already have an account? Sign in")}</Text>
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
