import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useMemo, useRef, useState } from "react";
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

export default function SignUpScreen() {
  const router = useRouter();
  const { language } = useAgentTown();
  const { signUpWithPassword } = useAuth();
  const tr = (zh: string, en: string) => tx(language, zh, en);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const submitLockRef = useRef(false);

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
    <SafeAreaView edges={APP_SAFE_AREA_EDGES} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.brandCard}>
          <View style={styles.logoCircle}>
            <Ionicons name="person-add" size={22} color="#15803d" />
          </View>
          <Text style={styles.title}>{tr("创建 AgentTown 账号", "Create your AgentTown account")}</Text>
          <Text style={styles.subtitle}>{tr("使用邮箱和密码注册", "Sign up with email and password")}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{tr("账号注册", "Email Sign-Up")}</Text>
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
            style={[styles.input, submitted && passwordInvalid && styles.inputError]}
            value={password}
            onChangeText={setPassword}
            placeholder={tr("密码", "Password")}
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
            placeholder={tr("确认密码", "Confirm Password")}
            secureTextEntry
            autoCapitalize="none"
          autoComplete="off"
          textContentType="oneTimeCode"
          importantForAutofill="no"
          />

          <Text style={styles.helperText}>{tr("密码至少 8 位", "Password must be at least 8 characters")}</Text>

          <Pressable style={[styles.primaryBtn, !canSubmit && styles.btnDisabled]} disabled={!canSubmit} onPress={handleSubmit}>
            {submitting ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Ionicons name="person-add-outline" size={16} color="white" />
            )}
            <Text style={styles.primaryBtnText}>{tr("注册并登录", "Create Account")}</Text>
          </Pressable>

          <Pressable
            style={[styles.secondaryBtn, submitting && styles.btnDisabled]}
            disabled={submitting}
            onPress={() => router.push("/sign-in")}
          >
            <Ionicons name="log-in-outline" size={16} color="#1f2937" />
            <Text style={styles.secondaryBtnText}>{tr("已有账号？去登录", "Already have an account? Sign in")}</Text>
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
    backgroundColor: "#dcfce7",
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
  btnDisabled: {
    opacity: 0.55,
  },
});
