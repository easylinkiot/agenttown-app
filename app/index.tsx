import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { ChatListItem } from "@/src/components/ChatListItem";
import { KeyframeBackground } from "@/src/components/KeyframeBackground";
import { MiniAppDock } from "@/src/components/MiniAppDock";
import { EmptyState, LoadingSkeleton, StateBanner } from "@/src/components/StateBlocks";
import { APP_SAFE_AREA_EDGES } from "@/src/constants/safe-area";
import { tx } from "@/src/i18n/translate";
import {
  acceptFriendRequest,
  ApiError,
  atCreateSession,
  createFriendQR,
  discoverUsers,
  formatApiError,
  listFriendRequests,
  mapATSessionToThread,
  rejectFriendRequest,
  scanFriendQR,
  type DiscoverUser,
} from "@/src/lib/api";
import { isMyBotThreadId, useAgentTown } from "@/src/state/agenttown-context";
import { useAuth } from "@/src/state/auth-context";
import { ChatThread, FriendRequest } from "@/src/types";

type GroupCategoryOption = {
  key: string;
  groupType: "toc" | "tob";
  zh: string;
  en: string;
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

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const {
    chatThreads,
    friends,
    agents,
    botConfig,
    language,
    bootstrapReady,
    addChatThread,
    createFriend,
    createGroup,
    refreshAll,
  } = useAgentTown();
  const tr = (zh: string, en: string) => tx(language, zh, en);
  const profileAvatar = user?.avatar || botConfig.avatar;

  const [peopleModal, setPeopleModal] = useState(false);
  const [friendModal, setFriendModal] = useState(false);
  const [groupModal, setGroupModal] = useState(false);
  const [uiError, setUiError] = useState<string | null>(null);

  const [friendQuery, setFriendQuery] = useState("");
  const [friendCandidates, setFriendCandidates] = useState<DiscoverUser[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [addingUserId, setAddingUserId] = useState<string | null>(null);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [requestActionId, setRequestActionId] = useState<string | null>(null);
  const [pendingInviteByUserId, setPendingInviteByUserId] = useState<Record<string, true>>({});
  const [qrToken, setQrToken] = useState("");
  const [qrExpiresAt, setQrExpiresAt] = useState("");
  const [scanToken, setScanToken] = useState("");
  const [loadingQRCreate, setLoadingQRCreate] = useState(false);
  const [loadingQRScan, setLoadingQRScan] = useState(false);

  const [groupName, setGroupName] = useState("");
  const [groupAvatar, setGroupAvatar] = useState("");
  const [groupSubCategory, setGroupSubCategory] = useState<string>("toc_learning");
  const [groupNpcName, setGroupNpcName] = useState("");
  const [groupCommanderUserId, setGroupCommanderUserId] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [refreshingChats, setRefreshingChats] = useState(false);

  const list = useMemo(() => {
    const sorted = chatThreads.filter((thread) => !isMyBotThreadId(thread.id));
    sorted.sort((a, b) => {
      const au = a.unreadCount || 0;
      const bu = b.unreadCount || 0;
      if (au !== bu) return bu - au;
      return (b.time || "").localeCompare(a.time || "");
    });
    return sorted;
  }, [chatThreads]);

  const presence = useMemo(() => {
    const displayName = (user?.displayName || "").trim();
    const assistantNameEN = displayName ? `${displayName}'s Bot` : "";
    const assistantNameZH = displayName ? `${displayName}的助理` : "";
    const isMyBotId = (value?: string) => {
      const normalized = (value || "").trim().toLowerCase();
      return normalized === "mybot" || normalized === "agent_mybot" || normalized.startsWith("agent_userbot_");
    };

    const items = [
      ...friends
        .filter((f) => {
          if (f.kind !== "bot") return false;
          if (isMyBotId(f.userId) || isMyBotId(f.id)) return false;
          const normalizedName = (f.name || "").trim().toLowerCase();
          return normalizedName !== "mybot";
        })
        .map((f) => ({
          id: `friend:${f.id}`,
          entityId: f.userId || f.id,
          name: f.name,
          avatar: f.avatar,
          entityType: "bot" as const,
          badge: "Bot" as const,
        })),
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
          badge: "NPC" as const,
        })),
    ].filter((x) => !!x.avatar);
    return items.slice(0, 9);
  }, [agents, friends, user?.displayName, user?.id]);

  useEffect(() => {
    if (!friendModal) return;
    let cancelled = false;

    const run = async () => {
      setLoadingCandidates(true);
      try {
        const list = await discoverUsers(friendQuery.trim());
        if (!cancelled) {
          setFriendCandidates(Array.isArray(list) ? list : []);
        }
      } catch (err) {
        if (!cancelled) {
          setFriendCandidates([]);
          setUiError(formatApiError(err));
        }
      } finally {
        if (!cancelled) {
          setLoadingCandidates(false);
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [friendModal, friendQuery]);

  useEffect(() => {
    if (!friendModal) return;
    let cancelled = false;
    const run = async () => {
      setLoadingRequests(true);
      try {
        const list = await listFriendRequests();
        if (!cancelled) {
          const actorUserID = (user?.id || "").trim();
          const outgoingPending: Record<string, true> = {};
          if (Array.isArray(list)) {
            for (const req of list) {
              if ((req.status || "").trim() !== "pending") continue;
              if ((req.fromUserId || "").trim() !== actorUserID) continue;
              const toUserID = (req.toUserId || "").trim();
              if (!toUserID) continue;
              outgoingPending[toUserID] = true;
            }
          }
          const incoming = Array.isArray(list)
            ? list.filter(
                (req) =>
                  (req.status || "").trim() === "pending" &&
                  (req.toUserId || "").trim() === actorUserID
              )
            : [];
          setFriendRequests(incoming);
          setPendingInviteByUserId((prev) => ({ ...prev, ...outgoingPending }));
        }
      } catch (err) {
        if (!cancelled) {
          setFriendRequests([]);
          setPendingInviteByUserId({});
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
    if (!friendModal) {
      setPendingInviteByUserId({});
    }
  }, [friendModal]);

  const handleOpenThread = useCallback(
    async (thread: ChatThread) => {
      let nextThread = thread;
      const threadID = (thread.id || "").trim();
      const lowerID = threadID.toLowerCase();
      const isMyBot =
        lowerID === "mybot" || lowerID === "agent_mybot" || lowerID.startsWith("agent_userbot_");
      const needsSessionResolve = !thread.isGroup && !isMyBot && !threadID.startsWith("thr_");

      if (needsSessionResolve) {
        const targetID = (thread.targetId || thread.id || "").trim();
        const targetTypeRaw = (thread.targetType || "").trim().toLowerCase();
        const targetType = targetTypeRaw === "user_bot" ? "user_bot" : "user";

        if (targetID) {
          try {
            const resolved = await atCreateSession({
              target_type: targetType,
              target_id: targetID,
              title: thread.name || undefined,
            });
            const mapped = mapATSessionToThread(resolved);
            if (mapped?.id) {
              nextThread = {
                ...thread,
                ...mapped,
                avatar: thread.avatar || mapped.avatar,
                isGroup: false,
              };
              addChatThread(nextThread);
            }
          } catch {
            // Keep fallback to existing thread id so UI still navigates.
          }
        }
      }

      router.push({
        pathname: "/chat/[id]",
        params: {
          id: nextThread.id,
          name: nextThread.name,
          avatar: nextThread.avatar,
          isGroup: nextThread.isGroup ? "true" : "false",
        },
      });
    },
    [addChatThread, router]
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

  const handleCreateFriend = async (candidate: DiscoverUser) => {
    const candidateID = (candidate?.id || "").trim();
    if (!candidateID || addingUserId) return;
    if (pendingInviteByUserId[candidateID]) return;
    setUiError(null);
    setAddingUserId(candidateID);

    try {
      const created = await createFriend({
        userId: candidateID,
        name: candidate.displayName,
        kind: "human",
      });
      if (created) {
        setPendingInviteByUserId((prev) => {
          if (!(candidateID in prev)) return prev;
          const next = { ...prev };
          delete next[candidateID];
          return next;
        });
        setFriendQuery("");
        const list = await discoverUsers("");
        setFriendCandidates(Array.isArray(list) ? list : []);
      } else {
        setPendingInviteByUserId((prev) => ({
          ...prev,
          [candidateID]: true,
        }));
        Alert.alert(
          tr("邀请已发送", "Invite sent"),
          tr(
            "已发送好友邀请，等待对方接受后会出现在好友列表。",
            "Friend request sent. It will appear in your friends list after they accept."
          )
        );
      }
    } catch (err) {
      const pendingCode = err instanceof ApiError ? (err.code || "").toLowerCase() : "";
      const pendingMsg = err instanceof ApiError ? (err.message || "").toLowerCase() : "";
      if (pendingCode.includes("request_pending") || pendingMsg.includes("already pending")) {
        setPendingInviteByUserId((prev) => ({
          ...prev,
          [candidateID]: true,
        }));
        Alert.alert(
          tr("邀请已发送", "Invite sent"),
          tr(
            "该好友邀请已在等待处理中，需对方接受后才会出现在好友列表。",
            "This friend request is already pending. It will appear after the other user accepts."
          )
        );
      } else {
        setUiError(formatApiError(err));
      }
    } finally {
      setAddingUserId(null);
    }
  };

  const handleAcceptFriendRequest = async (requestId: string) => {
    if (!requestId || requestActionId) return;
    setRequestActionId(requestId);
    setUiError(null);
    try {
      await acceptFriendRequest(requestId);
      await refreshAll();
      setFriendRequests((prev) => prev.filter((item) => item.id !== requestId));
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

  const handleCreateMyQR = async () => {
    if (loadingQRCreate) return;
    setUiError(null);
    setLoadingQRCreate(true);
    try {
      const result = await createFriendQR();
      setQrToken(result.token || "");
      setQrExpiresAt(result.expiresAt || "");
    } catch (err) {
      setUiError(formatApiError(err));
    } finally {
      setLoadingQRCreate(false);
    }
  };

  const handleScanByToken = async () => {
    const token = scanToken.trim();
    if (!token || loadingQRScan) return;
    setUiError(null);
    setLoadingQRScan(true);
    try {
      await scanFriendQR({ token });
      setScanToken("");
      const list = await discoverUsers(friendQuery.trim());
      setFriendCandidates(Array.isArray(list) ? list : []);
    } catch (err) {
      setUiError(formatApiError(err));
    } finally {
      setLoadingQRScan(false);
    }
  };

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
      await refreshAll();
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
  }, [refreshAll, refreshingChats]);

  return (
    <KeyframeBackground>
      <SafeAreaView edges={APP_SAFE_AREA_EDGES} style={styles.safeArea}>
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
              <Pressable style={styles.topIcon} onPress={() => setPeopleModal(true)}>
                <Ionicons name="people-outline" size={16} color="rgba(226,232,240,0.92)" />
              </Pressable>
            </View>
          </View>

          <MiniAppDock />

          <Pressable
            testID="home-mybot-entry"
            style={styles.askBar}
            onPress={() =>
              router.push({
                pathname: "/chat/[id]",
                params: { id: "mybot", name: botConfig.name, avatar: botConfig.avatar, isGroup: "false" },
              })
            }
          >
            <View style={styles.askPlus}>
              <Ionicons name="add" size={16} color="rgba(226,232,240,0.92)" />
            </View>
            <Text style={styles.askPlaceholder}>{tr("Ask anything", "Ask anything")}</Text>
            <View style={styles.askRight}>
              <Ionicons name="mic-outline" size={16} color="rgba(226,232,240,0.75)" />
              <Ionicons name="send" size={16} color="rgba(226,232,240,0.75)" />
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
              ListEmptyComponent={
                <EmptyState
                  title={tr("暂无会话", "No chats yet")}
                  hint={tr("点击右上角创建朋友或群聊", "Tap the top-right icon to add a friend or create a group")}
                />
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
                ? presence
                  .filter((item) => item.badge !== "Bot")
                  .map((item) => (
                  <Pressable
                    key={item.id}
                    style={styles.presenceItem}
                    onPress={() =>
                      openEntityConfig({
                        entityType: item.entityType,
                        entityId: item.entityId,
                        name: item.name,
                        avatar: item.avatar,
                      })
                    }
                  >
                    <Image source={{ uri: item.avatar }} style={styles.presenceAvatar} />
                    <View
                      style={[
                        styles.presenceTypeTag,
                        item.badge === "NPC" ? styles.presenceTypeTagNpc : styles.presenceTypeTagBot,
                      ]}
                    >
                      <Text style={styles.presenceTypeTagText}>{item.badge}</Text>
                    </View>
                    <View style={styles.presenceDot} />
                  </Pressable>
                  ))
                : null}
            </ScrollView>
          </View>
        </View>

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
              <Pressable style={styles.sheetItem} onPress={() => router.push("/miniapps" as never)}>
                <Ionicons name="apps-outline" size={16} color="#bfdbfe" />
                <Text style={styles.sheetText}>{tr("Mini Apps", "Mini Apps")}</Text>
              </Pressable>
              <Pressable style={styles.sheetClose} onPress={() => setPeopleModal(false)}>
                <Text style={styles.sheetCloseText}>{tr("关闭", "Close")}</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>

        <Modal visible={friendModal} transparent animationType="fade" onRequestClose={() => setFriendModal(false)}>
          <Pressable style={styles.modalOverlay} onPress={() => setFriendModal(false)}>
            <Pressable style={styles.formCard} onPress={() => null}>
              <Text style={styles.formTitle}>{tr("添加朋友", "Add Friend")}</Text>
              <TextInput
                value={friendQuery}
                onChangeText={setFriendQuery}
                placeholder={tr("搜索系统账户（名字或邮箱）", "Search account by name or email")}
                placeholderTextColor="rgba(148,163,184,0.9)"
                style={styles.input}
              />

              <View style={styles.qrActions}>
                <Pressable
                  style={styles.qrActionBtn}
                  disabled={loadingQRCreate}
                  onPress={handleCreateMyQR}
                >
                  <Ionicons name="qr-code-outline" size={14} color="#bfdbfe" />
                  <Text style={styles.qrActionText}>
                    {loadingQRCreate ? tr("生成中...", "Generating...") : tr("我的二维码", "My QR")}
                  </Text>
                </Pressable>
              </View>

              {qrToken ? (
                <View style={styles.qrTokenCard}>
                  <Text style={styles.qrTokenTitle}>{tr("扫码内容", "QR payload")}</Text>
                  <Text selectable style={styles.qrTokenValue}>
                    {qrToken}
                  </Text>
                  <Text style={styles.qrTokenHint}>
                    {tr("有效期至：", "Expires at: ")}
                    {qrExpiresAt || "-"}
                  </Text>
                </View>
              ) : null}

              <View style={styles.qrScanRow}>
                <TextInput
                  value={scanToken}
                  onChangeText={setScanToken}
                  placeholder={tr("粘贴二维码内容以添加好友", "Paste QR payload to add friend")}
                  placeholderTextColor="rgba(148,163,184,0.9)"
                  style={[styles.input, styles.qrScanInput]}
                />
                <Pressable
                  style={styles.qrScanBtn}
                  disabled={!scanToken.trim() || loadingQRScan}
                  onPress={handleScanByToken}
                >
                  <Text style={styles.qrScanBtnText}>
                    {loadingQRScan ? tr("提交中...", "Sending...") : tr("扫一扫", "Scan")}
                  </Text>
                </Pressable>
              </View>

              <View style={styles.candidateList}>
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
                ) : null}

                {loadingCandidates ? (
                  <View style={styles.candidateLoading}>
                    <ActivityIndicator color="#93c5fd" />
                  </View>
                ) : friendCandidates.length ? (
                  <ScrollView showsVerticalScrollIndicator={false}>
                    {friendCandidates.map((candidate) => {
                      const candidateID = (candidate.id || "").trim();
                      if (!candidateID) return null;
                      const isPendingInvite = Boolean(pendingInviteByUserId[candidateID]);
                      return (
                        <Pressable
                          key={candidateID}
                          style={styles.candidateItem}
                          disabled={Boolean(addingUserId) || isPendingInvite}
                          onPress={() => handleCreateFriend(candidate)}
                        >
                          <Pressable
                            onPress={(e) => {
                              e.stopPropagation?.();
                              openEntityConfig({
                                entityType: "human",
                                entityId: candidateID,
                                name: candidate.displayName,
                                avatar: candidate.avatar,
                              });
                            }}
                          >
                            <Image source={{ uri: candidate.avatar }} style={styles.candidateAvatar} />
                          </Pressable>
                          <View style={styles.candidateBody}>
                            <Text numberOfLines={1} style={styles.candidateName}>
                              {candidate.displayName}
                            </Text>
                            <Text numberOfLines={1} style={styles.candidateMeta}>
                              {isPendingInvite
                                ? tr("邀请已发送，等待对方接受", "Invite sent, waiting for acceptance")
                                : candidate.email || candidate.provider}
                            </Text>
                          </View>
                          <Text style={[styles.candidateAction, isPendingInvite && styles.candidateActionPending]}>
                            {addingUserId === candidateID
                              ? tr("添加中...", "Adding...")
                              : isPendingInvite
                                ? tr("待接受", "Pending")
                                : tr("添加", "Add")}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                ) : (
                  <Text style={styles.candidateEmpty}>
                    {tr("没有可添加的系统账户。请先让对方注册登录。", "No discoverable accounts. Ask your friend to sign up first.")}
                  </Text>
                )}
              </View>

              <View style={styles.formFooter}>
                <Pressable style={styles.formGhost} onPress={() => setFriendModal(false)}>
                  <Text style={styles.formGhostText}>{tr("取消", "Cancel")}</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        <Modal visible={groupModal} transparent animationType="fade" onRequestClose={() => setGroupModal(false)}>
          <Pressable style={styles.modalOverlay} onPress={() => setGroupModal(false)}>
            <Pressable style={styles.formCard} onPress={() => null}>
              <Text style={styles.formTitle}>{tr("新建群聊", "New Group")}</Text>
              <TextInput
                value={groupName}
                onChangeText={setGroupName}
                placeholder={tr("群名称", "Group name")}
                placeholderTextColor="rgba(148,163,184,0.9)"
                style={styles.input}
              />
              <TextInput
                value={groupAvatar}
                onChangeText={setGroupAvatar}
                placeholder={tr("头像 URL（可选）", "Avatar URL (optional)")}
                placeholderTextColor="rgba(148,163,184,0.9)"
                style={styles.input}
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
              />
              <TextInput
                value={groupCommanderUserId}
                onChangeText={setGroupCommanderUserId}
                placeholder={tr("可发号施令用户ID（可选）", "Command userId (optional)")}
                placeholderTextColor="rgba(148,163,184,0.9)"
                style={styles.input}
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
  presenceTypeTag: {
    position: "absolute",
    left: 6,
    right: 6,
    bottom: -8,
    height: 12,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  presenceTypeTagBot: {
    backgroundColor: "rgba(37,99,235,0.95)",
    borderColor: "rgba(191,219,254,0.78)",
  },
  presenceTypeTagNpc: {
    backgroundColor: "rgba(15,118,110,0.95)",
    borderColor: "rgba(167,243,208,0.78)",
  },
  presenceTypeTagText: {
    color: "#f8fafc",
    fontSize: 8,
    lineHeight: 9,
    fontWeight: "900",
    letterSpacing: 0.3,
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
  candidateList: {
    minHeight: 180,
    maxHeight: 320,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.03)",
    padding: 8,
  },
  qrActions: {
    flexDirection: "row",
    gap: 8,
  },
  qrActionBtn: {
    minHeight: 36,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(96,165,250,0.35)",
    backgroundColor: "rgba(30,64,175,0.2)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 12,
  },
  qrActionText: {
    color: "#dbeafe",
    fontSize: 12,
    fontWeight: "900",
  },
  qrTokenCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(96,165,250,0.25)",
    backgroundColor: "rgba(15,23,42,0.5)",
    padding: 10,
    gap: 6,
  },
  qrTokenTitle: {
    color: "rgba(191,219,254,0.95)",
    fontSize: 11,
    fontWeight: "900",
  },
  qrTokenValue: {
    color: "rgba(226,232,240,0.92)",
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 16,
  },
  qrTokenHint: {
    color: "rgba(148,163,184,0.9)",
    fontSize: 10,
    fontWeight: "700",
  },
  qrScanRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  qrScanInput: {
    flex: 1,
  },
  qrScanBtn: {
    minHeight: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(96,165,250,0.35)",
    backgroundColor: "rgba(30,64,175,0.22)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  qrScanBtnText: {
    color: "#dbeafe",
    fontSize: 12,
    fontWeight: "900",
  },
  candidateLoading: {
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  candidateItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginBottom: 8,
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
  candidateAction: {
    color: "#bfdbfe",
    fontSize: 12,
    fontWeight: "900",
  },
  candidateActionPending: {
    color: "rgba(148,163,184,0.95)",
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
