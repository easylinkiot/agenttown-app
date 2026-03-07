import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import * as QRCode from "qrcode";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SvgXml } from "react-native-svg";

import { AVATAR_PRESETS } from "@/src/constants/avatars";
import { MARKET_DATA } from "@/src/constants/marketplace";
import { APP_SAFE_AREA_EDGES } from "@/src/constants/safe-area";
import { tx } from "@/src/i18n/translate";
import { buildFriendQrDeepLink, createFriendQR, uploadFileV2 } from "@/src/lib/api";
import { generateGeminiJson } from "@/src/lib/gemini";
import { useAgentTown } from "@/src/state/agenttown-context";
import { useAuth } from "@/src/state/auth-context";
import { BotConfig, MarketItem } from "@/src/types";

interface SkillForm {
  name: string;
  description: string;
  trigger: string;
  logic: string;
  requiredParams: string;
  optionalParams: string;
  constraints: string;
  example: string;
}

const emptySkillForm: SkillForm = {
  name: "",
  description: "",
  trigger: "",
  logic: "",
  requiredParams: "",
  optionalParams: "",
  constraints: "",
  example: "",
};

interface RuntimeSkillItem {
  id: string;
  name: string;
  description: string;
  version: string;
  permissionScope: string;
  source: "catalog" | "custom";
}

const NEO_CATEGORY_COLORS = ["#3b82f6", "#8b5cf6", "#6366f1", "#ec4899"];
const NEO_CATEGORY_ICONS: (keyof typeof Ionicons.glyphMap)[] = [
  "code-slash-outline",
  "albums-outline",
  "people-outline",
  "megaphone-outline",
];

const MARKET_CATEGORY_I18N: Record<
  string,
  { title: { zh: string; en: string }; subtitle: { zh: string; en: string } }
> = {
  eng: {
    title: { zh: "工程师类", en: "Engineering" },
    subtitle: { zh: "AI 代理与本地模型库", en: "AI agents and local model libraries" },
  },
  pm: {
    title: { zh: "产品经理类", en: "Product Management" },
    subtitle: { zh: "提示词模板与执行框架", en: "Prompt templates and execution frameworks" },
  },
  mgmt: {
    title: { zh: "管理层类", en: "Leadership" },
    subtitle: { zh: "资源中心与人机协作", en: "Resource hub and human-AI collaboration" },
  },
  mkt: {
    title: { zh: "市场与销售类", en: "Marketing & Sales" },
    subtitle: { zh: "多模态工具与自动化营销", en: "Multimodal tools and automated marketing" },
  },
};

const MARKET_ITEM_I18N: Record<
  string,
  { description: { zh: string; en: string }; fullDetail: { zh: string; en: string } }
> = {
  "anthropic-skills": {
    description: { zh: "官方开源技能规范，支持 MCP 工具链。", en: "Official open-source skills spec with MCP toolchain support." },
    fullDetail: { zh: "已集成 MCP 能力：文件系统操作、命令执行与屏幕交互工具。", en: "Integrated MCP capabilities: file operations, command execution, and screen interaction tools." },
  },
  "langgraph-agents": {
    description: { zh: "基于 LangGraph 的专业 Agent 集合。", en: "A professional collection of agents built with LangGraph." },
    fullDetail: { zh: "已安装 LangGraph Agent 模板，可执行 GitHub 与市场调研任务。", en: "Includes LangGraph agent templates for GitHub and market research workflows." },
  },
  "claude-skills": {
    description: { zh: "87+ CLI 工具：Sprint 计划、Jira 自动化、PRD 生成。", en: "87+ CLI tools for sprint planning, Jira automation, and PRD generation." },
    fullDetail: { zh: "已集成 PM 生产力套件：Sprint/Jira/PRD 自动化模板。", en: "Includes PM productivity kit templates for Sprint, Jira, and PRD automation." },
  },
  "pm-resources": {
    description: { zh: "AI 策略框架、数据分析路径和课程清单。", en: "AI strategy frameworks, data analysis paths, and learning resources." },
    fullDetail: { zh: "已接入 PM 知识库：策略框架、数据分析与认证路线。", en: "Connected PM knowledge base covering strategy, analytics, and certification tracks." },
  },
  "eng-manager": {
    description: { zh: "团队建设、冲突解决、技术领导力资料库。", en: "A library for team building, conflict resolution, and technical leadership." },
    fullDetail: { zh: "已安装工程管理知识模块，可用于团队协作建议。", en: "Includes engineering management modules for collaboration guidance." },
  },
  "500-agents": {
    description: { zh: "500 个行业 AI Agent 落地案例。", en: "500 industry AI agent implementation cases." },
    fullDetail: { zh: "已集成行业落地案例库，覆盖金融、医疗、电商等场景。", en: "Includes an implementation case library across finance, healthcare, e-commerce, and more." },
  },
  antigravity: {
    description: { zh: "230+ 自动化运营和营销技能。", en: "230+ automation skills for operations and marketing." },
    fullDetail: { zh: "已安装营销工具包：社媒发布、市场调研和线索生成。", en: "Includes a marketing toolkit for social posting, market research, and lead generation." },
  },
  synthesia: {
    description: { zh: "视频脚本、个性化邮件营销工具指南。", en: "Guides for video scripting and personalized email marketing tools." },
    fullDetail: { zh: "已集成多模态营销助手：视频脚本、邮件个性化和素材建议。", en: "Includes a multimodal marketing assistant for video scripts, email personalization, and asset suggestions." },
  },
};

async function buildFriendQrSvg(shareLink: string) {
  if (!shareLink) return "";
  return QRCode.toString(shareLink, {
    type: "svg",
    margin: 1,
    width: 280,
    color: {
      dark: "#0f172a",
      light: "#ffffff",
    },
  });
}

function inferImageMimeType(fileName?: string | null, fallbackMimeType?: string | null) {
  const safeFallback = (fallbackMimeType || "").trim();
  if (safeFallback) return safeFallback;

  const lowerName = (fileName || "").trim().toLowerCase();
  if (lowerName.endsWith(".png")) return "image/png";
  if (lowerName.endsWith(".webp")) return "image/webp";
  if (lowerName.endsWith(".gif")) return "image/gif";
  if (lowerName.endsWith(".heic")) return "image/heic";
  if (lowerName.endsWith(".heif")) return "image/heif";
  return "image/jpeg";
}

