import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  Composer,
  type ComposerProps,
  GiftedChat,
  type IMessage,
  InputToolbar,
  type InputToolbarProps,
} from "react-native-gifted-chat";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { KeyframeBackground } from "@/src/components/KeyframeBackground";
import { EmptyState, LoadingSkeleton, StateBanner } from "@/src/components/StateBlocks";
import { APP_SAFE_AREA_EDGES } from "@/src/constants/safe-area";
import { tx } from "@/src/i18n/translate";
import {
  formatApiError,
  getNPC,
  listNPCSessionMessages,
  listNPCSessions,
  type V2ChatSessionMessage,
} from "@/src/lib/api";
import { runChatCompletions } from "@/src/services/chatAssist";
import { useAgentTown } from "@/src/state/agenttown-context";
import { useAuth } from "@/src/state/auth-context";
import type { NPC } from "@/src/types";

type GiftedNPCMessage = IMessage & {
  role: "user" | "assistant";
};

type KeyboardTarget = "chat";

const KEYBOARD_CLEARANCE = 25;
const KEYBOARD_CLEARANCE_IOS = 25;

function parseSessionId(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const row = payload as { session_id?: unknown; sessionId?: unknown };
  if (typeof row.session_id === "string" && row.session_id.trim()) return row.session_id.trim();
  if (typeof row.sessionId === "string" && row.sessionId.trim()) return row.sessionId.trim();
  return "";
}

function toGiftedNPCMessage(
  row: V2ChatSessionMessage,
  currentUserId: string,
  npcName: string,
  index: number
): GiftedNPCMessage {
  const role = (row.role || "").trim().toLowerCase() === "user" ? "user" : "assistant";
  const createdAtValue = row.created_at || row.updated_at;
  const parsedTime =
    typeof createdAtValue === "number"
      ? new Date(createdAtValue > 1_000_000_000_000 ? createdAtValue : createdAtValue * 1000)
      : new Date(Date.parse(String(createdAtValue || "")) || Date.now() + index);
  return {
    _id: row.id || `${role}_${index}_${parsedTime.getTime()}`,
    text: typeof row.content === "string" ? row.content : "",
    createdAt: parsedTime,
    user: {
      _id: role === "user" ? currentUserId || "me" : "npc_assistant",
      name: role === "user" ? "Me" : npcName || "NPC",
    },
    role,
  };
}

