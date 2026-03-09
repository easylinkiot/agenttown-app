import { Ionicons } from "@expo/vector-icons";
import * as AppleAuthentication from "expo-apple-authentication";
import * as AuthSession from "expo-auth-session";
import * as Google from "expo-auth-session/providers/google";
import * as ImagePicker from "expo-image-picker";
import Constants from "expo-constants";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
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
import { formatApiError, uploadFileV2 } from "@/src/lib/api";
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
  email: "2244661996@qq.com",
  password: "aes123xx",
  displayName: "Sven",
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

function decodeBase64UrlText(input: string) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const paddingRemainder = normalized.length % 4;
  let padded = normalized;
  if (paddingRemainder === 2) padded += "==";
  else if (paddingRemainder === 3) padded += "=";
  else if (paddingRemainder === 1) return "";

  try {
    if (typeof atob === "function") {
      return atob(padded);
    }
  } catch {
    return "";
  }

  const maybeBuffer = (globalThis as { Buffer?: { from: (source: string, encoding?: string) => { toString: (encoding?: string) => string } } })
    .Buffer;
  if (!maybeBuffer?.from) return "";
  try {
    return maybeBuffer.from(padded, "base64").toString("utf8");
  } catch {
    return "";
  }
}

function appleSubjectFromIdentityToken(identityToken?: string | null) {
  const token = identityToken?.trim() || "";
  if (!token) return "";
  const parts = token.split(".");
  if (parts.length < 2) return "";
  const payloadText = decodeBase64UrlText(parts[1]);
  if (!payloadText) return "";
  try {
    const payload = JSON.parse(payloadText) as { sub?: unknown };
    return typeof payload.sub === "string" ? payload.sub.trim() : "";
  } catch {
    return "";
  }
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

function inferImageMimeType(fileName?: string | null, fallbackMimeType?: string | null) {
  const fallback = (fallbackMimeType || "").trim();
  if (fallback) return fallback;
  const lower = (fileName || "").trim().toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".heic")) return "image/heic";
  return "image/jpeg";
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

type AuthMode = "sign_in" | "sign_up";
type SignInMethod = "email" | "phone";

