import { Ionicons } from "@expo/vector-icons";
import * as MediaLibrary from "expo-media-library";
import * as VideoThumbnails from "expo-video-thumbnails";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { tx } from "@/src/i18n/translate";
import { formatApiError } from "@/src/lib/api";
import { useAgentTown } from "@/src/state/agenttown-context";
import { useAuth } from "@/src/state/auth-context";
import { isE2ETestMode } from "@/src/utils/e2e";

type MediaPickerAsset = {
  id: string;
  type: "image" | "video";
  uri: string;
  thumbUri: string;
  duration?: number;
  filename?: string;
};

const DRAG_CLOSE_DISTANCE = 120;
const GRID_GAP = 8;
const GRID_MIN_SIZE = 80;
const MEDIA_PAGE_SIZE = 120;

function toDuration(totalSeconds?: number) {
  if (!totalSeconds || totalSeconds <= 0) return "00:00";
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function ChatMediaPickerScreen() {
  const isE2E = isE2ETestMode();
  const router = useRouter();
  const params = useLocalSearchParams<{ chatId?: string | string[] }>();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { user } = useAuth();
  const { language, botConfig, sendMessage } = useAgentTown();
  const tr = useCallback((zh: string, en: string) => tx(language, zh, en), [language]);

  const chatId = Array.isArray(params.chatId) ? params.chatId[0] || "" : params.chatId || "";
  const [assets, setAssets] = useState<MediaPickerAsset[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasNextPage, setHasNextPage] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const loadSeqRef = useRef(0);
  const previewListRef = useRef<FlatList<MediaPickerAsset> | null>(null);
  const dragY = useRef(new Animated.Value(0)).current;
  const e2eImageUri = useMemo(
    () => Image.resolveAssetSource(require("../../assets/images/icon.png")).uri,
    []
  );
  const e2eAltImageUri = useMemo(
    () => Image.resolveAssetSource(require("../../assets/images/splash-icon.png")).uri,
    []
  );
  const e2ePageOneAssets = useMemo<MediaPickerAsset[]>(
    () => [
      { id: "e2e-image-1", type: "image", uri: e2eImageUri, thumbUri: e2eImageUri, filename: "icon.png" },
      { id: "e2e-video-1", type: "video", uri: "e2e://video-1.mp4", thumbUri: e2eAltImageUri, duration: 61, filename: "demo.mp4" },
      { id: "e2e-image-2", type: "image", uri: e2eAltImageUri, thumbUri: e2eAltImageUri, filename: "splash-icon.png" },
    ],
    [e2eAltImageUri, e2eImageUri]
  );
  const e2ePageTwoAssets = useMemo<MediaPickerAsset[]>(
    () => [
      { id: "e2e-image-3", type: "image", uri: e2eImageUri, thumbUri: e2eImageUri, filename: "icon-copy.png" },
      { id: "e2e-video-2", type: "video", uri: "e2e://video-2.mp4", thumbUri: e2eImageUri, duration: 125, filename: "demo-2.mp4" },
    ],
    [e2eImageUri]
  );

  const panelHeight = useMemo(() => {
    const maxHeight = Math.max(360, height - insets.top - 56);
    return Math.min(maxHeight, Math.max(360, Math.round(height * 0.78)));
  }, [height, insets.top]);
  const columns = width >= 420 ? 4 : 3;
  const itemSize = useMemo(() => {
    const padding = 16 * 2;
    const totalGap = GRID_GAP * (columns - 1);
    const available = Math.max(0, width - padding - totalGap);
    return Math.max(GRID_MIN_SIZE, Math.floor(available / columns));
  }, [columns, width]);
  const selectedAssets = useMemo(
    () => assets.filter((item) => selectedIds.has(item.id)),
    [assets, selectedIds]
  );
  const previewAssets = useMemo(
    () => selectedAssets.filter((item) => item.type === "image"),
    [selectedAssets]
  );
  const sendDisabled = sending || selectedAssets.length === 0;
  const previewDisabled = previewAssets.length === 0;

  const close = useCallback(() => {
    router.back();
  }, [router]);

  const mapMediaAsset = useCallback(async (asset: MediaLibrary.Asset): Promise<MediaPickerAsset> => {
    const isVideo = asset.mediaType === MediaLibrary.MediaType.video;
    let sourceUri = asset.uri;
    let thumbUri = asset.uri;
    if (isVideo) {
      try {
        const info = await MediaLibrary.getAssetInfoAsync(asset.id);
        sourceUri = (info.localUri || info.uri || asset.uri).trim() || asset.uri;
        const thumbnail = await VideoThumbnails.getThumbnailAsync(sourceUri, { time: 0 });
        if (thumbnail.uri) thumbUri = thumbnail.uri;
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
    };
  }, []);

  const mergeUniqueAssets = useCallback((prev: MediaPickerAsset[], incoming: MediaPickerAsset[]) => {
    if (incoming.length === 0) return prev;
    const existed = new Set(prev.map((item) => item.id));
    const appended = incoming.filter((item) => !existed.has(item.id));
    if (appended.length === 0) return prev;
    return [...prev, ...appended];
  }, []);

  const loadAssets = useCallback(async () => {
    const requestSeq = loadSeqRef.current + 1;
    loadSeqRef.current = requestSeq;
    setLoading(true);
    setLoadingMore(false);
    setError(null);
    setHasNextPage(true);
    setNextCursor(undefined);
    try {
      if (isE2E) {
        if (requestSeq !== loadSeqRef.current) return;
        setAssets(e2ePageOneAssets);
        setHasNextPage(true);
        setNextCursor("e2e:page2");
        setLoading(false);
        return;
      }

      let permission = await MediaLibrary.getPermissionsAsync();
      if (!permission.granted) {
        permission = await MediaLibrary.requestPermissionsAsync();
      }
      if (!permission.granted) {
        if (requestSeq === loadSeqRef.current) {
          setAssets([]);
          setError(tr("请允许访问系统相册后再试。", "Please grant media-library access and try again."));
          setLoading(false);
        }
        return;
      }

      const page = await MediaLibrary.getAssetsAsync({
        first: MEDIA_PAGE_SIZE,
        mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
        sortBy: [MediaLibrary.SortBy.creationTime],
      });

      if (requestSeq !== loadSeqRef.current) return;
      const mapped = await Promise.all(page.assets.map((asset) => mapMediaAsset(asset)));
      if (requestSeq !== loadSeqRef.current) return;
      setAssets(mapped);
      setHasNextPage(Boolean(page.hasNextPage));
      setNextCursor(page.endCursor || undefined);
      if (mapped.length === 0) {
        setError(tr("相册暂无可选媒体。", "No media found in your library."));
      }
    } catch (err) {
      if (requestSeq !== loadSeqRef.current) return;
      setAssets([]);
      setError(formatApiError(err));
    } finally {
      if (requestSeq === loadSeqRef.current) {
        setLoading(false);
      }
    }
  }, [e2ePageOneAssets, isE2E, mapMediaAsset, tr]);

  useEffect(() => {
    if (!chatId) {
      setError(tr("缺少会话参数，无法发送。", "Missing chat id, cannot send media."));
      setLoading(false);
      return;
    }
    void loadAssets();
  }, [chatId, loadAssets, tr]);

  const loadMoreAssets = useCallback(async () => {
    if (loading || loadingMore || !hasNextPage || !nextCursor) return;
    const requestSeq = loadSeqRef.current;
    setLoadingMore(true);
    try {
      if (isE2E) {
        if (requestSeq !== loadSeqRef.current) return;
        if (nextCursor === "e2e:page2") {
          setAssets((prev) => mergeUniqueAssets(prev, e2ePageTwoAssets));
        }
        setHasNextPage(false);
        setNextCursor(undefined);
        return;
      }

      const page = await MediaLibrary.getAssetsAsync({
        first: MEDIA_PAGE_SIZE,
        after: nextCursor,
        mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
        sortBy: [MediaLibrary.SortBy.creationTime],
      });
      if (requestSeq !== loadSeqRef.current) return;
      const mapped = await Promise.all(page.assets.map((asset) => mapMediaAsset(asset)));
      if (requestSeq !== loadSeqRef.current) return;
      setAssets((prev) => mergeUniqueAssets(prev, mapped));
      setHasNextPage(Boolean(page.hasNextPage));
      setNextCursor(page.endCursor || undefined);
    } catch {
      if (requestSeq !== loadSeqRef.current) return;
      Alert.alert(
        tr("加载失败", "Load failed"),
        tr("无法加载更多媒体，请稍后重试。", "Unable to load more media. Please try again.")
      );
    } finally {
      if (requestSeq === loadSeqRef.current) {
        setLoadingMore(false);
      }
    }
  }, [e2ePageTwoAssets, hasNextPage, isE2E, loading, loadingMore, mapMediaAsset, mergeUniqueAssets, nextCursor, tr]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          Math.abs(gesture.dy) > Math.abs(gesture.dx) && gesture.dy > 4,
        onPanResponderMove: (_event, gesture) => {
          dragY.setValue(Math.max(0, gesture.dy));
        },
        onPanResponderRelease: (_event, gesture) => {
          const shouldClose = gesture.dy > DRAG_CLOSE_DISTANCE || gesture.vy > 1.2;
          if (shouldClose) {
            close();
            return;
          }
          Animated.spring(dragY, {
            toValue: 0,
            useNativeDriver: true,
            stiffness: 260,
            damping: 24,
            mass: 0.8,
          }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(dragY, {
            toValue: 0,
            useNativeDriver: true,
            stiffness: 260,
            damping: 24,
            mass: 0.8,
          }).start();
        },
      }),
    [close, dragY]
  );

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const openPreview = useCallback(() => {
    if (previewAssets.length === 0) return;
    setPreviewIndex(0);
    setPreviewVisible(true);
  }, [previewAssets.length]);

  const closePreview = useCallback(() => {
    setPreviewVisible(false);
  }, []);

  useEffect(() => {
    if (!previewVisible) return;
    if (previewAssets.length === 0) {
      setPreviewVisible(false);
      setPreviewIndex(0);
      return;
    }
    const maxIndex = previewAssets.length - 1;
    if (previewIndex > maxIndex) {
      setPreviewIndex(maxIndex);
    }
  }, [previewAssets.length, previewIndex, previewVisible]);

  const handleSend = useCallback(async () => {
    if (!chatId || selectedAssets.length === 0 || sending) return;
    setSending(true);
    let failedCount = 0;
    for (const asset of selectedAssets) {
      const content = asset.type === "video" ? tr("[视频]", "[Video]") : tr("[图片]", "[Image]");
      const result = await sendMessage(chatId, {
        content,
        type: "image",
        imageUri: asset.uri,
        imageName: asset.filename || asset.id,
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
      }
    }
    setSending(false);
    if (failedCount > 0) {
      Alert.alert(
        tr("发送失败", "Send failed"),
        tr("部分媒体发送失败，请重试。", "Some media failed to send. Please retry.")
      );
      return;
    }
    close();
  }, [
    botConfig.avatar,
    botConfig.systemInstruction,
    chatId,
    close,
    selectedAssets,
    sendMessage,
    sending,
    tr,
    user?.avatar,
    user?.displayName,
    user?.id,
  ]);

  return (
    <View testID="chat-media-picker-root" style={styles.root}>
      <Pressable testID="chat-media-picker-backdrop" style={styles.backdrop} onPress={close} />
      <Animated.View
        testID="chat-media-picker-panel"
        style={[
          styles.panel,
          {
            height: panelHeight,
            paddingBottom: Math.max(insets.bottom, 12),
            transform: [{ translateY: dragY }],
          },
        ]}
      >
        <View style={styles.handle} {...panResponder.panHandlers} />
        <View style={styles.header}>
          <Text testID="chat-media-picker-title" style={styles.title}>
            {tr("选择媒体", "Select Media")}
          </Text>
          <Pressable testID="chat-media-picker-close" style={styles.closeBtn} onPress={close}>
            <Ionicons name="close" size={16} color="rgba(226,232,240,0.92)" />
          </Pressable>
        </View>

        <View style={styles.body}>
          {loading ? (
            <View style={styles.state}>
              <ActivityIndicator size="small" color="rgba(191,219,254,0.95)" />
              <Text testID="chat-media-picker-loading-text" style={styles.hint}>
                {tr("正在读取系统相册...", "Loading media library...")}
              </Text>
            </View>
          ) : error ? (
            <View style={styles.state}>
              <Text testID="chat-media-picker-error-text" style={styles.error}>
                {error}
              </Text>
              <Pressable testID="chat-media-picker-retry" style={styles.retryBtn} onPress={() => void loadAssets()}>
                <Text style={styles.retryText}>{tr("重试", "Retry")}</Text>
              </Pressable>
            </View>
          ) : (
            <FlatList
              testID="chat-media-picker-grid"
              key={`media-grid-${columns}`}
              data={assets}
              numColumns={columns}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              onEndReachedThreshold={0.35}
              onEndReached={() => {
                void loadMoreAssets();
              }}
              contentContainerStyle={styles.gridContent}
              columnWrapperStyle={columns > 1 ? styles.gridRow : undefined}
              ListFooterComponent={
                loadingMore ? (
                  <View style={styles.listFooter}>
                    <ActivityIndicator size="small" color="rgba(191,219,254,0.95)" />
                    <Text style={styles.footerHint}>{tr("正在加载更多...", "Loading more...")}</Text>
                  </View>
                ) : !hasNextPage && assets.length > 0 ? (
                  <View style={styles.listFooter}>
                    <Text style={styles.footerHint}>{tr("已加载全部媒体", "All media loaded")}</Text>
                  </View>
                ) : null
              }
              renderItem={({ item, index }) => {
                const selected = selectedIds.has(item.id);
                return (
                  <Pressable
                    testID={`chat-media-asset-${index}`}
                    style={({ pressed }) => [
                      styles.item,
                      { width: itemSize, height: itemSize },
                      selected && styles.itemSelected,
                      pressed && styles.itemPressed,
                    ]}
                    onPress={() => toggle(item.id)}
                  >
                    <Image source={{ uri: item.thumbUri }} style={styles.thumb} />
                    <View style={[styles.check, selected && styles.checkSelected]}>
                      {selected ? <Ionicons name="checkmark" size={12} color="#f8fafc" /> : null}
                    </View>
                    {item.type === "video" ? (
                      <View testID={`chat-media-video-badge-${index}`} style={styles.videoBadge}>
                        <Ionicons name="videocam" size={10} color="rgba(241,245,249,0.96)" />
                        <Text style={styles.videoDuration}>{toDuration(item.duration)}</Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              }}
            />
          )}
        </View>

        <View style={styles.footer}>
          <Text testID="chat-media-picker-selection" style={styles.selection}>
            {selectedAssets.length > 0
              ? tr(`已选 ${selectedAssets.length} 项`, `${selectedAssets.length} selected`)
              : tr("请选择要发送的媒体", "Select media to send")}
          </Text>
          <View style={styles.footerActions}>
            <Pressable
              testID="chat-media-picker-preview"
              style={[styles.previewBtn, previewDisabled && styles.previewBtnDisabled]}
              disabled={previewDisabled}
              onPress={openPreview}
            >
              <Text style={styles.previewText}>{tr("预览", "Preview")}</Text>
            </Pressable>
            <Pressable
              testID="chat-media-picker-send"
              style={[styles.sendBtn, sendDisabled && styles.sendBtnDisabled]}
              disabled={sendDisabled}
              onPress={() => {
                void handleSend();
              }}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#0b1220" />
              ) : (
                <Text style={styles.sendText}>{tr("发送", "Send")}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </Animated.View>

      {previewVisible ? (
        <View testID="chat-media-picker-preview-overlay" style={styles.previewOverlay}>
          <FlatList
            testID="chat-media-picker-preview-list"
            ref={previewListRef}
            data={previewAssets}
            keyExtractor={(item) => item.id}
            horizontal
            pagingEnabled
            initialScrollIndex={previewIndex}
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(event) => {
              const offsetX = event.nativeEvent.contentOffset.x;
              const index = Math.round(offsetX / Math.max(width, 1));
              setPreviewIndex(Math.max(0, Math.min(index, previewAssets.length - 1)));
            }}
            renderItem={({ item }) => (
              <View style={[styles.previewPage, { width }]}>
                <Image
                  source={{ uri: item.type === "video" ? item.thumbUri || item.uri : item.uri }}
                  style={styles.previewMedia}
                  resizeMode="contain"
                />
                {item.type === "video" ? (
                  <View style={styles.previewVideoBadge}>
                    <Ionicons name="videocam" size={12} color="rgba(241,245,249,0.96)" />
                    <Text style={styles.previewVideoDuration}>{toDuration(item.duration)}</Text>
                  </View>
                ) : null}
              </View>
            )}
          />
          <View style={[styles.previewHeader, { paddingTop: Math.max(insets.top, 0) + 10 }]}>
            <Pressable testID="chat-media-picker-preview-close" style={styles.closeBtn} onPress={closePreview}>
              <Ionicons name="close" size={16} color="rgba(226,232,240,0.92)" />
            </Pressable>
          </View>
          <View style={[styles.previewFooter, { paddingBottom: Math.max(insets.bottom, 10) + 10 }]}>
            <Text testID="chat-media-picker-preview-counter" style={styles.previewCounter}>
              {previewAssets.length > 0 ? `${previewIndex + 1} / ${previewAssets.length}` : ""}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.56)",
  },
  panel: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderBottomWidth: 0,
    backgroundColor: "rgba(15,23,42,0.98)",
    overflow: "hidden",
  },
  handle: {
    width: 38,
    height: 5,
    borderRadius: 999,
    backgroundColor: "rgba(148,163,184,0.72)",
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 8,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    color: "rgba(241,245,249,0.98)",
    fontSize: 15,
    fontWeight: "900",
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    flex: 1,
  },
  state: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 16,
  },
  hint: {
    color: "rgba(148,163,184,0.94)",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },
  error: {
    color: "rgba(248,113,113,0.98)",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },
  retryBtn: {
    minHeight: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(147,197,253,0.62)",
    backgroundColor: "rgba(30,64,175,0.28)",
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  retryText: {
    color: "rgba(219,234,254,0.98)",
    fontSize: 12,
    fontWeight: "800",
  },
  gridContent: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 16,
  },
  gridRow: {
    gap: GRID_GAP,
    marginBottom: GRID_GAP,
  },
  listFooter: {
    paddingTop: 10,
    paddingBottom: 8,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  footerHint: {
    color: "rgba(148,163,184,0.94)",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
  item: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
    overflow: "hidden",
    position: "relative",
  },
  itemSelected: {
    borderColor: "rgba(96,165,250,0.95)",
  },
  itemPressed: {
    opacity: 0.9,
  },
  thumb: {
    width: "100%",
    height: "100%",
  },
  check: {
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
  checkSelected: {
    borderColor: "rgba(59,130,246,1)",
    backgroundColor: "rgba(37,99,235,0.96)",
  },
  videoBadge: {
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
  videoDuration: {
    color: "rgba(241,245,249,0.96)",
    fontSize: 10,
    fontWeight: "800",
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.10)",
    paddingTop: 10,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  selection: {
    flex: 1,
    color: "rgba(148,163,184,0.94)",
    fontSize: 12,
    fontWeight: "700",
  },
  footerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  previewBtn: {
    minWidth: 84,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(147,197,253,0.62)",
    backgroundColor: "rgba(30,64,175,0.28)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  previewBtnDisabled: {
    opacity: 0.45,
  },
  previewText: {
    color: "rgba(219,234,254,0.98)",
    fontSize: 13,
    fontWeight: "900",
  },
  sendBtn: {
    minWidth: 84,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  sendBtnDisabled: {
    opacity: 0.45,
  },
  sendText: {
    color: "#0b1220",
    fontSize: 13,
    fontWeight: "900",
  },
  previewOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(2,6,23,0.96)",
    zIndex: 20,
  },
  previewPage: {
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  previewMedia: {
    width: "100%",
    height: "100%",
  },
  previewVideoBadge: {
    position: "absolute",
    right: 18,
    bottom: 72,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "rgba(2,6,23,0.78)",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  previewVideoDuration: {
    color: "rgba(241,245,249,0.96)",
    fontSize: 11,
    fontWeight: "800",
  },
  previewHeader: {
    position: "absolute",
    top: 0,
    right: 16,
  },
  previewFooter: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  previewCounter: {
    color: "rgba(226,232,240,0.92)",
    fontSize: 12,
    fontWeight: "800",
  },
});
