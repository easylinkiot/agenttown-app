import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { tx } from "@/src/i18n/translate";
import { useAgentTown } from "@/src/state/agenttown-context";
import { AppLanguage, MiniApp } from "@/src/types";

type DockAction = {
  id: string;
  zh: string;
  en: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  promptZh: string;
  promptEn: string;
};

type DockExample = {
  id: string;
  zhTitle: string;
  enTitle: string;
  zhDesc: string;
  enDesc: string;
  icon: keyof typeof Ionicons.glyphMap;
  promptZh: string;
  promptEn: string;
};

const QUICK_ACTIONS: DockAction[] = [
  {
    id: "focus",
    zh: "关注",
    en: "News",
    icon: "newspaper-outline",
    color: "#3b82f6",
    promptZh:
      "生成一个新闻早报 Mini App：每2小时采集 Reddit、TechCrunch、GitHub Trending 的 AI 热点。海报包含头条主卡（热度分）、4条快讯、主题标签、关键洞察和今日行动建议。",
    promptEn:
      "Build a news mini app that collects AI headlines from Reddit, TechCrunch and GitHub Trending every 2 hours. Poster should include one hero headline card with heat score, 4 quick briefs, topic tags, key insight, and one action hint.",
  },
  {
    id: "price",
    zh: "比价",
    en: "Price",
    icon: "pricetag-outline",
    color: "#f97316",
    promptZh:
      "生成一个比价 Mini App：追踪我收藏的商品，出现历史低价时提醒。海报展示商品现价/原价、折扣百分比、趋势箭头、门店信息和购买建议。",
    promptEn:
      "Build a price tracker mini app that watches saved products and alerts on new all-time lows. Poster should show current vs original price, discount percentage, trend arrow, retailer, and buy/hold advice.",
  },
  {
    id: "words",
    zh: "单词",
    en: "Words",
    icon: "book-outline",
    color: "#8b5cf6",
    promptZh:
      "生成一个英语背单词 Mini App：每天随机生成高阶词，提供美式发音、同义/反义词、例句、记忆口诀和小测题，并支持翻面记忆海报。",
    promptEn:
      "Build a daily vocabulary mini app: word of the day with pronunciation, synonyms/antonyms, example sentence, memory tip, and quiz line in a flip-to-reveal poster layout.",
  },
  {
    id: "tasks",
    zh: "待办",
    en: "Todo",
    icon: "checkmark-done-outline",
    color: "#22c55e",
    promptZh:
      "生成一个待办象限 Mini App：把任务按紧急/重要排序。海报包含4个核心指标卡、今日重点、风险提示和下一步执行建议。",
    promptEn:
      "Build an Eisenhower-matrix mini app that ranks tasks by urgency/importance. Poster should include 4 KPI cards, today's focus, risk alerts, and next-step recommendations.",
  },
];