export default function NPCChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { npcId, name, sessionId: routeSessionId } = useLocalSearchParams<{
    npcId: string;
    name?: string;
    sessionId?: string;
  }>();
  const { language } = useAgentTown();
  const { user } = useAuth();
  const tr = (zh: string, en: string) => tx(language, zh, en);
  const currentUserId = (user?.id || "").trim();

  const [npc, setNpc] = useState<NPC | null>(null);
  const [messages, setMessages] = useState<GiftedNPCMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [input, setInput] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const keyboardPadding = useRef(new Animated.Value(0)).current;
  const activeKeyboardTargetRef = useRef<KeyboardTarget | null>(null);
  const lastKeyboardHeightRef = useRef(0);
  const lastKeyboardDurationRef = useRef(0);

  const npcName = useMemo(() => npc?.name || name || tr("NPC 对话", "NPC Chat"), [name, npc?.name, tr]);
  const sendDisabled = sending || input.trim().length === 0;
  const ContainerView = Animated.View;
  const containerStyle = [styles.container, { paddingBottom: keyboardPadding }];

  const loadMessages = useCallback(
    async (nextSessionId: string, nextNpcName: string) => {
      if (!npcId || !nextSessionId) {
        setMessages([]);
        return;
      }
      const rows = await listNPCSessionMessages(npcId, nextSessionId);
      const mapped = rows
        .map((row, index) => toGiftedNPCMessage(row, currentUserId, nextNpcName, index))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setMessages(mapped);
    },
    [currentUserId, npcId]
  );

  const loadConversation = useCallback(async () => {
    if (!npcId) return;
    setLoading(true);
    try {
      const [npcDetail, sessions] = await Promise.all([
        getNPC(npcId),
        listNPCSessions(npcId, { limit: 20 }),
      ]);
      const resolvedSessionId =
        String(routeSessionId || "").trim() || sessions[0]?.id || "";
      setNpc(npcDetail);
      setSessionId(resolvedSessionId);
      await loadMessages(resolvedSessionId, npcDetail.name || String(name || ""));
      setError(null);
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }, [loadMessages, name, npcId, routeSessionId]);

  useEffect(() => {
    void loadConversation();
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [loadConversation]);

  const animateKeyboardValue = useCallback((value: Animated.Value, toValue: number, duration: number) => {
    Animated.timing(value, {
      toValue,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, []);

  const resetKeyboardOffsets = useCallback(
    (duration: number) => {
      animateKeyboardValue(keyboardPadding, 0, duration);
    },
    [animateKeyboardValue, keyboardPadding]
  );

  const applyKeyboardAvoidance = useCallback(
    (keyboardHeight: number, duration: number) => {
      const target = activeKeyboardTargetRef.current;
      if (!target || keyboardHeight <= 0) {
        resetKeyboardOffsets(duration);
        return;
      }
      const clearance = Platform.OS === "ios" ? KEYBOARD_CLEARANCE_IOS : KEYBOARD_CLEARANCE;
      const usableKeyboardHeight =
        Platform.OS === "ios"
          ? Math.max(0, keyboardHeight - insets.bottom)
          : Math.max(0, keyboardHeight);
      animateKeyboardValue(keyboardPadding, usableKeyboardHeight + clearance, duration);
    },
    [animateKeyboardValue, insets.bottom, keyboardPadding, resetKeyboardOffsets]
  );

  useEffect(() => {
    const isIOS = Platform.OS === "ios";
    const handleFrame = (event?: { endCoordinates?: { height?: number }; duration?: number }) => {
      const height = Math.max(0, event?.endCoordinates?.height ?? 0);
      const duration = event?.duration ?? (isIOS ? 250 : 200);
      lastKeyboardHeightRef.current = height;
      lastKeyboardDurationRef.current = duration;
      applyKeyboardAvoidance(height, duration);
    };
    const handleHide = (event?: { duration?: number }) => {
      const duration = event?.duration ?? (isIOS ? 200 : 180);
      lastKeyboardHeightRef.current = 0;
      lastKeyboardDurationRef.current = duration;
      resetKeyboardOffsets(duration);
    };
    const showEvent = isIOS ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = isIOS ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, handleFrame);
    const hideSub = Keyboard.addListener(hideEvent, handleHide);
    const didHideSub = Keyboard.addListener("keyboardDidHide", handleHide);
    const changeSub = isIOS ? Keyboard.addListener("keyboardWillChangeFrame", handleFrame) : null;
    return () => {
      showSub.remove();
      hideSub.remove();
      didHideSub.remove();
      changeSub?.remove();
    };
  }, [applyKeyboardAvoidance, resetKeyboardOffsets]);

  const setKeyboardTarget = useCallback(
    (target: KeyboardTarget | null) => {
      activeKeyboardTargetRef.current = target;
      if (!target) {
        resetKeyboardOffsets(lastKeyboardDurationRef.current || 120);
        return;
      }
      if (lastKeyboardHeightRef.current > 0) {
        applyKeyboardAvoidance(lastKeyboardHeightRef.current, lastKeyboardDurationRef.current || 120);
      }
    },
    [applyKeyboardAvoidance, resetKeyboardOffsets]
  );

  const handleSend = useCallback(
    async (outgoing: IMessage[] = []) => {
      const text = String(outgoing[0]?.text || input).trim();
      if (!npcId || !text || sending) return;

      const localUserId = `npc_user_${Date.now()}`;
      const localAssistantId = `npc_assistant_${Date.now()}`;
      const localUserMessage: GiftedNPCMessage = {
        _id: localUserId,
        text,
        createdAt: new Date(),
        user: {
          _id: currentUserId || "me",
          name: user?.displayName || "Me",
        },
        role: "user",
      };
      const localAssistantMessage: GiftedNPCMessage = {
        _id: localAssistantId,
        text: "",
        createdAt: new Date(Date.now() + 1),
        user: {
          _id: "npc_assistant",
          name: npcName,
        },
        role: "assistant",
      };

      setMessages((prev) => GiftedChat.append(prev, [localAssistantMessage, localUserMessage]));
      setSending(true);
      setError(null);
      setInput("");

      const controller = new AbortController();
      abortRef.current = controller;
      let latestText = "";
      let resolvedSessionId = sessionId;

      try {
        await runChatCompletions(
          {
            input: text,
            session_id: resolvedSessionId || undefined,
            path: `/v2/npc/${encodeURIComponent(npcId)}/chat`,
          },
          {
            onEvent: (_eventName, payload) => {
              const nextSessionId = parseSessionId(payload);
              if (nextSessionId) {
                resolvedSessionId = nextSessionId;
              }
            },
            onText: (streamText) => {
              latestText = streamText;
              setMessages((prev) =>
                prev.map((item) =>
                  item._id === localAssistantId
                    ? {
                        ...item,
                        text: streamText,
                      }
                    : item
                )
              );
            },
          },
          controller.signal
        );

        if (resolvedSessionId) {
          setSessionId(resolvedSessionId);
          if (!latestText.trim()) {
            await loadMessages(resolvedSessionId, npcName);
          }
        } else if (latestText.trim()) {
          setMessages((prev) =>
            prev.map((item) =>
              item._id === localAssistantId
                ? {
                    ...item,
                    text: latestText,
                  }
                : item
            )
          );
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(formatApiError(err));
          setMessages((prev) => prev.filter((item) => item._id !== localAssistantId));
        }
      } finally {
        abortRef.current = null;
        setSending(false);
      }
    },
    [
      currentUserId,
      loadMessages,
      npcId,
      npcName,
      sending,
      sessionId,
      input,
      user?.displayName,
    ]
  );

  const renderToolbarComposer = useCallback(
    (props: ComposerProps) => {
      const upstreamOnFocus = props?.textInputProps?.onFocus;
      const upstreamOnBlur = props?.textInputProps?.onBlur;
      const upstreamOnChangeText = props?.textInputProps?.onChangeText as ((value: string) => void) | undefined;
      return (
        <View style={styles.inputBox}>
          <Composer
            {...props}
            textInputStyle={styles.input}
            placeholderTextColor="rgba(148,163,184,0.9)"
            textInputProps={{
              ...(props?.textInputProps || {}),
              testID: "chat-message-input",
              nativeID: "chat-message-input",
              accessibilityLabel: "chat-message-input",
              showSoftInputOnFocus: true,
              editable: !sending,
              maxLength: 4000,
              onChangeText: (value: string) => {
                props.onTextChanged?.(value);
                upstreamOnChangeText?.(value);
                setInput(value);
              },
              onFocus: (event) => {
                upstreamOnFocus?.(event);
                setKeyboardTarget("chat");
              },
              onBlur: (event) => {
                upstreamOnBlur?.(event);
                setKeyboardTarget(null);
              },
            }}
          />
        </View>
      );
    },
    [sending, setKeyboardTarget]
  );

  const renderToolbarSend = useCallback(
    () => (
      <Pressable
        testID="chat-send-button"
        style={[styles.sendBtn, sendDisabled && styles.sendBtnDisabled]}
        onPress={() => {
          void handleSend();
        }}
        disabled={sendDisabled}
      >
        <Ionicons name="arrow-up" size={18} color="#0b1220" />
      </Pressable>
    ),
    [handleSend, sendDisabled]
  );

  const renderChatInputToolbar = useCallback(
    (props: InputToolbarProps<IMessage>) => (
      <InputToolbar
        {...props}
        containerStyle={styles.toolbarContainer}
        primaryStyle={styles.toolbarPrimary}
        renderComposer={renderToolbarComposer}
        renderSend={renderToolbarSend}
      />
    ),
    [renderToolbarComposer, renderToolbarSend]
  );

  return (
    <KeyframeBackground>
      <SafeAreaView edges={APP_SAFE_AREA_EDGES} style={[styles.safeArea, { paddingBottom: insets.bottom }]}>
        <KeyboardAvoidingView
          style={styles.keyboardAvoid}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={0}
          enabled={false}
        >
        <ContainerView style={containerStyle}>
          <View style={styles.headerRow}>
            <Pressable style={styles.backBtn} onPress={() => router.back()}>
              <Ionicons name="chevron-back" size={18} color="#e2e8f0" />
            </Pressable>
            <View style={styles.headerMain}>
              <Text style={styles.title} numberOfLines={1}>
                {npcName}
              </Text>
              <Text style={styles.subtitle}>{tr("NPC Chat", "NPC Chat")}</Text>
            </View>
            <Pressable
              style={styles.editBtn}
              onPress={() =>
                router.push({
                  pathname: "/npc-config/[npcId]" as never,
                  params: { npcId, entrySource: "chat" } as never,
                })
              }
            >
              <Text style={styles.editText}>Edit</Text>
            </Pressable>
          </View>

          {error ? (
            <StateBanner
              variant="error"
              title={tr("对话失败", "Chat failed")}
              message={error}
              actionLabel={tr("重试", "Retry")}
              onAction={() => void loadConversation()}
            />
          ) : null}

          {loading ? (
            <LoadingSkeleton kind="messages" />
          ) : (
            <View style={styles.chatWrap}>
              <GiftedChat
                messages={messages}
                onSend={(rows) => void handleSend(rows)}
                user={{
                  _id: currentUserId || "me",
                  name: user?.displayName || "Me",
                }}
                text={input}
                onInputTextChanged={setInput}
                alwaysShowSend
                placeholder={tr("输入消息...", "Type a message...")}
                renderChatEmpty={() => (
                  <View style={styles.emptyWrap}>
                    <View style={styles.emptyWrapFixed}>
                    <EmptyState
                      title={tr("还没有对话内容", "No messages yet")}
                      hint={tr("发一条消息开始和 NPC 对话", "Send a message to start chatting")}
                      icon="chatbubble-ellipses-outline"
                    />
                    </View>
                  </View>
                )}
                renderInputToolbar={renderChatInputToolbar}
                minInputToolbarHeight={56}
                isKeyboardInternallyHandled={false}
                keyboardShouldPersistTaps="handled"
                messagesContainerStyle={styles.messageContainer}
                renderFooter={() => <View style={styles.messageListSpacer} />}
              />
            </View>
          )}
        </ContainerView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </KeyframeBackground>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "transparent",
  },
  keyboardAvoid: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 10,
    gap: 10,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
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
  headerMain: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: "#f8fafc",
    fontSize: 16,
    fontWeight: "900",
  },
  subtitle: {
    color: "rgba(148,163,184,0.92)",
    fontSize: 12,
    fontWeight: "700",
  },
  editBtn: {
    minHeight: 40,
    borderRadius: 16,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(191,219,254,0.18)",
    backgroundColor: "rgba(30,41,59,0.55)",
  },
  editText: {
    color: "rgba(191,219,254,0.96)",
    fontSize: 12,
    fontWeight: "900",
  },
  chatWrap: {
    flex: 1,
    marginTop: 4,
  },
  messageContainer: {
    flex: 1,
  },
  messageListSpacer: {
    height: 15,
  },
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  emptyWrapFixed: {
    transform: [{ scaleY: -1 }],
    width: "100%",
  },
  toolbarContainer: {
    borderTopWidth: 0,
    backgroundColor: "transparent",
    paddingHorizontal: 0,
  },
  toolbarPrimary: {
    alignItems: "stretch",
    gap: 10,
    paddingTop: 0,
  },
  inputBox: {
    flex: 1,
    minHeight: 44,
    justifyContent: "center",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(15,23,42,0.55)",
    paddingHorizontal: 12,
  },
  input: {
    color: "#f8fafc",
    fontSize: 17,
    lineHeight: 22,
    paddingTop: 9,
    paddingBottom: 9,
    includeFontPadding: false,
    textAlignVertical: "center",
    maxHeight: 120,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e2e8f0",
  },
  sendBtnDisabled: {
    opacity: 0.55,
  },
});
