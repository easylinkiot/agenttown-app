import { Ionicons } from "@expo/vector-icons";
import * as AppleAuthentication from "expo-apple-authentication";
import * as AuthSession from "expo-auth-session";
import * as Google from "expo-auth-session/providers/google";
import Constants from "expo-constants";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
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
import { formatApiError } from "@/src/lib/api";
import { useAgentTown } from "@/src/state/agenttown-context";
import {
  AUTH_ERROR_OTP_EXPIRED,
  AUTH_ERROR_OTP_INVALID,
  AUTH_ERROR_OTP_NOT_REQUESTED,
  AUTH_ERROR_PHONE_INVALID,
  normalizePhone,
  useAuth,
} from "@/src/state/auth-context";

WebBrowser.maybeCompleteAuthSession();

const DEV_LOGIN_PRESET = {
  email: "admin.local@agenttown.dev",
  password: "AgentTown#2026!",
  displayName: "Local Admin",
};

const DEV_LOGIN_PRESET_ = {
  email: "fulladmin.20260225@agenttown.dev",
  password: "AgentTown#2026",
  displayName: "Local Admin",
};

interface GoogleProfile {
  sub?: string;
  name?: string;
  email?: string;
  picture?: string;
}

function sanitizeGoogleClientId(raw: string | undefined) {
  const value = raw?.trim() || "";
  if (!value) return "";
  if (value.includes("placeholder")) return "";
  return value;
}

function isAppleRelay(email?: string | null) {
  const value = (email || "").trim().toLowerCase();
  return value.endsWith("@privaterelay.appleid.com");
}

async function fetchGoogleProfile(accessToken: string) {
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error("Google profile request failed");
  }
  const payload = (await response.json()) as GoogleProfile;
  return payload;
}

function validatePhoneForOtp(phone: string, tr: (zh: string, en: string) => string) {
  try {
    return normalizePhone(phone);
  } catch {
    throw new Error(tr("请输入有效手机号。", "Please enter a valid phone number."));
  }
}

function localizeAuthErrorMessage(
  error: unknown,
  tr: (zh: string, en: string) => string
) {
  const message = error instanceof Error ? error.message : String(error);
  switch (message) {
    case AUTH_ERROR_PHONE_INVALID:
      return tr("请输入有效手机号。", "Please enter a valid phone number.");
    case AUTH_ERROR_OTP_NOT_REQUESTED:
      return tr("验证码已失效，请重新发送。", "Code is no longer valid. Please send a new one.");
    case AUTH_ERROR_OTP_EXPIRED:
      return tr("验证码已过期，请重新发送。", "Code expired. Please send a new one.");
    case AUTH_ERROR_OTP_INVALID:
      return tr("验证码错误。", "Incorrect verification code.");
    default:
      return message;
  }
}