const EXAMPLES: DockExample[] = [
  {
    id: "brief",
    zhTitle: "阅读早报",
    enTitle: "Morning Brief",
    zhDesc: "每天早上 8 点，采集过去 24 小时 AI 热点新闻，生成摘要卡片。",
    enDesc: "Collect last-24h AI headlines at 8 AM and generate summary cards.",
    icon: "newspaper-outline",
    promptZh:
      "生成一个阅读早报 Mini App：每天早上 8 点采集过去 24 小时 AI 热点。请输出头条主卡、4条快讯、热度评分、主题标签和一句洞察。",
    promptEn:
      "Build a morning brief mini app: every day at 8 AM collect last-24h AI headlines and render a poster with hero story, 4 briefs, heat scores, tags, and one insight.",
  },
  {
    id: "chat-digest",
    zhTitle: "Chat 决策摘要",
    enTitle: "Chat Digest",
    zhDesc: "自动汇总群聊过去 2 小时讨论，提取共识和待分配任务。",
    enDesc: "Summarize last 2 hours of group chat and extract action items.",
    icon: "chatbox-ellipses-outline",
    promptZh:
      "生成一个聊天决策摘要 Mini App：自动汇总群聊过去 2 小时讨论，输出结论、待办、负责人和风险项，使用海报式卡片布局。",
    promptEn:
      "Build a chat decision digest mini app that summarizes the last 2 hours of a group thread into poster cards: decisions, owners, action items, and risk flags.",
  },
  {
    id: "follow-up",
    zhTitle: "未回复随访",
    enTitle: "Follow-up Radar",
    zhDesc: "标记已发送但对方超过 3 天未回复的对话，给出跟进建议。",
    enDesc: "Find important threads with no reply after 3+ days and propose follow-ups.",
    icon: "time-outline",
    promptZh:
      "生成一个未回复随访 Mini App：识别超过 3 天未回复的重要对话，输出优先级、建议话术和最佳跟进时间窗口，采用海报卡片展示。",
    promptEn:
      "Build a follow-up radar mini app that finds important conversations with no reply after 3+ days and renders poster cards with priority, suggested reply, and best follow-up window.",
  },
  {
    id: "words",
    zhTitle: "每日单词打卡",
    enTitle: "Word of the Day",
    zhDesc: "每日生成高阶词，美式发音、释义和例句，支持翻面学习。",
    enDesc: "Daily advanced word with pronunciation, definition, examples, and flip learning.",
    icon: "book-outline",
    promptZh: "生成一个每日单词打卡 Mini App：支持发音、释义、例句、同义反义词、记忆口诀和翻面小测题。",
    promptEn:
      "Build a word-of-the-day mini app with pronunciation, definition, example sentence, synonyms/antonyms, memory tip, and flip-to-reveal quiz.",
  },
];

function actionLabel(action: DockAction, language: AppLanguage) {
  return language === "zh" ? action.zh : action.en;
}

function promptForAction(action: DockAction, language: AppLanguage) {
  return language === "zh" ? action.promptZh : action.promptEn;
}

function exampleTitle(example: DockExample, language: AppLanguage) {
  return language === "zh" ? example.zhTitle : example.enTitle;
}

function exampleDesc(example: DockExample, language: AppLanguage) {
  return language === "zh" ? example.zhDesc : example.enDesc;
}

function examplePrompt(example: DockExample, language: AppLanguage) {
  return language === "zh" ? example.promptZh : example.promptEn;
}

function heroForApp(app: MiniApp | null) {
  const raw = (app?.preview as Record<string, unknown> | undefined)?.heroImage;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return "https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?auto=format&fit=crop&w=1200&q=60";
}

