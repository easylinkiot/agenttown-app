import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { ChatListItem } from "@/src/components/ChatListItem";
import { KeyframeBackground } from "@/src/components/KeyframeBackground";
import { MiniAppDock } from "@/src/components/MiniAppDock";
import { NpcListItem } from "@/src/components/NpcListItem";
import { LoadingSkeleton, StateBanner } from "@/src/components/StateBlocks";
import { APP_SAFE_AREA_EDGES } from "@/src/constants/safe-area";
import { subscribePendingFriendQrPayload } from "@/src/features/friends/friend-qr-scanner-bridge";
import { getCachedAgentSessions, preloadAgentSessions } from "@/src/features/chat/agent-sessions-cache";
import { parseConversationTimestamp } from "@/src/features/chat/chat-helpers";
import { DesktopHome } from "@/src/features/desktop/DesktopHome";
import { isElectronDesktopShell } from "@/src/features/desktop/runtime";
import { tx } from "@/src/i18n/translate";
import {
  acceptFriendRequest,
  ApiError,
  discoverUsers,
  extractFriendQrToken,
  formatApiError,
  listFriendRequests,
  listNPCs,
  rejectFriendRequest,
  scanFriendQR,
  subscribeRealtime,
} from "@/src/lib/api";
import { isMyBotThreadId, useAgentTown } from "@/src/state/agenttown-context";
import { useAuth } from "@/src/state/auth-context";
import { ChatThread, FriendRequest, NPC } from "@/src/types";

type GroupCategoryOption = {
  key: string;
  groupType: "toc" | "tob";
  zh: string;
  en: string;
};

type PresenceRole = "human" | "bot" | "npc";
type PresenceRemoveKind = "friend" | "agent";

type PresenceItem = {
  id: string;
  entityId: string;
  name: string;
  avatar: string;
  entityType: PresenceRole;
  role: PresenceRole;
  removeKind?: PresenceRemoveKind;
  removeId?: string;
};

const GROUP_CATEGORY_OPTIONS: GroupCategoryOption[] = [
  { key: "toc_learning", groupType: "toc", zh: "学习群", en: "Learning" },
  { key: "toc_interest", groupType: "toc", zh: "兴趣群", en: "Interest" },
  { key: "toc_local_life", groupType: "toc", zh: "本地生活", en: "Local Life" },
  { key: "tob_inventory", groupType: "tob", zh: "库存", en: "Inventory" },
  { key: "tob_after_sales", groupType: "tob", zh: "售后", en: "After-sales" },
  { key: "tob_training", groupType: "tob", zh: "培训", en: "Training" },
  { key: "tob_pricing", groupType: "tob", zh: "价格", en: "Pricing" },
  { key: "tob_promotion", groupType: "tob", zh: "促销", en: "Promotion" },
  { key: "tob_ordering", groupType: "tob", zh: "订货", en: "Ordering" },
];

function groupTypeFromSubCategory(subCategory: string): "toc" | "tob" {
  const found = GROUP_CATEGORY_OPTIONS.find((item) => item.key === subCategory);
  return found?.groupType || "toc";
}

