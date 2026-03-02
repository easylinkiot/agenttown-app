import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import {
  authGuest,
  authLogin,
  authMe,
  authProvider,
  authRegister,
  authRequestPasswordResetCode,
  authResetPassword,
  authUpdateProfile,
  authVerifyPasswordResetCode,
  setAuthToken,
} from "@/src/lib/api";
import { AuthUser } from "@/src/types";
import { getE2ELaunchArgs, isE2ETestMode } from "@/src/utils/e2e";

export type AuthMethod = "guest" | "google" | "apple" | "phone" | "password";

interface PhoneOtpState {
  code: string;
  expiresAt: number;
  attempts: number;
}

interface AuthContextValue {
  isHydrated: boolean;
  user: AuthUser | null;
  token: string | null;
  isSignedIn: boolean;
  signInAsGuest: () => Promise<void>;
  signUpWithPassword: (email: string, password: string) => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signInWithGoogle: (input: {
    id: string;
    name?: string | null;
    email?: string | null;
    avatar?: string | null;
    idToken?: string | null;
  }) => Promise<void>;
  signInWithApple: (input: {
    id: string;
    name?: string | null;
    email?: string | null;
    identityToken?: string | null;
  }) => Promise<void>;
  sendPhoneCode: (phone: string) => Promise<{ expiresAt: number; devCode?: string }>;
  verifyPhoneCode: (phone: string, code: string) => Promise<void>;
  requestPasswordResetCode: (email: string) => Promise<{
    message?: string;
    expiresAt?: string;
    verificationCode?: string;
    devCode?: string;
    retryAfterSeconds?: number;
  }>;
  verifyPasswordResetCode: (email: string, code: string) => Promise<{ resetToken: string; resetTokenExpiresAt?: string }>;
  resetPassword: (input: { email: string; resetToken: string; password: string }) => Promise<{ ok?: boolean; message?: string }>;
  completeProfile: (input: { displayName: string; email: string }) => Promise<void>;
  signOut: () => Promise<void>;
}

interface PersistedSession {
  token: string;
  user: AuthUser;
}

const SESSION_KEY = "agenttown.auth.session.v2";
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const E2E_LOCAL_TOKEN = "agenttown-e2e-token";
export const AUTH_ERROR_PHONE_INVALID = "AUTH_PHONE_INVALID";
export const AUTH_ERROR_OTP_NOT_REQUESTED = "AUTH_OTP_NOT_REQUESTED";
export const AUTH_ERROR_OTP_EXPIRED = "AUTH_OTP_EXPIRED";
export const AUTH_ERROR_OTP_INVALID = "AUTH_OTP_INVALID";

const AuthContext = createContext<AuthContextValue | null>(null);

export function normalizePhone(phone: string) {
  const value = phone.trim().replace(/[^\d+]/g, "");
  if (!value || value.length < 7) {
    throw new Error(AUTH_ERROR_PHONE_INVALID);
  }
  return value;
}

export function displayNameFromEmail(email?: string | null) {
  if (!email) return null;
  const [local] = email.split("@");
  return local || null;
}

export function defaultDisplayNameForEmail(email: string) {
  return displayNameFromEmail(email.trim()) || "Member";
}

export function defaultDisplayNameForApple(input: {
  id: string;
  name?: string | null;
  email?: string | null;
}) {
  const fromName = input.name?.trim();
  if (fromName) return fromName;

  const fromEmail = displayNameFromEmail(input.email);
  if (fromEmail) return fromEmail;

  const suffix = input.id.trim().slice(-6);
  return suffix ? `Apple User ${suffix}` : "Apple User";
}