export function MiniAppDock() {
  const router = useRouter();
  const { language, miniAppGeneration, generateMiniApp, installMiniApp } = useAgentTown();
  const tr = (zh: string, en: string) => tx(language, zh, en);

  const [collapsed, setCollapsed] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<MiniApp | null>(null);

  const latestGenerated = useMemo(() => generated, [generated]);

  const openGenerator = (seedPrompt?: string) => {
    setPrompt(seedPrompt ?? prompt);
    setModalVisible(true);
  };

  const handleGenerate = async () => {
    const safe = prompt.trim();
    if (!safe || generating) return;
    setGenerating(true);
    const created = await generateMiniApp(safe, ["github"]);
    setGenerating(false);
    if (created) {
      setGenerated(created);
    }
  };

  const handleInstall = async () => {
    if (!latestGenerated) return;
    await installMiniApp(latestGenerated.id, true);
    setModalVisible(false);
  };

  const canInstall = !!latestGenerated && !latestGenerated.installed;

  return (
    <>
      <View style={styles.dockCard}>
        <View style={styles.dockTop}>
          <Pressable style={styles.sideBtn} onPress={() => openGenerator("")}>
            <Ionicons name="add" size={16} color="#e2e8f0" />
          </Pressable>

          <Pressable style={styles.centerBtn} onPress={() => openGenerator()}>
            <View style={styles.centerText}>
              <Text style={styles.centerTitle}>{tr("Create Mini App", "Create Mini App")}</Text>
              <Text style={styles.centerSub}>{tr("描述以生成", "Describe to generate")}</Text>
            </View>
            <View style={styles.centerArrow}>
              <Ionicons name="chevron-forward" size={16} color="rgba(226,232,240,0.9)" />
            </View>
          </Pressable>

          <Pressable style={styles.sideBtn} onPress={() => setCollapsed((v) => !v)}>
            <Ionicons name={collapsed ? "add" : "remove"} size={16} color="#e2e8f0" />
          </Pressable>
        </View>

        {!collapsed ? (
          <View style={styles.quickRow}>
            {QUICK_ACTIONS.map((action) => (
              <Pressable
                key={action.id}
                style={styles.quickItem}
                onPress={() => {
                  if (action.id === "tasks") {
                    router.push("/tasks");
                    return;
                  }
                  openGenerator(promptForAction(action, language));
                }}
              >
                <View style={[styles.quickIcon, { backgroundColor: `${action.color}2A`, borderColor: `${action.color}55` }]}>
                  <Ionicons name={action.icon} size={16} color={action.color} />
                </View>
                <Text style={styles.quickLabel}>{actionLabel(action, language)}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {miniAppGeneration.active ? (
          <View style={styles.progressWrap}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressTitle}>{tr("生成中", "Generating")}</Text>
              <Text style={styles.progressValue}>{Math.max(0, Math.min(100, miniAppGeneration.progress))}%</Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.max(0, Math.min(100, miniAppGeneration.progress))}%` }]} />
            </View>
            <Text style={styles.progressStage}>{miniAppGeneration.stage || tr("准备中...", "Preparing...")}</Text>
          </View>
        ) : null}
      </View>

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setModalVisible(false)}>
          <Pressable style={styles.modalCard} onPress={() => null}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <View style={styles.modalTitleIcon}>
                  <Ionicons name="sparkles-outline" size={14} color="#bfdbfe" />
                </View>
                <Text style={styles.modalTitle}>{tr("生成此 Mini App 的提示词", "Mini App Generator")}</Text>
              </View>
              <Pressable style={styles.closeBtn} onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={16} color="rgba(226,232,240,0.85)" />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
              <View style={styles.promptBox}>
                <Text style={styles.aiLabel}>{tr("AI 生成器", "AI GENERATOR")}</Text>
                <TextInput
                  value={prompt}
                  onChangeText={setPrompt}
                  placeholder={tr("描述你想生成的 Mini App...", "Describe the mini app you want...")}
                  placeholderTextColor="rgba(148,163,184,0.85)"
                  multiline
                  style={styles.promptInput}
                autoComplete="off"
                textContentType="oneTimeCode"
                importantForAutofill="no"
                />
                <Pressable
                  style={[styles.fab, (!prompt.trim() || generating) && styles.fabDisabled]}
                  onPress={handleGenerate}
                >
                  <Ionicons name="arrow-up" size={18} color="#0b1220" />
                </Pressable>
              </View>

              {canInstall && latestGenerated ? (
                <View style={styles.readyRow}>
                  <View style={styles.readyLeft}>
                    <Ionicons name="checkmark-circle-outline" size={16} color="#86efac" />
                    <Text style={styles.readyText}>{tr("准备安装", "READY TO INSTALL")}</Text>
                  </View>
                  <Pressable
                    style={styles.readyGhost}
                    onPress={() => {
                      setGenerated(null);
                      setPrompt("");
                    }}
                  >
                    <Text style={styles.readyGhostText}>{tr("丢弃", "Discard")}</Text>
                  </Pressable>
                  <Pressable style={styles.readyCta} onPress={handleInstall}>
                    <Ionicons name="add-circle-outline" size={16} color="#0b1220" />
                    <Text style={styles.readyCtaText}>{tr("Add App", "Add App")}</Text>
                  </Pressable>
                </View>
              ) : null}

              {latestGenerated ? (
                <View style={styles.previewCard}>
                  <Image source={{ uri: heroForApp(latestGenerated) }} style={styles.previewHero} />
                  <View style={styles.previewBody}>
                    <View style={styles.previewTagRow}>
                      <View style={styles.previewTag}>
                        <Text style={styles.previewTagText}>
                          {(latestGenerated.category || "MiniApp").toUpperCase()}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.previewTitle} numberOfLines={1}>{latestGenerated.name}</Text>
                    <Text style={styles.previewDesc} numberOfLines={3}>{latestGenerated.summary}</Text>
                  </View>
                </View>
              ) : null}

              <Text style={styles.exampleHeading}>{tr("TRY THESE EXAMPLES", "TRY THESE EXAMPLES")}</Text>
              <View style={styles.exampleGrid}>
                {EXAMPLES.map((example) => (
                  <Pressable
                    key={example.id}
                    style={styles.exampleCard}
                    onPress={() => {
                      setPrompt(examplePrompt(example, language));
                    }}
                  >
                    <View style={styles.exampleIcon}>
                      <Ionicons name={example.icon} size={16} color="#e2e8f0" />
                    </View>
                    <Text style={styles.exampleTitle}>{exampleTitle(example, language)}</Text>
                    <Text style={styles.exampleDesc} numberOfLines={2}>
                      {exampleDesc(example, language)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  dockCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(15,23,42,0.48)",
    padding: 12,
    gap: 12,
  },
  dockTop: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  sideBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  centerBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  centerText: {
    gap: 2,
  },
  centerTitle: {
    color: "#e2e8f0",
    fontSize: 14,
    fontWeight: "900",
  },
  centerSub: {
    color: "rgba(148,163,184,0.95)",
    fontSize: 11,
  },
  centerArrow: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  quickRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  quickItem: {
    flex: 1,
    alignItems: "center",
    gap: 6,
  },
  quickIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  quickLabel: {
    color: "rgba(226,232,240,0.86)",
    fontSize: 11,
    fontWeight: "800",
  },
  progressWrap: {
    gap: 8,
    paddingTop: 4,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressTitle: {
    color: "rgba(226,232,240,0.86)",
    fontSize: 11,
    fontWeight: "800",
  },
  progressValue: {
    color: "rgba(226,232,240,0.7)",
    fontSize: 11,
    fontWeight: "800",
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "rgba(59,130,246,0.55)",
  },
  progressStage: {
    color: "rgba(148,163,184,0.95)",
    fontSize: 11,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 14,
    paddingVertical: 18,
    justifyContent: "center",
  },
  modalCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(15,23,42,0.92)",
    overflow: "hidden",
    maxHeight: "92%",
  },
  modalHeader: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  modalTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  modalTitleIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(59,130,246,0.18)",
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.24)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalTitle: {
    color: "#e2e8f0",
    fontSize: 14,
    fontWeight: "900",
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  modalContent: {
    padding: 14,
    gap: 14,
  },
  promptBox: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)",
    padding: 12,
    gap: 10,
  },
  aiLabel: {
    color: "rgba(147,197,253,0.95)",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
  },
  promptInput: {
    minHeight: 110,
    color: "#e2e8f0",
    fontSize: 13,
    lineHeight: 18,
    paddingRight: 44,
  },
  fab: {
    position: "absolute",
    right: 12,
    top: 48,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
  },
  fabDisabled: {
    opacity: 0.55,
  },
  readyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  readyLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  readyText: {
    color: "rgba(226,232,240,0.92)",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
  },
  readyGhost: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  readyGhostText: {
    color: "rgba(226,232,240,0.78)",
    fontSize: 12,
    fontWeight: "800",
  },
  readyCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "#e2e8f0",
  },
  readyCtaText: {
    color: "#0b1220",
    fontSize: 12,
    fontWeight: "900",
  },
  previewCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  previewHero: {
    width: "100%",
    height: 128,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  previewBody: {
    padding: 12,
    gap: 8,
  },
  previewTagRow: {
    flexDirection: "row",
  },
  previewTag: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(59,130,246,0.16)",
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.22)",
  },
  previewTagText: {
    color: "rgba(226,232,240,0.92)",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },
  previewTitle: {
    color: "#e2e8f0",
    fontSize: 18,
    fontWeight: "900",
  },
  previewDesc: {
    color: "rgba(203,213,225,0.78)",
    fontSize: 12,
    lineHeight: 16,
  },
  exampleHeading: {
    color: "rgba(148,163,184,0.92)",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
  },
  exampleGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  exampleCard: {
    width: "48%",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.05)",
    padding: 12,
    gap: 8,
  },
  exampleIcon: {
    width: 34,
    height: 34,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  exampleTitle: {
    color: "#e2e8f0",
    fontSize: 13,
    fontWeight: "900",
  },
  exampleDesc: {
    color: "rgba(203,213,225,0.72)",
    fontSize: 11,
    lineHeight: 15,
  },
});
