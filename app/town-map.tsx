import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Modal,
  PixelRatio,
  Platform,
  Pressable,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { APP_SAFE_AREA_EDGES } from "@/src/constants/safe-area";
import {
  CHUNK_SIZE,
  chunkForWorldPoint,
  coastAreaPathForSvg,
  coastPathForSvg,
  getChunksInRange,
  getVisibleChunkRange,
  HOME_POSITION,
  LotData,
  MOUNTAIN_PEAKS,
  mapMyHouseTypeToVisual,
  RIVER_WIDTH,
  ROAD_ROUTES,
  riverPathForSvg,
  routePoint,
  WORLD_CHUNKS_X,
  WORLD_CHUNKS_Y,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from "@/src/features/townmap/world";
import { TownHouseNode } from "@/src/components/TownHouseNode";
import { tx } from "@/src/i18n/translate";
import { generateGeminiText } from "@/src/lib/gemini";
import { getThemeTokens } from "@/src/theme/ui-theme";
import { useAgentTown } from "@/src/state/agenttown-context";
import { AppLanguage } from "@/src/types";

interface TownMapMessage {
  role: "user" | "model" | "system";
  text: string;
  senderName?: string;
}

interface MovingCar {
  id: string;
  routeId: string;
  color: string;
  speed: number;
  delay: number;
  direction: 1 | -1;
}

interface WorldGroupMessage {
  id: string;
  role: "system" | "agent";
  senderName?: string;
  senderAvatar?: string;
  senderRole?: string;
  text: string;
}

const GROUP_IDENTITIES = [
  "上班族",
  "学生",
  "宝妈",
  "旅行者",
  "骑行通勤者",
  "创业者",
  "产品经理",
  "自由职业者",
  "餐馆老板",
  "新手投资人",
];

const GROUP_PAIN_POINTS = [
  "信息太多看不过来",
  "任务排期总是拖延",
  "每周选餐太耗时间",
  "会议结论常常遗忘",
  "优惠信息太分散",
  "行程变更来不及同步",
  "学习计划无法坚持",
  "客户跟进容易漏掉",
  "家庭采购预算超支",
  "运动数据看不懂",
];

const GROUP_APP_IDEAS = [
  "早报摘要",
  "任务拆解",
  "餐饮预定",
  "会议纪要",
  "降价提醒",
  "日程协调",
  "学习打卡",
  "客户随访",
  "预算管家",
  "健康看板",
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function buildWorldIdea(seed: number, language: AppLanguage) {
  if (language !== "zh") {
    const identities = [
      "Office worker",
      "Student",
      "Parent",
      "Traveler",
      "Bike commuter",
      "Founder",
      "Product manager",
      "Freelancer",
      "Restaurant owner",
      "New investor",
    ];
    const pains = [
      "too much information",
      "constant schedule slips",
      "meal planning takes too long",
      "meeting outcomes get lost",
      "deals are scattered",
      "trip changes are hard to sync",
      "study plans are hard to sustain",
      "customer follow-up gets missed",
      "family budget goes over limit",
      "fitness data is hard to read",
    ];
    const apps = [
      "Morning Brief",
      "Task Planner",
      "Dining Booking",
      "Meeting Notes",
      "Price Alert",
      "Calendar Sync",
      "Study Check-in",
      "Follow-up Bot",
      "Budget Assistant",
      "Health Dashboard",
    ];
    const identity = identities[seed % identities.length];
    const pain = pains[(seed * 3) % pains.length];
    const app = apps[(seed * 5) % apps.length];
    return `[${identity}: ${pain}] Generate a ${app} mini app with one sentence.`;
  }

  const identity = GROUP_IDENTITIES[seed % GROUP_IDENTITIES.length];
  const pain = GROUP_PAIN_POINTS[(seed * 3) % GROUP_PAIN_POINTS.length];
  const app = GROUP_APP_IDEAS[(seed * 5) % GROUP_APP_IDEAS.length];
  return `【${identity}：${pain}】生成一个${app} Mini App，一句话自动完成。`;
}

function buildInitialWorldGroupMessages(
  language: AppLanguage,
  botName: string,
  botAvatar: string
): WorldGroupMessage[] {
  return [
    {
      id: "world_group_system",
      role: "system",
      text:
        language === "zh"
          ? "用户视角需求洞察模式已激活。"
          : "User-perspective ideation mode is active.",
    },
    {
      id: "world_group_lead",
      role: "agent",
      senderName: `${botName} (Team Lead)`,
      senderAvatar: botAvatar,
      senderRole: "Product Manager",
      text:
        language === "zh"
          ? "大家请用普通用户视角，提出一个“一句话生成 Mini App”就能解决的真实问题。"
          : "Please use a normal user perspective and propose one real problem solvable by a one-sentence generated mini app.",
    },
  ];
}

export default function TownMapScreen() {
  const router = useRouter();
  const { myHouseType, botConfig, language, uiTheme } = useAgentTown();
  const tr = (zh: string, en: string) => tx(language, zh, en);
  const theme = getThemeTokens(uiTheme);
  const isNeo = uiTheme === "neo";
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isAndroid = Platform.OS === "android";

  const [selectedLot, setSelectedLot] = useState<LotData | null>(null);

  const maxScale = 1.35;
  const minScale = 0.12;
  const [scale, setScale] = useState(0.48);
  const [isPinching, setIsPinching] = useState(false);

  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<TownMapMessage[]>([]);
  const [chatMode, setChatMode] = useState<"direct" | "group">("direct");
  const [inputValue, setInputValue] = useState("");
  const [clockMs, setClockMs] = useState(() => Date.now());
  const [showWorldScale, setShowWorldScale] = useState(false);
  const [groupPanelVisible, setGroupPanelVisible] = useState(true);
  const [groupPanelMode, setGroupPanelMode] = useState<"expanded" | "minimized">("expanded");
  const [isWorldGroupThinking, setIsWorldGroupThinking] = useState(false);
  const [worldGroupMessages, setWorldGroupMessages] = useState<WorldGroupMessage[]>(() =>
    buildInitialWorldGroupMessages(language, botConfig.name, botConfig.avatar)
  );

  const [scrollX, setScrollX] = useState(0);
  const [scrollY, setScrollY] = useState(0);

  const scrollXRef = useRef(0);
  const scrollYRef = useRef(0);
  const worldGroupCursorRef = useRef(0);
  const scaleRef = useRef(0.48);
  const pinchStateRef = useRef({
    active: false,
    startDistance: 0,
    startScale: 0,
    focusX: 0,
    focusY: 0,
  });

  const horizontalRef = useRef<ScrollView | null>(null);
  const verticalRef = useRef<ScrollView | null>(null);
  const chatScrollRef = useRef<ScrollView | null>(null);
  const worldGroupScrollRef = useRef<ScrollView | null>(null);
  const centeredRef = useRef(false);

  const mapWidthScaled = WORLD_WIDTH * scale;
  const mapHeightScaled = WORLD_HEIGHT * scale;

  const visibleRange = useMemo(
    () =>
      getVisibleChunkRange({
        scrollX,
        scrollY,
        viewportWidth: windowWidth,
        viewportHeight: windowHeight,
        scale,
        overscan: 1,
      }),
    [scrollX, scrollY, scale, windowWidth, windowHeight]
  );

  const visibleChunks = useMemo(
    () => getChunksInRange(visibleRange),
    [visibleRange]
  );

  const visibleLots = useMemo(
    () => visibleChunks.flatMap((chunk) => chunk.lots),
    [visibleChunks]
  );

  const visibleTrees = useMemo(
    () => visibleChunks.flatMap((chunk) => chunk.trees),
    [visibleChunks]
  );

  const worldGroupCandidates = useMemo(
    () => visibleLots.slice(0, 90),
    [visibleLots]
  );

  const groupMemberNames = useMemo(() => {
    if (!selectedLot) return [];
    const nearbyMembers = visibleLots
      .filter((lot) => lot.id !== selectedLot.id)
      .slice(0, 3)
      .map((lot) => lot.npc.name);
    return [selectedLot.npc.name, ...nearbyMembers];
  }, [selectedLot, visibleLots]);

  const routeLookup = useMemo(
    () => new Map(ROAD_ROUTES.map((route) => [route.id, route])),
    []
  );

  const cars = useMemo<MovingCar[]>(() => {
    const colors = isNeo
      ? ["#ef4444", "#7dd3fc", "#c4b5fd", "#22c55e", "#facc15", "#f472b6"]
      : [
          "#ef4444",
          "#3b82f6",
          "#facc15",
          "#1f2937",
          "#ffffff",
          "#f97316",
          "#14b8a6",
        ];

    const result: MovingCar[] = [];

    ROAD_ROUTES.forEach((route, routeIndex) => {
      const count = route.type === "line" ? 7 : 9;
      for (let index = 0; index < count; index += 1) {
        const serial = routeIndex * 97 + index * 31;
        result.push({
          id: `${route.id}_${index}`,
          routeId: route.id,
          color: colors[serial % colors.length],
          speed: 0.008 + (serial % 7) * 0.002,
          delay: (serial % 100) / 100,
          direction: index % 2 === 0 ? 1 : -1,
        });
      }
    });

    return result;
  }, [isNeo]);

  const worldPalette = useMemo(
    () =>
      isNeo
        ? {
            land: "#070a14",
            coast: "#0f2b4f",
            coastStroke: "#48a9ff",
            mountainOuter: "rgba(56,189,248,0.16)",
            mountainInner: "rgba(14,165,233,0.14)",
            riverGlow: "#7dd3fc",
            riverCore: "#38bdf8",
            road: "rgba(88,98,125,0.9)",
            roadStripe: "rgba(255,255,255,0.7)",
            lotStroke: "rgba(56,189,248,0.35)",
            grid: "rgba(148,163,184,0.12)",
            lakeShadow: "rgba(13,18,35,0.24)",
            miniMap: "#091226",
            miniChunk: "rgba(255,255,255,0.14)",
          }
        : {
            land: "#7ec850",
            coast: "#38bdf8",
            coastStroke: "#bae6fd",
            mountainOuter: "rgba(100,116,139,0.22)",
            mountainInner: "rgba(71,85,105,0.18)",
            riverGlow: "#a5f3fc",
            riverCore: "#38bdf8",
            road: "#555",
            roadStripe: "#ffffff",
            lotStroke: "rgba(255,255,255,0.5)",
            grid: "rgba(255,255,255,0.08)",
            lakeShadow: "rgba(30,58,138,0.16)",
            miniMap: "#89ce5f",
            miniChunk: "rgba(255,255,255,0.26)",
          },
    [isNeo]
  );

  const centerOnHome = useCallback(
    (animated: boolean) => {
      const maxX = Math.max(0, mapWidthScaled - windowWidth);
      const maxY = Math.max(0, mapHeightScaled - windowHeight);
      const x = clamp(HOME_POSITION.x * scale - windowWidth / 2, 0, maxX);
      const y = clamp(HOME_POSITION.y * scale - windowHeight / 2, 0, maxY);

      horizontalRef.current?.scrollTo({ x, animated });
      verticalRef.current?.scrollTo({ y, animated });
      scrollXRef.current = x;
      scrollYRef.current = y;
      setScrollX(x);
      setScrollY(y);
    },
    [mapHeightScaled, mapWidthScaled, scale, windowHeight, windowWidth]
  );

  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  useEffect(() => {
    const timer = setInterval(() => setClockMs(Date.now()), 33);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (centeredRef.current) return;

    const timer = setTimeout(() => {
      centerOnHome(false);
      centeredRef.current = true;
    }, 40);

    return () => clearTimeout(timer);
  }, [centerOnHome]);

  useEffect(() => {
    if (!selectedLot) return;
    const stillVisible = visibleLots.some((lot) => lot.id === selectedLot.id);
    if (!stillVisible) {
      setSelectedLot(null);
    }
  }, [selectedLot, visibleLots]);

  useEffect(() => {
    if (groupPanelMode !== "expanded") return;
    const timer = setTimeout(() => {
      worldGroupScrollRef.current?.scrollToEnd({ animated: true });
    }, 40);
    return () => clearTimeout(timer);
  }, [groupPanelMode, isWorldGroupThinking, worldGroupMessages.length]);

  useEffect(() => {
    if (!groupPanelVisible) return;
    if (worldGroupMessages.length > 0) return;
    setWorldGroupMessages(
      buildInitialWorldGroupMessages(language, botConfig.name, botConfig.avatar)
    );
  }, [botConfig.avatar, botConfig.name, groupPanelVisible, language, worldGroupMessages.length]);

  useEffect(() => {
    if (!groupPanelVisible || worldGroupCandidates.length === 0) return;

    let messageTimer: ReturnType<typeof setTimeout> | null = null;
    const interval = setInterval(() => {
      setIsWorldGroupThinking(true);

      messageTimer = setTimeout(() => {
        const idx = worldGroupCursorRef.current;
        const lot = worldGroupCandidates[idx % worldGroupCandidates.length];
        if (!lot) {
          setIsWorldGroupThinking(false);
          return;
        }

        setWorldGroupMessages((prev) => [
          ...prev.slice(-24),
          {
            id: `world_group_${Date.now()}_${idx}`,
            role: "agent",
            senderName: lot.npc.name,
            senderAvatar: lot.npc.avatar,
            senderRole: lot.npc.role,
            text: buildWorldIdea(idx + 1, language),
          },
        ]);
        worldGroupCursorRef.current += 1;
        setIsWorldGroupThinking(false);
      }, 680);
    }, 6500);

    return () => {
      clearInterval(interval);
      if (messageTimer) {
        clearTimeout(messageTimer);
      }
    };
  }, [groupPanelVisible, language, worldGroupCandidates]);

  const applyZoomAtPoint = useCallback(
    (nextScale: number, focusX: number, focusY: number) => {
      const clampedScale = clamp(nextScale, minScale, maxScale);
      const currentScale = scaleRef.current;
      if (Math.abs(clampedScale - currentScale) < 0.001) return;

      const worldCenterX = (scrollXRef.current + focusX) / currentScale;
      const worldCenterY = (scrollYRef.current + focusY) / currentScale;

      const nextMaxX = Math.max(0, WORLD_WIDTH * clampedScale - windowWidth);
      const nextMaxY = Math.max(0, WORLD_HEIGHT * clampedScale - windowHeight);

      const nextX = clamp(worldCenterX * clampedScale - focusX, 0, nextMaxX);
      const nextY = clamp(worldCenterY * clampedScale - focusY, 0, nextMaxY);

      setScale(clampedScale);
      requestAnimationFrame(() => {
        horizontalRef.current?.scrollTo({ x: nextX, animated: false });
        verticalRef.current?.scrollTo({ y: nextY, animated: false });
        scrollXRef.current = nextX;
        scrollYRef.current = nextY;
        setScrollX(nextX);
        setScrollY(nextY);
      });
    },
    [maxScale, minScale, windowHeight, windowWidth]
  );

  const applyZoom = useCallback(
    (delta: number, focusX = windowWidth / 2, focusY = windowHeight / 2) => {
      applyZoomAtPoint(scaleRef.current + delta, focusX, focusY);
    },
    [applyZoomAtPoint, windowHeight, windowWidth]
  );

  const getPinchState = (event: {
    nativeEvent?: {
      touches?: {
        pageX?: number;
        pageY?: number;
      }[];
    };
  }) => {
    const touches = event.nativeEvent?.touches ?? [];
    const first = touches[0];
    const second = touches[1];
    if (
      !first ||
      !second ||
      first.pageX == null ||
      first.pageY == null ||
      second.pageX == null ||
      second.pageY == null
    ) {
      return null;
    }

    const dx = first.pageX - second.pageX;
    const dy = first.pageY - second.pageY;
    return {
      distance: Math.sqrt(dx * dx + dy * dy),
      focusX: (first.pageX + second.pageX) / 2,
      focusY: (first.pageY + second.pageY) / 2,
    };
  };

  const mapPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, gestureState) =>
          gestureState.numberActiveTouches >= 2,
        onPanResponderGrant: (event) => {
          const pinch = getPinchState(event);
          if (!pinch) return;

          pinchStateRef.current = {
            active: true,
            startDistance: pinch.distance,
            startScale: scaleRef.current,
            focusX: pinch.focusX,
            focusY: pinch.focusY,
          };
          setIsPinching(true);
        },
        onPanResponderMove: (event) => {
          if (!pinchStateRef.current.active) return;

          const pinch = getPinchState(event);
          if (!pinch) {
            pinchStateRef.current.active = false;
            setIsPinching(false);
            return;
          }

          const nextScale =
            pinchStateRef.current.startScale * (pinch.distance / pinchStateRef.current.startDistance);
          applyZoomAtPoint(nextScale, pinch.focusX, pinch.focusY);
        },
        onPanResponderRelease: () => {
          if (!pinchStateRef.current.active) return;
          pinchStateRef.current.active = false;
          setIsPinching(false);
        },
        onPanResponderTerminate: () => {
          if (!pinchStateRef.current.active) return;
          pinchStateRef.current.active = false;
          setIsPinching(false);
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [applyZoomAtPoint]
  );

  useEffect(() => {
    setScale((prev) => clamp(prev, minScale, maxScale));
  }, [maxScale, minScale]);

  const openChat = () => {
    if (!selectedLot) return;
    setChatMode("direct");
    setChatMessages([
      {
        role: "model",
        senderName: selectedLot.npc.name,
        text: selectedLot.npc.greeting,
      },
    ]);
    setInputValue("");
    setIsChatOpen(true);
  };

  const openGroupChat = () => {
    if (!selectedLot) return;
    setChatMode("group");
    const members = groupMemberNames.length > 0 ? groupMemberNames : [selectedLot.npc.name];
    setChatMessages([
      {
        role: "system",
        text:
          language === "zh"
            ? `${selectedLot.label} 群聊 · ${members.length} 人`
            : `${selectedLot.label} Group · ${members.length} members`,
      },
      {
        role: "model",
        senderName: members[0],
        text:
          language === "zh"
            ? `大家好，欢迎来到 ${selectedLot.label} 群聊。`
            : `Hi everyone, welcome to ${selectedLot.label} group chat.`,
      },
    ]);
    setInputValue("");
    setIsChatOpen(true);
  };

  const parseGroupReply = (reply: string | null, members: string[]) => {
    const fallbackName = members[Math.floor(Math.random() * Math.max(1, members.length))] ?? "Member";
    if (!reply) {
      return {
        senderName: fallbackName,
        text: tr("收到，我来跟进这个话题。", "Got it, I can follow up this topic."),
      };
    }

    const normalized = reply.trim();
    const separatorIndex = Math.max(normalized.indexOf(":"), normalized.indexOf("："));
    if (separatorIndex > 0) {
      const possibleName = normalized.slice(0, separatorIndex).trim();
      const text = normalized.slice(separatorIndex + 1).trim();
      if (possibleName && text) {
        return {
          senderName: possibleName,
          text,
        };
      }
    }

    return {
      senderName: fallbackName,
      text: normalized,
    };
  };

  const sendChat = async () => {
    const text = inputValue.trim();
    if (!text || !selectedLot) return;

    setInputValue("");
    const nextHistory: TownMapMessage[] = [
      ...chatMessages,
      { role: "user", senderName: "You", text },
    ];
    setChatMessages(nextHistory);

    if (chatMode === "group") {
      const members = groupMemberNames.length > 0 ? groupMemberNames : [selectedLot.npc.name];
      const reply = await generateGeminiText({
        prompt: `User says: ${text}\nReply in one line as one group member. Format must be "Name: message".`,
        systemInstruction: `You are one member inside a UsChat group chat. Members: ${members.join(", ")}. Keep replies short, practical and natural.`,
        history: nextHistory
          .filter((msg) => msg.role !== "system")
          .slice(-10)
          .map((msg) => ({
            role: msg.role === "user" ? ("user" as const) : ("model" as const),
            text: `${msg.senderName ? `${msg.senderName}: ` : ""}${msg.text}`,
          })),
      });

      const parsed = parseGroupReply(reply, members);
      setChatMessages((prev) => [
        ...prev,
        {
          role: "model",
          senderName: parsed.senderName,
          text: parsed.text,
        },
      ]);
    } else {
      const reply = await generateGeminiText({
        prompt: text,
        systemInstruction: `You are ${selectedLot.npc.name}, a ${selectedLot.npc.role} in UsChat. Keep replies short and practical.`,
        history: nextHistory
          .filter((msg) => msg.role !== "system")
          .slice(-10)
          .map((msg) => ({
            role: msg.role === "user" ? ("user" as const) : ("model" as const),
            text: msg.text,
          })),
      });

      setChatMessages((prev) => [
        ...prev,
        {
          role: "model",
          senderName: selectedLot.npc.name,
          text:
            reply ??
            (language === "zh"
              ? `${selectedLot.npc.name}：收到，我可以协助处理。`
              : `${selectedLot.npc.name}: Got it. I can help with that.`),
        },
      ]);
    }

    setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 40);
  };

  const lotScale = Math.max(0.5, Math.min(1.05, scale * 0.95));

  const centerWorldX = (scrollX + windowWidth / 2) / scale;
  const centerWorldY = (scrollY + windowHeight / 2) / scale;
  const centerChunk = chunkForWorldPoint(centerWorldX, centerWorldY);
  const zoomControlsBottom = Math.max(140, insets.bottom + 96);

  const miniSize = 132;
  const miniViewport = {
    left: clamp((scrollX / scale / WORLD_WIDTH) * miniSize, 0, miniSize),
    top: clamp((scrollY / scale / WORLD_HEIGHT) * miniSize, 0, miniSize),
    width: clamp((windowWidth / scale / WORLD_WIDTH) * miniSize, 8, miniSize),
    height: clamp((windowHeight / scale / WORLD_HEIGHT) * miniSize, 8, miniSize),
  };

  const svgDownsample = isAndroid ? Math.max(1, PixelRatio.get()) : 1;
  const svgWidth = mapWidthScaled / svgDownsample;
  const svgHeight = mapHeightScaled / svgDownsample;
  const svgTranslateX = (svgWidth * (svgDownsample - 1)) / 2;
  const svgTranslateY = (svgHeight * (svgDownsample - 1)) / 2;

  return (
    <SafeAreaView edges={APP_SAFE_AREA_EDGES} style={[styles.safeArea, { backgroundColor: theme.safeArea }]}>
      <View style={[styles.mapHeader, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <View style={styles.headerLeft}>
          <Pressable
            style={[
              styles.headerCircle,
              {
                backgroundColor: theme.iconCircleBg,
                borderColor: isNeo ? "rgba(255,255,255,0.25)" : styles.headerCircle.borderColor,
              },
            ]}
            onPress={() => router.back()}
          >
            <Ionicons name="chevron-back" size={24} color={theme.iconCircleText} />
          </Pressable>
          <View
            style={[
              styles.mapPill,
              {
                backgroundColor: theme.topPillBg,
                borderColor: theme.topPillBorder,
              },
            ]}
          >
            <Ionicons name="earth" size={14} color={isNeo ? "#8ae28b" : "#16a34a"} />
            <Text style={[styles.mapPillText, { color: theme.topPillText }]}>
              {tr("智界", "Agent World")}
            </Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          <View
            style={[
              styles.headerDarkCircle,
              {
                backgroundColor: theme.iconCircleBg,
                borderColor: isNeo ? "rgba(255,255,255,0.25)" : styles.headerDarkCircle.borderColor,
              },
            ]}
          >
            <Ionicons name="location-outline" size={17} color={theme.iconCircleText} />
          </View>
          <Pressable
            style={[
              styles.headerDarkCircle,
              {
                backgroundColor: theme.iconCircleBg,
                borderColor: isNeo ? "rgba(255,255,255,0.25)" : styles.headerDarkCircle.borderColor,
              },
            ]}
            onPress={() => {
              if (!groupPanelVisible) {
                setGroupPanelVisible(true);
                setGroupPanelMode("expanded");
                return;
              }
              setGroupPanelMode((prev) => (prev === "expanded" ? "minimized" : "expanded"));
            }}
          >
            <Ionicons name="people-outline" size={17} color={theme.iconCircleText} />
          </Pressable>
        </View>
      </View>

      <View
        style={[
          styles.worldStatus,
          {
            top: insets.top + 66,
            backgroundColor: theme.previewCardBg,
            borderColor: theme.previewCardBorder,
          },
        ]}
      >
        <Text style={[styles.worldStatusTitle, { color: theme.previewText }]}>
          {tr("无引擎世界模式", "No-Engine World Mode")}
        </Text>
        <Text style={[styles.worldStatusText, { color: theme.previewSubtext }]}>
          {language === "zh"
            ? `已加载 ${visibleChunks.length} 个区块 · 中心 C${centerChunk.chunkX + 1}-${centerChunk.chunkY + 1}`
            : `Loaded ${visibleChunks.length} chunks · Center C${centerChunk.chunkX + 1}-${centerChunk.chunkY + 1}`}
        </Text>
        <Text style={[styles.worldStatusTextMinor, { color: theme.previewSubtext }]}>
          {language === "zh" ? `可见房源: ${visibleLots.length}` : `Visible homes: ${visibleLots.length}`}
        </Text>
      </View>

      <View style={[styles.zoomWrap, { bottom: zoomControlsBottom }]}>
        {showWorldScale ? (
          <View
            style={[
              styles.scaleInfoPill,
              {
                backgroundColor: theme.askBarBg,
                borderColor: theme.askBarBorder,
              },
            ]}
          >
            <Text style={[styles.scaleInfoText, { color: theme.previewText }]}>{`${WORLD_WIDTH} x ${WORLD_HEIGHT}`}</Text>
          </View>
        ) : null}
        <Pressable
          style={[styles.zoomBtn, { backgroundColor: theme.askBarBg, borderColor: theme.askBarBorder }]}
          onPress={() => applyZoom(0.14)}
        >
          <Ionicons name="add" size={20} color={theme.askBarInputText} />
        </Pressable>
        <Pressable
          style={[styles.zoomBtn, { backgroundColor: theme.askBarBg, borderColor: theme.askBarBorder }]}
          onPress={() => applyZoom(-0.14)}
        >
          <Ionicons name="remove" size={20} color={theme.askBarInputText} />
        </Pressable>
        <Pressable
          style={[styles.zoomBtn, { backgroundColor: theme.askBarBg, borderColor: theme.askBarBorder }]}
          onPress={() => setShowWorldScale((prev) => !prev)}
        >
          <Ionicons
            name={showWorldScale ? "close-outline" : "search-outline"}
            size={18}
            color={theme.askBarInputText}
          />
        </Pressable>
        <Pressable
          style={[styles.zoomBtn, { backgroundColor: theme.askBarBg, borderColor: theme.askBarBorder }]}
          onPress={() => centerOnHome(true)}
        >
          <Ionicons name="navigate" size={18} color={theme.askBarInputText} />
        </Pressable>
      </View>

      <View style={styles.mapScrollWrap} {...mapPanResponder.panHandlers}>
        <ScrollView
          horizontal
          style={styles.outerScroll}
          ref={horizontalRef}
          scrollEnabled={!isPinching}
          onScroll={(event) => {
            const next = event.nativeEvent.contentOffset.x;
            setScrollX(next);
            scrollXRef.current = next;
          }}
          scrollEventThrottle={16}
        >
          <ScrollView
            style={styles.innerScroll}
            ref={verticalRef}
            scrollEnabled={!isPinching}
            onScroll={(event) => {
              const next = event.nativeEvent.contentOffset.y;
              setScrollY(next);
              scrollYRef.current = next;
            }}
            scrollEventThrottle={16}
          >
            <View
              style={[
                styles.mapCanvas,
                { width: mapWidthScaled, height: mapHeightScaled, backgroundColor: worldPalette.land },
              ]}
            >
            <Svg
              width={svgWidth}
              height={svgHeight}
              viewBox={`0 0 ${WORLD_WIDTH} ${WORLD_HEIGHT}`}
              preserveAspectRatio="none"
              style={[
                styles.mapBackgroundSvg,
                isAndroid && {
                  transform: [
                    { translateX: svgTranslateX },
                    { translateY: svgTranslateY },
                    { scale: svgDownsample },
                  ],
                },
              ]}
            >
              <Rect x={0} y={0} width={WORLD_WIDTH} height={WORLD_HEIGHT} fill={worldPalette.land} />
              <Path d={coastAreaPathForSvg()} fill={worldPalette.coast} opacity={isNeo ? 0.85 : 0.95} />
              <Path
                d={coastPathForSvg()}
                stroke={worldPalette.coastStroke}
                strokeWidth={isNeo ? 88 : 96}
                fill="none"
                strokeLinecap="round"
                opacity={isNeo ? 0.85 : 0.75}
              />

              {MOUNTAIN_PEAKS.map((peak, index) => (
                <Circle
                  key={`mountain_outer_${index}`}
                  cx={peak.x}
                  cy={peak.y}
                  r={peak.radius}
                  fill={worldPalette.mountainOuter}
                />
              ))}
              {MOUNTAIN_PEAKS.map((peak, index) => (
                <Circle
                  key={`mountain_inner_${index}`}
                  cx={peak.x}
                  cy={peak.y}
                  r={peak.radius * 0.62}
                  fill={worldPalette.mountainInner}
                />
              ))}

              <Path
                d={riverPathForSvg()}
                stroke={worldPalette.riverGlow}
                strokeWidth={RIVER_WIDTH + (isNeo ? 76 : 80)}
                fill="none"
                strokeLinecap="round"
                opacity={isNeo ? 0.9 : 0.95}
              />
              <Path
                d={riverPathForSvg()}
                stroke={worldPalette.riverCore}
                strokeWidth={RIVER_WIDTH}
                fill="none"
                strokeLinecap="round"
                opacity={isNeo ? 0.95 : 0.92}
              />

              {ROAD_ROUTES.map((route) => (
                <Path
                  key={`road_${route.id}`}
                  d={route.svgPath}
                  stroke={worldPalette.road}
                  strokeWidth={58}
                  strokeLinecap="round"
                  fill="none"
                />
              ))}

              {ROAD_ROUTES.map((route) => (
                <Path
                  key={`road_stripe_${route.id}`}
                  d={route.svgPath}
                  stroke={worldPalette.roadStripe}
                  strokeWidth={isNeo ? 1.8 : 2.3}
                  strokeDasharray="17 18"
                  strokeLinecap="round"
                  fill="none"
                  opacity={isNeo ? 0.52 : 0.62}
                />
              ))}

              {Array.from({ length: WORLD_CHUNKS_X + 1 }).map((_, index) => {
                const x = index * CHUNK_SIZE;
                return (
                  <Path
                    key={`grid_x_${index}`}
                    d={`M ${x} 0 L ${x} ${WORLD_HEIGHT}`}
                    stroke={worldPalette.grid}
                    strokeWidth={2}
                  />
                );
              })}

              {Array.from({ length: WORLD_CHUNKS_Y + 1 }).map((_, index) => {
                const y = index * CHUNK_SIZE;
                return (
                  <Path
                    key={`grid_y_${index}`}
                    d={`M 0 ${y} L ${WORLD_WIDTH} ${y}`}
                    stroke={worldPalette.grid}
                    strokeWidth={2}
                  />
                );
              })}
            </Svg>

            {cars.map((car) => {
              const route = routeLookup.get(car.routeId);
              if (!route) return null;

              const elapsed = (clockMs / 1000) * car.speed + car.delay;
              const baseProgress = ((elapsed % 1) + 1) % 1;
              const t = car.direction === 1 ? baseProgress : 1 - baseProgress;
              const point = routePoint(route, t);
              const angle = car.direction === 1 ? point.angle : point.angle + 180;

              return (
                <View
                  key={car.id}
                  pointerEvents="none"
                  style={[
                    styles.carWrap,
                    {
                      left: point.x * scale,
                      top: point.y * scale,
                      transform: [
                        { translateX: -6 },
                        { translateY: -4 },
                        { rotate: `${angle}deg` },
                        { scale: Math.max(0.6, scale) },
                      ],
                    },
                  ]}
                >
                  <View style={[styles.carBody, { backgroundColor: car.color }]}>
                <View style={[styles.carGlass, isNeo ? { backgroundColor: "rgba(255,255,255,0.55)" } : {}]} />
                <View style={styles.wheelLeft} />
                <View style={styles.wheelRight} />
              </View>
            </View>
              );
            })}

            {visibleTrees.map((tree, index) => (
              <View
                key={`tree_${index}_${Math.round(tree.x)}_${Math.round(tree.y)}`}
                style={[
                  styles.treeWrap,
                  {
                    left: tree.x * scale,
                    top: tree.y * scale,
                    transform: [{ scale: tree.scale * scale }],
                  },
                ]}
              >
                <View
                  style={[
                    styles.treeLeaf,
                    isNeo ? { backgroundColor: "rgba(33,197,94,0.9)" } : {},
                  ]}
                />
                <View
                  style={[
                    styles.treeTrunk,
                    isNeo ? { backgroundColor: "rgba(120,85,65,0.85)" } : {},
                  ]}
                />
                <View
                  style={[
                    styles.treeShadow,
                    isNeo ? { backgroundColor: worldPalette.lakeShadow } : {},
                  ]}
                />
              </View>
            ))}

            {visibleLots.map((lot) => {
              const selected = lot.id === selectedLot?.id;
              return (
                <Pressable
                  key={lot.id}
                  style={[
                    styles.lotWrap,
                    {
                      left: lot.x * scale,
                      top: lot.y * scale,
                    },
                  ]}
                  onPress={() => setSelectedLot(lot)}
                >
                  {selected ? (
                    <View
                      style={[
                        styles.avatarBubble,
                        {
                          backgroundColor: theme.previewCardBg,
                          borderColor: theme.previewCardBorder,
                        },
                      ]}
                    >
                      <Image source={{ uri: lot.npc.avatar }} style={styles.avatarBubbleImage} />
                      <View>
                        <Text style={[styles.avatarBubbleName, { color: theme.previewText }]}>
                          {lot.label}
                        </Text>
                        <Text style={[styles.avatarBubbleRole, { color: theme.previewSubtext }]}>
                          {lot.npc.role}
                        </Text>
                      </View>
                    </View>
                  ) : !lot.isMarket ? (
                    <>
                      <View
                        style={[
                          styles.labelPill,
                          {
                            backgroundColor: theme.previewCardBg,
                            borderColor: theme.previewCardBorder,
                          },
                        ]}
                      >
                        <Text style={[styles.labelPillText, { color: theme.previewText }]}>
                          {lot.label}
                        </Text>
                      </View>
                    </>
                  ) : null}

                  <TownHouseNode type={lot.visualType} selected={selected} scale={lotScale} />
                </Pressable>
              );
            })}

            <View
              style={[
                styles.myHomeMarker,
                { left: HOME_POSITION.x * scale, top: HOME_POSITION.y * scale },
              ]}
            >
              <View style={[styles.myHomePill, { backgroundColor: theme.chatSheetBg }]}>
                <Ionicons name="home" size={10} color={theme.accent} />
                <Text style={[styles.myHomeText, { color: isNeo ? "rgba(248,250,252,0.95)" : "#1f2937" }]}>
                  {tr("我的家", "My Home")}
                </Text>
              </View>
              <TownHouseNode
                type={mapMyHouseTypeToVisual(myHouseType)}
                selected={false}
                scale={lotScale}
              />
            </View>
            </View>
          </ScrollView>
        </ScrollView>
      </View>

      {showWorldScale ? (
        <View style={styles.miniMapWrap} pointerEvents="none">
          <View
            style={[
              styles.miniMapCard,
              { backgroundColor: theme.chatSheetBg, borderColor: theme.chatSheetBorder },
            ]}
          >
            <View
              style={[
                styles.miniMap,
                {
                  width: miniSize,
                  height: miniSize,
                  backgroundColor: isNeo ? worldPalette.miniMap : worldPalette.miniMap,
                },
              ]}
            >
              {visibleChunks.map((chunk) => {
                const chunkWidth = miniSize / WORLD_CHUNKS_X;
                const chunkHeight = miniSize / WORLD_CHUNKS_Y;
                return (
                  <View
                    key={`mini_chunk_${chunk.key}`}
                    style={[
                      styles.miniChunk,
                      {
                        left: chunk.chunkX * chunkWidth,
                        top: chunk.chunkY * chunkHeight,
                        width: chunkWidth,
                        height: chunkHeight,
                        borderColor: worldPalette.miniChunk,
                        backgroundColor: isNeo ? "rgba(255,255,255,0.03)" : "rgba(17,24,39,0.08)",
                      },
                    ]}
                  />
                );
              })}

              <View
                style={[
                  styles.miniViewport,
                  {
                    left: miniViewport.left,
                    top: miniViewport.top,
                    width: miniViewport.width,
                    height: miniViewport.height,
                    borderColor: theme.accent,
                    backgroundColor: isNeo ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.16)",
                  },
                ]}
              />

              <View
                style={[
                  styles.miniHomeDot,
                  {
                    left: (HOME_POSITION.x / WORLD_WIDTH) * miniSize - 3,
                    top: (HOME_POSITION.y / WORLD_HEIGHT) * miniSize - 3,
                    backgroundColor: "#ef4444",
                  },
                ]}
              />
            </View>
          </View>
        </View>
      ) : null}

      {groupPanelVisible ? (
        groupPanelMode === "expanded" ? (
          <View style={styles.worldGroupWrap} pointerEvents="box-none">
            <View
              style={[
                styles.worldGroupCard,
                {
                  backgroundColor: theme.chatSheetBg,
                  borderColor: theme.chatSheetBorder,
                },
              ]}
            >
              <View style={styles.worldGroupHeader}>
                <View style={styles.worldGroupHeaderLeft}>
                  <View style={[styles.worldGroupBadge, { backgroundColor: theme.accent }]}>
                    <Ionicons name="people" size={12} color="white" />
                  </View>
                  <View>
                    <Text style={[styles.worldGroupTitle, { color: theme.sheetTitle }]}>
                      {language === "zh"
                        ? `Agent 团队（Bot ${Math.min(worldGroupCursorRef.current, 99) + 1}/100）`
                        : `Agent Team (Bot ${Math.min(worldGroupCursorRef.current, 99) + 1}/100)`}
                    </Text>
                    <Text style={[styles.worldGroupSub, { color: theme.accent }]}>
                      {tr("普通用户 Mini App 需求脑暴", "Mini App ideation from user perspective")}
                    </Text>
                  </View>
                </View>
                <View style={styles.worldGroupActions}>
                  <Pressable
                    style={[styles.worldGroupActionBtn, { backgroundColor: theme.askBarBg }]}
                    onPress={() => setGroupPanelMode("minimized")}
                  >
                    <Ionicons name="remove" size={16} color={theme.chatHeaderText} />
                  </Pressable>
                  <Pressable
                    style={[styles.worldGroupActionBtn, { backgroundColor: theme.askBarBg }]}
                    onPress={() => setGroupPanelVisible(false)}
                  >
                    <Ionicons name="close" size={14} color={theme.chatHeaderText} />
                  </Pressable>
                </View>
              </View>

              <ScrollView
                ref={worldGroupScrollRef}
                style={styles.worldGroupList}
                contentContainerStyle={styles.worldGroupListContent}
                showsVerticalScrollIndicator={false}
              >
                {worldGroupMessages.length === 0 ? (
                  <View style={styles.worldGroupEmptyWrap}>
                    <Text style={[styles.worldGroupEmptyText, { color: theme.previewSubtext }]}>
                      {tr("暂无消息，正在等待 Agent 发言...", "No messages yet, waiting for agents...")}
                    </Text>
                  </View>
                ) : (
                  worldGroupMessages.map((msg) =>
                    msg.role === "system" ? (
                      <View
                        key={msg.id}
                        style={[
                          styles.worldGroupSystemWrap,
                          { alignItems: "center" },
                        ]}
                      >
                        <View
                          style={[
                            styles.worldGroupSystemChip,
                            isNeo
                              ? {
                                  borderColor: "rgba(255,255,255,0.18)",
                                  backgroundColor: "rgba(255,255,255,0.05)",
                                }
                              : {},
                          ]}
                        >
                          <Text style={[styles.worldGroupSystemText, { color: theme.previewSubtext }]}>
                            {msg.text}
                          </Text>
                        </View>
                      </View>
                    ) : (
                      <View key={msg.id} style={styles.worldGroupRow}>
                        <Image
                          source={{ uri: msg.senderAvatar || botConfig.avatar }}
                          style={[
                            styles.worldGroupAvatar,
                            isNeo ? { backgroundColor: "rgba(255,255,255,0.16)" } : {},
                          ]}
                        />
                        <View style={styles.worldGroupBubbleWrap}>
                          <View style={styles.worldGroupNameRow}>
                            <Text
                              style={[
                                styles.worldGroupName,
                                { color: isNeo ? "rgba(226,232,240,0.96)" : "#1f2937" },
                              ]}
                              numberOfLines={1}
                            >
                              {msg.senderName}
                            </Text>
                            <Text style={[styles.worldGroupRole, { color: theme.previewSubtext }]} numberOfLines={1}>
                              {msg.senderRole}
                            </Text>
                          </View>
                          <View
                            style={[
                              styles.worldGroupBubble,
                              isNeo
                                ? {
                                    borderColor: "rgba(255,255,255,0.16)",
                                    backgroundColor: "rgba(255,255,255,0.06)",
                                  }
                                : {},
                            ]}
                          >
                            <Text style={[styles.worldGroupText, { color: isNeo ? "rgba(226,232,240,0.95)" : "#334155" }]}>
                              {msg.text}
                            </Text>
                          </View>
                        </View>
                      </View>
                    )
                  )
                )}

                {isWorldGroupThinking ? (
                  <View
                    style={[
                      styles.worldThinkingRow,
                      isNeo
                        ? {
                            borderColor: "rgba(56,189,248,0.28)",
                            backgroundColor: "rgba(59,130,246,0.18)",
                          }
                        : {},
                    ]}
                  >
                    <Ionicons name="sync-outline" size={12} color={theme.accent} />
                    <Text style={[styles.worldThinkingText, { color: isNeo ? theme.accent : "#1d4ed8" }]}>
                      {language === "zh"
                        ? `Bot ${Math.min(worldGroupCursorRef.current, 99) + 1} 构思中...`
                        : `Bot ${Math.min(worldGroupCursorRef.current, 99) + 1} is thinking...`}
                    </Text>
                  </View>
                ) : null}
              </ScrollView>

              <View
                style={[
                  styles.worldGroupFooter,
                  {
                    borderTopColor: isNeo ? "rgba(255,255,255,0.12)" : "#e5e7eb",
                    backgroundColor: isNeo ? "rgba(15,23,42,0.72)" : "#f8fafc",
                  },
                ]}
              >
                <Ionicons name="mic-outline" size={13} color={theme.chatHeaderText} />
                <Text style={[styles.worldGroupFooterText, { color: theme.chatHeaderText }]}>
                  {tr("旁观模式（Team Lead 已锁定议题）", "Observer mode (topic locked by Team Lead)")}
                </Text>
                <Ionicons name="add" size={14} color={theme.chatHeaderText} />
              </View>
            </View>
          </View>
        ) : (
          <Pressable
            style={[
              styles.worldGroupMini,
              {
                backgroundColor: theme.chatSheetBg,
                borderColor: theme.chatSheetBorder,
              },
            ]}
            onPress={() => setGroupPanelMode("expanded")}
          >
            <View style={[styles.worldGroupMiniBadge, { backgroundColor: theme.accent }]}>
              <Ionicons name="bulb-outline" size={14} color="white" />
            </View>
            <View>
              <Text style={[styles.worldGroupMiniTitle, { color: theme.sheetTitle }]}>
                {tr("用户需求脑暴", "User Needs Brainstorm")}
              </Text>
              <Text style={[styles.worldGroupMiniSub, { color: theme.previewSubtext }]}>
                {language === "zh"
                  ? `Agent ${Math.min(worldGroupCursorRef.current, 99) + 1} 思考中...`
                  : `Agent ${Math.min(worldGroupCursorRef.current, 99) + 1} thinking...`}
              </Text>
            </View>
          </Pressable>
        )
      ) : null}

      {selectedLot ? (
        <View
          style={[
            styles.visitWrap,
            groupPanelVisible && groupPanelMode === "expanded" ? styles.visitWrapRaised : null,
          ]}
        >
          <View style={styles.visitBtnRow}>
            <Pressable style={styles.visitBtn} onPress={openChat}>
              <Ionicons name="chatbubble" size={16} color="white" />
              <Text style={styles.visitBtnText}>
                {language === "zh" ? `访问 ${selectedLot.label}` : `Visit ${selectedLot.label}`}
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.visitBtn,
                styles.groupVisitBtn,
                {
                  backgroundColor: isNeo ? theme.chatSheetBg : "rgba(255,255,255,0.92)",
                  borderColor: isNeo ? theme.previewCardBorder : "rgba(255,255,255,0.65)",
                },
              ]}
              onPress={openGroupChat}
            >
              <Ionicons name="people" size={16} color={isNeo ? theme.previewText : "#111827"} />
              <Text
                style={[
                  styles.groupVisitBtnText,
                  { color: isNeo ? theme.previewText : "#111827" },
                ]}
              >
                {tr("群聊", "Group Chat")}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <Modal
        visible={isChatOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setIsChatOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 6 : 0}
          style={styles.modalOverlay}
        >
          <View style={[styles.chatSheet, { backgroundColor: theme.chatSheetBg }]}>
            <View
              style={[styles.chatHeader, { borderBottomColor: isNeo ? "rgba(255,255,255,0.14)" : "#f3f4f6" }]}
            >
              <View style={styles.chatHeaderLeft}>
                {selectedLot ? (
                  <Image source={{ uri: selectedLot.npc.avatar }} style={styles.chatAvatar} />
                ) : null}
                <View>
                  <Text style={[styles.chatName, { color: theme.sheetTitle }]}>
                    {chatMode === "group"
                      ? `${selectedLot?.label ?? tr("小镇", "Town")} ${tr("群聊", "Group")}`
                      : selectedLot?.npc.name ?? tr("邻居", "NPC")}
                  </Text>
                  <Text style={[styles.chatRole, { color: theme.chatHeaderText }]}>
                    {chatMode === "group"
                      ? language === "zh"
                        ? `${Math.max(2, groupMemberNames.length)} 人 · 群聊`
                        : `${Math.max(2, groupMemberNames.length)} members · Group chat`
                      : selectedLot?.npc.role ?? tr("角色", "Role")}
                  </Text>
                </View>
              </View>
              <Pressable
                style={[
                  styles.headerCircleWhite,
                  { backgroundColor: isNeo ? "rgba(255,255,255,0.14)" : "#f3f4f6" },
                ]}
                onPress={() => setIsChatOpen(false)}
              >
                <Ionicons name="close" size={18} color={theme.chatHeaderText} />
              </Pressable>
            </View>

            <ScrollView
              style={styles.chatMessages}
              contentContainerStyle={styles.chatMessagesContent}
              ref={chatScrollRef}
            >
              {chatMessages.map((msg, index) => (
                msg.role === "system" ? (
                  <View key={`${msg.role}_${index}`} style={styles.systemRow}>
                    <Text style={[styles.systemText, { color: theme.chatHeaderText }]}>
                      {msg.text}
                    </Text>
                  </View>
                ) : (
                  <View
                    key={`${msg.role}_${index}`}
                    style={[
                      styles.chatRow,
                      msg.role === "user" ? styles.chatRowMe : styles.chatRowBot,
                    ]}
                  >
                    <View
                      style={[
                        styles.chatBubble,
                        msg.role === "user" ? styles.chatBubbleMe : styles.chatBubbleBot,
                        msg.role === "user"
                          ? { backgroundColor: isNeo ? theme.accent : styles.chatBubbleMe.backgroundColor }
                          : {
                              backgroundColor: isNeo ? "rgba(255,255,255,0.06)" : "#f3f4f6",
                              borderColor: isNeo ? "rgba(255,255,255,0.16)" : "#e5e7eb",
                            },
                      ]}
                    >
                      {chatMode === "group" && msg.role === "model" && msg.senderName ? (
                        <Text
                          style={[
                            styles.chatSender,
                            { color: isNeo ? "rgba(148,163,184,0.9)" : "#64748b" },
                          ]}
                        >
                          {msg.senderName}
                        </Text>
                      ) : null}
                      <Text
                        style={[
                          styles.chatBubbleText,
                          {
                            color:
                              msg.role === "user"
                                ? isNeo
                                  ? "#052e16"
                                  : "#111827"
                                : "rgba(226,232,240,0.95)",
                          },
                        ]}
                      >
                        {msg.text}
                      </Text>
                    </View>
                  </View>
                )
              ))}
            </ScrollView>

            <View style={[styles.chatInputWrap, { backgroundColor: isNeo ? "rgba(30,37,55,0.86)" : "#f9fafb", borderColor: isNeo ? "rgba(255,255,255,0.12)" : "#e5e7eb" }]}>
              <TextInput
                style={[
                  styles.chatInput,
                  {
                    backgroundColor: isNeo ? "rgba(15,19,32,0.7)" : "#fff",
                    borderColor: isNeo ? "rgba(255,255,255,0.16)" : "#d1d5db",
                    color: isNeo ? "rgba(226,232,240,0.92)" : "#111827",
                  },
                ]}
                value={inputValue}
                onChangeText={setInputValue}
                placeholder={
                  chatMode === "group"
                    ? tr("发送群消息...", "Message the group...")
                    : tr("输入消息...", "Type a message...")
                }
                placeholderTextColor={theme.askBarInputText}
                onSubmitEditing={sendChat}
              autoComplete="off"
              textContentType="oneTimeCode"
              importantForAutofill="no"
              />
              <Pressable
                style={[styles.chatSendBtn, { backgroundColor: isNeo ? "rgba(255,255,255,0.16)" : "#e5e7eb" }]}
                onPress={sendChat}
              >
                <Ionicons name="send" size={16} color={isNeo ? "rgba(226,232,240,0.95)" : "#374151"} />
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#7ec850",
  },
  mapHeader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    elevation: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.28)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.45)",
  },
  headerDarkCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(17,24,39,0.2)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  mapPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.93)",
  },
  mapPillText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#111827",
  },
  worldStatus: {
    position: "absolute",
    top: 66,
    left: 12,
    right: 12,
    zIndex: 19,
    elevation: 19,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: "rgba(15, 23, 42, 0.28)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  worldStatusTitle: {
    color: "#f8fafc",
    fontSize: 11,
    fontWeight: "800",
  },
  worldStatusText: {
    marginTop: 2,
    color: "#e2e8f0",
    fontSize: 10,
  },
  worldStatusTextMinor: {
    marginTop: 2,
    color: "#cbd5e1",
    fontSize: 10,
  },
  mapScrollWrap: {
    flex: 1,
  },
  zoomWrap: {
    position: "absolute",
    left: 10,
    bottom: 140,
    zIndex: 20,
    elevation: 20,
    gap: 8,
  },
  scaleInfoPill: {
    minWidth: 94,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "rgba(255,255,255,0.94)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.7)",
    alignItems: "center",
  },
  scaleInfoText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#1f2937",
  },
  zoomBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.6)",
  },
  outerScroll: {
    flex: 1,
  },
  innerScroll: {
    flex: 1,
  },
  mapCanvas: {
    backgroundColor: "#7ec850",
  },
  mapBackgroundSvg: {
    position: "absolute",
    left: 0,
    top: 0,
  },
  carWrap: {
    position: "absolute",
    zIndex: 12,
  },
  carBody: {
    width: 12,
    height: 8,
    borderRadius: 2,
    borderWidth: 0.5,
    borderColor: "rgba(0,0,0,0.15)",
  },
  carGlass: {
    position: "absolute",
    left: 2,
    right: 2,
    top: 1,
    height: 3,
    borderRadius: 1,
    backgroundColor: "rgba(147,197,253,0.6)",
  },
  wheelLeft: {
    position: "absolute",
    left: -1,
    bottom: -1,
    width: 2,
    height: 2,
    borderRadius: 1,
    backgroundColor: "#111827",
  },
  wheelRight: {
    position: "absolute",
    right: -1,
    bottom: -1,
    width: 2,
    height: 2,
    borderRadius: 1,
    backgroundColor: "#111827",
  },
  treeWrap: {
    position: "absolute",
    alignItems: "center",
    zIndex: 8,
  },
  treeLeaf: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#23aa46",
    marginBottom: -12,
  },
  treeTrunk: {
    width: 10,
    height: 20,
    borderRadius: 3,
    backgroundColor: "#8a5a44",
  },
  treeShadow: {
    width: 30,
    height: 8,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.15)",
    marginTop: 2,
  },
  lotWrap: {
    position: "absolute",
    alignItems: "center",
    zIndex: 14,
  },
  labelPill: {
    position: "absolute",
    bottom: 56,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: "rgba(255,255,255,0.7)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.5)",
  },
  labelPillText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#111827",
  },
  avatarBubble: {
    position: "absolute",
    bottom: 46,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderWidth: 1,
    borderColor: "#f3f4f6",
    paddingHorizontal: 8,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 124,
  },
  avatarBubbleImage: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#e5e7eb",
  },
  avatarBubbleName: {
    fontSize: 10,
    fontWeight: "700",
    color: "#111827",
  },
  avatarBubbleRole: {
    fontSize: 9,
    color: "#475569",
  },
  myHomeMarker: {
    position: "absolute",
    alignItems: "center",
    zIndex: 15,
  },
  myHomePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.92)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 4,
  },
  myHomeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#1f2937",
  },
  miniMapWrap: {
    position: "absolute",
    right: 12,
    bottom: 150,
    zIndex: 21,
  },
  miniMapCard: {
    borderRadius: 14,
    padding: 8,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.6)",
    alignItems: "center",
  },
  miniMap: {
    borderRadius: 8,
    backgroundColor: "#89ce5f",
    overflow: "hidden",
  },
  miniChunk: {
    position: "absolute",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.26)",
    backgroundColor: "rgba(17,24,39,0.08)",
  },
  miniViewport: {
    position: "absolute",
    borderWidth: 1,
    borderColor: "#111827",
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  miniHomeDot: {
    position: "absolute",
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#ef4444",
  },
  worldGroupWrap: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 26,
    zIndex: 22,
    elevation: 22,
  },
  worldGroupCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.72)",
    backgroundColor: "rgba(255,255,255,0.94)",
    overflow: "hidden",
    maxHeight: 320,
  },
  worldGroupHeader: {
    minHeight: 52,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  worldGroupHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    paddingRight: 8,
  },
  worldGroupBadge: {
    width: 24,
    height: 24,
    borderRadius: 7,
    backgroundColor: "#16a34a",
    alignItems: "center",
    justifyContent: "center",
  },
  worldGroupTitle: {
    color: "#111827",
    fontSize: 12,
    fontWeight: "800",
  },
  worldGroupSub: {
    marginTop: 1,
    color: "#059669",
    fontSize: 10,
    fontWeight: "600",
  },
  worldGroupActions: {
    flexDirection: "row",
    gap: 4,
  },
  worldGroupActionBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f3f4f6",
  },
  worldGroupList: {
    minHeight: 112,
    maxHeight: 220,
  },
  worldGroupListContent: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 7,
  },
  worldGroupEmptyWrap: {
    minHeight: 84,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  worldGroupEmptyText: {
    color: "#64748b",
    fontSize: 11,
    textAlign: "center",
  },
  worldGroupSystemChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  worldGroupSystemWrap: {
    alignItems: "center",
  },
  worldGroupSystemText: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f1f5f9",
    color: "#64748b",
    fontSize: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  worldGroupRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
  },
  worldGroupAvatar: {
    width: 26,
    height: 26,
    borderRadius: 9,
    backgroundColor: "#d1d5db",
  },
  worldGroupBubbleWrap: {
    flex: 1,
    gap: 3,
  },
  worldGroupNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  worldGroupName: {
    fontSize: 10,
    fontWeight: "700",
    color: "#1f2937",
    maxWidth: 130,
  },
  worldGroupRole: {
    fontSize: 9,
    color: "#64748b",
    maxWidth: 100,
  },
  worldGroupBubble: {
    borderRadius: 12,
    borderTopLeftRadius: 4,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    backgroundColor: "white",
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  worldGroupText: {
    color: "#334155",
    fontSize: 11,
    lineHeight: 15,
  },
  worldThinkingRow: {
    marginTop: 2,
    marginBottom: 4,
    marginLeft: 33,
    borderRadius: 999,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#dbeafe",
    backgroundColor: "#eff6ff",
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  worldThinkingText: {
    color: "#1d4ed8",
    fontSize: 10,
    fontWeight: "600",
  },
  worldGroupFooter: {
    minHeight: 34,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#f8fafc",
  },
  worldGroupFooterText: {
    flex: 1,
    color: "#64748b",
    fontSize: 10,
  },
  worldGroupMini: {
    position: "absolute",
    left: 12,
    bottom: 96,
    zIndex: 22,
    elevation: 22,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.72)",
    backgroundColor: "rgba(255,255,255,0.94)",
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  worldGroupMiniBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#16a34a",
    alignItems: "center",
    justifyContent: "center",
  },
  worldGroupMiniTitle: {
    color: "#1f2937",
    fontSize: 11,
    fontWeight: "700",
  },
  worldGroupMiniSub: {
    marginTop: 1,
    color: "#64748b",
    fontSize: 9,
  },
  visitWrap: {
    position: "absolute",
    bottom: 24,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 20,
  },
  visitWrapRaised: {
    bottom: 336,
  },
  visitBtnRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  visitBtn: {
    minHeight: 46,
    borderRadius: 999,
    backgroundColor: "#111827",
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  groupVisitBtn: {
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.65)",
  },
  visitBtnText: {
    color: "white",
    fontWeight: "700",
    fontSize: 13,
  },
  groupVisitBtnText: {
    color: "#111827",
    fontWeight: "700",
    fontSize: 13,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  chatSheet: {
    height: "84%",
    backgroundColor: "white",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 10,
  },
  chatHeader: {
    marginHorizontal: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  chatHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  chatAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#e5e7eb",
  },
  chatName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  chatRole: {
    fontSize: 11,
    color: "#6b7280",
  },
  headerCircleWhite: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f3f4f6",
  },
  chatMessages: {
    flex: 1,
  },
  chatMessagesContent: {
    padding: 14,
    gap: 8,
  },
  systemRow: {
    alignItems: "center",
    marginVertical: 4,
  },
  systemText: {
    fontSize: 11,
    color: "#64748b",
    backgroundColor: "#f1f5f9",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  chatRow: {
    flexDirection: "row",
  },
  chatRowMe: {
    justifyContent: "flex-end",
  },
  chatRowBot: {
    justifyContent: "flex-start",
  },
  chatBubble: {
    maxWidth: "82%",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chatBubbleMe: {
    backgroundColor: "#95EC69",
  },
  chatBubbleBot: {
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  chatBubbleText: {
    fontSize: 14,
    color: "#111827",
    lineHeight: 20,
  },
  chatSender: {
    fontSize: 10,
    color: "#64748b",
    fontWeight: "700",
    marginBottom: 3,
  },
  chatInputWrap: {
    margin: 12,
    padding: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#f9fafb",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  chatInput: {
    flex: 1,
    minHeight: 36,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d1d5db",
    backgroundColor: "white",
  },
  chatSendBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
  },
});