export default function SignInScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string; redirect?: string }>();
  const { language, updateLanguage } = useAgentTown();
  const tr = (zh: string, en: string) => tx(language, zh, en);
  const {
    isHydrated,
    user,
    completeProfile,
    signInAsGuest,
    signInWithPassword,
    signUpWithPassword,
    signInWithApple,
    signInWithGoogle,
    sendPhoneCode,
    verifyPhoneCode,
  } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<AuthMode>("sign_in");
  const [signInMethod, setSignInMethod] = useState<SignInMethod>("email");
  const [signUpEmail, setSignUpEmail] = useState("");
  const [signUpPassword, setSignUpPassword] = useState("");
  const [signUpConfirmPassword, setSignUpConfirmPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpExpiresAt, setOtpExpiresAt] = useState<number | null>(null);
  const [devOtpHint, setDevOtpHint] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<"google" | "apple" | "phone" | "guest" | "profile" | "password" | null>(null);
  const [isAppleAvailable, setIsAppleAvailable] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [profileAvatarInput, setProfileAvatarInput] = useState("");
  const [uploadingProfileAvatar, setUploadingProfileAvatar] = useState(false);
  const [showProfileSetup, setShowProfileSetup] = useState(false);
  const passwordInputRef = useRef<TextInput>(null);
  const otpInputRef = useRef<TextInput>(null);
  const signUpPasswordInputRef = useRef<TextInput>(null);
  const signUpConfirmPasswordInputRef = useRef<TextInput>(null);
  const isExpoGo = Constants.appOwnership === "expo";
  const redirectPath = useMemo(() => {
    const raw = typeof params.redirect === "string" ? params.redirect.trim() : "";
    if (!raw.startsWith("/")) return "/";
    return raw;
  }, [params.redirect]);

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
      setProfileAvatarInput(user.avatar || "");
      setShowProfileSetup(true);
      return;
    }
    setShowProfileSetup(false);
    router.replace(redirectPath as never);
  }, [isHydrated, redirectPath, router, user]);

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

  const handlePasswordSignUp = async () => {
    const normalizedEmail = signUpEmail.trim();
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      Alert.alert(tr("信息不完整", "Incomplete"), tr("请输入有效邮箱。", "Please enter a valid email."));
      return;
    }
    if (signUpPassword.length < 8) {
      Alert.alert(tr("信息不完整", "Incomplete"), tr("密码至少 8 位。", "Password must be at least 8 characters."));
      return;
    }
    if (signUpPassword !== signUpConfirmPassword) {
      Alert.alert(tr("信息不完整", "Incomplete"), tr("两次密码不一致。", "Passwords do not match."));
      return;
    }

    try {
      setBusyKey("password");
      await signUpWithPassword(normalizedEmail, signUpPassword);
    } catch (error) {
      const msg = error instanceof Error ? error.message : tr("注册失败", "Sign-Up Failed");
      Alert.alert(tr("注册失败", "Sign-Up Failed"), msg);
    } finally {
      setBusyKey(null);
    }
  };

  const handlePickProfileAvatar = async () => {
    if (busyKey !== null || uploadingProfileAvatar) return;
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          tr("需要相册权限", "Photo Access Required"),
          tr("请允许访问相册后再选择头像。", "Allow photo-library access before choosing an avatar.")
        );
        return;
      }

      const picker = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
      });
      if (picker.canceled || !picker.assets.length) return;

      const asset = picker.assets[0];
      setUploadingProfileAvatar(true);
      const uploaded = await uploadFileV2({
        uri: asset.uri,
        name: asset.fileName || `profile-avatar-${Date.now()}.jpg`,
        mimeType: inferImageMimeType(asset.fileName, asset.mimeType),
      });
      setProfileAvatarInput((uploaded.url || "").trim());
    } catch (error) {
      Alert.alert(
        tr("头像上传失败", "Avatar Upload Failed"),
        error instanceof Error ? error.message : tr("请稍后重试。", "Please try again later.")
      );
    } finally {
      setUploadingProfileAvatar(false);
    }
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
      const providerUserId =
        credential.user?.trim() || appleSubjectFromIdentityToken(credential.identityToken);
      if (!providerUserId) {
        throw new Error("APPLE_PROVIDER_USER_ID_MISSING");
      }

      await signInWithApple({
        id: providerUserId,
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
      const isMissingProviderUserID = rawMessage === "APPLE_PROVIDER_USER_ID_MISSING";
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
        : isMissingProviderUserID
          ? tr(
              "无法获取 Apple 用户标识。请在系统设置中关闭并重新开启本 App 的“使用 Apple 登录”后重试。",
              "Could not read Apple account identifier. Disable and re-enable Sign in with Apple for this app in Settings, then try again."
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
    const avatar = profileAvatarInput.trim();
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
      await completeProfile({ displayName: name, email, avatar: avatar || undefined });
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
    <KeyframeBackground>
      <SafeAreaView edges={APP_SAFE_AREA_EDGES} style={authStyles.safeArea}>
        <KeyboardAvoidingView
          style={authStyles.keyboardAvoid}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
        >
          <ScrollView
            testID="auth-sign-in-scroll"
            contentContainerStyle={authStyles.container}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={authStyles.heroCard}>
              <View style={authStyles.heroBadge}>
                <Text style={authStyles.heroBadgeText}>{tr("安全登录", "Secure Access")}</Text>
              </View>
              <View style={authStyles.heroHeader}>
                <View style={authStyles.logoCircle}>
                  <Ionicons name="planet" size={24} color={AUTH_COLORS.primary} />
                </View>
                <View style={authStyles.heroCopy}>
                  <Text style={authStyles.title}>{tr("欢迎回来", "Welcome back")}</Text>
                  <Text style={authStyles.subtitle}>
                    {tr(
                      "延续你的 AgentTown 会话、好友关系和跨端同步。",
                      "Resume your AgentTown sessions, contacts, and cross-platform sync."
                    )}
                  </Text>
                </View>
              </View>
              <View style={authStyles.heroPillRow}>
                <View style={authStyles.heroPill}>
                  <Text style={authStyles.heroPillText}>{tr("Apple / Google", "Apple / Google")}</Text>
                </View>
                <View style={authStyles.heroPill}>
                  <Text style={authStyles.heroPillText}>{tr("邮箱 / 短信", "Email / SMS")}</Text>
                </View>
                <View style={authStyles.heroPill}>
                  <Text style={authStyles.heroPillText}>{tr("iOS / Android / Web", "iOS / Android / Web")}</Text>
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
            <View style={styles.modeTabs}>
              <Pressable
                style={[styles.modeTab, authMode === "sign_in" && styles.modeTabActive]}
                onPress={() => setAuthMode("sign_in")}
              >
                <Text style={[styles.modeTabText, authMode === "sign_in" && styles.modeTabTextActive]}>
                  {tr("登录", "Sign In")}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.modeTab, authMode === "sign_up" && styles.modeTabActive]}
                onPress={() => setAuthMode("sign_up")}
              >
                <Text style={[styles.modeTabText, authMode === "sign_up" && styles.modeTabTextActive]}>
                  {tr("注册", "Sign Up")}
                </Text>
              </Pressable>
            </View>

            {authMode === "sign_in" ? (
              <>
                <View style={authStyles.card}>
                  <View style={authStyles.cardHeader}>
                    <Text style={authStyles.cardTitle}>{tr("快捷登录", "OAuth Sign-In")}</Text>
                    <Text style={authStyles.cardSubtitle}>
                      {tr("如果设备已经信任账号，这通常是最快的登录方式。", "Fastest option when your device already trusts the provider.")}
                    </Text>
                  </View>

                  <View style={styles.oauthStack}>
                    <Pressable
                      style={[authStyles.secondaryBtn, styles.googleBtn, (busyKey !== null || !googleRequest) && authStyles.btnDisabled]}
                      disabled={busyKey !== null || !googleRequest}
                      onPress={handleGoogleSignIn}
                    >
                      {busyKey === "google" ? (
                        <ActivityIndicator size="small" color={AUTH_COLORS.text} />
                      ) : (
                        <Ionicons name="logo-google" size={16} color={AUTH_COLORS.text} />
                      )}
                      <Text style={styles.oauthBtnText}>{tr("使用 Google 继续", "Continue with Google")}</Text>
                    </Pressable>

                    <Pressable
                      style={[authStyles.primaryBtn, styles.appleBtn, busyKey !== null && authStyles.btnDisabled]}
                      disabled={busyKey !== null}
                      onPress={handleAppleSignIn}
                    >
                      {busyKey === "apple" ? (
                        <ActivityIndicator size="small" color="#ffffff" />
                      ) : (
                        <Ionicons name="logo-apple" size={16} color="#ffffff" />
                      )}
                      <Text style={authStyles.primaryBtnText}>{tr("使用 Apple 继续", "Continue with Apple")}</Text>
                    </Pressable>
                  </View>
                </View>

                <View style={authStyles.card}>
                  <View style={styles.innerTabs}>
                    <Pressable
                      style={[styles.innerTab, signInMethod === "email" && styles.innerTabActive]}
                      onPress={() => setSignInMethod("email")}
                    >
                      <Text style={[styles.innerTabText, signInMethod === "email" && styles.innerTabTextActive]}>
                        {tr("邮箱", "Email")}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.innerTab, signInMethod === "phone" && styles.innerTabActive]}
                      onPress={() => setSignInMethod("phone")}
                    >
                      <Text style={[styles.innerTabText, signInMethod === "phone" && styles.innerTabTextActive]}>
                        {tr("短信", "Phone")}
                      </Text>
                    </Pressable>
                  </View>

                  {signInMethod === "email" ? (
                    <>
                      <View style={authStyles.cardHeader}>
                        <Text style={authStyles.cardTitle}>{tr("邮箱和密码", "Email & Password")}</Text>
                        <Text style={authStyles.cardSubtitle}>
                          {tr("支持系统自动填充，适合长期账号登录。", "Supports system autofill and works best for persistent accounts.")}
                        </Text>
                      </View>

                      <View style={authStyles.inputGroup}>
                        <Text style={authStyles.label}>{tr("邮箱", "Email")}</Text>
                        <TextInput
                          testID="auth-email-input"
                          style={authStyles.input}
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
                          testID="auth-password-input"
                          style={authStyles.input}
                          value={password}
                          onChangeText={setPassword}
                          placeholder={tr("输入你的账号密码", "Enter your password")}
                          placeholderTextColor={AUTH_PLACEHOLDER_COLOR}
                          secureTextEntry
                          autoCapitalize="none"
                          autoCorrect={false}
                          autoComplete="current-password"
                          textContentType="password"
                          returnKeyType="done"
                          onSubmitEditing={handlePasswordSignIn}
                        />
                      </View>

                      <View style={authStyles.ghostRow}>
                        <Pressable
                          style={[authStyles.ghostBtn, busyKey !== null && authStyles.btnDisabled]}
                          disabled={busyKey !== null}
                          onPress={() => setAuthMode("sign_up")}
                        >
                          <Text style={authStyles.ghostBtnText}>{tr("创建账号", "Create Account")}</Text>
                        </Pressable>
                        <Pressable
                          style={[authStyles.ghostBtn, busyKey !== null && authStyles.btnDisabled]}
                          disabled={busyKey !== null}
                          onPress={() => router.push("./forgot-password")}
                        >
                          <Text style={authStyles.ghostBtnText}>{tr("忘记密码？", "Forgot Password?")}</Text>
                        </Pressable>
                      </View>

                      {__DEV__ ? (
                        <Pressable
                          style={[authStyles.secondaryBtn, busyKey !== null && authStyles.btnDisabled]}
                          disabled={busyKey !== null}
                          onPress={handleFillDevAccount}
                        >
                          <Ionicons name="sparkles-outline" size={16} color={AUTH_COLORS.text} />
                          <Text style={authStyles.secondaryBtnText}>{tr("填充管理员账号（DEV）", "Fill Local Admin (DEV)")}</Text>
                        </Pressable>
                      ) : null}

                      <Pressable
                        testID="auth-password-login-button"
                        style={[authStyles.primaryBtn, busyKey !== null && authStyles.btnDisabled]}
                        disabled={busyKey !== null}
                        onPress={handlePasswordSignIn}
                      >
                        {busyKey === "password" ? (
                          <ActivityIndicator size="small" color="#ffffff" />
                        ) : (
                          <Ionicons name="log-in-outline" size={16} color="#ffffff" />
                        )}
                        <Text style={authStyles.primaryBtnText}>{tr("登录", "Sign In")}</Text>
                      </Pressable>
                    </>
                  ) : (
                    <>
                      <View style={authStyles.cardHeader}>
                        <Text style={authStyles.cardTitle}>{tr("短信验证码", "SMS Verification")}</Text>
                        <Text style={authStyles.cardSubtitle}>
                          {tr("作为备用登录方式，适合临时回到账号。", "Alternative sign-in method when you need quick account access.")}
                        </Text>
                      </View>

                      <View style={authStyles.inputGroup}>
                        <Text style={authStyles.label}>{tr("手机号", "Phone Number")}</Text>
                        <TextInput
                          style={authStyles.input}
                          value={phone}
                          onChangeText={setPhone}
                          placeholder={language === "zh" ? "+86 13800138000" : "+1 415 555 0123"}
                          placeholderTextColor={AUTH_PLACEHOLDER_COLOR}
                          keyboardType="phone-pad"
                          autoCapitalize="none"
                          autoCorrect={false}
                          autoComplete="tel"
                          textContentType="telephoneNumber"
                          returnKeyType="next"
                          onSubmitEditing={() => otpInputRef.current?.focus()}
                        />
                      </View>

                      <Pressable
                        style={[authStyles.secondaryBtn, busyKey !== null && authStyles.btnDisabled]}
                        disabled={busyKey !== null}
                        onPress={handleSendCode}
                      >
                        {busyKey === "phone" ? (
                          <ActivityIndicator size="small" color={AUTH_COLORS.text} />
                        ) : (
                          <Ionicons name="chatbox-ellipses-outline" size={16} color={AUTH_COLORS.text} />
                        )}
                        <Text style={authStyles.secondaryBtnText}>{tr("发送验证码", "Send Code")}</Text>
                      </Pressable>

                      <View style={authStyles.inputGroup}>
                        <Text style={authStyles.label}>{tr("验证码", "Verification Code")}</Text>
                        <TextInput
                          ref={otpInputRef}
                          style={authStyles.input}
                          value={otpCode}
                          onChangeText={setOtpCode}
                          placeholder={tr("6 位验证码", "6-digit code")}
                          placeholderTextColor={AUTH_PLACEHOLDER_COLOR}
                          keyboardType="number-pad"
                          autoCapitalize="none"
                          autoCorrect={false}
                          autoComplete="one-time-code"
                          textContentType="oneTimeCode"
                          returnKeyType="done"
                          onSubmitEditing={handleVerifyCode}
                        />
                      </View>

                      <Pressable
                        style={[authStyles.primaryBtn, busyKey !== null && authStyles.btnDisabled]}
                        disabled={busyKey !== null}
                        onPress={handleVerifyCode}
                      >
                        <Ionicons name="log-in-outline" size={16} color="#ffffff" />
                        <Text style={authStyles.primaryBtnText}>{tr("验证并登录", "Verify and Sign In")}</Text>
                      </Pressable>
                      <Text style={authStyles.helperText}>{otpTimeText}</Text>
                      {__DEV__ && devOtpHint ? (
                        <Text style={authStyles.devHint}>{tr("开发验证码", "DEV CODE")}: {devOtpHint}</Text>
                      ) : null}
                    </>
                  )}
                </View>

                <View style={authStyles.card}>
                  <View style={authStyles.cardHeader}>
                    <Text style={authStyles.cardTitle}>{tr("快速体验", "Quick Start")}</Text>
                    <Text style={authStyles.cardSubtitle}>
                      {tr("先进入产品体验，再决定是否绑定正式账号。", "Enter the product first, then decide whether to bind a full account.")}
                    </Text>
                  </View>
                  <Pressable
                    testID="auth-guest-login-button"
                    style={[authStyles.secondaryBtn, busyKey !== null && authStyles.btnDisabled]}
                    disabled={busyKey !== null}
                    onPress={handleGuestSignIn}
                  >
                    {busyKey === "guest" ? (
                      <ActivityIndicator size="small" color={AUTH_COLORS.text} />
                    ) : (
                      <Ionicons name="walk-outline" size={16} color={AUTH_COLORS.text} />
                    )}
                    <Text style={authStyles.secondaryBtnText}>{tr("游客模式继续", "Continue as Guest")}</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <View style={authStyles.card}>
                <View style={authStyles.cardHeader}>
                  <Text style={authStyles.cardTitle}>{tr("邮箱注册", "Email Sign-Up")}</Text>
                  <Text style={authStyles.cardSubtitle}>
                    {tr("注册与登录分开后，首屏更清晰；这里只保留创建账号所需字段。", "Registration stays separate so the first screen stays focused.")}
                  </Text>
                </View>

                <View style={authStyles.inputGroup}>
                  <Text style={authStyles.label}>{tr("邮箱", "Email")}</Text>
                  <TextInput
                    style={authStyles.input}
                    value={signUpEmail}
                    onChangeText={setSignUpEmail}
                    placeholder={tr("you@example.com", "you@example.com")}
                    placeholderTextColor={AUTH_PLACEHOLDER_COLOR}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="email"
                    textContentType="emailAddress"
                    returnKeyType="next"
                    onSubmitEditing={() => signUpPasswordInputRef.current?.focus()}
                  />
                </View>

                <View style={authStyles.inputGroup}>
                  <Text style={authStyles.label}>{tr("密码", "Password")}</Text>
                  <TextInput
                    ref={signUpPasswordInputRef}
                    style={authStyles.input}
                    value={signUpPassword}
                    onChangeText={setSignUpPassword}
                    placeholder={tr("至少 8 位，建议混合字母和数字", "At least 8 characters; mix letters and numbers")}
                    placeholderTextColor={AUTH_PLACEHOLDER_COLOR}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="new-password"
                    textContentType="newPassword"
                    returnKeyType="next"
                    onSubmitEditing={() => signUpConfirmPasswordInputRef.current?.focus()}
                  />
                </View>

                <View style={authStyles.inputGroup}>
                  <Text style={authStyles.label}>{tr("确认密码", "Confirm Password")}</Text>
                  <TextInput
                    ref={signUpConfirmPasswordInputRef}
                    style={authStyles.input}
                    value={signUpConfirmPassword}
                    onChangeText={setSignUpConfirmPassword}
                    placeholder={tr("再次输入密码", "Enter password again")}
                    placeholderTextColor={AUTH_PLACEHOLDER_COLOR}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="new-password"
                    textContentType="newPassword"
                    returnKeyType="done"
                    onSubmitEditing={handlePasswordSignUp}
                  />
                </View>

                <Text style={authStyles.helperText}>{tr("创建成功后会自动登录当前设备。", "The app signs you in automatically after account creation.")}</Text>

                <Pressable
                  style={[authStyles.primaryBtn, busyKey !== null && authStyles.btnDisabled]}
                  disabled={busyKey !== null}
                  onPress={handlePasswordSignUp}
                >
                  {busyKey === "password" ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Ionicons name="person-add-outline" size={16} color="#ffffff" />
                  )}
                  <Text style={authStyles.primaryBtnText}>{tr("注册并登录", "Create Account")}</Text>
                </Pressable>
              </View>
            )}

            {showProfileSetup ? (
              <View style={authStyles.card}>
                <View style={authStyles.cardHeader}>
                  <Text style={authStyles.cardTitle}>{tr("完善 Apple 账号信息", "Complete Apple Account Profile")}</Text>
                  <Text style={authStyles.cardSubtitle}>
                    {tr(
                      "如果你选择了隐藏邮箱，需要先补全可联系信息。",
                      "If you chose Hide My Email, complete a reachable profile before entering the app."
                    )}
                  </Text>
                </View>

                <View style={authStyles.inputGroup}>
                  <Text style={authStyles.label}>{tr("用户名", "Username")}</Text>
                  <TextInput
                    style={authStyles.input}
                    value={profileName}
                    onChangeText={setProfileName}
                    placeholder={tr("例如 Jason", "For example Jason")}
                    placeholderTextColor={AUTH_PLACEHOLDER_COLOR}
                    autoCapitalize="words"
                    autoCorrect={false}
                    autoComplete="name"
                    textContentType="name"
                    returnKeyType="next"
                  />
                </View>

                <View style={authStyles.inputGroup}>
                  <Text style={authStyles.label}>{tr("头像", "Avatar")}</Text>
                  <View style={styles.profileAvatarRow}>
                    {profileAvatarInput ? (
                      <Image source={{ uri: profileAvatarInput }} style={styles.profileAvatarPreview} />
                    ) : (
                      <View style={[styles.profileAvatarPreview, styles.profileAvatarFallback]}>
                        <Ionicons name="person-outline" size={24} color="rgba(226,232,240,0.82)" />
                      </View>
                    )}
                    <View style={styles.profileAvatarActions}>
                      <Pressable
                        style={[authStyles.secondaryBtn, (busyKey !== null || uploadingProfileAvatar) && authStyles.btnDisabled]}
                        disabled={busyKey !== null || uploadingProfileAvatar}
                        onPress={handlePickProfileAvatar}
                      >
                        {uploadingProfileAvatar ? (
                          <ActivityIndicator size="small" color={AUTH_COLORS.text} />
                        ) : (
                          <Ionicons name="image-outline" size={16} color={AUTH_COLORS.text} />
                        )}
                        <Text style={authStyles.secondaryBtnText}>{tr("上传头像", "Upload Avatar")}</Text>
                      </Pressable>
                      <TextInput
                        style={authStyles.input}
                        value={profileAvatarInput}
                        onChangeText={setProfileAvatarInput}
                        placeholder={tr("或粘贴头像 URL", "Or paste avatar URL")}
                        placeholderTextColor={AUTH_PLACEHOLDER_COLOR}
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                    </View>
                  </View>
                </View>

                <View style={authStyles.inputGroup}>
                  <Text style={authStyles.label}>{tr("可联系邮箱", "Reachable Email")}</Text>
                  <TextInput
                    style={authStyles.input}
                    value={profileEmail}
                    onChangeText={setProfileEmail}
                    placeholder={tr("you@example.com", "you@example.com")}
                    placeholderTextColor={AUTH_PLACEHOLDER_COLOR}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="email"
                    textContentType="emailAddress"
                    returnKeyType="done"
                    onSubmitEditing={handleCompleteProfile}
                  />
                </View>

                <Pressable
                  style={[authStyles.primaryBtn, busyKey !== null && authStyles.btnDisabled]}
                  disabled={busyKey !== null}
                  onPress={handleCompleteProfile}
                >
                  {busyKey === "profile" ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Ionicons name="checkmark-done-outline" size={16} color="#ffffff" />
                  )}
                  <Text style={authStyles.primaryBtnText}>{tr("保存并继续", "Save and Continue")}</Text>
                </Pressable>
              </View>
            ) : null}

            <View style={authStyles.card}>
              <View style={authStyles.cardHeader}>
                <Text style={authStyles.cardTitle}>{tr("短信验证码", "SMS Verification")}</Text>
                <Text style={authStyles.cardSubtitle}>
                  {tr("作为备用登录方式，适合临时回到账号。", "Alternative sign-in method when you need quick account access.")}
                </Text>
              </View>

              <View style={authStyles.inputGroup}>
                <Text style={authStyles.label}>{tr("手机号", "Phone Number")}</Text>
                <TextInput
                  style={authStyles.input}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder={language === "zh" ? "+86 13800138000" : "+1 415 555 0123"}
                  placeholderTextColor={AUTH_PLACEHOLDER_COLOR}
                  keyboardType="phone-pad"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="tel"
                  textContentType="telephoneNumber"
                  returnKeyType="next"
                  onSubmitEditing={() => otpInputRef.current?.focus()}
                />
              </View>

              <Pressable
                style={[authStyles.secondaryBtn, busyKey !== null && authStyles.btnDisabled]}
                disabled={busyKey !== null}
                onPress={handleSendCode}
              >
                {busyKey === "phone" ? (
                  <ActivityIndicator size="small" color={AUTH_COLORS.text} />
                ) : (
                  <Ionicons name="chatbox-ellipses-outline" size={16} color={AUTH_COLORS.text} />
                )}
                <Text style={authStyles.secondaryBtnText}>{tr("发送验证码", "Send Code")}</Text>
              </Pressable>

              <View style={authStyles.inputGroup}>
                <Text style={authStyles.label}>{tr("验证码", "Verification Code")}</Text>
                <TextInput
                  ref={otpInputRef}
                  style={authStyles.input}
                  value={otpCode}
                  onChangeText={setOtpCode}
                  placeholder={tr("6 位验证码", "6-digit code")}
                  placeholderTextColor={AUTH_PLACEHOLDER_COLOR}
                  keyboardType="number-pad"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="one-time-code"
                  textContentType="oneTimeCode"
                  returnKeyType="done"
                  onSubmitEditing={handleVerifyCode}
                />
              </View>

              <Pressable
                style={[authStyles.primaryBtn, busyKey !== null && authStyles.btnDisabled]}
                disabled={busyKey !== null}
                onPress={handleVerifyCode}
              >
                <Ionicons name="log-in-outline" size={16} color="#ffffff" />
                <Text style={authStyles.primaryBtnText}>{tr("验证并登录", "Verify and Sign In")}</Text>
              </Pressable>
              <Text style={authStyles.helperText}>{otpTimeText}</Text>
              {__DEV__ && devOtpHint ? (
                <Text style={authStyles.devHint}>{tr("开发验证码", "DEV CODE")}: {devOtpHint}</Text>
              ) : null}
            </View>

            <View style={authStyles.card}>
              <View style={authStyles.cardHeader}>
                <Text style={authStyles.cardTitle}>{tr("快速体验", "Quick Start")}</Text>
                <Text style={authStyles.cardSubtitle}>
                  {tr("先进入产品体验，再决定是否绑定正式账号。", "Enter the product first, then decide whether to bind a full account.")}
                </Text>
              </View>
              <Pressable
                testID="auth-guest-login-button"
                style={[authStyles.secondaryBtn, busyKey !== null && authStyles.btnDisabled]}
                disabled={busyKey !== null}
                onPress={handleGuestSignIn}
              >
                {busyKey === "guest" ? (
                  <ActivityIndicator size="small" color={AUTH_COLORS.text} />
                ) : (
                  <Ionicons name="walk-outline" size={16} color={AUTH_COLORS.text} />
                )}
                <Text style={authStyles.secondaryBtnText}>{tr("游客模式继续", "Continue as Guest")}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </KeyframeBackground>
  );
}