function presenceRoleIcon(role: PresenceRole): React.ComponentProps<typeof Ionicons>["name"] {
  if (role === "bot") return "hardware-chip";
  if (role === "npc") return "sparkles";
  return "person";
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { isSignedIn, user } = useAuth();
  const {
    chatThreads,
    friends,
    agents,
    botConfig,
    resolveFriendDisplayName,
    uiTheme,
    language,
    bootstrapReady,
    createFriend,
    createGroup,
    removeAgent,
    removeFriend,
    refreshAll,
    updateUiTheme,
  } = useAgentTown();
  const tr = useCallback((zh: string, en: string) => tx(language, zh, en), [language]);
  const profileAvatar = user?.avatar || botConfig.avatar;
  const isDesktopHome = isElectronDesktopShell() && windowWidth >= 1180;

  const [peopleModal, setPeopleModal] = useState(false);
  const [friendModal, setFriendModal] = useState(false);
  const [groupModal, setGroupModal] = useState(false);
  const [uiError, setUiError] = useState<string | null>(null);

  const [friendQuery, setFriendQuery] = useState("");
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [requestActionId, setRequestActionId] = useState<string | null>(null);
  const [scanToken, setScanToken] = useState("");
  const [friendActionBusy, setFriendActionBusy] = useState(false);
  const [friendActionStatus, setFriendActionStatus] = useState<string | null>(null);
  const [pendingScannedPayload, setPendingScannedPayload] = useState("");
  const scannerRouteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoreFriendModalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingScanSubmitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [groupName, setGroupName] = useState("");
  const [groupAvatar, setGroupAvatar] = useState("");
  const [groupSubCategory, setGroupSubCategory] = useState<string>("toc_learning");
  const [groupNpcName, setGroupNpcName] = useState("");
  const [groupCommanderUserId, setGroupCommanderUserId] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [refreshingChats, setRefreshingChats] = useState(false);
  const [openingAskAnything, setOpeningAskAnything] = useState(false);
  const [npcList, setNpcList] = useState<NPC[]>([]);

  const list = useMemo(() => {
    const sorted = chatThreads.filter((thread) => !isMyBotThreadId(thread.id));
    sorted.sort((a, b) => {
      const au = a.unreadCount || 0;
      const bu = b.unreadCount || 0;
      if (au !== bu) return bu - au;
      const at = parseConversationTimestamp(a.time || "");
      const bt = parseConversationTimestamp(b.time || "");
      if (typeof at === "number" && typeof bt === "number" && at !== bt) {
        return bt - at;
      }
      if (typeof at === "number") return -1;
      if (typeof bt === "number") return 1;
      return (b.time || "").localeCompare(a.time || "");
    });
    return sorted;
  }, [chatThreads]);

  const presence = useMemo<PresenceItem[]>(() => {
    const displayName = (user?.displayName || "").trim();
    const currentUserId = (user?.id || "").trim();
    const assistantNameEN = displayName ? `${displayName}'s Bot` : "";
    const assistantNameZH = displayName ? `${displayName}的助理` : "";
    const isMyBotId = (value?: string) => {
      const normalized = (value || "").trim().toLowerCase();
      return normalized === "mybot" || normalized === "agent_mybot" || normalized.startsWith("agent_userbot_");
    };

    const items = [
      ...friends
        .filter((f) => {
          const ownerId = (f.ownerId || "").trim();
          const friendUserId = (f.userId || "").trim();
          const isSelfAssistantBot =
            f.kind === "bot" &&
            currentUserId !== "" &&
            (friendUserId === currentUserId ||
              (ownerId === currentUserId && (f.threadId || "").trim().toLowerCase() === "mybot"));
          if (isSelfAssistantBot) return false;
          if (isMyBotId(f.userId) || isMyBotId(f.id)) return false;
          const normalizedName = (f.name || "").trim().toLowerCase();
          if (f.kind === "bot" && normalizedName === "mybot") return false;
          if (assistantNameEN && normalizedName === assistantNameEN.toLowerCase()) return false;
          if (assistantNameZH && normalizedName === assistantNameZH.toLowerCase()) return false;
          return true;
        })
        .map((f) => {
          const role: PresenceRole = f.kind === "bot" ? "bot" : "human";
          return {
            id: `friend:${f.id}`,
            entityId: f.userId || f.id,
            name: role === "human" ? resolveFriendDisplayName(f, f.name) : f.name,
            avatar: f.avatar,
            entityType: role,
            role,
            removeKind: "friend" as const,
            removeId: f.id,
          };
        }),
      ...agents
        .filter((a) => {
          const id = (a.id || "").trim();
          const name = (a.name || "").trim();
          if (!id) return false;
          if (id === "agent_mybot") return false;
          if (id.startsWith("agent_userbot_")) return false;
          if (assistantNameEN && name === assistantNameEN) return false;
          if (assistantNameZH && name === assistantNameZH) return false;
          return true;
        })
        .map((a) => ({
          id: `agent:${a.id}`,
          entityId: a.id,
          name: a.name,
          avatar: a.avatar,
          entityType: "npc" as const,
          role: "npc" as const,
          removeKind: "agent" as const,
          removeId: a.id,
        })),
    ];
    return items.slice(0, 9);
  }, [agents, friends, resolveFriendDisplayName, user?.displayName, user?.id]);

  const handleRemovePresence = useCallback(
    (item: PresenceItem) => {
      const removeId = (item.removeId || "").trim();
      const removeKind = item.removeKind;
      if (!removeId || !removeKind) return;

      const itemName = (item.name || "").trim();
      const fallbackName = item.role === "npc" ? tr("这个 NPC", "this NPC") : tr("这个联系人", "this contact");
      const target = itemName || fallbackName;

      Alert.alert(
        tr("删除", "Delete"),
        item.role === "npc"
          ? tr(`确认删除 ${target} 吗？`, `Delete ${target}?`)
          : tr(`确认移除 ${target} 吗？`, `Remove ${target}?`),
        [
          { text: tr("取消", "Cancel"), style: "cancel" },
          {
            text: tr("删除", "Delete"),
            style: "destructive",
            onPress: () => {
              void (async () => {
                try {
                  if (removeKind === "agent") {
                    await removeAgent(removeId);
                  } else {
                    await removeFriend(removeId);
                  }
                } catch (err) {
                  setUiError(formatApiError(err));
                }
              })();
            },
          },
        ]
      );
    },
    [removeAgent, removeFriend, tr]
  );

  useEffect(() => {
    if (!friendModal) return;
    let cancelled = false;
    const run = async () => {
      setLoadingRequests(true);
      try {
        const list = await listFriendRequests();
        if (!cancelled) {
          const actorUserID = (user?.id || "").trim();
          const incoming = Array.isArray(list)
            ? list.filter(
                (req) =>
                  (req.status || "").trim() === "pending" &&
                  (req.toUserId || "").trim() === actorUserID
              )
            : [];
          setFriendRequests(incoming);
        }
      } catch (err) {
        if (!cancelled) {
          setFriendRequests([]);
          setUiError(formatApiError(err));
        }
      } finally {
        if (!cancelled) {
          setLoadingRequests(false);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [friendModal, user?.id]);

  useEffect(() => {
    const actorUserID = (user?.id || "").trim();
    if (!isSignedIn || !actorUserID) return;

    const syncIncomingRequests = async () => {
      try {
        const list = await listFriendRequests();
        const incoming = Array.isArray(list)
          ? list.filter(
              (req) =>
                (req.status || "").trim() === "pending" &&
                (req.toUserId || "").trim() === actorUserID
            )
          : [];
        setFriendRequests(incoming);
      } catch {
        // Keep the last visible request state if realtime refresh fails.
      }
    };

    const unsubscribe = subscribeRealtime((event) => {
      if (!event?.type) return;
      if (event.type !== "friend.request.created" && event.type !== "friend.request.updated") return;

      const payload = (event.payload || {}) as Partial<FriendRequest>;
      const fromUserId = (payload.fromUserId || "").trim();
      const toUserId = (payload.toUserId || "").trim();
      if (fromUserId !== actorUserID && toUserId !== actorUserID) return;

      if (fromUserId === actorUserID && (payload.status || "").trim() === "accepted") {
        setFriendActionStatus(tr("对方已接受邀请，已进入好友列表。", "Invite accepted. The friend is now in your list."));
      }

      if (friendModal) {
        void syncIncomingRequests();
      }
    });

    return unsubscribe;
  }, [friendModal, isSignedIn, tr, user?.id]);

  useEffect(() => {
    if (!friendModal && !pendingScannedPayload) {
      setFriendQuery("");
      setScanToken("");
      setFriendActionStatus(null);
      setFriendActionBusy(false);
    }
  }, [friendModal, pendingScannedPayload]);

  useEffect(() => {
    const unsubscribe = subscribePendingFriendQrPayload((payload) => {
      setPendingScannedPayload(typeof payload === "string" ? payload : "");
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    return () => {
      if (scannerRouteTimerRef.current) {
        clearTimeout(scannerRouteTimerRef.current);
        scannerRouteTimerRef.current = null;
      }
      if (restoreFriendModalTimerRef.current) {
        clearTimeout(restoreFriendModalTimerRef.current);
        restoreFriendModalTimerRef.current = null;
      }
      if (pendingScanSubmitTimerRef.current) {
        clearTimeout(pendingScanSubmitTimerRef.current);
        pendingScanSubmitTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!isSignedIn) return;
    void preloadAgentSessions().catch(() => {
      // Ignore preload failures on home. Chat page will retry.
    });
  }, [isSignedIn]);

  const refreshNPCList = useCallback(async () => {
    try {
      const rows = await listNPCs();
      setNpcList(rows);
    } catch {
      setNpcList([]);
    }
  }, []);

  useEffect(() => {
    if (!isSignedIn) {
      setNpcList([]);
      return;
    }
    void refreshNPCList();
  }, [isSignedIn, refreshNPCList]);

  useFocusEffect(
    useCallback(() => {
      if (!isSignedIn) {
        setNpcList([]);
        return;
      }
      void refreshNPCList();
    }, [isSignedIn, refreshNPCList])
  );

  const handleOpenThread = useCallback(
    (thread: ChatThread) => {
      router.push({
        pathname: "/chat/[id]",
        params: {
          id: thread.id,
          name: thread.name,
          avatar: thread.avatar,
          isGroup: thread.isGroup ? "true" : "false",
        },
      });
    },
    [router]
  );

  const handleOpenAskAnything = useCallback(async () => {
    if (openingAskAnything) return;
    setOpeningAskAnything(true);
    try {
      const cached = getCachedAgentSessions();
      const sessions = cached.length > 0 ? cached : await preloadAgentSessions();
      const latest = sessions[0];
      const myBotName = String(botConfig.name || "").trim() || "MyBot";
      router.push({
        pathname: "/ai-chat/[id]" as never,
        params: {
          id: latest?.id || "new",
          name: latest?.title || myBotName,
          isGroup: "false",
        } as never,
      });
    } catch (err) {
      setUiError(formatApiError(err));
    } finally {
      setOpeningAskAnything(false);
    }
  }, [botConfig.name, openingAskAnything, router]);

  const handleOpenNpc = useCallback(
    (npc: NPC) => {
      router.push({
        pathname: "/npc-chat/[npcId]" as never,
        params: {
          npcId: npc.id,
          name: npc.name,
        } as never,
      });
    },
    [router]
  );

  const openEntityConfig = useCallback(
    (entity: { entityType: "human" | "bot" | "npc"; entityId?: string; name?: string; avatar?: string }) => {
      if (entity.entityType === "human" && entity.entityId && entity.entityId === (user?.id || "")) {
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

  const openThreadAvatarConfig = useCallback(
    (thread: ChatThread) => {
      const threadID = (thread.id || "").trim();
      if (threadID === "mybot" || threadID === "agent_mybot" || threadID.startsWith("agent_userbot_")) {
        openEntityConfig({
          entityType: "bot",
          entityId: threadID === "mybot" ? "agent_mybot" : threadID,
          name: thread.name,
          avatar: thread.avatar,
        });
        return;
      }
      if (threadID.startsWith("agent_")) {
        openEntityConfig({
          entityType: "npc",
          entityId: threadID,
          name: thread.name,
          avatar: thread.avatar,
        });
        return;
      }
      const linkedFriend = friends.find((item) => item.threadId === threadID);
      if (linkedFriend) {
        openEntityConfig({
          entityType: linkedFriend.kind === "bot" ? "bot" : "human",
          entityId: linkedFriend.userId || linkedFriend.id,
          name: linkedFriend.name,
          avatar: linkedFriend.avatar,
        });
        return;
      }
      openEntityConfig({
        entityType: "npc",
        entityId: thread.groupNpcAgentId || threadID,
        name: thread.groupNpcName || thread.name,
        avatar: thread.avatar,
      });
    },
    [friends, openEntityConfig]
  );

  const handleAddFriendByAccount = async () => {
    const query = friendQuery.trim();
    if (!query || friendActionBusy) return;
    setUiError(null);
    setFriendActionBusy(true);
    setFriendActionStatus(null);

    try {
      const list = await discoverUsers(query);
      const actorUserID = (user?.id || "").trim();
      const linkedFriendUserIDs = new Set(
        friends
          .map((item) => (item.userId || "").trim())
          .filter((item) => item.length > 0)
      );
      const matches = (Array.isArray(list) ? list : []).filter((candidate) => {
        const candidateID = (candidate.id || "").trim();
        if (!candidateID) return false;
        if (candidateID === actorUserID) return false;
        if (linkedFriendUserIDs.has(candidateID)) return false;
        return true;
      });
      if (matches.length === 0) {
        setFriendActionStatus(
          tr(
            "未找到可添加的用户，请输入更准确的邮箱或请好友分享二维码。",
            "No matching user found. Enter a precise email or ask your friend for a QR payload."
          )
        );
        return;
      }
      if (matches.length > 1) {
        setFriendActionStatus(
          tr(
            "匹配到多个用户，请输入更完整的邮箱，或直接使用好友二维码。",
            "Multiple users matched. Enter a more precise email, or use your friend's QR payload."
          )
        );
        return;
      }

      const candidate = matches[0];
      const candidateID = (candidate?.id || "").trim();
      if (!candidateID) return;
      const created = await createFriend({
        userId: candidateID,
        name: candidate.displayName,
        kind: "human",
      });
      await refreshAll();
      setFriendQuery("");
      setFriendActionStatus(
        created
          ? tr("添加成功，已进入好友列表。", "Friend added successfully.")
          : tr("邀请已发送，等待对方接受。", "Invite sent. Waiting for acceptance.")
      );
    } catch (err) {
      const pendingCode = err instanceof ApiError ? (err.code || "").toLowerCase() : "";
      const pendingMsg = err instanceof ApiError ? (err.message || "").toLowerCase() : "";
      if (pendingCode.includes("request_pending") || pendingMsg.includes("already pending")) {
        setFriendActionStatus(
          tr(
            "邀请已发送，等待对方接受后会出现在好友列表。",
            "Invite already pending. It will appear after acceptance."
          )
        );
      } else {
        setUiError(formatApiError(err));
      }
    } finally {
      setFriendActionBusy(false);
    }
  };

  const handleAcceptFriendRequest = async (requestId: string) => {
    if (!requestId || requestActionId) return;
    setRequestActionId(requestId);
    setUiError(null);
    try {
      const accepted = await acceptFriendRequest(requestId);
      await refreshAll();
      setFriendRequests((prev) => prev.filter((item) => item.id !== requestId));
      setFriendActionStatus(tr("好友邀请已接受。", "Friend invite accepted."));
      if (accepted.thread?.id) {
        setFriendModal(false);
        handleOpenThread(accepted.thread);
      }
    } catch (err) {
      setUiError(formatApiError(err));
    } finally {
      setRequestActionId(null);
    }
  };

  const handleRejectFriendRequest = async (requestId: string) => {
    if (!requestId || requestActionId) return;
    setRequestActionId(requestId);
    setUiError(null);
    try {
      await rejectFriendRequest(requestId);
      setFriendRequests((prev) => prev.filter((item) => item.id !== requestId));
    } catch (err) {
      setUiError(formatApiError(err));
    } finally {
      setRequestActionId(null);
    }
  };

  const handleScanByToken = useCallback(
    async (rawInput = scanToken) => {
      const token = extractFriendQrToken(rawInput);
      if (!token || friendActionBusy) return;
      setUiError(null);
      setFriendActionBusy(true);
      setFriendActionStatus(null);
      try {
        const created = await scanFriendQR({ token });
        await refreshAll();
        setScanToken("");
        setFriendActionStatus(
          created?.mode === "friend"
            ? tr("二维码添加成功，已进入好友列表。", "Friend added from QR successfully.")
            : tr("二维码已提交，等待对方接受。", "QR invite sent. Waiting for acceptance.")
        );
      } catch (err) {
        const pendingCode = err instanceof ApiError ? (err.code || "").toLowerCase() : "";
        const pendingMsg = err instanceof ApiError ? (err.message || "").toLowerCase() : "";
        if (pendingCode.includes("request_pending") || pendingMsg.includes("already pending")) {
          setFriendActionStatus(
            tr(
              "邀请已发送，等待对方接受后会出现在好友列表。",
              "Invite already pending. It will appear after acceptance."
            )
          );
        } else if (
          pendingMsg.includes("cannot add yourself") ||
          pendingMsg.includes("add yourself") ||
          pendingCode.includes("validation_error") ||
          (err instanceof ApiError && err.status >= 400 && err.status < 500)
        ) {
          setFriendActionStatus(formatApiError(err));
        } else {
          setUiError(formatApiError(err));
        }
      } finally {
        setFriendActionBusy(false);
      }
    },
    [friendActionBusy, refreshAll, scanToken, tr]
  );

  const handleConfirmFriendAction = async () => {
    if (friendActionBusy) return;
    if (extractFriendQrToken(scanToken)) {
      await handleScanByToken();
      return;
    }
    await handleAddFriendByAccount();
  };

  const canConfirmFriendAction =
    (friendQuery.trim().length > 0 || extractFriendQrToken(scanToken).length > 0) && !friendActionBusy;

  const handleOpenScanner = useCallback(() => {
    setUiError(null);
    setFriendActionStatus(null);
    setFriendModal(false);
    if (restoreFriendModalTimerRef.current) {
      clearTimeout(restoreFriendModalTimerRef.current);
      restoreFriendModalTimerRef.current = null;
    }
    if (pendingScanSubmitTimerRef.current) {
      clearTimeout(pendingScanSubmitTimerRef.current);
      pendingScanSubmitTimerRef.current = null;
    }
    if (scannerRouteTimerRef.current) {
      clearTimeout(scannerRouteTimerRef.current);
    }
    scannerRouteTimerRef.current = setTimeout(() => {
      scannerRouteTimerRef.current = null;
      router.push({
        pathname: "/friend-qr-scanner",
        params: {
          returnTo: "/",
        },
      } as never);
    }, 180);
  }, [router]);

  useEffect(() => {
    if (!friendModal || !pendingScannedPayload) return;

    const raw = typeof pendingScannedPayload === "string" ? pendingScannedPayload : "";
    const token = extractFriendQrToken(raw);
    if (!token) {
      setPendingScannedPayload("");
      setUiError(tr("未识别到好友二维码。", "No valid friend QR code was detected."));
      return;
    }

    setScanToken(raw);
    if (pendingScanSubmitTimerRef.current) {
      clearTimeout(pendingScanSubmitTimerRef.current);
    }
    pendingScanSubmitTimerRef.current = setTimeout(() => {
      pendingScanSubmitTimerRef.current = null;
      void handleScanByToken(raw);
      setPendingScannedPayload("");
    }, 120);

    return () => {
      if (pendingScanSubmitTimerRef.current) {
        clearTimeout(pendingScanSubmitTimerRef.current);
        pendingScanSubmitTimerRef.current = null;
      }
    };
  }, [friendModal, handleScanByToken, pendingScannedPayload, tr]);

  useFocusEffect(
    useCallback(() => {
      if (!pendingScannedPayload || friendModal) return;
      if (restoreFriendModalTimerRef.current) {
        clearTimeout(restoreFriendModalTimerRef.current);
      }
      restoreFriendModalTimerRef.current = setTimeout(() => {
        restoreFriendModalTimerRef.current = null;
        setFriendModal(true);
      }, 260);

      return () => {
        if (restoreFriendModalTimerRef.current) {
          clearTimeout(restoreFriendModalTimerRef.current);
          restoreFriendModalTimerRef.current = null;
        }
      };
    }, [friendModal, pendingScannedPayload])
  );

  const handleCreateGroup = async () => {
    const safeName = groupName.trim();
    if (!safeName || creatingGroup) return;
    setUiError(null);
    setCreatingGroup(true);
    try {
      const created = await createGroup({
        name: safeName,
        avatar: groupAvatar.trim() || undefined,
        memberCount: 1,
        groupType: groupTypeFromSubCategory(groupSubCategory),
        groupSubCategory,
        groupNpcName: groupNpcName.trim() || undefined,
        groupCommanderUserId: groupCommanderUserId.trim() || (user?.id || "").trim() || undefined,
      });
      setGroupModal(false);
      setPeopleModal(false);
      setGroupName("");
      setGroupAvatar("");
      setGroupSubCategory("toc_learning");
      setGroupNpcName("");
      setGroupCommanderUserId("");
      if (created) {
        handleOpenThread(created);
      }
    } catch (err) {
      setUiError(formatApiError(err));
    } finally {
      setCreatingGroup(false);
    }
  };

  const handleRefreshChats = useCallback(async () => {
    if (refreshingChats) return;
    const startedAt = Date.now();
    setUiError(null);
    setRefreshingChats(true);
    try {
      await Promise.all([refreshAll(), refreshNPCList()]);
    } catch (err) {
      setUiError(formatApiError(err));
    } finally {
      const elapsed = Date.now() - startedAt;
      const remain = Math.max(0, 500 - elapsed);
      if (remain > 0) {
        await new Promise((resolve) => setTimeout(resolve, remain));
      }
      setRefreshingChats(false);
    }
  }, [refreshAll, refreshNPCList, refreshingChats]);

  return (
    <KeyframeBackground>
      <SafeAreaView edges={APP_SAFE_AREA_EDGES} style={styles.safeArea}>
        {isDesktopHome ? (
          <DesktopHome
            profileAvatar={profileAvatar}
            uiTheme={uiTheme}
            language={language}
            bootstrapReady={bootstrapReady}
            openingAskAnything={openingAskAnything}
            refreshingChats={refreshingChats}
            uiError={uiError}
            chats={list}
            npcList={npcList}
            presence={presence}
            tr={tr}
            onRefreshChats={handleRefreshChats}
            onOpenAskAnything={handleOpenAskAnything}
            onOpenThread={handleOpenThread}
            onOpenNpc={handleOpenNpc}
            onOpenConfig={() => router.push("/config" as never)}
            onUpdateUiTheme={updateUiTheme}
            onOpenTownMap={() => router.push("/town-map" as never)}
            onOpenPeopleModal={() => setPeopleModal(true)}
            onOpenFriendModal={() => setFriendModal(true)}
            onOpenGroupModal={() => setGroupModal(true)}
            onOpenAgents={() => router.push("/agents" as never)}
            onOpenThreadAvatarConfig={openThreadAvatarConfig}
            onOpenEntityConfig={openEntityConfig}
          />
        ) : (
          <View style={styles.container}>
            <View style={styles.topBar}>
              <Pressable style={styles.profileChip} onPress={() => router.push("/config" as never)}>
                <Image source={{ uri: profileAvatar }} style={styles.profileAvatar} />
                <View style={styles.onlineDot} />
              </Pressable>

              <Pressable style={styles.worldMapPill} onPress={() => router.push("/town-map" as never)}>
                <Ionicons name="globe-outline" size={14} color="rgba(226,232,240,0.92)" />
                <Text style={styles.worldMapText}>{tr("世界地图", "WORLD MAP")}</Text>
              </Pressable>

              <View style={styles.topActions}>
                <Pressable style={styles.topIcon} onPress={() => router.push("/town-map" as never)}>
                  <Ionicons name="locate-outline" size={16} color="rgba(226,232,240,0.92)" />
                </Pressable>
                <Pressable style={styles.topIcon} testID="home-quick-actions-open" onPress={() => setPeopleModal(true)}>
                  <Ionicons name="people-outline" size={16} color="rgba(226,232,240,0.92)" />
                </Pressable>
              </View>
            </View>

            <MiniAppDock />

            <Pressable
              testID="home-mybot-entry"
              style={styles.askBar}
              onPress={() => {
                void handleOpenAskAnything();
              }}
            >
              <View style={styles.askPlus}>
                <Ionicons name="add" size={16} color="rgba(226,232,240,0.92)" />
              </View>
              <Text style={styles.askPlaceholder}>{tr("Ask anything", "Ask anything")}</Text>
              <View style={styles.askRight}>
                {openingAskAnything ? (
                  <ActivityIndicator size="small" color="rgba(226,232,240,0.75)" />
                ) : (
                  <>
                    <Ionicons name="mic-outline" size={16} color="rgba(226,232,240,0.75)" />
                    <Ionicons name="send" size={16} color="rgba(226,232,240,0.75)" />
                  </>
                )}
              </View>
            </Pressable>

            {uiError ? (
              <StateBanner
                variant="error"
                title={tr("加载失败", "Something went wrong")}
                message={uiError}
                actionLabel={tr("关闭", "Dismiss")}
                onAction={() => setUiError(null)}
              />
            ) : null}
            {refreshingChats ? (
              <View style={styles.refreshHint}>
                <ActivityIndicator size="small" color="#93c5fd" />
                <Text style={styles.refreshHintText}>{tr("刷新会话中...", "Refreshing chats...")}</Text>
              </View>
            ) : null}

            {!bootstrapReady ? (
              <LoadingSkeleton kind="chat_list" />
            ) : (
              <FlatList
                testID="home-chat-list"
                data={list}
                keyExtractor={(item) => item.id}
                style={styles.chatList}
                alwaysBounceVertical
                refreshControl={
                  <RefreshControl
                    refreshing={refreshingChats}
                    onRefresh={handleRefreshChats}
                    tintColor="rgba(226,232,240,0.92)"
                    colors={["#60a5fa"]}
                    progressBackgroundColor="rgba(15,23,42,0.92)"
                    progressViewOffset={10}
                  />
                }
                renderItem={({ item }) => (
                  <ChatListItem
                    chat={item}
                    language={language}
                    theme="neo"
                    onPress={() => handleOpenThread(item)}
                    onAvatarPress={openThreadAvatarConfig}
                  />
                )}
                contentContainerStyle={styles.listContent}
                ListHeaderComponent={
                  npcList.length > 0 ? (
                    <View style={styles.npcListWrap}>
                      {npcList.map((npc) => (
                        <NpcListItem key={npc.id} npc={npc} onPress={() => handleOpenNpc(npc)} />
                      ))}
                    </View>
                  ) : null
                }
              />
            )}

            <View style={[styles.presenceBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.presenceScroll}
                contentContainerStyle={styles.presenceRow}
              >
                <Pressable style={styles.presenceAddInline} onPress={() => setPeopleModal(true)}>
                  <Ionicons name="add" size={18} color="rgba(226,232,240,0.92)" />
                </Pressable>
                {presence.length
                  ? presence.map((item, index) => {
                    const fallbackBase = item.role === "human" ? tr("好友", "Friend") : item.role.toUpperCase();
                    const suffix = (item.entityId || item.id).replace(/[^a-zA-Z0-9]/g, "").slice(-4);
                    const displayName = (item.name || "").trim() || (suffix ? `${fallbackBase}-${suffix}` : fallbackBase);
                    return (
                      <Pressable
                        key={item.id}
                        testID={`home-presence-item-${index}`}
                        style={styles.presenceItem}
                        onLongPress={() => handleRemovePresence(item)}
                        delayLongPress={280}
                        onPress={() =>
                          openEntityConfig({
                            entityType: item.entityType,
                            entityId: item.entityId,
                            name: item.name,
                            avatar: item.avatar,
                          })
                        }
                      >
                        <View style={styles.presenceAvatarWrap}>
                          {item.avatar ? (
                            <Image source={{ uri: item.avatar }} style={styles.presenceAvatar} />
                          ) : (
                            <View style={[styles.presenceAvatar, styles.presenceAvatarFallback]}>
                              <Ionicons name="person-outline" size={18} color="rgba(226,232,240,0.82)" />
                            </View>
                          )}
                          <View
                            testID={`home-presence-role-badge-${index}-${item.role}`}
                            style={[
                              styles.presenceRoleBadge,
                              item.role === "npc"
                                ? styles.presenceRoleBadgeNpc
                                : item.role === "bot"
                                  ? styles.presenceRoleBadgeBot
                                  : styles.presenceRoleBadgeHuman,
                            ]}
                          >
                            <Ionicons
                              name={presenceRoleIcon(item.role)}
                              size={9}
                              color={item.role === "human" ? "rgba(12,18,32,0.95)" : "rgba(248,250,252,0.95)"}
                            />
                          </View>
                          <View style={styles.presenceDot} />
                        </View>
                        <Text testID={`home-presence-name-${index}`} style={styles.presenceName} numberOfLines={1}>
                          {displayName}
                        </Text>
                      </Pressable>
                    );
                  })
                  : null}
              </ScrollView>
            </View>
          </View>
        )}

        <Modal
          visible={peopleModal}
          transparent
          animationType="fade"
          onRequestClose={() => setPeopleModal(false)}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setPeopleModal(false)}>
            <Pressable style={styles.actionSheet} onPress={() => null}>
              <Text style={styles.sheetTitle}>{tr("快捷入口", "Quick Actions")}</Text>
              <Pressable
                style={styles.sheetItem}
                onPress={() => {
                  setPeopleModal(false);
                  setTimeout(() => setFriendModal(true), 120);
                }}
              >
                <Ionicons name="person-add-outline" size={16} color="#bfdbfe" />
                <Text style={styles.sheetText}>{tr("添加朋友", "Add Friend")}</Text>
              </Pressable>
              <Pressable
                style={styles.sheetItem}
                onPress={() => {
                  setPeopleModal(false);
                  setTimeout(() => setGroupModal(true), 120);
                }}
              >
                <Ionicons name="people-outline" size={16} color="#bfdbfe" />
                <Text style={styles.sheetText}>{tr("新建群聊", "New Group")}</Text>
              </Pressable>
              <Pressable style={styles.sheetItem} onPress={() => router.push("/agents" as never)}>
                <Ionicons name="hardware-chip-outline" size={16} color="#bfdbfe" />
                <Text style={styles.sheetText}>{tr("Agent / Bot", "Agents / Bots")}</Text>
              </Pressable>
              <Pressable style={styles.sheetItem} testID="home-quick-miniapps" onPress={() => router.push("/miniapps" as never)}>
                <Ionicons name="apps-outline" size={16} color="#bfdbfe" />
                <Text style={styles.sheetText}>{tr("Mini Apps", "Mini Apps")}</Text>
              </Pressable>
              <Pressable
                style={styles.sheetItem}
                onPress={() => {
                  setPeopleModal(false);
                  router.push("/npc-create" as never);
                }}
              >
                <Ionicons name="sparkles-outline" size={16} color="#bfdbfe" />
                <Text style={styles.sheetText}>{tr("创建 NPC", "Create NPC")}</Text>
              </Pressable>
              <Pressable style={styles.sheetClose} onPress={() => setPeopleModal(false)}>
                <Text style={styles.sheetCloseText}>{tr("关闭", "Close")}</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>

        <Modal visible={friendModal} transparent animationType="fade" onRequestClose={() => setFriendModal(false)}>
          <Pressable style={styles.modalOverlay} onPress={() => setFriendModal(false)}>
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : undefined}
              keyboardVerticalOffset={Platform.OS === "ios" ? 24 : 0}
            >
            <Pressable style={styles.formCard} onPress={() => null}>
              <Text style={styles.formTitle}>{tr("添加朋友", "Add Friend")}</Text>
              <TextInput
                value={friendQuery}
                onChangeText={setFriendQuery}
                placeholder={tr("输入好友邮箱或账号标识", "Enter your friend's email or account")}
                placeholderTextColor="rgba(148,163,184,0.9)"
                style={styles.input}
              autoComplete="off"
              textContentType="oneTimeCode"
              importantForAutofill="no"
              />
              <Text style={styles.friendHelpText}>
                {tr(
                  "可直接输入好友账号，或粘贴好友分享的二维码 / 链接。",
                  "Enter your friend's account, or paste a QR payload / share link."
                )}
              </Text>

              <View style={styles.qrScanRow}>
                <TextInput
                  value={scanToken}
                  onChangeText={setScanToken}
                  placeholder={tr("粘贴二维码、分享链接或扫码结果", "Paste QR payload, share link, or scan result")}
                  placeholderTextColor="rgba(148,163,184,0.9)"
                  style={[styles.input, styles.qrScanInput]}
                autoComplete="off"
                textContentType="oneTimeCode"
                importantForAutofill="no"
                />
                <Pressable
                  style={[styles.scanBtn, friendActionBusy && styles.formCtaDisabled]}
                  onPress={() => {
                    void handleOpenScanner();
                  }}
                  disabled={friendActionBusy}
                >
                  <Ionicons name="scan-outline" size={16} color="#dbeafe" />
                  <Text style={styles.scanBtnText}>{tr("扫码", "Scan")}</Text>
                </Pressable>
              </View>
              <Text style={styles.friendHelpText}>
                {tr(
                  "系统相机扫码打开 UsChat 后，也会自动识别好友二维码。",
                  "If the system camera opens UsChat after scanning, the friend QR will be recognized automatically."
                )}
              </Text>

              <View style={styles.candidateList}>
                {friendActionStatus ? (
                  <View style={styles.friendStatusCard}>
                    <Text style={styles.friendStatusText}>{friendActionStatus}</Text>
                  </View>
                ) : null}
                {loadingRequests ? (
                  <View style={styles.candidateLoading}>
                    <ActivityIndicator color="#93c5fd" />
                  </View>
                ) : null}

                {!loadingRequests && friendRequests.length > 0 ? (
                  <View style={styles.requestSection}>
                    <Text style={styles.requestTitle}>{tr("好友邀请", "Friend Requests")}</Text>
                    {friendRequests.map((req) => (
                      <View key={req.id} style={styles.requestItem}>
                        <Pressable
                          onPress={() =>
                            openEntityConfig({
                              entityType: "human",
                              entityId: req.fromUserId,
                              name: req.fromName || "",
                              avatar:
                                req.fromAvatar ||
                                "https://img.freepik.com/free-psd/3d-illustration-human-avatar-profile_23-2150671142.jpg?w=200",
                            })
                          }
                        >
                          <Image
                            source={{
                              uri:
                                req.fromAvatar ||
                                "https://img.freepik.com/free-psd/3d-illustration-human-avatar-profile_23-2150671142.jpg?w=200",
                            }}
                            style={styles.candidateAvatar}
                          />
                        </Pressable>
                        <View style={styles.candidateBody}>
                          <Text numberOfLines={1} style={styles.candidateName}>
                            {req.fromName || tr("未知用户", "Unknown User")}
                          </Text>
                          <Text numberOfLines={1} style={styles.candidateMeta}>
                            {tr("邀请你成为好友", "Sent you a friend invite")}
                          </Text>
                        </View>
                        <Pressable
                          disabled={Boolean(requestActionId)}
                          style={styles.requestActionBtn}
                          onPress={() => handleAcceptFriendRequest(req.id)}
                        >
                          <Text style={styles.requestActionText}>
                            {requestActionId === req.id ? tr("处理中...", "Working...") : tr("接受", "Accept")}
                          </Text>
                        </Pressable>
                        <Pressable
                          disabled={Boolean(requestActionId)}
                          style={styles.requestActionBtnGhost}
                          onPress={() => handleRejectFriendRequest(req.id)}
                        >
                          <Text style={styles.requestActionTextGhost}>{tr("拒绝", "Decline")}</Text>
                        </Pressable>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.candidateEmpty}>
                    {tr("暂无新的好友邀请。", "No incoming friend invites.")}
                  </Text>
                )}
              </View>

              <View style={styles.formFooter}>
                <Pressable style={styles.formGhost} onPress={() => setFriendModal(false)}>
                  <Text style={styles.formGhostText}>{tr("取消", "Cancel")}</Text>
                </Pressable>
                <Pressable
                  style={[styles.formCta, !canConfirmFriendAction && styles.formCtaDisabled]}
                  disabled={!canConfirmFriendAction}
                  onPress={handleConfirmFriendAction}
                >
                  <Text style={styles.formCtaText}>
                    {friendActionBusy ? tr("处理中...", "Working...") : tr("确认添加", "Confirm")}
                  </Text>
                </Pressable>
              </View>
            </Pressable>
            </KeyboardAvoidingView>
          </Pressable>
        </Modal>

        <Modal visible={groupModal} transparent animationType="fade" onRequestClose={() => setGroupModal(false)}>
          <Pressable style={styles.modalOverlay} onPress={() => setGroupModal(false)}>
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : undefined}
              keyboardVerticalOffset={Platform.OS === "ios" ? 24 : 0}
            >
            <Pressable style={styles.formCard} onPress={() => null}>
              <Text style={styles.formTitle}>{tr("新建群聊", "New Group")}</Text>
              <TextInput
                value={groupName}
                onChangeText={setGroupName}
                placeholder={tr("群名称", "Group name")}
                placeholderTextColor="rgba(148,163,184,0.9)"
                style={styles.input}
              autoComplete="off"
              textContentType="oneTimeCode"
              importantForAutofill="no"
              />
              <TextInput
                value={groupAvatar}
                onChangeText={setGroupAvatar}
                placeholder={tr("头像 URL（可选）", "Avatar URL (optional)")}
                placeholderTextColor="rgba(148,163,184,0.9)"
                style={styles.input}
              autoComplete="off"
              textContentType="oneTimeCode"
              importantForAutofill="no"
              />
              <Text style={styles.requestTitle}>{tr("群类型子分类", "Group sub-category")}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                {GROUP_CATEGORY_OPTIONS.map((item) => {
                  const active = groupSubCategory === item.key;
                  return (
                    <Pressable
                      key={item.key}
                      style={[
                        {
                          minHeight: 38,
                          paddingHorizontal: 12,
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: "rgba(255,255,255,0.14)",
                          backgroundColor: active ? "rgba(37,99,235,0.28)" : "rgba(15,23,42,0.55)",
                        },
                      ]}
                      onPress={() => setGroupSubCategory(item.key)}
                    >
                      <Text
                        style={{
                          color: active ? "rgba(219,234,254,0.98)" : "rgba(203,213,225,0.92)",
                          fontSize: 13,
                          fontWeight: "800",
                        }}
                      >
                        {tr(item.zh, item.en)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <TextInput
                value={groupNpcName}
                onChangeText={setGroupNpcName}
                placeholder={tr("群 NPC 名称（可选）", "Group NPC name (optional)")}
                placeholderTextColor="rgba(148,163,184,0.9)"
                style={styles.input}
              autoComplete="off"
              textContentType="oneTimeCode"
              importantForAutofill="no"
              />
              <TextInput
                value={groupCommanderUserId}
                onChangeText={setGroupCommanderUserId}
                placeholder={tr("可发号施令用户ID（可选）", "Command userId (optional)")}
                placeholderTextColor="rgba(148,163,184,0.9)"
                style={styles.input}
              autoComplete="off"
              textContentType="oneTimeCode"
              importantForAutofill="no"
              />
              <View style={styles.formFooter}>
                <Pressable
                  style={styles.formGhost}
                  onPress={() => {
                    setGroupModal(false);
                    setGroupSubCategory("toc_learning");
                    setGroupNpcName("");
                    setGroupCommanderUserId("");
                  }}
                >
                  <Text style={styles.formGhostText}>{tr("取消", "Cancel")}</Text>
                </Pressable>
                <Pressable
                  style={[styles.formCta, (!groupName.trim() || creatingGroup) && styles.formCtaDisabled]}
                  onPress={handleCreateGroup}
                >
                  <Text style={styles.formCtaText}>
                    {creatingGroup ? tr("创建中...", "Creating...") : tr("创建", "Create")}
                  </Text>
                </Pressable>
              </View>
            </Pressable>
            </KeyboardAvoidingView>
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
  container: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 10,
    gap: 12,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  profileChip: {
    width: 44,
    height: 44,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  profileAvatar: {
    width: 30,
    height: 30,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  onlineDot: {
    position: "absolute",
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: "#22c55e",
    bottom: 9,
    right: 9,
    borderWidth: 2,
    borderColor: "rgba(15,23,42,0.95)",
  },
  worldMapPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    height: 44,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  worldMapText: {
    color: "rgba(226,232,240,0.92)",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1,
  },
  topActions: {
    flexDirection: "row",
    gap: 10,
  },
  topIcon: {
    width: 44,
    height: 44,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  askBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(15,23,42,0.55)",
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  askPlus: {
    width: 30,
    height: 30,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  askPlaceholder: {
    flex: 1,
    color: "rgba(148,163,184,0.95)",
    fontSize: 13,
    fontWeight: "700",
  },
  askRight: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  listContent: {
    flexGrow: 1,
    paddingTop: 6,
    paddingBottom: 18,
  },
  npcListWrap: {
    marginBottom: 8,
  },
  refreshHint: {
    minHeight: 34,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(147,197,253,0.28)",
    backgroundColor: "rgba(15,23,42,0.55)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 10,
    marginTop: -2,
    marginBottom: 2,
  },
  refreshHintText: {
    color: "rgba(226,232,240,0.92)",
    fontSize: 12,
    fontWeight: "700",
  },
  chatList: {
    flex: 1,
  },
  presenceRow: {
    gap: 10,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  presenceBar: {
    flexDirection: "row",
    alignItems: "center",
  },
  presenceScroll: {
    flex: 1,
  },
  presenceItem: {
    width: 56,
    alignItems: "center",
    gap: 5,
  },
  presenceAvatarWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  presenceAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  presenceAvatarFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(148,163,184,0.45)",
  },
  presenceRoleBadge: {
    position: "absolute",
    width: 14,
    height: 14,
    borderRadius: 7,
    right: 0,
    bottom: 0,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  presenceRoleBadgeHuman: {
    backgroundColor: "rgba(226,232,240,0.95)",
    borderColor: "rgba(191,219,254,0.72)",
  },
  presenceRoleBadgeBot: {
    backgroundColor: "rgba(37,99,235,0.95)",
    borderColor: "rgba(191,219,254,0.78)",
  },
  presenceRoleBadgeNpc: {
    backgroundColor: "rgba(15,118,110,0.95)",
    borderColor: "rgba(167,243,208,0.78)",
  },
  presenceName: {
    width: "100%",
    color: "rgba(226,232,240,0.9)",
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "700",
    textAlign: "center",
  },
  presenceAddInline: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  presenceDot: {
    position: "absolute",
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: "#22c55e",
    bottom: 4,
    right: 4,
    borderWidth: 2,
    borderColor: "rgba(15,23,42,0.95)",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 14,
    paddingVertical: 18,
    justifyContent: "center",
  },
  actionSheet: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(15,23,42,0.92)",
    padding: 14,
    gap: 10,
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
  formCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(15,23,42,0.92)",
    padding: 14,
    gap: 10,
  },
  formTitle: {
    color: "#e2e8f0",
    fontSize: 14,
    fontWeight: "900",
  },
  input: {
    minHeight: 42,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.05)",
    color: "#e2e8f0",
    paddingHorizontal: 12,
    fontSize: 13,
  },
  friendHelpText: {
    color: "rgba(148,163,184,0.92)",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    paddingHorizontal: 4,
  },
  candidateList: {
    minHeight: 180,
    maxHeight: 320,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.03)",
    padding: 8,
  },
  qrScanRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  qrScanInput: {
    flex: 1,
  },
  scanBtn: {
    minWidth: 86,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(96,165,250,0.45)",
    backgroundColor: "rgba(37,99,235,0.28)",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 12,
  },
  scanBtnText: {
    color: "#dbeafe",
    fontSize: 12,
    fontWeight: "800",
  },
  friendStatusCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(96,165,250,0.3)",
    backgroundColor: "rgba(30,64,175,0.2)",
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
  },
  friendStatusText: {
    color: "rgba(219,234,254,0.96)",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
  },
  candidateLoading: {
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  candidateAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  candidateBody: {
    flex: 1,
  },
  candidateName: {
    color: "rgba(226,232,240,0.94)",
    fontSize: 13,
    fontWeight: "800",
  },
  candidateMeta: {
    color: "rgba(148,163,184,0.9)",
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
  },
  candidateEmpty: {
    color: "rgba(148,163,184,0.92)",
    fontSize: 12,
    fontWeight: "700",
    paddingHorizontal: 8,
    paddingVertical: 12,
    lineHeight: 18,
  },
  requestSection: {
    marginBottom: 8,
    gap: 8,
  },
  requestTitle: {
    color: "rgba(191,219,254,0.95)",
    fontSize: 12,
    fontWeight: "900",
    paddingHorizontal: 6,
    paddingTop: 4,
  },
  requestItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(96,165,250,0.24)",
    backgroundColor: "rgba(30,64,175,0.18)",
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  requestActionBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.42)",
    backgroundColor: "rgba(30,64,175,0.34)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  requestActionText: {
    color: "#dbeafe",
    fontSize: 11,
    fontWeight: "900",
  },
  requestActionBtnGhost: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  requestActionTextGhost: {
    color: "rgba(226,232,240,0.9)",
    fontSize: 11,
    fontWeight: "900",
  },
  choiceRow: {
    flexDirection: "row",
    gap: 10,
  },
  choiceBtn: {
    flex: 1,
    minHeight: 40,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  choiceBtnActive: {
    borderColor: "rgba(59,130,246,0.35)",
    backgroundColor: "rgba(30,64,175,0.22)",
  },
  choiceText: {
    color: "rgba(226,232,240,0.9)",
    fontSize: 12,
    fontWeight: "900",
  },
  formFooter: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end",
    paddingTop: 4,
  },
  formGhost: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  formGhostText: {
    color: "rgba(226,232,240,0.82)",
    fontSize: 12,
    fontWeight: "900",
  },
  formCta: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "#e2e8f0",
  },
  formCtaDisabled: {
    opacity: 0.55,
  },
  formCtaText: {
    color: "#0b1220",
    fontSize: 12,
    fontWeight: "900",
  },
});