function mapBackendUser(input: {
  id: string;
  provider: string;
  displayName: string;
  email?: string;
  requireProfileSetup?: boolean;
  role?: "admin" | "member" | "guest";
  createdAt: string;
  updatedAt?: string;
}): AuthUser {
  return {
    id: input.id,
    provider: (input.provider as AuthMethod) || "guest",
    displayName: input.displayName,
    email: input.email,
    requireProfileSetup: Boolean(input.requireProfileSetup),
    role: input.role || "guest",
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const isE2E = isE2ETestMode();
  const e2eArgs = getE2ELaunchArgs();
  const e2eAuthEmailFromArgs =
    typeof e2eArgs?.e2eAuthEmail === "string" ? e2eArgs.e2eAuthEmail.trim() : "";
  const e2eAuthPasswordFromArgs =
    typeof e2eArgs?.e2eAuthPassword === "string" ? e2eArgs.e2eAuthPassword : "";
  const e2eAuthEmailFromEnv = (process.env.EXPO_PUBLIC_E2E_AUTH_EMAIL || "").trim();
  const e2eAuthPasswordFromEnv = process.env.EXPO_PUBLIC_E2E_AUTH_PASSWORD || "";
  const e2eAuthEmail = e2eAuthEmailFromArgs || e2eAuthEmailFromEnv;
  const e2eAuthPassword = e2eAuthPasswordFromArgs || e2eAuthPasswordFromEnv;
  const [isHydrated, setIsHydrated] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const otpMapRef = useRef<Map<string, PhoneOtpState>>(new Map());

  const persistSession = useCallback(async (next: PersistedSession | null) => {
    if (!next) {
      await AsyncStorage.removeItem(SESSION_KEY);
      return;
    }
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(next));
  }, []);

  const applySession = useCallback(
    async (next: PersistedSession | null, persist = true) => {
      setUser(next?.user || null);
      setToken(next?.token || null);
      setAuthToken(next?.token || null);
      if (persist) {
        await persistSession(next);
      }
    },
    [persistSession]
  );

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        if (e2eAuthEmail && e2eAuthPassword) {
          try {
            const session = await authLogin({
              email: e2eAuthEmail,
              password: e2eAuthPassword,
            });
            if (!alive) return;
            await applySession({
              token: session.token,
              user: mapBackendUser(session.user),
            });
            return;
          } catch {
            // Fall back to persisted session if E2E credentials fail.
          }
        }

        const raw = await AsyncStorage.getItem(SESSION_KEY);
        if (!raw) return;

        const parsed = JSON.parse(raw) as Partial<PersistedSession>;
        if (!parsed?.token || !parsed?.user?.id) {
          await AsyncStorage.removeItem(SESSION_KEY);
          return;
        }

        await applySession(
          {
            token: parsed.token,
            user: parsed.user,
          },
          false
        );

        if (!isE2E) {
          try {
            const me = await authMe();
            if (!alive) return;
            await applySession({ token: parsed.token, user: mapBackendUser(me) });
          } catch {
            if (!alive) return;
            await applySession(null);
          }
        }
      } catch {
        await AsyncStorage.removeItem(SESSION_KEY);
      } finally {
        if (alive) {
          setIsHydrated(true);
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, [applySession, e2eAuthEmail, e2eAuthPassword, isE2E]);

  const signInAsGuest = useCallback(async () => {
    if (isE2E) {
      const now = new Date().toISOString();
      await applySession({
        token: E2E_LOCAL_TOKEN,
        user: {
          id: "e2e-guest-user",
          provider: "guest",
          displayName: "E2E Guest",
          email: "e2e.guest@agenttown.local",
          requireProfileSetup: false,
          role: "guest",
          createdAt: now,
          updatedAt: now,
        },
      });
      return;
    }
    const session = await authGuest("Guest Explorer");
    await applySession({
      token: session.token,
      user: mapBackendUser(session.user),
    });
  }, [applySession, isE2E]);

  const signUpWithPassword = useCallback<AuthContextValue["signUpWithPassword"]>(
    async (email, password) => {
      const normalizedEmail = email.trim();
      const session = await authRegister({
        email: normalizedEmail,
        password,
        displayName: defaultDisplayNameForEmail(normalizedEmail),
      });
      await applySession({ token: session.token, user: mapBackendUser(session.user) });
    },
    [applySession]
  );

  const signInWithPassword = useCallback<AuthContextValue["signInWithPassword"]>(
    async (email, password) => {
      const session = await authLogin({ email: email.trim(), password });
      await applySession({ token: session.token, user: mapBackendUser(session.user) });
    },
    [applySession]
  );

  const requestPasswordResetCode = useCallback<AuthContextValue["requestPasswordResetCode"]>(async (email) => {
    return authRequestPasswordResetCode({ email: email.trim() });
  }, []);

  const verifyPasswordResetCode = useCallback<AuthContextValue["verifyPasswordResetCode"]>(
    async (email, code) => {
      return authVerifyPasswordResetCode({ email: email.trim(), code: code.trim() });
    },
    []
  );

  const resetPassword = useCallback<AuthContextValue["resetPassword"]>(async (input) => {
    return authResetPassword({
      email: input.email.trim(),
      resetToken: input.resetToken.trim(),
      password: input.password,
    });
  }, []);

  const signInWithGoogle = useCallback<AuthContextValue["signInWithGoogle"]>(
    async (input) => {
      const normalizedName = input.name?.trim() || displayNameFromEmail(input.email) || undefined;
      const session = await authProvider({
        provider: "google",
        providerUserId: input.id,
        idToken: input.idToken || undefined,
        email: input.email || undefined,
        displayName: normalizedName,
      });
      const mapped = mapBackendUser(session.user);
      mapped.avatar = input.avatar || undefined;
      await applySession({ token: session.token, user: mapped });
    },
    [applySession]
  );

  const signInWithApple = useCallback<AuthContextValue["signInWithApple"]>(
    async (input) => {
      const normalizedName = defaultDisplayNameForApple(input);
      const session = await authProvider({
        provider: "apple",
        providerUserId: input.id,
        idToken: input.identityToken || undefined,
        email: input.email?.trim() || undefined,
        displayName: normalizedName,
      });
      await applySession({ token: session.token, user: mapBackendUser(session.user) });
    },
    [applySession]
  );

  const completeProfile = useCallback<AuthContextValue["completeProfile"]>(
    async ({ displayName, email }) => {
      const session = await authUpdateProfile({ displayName, email });
      await applySession({
        token: session.token,
        user: mapBackendUser(session.user),
      });
    },
    [applySession]
  );

  const sendPhoneCode = useCallback<AuthContextValue["sendPhoneCode"]>(async (phone) => {
    const normalizedPhone = normalizePhone(phone);
    const nextCode = `${Math.floor(100000 + Math.random() * 900000)}`;
    const expiresAt = Date.now() + OTP_TTL_MS;

    otpMapRef.current.set(normalizedPhone, {
      code: nextCode,
      expiresAt,
      attempts: 0,
    });

    return {
      expiresAt,
      devCode: __DEV__ ? nextCode : undefined,
    };
  }, []);

  const verifyPhoneCode = useCallback<AuthContextValue["verifyPhoneCode"]>(
    async (phone, code) => {
      const normalizedPhone = normalizePhone(phone);
      const normalizedCode = code.trim();
      const record = otpMapRef.current.get(normalizedPhone);
      if (!record) {
        throw new Error(AUTH_ERROR_OTP_NOT_REQUESTED);
      }
      if (Date.now() > record.expiresAt) {
        otpMapRef.current.delete(normalizedPhone);
        throw new Error(AUTH_ERROR_OTP_EXPIRED);
      }
      if (normalizedCode !== record.code) {
        record.attempts += 1;
        if (record.attempts >= OTP_MAX_ATTEMPTS) {
          otpMapRef.current.delete(normalizedPhone);
        } else {
          otpMapRef.current.set(normalizedPhone, record);
        }
        throw new Error(AUTH_ERROR_OTP_INVALID);
      }

      otpMapRef.current.delete(normalizedPhone);
      const session = await authProvider({
        provider: "phone",
        providerUserId: normalizedPhone,
        displayName: `User-${normalizedPhone.slice(-4)}`,
      });

      const mapped = mapBackendUser(session.user);
      mapped.phone = normalizedPhone;
      await applySession({ token: session.token, user: mapped });
    },
    [applySession]
  );

  const signOut = useCallback(async () => {
    await applySession(null);
  }, [applySession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      isHydrated,
      user,
      token,
      isSignedIn: Boolean(user && token && !user.requireProfileSetup),
      signInAsGuest,
      signUpWithPassword,
      signInWithPassword,
      signInWithGoogle,
      signInWithApple,
      sendPhoneCode,
      verifyPhoneCode,
      requestPasswordResetCode,
      verifyPasswordResetCode,
      resetPassword,
      completeProfile,
      signOut,
    }),
    [
      isHydrated,
      user,
      token,
      signInAsGuest,
      signUpWithPassword,
      signInWithPassword,
      signInWithGoogle,
      signInWithApple,
      sendPhoneCode,
      verifyPhoneCode,
      requestPasswordResetCode,
      verifyPasswordResetCode,
      resetPassword,
      completeProfile,
      signOut,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return value;
}
