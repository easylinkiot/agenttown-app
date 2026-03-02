import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";
import * as VideoThumbnails from "expo-video-thumbnails";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  FlatList,
  GestureResponderEvent,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import {
  Composer,
  type ComposerProps,
  GiftedChat,
  IMessage,
  InputToolbar,
  type InputToolbarProps,
  MessageProps,
  SystemMessageProps,
} from "react-native-gifted-chat";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { KeyframeBackground } from "@/src/components/KeyframeBackground";
import { EmptyState, LoadingSkeleton, StateBanner } from "@/src/components/StateBlocks";
import { APP_SAFE_AREA_EDGES } from "@/src/constants/safe-area";
import { tx } from "@/src/i18n/translate";
import {
  agentChat as agentChatApi,
  aiText,
  discoverUsers as discoverUsersApi,
  formatApiError,
  listAgents as listAgentsApi,
  listFriends as listFriendsApi,
  type DiscoverUser,
} from "@/src/lib/api";
import {
  runChatAssist,
  runChatCompletions,
  type AssistCandidate,
  type ChatAssistAction,
  type ChatAssistRequest,
  type ChatCompletionsRequest,
} from "@/src/services/chatAssist";
import { useAgentTown } from "@/src/state/agenttown-context";
import { useAuth } from "@/src/state/auth-context";
import {
  Agent,
  ChatThread,
  ConversationMessage,
  Friend,
  ThreadDisplayLanguage,
  ThreadMember,
} from "@/src/types";
import { isE2ETestMode } from "@/src/utils/e2e";