export default function ConfigScreen() {
  const router = useRouter();
  const {
    botConfig,
    updateBotConfig,
    toggleBotSkill,
    skillCatalog,
    customSkills,
    uiTheme,
    updateUiTheme,
    language,
    updateLanguage,
  } = useAgentTown();
  const { user, signOut, completeProfile } = useAuth();
  const tr = (zh: string, en: string) => tx(language, zh, en);
  const isNeo = uiTheme === "neo";

  const [name, setName] = useState(botConfig.name);
  const [avatar, setAvatar] = useState(botConfig.avatar);
  const [instruction, setInstruction] = useState(botConfig.systemInstruction);
  const [documents, setDocuments] = useState<string[]>(botConfig.documents || []);
  const [knowledgeKeywords, setKnowledgeKeywords] = useState<string[]>(
    botConfig.knowledgeKeywords || []
  );
  const [installedSkillIds, setInstalledSkillIds] = useState<Set<string>>(
    new Set(botConfig.installedSkillIds || [])
  );
  const [skillForm, setSkillForm] = useState<SkillForm>(emptySkillForm);
  const [isUploading, setIsUploading] = useState(false);
  const [installingSkillId, setInstallingSkillId] = useState<string | null>(null);
  const [viewingSkill, setViewingSkill] = useState<MarketItem | null>(null);
  const [profileName, setProfileName] = useState(user?.displayName || "");
  const [profileEmail, setProfileEmail] = useState(user?.email || "");
  const [profileAvatarInput, setProfileAvatarInput] = useState(user?.avatar || "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingProfileAvatar, setUploadingProfileAvatar] = useState(false);
  const [myQrToken, setMyQrToken] = useState("");
  const [myQrExpiresAt, setMyQrExpiresAt] = useState("");
  const [generatingMyQr, setGeneratingMyQr] = useState(false);
  const [friendQrSvg, setFriendQrSvg] = useState("");

  const profileAvatar = profileAvatarInput.trim() || user?.avatar || botConfig.avatar || AVATAR_PRESETS[0];
  const profileProvider = user?.provider || "unknown";
  const profilePhone = user?.phone || tr("未绑定手机号", "No phone linked");

  useEffect(() => {
    setProfileName(user?.displayName || "");
    setProfileEmail(user?.email || "");
    setProfileAvatarInput(user?.avatar || "");
  }, [user?.avatar, user?.displayName, user?.email, user?.id]);

  useEffect(() => {
    setName(botConfig.name);
    setAvatar(botConfig.avatar);
    setInstruction(botConfig.systemInstruction);
    setDocuments(botConfig.documents || []);
    setKnowledgeKeywords(botConfig.knowledgeKeywords || []);
    setInstalledSkillIds(new Set(botConfig.installedSkillIds || []));
  }, [botConfig]);

  const runtimeSkills = useMemo<RuntimeSkillItem[]>(() => {
    const builtins = skillCatalog.map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      version: item.version,
      permissionScope: item.permissionScope,
      source: "catalog" as const,
    }));
    const customs = customSkills
      .filter((item) => item.enabled)
      .map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description || tr("自定义技能", "Custom skill"),
        version: item.version,
        permissionScope: item.permissionScope,
        source: "custom" as const,
      }));

    const seen = new Set<string>();
    const merged: RuntimeSkillItem[] = [];
    for (const item of [...builtins, ...customs]) {
      if (!item.id || seen.has(item.id)) continue;
      seen.add(item.id);
      merged.push(item);
    }
    return merged;
  }, [customSkills, skillCatalog, tr]);

  const runtimeSkillMap = useMemo(() => {
    const map = new Map<string, RuntimeSkillItem>();
    for (const item of runtimeSkills) {
      map.set(item.id, item);
    }
    return map;
  }, [runtimeSkills]);

  const localizedMarketData = useMemo(
    () =>
      MARKET_DATA.map((category) => {
        const categoryI18n = MARKET_CATEGORY_I18N[category.id];
        return {
          ...category,
          title: categoryI18n
            ? tx(language, categoryI18n.title.zh, categoryI18n.title.en)
            : category.title,
          subtitle: categoryI18n
            ? tx(language, categoryI18n.subtitle.zh, categoryI18n.subtitle.en)
            : category.subtitle,
          items: category.items.map((item) => {
            const itemI18n = MARKET_ITEM_I18N[item.id];
            if (!itemI18n) return item;
            return {
              ...item,
              description: tx(
                language,
                itemI18n.description.zh,
                itemI18n.description.en
              ),
              fullDetail: tx(
                language,
                itemI18n.fullDetail.zh,
                itemI18n.fullDetail.en
              ),
            };
          }),
        };
      }),
    [language]
  );

  const installedSkills = useMemo(() => {
    const out: RuntimeSkillItem[] = [];
    for (const id of installedSkillIds) {
      const found = runtimeSkillMap.get(id);
      if (found) out.push(found);
    }
    return out;
  }, [installedSkillIds, runtimeSkillMap]);

  const randomizeAvatar = () => {
    const next = AVATAR_PRESETS[Math.floor(Math.random() * AVATAR_PRESETS.length)];
    setAvatar(next);
  };

  const randomizeProfileAvatar = () => {
    const next = AVATAR_PRESETS[Math.floor(Math.random() * AVATAR_PRESETS.length)];
    setProfileAvatarInput(next);
  };

  const handlePickProfileAvatar = async () => {
    if (uploadingProfileAvatar || savingProfile) return;
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          tr("需要相册权限", "Media library permission required"),
          tr("请允许访问相册后再选择头像。", "Allow photo-library access before choosing an avatar.")
        );
        return;
      }

      const picker = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
        selectionLimit: 1,
      });
      if (picker.canceled || picker.assets.length === 0) return;

      const asset = picker.assets[0];
      setUploadingProfileAvatar(true);
      const uploaded = await uploadFileV2({
        uri: asset.uri,
        name: asset.fileName || `profile-avatar-${Date.now()}.jpg`,
        mimeType: inferImageMimeType(asset.fileName, asset.mimeType),
      });
      const nextUrl = (uploaded.url || "").trim();
      if (!nextUrl) {
        throw new Error(tr("头像上传成功，但未返回可用地址。", "Avatar uploaded but no usable URL was returned."));
      }
      setProfileAvatarInput(nextUrl);
      Alert.alert(
        tr("头像已上传", "Avatar uploaded"),
        tr("点击“保存资料”后将更新你的个人头像。", "Tap Save Profile to apply the new avatar.")
      );
    } catch (err) {
      Alert.alert(
        tr("头像上传失败", "Avatar upload failed"),
        err instanceof Error ? err.message : tr("请稍后重试", "Please try again")
      );
    } finally {
      setUploadingProfileAvatar(false);
    }
  };

  const save = () => {
    const next: BotConfig = {
      name,
      avatar,
      systemInstruction: instruction,
      documents,
      installedSkillIds: Array.from(installedSkillIds),
      knowledgeKeywords,
    };
    updateBotConfig(next);
    router.back();
  };

  const handleSignOut = async () => {
    await signOut();
    router.replace("/sign-in");
  };

  const handleSaveProfile = async () => {
    const nextName = profileName.trim();
    const nextEmail = profileEmail.trim();
    const nextAvatar = profileAvatarInput.trim();
    if (!nextName) {
      Alert.alert(tr("信息不完整", "Incomplete Profile"), tr("请输入用户名。", "Please enter a username."));
      return;
    }
    if (!nextEmail || !nextEmail.includes("@")) {
      Alert.alert(
        tr("信息不完整", "Incomplete Profile"),
        tr("请输入有效邮箱地址。", "Please enter a valid email address.")
      );
      return;
    }

    setSavingProfile(true);
    try {
      await completeProfile({ displayName: nextName, email: nextEmail, avatar: nextAvatar || undefined });
      Alert.alert(tr("已更新", "Updated"), tr("账号信息已保存。", "Account profile saved."));
    } catch (err) {
      Alert.alert(
        tr("更新失败", "Update failed"),
        err instanceof Error ? err.message : tr("请稍后重试", "Please try again")
      );
    } finally {
      setSavingProfile(false);
    }
  };

  const handleGenerateMyQr = async () => {
    if (generatingMyQr) return;
    setGeneratingMyQr(true);
    try {
      const result = await createFriendQR();
      setMyQrToken(result.token || "");
      setMyQrExpiresAt(result.expiresAt || "");
      Alert.alert(tr("二维码已生成", "QR generated"), tr("可复制或分享给好友添加你。", "You can copy or share it with friends."));
    } catch (err) {
      Alert.alert(
        tr("生成失败", "Generation failed"),
        err instanceof Error ? err.message : tr("请稍后重试", "Please try again later")
      );
    } finally {
      setGeneratingMyQr(false);
    }
  };

  const friendQrDeepLink = useMemo(() => buildFriendQrDeepLink(myQrToken), [myQrToken]);

  useEffect(() => {
    let active = true;
    if (!friendQrDeepLink) {
      setFriendQrSvg("");
      return () => {
        active = false;
      };
    }
    void buildFriendQrSvg(friendQrDeepLink)
      .then((svg) => {
        if (active) {
          setFriendQrSvg(svg);
        }
      })
      .catch(() => {
        if (active) {
          setFriendQrSvg("");
        }
      });
    return () => {
      active = false;
    };
  }, [friendQrDeepLink]);

  const handleShareMyQr = async () => {
    if (!myQrToken) {
      Alert.alert(tr("请先生成二维码", "Generate QR first"), tr("先点击“我的二维码”生成分享内容。", "Tap My QR first."));
      return;
    }
    const content = [
      tr("AgentTown 好友二维码", "AgentTown Friend QR"),
      friendQrDeepLink || myQrToken,
      `${tr("备用原始码", "Fallback token")}: ${myQrToken}`,
      `${tr("有效期", "Expires")}: ${myQrExpiresAt || "-"}`,
    ].join("\n");
    try {
      await Share.share({ message: content });
    } catch (err) {
      Alert.alert(
        tr("分享失败", "Share failed"),
        err instanceof Error ? err.message : tr("请稍后重试", "Please try again later")
      );
    }
  };

  const uploadKnowledge = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        multiple: false,
        copyToCacheDirectory: true,
        type: ["text/plain", "application/json", "text/markdown", "text/csv"],
      });

      if (result.canceled) return;
      const asset = result.assets[0];

      setIsUploading(true);
      const text = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      const fallback = {
        knowledgeSummary: `Processed ${asset.name}`,
        keywords: ["Knowledge", "Document"],
      };

      const extracted = await generateGeminiJson<{ knowledgeSummary: string; keywords: string[] }>(
        `Analyze this uploaded knowledge document and return JSON object with keys knowledgeSummary and keywords (3-5 short tags).\nDocument name: ${asset.name}\n\nContent:\n${text.slice(
          0,
          12000
        )}`,
        fallback
      );

      const summary = extracted.knowledgeSummary || fallback.knowledgeSummary;
      const tags = Array.isArray(extracted.keywords) ? extracted.keywords : fallback.keywords;

      setInstruction((prev) => `${prev}\n\n### Learned Knowledge [${asset.name}]\n${summary}`);
      setDocuments((prev) => [...prev, asset.name]);
      setKnowledgeKeywords((prev) => Array.from(new Set([...prev, ...tags])));
    } catch {
      Alert.alert(tr("上传失败", "Upload failed"), tr("无法处理该文档。", "Unable to process this document."));
    } finally {
      setIsUploading(false);
    }
  };

  const appendCustomSkill = () => {
    const block = `\n\n### Defined Skill: ${skillForm.name || "Untitled_Skill"}
- Description: ${skillForm.description}
- Trigger: ${skillForm.trigger}
- Core Logic: ${skillForm.logic}
- Parameters: required(${skillForm.requiredParams}) optional(${skillForm.optionalParams})
- Constraints: ${skillForm.constraints}
- Example: ${skillForm.example}`;

    setInstruction((prev) => `${prev}${block}`);
    setSkillForm(emptySkillForm);
  };

  const installSkill = async (item: MarketItem) => {
    setViewingSkill(item);
  };

  const toggleRuntimeSkill = async (skillId: string, install: boolean) => {
    setInstallingSkillId(skillId);
    setInstalledSkillIds((prev) => {
      const next = new Set(prev);
      if (install) {
        next.add(skillId);
      } else {
        next.delete(skillId);
      }
      return next;
    });
    try {
      await toggleBotSkill(skillId, install);
    } finally {
      setInstallingSkillId(null);
    }
  };

  if (isNeo) {
    return (
      <SafeAreaView edges={APP_SAFE_AREA_EDGES} style={[styles.safeArea, styles.safeAreaNeo]}>
        <View style={[styles.header, styles.headerNeo]}>
          <Pressable style={[styles.headerBtn, styles.headerBtnNeo]} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={22} color="#e2e8f0" />
          </Pressable>
          <Text style={[styles.headerTitle, styles.headerTitleNeo]}>
            {tr("设置", "Settings")}
          </Text>
          <View style={styles.neoHeaderActions}>
            <Pressable style={[styles.headerBtn, styles.headerBtnNeo]} onPress={save}>
              <Ionicons name="document-text-outline" size={18} color="#93c5fd" />
            </Pressable>
            <Pressable style={[styles.headerBtn, styles.headerBtnNeo]} onPress={appendCustomSkill}>
              <Ionicons name="extension-puzzle-outline" size={18} color="#e2e8f0" />
            </Pressable>
          </View>
        </View>

        <KeyboardAvoidingView
          style={styles.keyboardAvoid}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
        >
          <ScrollView
            style={[styles.scroll, styles.scrollNeo]}
            contentContainerStyle={[styles.scrollContent, styles.scrollContentNeo]}
            keyboardShouldPersistTaps="handled"
          >
          <View style={styles.neoAccountCard}>
            <View style={styles.neoAccountHead}>
              <View style={styles.neoAccountAvatarWrap}>
                <Image source={{ uri: profileAvatar }} style={styles.neoAccountAvatar} />
              </View>
              <View style={styles.neoAccountBody}>
                <Text style={styles.neoIdentityLabel}>{tr("MY PROFILE", "MY PROFILE")}</Text>
                <Text style={styles.neoAccountName} numberOfLines={1}>
                  {user?.displayName || tr("未命名用户", "Unnamed User")}
                </Text>
                <Text style={styles.neoAccountMeta} numberOfLines={1}>
                  {profileProvider} · {profilePhone}
                </Text>
              </View>
            </View>
            <TextInput
              style={styles.neoAccountField}
              value={profileName}
              onChangeText={setProfileName}
              placeholder={tr("用户名", "Username")}
              placeholderTextColor="rgba(148,163,184,0.85)"
            autoComplete="off"
            textContentType="oneTimeCode"
            importantForAutofill="no"
            />
            <TextInput
              style={styles.neoAccountField}
              value={profileEmail}
              onChangeText={setProfileEmail}
              placeholder={tr("电子邮件", "Email")}
              placeholderTextColor="rgba(148,163,184,0.85)"
              keyboardType="email-address"
              autoCapitalize="none"
            autoComplete="off"
            textContentType="oneTimeCode"
            importantForAutofill="no"
            />
            <TextInput
              style={styles.neoAccountField}
              value={profileAvatarInput}
              onChangeText={setProfileAvatarInput}
              placeholder={tr("头像地址", "Avatar URL")}
              placeholderTextColor="rgba(148,163,184,0.85)"
              autoCapitalize="none"
              autoComplete="off"
              textContentType="oneTimeCode"
              importantForAutofill="no"
            />
            <Pressable style={styles.neoAvatarPresetBtn} onPress={randomizeProfileAvatar}>
              <Ionicons name="images-outline" size={14} color="#dbeafe" />
              <Text style={styles.neoAvatarPresetBtnText}>{tr("随机头像", "Random Avatar")}</Text>
            </Pressable>
            <View style={styles.neoReadonlyRow}>
              <Ionicons name="call-outline" size={14} color="rgba(148,163,184,0.9)" />
              <Text style={styles.neoReadonlyText}>{profilePhone}</Text>
            </View>
            <Pressable
              style={[styles.neoProfileSaveBtn, savingProfile && styles.neoProfileSaveBtnDisabled]}
              onPress={handleSaveProfile}
              disabled={savingProfile}
            >
              {savingProfile ? (
                <ActivityIndicator size="small" color="#111827" />
              ) : (
                <Ionicons name="save-outline" size={16} color="#111827" />
              )}
              <Text style={styles.neoProfileSaveBtnText}>{tr("保存资料", "Save Profile")}</Text>
            </Pressable>
            <View style={styles.friendQrActionsRow}>
              <Pressable
                style={[styles.friendQrBtn, styles.friendQrBtnPrimary]}
                onPress={handleGenerateMyQr}
                disabled={generatingMyQr}
              >
                {generatingMyQr ? (
                  <ActivityIndicator size="small" color="#0b1220" />
                ) : (
                  <Ionicons name="qr-code-outline" size={15} color="#0b1220" />
                )}
                <Text style={[styles.friendQrBtnText, styles.friendQrBtnTextPrimary]}>
                  {tr("我的二维码", "My QR")}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.friendQrBtn, !myQrToken && styles.friendQrBtnDisabled]}
                onPress={handleShareMyQr}
                disabled={!myQrToken}
              >
                <Ionicons name="share-social-outline" size={15} color="#dbeafe" />
                <Text style={styles.friendQrBtnText}>{tr("分享", "Share")}</Text>
              </Pressable>
            </View>
            {myQrToken ? (
              <View style={[styles.friendQrTokenCard, isNeo && styles.friendQrTokenCardNeo]}>
                {friendQrSvg ? <SvgXml xml={friendQrSvg} width={168} height={168} style={styles.friendQrImage} /> : null}
                <Text style={[styles.friendQrTokenTitle, isNeo && styles.friendQrTokenTitleNeo]}>
                  {tr("好友二维码", "Friend QR")}
                </Text>
                <Text style={[styles.friendQrTokenHint, isNeo && styles.friendQrTokenHintNeo]}>
                  {tr("有效期至：", "Expires at: ")}
                  {myQrExpiresAt || "-"}
                </Text>
                <Text selectable style={[styles.friendQrTokenValue, isNeo && styles.friendQrTokenValueNeo]}>
                  {myQrToken}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.neoIdentityCard}>
            <View style={styles.neoIdentityAvatarWrap}>
              <Image source={{ uri: avatar }} style={styles.avatar} />
              <Pressable style={styles.neoAvatarShuffle} onPress={randomizeAvatar}>
                <Ionicons name="shuffle-outline" size={12} color="#e2e8f0" />
              </Pressable>
            </View>
            <View style={styles.neoIdentityBody}>
              <Text style={styles.neoIdentityLabel}>{tr("BOT IDENTITY", "BOT IDENTITY")}</Text>
              <TextInput
                style={styles.neoNameInput}
                value={name}
                onChangeText={setName}
                placeholder={tr("我的 Bot", "MyBot")}
                placeholderTextColor="rgba(148,163,184,0.9)"
              autoComplete="off"
              textContentType="oneTimeCode"
              importantForAutofill="no"
              />
            </View>
          </View>

          <View style={styles.neoQuickRow}>
            <Pressable style={styles.neoQuickCard} onPress={uploadKnowledge} disabled={isUploading}>
              <View style={styles.neoQuickIconWrap}>
                {isUploading ? (
                  <ActivityIndicator size="small" color="#c4b5fd" />
                ) : (
                  <Ionicons name="cloud-upload-outline" size={20} color="#c4b5fd" />
                )}
              </View>
              <Text style={styles.neoQuickTitle}>{tr("Upload Knowledge", "Upload Knowledge")}</Text>
              <Text style={styles.neoQuickSub}>
                {tr(
                  `${documents.length > 0 ? documents.length : 0} docs`,
                  `${documents.length > 0 ? documents.length : 0} docs`
                )}
              </Text>
            </Pressable>

            <View style={[styles.neoQuickCard, styles.neoQuickSkillCard]}>
              <View style={styles.neoQuickIconWrap}>
                <Ionicons name="construct-outline" size={18} color="#22c55e" />
              </View>
              <Text style={styles.neoQuickTag}>{tr("SKILLS", "SKILLS")}</Text>
              <Text style={styles.neoQuickSkillTitle}>{tr("Define New Skill", "Define New Skill")}</Text>
              <Text style={styles.neoQuickSub}>{tr("Triggers & Logic", "Triggers & Logic")}</Text>
              <Pressable style={styles.neoQuickAddBtn} onPress={appendCustomSkill}>
                <Ionicons name="add" size={20} color="white" />
              </Pressable>
            </View>
          </View>

          <View style={styles.neoStoreCard}>
            <View style={styles.neoStoreHeader}>
              <View>
                <Text style={styles.neoStoreTitle}>{tr("Skill Store", "Skill Store")}</Text>
                <Text style={styles.neoStoreSub}>
                  {tr("Install open-source agent capabilities", "Install open-source agent capabilities")}
                </Text>
              </View>
              <Pressable style={styles.neoStoreBtn}>
                <Ionicons name="download-outline" size={14} color="#93c5fd" />
                <Text style={styles.neoStoreBtnText}>{tr("Store", "Store")}</Text>
              </Pressable>
            </View>

            <View style={styles.neoStoreList}>
              {runtimeSkills.length === 0 ? (
                <Text style={styles.neoStoreItemSub}>{tr("暂无可安装技能", "No skills available")}</Text>
              ) : (
                runtimeSkills.map((skill, index) => {
                  const installed = installedSkillIds.has(skill.id);
                  const installing = installingSkillId === skill.id;
                  return (
                    <View key={skill.id} style={styles.neoStoreItem}>
                      <View
                        style={[
                          styles.neoStoreIconWrap,
                          { backgroundColor: NEO_CATEGORY_COLORS[index % NEO_CATEGORY_COLORS.length] },
                        ]}
                      >
                        <Ionicons
                          name={NEO_CATEGORY_ICONS[index % NEO_CATEGORY_ICONS.length]}
                          size={18}
                          color="white"
                        />
                      </View>
                      <View style={styles.neoStoreItemBody}>
                        <Text style={styles.neoStoreItemTitle}>{skill.name}</Text>
                        <Text style={styles.neoStoreItemSub} numberOfLines={1}>
                          {skill.permissionScope || skill.description}
                        </Text>
                      </View>
                      <Pressable
                        style={styles.installBtn}
                        disabled={installing}
                        onPress={() => void toggleRuntimeSkill(skill.id, !installed)}
                      >
                        <Text style={styles.installBtnText}>
                          {installing
                            ? tr("处理中...", "Working...")
                            : installed
                              ? tr("移除", "Remove")
                              : tr("安装", "Install")}
                        </Text>
                      </Pressable>
                    </View>
                  );
                })
              )}
            </View>
          </View>

          <View style={[styles.card, styles.cardNeo]}>
            <Text style={[styles.cardTitle, styles.cardTitleNeo]}>{tr("Theme", "Theme")}</Text>
            <View style={styles.themeRow}>
              <Pressable
                style={[
                  styles.themeBtn,
                  styles.themeBtnNeoBase,
                ]}
                onPress={() => updateUiTheme("classic")}
              >
                <Ionicons
                  name="sunny-outline"
                  size={16}
                  color="rgba(226,232,240,0.85)"
                />
                <Text
                  style={[
                    styles.themeBtnText,
                    styles.themeBtnTextNeo,
                  ]}
                >
                  {tr("Classic", "Classic")}
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.themeBtn,
                  styles.themeBtnNeoBase,
                  styles.themeBtnActiveNeo,
                ]}
                onPress={() => updateUiTheme("neo")}
              >
                <Ionicons
                  name="moon-outline"
                  size={16}
                  color="white"
                />
                <Text
                  style={[
                    styles.themeBtnText,
                    styles.themeBtnTextNeo,
                    styles.themeBtnTextActive,
                  ]}
                >
                  {tr("Neo", "Neo")}
                </Text>
              </Pressable>
            </View>

            <Text style={[styles.cardTitle, styles.cardTitleNeo]}>{tr("Language", "Language")}</Text>
            <View style={styles.themeRow}>
              <Pressable
                style={[
                  styles.themeBtn,
                  styles.themeBtnNeoBase,
                  language === "zh" && styles.themeBtnActive,
                ]}
                onPress={() => updateLanguage("zh")}
              >
                <Ionicons
                  name="language-outline"
                  size={16}
                  color={language === "zh" ? "white" : "rgba(226,232,240,0.85)"}
                />
                <Text
                  style={[
                    styles.themeBtnText,
                    styles.themeBtnTextNeo,
                    language === "zh" && styles.themeBtnTextActive,
                  ]}
                >
                  {tr("中文", "Chinese")}
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.themeBtn,
                  styles.themeBtnNeoBase,
                  language === "en" && styles.themeBtnActiveNeo,
                ]}
                onPress={() => updateLanguage("en")}
              >
                <Ionicons
                  name="language-outline"
                  size={16}
                  color={language === "en" ? "white" : "rgba(226,232,240,0.85)"}
                />
                <Text
                  style={[
                    styles.themeBtnText,
                    styles.themeBtnTextNeo,
                    language === "en" && styles.themeBtnTextActive,
                  ]}
                >
                  {tr("英文", "English")}
                </Text>
              </Pressable>
            </View>
          </View>

          {viewingSkill ? (
            <View style={[styles.card, styles.cardNeo]}>
              <View style={styles.modalHeaderRow}>
                <Text style={[styles.cardTitle, styles.cardTitleNeo]}>
                  {tr("Skill Inspector", "Skill Inspector")} · {viewingSkill.name}
                </Text>
                <Pressable onPress={() => setViewingSkill(null)}>
                  <Ionicons name="close" size={20} color="rgba(226,232,240,0.8)" />
                </Pressable>
              </View>
              <Text style={[styles.marketItemDesc, styles.marketItemDescNeo]}>
                {viewingSkill.description}
              </Text>
            </View>
          ) : null}

          <View style={[styles.card, styles.cardNeo]}>
            <Text style={[styles.cardTitle, styles.cardTitleNeo]}>
              {tr("MyBot Brain (Editable)", "MyBot Brain (Editable)")}
            </Text>
            <TextInput
              style={[styles.brainEditor, styles.brainEditorNeo]}
              multiline
              value={instruction}
              onChangeText={setInstruction}
              placeholder={tr("系统指令", "System instructions")}
              placeholderTextColor="rgba(148,163,184,0.7)"
            autoComplete="off"
            textContentType="oneTimeCode"
            importantForAutofill="no"
            />
          </View>

          <View style={[styles.card, styles.cardNeo]}>
            <Text style={[styles.cardTitle, styles.cardTitleNeo]}>
              {tr("Installed Skills", "Installed Skills")}
            </Text>
            {installedSkills.length === 0 ? (
              <Text style={[styles.emptyText, styles.emptyTextNeo]}>
                {tr("还没有安装技能。", "No skills installed yet.")}
              </Text>
            ) : (
              installedSkills.map((skill) => (
                <View key={skill.id} style={[styles.skillInstalledCard, styles.skillInstalledCardNeo]}>
                  <Text style={[styles.marketItemTitle, styles.marketItemTitleNeo]}>{skill.name}</Text>
                  <Text style={[styles.marketItemDesc, styles.marketItemDescNeo]}>{skill.description}</Text>
                </View>
              ))
            )}
            <Pressable style={[styles.signOutBtn, styles.signOutBtnNeo]} onPress={handleSignOut}>
              <Ionicons name="log-out-outline" size={16} color="#fda4af" />
              <Text style={[styles.signOutBtnText, styles.signOutBtnTextNeo]}>
                {tr("退出登录", "Sign Out")}
              </Text>
            </Pressable>
          </View>
          </ScrollView>

          <View style={styles.neoFooterWrap}>
            <Pressable style={styles.neoApplyBtn} onPress={save}>
              <Ionicons name="save-outline" size={18} color="#111827" />
              <Text style={styles.neoApplyBtnText}>
                {tr("Apply Configuration", "Apply Configuration")}
              </Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={APP_SAFE_AREA_EDGES} style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable style={styles.headerBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color="#111827" />
        </Pressable>
        <Text style={styles.headerTitle}>{tr("设置", "Settings")}</Text>
        <Pressable style={styles.saveBtn} onPress={save}>
          <Ionicons name="save" size={16} color="white" />
          <Text style={styles.saveBtnText}>{tr("应用", "Apply")}</Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
      >
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{tr("账号", "Account")}</Text>
          <View style={styles.accountProfileRow}>
            <Image source={{ uri: profileAvatar }} style={styles.accountAvatar} />
            <View style={styles.accountProfileBody}>
              <Text style={styles.accountName}>{user?.displayName || tr("未知", "Unknown")}</Text>
              <Text style={styles.accountSubtext}>{`${tr("提供方", "Provider")}: ${profileProvider}`}</Text>
            </View>
          </View>
          <Text style={styles.accountMetaLine}>
            {tr("电子邮件", "Email")}: {user?.email || tr("未设置", "Not set")}
          </Text>
          <Text style={styles.accountMetaLine}>
            {tr("电话", "Phone")}: {profilePhone}
          </Text>
          <TextInput
            style={styles.accountInput}
            value={profileName}
            onChangeText={setProfileName}
            placeholder={tr("用户名", "Username")}
          autoComplete="off"
          textContentType="oneTimeCode"
          importantForAutofill="no"
          />
          <TextInput
            style={styles.accountInput}
            value={profileEmail}
            onChangeText={setProfileEmail}
            placeholder={tr("电子邮件", "Email")}
            keyboardType="email-address"
            autoCapitalize="none"
          autoComplete="off"
          textContentType="oneTimeCode"
          importantForAutofill="no"
          />
          <TextInput
            style={styles.accountInput}
            value={profileAvatarInput}
            onChangeText={setProfileAvatarInput}
            placeholder={tr("头像地址", "Avatar URL")}
            autoCapitalize="none"
            autoComplete="off"
            textContentType="oneTimeCode"
            importantForAutofill="no"
          />
          <View style={styles.accountAvatarActionsRow}>
            <Pressable
              style={[styles.accountAvatarPresetBtn, (uploadingProfileAvatar || savingProfile) && styles.accountActionBtnDisabled]}
              onPress={() => void handlePickProfileAvatar()}
              disabled={uploadingProfileAvatar || savingProfile}
            >
              {uploadingProfileAvatar ? (
                <ActivityIndicator size="small" color="#1d4ed8" />
              ) : (
                <Ionicons name="image-outline" size={14} color="#1d4ed8" />
              )}
              <Text style={styles.accountAvatarPresetBtnText}>{tr("从相册选择", "Choose Photo")}</Text>
            </Pressable>
            <Pressable
              style={[styles.accountAvatarPresetBtn, (uploadingProfileAvatar || savingProfile) && styles.accountActionBtnDisabled]}
              onPress={randomizeProfileAvatar}
              disabled={uploadingProfileAvatar || savingProfile}
            >
              <Ionicons name="images-outline" size={14} color="#1d4ed8" />
              <Text style={styles.accountAvatarPresetBtnText}>{tr("随机头像", "Random Avatar")}</Text>
            </Pressable>
          </View>
          <Pressable
            style={[styles.accountSaveBtn, (savingProfile || uploadingProfileAvatar) && styles.accountSaveBtnDisabled]}
            onPress={handleSaveProfile}
            disabled={savingProfile || uploadingProfileAvatar}
          >
            {savingProfile ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <>
                <Ionicons name="save-outline" size={16} color="white" />
                <Text style={styles.accountSaveBtnText}>{tr("保存资料", "Save Profile")}</Text>
              </>
            )}
          </Pressable>
          <View style={styles.friendQrActionsRow}>
            <Pressable
              style={[styles.friendQrBtn, styles.friendQrBtnPrimary]}
              onPress={handleGenerateMyQr}
              disabled={generatingMyQr}
            >
              {generatingMyQr ? (
                <ActivityIndicator size="small" color="#0b1220" />
              ) : (
                <Ionicons name="qr-code-outline" size={15} color="#0b1220" />
              )}
              <Text style={[styles.friendQrBtnText, styles.friendQrBtnTextPrimary]}>
                {tr("我的二维码", "My QR")}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.friendQrBtn, !myQrToken && styles.friendQrBtnDisabled]}
              onPress={handleShareMyQr}
              disabled={!myQrToken}
            >
              <Ionicons name="share-social-outline" size={15} color="#dbeafe" />
              <Text style={styles.friendQrBtnText}>{tr("分享", "Share")}</Text>
            </Pressable>
          </View>
          {myQrToken ? (
            <View style={styles.friendQrTokenCard}>
              {friendQrSvg ? <SvgXml xml={friendQrSvg} width={168} height={168} style={styles.friendQrImage} /> : null}
              <Text style={styles.friendQrTokenTitle}>{tr("好友二维码", "Friend QR")}</Text>
              <Text style={styles.friendQrTokenHint}>
                {tr("有效期至：", "Expires at: ")}
                {myQrExpiresAt || "-"}
              </Text>
              <Text selectable style={styles.friendQrTokenValue}>
                {myQrToken}
              </Text>
            </View>
          ) : null}
          <Pressable style={styles.signOutBtn} onPress={handleSignOut}>
            <Ionicons name="log-out-outline" size={16} color="#b91c1c" />
            <Text style={styles.signOutBtnText}>{tr("退出登录", "Sign Out")}</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{tr("主题", "Theme")}</Text>
          <Text style={styles.accountSubtext}>
            {tr(
              "在经典亮色风格与暗色玻璃风格之间切换。",
              "Choose between classic bright style and dark glass style."
            )}
          </Text>
          <View style={styles.themeRow}>
            <Pressable
              style={[styles.themeBtn, uiTheme === "classic" && styles.themeBtnActive]}
              onPress={() => updateUiTheme("classic")}
            >
              <Ionicons
                name="sunny-outline"
                size={16}
                color={uiTheme === "classic" ? "white" : "#334155"}
              />
              <Text
                style={[
                  styles.themeBtnText,
                  uiTheme === "classic" && styles.themeBtnTextActive,
                ]}
              >
                {tr("经典", "Classic")}
              </Text>
            </Pressable>
            <Pressable
              style={styles.themeBtn}
              onPress={() => updateUiTheme("neo")}
            >
              <Ionicons
                name="moon-outline"
                size={16}
                color="#334155"
              />
              <Text
                style={[
                  styles.themeBtnText,
                ]}
              >
                {tr("霓虹玻璃", "Neo Glass")}
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{tr("语言", "Language")}</Text>
          <View style={styles.themeRow}>
            <Pressable
              style={[styles.themeBtn, language === "zh" && styles.themeBtnActive]}
              onPress={() => updateLanguage("zh")}
            >
              <Ionicons name="language-outline" size={16} color={language === "zh" ? "white" : "#334155"} />
              <Text style={[styles.themeBtnText, language === "zh" && styles.themeBtnTextActive]}>
                {tr("中文", "Chinese")}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.themeBtn, language === "en" && styles.themeBtnActiveNeo]}
              onPress={() => updateLanguage("en")}
            >
              <Ionicons name="language-outline" size={16} color={language === "en" ? "white" : "#334155"} />
              <Text style={[styles.themeBtnText, language === "en" && styles.themeBtnTextActive]}>
                {tr("英文", "English")}
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{tr("Bot 身份", "Bot Identity")}</Text>
          <View style={styles.identityRow}>
            <Image source={{ uri: avatar }} style={styles.avatar} />
            <View style={styles.identityInputWrap}>
              <TextInput style={styles.nameInput} value={name} onChangeText={setName} autoComplete="off" textContentType="oneTimeCode" importantForAutofill="no" />
              <TextInput
                style={styles.avatarInput}
                value={avatar}
                onChangeText={setAvatar}
                placeholder={tr("头像 URL", "Avatar URL")}
              autoComplete="off"
              textContentType="oneTimeCode"
              importantForAutofill="no"
              />
            </View>
          </View>
          <Pressable style={styles.secondaryBtn} onPress={randomizeAvatar}>
            <Ionicons name="shuffle" size={14} color="#1f2937" />
            <Text style={styles.secondaryBtnText}>{tr("随机头像", "Random Avatar")}</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{tr("知识上传", "Knowledge Upload")}</Text>
          <Pressable style={styles.secondaryBtn} onPress={uploadKnowledge} disabled={isUploading}>
            {isUploading ? (
              <ActivityIndicator size="small" color="#2563eb" />
            ) : (
              <Ionicons name="cloud-upload" size={16} color="#2563eb" />
            )}
            <Text style={[styles.secondaryBtnText, { color: "#1d4ed8" }]}>
              {tr("上传文档", "Upload Document")}
            </Text>
          </Pressable>

          {documents.length > 0 ? (
            <View style={styles.badgeWrap}>
              {documents.map((doc) => (
                <View key={doc} style={styles.badge}>
                  <Text style={styles.badgeText}>{doc}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {knowledgeKeywords.length > 0 ? (
            <View style={styles.badgeWrap}>
              {knowledgeKeywords.map((keyword) => (
                <View key={keyword} style={[styles.badge, styles.keywordBadge]}>
                  <Text style={styles.keywordBadgeText}>{keyword}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{tr("技能构建", "Skill Builder")}</Text>
          <TextInput
            style={styles.field}
            placeholder={tr("技能名称", "Skill name")}
            value={skillForm.name}
            onChangeText={(value) => setSkillForm((prev) => ({ ...prev, name: value }))}
          autoComplete="off"
          textContentType="oneTimeCode"
          importantForAutofill="no"
          />
          <TextInput
            style={styles.field}
            placeholder={tr("描述", "Description")}
            value={skillForm.description}
            onChangeText={(value) => setSkillForm((prev) => ({ ...prev, description: value }))}
          autoComplete="off"
          textContentType="oneTimeCode"
          importantForAutofill="no"
          />
          <TextInput
            style={styles.field}
            placeholder={tr("触发条件", "Trigger")}
            value={skillForm.trigger}
            onChangeText={(value) => setSkillForm((prev) => ({ ...prev, trigger: value }))}
          autoComplete="off"
          textContentType="oneTimeCode"
          importantForAutofill="no"
          />
          <TextInput
            style={[styles.field, styles.fieldTall]}
            multiline
            placeholder={tr("核心逻辑", "Core logic")}
            value={skillForm.logic}
            onChangeText={(value) => setSkillForm((prev) => ({ ...prev, logic: value }))}
          autoComplete="off"
          textContentType="oneTimeCode"
          importantForAutofill="no"
          />
          <TextInput
            style={styles.field}
            placeholder={tr("必填参数", "Required params")}
            value={skillForm.requiredParams}
            onChangeText={(value) => setSkillForm((prev) => ({ ...prev, requiredParams: value }))}
          autoComplete="off"
          textContentType="oneTimeCode"
          importantForAutofill="no"
          />
          <TextInput
            style={styles.field}
            placeholder={tr("可选参数", "Optional params")}
            value={skillForm.optionalParams}
            onChangeText={(value) => setSkillForm((prev) => ({ ...prev, optionalParams: value }))}
          autoComplete="off"
          textContentType="oneTimeCode"
          importantForAutofill="no"
          />
          <TextInput
            style={styles.field}
            placeholder={tr("约束条件", "Constraints")}
            value={skillForm.constraints}
            onChangeText={(value) => setSkillForm((prev) => ({ ...prev, constraints: value }))}
          autoComplete="off"
          textContentType="oneTimeCode"
          importantForAutofill="no"
          />
          <TextInput
            style={styles.field}
            placeholder={tr("示例", "Example")}
            value={skillForm.example}
            onChangeText={(value) => setSkillForm((prev) => ({ ...prev, example: value }))}
          autoComplete="off"
          textContentType="oneTimeCode"
          importantForAutofill="no"
          />
          <Pressable style={styles.secondaryBtn} onPress={appendCustomSkill}>
            <Ionicons name="add-circle" size={16} color="#111827" />
            <Text style={styles.secondaryBtnText}>{tr("追加到 Bot 脑内", "Append Skill to Brain")}</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{tr("MyBot 技能商店（运行时）", "MyBot Skill Store (Runtime)")}</Text>
          {runtimeSkills.length === 0 ? (
            <Text style={styles.emptyText}>{tr("暂无可安装技能。", "No skills available.")}</Text>
          ) : (
            runtimeSkills.map((skill) => {
              const installed = installedSkillIds.has(skill.id);
              const installing = installingSkillId === skill.id;
              return (
                <View style={styles.marketItemCard} key={skill.id}>
                  <View style={styles.marketItemHeader}>
                    <Text style={styles.marketItemTitle}>{skill.name}</Text>
                    <Pressable
                      style={styles.installBtn}
                      onPress={() => void toggleRuntimeSkill(skill.id, !installed)}
                      disabled={installing}
                    >
                      <Text style={styles.installBtnText}>
                        {installing
                          ? tr("处理中...", "Working...")
                          : installed
                            ? tr("移除", "Remove")
                            : tr("安装", "Install")}
                      </Text>
                    </Pressable>
                  </View>
                  <Text style={styles.marketItemDesc}>{skill.description}</Text>
                  <Text style={styles.skillMetaText}>
                    {skill.version} · {skill.permissionScope} · {skill.source}
                  </Text>
                </View>
              );
            })
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{tr("技能市场", "Skill Marketplace")}</Text>
          {localizedMarketData.map((category) => (
            <View style={styles.marketCategory} key={category.id}>
              <Text style={styles.marketCategoryTitle}>{category.title}</Text>
              <Text style={styles.marketCategorySubtitle}>{category.subtitle}</Text>

              <View style={styles.marketItemsWrap}>
                {category.items.map((item) => {
                  return (
                    <View style={styles.marketItemCard} key={item.id}>
                      <View style={styles.marketItemHeader}>
                        <Text style={styles.marketItemTitle}>{item.name}</Text>
                        <Pressable style={styles.installBtn} onPress={() => installSkill(item)}>
                          <Text style={styles.installBtnText}>{tr("查看", "Inspect")}</Text>
                        </Pressable>
                      </View>
                      <Text style={styles.marketItemDesc}>{item.description}</Text>
                      <Pressable onPress={() => setViewingSkill(item)}>
                        <Text style={styles.inspectLink}>{tr("查看模块", "Inspect modules")}</Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            </View>
          ))}
        </View>

        {viewingSkill ? (
          <View style={styles.card}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.cardTitle}>
                {tr("技能详情", "Skill Inspector")} · {viewingSkill.name}
              </Text>
              <Pressable onPress={() => setViewingSkill(null)}>
                <Ionicons name="close" size={20} color="#6b7280" />
              </Pressable>
            </View>
            <Text style={styles.marketItemDesc}>{viewingSkill.description}</Text>
            <View style={styles.badgeWrap}>
              {(viewingSkill.keywords || []).map((k) => (
                <View key={k} style={[styles.badge, styles.keywordBadge]}>
                  <Text style={styles.keywordBadgeText}>{k}</Text>
                </View>
              ))}
            </View>
            <View style={styles.moduleWrap}>
              {viewingSkill.modules.map((module) => (
                <View style={styles.moduleRow} key={`${viewingSkill.id}-${module.name}`}>
                  <Ionicons
                    name={module.type === "folder" ? "folder" : "document-text"}
                    size={14}
                    color={module.type === "folder" ? "#2563eb" : "#6b7280"}
                  />
                  <View style={styles.moduleBody}>
                    <Text style={styles.moduleName}>{module.name}</Text>
                    <Text style={styles.moduleDesc}>{module.desc}</Text>
                  </View>
                  {module.size ? <Text style={styles.moduleSize}>{module.size}</Text> : null}
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{tr("MyBot 脑（可编辑）", "MyBot Brain (Editable)")}</Text>
          <TextInput
            style={styles.brainEditor}
            multiline
            value={instruction}
            onChangeText={setInstruction}
            placeholder={tr("系统指令", "System instructions")}
          autoComplete="off"
          textContentType="oneTimeCode"
          importantForAutofill="no"
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{tr("已安装技能", "Installed Skills")}</Text>
          {installedSkills.length === 0 ? (
            <Text style={styles.emptyText}>{tr("还没有安装技能。", "No skills installed yet.")}</Text>
          ) : (
            installedSkills.map((skill) => (
              <View key={skill.id} style={styles.skillInstalledCard}>
                <Text style={styles.marketItemTitle}>{skill.name}</Text>
                <Text style={styles.marketItemDesc}>{skill.description}</Text>
              </View>
            ))
          )}
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f3f4f6",
  },
  keyboardAvoid: {
    flex: 1,
  },
  safeAreaNeo: {
    backgroundColor: "#070510",
  },
  scrollNeo: {
    backgroundColor: "transparent",
  },
  scrollContentNeo: {
    gap: 12,
    paddingBottom: 130,
  },
  neoHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerNeo: {
    backgroundColor: "rgba(11,10,24,0.95)",
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  headerBtnNeo: {
    backgroundColor: "rgba(31,33,51,0.9)",
    borderColor: "rgba(255,255,255,0.15)",
  },
  headerTitleNeo: {
    color: "#f8fafc",
    fontSize: 16,
  },
  neoIdentityCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(20,20,36,0.82)",
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  neoIdentityAvatarWrap: {
    position: "relative",
    width: 94,
    height: 94,
    alignItems: "center",
    justifyContent: "center",
  },
  neoAvatarShuffle: {
    position: "absolute",
    right: 2,
    bottom: 2,
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(71,85,105,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  neoIdentityBody: {
    flex: 1,
    gap: 6,
  },
  neoIdentityLabel: {
    alignSelf: "flex-start",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.1,
    color: "rgba(148,163,184,0.9)",
    backgroundColor: "rgba(30,58,138,0.35)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  neoNameInput: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(15,23,42,0.45)",
    color: "#f8fafc",
    fontSize: 15,
    fontWeight: "700",
    paddingHorizontal: 10,
  },
  neoQuickRow: {
    flexDirection: "row",
    gap: 10,
  },
  neoQuickCard: {
    flex: 1,
    minHeight: 148,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.45)",
    backgroundColor: "rgba(34,25,71,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    gap: 6,
  },
  neoQuickSkillCard: {
    alignItems: "flex-start",
    backgroundColor: "rgba(15,19,34,0.7)",
    borderColor: "rgba(34,197,94,0.16)",
  },
  neoQuickIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  neoQuickTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#e2e8f0",
    textAlign: "center",
  },
  neoQuickTag: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    color: "rgba(148,163,184,0.88)",
    backgroundColor: "rgba(30,58,138,0.35)",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  neoQuickSkillTitle: {
    fontSize: 16,
    lineHeight: 22,
    color: "#f8fafc",
    fontWeight: "800",
  },
  neoQuickSub: {
    fontSize: 12,
    color: "rgba(148,163,184,0.86)",
  },
  neoQuickAddBtn: {
    position: "absolute",
    right: 12,
    bottom: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#22c55e",
    alignItems: "center",
    justifyContent: "center",
  },
  neoStoreCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(18,15,33,0.86)",
    padding: 12,
    gap: 10,
  },
  neoStoreHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  neoStoreTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#f8fafc",
  },
  neoStoreSub: {
    marginTop: 2,
    fontSize: 12,
    color: "rgba(148,163,184,0.8)",
  },
  neoStoreBtn: {
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(96,165,250,0.55)",
    backgroundColor: "rgba(30,58,138,0.35)",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  neoStoreBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#bfdbfe",
  },
  neoStoreList: {
    gap: 10,
  },
  neoStoreItem: {
    minHeight: 84,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  neoStoreIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  neoStoreItemBody: {
    flex: 1,
    gap: 4,
  },
  neoStoreItemTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#f8fafc",
  },
  neoStoreItemSub: {
    fontSize: 11,
    color: "rgba(148,163,184,0.82)",
  },
  neoStoreChevron: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  neoAccountCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(20,20,36,0.82)",
    padding: 14,
    gap: 10,
  },
  neoAccountHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  neoAccountAvatarWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  neoAccountAvatar: {
    width: "100%",
    height: "100%",
    backgroundColor: "rgba(30,41,59,0.8)",
  },
  neoAccountBody: {
    flex: 1,
    gap: 4,
  },
  neoAccountName: {
    color: "#f8fafc",
    fontSize: 16,
    fontWeight: "800",
  },
  neoAccountMeta: {
    color: "rgba(148,163,184,0.88)",
    fontSize: 12,
  },
  neoAccountField: {
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(15,23,42,0.45)",
    color: "#f8fafc",
    fontSize: 14,
    paddingHorizontal: 10,
  },
  neoAvatarPresetBtn: {
    minHeight: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(96,165,250,0.42)",
    backgroundColor: "rgba(30,58,138,0.18)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  neoAvatarPresetBtnText: {
    color: "#dbeafe",
    fontSize: 12,
    fontWeight: "800",
  },
  neoReadonlyRow: {
    minHeight: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(15,23,42,0.38)",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
  },
  neoReadonlyText: {
    color: "rgba(226,232,240,0.88)",
    fontSize: 13,
    fontWeight: "600",
  },
  neoProfileSaveBtn: {
    minHeight: 42,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.8)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  neoProfileSaveBtnDisabled: {
    opacity: 0.75,
  },
  neoProfileSaveBtnText: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "800",
  },
  accountText: {
    fontSize: 13,
    color: "#111827",
    fontWeight: "700",
  },
  accountSubtext: {
    fontSize: 12,
    color: "#475569",
    lineHeight: 18,
  },
  accountProfileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  accountAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#e5e7eb",
  },
  accountProfileBody: {
    flex: 1,
    gap: 2,
  },
  accountName: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
  },
  accountMetaLine: {
    fontSize: 12,
    color: "#475569",
  },
  accountInput: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    minHeight: 40,
    paddingHorizontal: 10,
    fontSize: 13,
  },
  accountAvatarPresetBtn: {
    flex: 1,
    minHeight: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(96,165,250,0.45)",
    backgroundColor: "#eff6ff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  accountAvatarPresetBtnText: {
    color: "#1d4ed8",
    fontSize: 12,
    fontWeight: "800",
  },
  accountAvatarActionsRow: {
    flexDirection: "row",
    gap: 8,
  },
  accountActionBtnDisabled: {
    opacity: 0.6,
  },
  accountSaveBtn: {
    minHeight: 40,
    borderRadius: 10,
    backgroundColor: "#111827",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  accountSaveBtnDisabled: {
    opacity: 0.7,
  },
  accountSaveBtnText: {
    color: "white",
    fontSize: 13,
    fontWeight: "700",
  },
  friendQrActionsRow: {
    flexDirection: "row",
    gap: 8,
  },
  friendQrBtn: {
    flex: 1,
    minHeight: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(96,165,250,0.45)",
    backgroundColor: "rgba(30,58,138,0.25)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 10,
  },
  friendQrBtnPrimary: {
    borderColor: "rgba(191,219,254,0.72)",
    backgroundColor: "rgba(226,232,240,0.95)",
  },
  friendQrBtnDisabled: {
    opacity: 0.55,
  },
  friendQrBtnText: {
    color: "#dbeafe",
    fontSize: 12,
    fontWeight: "800",
  },
  friendQrBtnTextPrimary: {
    color: "#0b1220",
  },
  friendQrTokenCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(96,165,250,0.3)",
    backgroundColor: "rgba(30,64,175,0.14)",
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 4,
  },
  friendQrImage: {
    alignSelf: "center",
    width: 168,
    height: 168,
    borderRadius: 12,
    backgroundColor: "#ffffff",
    marginBottom: 4,
  },
  friendQrTokenCardNeo: {
    borderColor: "rgba(96,165,250,0.42)",
    backgroundColor: "rgba(30,58,138,0.32)",
  },
  friendQrTokenTitle: {
    color: "#1d4ed8",
    fontSize: 11,
    fontWeight: "900",
  },
  friendQrTokenTitleNeo: {
    color: "#bfdbfe",
  },
  friendQrTokenValue: {
    color: "#0f172a",
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700",
  },
  friendQrTokenValueNeo: {
    color: "#e2e8f0",
  },
  friendQrTokenHint: {
    color: "#334155",
    fontSize: 10,
    fontWeight: "700",
  },
  friendQrTokenHintNeo: {
    color: "rgba(191,219,254,0.9)",
  },
  signOutBtn: {
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#fecaca",
    backgroundColor: "#fef2f2",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  signOutBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#b91c1c",
  },
  themeRow: {
    flexDirection: "row",
    gap: 10,
  },
  themeBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  themeBtnNeoBase: {
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(15,23,42,0.55)",
  },
  themeBtnActive: {
    backgroundColor: "#16a34a",
    borderColor: "#16a34a",
  },
  themeBtnActiveNeo: {
    backgroundColor: "#1e293b",
    borderColor: "#1e293b",
  },
  themeBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#334155",
  },
  themeBtnTextNeo: {
    color: "rgba(226,232,240,0.88)",
  },
  themeBtnTextActive: {
    color: "white",
  },
  header: {
    height: 56,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    backgroundColor: "#f9fafb",
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#111827",
    paddingHorizontal: 12,
    height: 36,
    borderRadius: 10,
  },
  saveBtnText: {
    color: "white",
    fontSize: 12,
    fontWeight: "700",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 12,
    gap: 10,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: "white",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    gap: 10,
  },
  cardNeo: {
    backgroundColor: "rgba(16,16,30,0.78)",
    borderColor: "rgba(255,255,255,0.1)",
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  cardTitleNeo: {
    color: "#f8fafc",
  },
  identityRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  avatar: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: "#e5e7eb",
    borderWidth: 3,
    borderColor: "#fff",
  },
  identityInputWrap: {
    flex: 1,
    gap: 8,
  },
  nameInput: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    height: 40,
    paddingHorizontal: 10,
    fontSize: 15,
    fontWeight: "700",
  },
  avatarInput: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    height: 38,
    paddingHorizontal: 10,
    fontSize: 12,
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d1d5db",
    minHeight: 38,
    backgroundColor: "#f9fafb",
    paddingHorizontal: 12,
  },
  secondaryBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#111827",
  },
  badgeWrap: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
  },
  badge: {
    borderRadius: 999,
    backgroundColor: "#f3f4f6",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 10,
    color: "#374151",
  },
  keywordBadge: {
    backgroundColor: "#e0e7ff",
  },
  keywordBadgeText: {
    fontSize: 10,
    color: "#3730a3",
    fontWeight: "700",
  },
  field: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    minHeight: 38,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    textAlignVertical: "top",
  },
  fieldTall: {
    minHeight: 80,
  },
  marketCategory: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 10,
    gap: 8,
    backgroundColor: "#f9fafb",
  },
  marketCategoryTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#111827",
  },
  marketCategorySubtitle: {
    fontSize: 11,
    color: "#6b7280",
  },
  marketItemsWrap: {
    gap: 8,
  },
  marketItemCard: {
    backgroundColor: "white",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 8,
    gap: 6,
  },
  marketItemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 6,
  },
  marketItemTitle: {
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
    color: "#111827",
  },
  marketItemTitleNeo: {
    color: "#f8fafc",
  },
  marketItemDesc: {
    fontSize: 11,
    color: "#4b5563",
    lineHeight: 16,
  },
  skillMetaText: {
    fontSize: 10,
    color: "#64748b",
    lineHeight: 14,
  },
  marketItemDescNeo: {
    color: "rgba(148,163,184,0.88)",
  },
  installBtn: {
    borderRadius: 999,
    backgroundColor: "#111827",
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  installBtnText: {
    color: "white",
    fontSize: 10,
    fontWeight: "700",
  },
  installedTag: {
    fontSize: 10,
    fontWeight: "700",
    color: "#15803d",
    backgroundColor: "#dcfce7",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  inspectLink: {
    fontSize: 11,
    fontWeight: "700",
    color: "#2563eb",
  },
  modalHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  moduleWrap: {
    gap: 6,
  },
  moduleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    padding: 8,
    backgroundColor: "#f9fafb",
  },
  moduleBody: {
    flex: 1,
    gap: 2,
  },
  moduleName: {
    fontSize: 12,
    fontWeight: "700",
    color: "#111827",
  },
  moduleDesc: {
    fontSize: 10,
    color: "#6b7280",
  },
  moduleSize: {
    fontSize: 10,
    color: "#6b7280",
  },
  brainEditor: {
    minHeight: 220,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    padding: 10,
    fontSize: 12,
    textAlignVertical: "top",
    lineHeight: 18,
    fontFamily: Platform.select({ ios: "Courier", android: "monospace", default: "monospace" }),
  },
  brainEditorNeo: {
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(2,6,23,0.56)",
    color: "rgba(226,232,240,0.92)",
  },
  emptyText: {
    fontSize: 12,
    color: "#6b7280",
  },
  emptyTextNeo: {
    color: "rgba(148,163,184,0.8)",
  },
  skillInstalledCard: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    padding: 8,
    gap: 4,
    backgroundColor: "#f9fafb",
  },
  skillInstalledCardNeo: {
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  signOutBtnNeo: {
    borderColor: "rgba(253,164,175,0.4)",
    backgroundColor: "rgba(127,29,29,0.25)",
    marginTop: 8,
  },
  signOutBtnTextNeo: {
    color: "#fda4af",
  },
  neoFooterWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 24,
    backgroundColor: "rgba(7,5,16,0.94)",
  },
  neoApplyBtn: {
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.92)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  neoApplyBtnText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
  },
});