export default function SignInScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const { language, updateLanguage } = useAgentTown();
  const tr = (zh: string, en: string) => tx(language, zh, en);
  const {
    isHydrated,
    user,
    completeProfile,
    signInAsGuest,
    signInWithPassword,
    signInWithApple,
    signInWithGoogle,
    sendPhoneCode,
    verifyPhoneCode,
  } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpExpiresAt, setOtpExpiresAt] = useState<number | null>(null);
  const [devOtpHint, setDevOtpHint] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<"google" | "apple" | "phone" | "guest" | "profile" | "password" | null>(null);
  const [isAppleAvailable, setIsAppleAvailable] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [showProfileSetup, setShowProfileSetup] = useState(false);
  const isExpoGo = Constants.appOwnership === "expo";

  useEffect(() => {
    const emailParam = typeof params.email === "string" ? params.email.trim() : "";
    if (!emailParam || email) return;
    setEmail(emailParam);
  }, [email, params.email]);

  const googleWebClientId = useMemo(
    () => sanitizeGoogleClientId(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID),
    []
  );
  const googleIosClientId = useMemo(
    () => sanitizeGoogleClientId(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID),
    []
  );
  const googleAndroidClientId = useMemo(
    () => sanitizeGoogleClientId(process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID),
    []
  );

  const googleConfigMissing = useMemo(() => {
    if (isExpoGo) {
      return !googleWebClientId;
    }
    if (Platform.OS === "ios") {
      return !(googleIosClientId || googleWebClientId);
    }
    if (Platform.OS === "android") {
      return !(googleAndroidClientId || googleWebClientId);
    }
    return !googleWebClientId;
  }, [googleAndroidClientId, googleIosClientId, googleWebClientId, isExpoGo]);

  const redirectUri = useMemo(
    () => (isExpoGo ? undefined : AuthSession.makeRedirectUri({ scheme: "agenttown", path: "oauth2redirect/google" })),
    [isExpoGo]
  );

  const [googleRequest, googleResponse, googlePromptAsync] = Google.useAuthRequest({
    scopes: ["openid", "profile", "email"],
    webClientId:
      googleWebClientId ||
      googleIosClientId ||
      "missing-google-web-client-id",
    iosClientId:
      googleIosClientId ||
      googleWebClientId ||
      "missing-google-ios-client-id",
    androidClientId:
      googleAndroidClientId ||
      googleWebClientId ||
      "missing-google-android-client-id",
    ...(redirectUri ? { redirectUri } : {}),
  });

  useEffect(() => {
    if (Platform.OS !== "ios") return;
    AppleAuthentication.isAvailableAsync().then(setIsAppleAvailable).catch(() => {
      setIsAppleAvailable(false);
    });
  }, []);

  useEffect(() => {
    if (!isHydrated || !user) return;
    if (user.requireProfileSetup) {
      setProfileName(user.displayName || "");
      setProfileEmail(isAppleRelay(user.email) ? "" : (user.email || ""));
      setShowProfileSetup(true);
      return;
    }
    setShowProfileSetup(false);
    router.replace("/");
  }, [isHydrated, router, user]);

  useEffect(() => {
    if (!googleResponse || googleResponse.type !== "success") return;
    const accessToken =
      googleResponse.authentication?.accessToken ||
      (typeof googleResponse.params?.access_token === "string"
        ? googleResponse.params.access_token
        : null);
    const idToken =
      googleResponse.authentication?.idToken ||
      (typeof googleResponse.params?.id_token === "string"
        ? googleResponse.params.id_token
        : null);

    if (!accessToken) {
      Alert.alert(
        tx(language, "Google 登录失败", "Google Sign-In Failed"),
        tx(language, "未获取到访问令牌。", "No access token returned.")
      );
      setBusyKey(null);
      return;
    }

    (async () => {
      try {
        const profile = await fetchGoogleProfile(accessToken);
        await signInWithGoogle({
          id: profile.sub || `google_${Date.now()}`,
          name: profile.name,
          email: profile.email,
          avatar: profile.picture,
          idToken,
        });
      } catch {
        Alert.alert(
          tx(language, "Google 登录失败", "Google Sign-In Failed"),
          tx(language, "无法读取用户信息。", "Cannot read user profile.")
        );
      } finally {
        setBusyKey(null);
      }
    })();
  }, [googleResponse, language, router, signInWithGoogle]);

  const handleGuestSignIn = async () => {
    try {
      setBusyKey("guest");
      await signInAsGuest();
    } finally {
      setBusyKey(null);
    }
  };

  const handlePasswordSignIn = async () => {
    const normalizedEmail = email.trim();
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      Alert.alert(tr("信息不完整", "Incomplete"), tr("请输入有效邮箱。", "Please enter a valid email."));
      return;
    }
    if (!password) {
      Alert.alert(tr("信息不完整", "Incomplete"), tr("请输入密码。", "Please enter your password."));
      return;
    }

    try {
      setBusyKey("password");
      await signInWithPassword(normalizedEmail, password);
    } catch (error) {
      const msg = error instanceof Error ? error.message : tr("登录失败", "Sign-In Failed");
      Alert.alert(tr("登录失败", "Sign-In Failed"), msg);
    } finally {
      setBusyKey(null);
    }
  };

  const handleFillDevAccount = () => {
    setEmail(DEV_LOGIN_PRESET.email);
    setPassword(DEV_LOGIN_PRESET.password);
    setProfileName(DEV_LOGIN_PRESET.displayName);
  };

  const handleGoogleSignIn = async () => {
    if (googleConfigMissing) {
      Alert.alert(
        tr("Google OAuth 未配置", "Google OAuth Not Configured"),
        tr(
          "请先在 .env 配置真实 EXPO_PUBLIC_GOOGLE_*_CLIENT_ID（不是 placeholder）。",
          "Please set real EXPO_PUBLIC_GOOGLE_*_CLIENT_ID values in .env (not placeholders)."
        )
      );
      return;
    }

    try {
      setBusyKey("google");
      const result = await googlePromptAsync();
      if (result.type === "dismiss" || result.type === "cancel") {
        setBusyKey(null);
      }
    } catch {
      setBusyKey(null);
      Alert.alert(tr("Google 登录失败", "Google Sign-In Failed"), tr("请稍后重试。", "Please try again later."));
    }
  };

  const handleAppleSignIn = async () => {
    if (Platform.OS !== "ios" || !isAppleAvailable) {
      Alert.alert(
        tr("当前不可用", "Not Available"),
        tr("Apple 登录仅在 iOS 真机或支持环境可用。", "Apple Sign-In is available only on supported iOS environments.")
      );
      return;
    }

    try {
      setBusyKey("apple");
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      const fullName = [
        credential.fullName?.givenName,
        credential.fullName?.familyName,
      ]
        .filter(Boolean)
        .join(" ")
        .trim();

      await signInWithApple({
        id: credential.user,
        name: fullName || null,
        email: credential.email,
        identityToken: credential.identityToken || null,
      });
    } catch (error) {
      const knownCode = (error as { code?: string })?.code;
      const rawMessage = error instanceof Error ? error.message : "";
      if (knownCode === "ERR_REQUEST_CANCELED") return;

      const isUnsupportedEnvironment =
        knownCode === "ERR_INVALID_OPERATION" || knownCode === "ERR_REQUEST_NOT_HANDLED";
      const isNativeAuthFailed =
        knownCode === "ERR_REQUEST_FAILED" ||
        /authorization attempt failed/i.test(rawMessage) ||
        /unknown reason/i.test(rawMessage);
      const message = isUnsupportedEnvironment
        ? tr(
            "当前环境暂不支持 Apple 登录，请在 iOS 原生构建中并确保设备已登录 Apple ID 后重试。",
            "Apple Sign-In is not supported in this environment. Use a native iOS build and sign in to an Apple ID, then try again."
          )
        : isNativeAuthFailed
          ? tr(
              "Apple 授权失败。请确认设备已登录 Apple ID，并在系统设置中允许本 App 使用 Apple 登录后重试。",
              "Apple authorization failed. Make sure the device is signed in to Apple ID and Apple Sign-In is allowed for this app, then try again."
            )
        : formatApiError(error) || tr("请稍后重试。", "Please try again later.");

      Alert.alert(tr("Apple 登录失败", "Apple Sign-In Failed"), message);
    } finally {
      setBusyKey(null);
    }
  };

  const handleSendCode = async () => {
    try {
      const normalizedPhone = validatePhoneForOtp(phone, tr);
      setPhone(normalizedPhone);
      setBusyKey("phone");
      const result = await sendPhoneCode(normalizedPhone);
      setOtpExpiresAt(result.expiresAt);
      setDevOtpHint(result.devCode || null);
      Alert.alert(
        tr("验证码已发送", "Code Sent"),
        tr("请输入短信验证码完成登录。", "Enter the SMS code to finish sign-in.")
      );
    } catch (error) {
      const msg = localizeAuthErrorMessage(error, tr);
      Alert.alert(tr("发送失败", "Failed to Send"), msg);
    } finally {
      setBusyKey(null);
    }
  };

  const handleVerifyCode = async () => {
    try {
      const normalizedPhone = validatePhoneForOtp(phone, tr);
      setPhone(normalizedPhone);
      if (!otpCode.trim()) {
        Alert.alert(tr("信息不完整", "Incomplete"), tr("请输入验证码。", "Please enter the verification code."));
        return;
      }
      setBusyKey("phone");
      await verifyPhoneCode(normalizedPhone, otpCode);
    } catch (error) {
      const msg = localizeAuthErrorMessage(error, tr);
      Alert.alert(tr("登录失败", "Sign-In Failed"), msg);
    } finally {
      setBusyKey(null);
    }
  };

  const handleCompleteProfile = async () => {
    const name = profileName.trim();
    const email = profileEmail.trim();
    if (!name) {
      Alert.alert(tr("信息不完整", "Incomplete Profile"), tr("请输入用户名。", "Please enter a username."));
      return;
    }
    if (!email || !email.includes("@") || isAppleRelay(email)) {
      Alert.alert(
        tr("信息不完整", "Incomplete Profile"),
        tr("请输入可用邮箱（不能是 Apple Relay）。", "Please enter a valid non-relay email.")
      );
      return;
    }

    try {
      setBusyKey("profile");
      await completeProfile({ displayName: name, email });
    } catch (error) {
      const msg = error instanceof Error ? error.message : tr("更新失败", "Failed to update profile");
      Alert.alert(tr("更新失败", "Update Failed"), msg);
    } finally {
      setBusyKey(null);
    }
  };

  const otpTimeText = otpExpiresAt
    ? `${tr("验证码有效期至", "Code valid until")} ${new Date(otpExpiresAt).toLocaleTimeString()}`
    : tr("输入手机号获取验证码", "Enter phone number to request code");

  return (
    <SafeAreaView edges={APP_SAFE_AREA_EDGES} style={styles.safeArea}>
      <ScrollView testID="auth-sign-in-scroll" contentContainerStyle={styles.container}>
        <View style={styles.brandCard}>
          <View style={styles.logoCircle}>
            <Ionicons name="planet" size={24} color="#15803d" />
          </View>
          <Text style={styles.title}>{tr("欢迎来到 AgentTown", "Welcome to AgentTown")}</Text>
          <Text style={styles.subtitle}>{tr("一次登录，同步 iOS / Android / Web", "Sign in once, sync iOS / Android / Web")}</Text>
          <View style={styles.langRow}>
            <Pressable
              style={[styles.langBtn, language === "zh" && styles.langBtnActive]}
              onPress={() => updateLanguage("zh")}
            >
              <Text style={[styles.langBtnText, language === "zh" && styles.langBtnTextActive]}>
                {tr("中文", "Chinese")}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.langBtn, language === "en" && styles.langBtnActive]}
              onPress={() => updateLanguage("en")}
            >
              <Text style={[styles.langBtnText, language === "en" && styles.langBtnTextActive]}>
                {tr("英文", "English")}
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{tr("OAuth 登录", "OAuth Sign-In")}</Text>

          <Pressable
            style={[styles.oauthBtn, styles.googleBtn]}
            disabled={busyKey !== null || !googleRequest}
            onPress={handleGoogleSignIn}
          >
            {busyKey === "google" ? (
              <ActivityIndicator size="small" color="#111827" />
            ) : (
              <Ionicons name="logo-google" size={16} color="#111827" />
            )}
            <Text style={styles.oauthBtnText}>{tr("使用 Google 继续", "Continue with Google")}</Text>
          </Pressable>

          <Pressable
            style={[styles.oauthBtn, styles.appleBtn]}
            disabled={busyKey !== null}
            onPress={handleAppleSignIn}
          >
            {busyKey === "apple" ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Ionicons name="logo-apple" size={16} color="white" />
            )}
            <Text style={styles.appleBtnText}>{tr("使用 Apple 继续", "Continue with Apple")}</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{tr("账号密码登录", "Email & Password")}</Text>
          <TextInput
            testID="auth-email-input"
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder={tr("电子邮件", "Email")}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <TextInput
            testID="auth-password-input"
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder={tr("密码", "Password")}
            secureTextEntry
            autoCapitalize="none"
          />
          <View style={styles.auxActionRow}>
            <Pressable
              style={[styles.ghostBtn, busyKey !== null && styles.btnDisabled]}
              disabled={busyKey !== null}
              onPress={() => router.push("/sign-up")}
            >
              <Text style={styles.ghostBtnText}>{tr("注册", "Create Account")}</Text>
            </Pressable>
            <Pressable
              style={[styles.ghostBtn, busyKey !== null && styles.btnDisabled]}
              disabled={busyKey !== null}
              onPress={() => router.push("./forgot-password")}
            >
              <Text style={styles.ghostBtnText}>{tr("忘记密码？", "Forgot Password?")}</Text>
            </Pressable>
          </View>
          {__DEV__ ? (
            <Pressable
              style={[styles.secondaryBtn, busyKey !== null && styles.btnDisabled]}
              disabled={busyKey !== null}
              onPress={handleFillDevAccount}
            >
              <Ionicons name="sparkles-outline" size={16} color="#1f2937" />
              <Text style={styles.secondaryBtnText}>{tr("填充管理员账号（DEV）", "Fill Local Admin (DEV)")}</Text>
            </Pressable>
          ) : null}
          <Pressable
            testID="auth-password-login-button"
            style={[styles.primaryBtn, busyKey !== null && styles.btnDisabled]}
            disabled={busyKey !== null}
            onPress={handlePasswordSignIn}
          >
            {busyKey === "password" ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Ionicons name="log-in-outline" size={16} color="white" />
            )}
            <Text style={styles.primaryBtnText}>{tr("登录", "Sign In")}</Text>
          </Pressable>
        </View>

        {showProfileSetup ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{tr("完善 Apple 账号信息", "Complete Apple Account Profile")}</Text>
            <Text style={styles.helperText}>
              {tr(
                "你选择了匿名/隐藏邮箱，需先设置用户名和邮箱后继续。",
                "You chose anonymous/hidden email. Set username and email to continue."
              )}
            </Text>
            <TextInput
              style={styles.input}
              value={profileName}
              onChangeText={setProfileName}
              placeholder={tr("用户名", "Username")}
              autoCapitalize="words"
            />
            <TextInput
              style={styles.input}
              value={profileEmail}
              onChangeText={setProfileEmail}
              placeholder={tr("电子邮件", "Email")}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Pressable
              style={[styles.primaryBtn, busyKey !== null && styles.btnDisabled]}
              disabled={busyKey !== null}
              onPress={handleCompleteProfile}
            >
              {busyKey === "profile" ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Ionicons name="checkmark-done-outline" size={16} color="white" />
              )}
              <Text style={styles.primaryBtnText}>{tr("保存并继续", "Save and Continue")}</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{tr("手机号验证码", "Phone Verification")}</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder={language === "zh" ? "+86 13800138000" : "+1 415 555 0123"}
            keyboardType="phone-pad"
            autoCapitalize="none"
          />
          <Pressable
            style={[styles.secondaryBtn, busyKey !== null && styles.btnDisabled]}
            disabled={busyKey !== null}
            onPress={handleSendCode}
          >
            {busyKey === "phone" ? (
              <ActivityIndicator size="small" color="#1f2937" />
            ) : (
              <Ionicons name="chatbox-ellipses-outline" size={16} color="#1f2937" />
            )}
            <Text style={styles.secondaryBtnText}>{tr("发送验证码", "Send Code")}</Text>
          </Pressable>

          <TextInput
            style={styles.input}
            value={otpCode}
            onChangeText={setOtpCode}
            placeholder={tr("6 位验证码", "6-digit code")}
            keyboardType="number-pad"
            autoCapitalize="none"
          />
          <Pressable
            style={[styles.primaryBtn, busyKey !== null && styles.btnDisabled]}
            disabled={busyKey !== null}
            onPress={handleVerifyCode}
          >
            <Ionicons name="log-in-outline" size={16} color="white" />
            <Text style={styles.primaryBtnText}>{tr("验证并登录", "Verify and Sign In")}</Text>
          </Pressable>
          <Text style={styles.helperText}>{otpTimeText}</Text>
          {__DEV__ && devOtpHint ? (
            <Text style={styles.devHint}>{tr("开发验证码", "DEV CODE")}: {devOtpHint}</Text>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{tr("快速体验", "Quick Start")}</Text>
          <Pressable
            testID="auth-guest-login-button"
            style={[styles.secondaryBtn, busyKey !== null && styles.btnDisabled]}
            disabled={busyKey !== null}
            onPress={handleGuestSignIn}
          >
            {busyKey === "guest" ? (
              <ActivityIndicator size="small" color="#1f2937" />
            ) : (
              <Ionicons name="walk-outline" size={16} color="#1f2937" />
            )}
            <Text style={styles.secondaryBtnText}>{tr("游客模式继续", "Continue as Guest")}</Text>
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
  langRow: {
    marginTop: 8,
    flexDirection: "row",
    gap: 8,
  },
  langBtn: {
    paddingHorizontal: 10,
    minHeight: 30,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
  },
  langBtnActive: {
    backgroundColor: "#2563eb",
    borderColor: "#2563eb",
  },
  langBtnText: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "700",
  },
  langBtnTextActive: {
    color: "white",
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
  oauthBtn: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  googleBtn: {
    borderColor: "#d1d5db",
    backgroundColor: "#f9fafb",
  },
  appleBtn: {
    borderColor: "#111827",
    backgroundColor: "#111827",
  },
  oauthBtnText: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "700",
  },
  appleBtnText: {
    color: "white",
    fontSize: 14,
    fontWeight: "700",
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
  auxActionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  ghostBtn: {
    minHeight: 32,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  ghostBtnText: {
    color: "#2563eb",
    fontSize: 13,
    fontWeight: "700",
  },
  helperText: {
    fontSize: 12,
    color: "#64748b",
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