type MemberFilter = "all" | "human" | "agent" | "role";
type MemberCandidate = {
  key: string;
  type: "human" | "agent";
  group: "humans" | "agents";
  label: string;
  desc: string;
  onAdd: () => Promise<void>;
};
type GiftedMessage = IMessage & { raw: ConversationMessage };
type SystemMessageRenderProps = { currentMessage?: GiftedMessage | null };
type KeyboardTarget = "chat" | "askAI";
type PlusPanelItem = {
  key: "image" | "video" | "camera" | "voice" | "contact";
  icon: React.ComponentProps<typeof Ionicons>["name"];
  zh: string;
  en: string;
};
type MediaPickerAsset = {
  id: string;
  type: "image" | "video";
  uri: string;
  thumbUri: string;
  duration?: number;
  filename?: string;
  width?: number;
  height?: number;
  fileSize?: number;
  capturedAt?: number;
};
type CameraCapturedPayload = {
  uri: string;
  type: "image";
  width?: number;
  height?: number;
  fileSize?: number;
  capturedAt?: number;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const MESSAGE_FALLBACK_GAP = 1000;
const DEV_STREAM_CHUNK_SIZE = 1;
const DEV_STREAM_INTERVAL_MS = 50;
const KEYBOARD_CLEARANCE = 25;
const KEYBOARD_CLEARANCE_IOS = 25;
const PLUS_PANEL_BASE_HEIGHT = 300;
const PLUS_PANEL_ANIM_DURATION = 220;
const PLUS_PANEL_INPUT_GAP = 20;
const MEDIA_SHEET_ANIM_DURATION = 220;
const MEDIA_SHEET_DRAG_CLOSE_DISTANCE = 120;
const MEDIA_GRID_MIN_ITEM_SIZE = 80;
const MEDIA_GRID_GAP = 8;
const PLUS_PANEL_ITEMS: PlusPanelItem[] = [
  { key: "image", icon: "image-outline", zh: "图片", en: "Image" },
  { key: "video", icon: "videocam-outline", zh: "视频", en: "Video" },
  { key: "camera", icon: "camera-outline", zh: "相机", en: "Camera" },
  { key: "voice", icon: "mic-outline", zh: "语音", en: "Voice" },
  { key: "contact", icon: "person-circle-outline", zh: "个人名片", en: "Contact Card" },
];
const THREAD_LANGUAGE_OPTIONS: { key: ThreadDisplayLanguage; label: string }[] = [
  { key: "zh", label: "中" },
  { key: "en", label: "En" },
  { key: "de", label: "De" },
];

function formatMediaDuration(totalSeconds?: number) {
  if (!totalSeconds || totalSeconds <= 0) return "00:00";
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function mentionMemberIDs(text: string, members: ThreadMember[]) {
  const safe = text.trim();
  if (!safe) return [] as string[];

  const ids: string[] = [];
  for (const member of members) {
    const name = member.name?.trim();
    if (!name) continue;
    if (safe.includes(`@${name}`)) {
      ids.push(member.id);
    }
  }
  return ids;
}

function toGiftedMessage(
  message: ConversationMessage,
  currentUserId: string,
  fallbackTime: number
): GiftedMessage {
  const senderID = (message.senderId || "").trim();
  const isMe = senderID !== "" && currentUserId ? senderID === currentUserId : Boolean(message.isMe);
  const parsedTime = message.time ? Date.parse(message.time) : Number.NaN;
  const createdAt = Number.isFinite(parsedTime) ? new Date(parsedTime) : new Date(fallbackTime);

  return {
    _id: message.id || `${fallbackTime}`,
    text: message.content || "",
    createdAt,
    user: {
      _id: isMe ? currentUserId || "me" : message.senderId || message.senderName || "other",
      name: message.senderName,
      avatar: message.senderAvatar,
    },
    system: message.type === "system",
    raw: message,
  };
}

function isCurrentUserMessage(message: ConversationMessage, currentUserId: string) {
  const senderID = (message.senderId || "").trim();
  if (senderID !== "" && currentUserId) {
    return senderID === currentUserId;
  }
  return Boolean(message.isMe);
}

function isLikelySameMessage(a: GiftedMessage, b: GiftedMessage) {
  if (a.text !== b.text) return false;
  const aSender = a.raw.senderId || a.user._id;
  const bSender = b.raw.senderId || b.user._id;
  if (aSender && bSender && aSender !== bSender) return false;
  const diff = Math.abs(new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  return diff < 120000;
}

function normalizeDisplayedContent(content: string, senderName?: string) {
  const text = (content || "").trim();
  const speaker = (senderName || "").trim();
  if (!text || !speaker) return text;

  const lowerText = text.toLowerCase();
  const lowerSpeaker = speaker.toLowerCase();
  const prefixes = [lowerSpeaker + ":", lowerSpeaker + "：", "**" + lowerSpeaker + ":**", "**" + lowerSpeaker + "：**"];

  for (const prefix of prefixes) {
    if (lowerText.startsWith(prefix) && text.length >= prefix.length) {
      const next = text.slice(prefix.length).trim();
      if (next) return next;
    }
  }
  return text;
}

function extractSessionIdFromSSEPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const row = payload as { session_id?: unknown; sessionId?: unknown };
  const snake = typeof row.session_id === "string" ? row.session_id.trim() : "";
  if (snake) return snake;
  const camel = typeof row.sessionId === "string" ? row.sessionId.trim() : "";
  return camel;
}

function isMyBotChatThreadId(threadId: string) {
  const id = (threadId || "").trim().toLowerCase();
  if (!id) return false;
  return id === "mybot" || id === "agent_mybot";
}

function resolveGroupOwnerId(thread: ChatThread) {
  const alias = thread as ChatThread & {
    group_commander_user_id?: string;
    commanderUserId?: string;
    ownerUserId?: string;
    owner_user_id?: string;
    createdByUserId?: string;
    created_by_user_id?: string;
    creatorUserId?: string;
    creator_user_id?: string;
  };
  const candidates = [
    thread.groupCommanderUserId,
    alias.group_commander_user_id,
    alias.commanderUserId,
    alias.ownerUserId,
    alias.owner_user_id,
    alias.createdByUserId,
    alias.created_by_user_id,
    alias.creatorUserId,
    alias.creator_user_id,
  ];
  for (const value of candidates) {
    const id = (value || "").trim();
    if (id) return id;
  }
  return "";
}

function isBotLikeName(value?: string) {
  const name = (value || "").trim();
  if (!name) return false;
  return /\bbot\b/i.test(name) || name.includes("助理");
}

function inferAvatarTagFromSender(message: ConversationMessage): "NPC" | "Bot" | null {
  const senderType = (message.senderType || "").trim().toLowerCase();
  const senderID = (message.senderId || "").trim().toLowerCase();
  const senderName = (message.senderName || "").trim();

  if (senderType === "human") return null;
  if (senderType.includes("bot")) return "Bot";
  if (senderType.includes("agent") || senderType.includes("npc") || senderType.includes("role")) {
    return "NPC";
  }
  if (senderID === "agent_mybot" || senderID.startsWith("agent_userbot_")) return "Bot";
  if (senderID.startsWith("agent_")) return "NPC";
  if (isBotLikeName(senderName)) return "Bot";
  if (/\bnpc\b/i.test(senderName)) return "NPC";
  return null;
}

function inferAvatarTagFromMember(member: ThreadMember): "NPC" | "Bot" | null {
  if (member.memberType === "human") return null;
  if (member.memberType === "role") return "NPC";
  if (member.memberType === "agent") {
    const agentID = (member.agentId || "").trim().toLowerCase();
    if (agentID === "agent_mybot" || agentID.startsWith("agent_userbot_")) return "Bot";
    if (isBotLikeName(member.name)) return "Bot";
    return "NPC";
  }
  return null;
}

export default function ChatDetailScreen() {
  const isE2E = isE2ETestMode();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const { user } = useAuth();
  const isDraggingRef = useRef(false);
  const bubbleHeightsRef = useRef<Record<string, number>>({});
  const params = useLocalSearchParams<{
    id: string;
    name?: string;
    avatar?: string;
    isGroup?: string;
    highlightMessageId?: string;
  }>();

  const chatId = String(params.id || "");
  const highlightMessageId = String(params.highlightMessageId || "");

  const {
    chatThreads,
    messagesByThread,
    threadMembers,
    friends,
    agents,
    botConfig,
    language,
    threadLanguageById,
    refreshThreadMessages,
    loadOlderMessages,
    sendMessage,
    createTaskFromMessage,
    createFriend,
    listMembers,
    addMember,
    removeMember,
    removeFriend,
    removeChatThread,
    generateRoleReplies,
    updateThreadLanguage,
  } = useAgentTown();
  const messagesByThreadRef = useRef(messagesByThread);

  const tr = (zh: string, en: string) => tx(language, zh, en);
  const threadDisplayLanguage: ThreadDisplayLanguage = threadLanguageById[chatId] || language || "en";

  const openEntityConfig = useCallback(
    (entity: { entityType: "human" | "bot" | "npc"; entityId?: string; name?: string; avatar?: string }) => {
      const currentUser = (user?.id || "").trim();
      if (entity.entityType === "human" && entity.entityId && entity.entityId === currentUser) {
        router.push("/config" as never);
        return;
      }
      router.push({
        pathname: "/entity-config",
        params: {
          entityType: entity.entityType,
          entityId: entity.entityId || "",
          name: entity.name || "",
          avatar: entity.avatar || "",
        },
      });
    },
    [router, user?.id]
  );

  const thread = useMemo(() => {
    const found = chatThreads.find((t) => t.id === chatId);
    if (found) return found;

    return {
      id: chatId,
      name: params.name || tr("未知会话", "Unknown chat"),
      avatar: params.avatar || botConfig.avatar,
      message: "",
      time: tr("刚刚", "Now"),
      isGroup: params.isGroup === "true",
      supportsVideo: true,
    };
  }, [botConfig.avatar, chatId, chatThreads, params.avatar, params.isGroup, params.name, tr]);

  const members = threadMembers[chatId] || [];
  const messages = messagesByThread[chatId] || [];
  const linkedFriend = useMemo(() => friends.find((item) => item.threadId === chatId), [chatId, friends]);
  const currentUserId = (user?.id || "").trim();

  const isSelfThreadMember = useCallback(
    (member: ThreadMember) => {
      if (!currentUserId || member.memberType !== "human") return false;
      const memberLike = member as ThreadMember & { userId?: string; user_id?: string };
      const directMemberUserId = (memberLike.userId || memberLike.user_id || "").trim();
      if (directMemberUserId && directMemberUserId === currentUserId) return true;

      const friendId = (member.friendId || "").trim();
      if (friendId) {
        const relatedFriend = friends.find((item) => item.id === friendId);
        const friendUserId = (relatedFriend?.userId || "").trim();
        if (friendUserId && friendUserId === currentUserId) return true;
      }

      return (member.id || "").trim() === currentUserId;
    },
    [currentUserId, friends]
  );

  const isGroupOwner = useMemo(() => {
    if (!thread.isGroup || !currentUserId) return false;
    const ownerId = resolveGroupOwnerId(thread);
    if (ownerId) return ownerId === currentUserId;

    // Backward compatibility: for legacy groups with missing owner metadata,
    // treat the earliest human member as the creator/owner.
    const humans = members.filter((item) => item.memberType === "human");
    if (humans.length === 0) return false;
    const earliestHuman = [...humans].sort((a, b) => {
      const at = Date.parse(a.createdAt || "");
      const bt = Date.parse(b.createdAt || "");
      if (Number.isFinite(at) && Number.isFinite(bt) && at !== bt) return at - bt;
      return 0;
    })[0];
    return isSelfThreadMember(earliestHuman);
  }, [currentUserId, isSelfThreadMember, members, thread, thread.isGroup]);

  const canOperateThreadMember = useCallback(
    (member: ThreadMember) => {
      if (!thread.isGroup) return false;
      if (isSelfThreadMember(member)) return true;
      return isGroupOwner;
    },
    [isGroupOwner, isSelfThreadMember, thread.isGroup]
  );
  const giftedUserId = currentUserId || "me";
  useEffect(() => {
    messagesByThreadRef.current = messagesByThread;
  }, [messagesByThread]);

  const keyboardPadding = useRef(new Animated.Value(0)).current;
  const aiKeyboardShift = useRef(new Animated.Value(0)).current;
  const aiCardRef = useRef<View>(null);
  const activeKeyboardTargetRef = useRef<KeyboardTarget | null>(null);
  const lastKeyboardHeightRef = useRef(0);
  const lastKeyboardDurationRef = useRef(0);
  const keyboardVisibleRef = useRef(false);
  const plusButtonPressingRef = useRef(false);
  const plusPressedFromKeyboardRef = useRef(false);
  const isPlusPanelVisibleRef = useRef(false);
  const pendingOpenPanelAfterKeyboardHideRef = useRef(false);
  const pendingKeyboardFromPanelRef = useRef(false);
  const [isPanelVisible, setIsPanelVisible] = useState(false);
  const plusPanelBottomInset = Math.max(insets.bottom, 10);
  const plusPanelHeight = useMemo(
    () => PLUS_PANEL_BASE_HEIGHT + plusPanelBottomInset,
    [plusPanelBottomInset]
  );
  const plusPanelLiftOffset = useMemo(
    () => Math.max(0, plusPanelHeight - insets.bottom + PLUS_PANEL_INPUT_GAP),
    [insets.bottom, plusPanelHeight]
  );
  const plusPanelTranslateY = useRef(new Animated.Value(plusPanelHeight + 20)).current;
  const plusPanelOpacity = useRef(new Animated.Value(0)).current;
  const isMediaSheetVisibleRef = useRef(false);
  const mediaSheetTranslateY = useRef(new Animated.Value(windowHeight)).current;
  const mediaSheetDragOffset = useRef(new Animated.Value(0)).current;
  const mediaSheetBackdropOpacity = useRef(new Animated.Value(0)).current;
  const [isMediaSheetVisible, setIsMediaSheetVisible] = useState(false);
  const [mediaSending, setMediaSending] = useState(false);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [mediaAssets, setMediaAssets] = useState<MediaPickerAsset[]>([]);
  const [selectedMediaIds, setSelectedMediaIds] = useState<Set<string>>(new Set());
  const mediaLoadSeqRef = useRef(0);
  const hasRequestedCameraPermissionRef = useRef(false);
  const cameraCaptureInFlightRef = useRef(false);
  const mediaSheetBottomInset = Math.max(insets.bottom, 12);
  const mediaSheetHeight = useMemo(() => {
    const maxHeight = Math.max(360, windowHeight - insets.top - 56);
    return Math.min(maxHeight, Math.max(360, Math.round(windowHeight * 0.72)));
  }, [insets.top, windowHeight]);
  const mediaGridColumns = windowWidth >= 420 ? 4 : 3;
  const mediaItemSize = useMemo(() => {
    const horizontalPadding = 16 * 2;
    const totalGap = MEDIA_GRID_GAP * (mediaGridColumns - 1);
    const available = Math.max(0, windowWidth - horizontalPadding - totalGap);
    return Math.max(MEDIA_GRID_MIN_ITEM_SIZE, Math.floor(available / mediaGridColumns));
  }, [mediaGridColumns, windowWidth]);
  const selectedAssets = useMemo(
    () => mediaAssets.filter((asset) => selectedMediaIds.has(asset.id)),
    [mediaAssets, selectedMediaIds]
  );

  const emitCameraCaptured = useCallback((asset: MediaPickerAsset) => {
    const payload: CameraCapturedPayload = {
      uri: asset.uri,
      type: "image",
      width: asset.width,
      height: asset.height,
      fileSize: asset.fileSize,
      capturedAt: asset.capturedAt,
    };
    console.log("[chat-camera] onCaptured", payload);
  }, []);

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
      animateKeyboardValue(aiKeyboardShift, 0, duration);
    },
    [aiKeyboardShift, animateKeyboardValue, keyboardPadding]
  );

  const applyKeyboardAvoidance = useCallback(
    (keyboardHeight: number, duration: number) => {
      const target = activeKeyboardTargetRef.current;
      if (!target || keyboardHeight <= 0) {
        resetKeyboardOffsets(duration);
        return;
      }

      if (target === "chat") {
        const clearance = Platform.OS === "ios" ? KEYBOARD_CLEARANCE_IOS : KEYBOARD_CLEARANCE;
        const usableKeyboardHeight =
          Platform.OS === "ios"
            ? Math.max(0, keyboardHeight - insets.bottom)
            : Math.max(0, keyboardHeight);
        animateKeyboardValue(keyboardPadding, usableKeyboardHeight + clearance, duration);
        animateKeyboardValue(aiKeyboardShift, 0, duration);
        return;
      }

      const node = aiCardRef.current;

      if (!node) {
        resetKeyboardOffsets(duration);
        return;
      }

      requestAnimationFrame(() => {
        node.measureInWindow((_x, y, _width, height) => {
          const screenHeight = Dimensions.get("screen").height;
          const bottomEdge = Platform.OS === "android" ? screenHeight - insets.bottom : screenHeight;
          const bottom = y + height;
          const distanceToBottom = Math.max(0, bottomEdge - bottom);
          const clearance = Platform.OS === "ios" ? KEYBOARD_CLEARANCE_IOS : KEYBOARD_CLEARANCE;
          const overlap = Math.max(0, keyboardHeight + clearance - distanceToBottom);

          if (target === "askAI") {
            animateKeyboardValue(aiKeyboardShift, overlap, duration);
            animateKeyboardValue(keyboardPadding, 0, duration);
          } else {
            animateKeyboardValue(keyboardPadding, overlap, duration);
            animateKeyboardValue(aiKeyboardShift, 0, duration);
          }
        });
      });
    },
    [aiKeyboardShift, animateKeyboardValue, insets.bottom, keyboardPadding, resetKeyboardOffsets]
  );

  const animatePlusPanel = useCallback(
    (visible: boolean, duration: number) => {
      if (visible) {
        isPlusPanelVisibleRef.current = true;
        setIsPanelVisible(true);
      } else {
        isPlusPanelVisibleRef.current = false;
      }
      Animated.parallel([
        Animated.timing(plusPanelTranslateY, {
          toValue: visible ? 0 : plusPanelHeight + 20,
          duration,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(plusPanelOpacity, {
          toValue: visible ? 1 : 0,
          duration,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (!visible && finished) {
          setIsPanelVisible(false);
        }
      });
    },
    [plusPanelHeight, plusPanelOpacity, plusPanelTranslateY]
  );

  useEffect(() => {
    if (isPanelVisible) return;
    plusPanelTranslateY.setValue(plusPanelHeight + 20);
  }, [isPanelVisible, plusPanelHeight, plusPanelTranslateY]);

  useEffect(() => {
    const isIOS = Platform.OS === "ios";
    const handleFrame = (event?: { endCoordinates?: { height?: number }; duration?: number }) => {
      const height = Math.max(0, event?.endCoordinates?.height ?? 0);
      const duration = event?.duration ?? (isIOS ? 250 : 200);
      lastKeyboardHeightRef.current = height;
      lastKeyboardDurationRef.current = duration;
      keyboardVisibleRef.current = height > 0;
      if (height > 0 && isPlusPanelVisibleRef.current) {
        animatePlusPanel(false, duration);
      }
      applyKeyboardAvoidance(height, duration);
    };
    const handleHide = (event?: { duration?: number }) => {
      const duration = event?.duration ?? (isIOS ? 200 : 180);
      lastKeyboardHeightRef.current = 0;
      lastKeyboardDurationRef.current = duration;
      keyboardVisibleRef.current = false;
      if (pendingOpenPanelAfterKeyboardHideRef.current) {
        pendingOpenPanelAfterKeyboardHideRef.current = false;
        pendingKeyboardFromPanelRef.current = false;
        animateKeyboardValue(keyboardPadding, plusPanelLiftOffset, duration);
        animatePlusPanel(true, duration);
        return;
      }
      if (pendingKeyboardFromPanelRef.current) {
        pendingKeyboardFromPanelRef.current = false;
      }
      if (isPlusPanelVisibleRef.current) {
        animateKeyboardValue(keyboardPadding, plusPanelLiftOffset, duration);
        animateKeyboardValue(aiKeyboardShift, 0, duration);
        return;
      }
      resetKeyboardOffsets(duration);
    };
    const showEvent = isIOS ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = isIOS ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, handleFrame);
    const hideSub = Keyboard.addListener(hideEvent, handleHide);
    const didHideSub = Keyboard.addListener("keyboardDidHide", handleHide);
    const changeSub = isIOS
      ? Keyboard.addListener("keyboardWillChangeFrame", handleFrame)
      : null;
    return () => {
      showSub.remove();
      hideSub.remove();
      didHideSub.remove();
      changeSub?.remove();
    };
  }, [
    aiKeyboardShift,
    animateKeyboardValue,
    animatePlusPanel,
    applyKeyboardAvoidance,
    keyboardPadding,
    plusPanelLiftOffset,
    resetKeyboardOffsets,
  ]);

  const setKeyboardTarget = useCallback(
    (target: KeyboardTarget | null) => {
      activeKeyboardTargetRef.current = target;
      if (!target) {
        if (
          isPlusPanelVisibleRef.current ||
          pendingOpenPanelAfterKeyboardHideRef.current ||
          pendingKeyboardFromPanelRef.current
        ) {
          animateKeyboardValue(aiKeyboardShift, 0, lastKeyboardDurationRef.current || 120);
          return;
        }
        resetKeyboardOffsets(lastKeyboardDurationRef.current || 120);
        return;
      }
      if (target && lastKeyboardHeightRef.current > 0) {
        applyKeyboardAvoidance(lastKeyboardHeightRef.current, lastKeyboardDurationRef.current || 120);
      }
    },
    [aiKeyboardShift, animateKeyboardValue, applyKeyboardAvoidance, resetKeyboardOffsets]
  );

  const showPlusPanel = useCallback(
    (duration: number = PLUS_PANEL_ANIM_DURATION) => {
      pendingOpenPanelAfterKeyboardHideRef.current = false;
      pendingKeyboardFromPanelRef.current = false;
      activeKeyboardTargetRef.current = null;
      animateKeyboardValue(aiKeyboardShift, 0, duration);
      animateKeyboardValue(keyboardPadding, plusPanelLiftOffset, duration);
      animatePlusPanel(true, duration);
    },
    [aiKeyboardShift, animateKeyboardValue, animatePlusPanel, keyboardPadding, plusPanelLiftOffset]
  );

  const hidePlusPanel = useCallback(
    (options?: { duration?: number; keepBottomOffset?: boolean }) => {
      const duration = options?.duration ?? PLUS_PANEL_ANIM_DURATION;
      pendingOpenPanelAfterKeyboardHideRef.current = false;
      animatePlusPanel(false, duration);
      if (!options?.keepBottomOffset) {
        animateKeyboardValue(keyboardPadding, 0, duration);
      }
    },
    [animateKeyboardValue, animatePlusPanel, keyboardPadding]
  );

  const loadMediaAssetsFromLibrary = useCallback(
    async (requestSeq: number) => {
      setMediaLoading(true);
      setMediaError(null);
      try {
        let permission = await MediaLibrary.getPermissionsAsync();
        if (!permission.granted) {
          permission = await MediaLibrary.requestPermissionsAsync();
        }
        if (!permission.granted) {
          if (requestSeq === mediaLoadSeqRef.current) {
            setMediaAssets([]);
            setMediaError(tr("请允许访问系统相册后再试。", "Please grant media-library access and try again."));
          }
          return;
        }

        const page = await MediaLibrary.getAssetsAsync({
          first: 120,
          mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
          sortBy: [MediaLibrary.SortBy.creationTime],
        });

        if (requestSeq !== mediaLoadSeqRef.current) return;
        const mapped: MediaPickerAsset[] = await Promise.all(
          page.assets.map(async (asset) => {
            const isVideo = asset.mediaType === MediaLibrary.MediaType.video;
            let sourceUri = asset.uri;
            let thumbUri = asset.uri;
            if (isVideo) {
              try {
                const info = await MediaLibrary.getAssetInfoAsync(asset.id);
                sourceUri = (info.localUri || info.uri || asset.uri).trim() || asset.uri;
                const thumbnail = await VideoThumbnails.getThumbnailAsync(sourceUri, {
                  time: 0,
                });
                if (thumbnail.uri) {
                  thumbUri = thumbnail.uri;
                } else {
                  thumbUri = sourceUri;
                }
              } catch {
                thumbUri = sourceUri;
              }
            }
            return {
              id: asset.id,
              type: isVideo ? "video" : "image",
              uri: sourceUri,
              thumbUri,
              duration: isVideo ? Math.max(0, Math.round(asset.duration || 0)) : undefined,
              filename: asset.filename,
              width: asset.width || undefined,
              height: asset.height || undefined,
              capturedAt: asset.creationTime || undefined,
            };
          })
        );
        if (requestSeq !== mediaLoadSeqRef.current) return;
        setMediaAssets(mapped);
        if (mapped.length === 0) {
          setMediaError(tr("相册暂无可选媒体。", "No media found in your library."));
        }
      } catch (err) {
        if (requestSeq !== mediaLoadSeqRef.current) return;
        setMediaAssets([]);
        setMediaError(formatApiError(err));
      } finally {
        if (requestSeq === mediaLoadSeqRef.current) {
          setMediaLoading(false);
        }
      }
    },
    [tr]
  );

  const animateMediaSheet = useCallback(
    (visible: boolean, duration: number) => {
      if (visible) {
        isMediaSheetVisibleRef.current = true;
        setIsMediaSheetVisible(true);
      } else {
        isMediaSheetVisibleRef.current = false;
      }
      Animated.parallel([
        Animated.timing(mediaSheetTranslateY, {
          toValue: visible ? 0 : mediaSheetHeight + 24,
          duration,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(mediaSheetBackdropOpacity, {
          toValue: visible ? 1 : 0,
          duration,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (!visible && finished) {
          setIsMediaSheetVisible(false);
        }
      });
    },
    [mediaSheetBackdropOpacity, mediaSheetHeight, mediaSheetTranslateY]
  );

  const closeMediaSheet = useCallback(
    (options?: { clearSelection?: boolean; duration?: number }) => {
      const shouldClear = options?.clearSelection ?? true;
      const duration = options?.duration ?? MEDIA_SHEET_ANIM_DURATION;
      mediaLoadSeqRef.current += 1;
      if (!isMediaSheetVisibleRef.current && !isMediaSheetVisible) {
        if (shouldClear) {
          setSelectedMediaIds(new Set());
          setMediaAssets([]);
          setMediaError(null);
        }
        return;
      }
      mediaSheetDragOffset.setValue(0);
      animateMediaSheet(false, duration);
      if (shouldClear) {
        setSelectedMediaIds(new Set());
        setMediaAssets([]);
        setMediaError(null);
      }
      setMediaLoading(false);
    },
    [animateMediaSheet, isMediaSheetVisible, mediaSheetDragOffset]
  );

  const openMediaSheet = useCallback(() => {
    const requestSeq = mediaLoadSeqRef.current + 1;
    mediaLoadSeqRef.current = requestSeq;
    pendingOpenPanelAfterKeyboardHideRef.current = false;
    pendingKeyboardFromPanelRef.current = false;
    activeKeyboardTargetRef.current = null;
    hidePlusPanel({ duration: PLUS_PANEL_ANIM_DURATION });
    animateKeyboardValue(keyboardPadding, 0, PLUS_PANEL_ANIM_DURATION);
    setSelectedMediaIds(new Set());
    setMediaAssets([]);
    setMediaError(null);
    mediaSheetDragOffset.setValue(0);
    mediaSheetTranslateY.setValue(mediaSheetHeight + 24);
    mediaSheetBackdropOpacity.setValue(0);
    animateMediaSheet(true, MEDIA_SHEET_ANIM_DURATION);
    void loadMediaAssetsFromLibrary(requestSeq);
  }, [
    animateKeyboardValue,
    animateMediaSheet,
    hidePlusPanel,
    keyboardPadding,
    mediaSheetBackdropOpacity,
    mediaSheetDragOffset,
    mediaSheetHeight,
    mediaSheetTranslateY,
    loadMediaAssetsFromLibrary,
  ]);

  useEffect(() => {
    if (isMediaSheetVisible) return;
    mediaSheetTranslateY.setValue(mediaSheetHeight + 24);
    mediaSheetDragOffset.setValue(0);
  }, [isMediaSheetVisible, mediaSheetDragOffset, mediaSheetHeight, mediaSheetTranslateY]);

  const mediaSheetPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          Math.abs(gesture.dy) > Math.abs(gesture.dx) && gesture.dy > 4,
        onPanResponderMove: (_event, gesture) => {
          mediaSheetDragOffset.setValue(Math.max(0, gesture.dy));
        },
        onPanResponderRelease: (_event, gesture) => {
          const shouldClose = gesture.dy > MEDIA_SHEET_DRAG_CLOSE_DISTANCE || gesture.vy > 1.2;
          if (shouldClose) {
            closeMediaSheet();
            return;
          }
          Animated.spring(mediaSheetDragOffset, {
            toValue: 0,
            useNativeDriver: true,
            stiffness: 260,
            damping: 24,
            mass: 0.8,
          }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(mediaSheetDragOffset, {
            toValue: 0,
            useNativeDriver: true,
            stiffness: 260,
            damping: 24,
            mass: 0.8,
          }).start();
        },
      }),
    [closeMediaSheet, mediaSheetDragOffset]
  );

  const toggleMediaSelection = useCallback((assetId: string) => {
    setSelectedMediaIds((prev) => {
      const next = new Set(prev);
      if (next.has(assetId)) {
        next.delete(assetId);
      } else {
        next.add(assetId);
      }
      return next;
    });
  }, []);

  const handleSendSelectedMedia = useCallback(async () => {
    if (!chatId || selectedAssets.length === 0 || mediaSending) return;
    setMediaSending(true);

    const localEntries = selectedAssets.map((asset, index) => {
      const localId = `local_media_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 6)}`;
      const label = asset.type === "video" ? tr("[视频]", "[Video]") : tr("[图片]", "[Image]");
      const localMessage: ConversationMessage = {
        id: localId,
        threadId: chatId,
        senderId: user?.id,
        senderName: user?.displayName || tr("我", "Me"),
        senderAvatar: user?.avatar || botConfig.avatar,
        senderType: "human",
        content: label,
        type: "image",
        imageUri: asset.uri,
        imageName: asset.filename || `${asset.type}_${index + 1}`,
        isMe: true,
        time: tr("刚刚", "Now"),
      };
      return { localId, asset, localMessage };
    });

    setPendingMessages((prev) =>
      GiftedChat.append(
        prev,
        localEntries.map((entry) => toGiftedMessage(entry.localMessage, currentUserId, Date.now()))
      )
    );

    let failedCount = 0;
    for (const entry of localEntries) {
      const content = entry.asset.type === "video" ? tr("[视频]", "[Video]") : tr("[图片]", "[Image]");
      const result = await sendMessage(chatId, {
        content,
        type: "image",
        imageUri: entry.asset.uri,
        imageName: entry.asset.filename || entry.asset.id,
        senderId: user?.id,
        senderName: user?.displayName || tr("我", "Me"),
        senderAvatar: user?.avatar || botConfig.avatar,
        senderType: "human",
        isMe: true,
        requestAI: false,
        systemInstruction: botConfig.systemInstruction,
      });
      if (!result) {
        failedCount += 1;
        setPendingMessages((prev) => prev.filter((message) => message._id !== entry.localId));
      }
    }

    setMediaSending(false);
    if (failedCount > 0) {
      Alert.alert(
        tr("发送失败", "Send failed"),
        tr("部分媒体发送失败，请重试。", "Some media failed to send. Please retry.")
      );
      return;
    }
    closeMediaSheet({ clearSelection: true });
  }, [
    botConfig.avatar,
    botConfig.systemInstruction,
    chatId,
    closeMediaSheet,
    currentUserId,
    mediaSending,
    selectedAssets,
    sendMessage,
    tr,
    user?.avatar,
    user?.displayName,
    user?.id,
  ]);

  const ensureCameraPermission = useCallback(async () => {
    let permission = await ImagePicker.getCameraPermissionsAsync();
    if (permission.granted) return true;

    if (hasRequestedCameraPermissionRef.current) {
      Alert.alert(
        tr("需要相机权限", "Camera permission required"),
        tr("请在系统设置中允许相机访问后再试。", "Enable camera access in system settings and try again.")
      );
      return false;
    }

    hasRequestedCameraPermissionRef.current = true;
    permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.granted) return true;

    Alert.alert(
      tr("需要相机权限", "Camera permission required"),
      tr("未获得相机权限，暂时无法拍照。", "Camera access was not granted, unable to take photos right now.")
    );
    return false;
  }, [tr]);

  const openCameraCapture = useCallback(async () => {
    if (cameraCaptureInFlightRef.current) return;

    cameraCaptureInFlightRef.current = true;
    try {
      if (isE2E) {
        const previewAsset: MediaPickerAsset = {
          id: `camera_e2e_${Date.now()}`,
          type: "image",
          uri: "e2e://camera-capture",
          thumbUri: "e2e://camera-capture",
          filename: "camera_e2e.jpg",
          width: 1179,
          height: 2556,
          capturedAt: Date.now(),
        };
        emitCameraCaptured(previewAsset);
        return;
      }

      const granted = await ensureCameraPermission();
      if (!granted) return;

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 1,
      });

      if (result.canceled || result.assets.length === 0) {
        return;
      }

      const captured = result.assets[0];
      const previewAsset: MediaPickerAsset = {
        id: captured.assetId || `camera_${Date.now()}`,
        type: "image",
        uri: captured.uri,
        thumbUri: captured.uri,
        filename: captured.fileName || undefined,
        width: captured.width || undefined,
        height: captured.height || undefined,
        fileSize: captured.fileSize || undefined,
        capturedAt: Date.now(),
      };
      emitCameraCaptured(previewAsset);
    } catch (err) {
      Alert.alert(tr("拍照失败", "Camera failed"), formatApiError(err));
    } finally {
      cameraCaptureInFlightRef.current = false;
    }
  }, [emitCameraCaptured, ensureCameraPermission, isE2E, tr]);

  const openCameraFlow = useCallback(() => {
    pendingOpenPanelAfterKeyboardHideRef.current = false;
    pendingKeyboardFromPanelRef.current = false;
    activeKeyboardTargetRef.current = null;
    void openCameraCapture();
  }, [openCameraCapture]);

  const handlePlusPanelItemPress = useCallback(
    (key: PlusPanelItem["key"]) => {
      if (key === "camera") {
        openCameraFlow();
        return;
      }
      if (key !== "image") {
        Alert.alert(
          tr("敬请期待", "Coming soon"),
          tr("该功能将在后续版本开放。", "This feature will be enabled in a future update.")
        );
        return;
      }
      if (!chatId) {
        openMediaSheet();
        return;
      }
      router.push({
        pathname: "./media-picker",
        params: {
          chatId,
        },
      });
    },
    [chatId, openCameraFlow, openMediaSheet, router, tr]
  );

  const handleTogglePlusPanel = useCallback(() => {
    const fromKeyboardPress = plusPressedFromKeyboardRef.current;
    plusPressedFromKeyboardRef.current = false;

    if (fromKeyboardPress) {
      pendingKeyboardFromPanelRef.current = false;
      pendingOpenPanelAfterKeyboardHideRef.current = true;
      setKeyboardTarget(null);
      if (keyboardVisibleRef.current || lastKeyboardHeightRef.current > 0) {
        Keyboard.dismiss();
        return;
      }
      if (!isPlusPanelVisibleRef.current) {
        showPlusPanel();
      }
      return;
    }

    if (isPlusPanelVisibleRef.current) {
      hidePlusPanel();
      return;
    }

    const keyboardIsOpen = keyboardVisibleRef.current || lastKeyboardHeightRef.current > 0;
    pendingKeyboardFromPanelRef.current = false;
    if (keyboardIsOpen) {
      pendingOpenPanelAfterKeyboardHideRef.current = true;
    }
    setKeyboardTarget(null);
    if (keyboardIsOpen) {
      Keyboard.dismiss();
      return;
    }
    showPlusPanel();
  }, [hidePlusPanel, setKeyboardTarget, showPlusPanel]);

  const handleChatInputFocus = useCallback(() => {
    pendingOpenPanelAfterKeyboardHideRef.current = false;
    if (isMediaSheetVisibleRef.current) {
      closeMediaSheet();
    }
    if (isPlusPanelVisibleRef.current) {
      pendingKeyboardFromPanelRef.current = true;
      hidePlusPanel({
        duration: PLUS_PANEL_ANIM_DURATION,
        keepBottomOffset: true,
      });
    }
    setKeyboardTarget("chat");
  }, [closeMediaSheet, hidePlusPanel, setKeyboardTarget]);

  const handleChatInputBlur = useCallback(() => {
    if (plusButtonPressingRef.current && (keyboardVisibleRef.current || lastKeyboardHeightRef.current > 0)) {
      pendingOpenPanelAfterKeyboardHideRef.current = true;
      pendingKeyboardFromPanelRef.current = false;
      activeKeyboardTargetRef.current = null;
    }
    pendingKeyboardFromPanelRef.current = false;
    setKeyboardTarget(null);
  }, [setKeyboardTarget]);

  const [devStreamEnabled, setDevStreamEnabled] = useState(__DEV__);
  const [streamingById, setStreamingById] = useState<Record<string, string>>({});
  const streamInitRef = useRef(false);
  const streamTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const streamedIdsRef = useRef<Set<string>>(new Set());
  const myBotSessionIdRef = useRef("");
  const myBotStreamAbortRef = useRef<AbortController | null>(null);
  const [myBotStreaming, setMyBotStreaming] = useState(false);

  const [pendingMessages, setPendingMessages] = useState<GiftedMessage[]>([]);

  const baseGiftedMessages = useMemo(() => {
    const baseTime = Date.now();
    const reversed = [...messages].reverse();
    return reversed.map((message, index) =>
      toGiftedMessage(message, currentUserId, baseTime - index * MESSAGE_FALLBACK_GAP)
    );
  }, [currentUserId, messages]);

  useEffect(() => {
    if (pendingMessages.length === 0) return;
    setPendingMessages((prev) =>
      prev.filter((pending) => !baseGiftedMessages.some((msg) => isLikelySameMessage(pending, msg)))
    );
  }, [baseGiftedMessages, pendingMessages.length]);

  const giftedMessages = useMemo(() => {
    if (pendingMessages.length === 0) return baseGiftedMessages;
    const filteredPending = pendingMessages.filter(
      (pending) => !baseGiftedMessages.some((msg) => isLikelySameMessage(pending, msg))
    );
    return GiftedChat.append(baseGiftedMessages, filteredPending);
  }, [baseGiftedMessages, pendingMessages]);

  const [loading, setLoading] = useState(() => messages.length === 0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [failedDraft, setFailedDraft] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [hasUserScrolled, setHasUserScrolled] = useState(false);

  useEffect(() => {
    setHasMore(true);
    setLoadingOlder(false);
    setPendingMessages([]);
    setHasUserScrolled(false);
    setShowOriginalByMessageId({});
    closeMediaSheet({ clearSelection: true, duration: 0 });
  }, [chatId, closeMediaSheet]);

  const abortMyBotStream = useCallback(() => {
    myBotStreamAbortRef.current?.abort();
    myBotStreamAbortRef.current = null;
    setMyBotStreaming(false);
  }, []);

  const stopAllStreams = useCallback(() => {
    Object.values(streamTimersRef.current).forEach((timer) => clearTimeout(timer));
    streamTimersRef.current = {};
    setStreamingById({});
  }, []);

  useEffect(() => {
    streamInitRef.current = false;
    streamedIdsRef.current = new Set();
    myBotSessionIdRef.current = "";
    abortMyBotStream();
    stopAllStreams();
  }, [abortMyBotStream, chatId, stopAllStreams]);

  useEffect(() => {
    if (devStreamEnabled) return;
    streamInitRef.current = false;
    streamedIdsRef.current = new Set();
    stopAllStreams();
  }, [devStreamEnabled, stopAllStreams]);

  useEffect(() => {
    return () => {
      abortMyBotStream();
    };
  }, [abortMyBotStream]);

  useEffect(() => {
    if (!devStreamEnabled || streamInitRef.current || loading) return;
    streamedIdsRef.current = new Set(messages.map((message) => message.id).filter(Boolean));
    streamInitRef.current = true;
  }, [devStreamEnabled, loading, messages]);

  const startDevStream = useCallback(
    (message: ConversationMessage) => {
      if (!devStreamEnabled) return;
      const id = message.id;
      if (!id) return;
      if (streamTimersRef.current[id]) return;
      const fullText = message.content || "";
      if (!fullText.trim()) return;

      let index = 0;
      const tick = () => {
        index = Math.min(fullText.length, index + DEV_STREAM_CHUNK_SIZE);
        const partial = fullText.slice(0, index);
        setStreamingById((prev) => {
          if (prev[id] === partial) return prev;
          return { ...prev, [id]: partial };
        });
        if (index >= fullText.length) {
          delete streamTimersRef.current[id];
          setStreamingById((prev) => {
            if (!(id in prev)) return prev;
            const next = { ...prev };
            delete next[id];
            return next;
          });
          return;
        }
        streamTimersRef.current[id] = setTimeout(tick, DEV_STREAM_INTERVAL_MS);
      };

      tick();
    },
    [devStreamEnabled]
  );

  useEffect(() => {
    if (!devStreamEnabled || !streamInitRef.current) return;
    if (messages.length === 0) return;

    const tailIds = new Set(
      messages
        .slice(-3)
        .map((message) => message.id)
        .filter(Boolean)
    );
    if (tailIds.size === 0) return;

    const seen = streamedIdsRef.current;
    for (const message of messages) {
      const id = message.id;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      if (!tailIds.has(id)) continue;
      if (isCurrentUserMessage(message, currentUserId)) continue;
      if (!(message.content || "").trim()) continue;
      startDevStream(message);
    }
  }, [currentUserId, devStreamEnabled, messages, startDevStream]);

  const [actionModal, setActionModal] = useState(false);
  const [actionMessage, setActionMessage] = useState<ConversationMessage | null>(null);
  const [actionAnchor, setActionAnchor] = useState<{
    yTop: number;
    yBottom: number;
    align: "left" | "right";
  } | null>(null);
  const [aiCardHeight, setAiCardHeight] = useState(164);
  const [askAI, setAskAI] = useState("");
  const [askAICandidates, setAskAICandidates] = useState<AssistCandidate[]>([]);
  const [askAISelectedIndex, setAskAISelectedIndex] = useState(0);
  const [askAIAction, setAskAIAction] = useState<ChatAssistAction>("ask_anything");
  const [askAIError, setAskAIError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [translatedByMessageId, setTranslatedByMessageId] = useState<
    Record<string, Partial<Record<ThreadDisplayLanguage, string>>>
  >({});
  const [showOriginalByMessageId, setShowOriginalByMessageId] = useState<Record<string, boolean>>({});
  const askAIAbortRef = useRef<AbortController | null>(null);
  const askAIRequestSeqRef = useRef(0);
  const askAIMountedRef = useRef(true);
  const [myBotPanel, setMyBotPanel] = useState(false);
  const [memberNameListModal, setMemberNameListModal] = useState(false);
  const [myBotQuestion, setMyBotQuestion] = useState("");
  const [myBotAnswer, setMyBotAnswer] = useState<string | null>(null);
  const [myBotError, setMyBotError] = useState<string | null>(null);
  const [myBotBusy, setMyBotBusy] = useState(false);

  const [memberModal, setMemberModal] = useState(false);
  const [memberQuery, setMemberQuery] = useState("");
  const [memberFilter, setMemberFilter] = useState<MemberFilter>("all");
  const [memberPoolFriends, setMemberPoolFriends] = useState<Friend[]>([]);
  const [memberPoolAgents, setMemberPoolAgents] = useState<Agent[]>([]);
  const [memberPoolDiscover, setMemberPoolDiscover] = useState<DiscoverUser[]>([]);
  const [memberPoolBusy, setMemberPoolBusy] = useState(false);
  const [memberPoolError, setMemberPoolError] = useState<string | null>(null);
  const [memberPoolNonce, setMemberPoolNonce] = useState(0);
  const [pendingMemberAdds, setPendingMemberAdds] = useState<
    Array<{ key: string; label: string; onAdd: () => Promise<void> }>
  >([]);
  const [memberApplyBusy, setMemberApplyBusy] = useState(false);
  const [threadMenuModal, setThreadMenuModal] = useState(false);

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      if (!chatId) return;
      const prefetched = (messagesByThreadRef.current[chatId] || []).length > 0;
      setLoading(!prefetched);
      setLoadError(null);
      try {
        await refreshThreadMessages(chatId);
        if (thread.isGroup) {
          await listMembers(chatId);
        }
      } catch (err) {
        if (mounted) setLoadError(formatApiError(err));
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void run();
    return () => {
      mounted = false;
    };
  }, [chatId, listMembers, refreshThreadMessages, thread.isGroup]);

  useEffect(() => {
    if (!memberModal) return;
    if (!chatId) return;

    let alive = true;
    setMemberPoolBusy(true);
    setMemberPoolError(null);

    // Keep the current member list fresh when the modal is opened.
    void listMembers(chatId);

    Promise.all([
      listFriendsApi(),
      listAgentsApi(),
      discoverUsersApi(memberQuery.trim() ? memberQuery : undefined),
    ])
      .then(([nextFriends, nextAgents, nextDiscover]) => {
        if (!alive) return;
        setMemberPoolFriends(Array.isArray(nextFriends) ? nextFriends : []);
        setMemberPoolAgents(Array.isArray(nextAgents) ? nextAgents : []);
        setMemberPoolDiscover(Array.isArray(nextDiscover) ? nextDiscover : []);
      })
      .catch((err) => {
        if (!alive) return;
        setMemberPoolError(formatApiError(err));
      })
      .finally(() => {
        if (!alive) return;
        setMemberPoolBusy(false);
      });

    return () => {
      alive = false;
    };
  }, [chatId, listMembers, memberModal, memberPoolNonce, memberQuery]);

  const candidates = useMemo<MemberCandidate[]>(() => {
    const friendPool = memberPoolFriends.length ? memberPoolFriends : friends;
    const agentPool = memberPoolAgents.length ? memberPoolAgents : agents;
    const usedFriendIds = new Set(
      members
        .map((m) => (m.friendId || "").trim())
        .filter(Boolean)
    );
    const usedHumanUserIDs = new Set(
      members
        .filter((m) => m.memberType === "human")
        .map((m) => (m.friendId || "").trim())
        .filter(Boolean)
    );
    const usedAgentIds = new Set(members.map((m) => m.agentId).filter(Boolean));

    const friendItems = friendPool
      // Hide personal/member bots from group add-member candidates.
      // Group should add real users (friends) or explicit Agent/NPC entries.
      .filter((f) => f.kind === "human")
      .filter((f) => {
        const uid = (f.userId || "").trim();
        if (uid && usedHumanUserIDs.has(uid)) return false;
        return !usedFriendIds.has(f.id);
      })
      .map((f) => ({
        key: `friend:${f.id}`,
        type: "human" as const,
        group: "humans" as const,
        label: f.name,
        desc: f.role || f.company || tr("真人", "Human"),
        onAdd: async () => {
          await addMember(chatId, { friendId: f.id, memberType: "human" });
        },
      }));

    const agentItems = agentPool
      .filter((a) => !usedAgentIds.has(a.id))
      .map((a) => ({
        key: `agent:${a.id}`,
        type: "agent" as const,
        group: "agents" as const,
        label: a.name,
        desc: a.persona || a.description || tr("智能体", "Agent"),
        onAdd: async () => {
          await addMember(chatId, { agentId: a.id, memberType: "agent" });
        },
      }));

    const friendUserIDs = new Set(
      friendPool
        .map((f) => (f.userId || "").trim())
        .filter(Boolean)
    );
    const discoverItems = memberPoolDiscover
      .filter((u) => {
        const uid = (u.id || "").trim();
        if (!uid) return false;
        if (friendUserIDs.has(uid)) return false;
        if (usedHumanUserIDs.has(uid)) return false;
        return true;
      })
      .map((u) => ({
        key: `discover:${u.id}`,
        type: "human" as const,
        group: "humans" as const,
        label: u.displayName || tr("用户", "User"),
        desc: [u.email, u.provider].filter(Boolean).join(" · ") || tr("用户", "User"),
        onAdd: async () => {
          setMemberPoolError(null);
          try {
            let friend: Friend | null | undefined = friendPool.find((f) => (f.userId || "").trim() === u.id);
            if (!friend) {
              friend = await createFriend({
                userId: u.id,
                name: u.displayName,
                kind: "human",
              });
            }
            if (!friend) {
              setMemberPoolError(
                tr(
                  "好友邀请已发送。请等待对方接受后再加入群聊。",
                  "Friend invite sent. Add them to the group after they accept."
                )
              );
              return;
            }
            await addMember(chatId, { friendId: friend.id, memberType: "human" });
          } catch (err) {
            setMemberPoolError(formatApiError(err));
            throw err;
          }
        },
      }));

    const all = [...friendItems, ...agentItems, ...discoverItems];
    const keyword = memberQuery.trim().toLowerCase();

    return all.filter((item) => {
      if (memberFilter !== "all" && item.type !== memberFilter) return false;
      if (!keyword) return true;
      return item.label.toLowerCase().includes(keyword) || item.desc.toLowerCase().includes(keyword);
    });
  }, [
    addMember,
    agents,
    chatId,
    createFriend,
    friends,
    listMembers,
    memberFilter,
    memberPoolAgents,
    memberPoolDiscover,
    memberPoolFriends,
    memberQuery,
    members,
    tr,
  ]);

  const selectedMemberKeys = useMemo(
    () => new Set(pendingMemberAdds.map((item) => item.key)),
    [pendingMemberAdds]
  );
  const groupedCandidates = useMemo(
    () =>
      [
        {
          key: "agents",
          title: tr("AI 团队", "AI Team"),
          items: candidates.filter((item) => item.group === "agents"),
        },
        {
          key: "humans",
          title: tr("联系人", "Contacts"),
          items: candidates.filter((item) => item.group === "humans"),
        },
      ].filter((section) => section.items.length > 0),
    [candidates, tr]
  );

  const requestOlder = async () => {
    if (!hasUserScrolled || loadingOlder || !hasMore || !chatId) return;
    setLoadingOlder(true);
    try {
      const added = await loadOlderMessages(chatId);
      if (!added) setHasMore(false);
    } catch {
      // ignore
    } finally {
      setLoadingOlder(false);
    }
  };

  const handleSend = async (override?: string) => {
    const content = (override ?? input).trim();
    if (!content || submitting || !chatId) return;

    const localId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const localMessage: ConversationMessage = {
      id: localId,
      threadId: chatId,
      senderId: user?.id,
      senderName: user?.displayName || tr("我", "Me"),
      senderAvatar: user?.avatar || botConfig.avatar,
      senderType: "human",
      content,
      type: "text",
      isMe: true,
      time: tr("刚刚", "Now"),
    };
    setPendingMessages((prev) => GiftedChat.append(prev, [toGiftedMessage(localMessage, currentUserId, Date.now())]));

    setSubmitting(true);
    setFailedDraft(null);
    setInput("");

    let ok = false;
    let botLocalId = "";
    try {
      if (thread.isGroup) {
        const ids = mentionMemberIDs(content, members);
        await generateRoleReplies(chatId, content, ids.length ? ids : undefined);
        ok = true;
      } else if (isMyBotChatThreadId(chatId)) {
        botLocalId = `local_bot_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const botMessage: ConversationMessage = {
          id: botLocalId,
          threadId: chatId,
          senderId: chatId === "mybot" ? "agent_mybot" : chatId,
          senderName: thread.name || botConfig.name || "MyBot",
          senderAvatar: thread.avatar || botConfig.avatar,
          senderType: "agent",
          content: "",
          type: "text",
          isMe: false,
          time: tr("刚刚", "Now"),
        };
        setPendingMessages((prev) => GiftedChat.append(prev, [toGiftedMessage(botMessage, currentUserId, Date.now())]));

        const controller = new AbortController();
        myBotStreamAbortRef.current = controller;
        setMyBotStreaming(true);
        let latestText = "";
        try {
          const completionsRequest: ChatCompletionsRequest = {
            stream: true,
            input: content,
            prompt: "",
            session_id: myBotSessionIdRef.current,
            target_type: "self",
            target_id: "root",
            bot_owner_user_id: "",
            skill_ids: [],
          };

          await runChatCompletions(
            completionsRequest,
            {
              onText: (text) => {
                if (controller.signal.aborted) return;
                latestText = text;
                setStreamingById((prev) => {
                  if (prev[botLocalId] === text) return prev;
                  return { ...prev, [botLocalId]: text };
                });
              },
              onEvent: (eventName, payload) => {
                if (eventName !== "message_start" && eventName !== "trace") return;
                const nextSessionId = extractSessionIdFromSSEPayload(payload);
                if (nextSessionId) {
                  myBotSessionIdRef.current = nextSessionId;
                }
              },
            },
            controller.signal
          );
        } finally {
          myBotStreamAbortRef.current = null;
          setMyBotStreaming(false);
        }

        const finalText = latestText.trim();
        if (finalText) {
          setPendingMessages((prev) =>
            prev.map((msg) => {
              if (msg._id !== botLocalId) return msg;
              return {
                ...msg,
                text: finalText,
                raw: {
                  ...msg.raw,
                  content: finalText,
                },
              };
            })
          );
          ok = true;
        } else if (controller.signal.aborted) {
          ok = true;
          setPendingMessages((prev) => prev.filter((msg) => msg._id !== botLocalId));
        } else {
          setFailedDraft(content);
          setPendingMessages((prev) => prev.filter((msg) => msg._id !== botLocalId));
        }

        setStreamingById((prev) => {
          if (!(botLocalId in prev)) return prev;
          const next = { ...prev };
          delete next[botLocalId];
          return next;
        });

      } else {
        const result = await sendMessage(chatId, {
          content,
          type: "text",
          senderId: user?.id,
          senderName: user?.displayName || tr("我", "Me"),
          senderAvatar: botConfig.avatar,
          senderType: "human",
          isMe: true,
          requestAI: false,
          systemInstruction: botConfig.systemInstruction,
        });
        if (!result) {
          setFailedDraft(content);
        } else {
          ok = true;
        }
      }
    } catch {
      if (botLocalId) {
        setStreamingById((prev) => {
          if (!(botLocalId in prev)) return prev;
          const next = { ...prev };
          delete next[botLocalId];
          return next;
        });
        setPendingMessages((prev) => prev.filter((msg) => msg._id !== botLocalId));
        myBotStreamAbortRef.current = null;
        setMyBotStreaming(false);
      }
      setFailedDraft(content);
    } finally {
      setSubmitting(false);
      if (!ok) {
        setPendingMessages((prev) => prev.filter((msg) => msg._id !== localId));
      }
    }
  };

  const abortAskAIStream = useCallback(() => {
    askAIAbortRef.current?.abort();
    askAIAbortRef.current = null;
  }, []);

  useEffect(() => {
    askAIMountedRef.current = true;
    return () => {
      askAIMountedRef.current = false;
      abortAskAIStream();
    };
  }, [abortAskAIStream]);

  const closeActionModal = useCallback(() => {
    abortAskAIStream();
    setActionModal(false);
  }, [abortAskAIStream]);

  const runAssistGeneration = useCallback(
    async (action: ChatAssistAction) => {
      if (!actionMessage || isStreaming) return;
      const selectedMessageContent = (actionMessage.content || "").trim();
      if (!selectedMessageContent && action !== "ask_anything") {
        setAskAIError(tr("消息内容为空，无法生成。", "Message is empty and cannot be used."));
        return;
      }

      const requestPayload = {
        action,
        selected_message_id: actionMessage.id,
        selected_message_content: selectedMessageContent,
      } as const;

      if (action === "ask_anything") {
        const question = askAI.trim();
        if (!question) {
          setAskAIError(tr("请输入问题。", "Please enter a question."));
          return;
        }
      }

      abortAskAIStream();
      const controller = new AbortController();
      askAIAbortRef.current = controller;
      const requestSeq = ++askAIRequestSeqRef.current;

      setAskAIAction(action);
      setAskAIError(null);
      setAskAICandidates([]);
      setAskAISelectedIndex(0);
      setIsStreaming(true);

      const assistRequest: ChatAssistRequest = { ...requestPayload };
      const inlineInput = askAI.trim();
      if (action === "ask_anything") {
        assistRequest.input = inlineInput;
      } else if ((action === "translate" || action === "follow_up") && inlineInput) {
        assistRequest.input = inlineInput;
      }
      if (action === "translate") {
        assistRequest.target_language = threadDisplayLanguage;
      }

      try {
        if (action === "ask_anything") {
          const completionsRequest: ChatCompletionsRequest = {
            input: askAI.trim(),
            session_id: chatId,
          };
          const targetType = (thread.targetType || "").trim();
          const targetId = (thread.targetId || "").trim();
          if (targetType) completionsRequest.target_type = targetType;
          if (targetId) completionsRequest.target_id = targetId;

          try {
            await runChatCompletions(
              completionsRequest,
              {
                onText: (text) => {
                  if (controller.signal.aborted) return;
                  if (!askAIMountedRef.current) return;
                  if (requestSeq !== askAIRequestSeqRef.current) return;
                  const safeText = text.trim();
                  if (!safeText) return;
                  setAskAICandidates([
                    {
                      id: "completion_primary",
                      kind: "text",
                      text: safeText,
                    },
                  ]);
                  setAskAISelectedIndex(0);
                },
              },
              controller.signal
            );
            return;
          } catch {
            // Fallback to assist endpoint when completions stream is unavailable.
          }
        }

        await runChatAssist(
          assistRequest,
          {
            onCandidates: (next) => {
              if (controller.signal.aborted) return;
              if (!askAIMountedRef.current) return;
              if (requestSeq !== askAIRequestSeqRef.current) return;
              setAskAICandidates(next);
              setAskAISelectedIndex((prev) => {
                if (next.length === 0) return 0;
                if (prev >= 0 && prev < next.length) return prev;
                return 0;
              });
            },
          },
          controller.signal
        );
      } catch (err) {
        if (controller.signal.aborted) return;
        if (!askAIMountedRef.current) return;
        if (requestSeq !== askAIRequestSeqRef.current) return;
        setAskAIError(formatApiError(err));
      } finally {
        if (askAIAbortRef.current === controller) {
          askAIAbortRef.current = null;
        }
        if (!askAIMountedRef.current) return;
        if (requestSeq !== askAIRequestSeqRef.current) return;
        setIsStreaming(false);
      }
    },
    [
      abortAskAIStream,
      actionMessage,
      askAI,
      chatId,
      isStreaming,
      thread.targetId,
      thread.targetType,
      threadDisplayLanguage,
      tr,
    ]
  );

  const handleLongPress = (message: ConversationMessage) => {
    abortAskAIStream();
    setActionMessage(message);
    setAskAI("");
    setAskAICandidates([]);
    setAskAISelectedIndex(0);
    setAskAIError(null);
    setAskAIAction("ask_anything");
    setIsStreaming(false);
    setActionAnchor(null);
    setActionModal(true);
  };

  const handleMessagePress = (message: ConversationMessage, ev?: GestureResponderEvent) => {
    if (isDraggingRef.current) return;
    abortAskAIStream();
    setActionMessage(message);
    setAskAI("");
    setAskAICandidates([]);
    setAskAISelectedIndex(0);
    setAskAIError(null);
    setAskAIAction("ask_anything");
    setIsStreaming(false);
    if (ev?.nativeEvent) {
      const h = bubbleHeightsRef.current[message.id] || 56;
      const top = ev.nativeEvent.pageY - ev.nativeEvent.locationY;
      const bottom = top + h;
      const meFinal = isCurrentUserMessage(message, currentUserId);
      setActionAnchor({
        yTop: top,
        yBottom: bottom,
        align: meFinal ? "right" : "left",
      });
    } else {
      setActionAnchor(null);
    }
    setActionModal(true);
  };

  const runAskAI = async () => {
    await runAssistGeneration("ask_anything");
  };

  const runGroupMyBot = async () => {
    const question = myBotQuestion.trim();
    if (!question || myBotBusy) return;
    setMyBotBusy(true);
    setMyBotError(null);
    try {
      const transcript = messages
        .slice(-40)
        .map((m) => {
          const sender = (m.senderName || (m.isMe ? tr("我", "Me") : tr("成员", "Member"))).trim();
          const content = normalizeDisplayedContent(m.content || "", m.senderName);
          const text = (content || "").trim();
          if (!text) return "";
          return `${sender}: ${text}`;
        })
        .filter(Boolean)
        .join("\n");

      const prompt = [
        `${tr("群聊", "Group")}: ${thread.name}`,
        "",
        tr("最新上下文：", "Latest context:"),
        transcript || tr("(空)", "(empty)"),
        "",
        `${tr("用户问题", "User question")}: ${question}`,
        "",
        tr(
          "请以用户的私人助手身份回答，保持简洁并可执行。",
          "Answer as the user's private assistant. Keep concise and actionable."
        ),
      ].join("\n");

      const history = messages
        .slice(-20)
        .map((m) => {
          const text = normalizeDisplayedContent(m.content || "", m.senderName).trim();
          if (!text) return null;
          return {
            role: m.isMe ? ("user" as const) : ("model" as const),
            text,
          };
        })
        .filter((item): item is { role: "user" | "model"; text: string } => Boolean(item));

      const primaryAgentId = (thread.id || "").startsWith("agent_") ? thread.id : "agent_mybot";
      let answered = false;
      try {
        const agentResult = await agentChatApi(primaryAgentId, {
          threadId: chatId,
          message: question,
          history,
        });
        const reply = (agentResult.reply || "").trim();
        if (reply) {
          setMyBotAnswer(reply);
          answered = true;
        }
      } catch {
        // Fallback to aiText below.
      }

      if (!answered) {
        const result = await aiText({
          prompt,
          systemInstruction:
            (botConfig.systemInstruction || tr("你是 MyBot。", "You are MyBot.")) +
            `\n${tr(
              "你仅对当前用户私有，不要把私人建议伪装成群聊消息。",
              "You are private to the current user. Never reveal private guidance as if it were a group message."
            )}`,
          fallback: tr(
            "收到。我建议一个可执行的下一步：先总结最新结论并指定负责人。",
            "Noted. I recommend one concrete next step: summarize the latest decision and assign an owner."
          ),
        });
        setMyBotAnswer((result.text || "").trim() || tr("收到。", "Noted."));
      }
    } catch (err) {
      setMyBotError(formatApiError(err));
    } finally {
      setMyBotBusy(false);
    }
  };

  const runAddToTask = async () => {
    await runAssistGeneration("add_task");
  };

  const runReplyDraft = async () => {
    await runAssistGeneration("auto_reply");
  };

  const runTranslate = async () => {
    await runAssistGeneration("translate");
  };

  const runFollowUp = async () => {
    await runAssistGeneration("follow_up");
  };

  const applySelectedCandidate = () => {
    if (isStreaming) return;
    if (askAICandidates.length === 0) return;
    const index = Math.max(0, Math.min(askAISelectedIndex, askAICandidates.length - 1));
    const picked = askAICandidates[index];
    const text = (picked?.text || "").trim();
    if (!text) return;

    if (askAIAction === "auto_reply" && actionMessage) {
      const targetName = (actionMessage.senderName || "").trim();
      if (thread.isGroup && targetName) {
        const mention = `@${targetName}`;
        const hasMentionPrefix = text.toLowerCase().startsWith(mention.toLowerCase());
        setInput(hasMentionPrefix ? text : `${mention} ${text}`);
      } else {
        setInput(text);
      }
    } else if (askAIAction === "add_task" && actionMessage) {
      const messageId = (actionMessage.id || "").trim();
      const candidateTitle = (picked.title || text.split("\n")[0] || tr("跟进任务", "Follow-up task")).trim();
      if (messageId) {
        void createTaskFromMessage(chatId, messageId, candidateTitle)
          .then((created) => {
            if (!created?.id) return;
            Alert.alert(
              tr("任务已创建", "Task Created"),
              tr("已从当前消息创建任务并同步到任务列表。", "Task was created from the selected message and synced to Tasks.")
            );
          })
          .catch(() => {
            // Fallback to input draft so user can still submit manually.
            setInput(text);
          });
        closeActionModal();
        return;
      }
      setInput(text);
    } else if (askAIAction === "translate" && actionMessage) {
      const messageId = (actionMessage.id || "").trim();
      if (messageId) {
        setTranslatedByMessageId((prev) => ({
          ...prev,
          [messageId]: {
            ...(prev[messageId] || {}),
            [threadDisplayLanguage]: text,
          },
        }));
        setShowOriginalByMessageId((prev) => ({
          ...prev,
          [messageId]: false,
        }));
      } else {
        setInput(text);
      }
    } else {
      setInput(text);
    }
    closeActionModal();
  };

  const insertMention = (name?: string) => {
    const safeName = (name || "").trim();
    if (!safeName) return;
    const mention = `@${safeName}`;
    const current = (input || "").trim();
    if (!current) {
      setInput(`${mention} `);
      return;
    }
    if (current.toLowerCase().includes(mention.toLowerCase())) return;
    const spacer = input.endsWith(" ") ? "" : " ";
    setInput(`${input}${spacer}${mention} `);
  };

  const confirmDeleteFriend = () => {
    if (!linkedFriend) return;
    Alert.alert(
      tr("删除好友", "Delete Friend"),
      tr("将删除该好友及当前私聊记录，无法撤销。", "This deletes the friend and this direct chat. This cannot be undone."),
      [
        { text: tr("取消", "Cancel"), style: "cancel" },
        {
          text: tr("删除", "Delete"),
          style: "destructive",
          onPress: () => {
            setThreadMenuModal(false);
            void removeFriend(linkedFriend.id).finally(() => router.back());
          },
        },
      ]
    );
  };

  const confirmDeleteThread = () => {
    Alert.alert(
      tr(thread.isGroup ? "删除群聊" : "删除聊天", thread.isGroup ? "Delete Group Chat" : "Delete Chat"),
      tr("将删除该会话全部消息，无法撤销。", "This deletes all messages in this thread. This cannot be undone."),
      [
        { text: tr("取消", "Cancel"), style: "cancel" },
        {
          text: tr("删除", "Delete"),
          style: "destructive",
          onPress: () => {
            setThreadMenuModal(false);
            void removeChatThread(chatId).finally(() => router.back());
          },
        },
      ]
    );
  };

  const confirmRemoveThreadMember = (member: ThreadMember) => {
    const canOperate = canOperateThreadMember(member);
    if (!canOperate) {
      setMemberPoolError(
        tr(
          "你没有权限移除其他成员，只能退出你自己。",
          "You cannot remove other members. You can only leave by removing yourself."
        )
      );
      return;
    }
    const isSelf = isSelfThreadMember(member);
    Alert.alert(
      tr(isSelf ? "退出群聊" : "移除成员", isSelf ? "Leave group" : "Remove member"),
      tr(
        isSelf
          ? "确认退出当前群聊吗？"
          : `确认移除 ${member.name || tr("该成员", "this member")} 吗？`,
        isSelf
          ? "Leave this group chat?"
          : `Remove ${member.name || "this member"} from this chat?`
      ),
      [
        { text: tr("取消", "Cancel"), style: "cancel" },
        {
          text: tr(isSelf ? "退出" : "移除", isSelf ? "Leave" : "Remove"),
          style: "destructive",
          onPress: () => {
            void removeMember(chatId, member.id).catch((err) =>
              setMemberPoolError(formatApiError(err))
            );
            if (isSelf) {
              router.back();
            }
          },
        },
      ]
    );
  };

  const renderSystemMessage = useCallback((props: SystemMessageProps<IMessage>) => {
    const text = props.currentMessage?.text?.trim();
    if (!text) return <></>;
    return (
      <View style={styles.sysRow}>
        <View style={styles.sysPill}>
          <Text style={styles.sysText}>{text}</Text>
        </View>
      </View>
    );
  }, []);

  const renderMessage = useCallback(
    (props: MessageProps<GiftedMessage>) => {
      const current = props.currentMessage;
      if (!current) return <></>;
      const raw = current.raw;
      const actorID = currentUserId;
      const meFinal = isCurrentUserMessage(raw, actorID);
      const highlighted = highlightMessageId !== "" && raw.id === highlightMessageId;
      const streamText = streamingById[raw.id];
      const sourceText = normalizeDisplayedContent((streamText ?? raw.content) || "", raw.senderName);
      const translatedText = (translatedByMessageId[raw.id]?.[threadDisplayLanguage] || "").trim();
      const hasTranslatedText = !streamText && translatedText !== "";
      const displayText = hasTranslatedText ? translatedText : sourceText;
      const canToggleOriginal = hasTranslatedText && sourceText !== "" && sourceText !== displayText;
      const originalVisible = Boolean(showOriginalByMessageId[raw.id]);
      const ownAvatar = (user?.avatar || botConfig.avatar || "").trim();
      const avatarTag = meFinal ? null : inferAvatarTagFromSender(raw);
      const avatarEntityType: "human" | "bot" | "npc" = meFinal
        ? "human"
        : avatarTag === "Bot"
          ? "bot"
          : avatarTag === "NPC"
            ? "npc"
            : "human";
      const messageAvatar = (() => {
        const senderAvatar = (raw.senderAvatar || "").trim();
        if (senderAvatar) return senderAvatar;
        if (meFinal) return ownAvatar;
        return (thread.avatar || botConfig.avatar || ownAvatar || "").trim();
      })();
      const handleAvatarPress = () => {
        openEntityConfig({
          entityType: avatarEntityType,
          entityId: meFinal ? currentUserId : (raw.senderId || "").trim(),
          name: meFinal ? (user?.displayName || tr("我", "Me")) : (raw.senderName || ""),
          avatar: messageAvatar || undefined,
        });
      };

      const messageBody = () => {
        if (raw.type === "voice") {
          const voiceLabel = raw.voiceDuration
            ? tr(`语音 · ${raw.voiceDuration}`, `Voice · ${raw.voiceDuration}`)
            : tr("语音消息", "Voice message");
          return (
            <View style={styles.voiceRow}>
              <Ionicons
                name="mic-outline"
                size={14}
                color={meFinal ? "rgba(248,250,252,0.95)" : "rgba(226,232,240,0.92)"}
              />
              <Text style={[styles.voiceText, meFinal && styles.msgTextMe]}>{voiceLabel}</Text>
            </View>
          );
        }

        return (
          <View style={styles.messageBody}>
            {raw.replyContext ? (
              <View style={styles.replyContext}>
                <Text style={styles.replyText} numberOfLines={2}>
                  {raw.replyContext}
                </Text>
              </View>
            ) : null}
            {raw.imageUri ? (
              <View style={styles.imageWrap}>
                <Image source={{ uri: raw.imageUri }} style={styles.imagePreview} />
                {raw.imageName ? <Text style={styles.imageLabel}>{raw.imageName}</Text> : null}
              </View>
            ) : null}
            {displayText ? (
              <Text style={[styles.msgText, meFinal && styles.msgTextMe]}>{displayText}</Text>
            ) : null}
            {canToggleOriginal ? (
              <Pressable
                onPress={() =>
                  setShowOriginalByMessageId((prev) => ({
                    ...prev,
                    [raw.id]: !prev[raw.id],
                  }))
                }
                style={styles.originalToggle}
              >
                <Text style={[styles.originalToggleText, meFinal && styles.originalToggleTextMe]}>
                  {originalVisible ? tr("隐藏原文", "Hide original") : tr("查看原文", "Original")}
                </Text>
              </Pressable>
            ) : null}
            {canToggleOriginal && originalVisible ? (
              <View style={styles.originalWrap}>
                <Text style={[styles.originalLabel, meFinal && styles.originalLabelMe]}>
                  {tr("原文", "Original")}
                </Text>
                <Text style={[styles.originalText, meFinal && styles.originalTextMe]}>{sourceText}</Text>
              </View>
            ) : null}
          </View>
        );
      };

      return (
        <View style={[styles.msgRow, meFinal && styles.msgRowMe]}>
          {!meFinal ? (
            <Pressable style={styles.msgAvatarWrap} onPress={handleAvatarPress}>
              {messageAvatar ? (
                <Image source={{ uri: messageAvatar }} style={styles.msgAvatar} />
              ) : (
                <View style={[styles.msgAvatar, styles.msgAvatarFallback]}>
                  <Ionicons name="person-outline" size={14} color="rgba(226,232,240,0.86)" />
                </View>
              )}
              {avatarTag ? (
                <View style={[styles.avatarTag, avatarTag === "NPC" ? styles.avatarTagNpc : styles.avatarTagBot]}>
                  <Text style={styles.avatarTagText}>{avatarTag}</Text>
                </View>
              ) : null}
            </Pressable>
          ) : null}
          <Pressable
            onLayout={(e) => {
              bubbleHeightsRef.current[raw.id] = e.nativeEvent.layout.height;
            }}
            onPress={(e) => handleMessagePress(raw, e)}
            onLongPress={() => handleLongPress(raw)}
            style={[
              styles.bubble,
              meFinal ? styles.bubbleMe : styles.bubbleOther,
              highlighted && styles.bubbleHighlight,
            ]}
          >
            {!meFinal && raw.senderName ? (
              <Text style={styles.sender} numberOfLines={1}>
                {raw.senderName}
              </Text>
            ) : null}
            {messageBody()}
            {raw.time ? <Text style={styles.time}>{raw.time}</Text> : null}
          </Pressable>
          {meFinal ? (
            <Pressable style={styles.msgAvatarWrap} onPress={handleAvatarPress}>
              {messageAvatar ? (
                <Image source={{ uri: messageAvatar }} style={styles.msgAvatar} />
              ) : (
                <View style={[styles.msgAvatar, styles.msgAvatarFallback]}>
                  <Ionicons name="person-outline" size={14} color="rgba(226,232,240,0.86)" />
                </View>
              )}
              {avatarTag ? (
                <View style={[styles.avatarTag, avatarTag === "NPC" ? styles.avatarTagNpc : styles.avatarTagBot]}>
                  <Text style={styles.avatarTagText}>{avatarTag}</Text>
                </View>
              ) : null}
            </Pressable>
          ) : null}
        </View>
      );
    },
    [
      botConfig.avatar,
      currentUserId,
      handleLongPress,
      handleMessagePress,
      highlightMessageId,
      openEntityConfig,
      streamingById,
      threadDisplayLanguage,
      translatedByMessageId,
      showOriginalByMessageId,
      thread.avatar,
      tr,
      user?.avatar,
      user?.displayName,
    ]
  );

  const ContainerView = Animated.View;
  const containerStyle = [styles.container, { paddingBottom: keyboardPadding }];
  const askAICanGenerate =
    Boolean(actionMessage) &&
    !isStreaming &&
    (askAIAction !== "ask_anything" || Boolean(askAI.trim()));
  const askAICanApply = !isStreaming && askAICandidates.length > 0;
  const askAIGenerateLabel = isStreaming
    ? tr("生成中...", "Generating...")
    : askAICandidates.length > 0
      ? tr("重新生成", "Regenerate")
      : tr("生成", "Generate");
  const canAbortMyBotSend = myBotStreaming && isMyBotChatThreadId(chatId);
  const sendDisabled = canAbortMyBotSend ? false : submitting || !input.trim();
  const mediaSendDisabled = mediaSending || selectedAssets.length === 0;
  const renderMediaAssetItem = useCallback(
    ({ item }: { item: MediaPickerAsset }) => {
      const selected = selectedMediaIds.has(item.id);
      return (
        <Pressable
          style={({ pressed }) => [
            styles.mediaAssetItem,
            {
              width: mediaItemSize,
              height: mediaItemSize,
            },
            selected && styles.mediaAssetItemSelected,
            pressed && styles.mediaAssetItemPressed,
          ]}
          onPress={() => toggleMediaSelection(item.id)}
        >
          <Image source={{ uri: item.thumbUri }} style={styles.mediaAssetThumb} />
          <View style={[styles.mediaAssetCheck, selected && styles.mediaAssetCheckSelected]}>
            {selected ? <Ionicons name="checkmark" size={12} color="#f8fafc" /> : null}
          </View>
          {item.type === "video" ? (
            <View style={styles.mediaAssetVideoBadge}>
              <Ionicons name="videocam" size={10} color="rgba(241,245,249,0.96)" />
              <Text style={styles.mediaAssetVideoDuration}>{formatMediaDuration(item.duration)}</Text>
            </View>
          ) : null}
        </Pressable>
      );
    },
    [mediaItemSize, selectedMediaIds, toggleMediaSelection]
  );

  const renderToolbarActions = useCallback(() => {
    const iconColor = "rgba(226,232,240,0.85)";
    return (
      <View style={styles.toolbarActionGroup}>
        <Pressable
          style={styles.inputIcon}
          id="chat-plus-panel"
          testID="chat-plus-button"
          onPressIn={() => {
            plusButtonPressingRef.current = true;
            const keyboardIsOpen = keyboardVisibleRef.current || lastKeyboardHeightRef.current > 0;
            plusPressedFromKeyboardRef.current = keyboardIsOpen;
            if (keyboardIsOpen) {
              pendingOpenPanelAfterKeyboardHideRef.current = true;
              pendingKeyboardFromPanelRef.current = false;
              activeKeyboardTargetRef.current = null;
            }
          }}
          onPressOut={() => {
            plusButtonPressingRef.current = false;
          }}
          onPress={handleTogglePlusPanel}
        >
          <Ionicons name="add" size={18} color={iconColor} />
        </Pressable>
      </View>
    );
  }, [handleTogglePlusPanel]);

  const renderToolbarComposer = useCallback(
    (props: ComposerProps) => (
      <View style={styles.inputBox}>
        <Composer
          {...props}
          textInputStyle={styles.input}
          placeholderTextColor="rgba(148,163,184,0.9)"
          textInputProps={{
            ...(props?.textInputProps || {}),
            testID: "chat-message-input",
            onFocus: (event) => {
              props?.textInputProps?.onFocus?.(event);
              handleChatInputFocus();
            },
            onBlur: (event) => {
              props?.textInputProps?.onBlur?.(event);
              handleChatInputBlur();
            },
          }}
        />
      </View>
    ),
    [handleChatInputBlur, handleChatInputFocus]
  );

  const renderToolbarSend = useCallback(() => {
    return (
      <Pressable
        testID="chat-send-button"
        style={[styles.sendBtn, sendDisabled && styles.sendBtnDisabled]}
        onPress={() => {
          if (canAbortMyBotSend) {
            abortMyBotStream();
            return;
          }
          void handleSend();
        }}
        disabled={sendDisabled}
      >
        <Ionicons name={canAbortMyBotSend ? "stop" : "arrow-up"} size={18} color="#0b1220" />
      </Pressable>
    );
  }, [abortMyBotStream, canAbortMyBotSend, handleSend, sendDisabled]);

  const renderChatInputToolbar = useCallback(
    (props: InputToolbarProps<IMessage>) => (
      <InputToolbar
        {...props}
        containerStyle={styles.toolbarContainer}
        primaryStyle={styles.toolbarPrimary}
        renderActions={renderToolbarActions}
        renderComposer={renderToolbarComposer}
        renderSend={renderToolbarSend}
      />
    ),
    [renderToolbarActions, renderToolbarComposer, renderToolbarSend]
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
            <Pressable testID="chat-back-button" style={styles.backBtn} onPress={() => router.back()}>
              <Ionicons name="chevron-back" size={18} color="#e2e8f0" />
            </Pressable>
            <Pressable
              style={styles.headerMain}
              onPress={() => {
                if (!thread.isGroup) return;
                setMemberNameListModal(true);
              }}
            >
              <Text style={styles.title} numberOfLines={1}>
                {thread.name}
              </Text>
              <Text style={styles.subtitle}>
                {thread.isGroup
                  ? tr(`${Math.max(thread.memberCount || 0, members.length)} people active`, `${Math.max(thread.memberCount || 0, members.length)} people active`)
                  : tr("Direct", "Direct")}
              </Text>
            </Pressable>
              <View style={styles.headerActions}>
                {thread.isGroup ? (
                  <Pressable
                    style={[
                      styles.headerIcon,
                      {
                        width: "auto",
                        paddingHorizontal: 10,
                        flexDirection: "row",
                        gap: 6,
                      },
                    ]}
                    onPress={() => {
                      setMyBotQuestion("");
                      setMyBotAnswer(null);
                      setMyBotError(null);
                      setMyBotPanel(true);
                    }}
                  >
                    <Ionicons name="sparkles-outline" size={16} color="rgba(191,219,254,0.95)" />
                    <Text style={{ color: "rgba(191,219,254,0.95)", fontSize: 12, fontWeight: "800" }}>MyBot</Text>
                  </Pressable>
                ) : null}
                {thread.isGroup ? (
                <Pressable
                  style={styles.headerIcon}
                  onPress={() => {
                    setMemberQuery("");
                    setMemberFilter("all");
                    setMemberPoolError(null);
                    setPendingMemberAdds([]);
                    setMemberApplyBusy(false);
                    setMemberModal(true);
                  }}
                >
                  <Ionicons name="person-add-outline" size={16} color="rgba(226,232,240,0.92)" />
                </Pressable>
              ) : null}
              <Pressable style={styles.headerIcon} onPress={() => setThreadMenuModal(true)}>
                <Ionicons name="ellipsis-horizontal" size={16} color="rgba(226,232,240,0.92)" />
              </Pressable>
            </View>
          </View>

          <View style={styles.threadLanguageRow}>
            {THREAD_LANGUAGE_OPTIONS.map((item) => {
              const active = threadDisplayLanguage === item.key;
              return (
                <Pressable
                  key={item.key}
                  style={[styles.threadLanguageChip, active && styles.threadLanguageChipActive]}
                  onPress={() => {
                    void updateThreadLanguage(chatId, item.key);
                  }}
                >
                  <Text style={[styles.threadLanguageChipText, active && styles.threadLanguageChipTextActive]}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {failedDraft ? (
            <StateBanner
              variant="error"
              title={tr("发送失败", "Send failed")}
              message={tr("可以点右侧重试", "Tap retry to send again")}
              actionLabel={tr("重试", "Retry")}
              onAction={() => setInput(failedDraft)}
            />
          ) : null}

          {loadError ? (
            <StateBanner
              variant="error"
              title={tr("消息加载失败", "Failed to load messages")}
              message={loadError}
              actionLabel={tr("重试", "Retry")}
              onAction={() => {
                setLoadError(null);
                setLoading(true);
                void refreshThreadMessages(chatId)
                  .catch((err) => setLoadError(formatApiError(err)))
                  .finally(() => setLoading(false));
              }}
            />
          ) : null}

          <View style={styles.chatBody}>
            {loading ? (
              <LoadingSkeleton kind="messages" />
            ) : (
              <GiftedChat
                messages={giftedMessages}
                user={{ _id: giftedUserId, name: user?.displayName || tr("我", "Me") }}
                text={input}
                onInputTextChanged={setInput}
                placeholder={
                  thread.isGroup
                    ? tr("Message (@name to mention)", "Message (@name to mention)")
                    : tr("Message", "Message")
                }
                renderInputToolbar={renderChatInputToolbar}
                minInputToolbarHeight={56}
                isKeyboardInternallyHandled={false}
                renderMessage={renderMessage}
                renderSystemMessage={renderSystemMessage}
                messagesContainerStyle={styles.messageContainer}
                listViewProps={
                  {
                    keyboardShouldPersistTaps: "never",
                    onEndReachedThreshold: 0.2,
                    onEndReached: () => void requestOlder(),
                    onScrollBeginDrag: () => {
                      isDraggingRef.current = true;
                      setHasUserScrolled(true);
                    },
                    onScrollEndDrag: () => {
                      setTimeout(() => {
                        isDraggingRef.current = false;
                      }, 120);
                    },
                    onMomentumScrollEnd: () => {
                      isDraggingRef.current = false;
                    },
                    ListFooterComponent: loadingOlder ? (
                      <Text style={styles.listFooterHint}>{tr("加载更早消息...", "Loading older...")}</Text>
                    ) : hasMore && hasUserScrolled ? (
                      <Text style={styles.listFooterHint}>{tr("上滑加载更早消息", "Scroll up to load older")}</Text>
                    ) : null,
                    ListEmptyComponent: (
                      <Pressable style={styles.emptyCenter} onPress={Keyboard.dismiss}>
                        <EmptyState
                          title={tr("暂无消息", "No messages yet")}
                          hint={tr("从底部输入开始对话", "Start typing below")}
                          icon="chatbox-ellipses-outline"
                        />
                      </Pressable>
                    ),
                  } as any
                }
              />
            )}
          </View>
        </ContainerView>
        </KeyboardAvoidingView>

        {isPanelVisible ? (
          <Animated.View
            testID="chat-plus-panel-container"
            pointerEvents={isPanelVisible ? "auto" : "none"}
            style={[
              styles.plusPanel,
              {
                height: plusPanelHeight,
                paddingBottom: Math.max(insets.bottom, 12),
                opacity: plusPanelOpacity,
                transform: [{ translateY: plusPanelTranslateY }],
              },
            ]}
          >
            <View style={styles.plusPanelGrid}>
              {PLUS_PANEL_ITEMS.map((item) => (
                <Pressable
                  key={item.key}
                  testID={`chat-plus-item-${item.key}`}
                  style={({ pressed }) => [styles.plusPanelItem, pressed && styles.plusPanelItemPressed]}
                  onPress={() => handlePlusPanelItemPress(item.key)}
                >
                  <View style={styles.plusPanelIcon}>
                    <Ionicons name={item.icon} size={22} color="rgba(219,234,254,0.95)" />
                  </View>
                  <Text style={styles.plusPanelLabel}>{tr(item.zh, item.en)}</Text>
                </Pressable>
              ))}
            </View>
          </Animated.View>
        ) : null}

        <Modal
          visible={isMediaSheetVisible}
          transparent
          animationType="none"
          statusBarTranslucent
          onRequestClose={() => closeMediaSheet()}
        >
          <View testID="chat-media-sheet-root" style={styles.mediaSheetModalRoot}>
            <AnimatedPressable
              style={[styles.mediaSheetBackdrop, { opacity: mediaSheetBackdropOpacity }]}
              onPress={() => closeMediaSheet()}
            />
            <Animated.View
              testID="chat-media-sheet"
              style={[
                styles.mediaSheetContainer,
                {
                  height: mediaSheetHeight,
                  paddingBottom: mediaSheetBottomInset,
                  transform: [{ translateY: Animated.add(mediaSheetTranslateY, mediaSheetDragOffset) }],
                },
              ]}
            >
              <View style={styles.mediaSheetHandle} {...mediaSheetPanResponder.panHandlers} />
              <View style={styles.mediaSheetHeader}>
                <Text testID="chat-media-sheet-title" style={styles.mediaSheetTitle}>
                  {tr("选择媒体", "Select Media")}
                </Text>
                <Pressable testID="chat-media-sheet-close" style={styles.mediaSheetCloseBtn} onPress={() => closeMediaSheet()}>
                  <Ionicons name="close" size={16} color="rgba(226,232,240,0.92)" />
                </Pressable>
              </View>

              <View style={styles.mediaSheetBody}>
                {mediaLoading ? (
                  <View style={styles.mediaSheetState}>
                    <ActivityIndicator size="small" color="rgba(191,219,254,0.95)" />
                    <Text style={styles.mediaSheetHint}>{tr("正在读取系统相册...", "Loading media library...")}</Text>
                  </View>
                ) : mediaError ? (
                  <View style={styles.mediaSheetState}>
                    <Text style={styles.mediaSheetError}>{mediaError}</Text>
                    <Pressable
                      style={styles.mediaSheetRetryBtn}
                      onPress={() => {
                        const requestSeq = mediaLoadSeqRef.current + 1;
                        mediaLoadSeqRef.current = requestSeq;
                        void loadMediaAssetsFromLibrary(requestSeq);
                      }}
                    >
                      <Text style={styles.mediaSheetRetryText}>{tr("重试", "Retry")}</Text>
                    </Pressable>
                  </View>
                ) : (
                  <FlatList
                    key={`media-grid-${mediaGridColumns}`}
                    data={mediaAssets}
                    renderItem={renderMediaAssetItem}
                    keyExtractor={(item) => item.id}
                    numColumns={mediaGridColumns}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.mediaGridContent}
                    columnWrapperStyle={mediaGridColumns > 1 ? styles.mediaGridRow : undefined}
                    ListEmptyComponent={
                      <View style={styles.mediaSheetState}>
                        <Text style={styles.mediaSheetHint}>{tr("暂无可选媒体", "No media available")}</Text>
                      </View>
                    }
                  />
                )}
              </View>

              <View style={styles.mediaSheetFooter}>
                <Text testID="chat-media-sheet-selection" style={styles.mediaSheetSelection}>
                  {selectedAssets.length > 0
                    ? tr(`已选 ${selectedAssets.length} 项`, `${selectedAssets.length} selected`)
                    : tr("请选择要发送的媒体", "Select media to send")}
                </Text>
                <Pressable
                  testID="chat-media-sheet-send"
                  style={[styles.mediaSheetSendBtn, mediaSendDisabled && styles.mediaSheetSendBtnDisabled]}
                  disabled={mediaSendDisabled}
                  onPress={() => {
                    void handleSendSelectedMedia();
                  }}
                >
                  {mediaSending ? (
                    <ActivityIndicator size="small" color="#0b1220" />
                  ) : (
                    <Text style={styles.mediaSheetSendText}>{tr("发送", "Send")}</Text>
                  )}
                </Pressable>
              </View>
            </Animated.View>
          </View>
        </Modal>

        {/* Ask AI Modal 组件 */}
        <Modal visible={actionModal} transparent animationType="fade" onRequestClose={closeActionModal}>
          <Pressable style={styles.actionOverlay} onPress={closeActionModal}>
            <AnimatedPressable
              ref={aiCardRef}
              style={[
                styles.aiCard,
                (() => {
                  const { height: screenH } = Dimensions.get("screen");
                  const { width: winW } = Dimensions.get("window");
                  const width = Math.min(360, Math.max(240, winW - 28));
                  const marginH = 14;
                  const isIOS = Platform.OS === "ios";
                  const centeredLeft = Math.max(marginH, (winW - width) / 2);

                  const anchor = actionAnchor;
                  const preferBelow = anchor ? anchor.yBottom + 10 : screenH - insets.bottom - 12 - aiCardHeight;
                  const maxTop = screenH - Math.max(insets.bottom, 0) - 12 - aiCardHeight;
                  let top = Math.min(preferBelow, maxTop);

                  if (anchor && preferBelow > maxTop) {
                    const above = anchor.yTop - 10 - aiCardHeight;
                    const minTop = Math.max(insets.top, 0) + 12;
                    if (above >= minTop) {
                      top = above;
                    }
                  }

                  const minTop = Math.max(insets.top, 0) + 12;
                  if (top < minTop) top = minTop;

                  return {
                    position: "absolute" as const,
                    top,
                    width,
                    left: isIOS ? centeredLeft : actionAnchor?.align === "left" ? marginH : undefined,
                    right: isIOS ? undefined : actionAnchor?.align === "right" ? marginH : undefined,
                  };
                })(),
                {
                  transform: [{ translateY: Animated.multiply(aiKeyboardShift, -1) }],
                },
              ]}
              onLayout={(e) => setAiCardHeight(e.nativeEvent.layout.height)}
              onPress={() => null}
            >
              <View style={styles.aiModeRow}>
                <Pressable
                  style={[styles.aiModeBtn, askAIAction === "ask_anything" && styles.aiModeBtnActive]}
                  onPress={() => setAskAIAction("ask_anything")}
                  disabled={isStreaming}
                >
                  <Text style={styles.aiModeBtnText}>{tr("问答", "Ask")}</Text>
                </Pressable>
                <Pressable
                  style={[styles.aiModeBtn, askAIAction === "auto_reply" && styles.aiModeBtnActive]}
                  onPress={() => setAskAIAction("auto_reply")}
                  disabled={isStreaming}
                >
                  <Text style={styles.aiModeBtnText}>{tr("回复", "Reply")}</Text>
                </Pressable>
                <Pressable
                  style={[styles.aiModeBtn, askAIAction === "add_task" && styles.aiModeBtnActive]}
                  onPress={() => setAskAIAction("add_task")}
                  disabled={isStreaming}
                >
                  <Text style={styles.aiModeBtnText}>{tr("任务", "Task")}</Text>
                </Pressable>
                <Pressable
                  style={[styles.aiModeBtn, askAIAction === "translate" && styles.aiModeBtnActive]}
                  onPress={() => setAskAIAction("translate")}
                  disabled={isStreaming}
                >
                  <Text style={styles.aiModeBtnText}>{tr("翻译", "Translate")}</Text>
                </Pressable>
                <Pressable
                  style={[styles.aiModeBtn, askAIAction === "follow_up" && styles.aiModeBtnActive]}
                  onPress={() => setAskAIAction("follow_up")}
                  disabled={isStreaming}
                >
                  <Text style={styles.aiModeBtnText}>{tr("跟进", "Follow-up")}</Text>
                </Pressable>
              </View>

              <View style={styles.aiAskRow}>
                <Ionicons name="sparkles-outline" size={16} color="rgba(191,219,254,0.95)" />
                <TextInput
                  value={askAI}
                  onChangeText={setAskAI}
                  onFocus={() => setKeyboardTarget("askAI")}
                  onBlur={() => setKeyboardTarget(null)}
                  placeholder={tr("Ask AI...", "Ask AI...")}
                  placeholderTextColor="rgba(148,163,184,0.9)"
                  style={styles.aiAskInput}
                  editable={!isStreaming}
                />
              </View>

              {askAIError ? <Text style={styles.aiError}>{askAIError}</Text> : null}
              {isStreaming ? <Text style={styles.aiHint}>{tr("生成中...", "Generating...")}</Text> : null}

              <ScrollView style={styles.aiCandidatesList} contentContainerStyle={styles.aiCandidatesListContent}>
                {askAICandidates.length === 0 ? (
                  <Text style={styles.aiHint}>
                    {tr("生成后可在这里选择候选内容。", "Generated candidates will appear here.")}
                  </Text>
                ) : (
                  askAICandidates.map((candidate, index) => (
                    <Pressable
                      key={`${candidate.id || "candidate"}_${index}`}
                      style={[
                        styles.aiCandidateItem,
                        askAISelectedIndex === index && styles.aiCandidateItemSelected,
                      ]}
                      onPress={() => setAskAISelectedIndex(index)}
                      disabled={isStreaming}
                    >
                      {(candidate.kind === "task" || candidate.kind === "follow_up") && candidate.title ? (
                        <Text style={styles.aiCandidateTitle}>{candidate.title}</Text>
                      ) : null}
                      <Text style={styles.aiCandidateText}>{candidate.text}</Text>
                      {(candidate.kind === "task" || candidate.kind === "follow_up") && candidate.priority ? (
                        <Text style={styles.aiCandidateMeta}>{candidate.priority}</Text>
                      ) : null}
                      {candidate.kind === "follow_up" && candidate.description ? (
                        <Text style={styles.aiCandidateMeta}>{candidate.description}</Text>
                      ) : null}
                    </Pressable>
                  ))
                )}
              </ScrollView>

              <View style={styles.aiButtonsRow}>
                <Pressable
                  style={[styles.aiBtn, !askAICanGenerate && styles.aiBtnDisabled]}
                  onPress={() => {
                    if (askAIAction === "ask_anything") {
                      void runAskAI();
                    } else if (askAIAction === "auto_reply") {
                      void runReplyDraft();
                    } else if (askAIAction === "translate") {
                      void runTranslate();
                    } else if (askAIAction === "follow_up") {
                      void runFollowUp();
                    } else {
                      void runAddToTask();
                    }
                  }}
                  disabled={!askAICanGenerate}
                >
                  <Text style={styles.aiBtnText}>{askAIGenerateLabel}</Text>
                </Pressable>
                <Pressable
                  style={[styles.aiBtn, styles.aiBtnSecondary, !askAICanApply && styles.aiBtnDisabled]}
                  onPress={applySelectedCandidate}
                  disabled={!askAICanApply}
                >
                  <Text style={styles.aiBtnText}>{tr("采用", "Adopt")}</Text>
                </Pressable>
                <Pressable style={[styles.aiBtn, styles.aiBtnSecondary]} onPress={closeActionModal}>
                  <Text style={styles.aiBtnText}>{tr("取消", "Cancel")}</Text>
                </Pressable>
              </View>
            </AnimatedPressable>
          </Pressable>
        </Modal>

        <Modal visible={myBotPanel} transparent animationType="fade" onRequestClose={() => setMyBotPanel(false)}>
          <Pressable style={styles.modalOverlay} onPress={() => setMyBotPanel(false)}>
            <Pressable style={styles.memberCard} onPress={() => null}>
              <View style={styles.memberHeader}>
                <Text style={styles.memberTitle}>MyBot</Text>
                <Pressable style={styles.closeTiny} onPress={() => setMyBotPanel(false)}>
                  <Ionicons name="close" size={16} color="rgba(226,232,240,0.85)" />
                </Pressable>
              </View>
              <Text style={[styles.memberHint, { marginBottom: 10 }]}>
                {tr("只对你可见，基于当前群聊上下文回答。", "Private to you, answers with current group context.")}
              </Text>
              <TextInput
                value={myBotQuestion}
                onChangeText={setMyBotQuestion}
                placeholder={tr("问 MyBot 当前群聊的问题", "Ask MyBot about this group")}
                placeholderTextColor="rgba(148,163,184,0.9)"
                multiline
                style={{
                  minHeight: 72,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.14)",
                  backgroundColor: "rgba(15,23,42,0.55)",
                  color: "rgba(241,245,249,0.96)",
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  fontSize: 15,
                  textAlignVertical: "top",
                  marginBottom: 10,
                }}
                editable={!myBotBusy}
              />
              {myBotError ? <Text style={styles.aiError}>{myBotError}</Text> : null}
              {myBotAnswer ? (
                <ScrollView style={{ maxHeight: 220, marginBottom: 10 }}>
                  <View style={styles.aiAnswerBox}>
                    <Text style={styles.aiAnswerText}>{myBotAnswer}</Text>
                  </View>
                </ScrollView>
              ) : null}
              <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 10 }}>
                <Pressable
                  style={[
                    styles.filterBtn,
                    { minHeight: 42, minWidth: 96, alignItems: "center", justifyContent: "center" },
                  ]}
                  onPress={() => setMyBotPanel(false)}
                >
                  <Text style={styles.filterText}>{tr("关闭", "Close")}</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.filterBtn,
                    {
                      minHeight: 42,
                      minWidth: 108,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor:
                        myBotBusy || !myBotQuestion.trim()
                          ? "rgba(51,65,85,0.45)"
                          : "rgba(147,197,253,0.28)",
                    },
                  ]}
                  onPress={() => void runGroupMyBot()}
                  disabled={myBotBusy || !myBotQuestion.trim()}
                >
                  <Text style={[styles.filterText, { color: "rgba(219,234,254,0.98)" }]}>
                    {myBotBusy ? tr("思考中...", "Thinking...") : tr("询问", "Ask")}
                  </Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        <Modal
          visible={memberNameListModal}
          transparent
          animationType="fade"
          onRequestClose={() => setMemberNameListModal(false)}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setMemberNameListModal(false)}>
            <Pressable style={styles.memberCard} onPress={() => null}>
              <View style={styles.memberHeader}>
                <Text style={styles.memberTitle}>{tr("成员列表", "Member list")}</Text>
                <Pressable style={styles.closeTiny} onPress={() => setMemberNameListModal(false)}>
                  <Ionicons name="close" size={16} color="rgba(226,232,240,0.85)" />
                </Pressable>
              </View>

              <ScrollView style={styles.memberList} contentContainerStyle={styles.memberListContent}>
                {members.length === 0 ? (
                  <Text style={styles.memberHint}>{tr("暂无成员", "No members")}</Text>
                ) : (
                  members.map((m) => {
                    const memberTag = inferAvatarTagFromMember(m);
                    return (
                      <Pressable
                        key={m.id}
                        style={styles.memberItem}
                        onPress={() => {
                          insertMention(m.name);
                          setMemberNameListModal(false);
                        }}
                      >
                        <View style={styles.memberIdentity}>
                          <Pressable
                            style={styles.memberAvatarWrap}
                            onPress={(e) => {
                              e.stopPropagation?.();
                              const memberTag = inferAvatarTagFromMember(m);
                              openEntityConfig({
                                entityType: memberTag === "Bot" ? "bot" : memberTag === "NPC" ? "npc" : "human",
                                entityId: m.memberType === "human" ? m.friendId || m.id : m.agentId || m.id,
                                name: m.name,
                                avatar: m.avatar,
                              });
                            }}
                          >
                            {m.avatar ? (
                              <Image source={{ uri: m.avatar }} style={styles.memberAvatar} />
                            ) : (
                              <View style={[styles.memberAvatar, styles.memberAvatarFallback]}>
                                <Ionicons name="person-outline" size={14} color="rgba(226,232,240,0.86)" />
                              </View>
                            )}
                            {memberTag ? (
                              <View
                                style={[
                                  styles.avatarTag,
                                  memberTag === "NPC" ? styles.avatarTagNpc : styles.avatarTagBot,
                                ]}
                              >
                                <Text style={styles.avatarTagText}>{memberTag}</Text>
                              </View>
                            ) : null}
                          </Pressable>
                          <View style={styles.memberMain}>
                            <Text style={styles.memberName}>{m.name}</Text>
                            <Text style={styles.memberDesc} numberOfLines={1}>
                              {m.memberType === "human"
                                ? tr("真人", "Human")
                                : m.memberType === "agent"
                                  ? tr("智能体", "Agent")
                                  : tr("角色", "Role")}
                            </Text>
                          </View>
                        </View>
                      </Pressable>
                    );
                  })
                )}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>

        <Modal visible={memberModal} transparent animationType="fade" onRequestClose={() => setMemberModal(false)}>
          <Pressable style={styles.modalOverlay} onPress={() => setMemberModal(false)}>
            <Pressable style={styles.memberCard} onPress={() => null}>
              <View style={styles.memberHeader}>
                <Text style={styles.memberTitle}>{tr("添加成员", "Add Member")}</Text>
                <Pressable style={styles.closeTiny} onPress={() => setMemberModal(false)}>
                  <Ionicons name="close" size={16} color="rgba(226,232,240,0.85)" />
                </Pressable>
              </View>

              <View style={styles.searchWrap}>
                <Ionicons name="search" size={14} color="rgba(148,163,184,0.9)" />
                <TextInput
                  value={memberQuery}
                  onChangeText={setMemberQuery}
                  placeholder={tr("搜索成员", "Search members")}
                  placeholderTextColor="rgba(148,163,184,0.9)"
                  style={styles.searchInput}
                />
              </View>

              <View style={styles.filterRow}>
                {([
                  { key: "all", zh: "全部", en: "All" },
                  { key: "human", zh: "真人", en: "Human" },
                  { key: "agent", zh: "智能体", en: "Agent" },
                  { key: "role", zh: "角色", en: "Role" },
                ] as const).map((item) => (
                  <Pressable
                    key={item.key}
                    style={[styles.filterBtn, memberFilter === item.key && styles.filterBtnActive]}
                    onPress={() => setMemberFilter(item.key)}
                  >
                    <Text style={[styles.filterText, memberFilter === item.key && styles.filterTextActive]}>
                      {tr(item.zh, item.en)}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <ScrollView style={styles.memberList} contentContainerStyle={styles.memberListContent}>
                {memberPoolError ? (
                  <StateBanner
                    variant="error"
                    title={tr("加载失败", "Load failed")}
                    message={memberPoolError}
                    actionLabel={tr("重试", "Retry")}
                    onAction={() => setMemberPoolNonce((n) => n + 1)}
                  />
                ) : null}
                {memberPoolBusy && candidates.length === 0 ? (
                  <Text style={styles.memberHint}>{tr("加载中...", "Loading...")}</Text>
                ) : null}
                {groupedCandidates.map((section) => (
                  <View key={section.key} style={styles.memberSection}>
                    <Text style={styles.memberSectionTitle}>{section.title}</Text>
                    {section.items.map((c) => (
                      <Pressable
                        key={c.key}
                        style={[
                          styles.memberItem,
                          selectedMemberKeys.has(c.key) && styles.memberItemSelected,
                        ]}
                        onPress={() => {
                          setMemberPoolError(null);
                          setPendingMemberAdds((prev) => {
                            const exists = prev.some((item) => item.key === c.key);
                            if (exists) {
                              return prev.filter((item) => item.key !== c.key);
                            }
                            return [...prev, { key: c.key, label: c.label, onAdd: c.onAdd }];
                          });
                        }}
                      >
                        <View style={styles.memberMain}>
                          <Text style={styles.memberName}>{c.label}</Text>
                          <Text style={styles.memberDesc} numberOfLines={1}>{c.desc}</Text>
                        </View>
                        <Ionicons
                          name={selectedMemberKeys.has(c.key) ? "checkmark-circle" : "add-circle-outline"}
                          size={18}
                          color="#93c5fd"
                        />
                      </Pressable>
                    ))}
                  </View>
                ))}
                {candidates.length === 0 ? (
                  <View style={{ gap: 10 }}>
                    <EmptyState
                      title={tr("没有可添加对象", "No candidates")}
                      hint={tr(
                        "可直接搜索系统用户并添加；若仍为空，请检查对方是否已注册。",
                        "You can search and add any registered user directly. If still empty, check whether the user has signed up."
                      )}
                      icon="person-add-outline"
                    />
                    <View style={{ flexDirection: "row", gap: 10 }}>
                      <Pressable
                        style={[styles.filterBtn, { flex: 1, minHeight: 42, alignItems: "center", justifyContent: "center" }]}
                        onPress={() => {
                          setMemberModal(false);
                          router.push("/" as never);
                        }}
                      >
                        <Text style={[styles.filterText, styles.filterTextActive]}>{tr("去添加好友", "Go add friend")}</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.filterBtn, { flex: 1, minHeight: 42, alignItems: "center", justifyContent: "center" }]}
                        onPress={() => setMemberPoolNonce((n) => n + 1)}
                      >
                        <Text style={styles.filterText}>{tr("刷新候选", "Refresh candidates")}</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}
              </ScrollView>

              <View style={styles.currentRow}>
                {pendingMemberAdds.length > 0 ? (
                  <>
                    <Text style={styles.currentTitle}>{tr("待添加", "Pending add")}</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.currentChips}>
                      {pendingMemberAdds.map((item) => (
                        <View key={item.key} style={styles.currentChip}>
                          <Text style={styles.currentChipText}>{item.label}</Text>
                          <Pressable
                            onPress={() =>
                              setPendingMemberAdds((prev) =>
                                prev.filter((entry) => entry.key !== item.key)
                              )
                            }
                          >
                            <Ionicons name="close" size={12} color="rgba(248,113,113,0.95)" />
                          </Pressable>
                        </View>
                      ))}
                    </ScrollView>
                  </>
                ) : null}
                <Text style={styles.currentTitle}>{tr("当前成员", "Members")}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.currentChips}>
                  {members.map((m) => {
                    const canOperate = canOperateThreadMember(m);
                    const isSelf = isSelfThreadMember(m);
                    return (
                      <View key={m.id} style={styles.currentChip}>
                        <Text style={styles.currentChipText}>{m.name}</Text>
                        {canOperate ? (
                          <Pressable onPress={() => confirmRemoveThreadMember(m)}>
                            <Ionicons
                              name={isSelf ? "exit-outline" : "close"}
                              size={12}
                              color="rgba(248,113,113,0.95)"
                            />
                          </Pressable>
                        ) : null}
                      </View>
                    );
                  })}
                </ScrollView>

                <View style={styles.memberFooter}>
                  <Pressable
                    style={styles.memberFooterGhost}
                    onPress={() => setMemberModal(false)}
                    disabled={memberApplyBusy}
                  >
                    <Text style={styles.memberFooterGhostText}>{tr("取消", "Cancel")}</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.memberFooterCta,
                      (pendingMemberAdds.length === 0 || memberApplyBusy) && styles.memberFooterCtaDisabled,
                    ]}
                    disabled={pendingMemberAdds.length === 0 || memberApplyBusy}
                    onPress={() => {
                      Alert.alert(
                        tr("确认创建群聊", "Confirm Group Creation"),
                        tr(
                          "确定要创建群聊并添加所选成员吗？",
                          "Are you sure you want to create the group and add selected members?"
                        ),
                        [
                          { text: tr("取消", "Cancel"), style: "cancel" },
                          {
                            text: tr("确定", "Confirm"),
                            style: "default",
                            onPress: () => {
                              void (async () => {
                                setMemberApplyBusy(true);
                                setMemberPoolError(null);
                                try {
                                  for (const item of pendingMemberAdds) {
                                    await item.onAdd();
                                  }
                                  await listMembers(chatId);
                                  setMemberPoolNonce((n) => n + 1);
                                  setPendingMemberAdds([]);
                                  setMemberModal(false);
                                } catch (err) {
                                  setMemberPoolError(formatApiError(err));
                                } finally {
                                  setMemberApplyBusy(false);
                                }
                              })();
                            },
                          },
                        ]
                      );
                    }}
                  >
                    <Text style={styles.memberFooterCtaText}>
                      {memberApplyBusy ? tr("处理中...", "Applying...") : tr("确定", "Confirm")}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        <Modal visible={threadMenuModal} transparent animationType="fade" onRequestClose={() => setThreadMenuModal(false)}>
          <Pressable style={styles.modalOverlayBottom} onPress={() => setThreadMenuModal(false)}>
            <Pressable style={styles.actionSheet} onPress={() => null}>
              {__DEV__ ? (
                <Pressable
                  style={styles.menuItem}
                  onPress={() => setDevStreamEnabled((prev) => !prev)}
                >
                  <Ionicons
                    name={devStreamEnabled ? "sparkles-outline" : "sparkles"}
                    size={16}
                    color={devStreamEnabled ? "rgba(147,197,253,0.95)" : "rgba(148,163,184,0.9)"}
                  />
                  <Text style={styles.menuText}>
                    {devStreamEnabled
                      ? tr("流式输出：开", "Streaming: On")
                      : tr("流式输出：关", "Streaming: Off")}
                  </Text>
                </Pressable>
              ) : null}
              {linkedFriend ? (
                <Pressable style={styles.menuItem} onPress={confirmDeleteFriend}>
                  <Ionicons name="person-remove-outline" size={16} color="rgba(248,113,113,0.95)" />
                  <Text style={styles.menuDangerText}>{tr("删除好友", "Delete Friend")}</Text>
                </Pressable>
              ) : null}
              <Pressable style={styles.menuItem} onPress={confirmDeleteThread}>
                <Ionicons name="trash-outline" size={16} color="rgba(248,113,113,0.95)" />
                <Text style={styles.menuDangerText}>
                  {tr(thread.isGroup ? "删除群聊" : "删除聊天", thread.isGroup ? "Delete Group Chat" : "Delete Chat")}
                </Text>
              </Pressable>
              <Pressable style={styles.menuItem} onPress={() => setThreadMenuModal(false)}>
                <Ionicons name="close-outline" size={16} color="rgba(226,232,240,0.92)" />
                <Text style={styles.menuText}>{tr("取消", "Cancel")}</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
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
    gap: 10,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerMain: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: "#e2e8f0",
    fontSize: 18,
    fontWeight: "900",
  },
  subtitle: {
    color: "rgba(148,163,184,0.95)",
    fontSize: 13,
    fontWeight: "700",
  },
  threadLanguageRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: -2,
    marginBottom: 2,
    paddingLeft: 52,
  },
  threadLanguageChip: {
    minWidth: 34,
    height: 26,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.36)",
    backgroundColor: "rgba(30,41,59,0.55)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  threadLanguageChipActive: {
    borderColor: "rgba(147,197,253,0.75)",
    backgroundColor: "rgba(30,64,175,0.45)",
  },
  threadLanguageChipText: {
    color: "rgba(226,232,240,0.88)",
    fontSize: 12,
    fontWeight: "800",
  },
  threadLanguageChipTextActive: {
    color: "#f8fafc",
  },
  headerActions: {
    flexDirection: "row",
    gap: 10,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  messageList: {
    flex: 1,
    marginTop: 4,
  },
  chatBody: {
    flex: 1,
    marginTop: 4,
  },
  messageContainer: {
    flex: 1,
  },
  emptyCenter: {
    flex: 1,
    justifyContent: "center",
  },
  messageContent: {
    paddingVertical: 8,
    gap: 10,
  },
  sysRow: {
    alignItems: "center",
    marginBottom: 10,
  },
  sysPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  sysText: {
    color: "rgba(226,232,240,0.78)",
    fontSize: 14,
    fontWeight: "700",
  },
  msgRow: {
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "flex-end",
    gap: 8,
    marginBottom: 10,
  },
  msgRowMe: {
    justifyContent: "flex-end",
  },
  msgAvatarWrap: {
    width: 30,
    height: 30,
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  msgAvatar: {
    width: 30,
    height: 30,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  msgAvatarFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  avatarTag: {
    position: "absolute",
    left: 3,
    right: 3,
    bottom: -7,
    height: 11,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  avatarTagBot: {
    backgroundColor: "rgba(37,99,235,0.96)",
    borderColor: "rgba(191,219,254,0.78)",
  },
  avatarTagNpc: {
    backgroundColor: "rgba(15,118,110,0.96)",
    borderColor: "rgba(167,243,208,0.78)",
  },
  avatarTagText: {
    color: "#f8fafc",
    fontSize: 7,
    lineHeight: 8,
    fontWeight: "900",
    letterSpacing: 0.25,
  },
  bubble: {
    maxWidth: "86%",
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  bubbleOther: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.12)",
  },
  bubbleMe: {
    backgroundColor: "rgba(37,99,235,0.80)",
    borderColor: "rgba(59,130,246,0.35)",
  },
  bubbleHighlight: {
    borderColor: "rgba(250,204,21,0.45)",
  },
  sender: {
    color: "rgba(226,232,240,0.86)",
    fontSize: 13,
    fontWeight: "900",
  },
  messageBody: {
    gap: 6,
  },
  replyContext: {
    borderLeftWidth: 2,
    borderLeftColor: "rgba(148,163,184,0.7)",
    paddingLeft: 8,
  },
  replyText: {
    color: "rgba(203,213,225,0.9)",
    fontSize: 13,
    fontWeight: "700",
  },
  voiceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  voiceText: {
    color: "rgba(226,232,240,0.92)",
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "600",
  },
  imageWrap: {
    gap: 6,
  },
  imagePreview: {
    width: 200,
    height: 130,
    borderRadius: 12,
  },
  imageLabel: {
    color: "rgba(148,163,184,0.9)",
    fontSize: 12,
    fontWeight: "700",
  },
  msgText: {
    color: "rgba(226,232,240,0.92)",
    fontSize: 17,
    lineHeight: 24,
    fontWeight: "600",
  },
  msgTextMe: {
    color: "#f8fafc",
  },
  originalToggle: {
    alignSelf: "flex-start",
    marginTop: 2,
  },
  originalToggleText: {
    color: "rgba(191,219,254,0.95)",
    fontSize: 12,
    fontWeight: "700",
  },
  originalToggleTextMe: {
    color: "rgba(219,234,254,0.98)",
  },
  originalWrap: {
    marginTop: 2,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: "rgba(148,163,184,0.28)",
    gap: 4,
  },
  originalLabel: {
    color: "rgba(148,163,184,0.95)",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  originalLabelMe: {
    color: "rgba(191,219,254,0.95)",
  },
  originalText: {
    color: "rgba(203,213,225,0.94)",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500",
  },
  originalTextMe: {
    color: "rgba(224,242,254,0.95)",
  },
  time: {
    color: "rgba(148,163,184,0.9)",
    fontSize: 12,
    fontWeight: "700",
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
  toolbarActionGroup: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 4,
  },
  plusPanel: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 16,
    paddingHorizontal: 14,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(15,23,42,0.96)",
  },
  plusPanelGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
  },
  plusPanelItem: {
    width: "22%",
    minWidth: 68,
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
    borderRadius: 14,
  },
  plusPanelItemPressed: {
    backgroundColor: "rgba(148,163,184,0.2)",
  },
  plusPanelIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(147,197,253,0.4)",
    backgroundColor: "rgba(30,64,175,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  plusPanelLabel: {
    color: "rgba(226,232,240,0.95)",
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center",
  },
  mediaSheetModalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  mediaSheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.56)",
  },
  mediaSheetContainer: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderBottomWidth: 0,
    backgroundColor: "rgba(15,23,42,0.98)",
    overflow: "hidden",
  },
  mediaSheetHandle: {
    width: 38,
    height: 5,
    borderRadius: 999,
    backgroundColor: "rgba(148,163,184,0.72)",
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 8,
  },
  mediaSheetHeader: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  mediaSheetTitle: {
    color: "rgba(241,245,249,0.98)",
    fontSize: 15,
    fontWeight: "900",
  },
  mediaSheetCloseBtn: {
    width: 30,
    height: 30,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  mediaSheetBody: {
    flex: 1,
  },
  mediaGridContent: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 16,
  },
  mediaGridRow: {
    gap: MEDIA_GRID_GAP,
    marginBottom: MEDIA_GRID_GAP,
  },
  mediaAssetItem: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
    overflow: "hidden",
    position: "relative",
  },
  mediaAssetItemSelected: {
    borderColor: "rgba(96,165,250,0.95)",
  },
  mediaAssetItemPressed: {
    opacity: 0.9,
  },
  mediaAssetThumb: {
    width: "100%",
    height: "100%",
  },
  mediaAssetCheck: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: "rgba(241,245,249,0.92)",
    backgroundColor: "rgba(15,23,42,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  mediaAssetCheckSelected: {
    borderColor: "rgba(59,130,246,1)",
    backgroundColor: "rgba(37,99,235,0.96)",
  },
  mediaAssetVideoBadge: {
    position: "absolute",
    right: 6,
    bottom: 6,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 3,
    backgroundColor: "rgba(2,6,23,0.78)",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  mediaAssetVideoDuration: {
    color: "rgba(241,245,249,0.96)",
    fontSize: 10,
    fontWeight: "800",
  },
  mediaSheetState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 16,
  },
  mediaSheetHint: {
    color: "rgba(148,163,184,0.94)",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },
  mediaSheetError: {
    color: "rgba(248,113,113,0.98)",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },
  mediaSheetRetryBtn: {
    minHeight: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(147,197,253,0.62)",
    backgroundColor: "rgba(30,64,175,0.28)",
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  mediaSheetRetryText: {
    color: "rgba(219,234,254,0.98)",
    fontSize: 12,
    fontWeight: "800",
  },
  mediaSheetFooter: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.10)",
    paddingTop: 10,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  mediaSheetSelection: {
    flex: 1,
    color: "rgba(148,163,184,0.94)",
    fontSize: 12,
    fontWeight: "700",
  },
  mediaSheetSendBtn: {
    minWidth: 84,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  mediaSheetSendBtnDisabled: {
    opacity: 0.45,
  },
  mediaSheetSendText: {
    color: "#0b1220",
    fontSize: 13,
    fontWeight: "900",
  },
  inputIcon: {
    width: 40,
    height: 40,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
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
    color: "#e2e8f0",
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
    backgroundColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: {
    opacity: 0.55,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 14,
    paddingVertical: 18,
    justifyContent: "center",
  },
  modalOverlayBottom: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 14,
    paddingVertical: 18,
    justifyContent: "flex-end",
  },
  actionOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  actionSheet: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(15,23,42,0.92)",
    padding: 14,
    gap: 10,
  },
  menuItem: {
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  menuText: {
    color: "rgba(226,232,240,0.92)",
    fontSize: 13,
    fontWeight: "800",
  },
  menuDangerText: {
    color: "rgba(248,113,113,0.98)",
    fontSize: 13,
    fontWeight: "900",
  },
  aiCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(15,23,42,0.92)",
    padding: 12,
    gap: 10,
  },
  aiModeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  aiModeBtn: {
    flexGrow: 1,
    flexBasis: "30%",
    minHeight: 34,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
  },
  aiModeBtnActive: {
    backgroundColor: "rgba(59,130,246,0.30)",
    borderColor: "rgba(147,197,253,0.62)",
  },
  aiModeBtnText: {
    color: "rgba(226,232,240,0.94)",
    fontSize: 12,
    fontWeight: "900",
  },
  aiAskRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  aiAskInput: {
    flex: 1,
    color: "#e2e8f0",
    fontSize: 13,
    fontWeight: "800",
    paddingVertical: 0,
  },
  aiCandidatesList: {
    maxHeight: 220,
  },
  aiCandidatesListContent: {
    gap: 8,
  },
  aiCandidateItem: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 4,
  },
  aiCandidateItemSelected: {
    borderColor: "rgba(147,197,253,0.78)",
    backgroundColor: "rgba(59,130,246,0.20)",
  },
  aiCandidateTitle: {
    color: "rgba(191,219,254,0.98)",
    fontSize: 12,
    fontWeight: "900",
  },
  aiCandidateText: {
    color: "rgba(226,232,240,0.92)",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
  },
  aiCandidateMeta: {
    color: "rgba(148,163,184,0.95)",
    fontSize: 11,
    fontWeight: "800",
  },
  aiHint: {
    color: "rgba(148,163,184,0.95)",
    fontSize: 12,
    fontWeight: "700",
  },
  aiButtonsRow: {
    flexDirection: "row",
    gap: 10,
  },
  aiBtn: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  aiBtnSecondary: {
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  aiBtnDisabled: {
    opacity: 0.6,
  },
  aiBtnText: {
    color: "rgba(226,232,240,0.92)",
    fontSize: 13,
    fontWeight: "900",
  },
  aiError: {
    color: "rgba(248,113,113,0.95)",
    fontSize: 11,
    fontWeight: "800",
  },
  aiAnswerBox: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  aiAnswerText: {
    color: "rgba(226,232,240,0.92)",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
  },
  sheetTitle: {
    color: "#e2e8f0",
    fontSize: 14,
    fontWeight: "900",
  },
  sheetItem: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  sheetText: {
    color: "rgba(226,232,240,0.92)",
    fontSize: 13,
    fontWeight: "800",
  },
  sheetClose: {
    paddingVertical: 10,
    borderRadius: 14,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  sheetCloseText: {
    color: "rgba(226,232,240,0.9)",
    fontSize: 13,
    fontWeight: "900",
  },
  memberCard: {
    width: "92%",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(15,23,42,0.92)",
    padding: 14,
    gap: 10,
    minHeight: 360,
    maxHeight: "92%",
  },
  memberHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  memberTitle: {
    color: "#e2e8f0",
    fontSize: 14,
    fontWeight: "900",
  },
  closeTiny: {
    width: 32,
    height: 32,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    color: "#e2e8f0",
    fontSize: 13,
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
  },
  filterBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  filterBtnActive: {
    borderColor: "rgba(59,130,246,0.35)",
    backgroundColor: "rgba(30,64,175,0.22)",
  },
  filterText: {
    color: "rgba(203,213,225,0.78)",
    fontSize: 11,
    fontWeight: "900",
  },
  filterTextActive: {
    color: "#e2e8f0",
  },
  memberList: {
    minHeight: 160,
    maxHeight: 320,
  },
  memberListContent: {
    gap: 10,
    paddingBottom: 10,
    flexGrow: 1,
  },
  memberHint: {
    color: "rgba(148,163,184,0.95)",
    fontSize: 12,
    fontWeight: "800",
    paddingVertical: 8,
  },
  memberSection: {
    gap: 8,
  },
  memberSectionTitle: {
    color: "rgba(148,163,184,0.95)",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  listFooterHint: {
    color: "rgba(148,163,184,0.95)",
    fontSize: 12,
    fontWeight: "800",
    paddingVertical: 8,
    textAlign: "center",
    alignSelf: "center",
  },
  memberItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  memberItemSelected: {
    borderColor: "rgba(59,130,246,0.42)",
    backgroundColor: "rgba(30,64,175,0.20)",
  },
  memberIdentity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  memberAvatarWrap: {
    width: 34,
    height: 34,
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  memberAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(15,23,42,0.55)",
  },
  memberAvatarFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  memberMain: {
    flex: 1,
    gap: 2,
  },
  memberName: {
    color: "#e2e8f0",
    fontSize: 13,
    fontWeight: "900",
  },
  memberDesc: {
    color: "rgba(148,163,184,0.95)",
    fontSize: 11,
    fontWeight: "700",
  },
  currentRow: {
    gap: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  currentTitle: {
    color: "rgba(148,163,184,0.95)",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
  },
  currentChips: {
    gap: 8,
    paddingBottom: 4,
  },
  currentChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  currentChipText: {
    color: "rgba(226,232,240,0.88)",
    fontSize: 11,
    fontWeight: "900",
  },
  memberFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    paddingTop: 4,
  },
  memberFooterGhost: {
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  memberFooterGhostText: {
    color: "rgba(226,232,240,0.86)",
    fontSize: 12,
    fontWeight: "800",
  },
  memberFooterCta: {
    minHeight: 38,
    minWidth: 82,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
  },
  memberFooterCtaDisabled: {
    opacity: 0.55,
  },
  memberFooterCtaText: {
    color: "#0b1220",
    fontSize: 12,
    fontWeight: "900",
  },
});