const styles = StyleSheet.create({
  modeTabs: {
    flexDirection: "row",
    gap: 8,
    padding: 6,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.18)",
    backgroundColor: "rgba(9,14,27,0.72)",
  },
  modeTab: {
    flex: 1,
    minHeight: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,23,42,0.62)",
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.16)",
  },
  modeTabActive: {
    backgroundColor: "rgba(37,99,235,0.82)",
    borderColor: "rgba(147,197,253,0.4)",
  },
  modeTabText: {
    color: AUTH_COLORS.textSoft,
    fontSize: 14,
    fontWeight: "800",
  },
  modeTabTextActive: {
    color: "#ffffff",
  },
  innerTabs: {
    flexDirection: "row",
    gap: 8,
    padding: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.16)",
    backgroundColor: "rgba(2,6,23,0.32)",
  },
  innerTab: {
    flex: 1,
    minHeight: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  innerTabActive: {
    backgroundColor: "rgba(37,99,235,0.22)",
    borderWidth: 1,
    borderColor: "rgba(147,197,253,0.28)",
  },
  innerTabText: {
    color: AUTH_COLORS.textMuted,
    fontSize: 13,
    fontWeight: "700",
  },
  innerTabTextActive: {
    color: AUTH_COLORS.text,
  },
  oauthStack: {
    gap: 10,
  },
  googleBtn: {
    backgroundColor: "rgba(15, 23, 42, 0.92)",
  },
  appleBtn: {
    backgroundColor: "#1d4ed8",
  },
  oauthBtnText: {
    color: AUTH_COLORS.text,
    fontSize: 14,
    fontWeight: "700",
  },
  profileAvatarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  profileAvatarPreview: {
    width: 72,
    height: 72,
    borderRadius: 22,
  },
  profileAvatarFallback: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.18)",
    backgroundColor: "rgba(15,23,42,0.72)",
  },
  profileAvatarActions: {
    flex: 1,
    gap: 8,
  },
});
