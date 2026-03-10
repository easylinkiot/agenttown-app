import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import * as QRCode from "qrcode";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
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
import { APP_SAFE_AREA_EDGES } from "@/src/constants/safe-area";
import { buildProfileAvatarUploadInput } from "@/src/features/profile-avatar";
import { tx } from "@/src/i18n/translate";
import {
  ApiError,
  buildFriendQrDeepLink,
  createCustomSkill,
  createFriendQR,
  createKnowledgeDataset,
  deleteKnowledgeDataset,
  listCustomSkills,
  listKnowledgeDatasets,
  listSkillCatalog,
  patchCustomSkill,
  setV2SkillInstalled,
  updateKnowledgeDataset,
  uploadFileV2,
} from "@/src/lib/api";
import { useAgentTown } from "@/src/state/agenttown-context";
import { useAuth } from "@/src/state/auth-context";
import { BotConfig, CustomSkill, KnowledgeDataset, SettingsSkillItem } from "@/src/types";

type SkillEditorState = {
  id: string | null;
  name: string;
  description: string;
  markdown: string;
};

const emptySkillEditor: SkillEditorState = {
  id: null,
  name: "",
  description: "",
  markdown: "",
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

function mergeSettingsSkills(systemSkills: SettingsSkillItem[], installedSkills: SettingsSkillItem[]): SettingsSkillItem[] {
  const userSkills = installedSkills.filter((skill) => skill.source === "user");
  return [...systemSkills, ...userSkills].sort((left, right) => {
    if (left.source !== right.source) {
      return left.source === "system" ? -1 : 1;
    }
    return left.name.localeCompare(right.name);
  });
}

function customSkillToSettingsSkill(skill: CustomSkill): SettingsSkillItem {
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    version: skill.version,
    source: "user",
    installed: true,
    editable: true,
    removable: false,
    permissionScope: skill.permissionScope,
    markdown: skill.markdown,
  };
}

function systemSkillInstallCacheKey(userId?: string) {
  const safeUserId = (userId || "").trim();
  return `agenttown.settings.system-skill-install:${safeUserId || "anonymous"}`;
}

export default function ConfigScreen() {
  const router = useRouter();
  const { botConfig, updateBotConfig, uiTheme, updateUiTheme, language, updateLanguage } = useAgentTown();
  const { user, signOut, completeProfile } = useAuth();
  const tr = (zh: string, en: string) => tx(language, zh, en);
  const isNeo = uiTheme === "neo";

  const [name, setName] = useState(botConfig.name);
  const [avatar, setAvatar] = useState(botConfig.avatar);
  const [instruction, setInstruction] = useState(botConfig.systemInstruction);

  const [profileName, setProfileName] = useState(user?.displayName || "");
  const [profileEmail, setProfileEmail] = useState(user?.email || "");
  const [profileAvatarInput, setProfileAvatarInput] = useState(user?.avatar || "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingProfileAvatar, setUploadingProfileAvatar] = useState(false);

  const [systemSkills, setSystemSkills] = useState<SettingsSkillItem[]>([]);
  const [userSkills, setUserSkills] = useState<SettingsSkillItem[]>([]);
  const [knowledgeDatasets, setKnowledgeDatasets] = useState<KnowledgeDataset[]>([]);
  const [loadingResources, setLoadingResources] = useState(true);
  const [resourcesError, setResourcesError] = useState<string | null>(null);
  const [skillBusyId, setSkillBusyId] = useState<string | null>(null);
  const [skillEditor, setSkillEditor] = useState<SkillEditorState>(emptySkillEditor);
  const [savingSkill, setSavingSkill] = useState(false);
  const [skillModalVisible, setSkillModalVisible] = useState(false);
  const [knowledgeBusyId, setKnowledgeBusyId] = useState<string | null>(null);
  const [uploadingKnowledge, setUploadingKnowledge] = useState(false);
  const [editingKnowledgeId, setEditingKnowledgeId] = useState<string | null>(null);
  const [editingKnowledgeName, setEditingKnowledgeName] = useState("");

  const [myQrToken, setMyQrToken] = useState("");
  const [myQrExpiresAt, setMyQrExpiresAt] = useState("");
  const [generatingMyQr, setGeneratingMyQr] = useState(false);
  const [friendQrSvg, setFriendQrSvg] = useState("");

  const profileAvatar = profileAvatarInput.trim() || user?.avatar || botConfig.avatar || AVATAR_PRESETS[0];
  const profileProvider = user?.provider || "unknown";
  const profilePhone = user?.phone || tr("未绑定手机号", "No phone linked");
  const mergedSkills = useMemo(
    () => mergeSettingsSkills(systemSkills, userSkills),
    [systemSkills, userSkills]
  );

  const persistSystemSkillInstallCache = useCallback(
    async (skills: SettingsSkillItem[]) => {
      const payload = Object.fromEntries(
        skills
          .filter((skill) => skill.source === "system")
          .map((skill) => [skill.id, Boolean(skill.installed)])
      );
      await AsyncStorage.setItem(systemSkillInstallCacheKey(user?.id), JSON.stringify(payload));
    },
    [user?.id]
  );

  useEffect(() => {
    setName(botConfig.name);
    setAvatar(botConfig.avatar);
    setInstruction(botConfig.systemInstruction);
  }, [botConfig]);

  useEffect(() => {
    setProfileName(user?.displayName || "");
    setProfileEmail(user?.email || "");
    setProfileAvatarInput(user?.avatar || "");
  }, [user?.avatar, user?.displayName, user?.email]);

  useEffect(() => {
    let alive = true;
    setLoadingResources(true);
    setResourcesError(null);
    void Promise.all([
      listSkillCatalog(),
      listCustomSkills(),
      listKnowledgeDatasets(),
    ])
      .then(([nextSystemSkills, nextUserSkills, nextKnowledge]) => {
        if (!alive) return;
        setSystemSkills(nextSystemSkills);
        setUserSkills(nextUserSkills.map(customSkillToSettingsSkill));
        setKnowledgeDatasets(nextKnowledge);
        void persistSystemSkillInstallCache(nextSystemSkills);
      })
      .catch((error: unknown) => {
        if (!alive) return;
        const message =
          error instanceof Error ? error.message : tx(language, "请稍后重试。", "Please try again later.");
        setResourcesError(message);
      })
      .finally(() => {
        if (alive) {
          setLoadingResources(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [language, persistSystemSkillInstallCache, user?.id]);

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

  const saveBotIdentity = () => {
    const next: BotConfig = {
      ...botConfig,
      name,
      avatar,
      systemInstruction: instruction,
    };
    updateBotConfig(next);
    router.back();
  };

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

      setUploadingProfileAvatar(true);
      const uploaded = await uploadFileV2(buildProfileAvatarUploadInput(picker.assets[0], "library"));
      const nextUrl = (uploaded.url || "").trim();
      if (!nextUrl) {
        throw new Error(tr("头像上传成功，但未返回可用地址。", "Avatar uploaded but no usable URL was returned."));
      }
      setProfileAvatarInput(nextUrl);
    } catch (error) {
      Alert.alert(
        tr("头像上传失败", "Avatar upload failed"),
        error instanceof Error ? error.message : tr("请稍后重试", "Please try again later")
      );
    } finally {
      setUploadingProfileAvatar(false);
    }
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
    } catch (error) {
      Alert.alert(
        tr("更新失败", "Update failed"),
        error instanceof Error ? error.message : tr("请稍后重试", "Please try again later.")
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
    } catch (error) {
      Alert.alert(
        tr("生成失败", "Generation failed"),
        error instanceof Error ? error.message : tr("请稍后重试", "Please try again later.")
      );
    } finally {
      setGeneratingMyQr(false);
    }
  };

  const handleShareMyQr = async () => {
    if (!myQrToken) {
      Alert.alert(tr("请先生成二维码", "Generate QR first"), tr("先点击“我的二维码”。", "Tap My QR first."));
      return;
    }
    const content = [
      tr("UsChat 好友二维码", "UsChat Friend QR"),
      friendQrDeepLink || myQrToken,
      `${tr("备用原始码", "Fallback token")}: ${myQrToken}`,
      `${tr("有效期", "Expires")}: ${myQrExpiresAt || "-"}`,
    ].join("\n");
    try {
      await Share.share({ message: content });
    } catch (error) {
      Alert.alert(
        tr("分享失败", "Share failed"),
        error instanceof Error ? error.message : tr("请稍后重试", "Please try again later.")
      );
    }
  };

  const handleToggleSystemSkill = async (skill: SettingsSkillItem) => {
    if (skill.source !== "system" || skillBusyId) return;
    const nextInstalled = !skill.installed;
    setSkillBusyId(skill.id);
    setSystemSkills((previous) =>
      previous.map((item) => (item.id === skill.id ? { ...item, installed: nextInstalled } : item))
    );
    try {
      await setV2SkillInstalled(skill.id, nextInstalled);
      const nextSystemSkills = systemSkills.map((item) =>
        item.id === skill.id ? { ...item, installed: nextInstalled } : item
      );
      await persistSystemSkillInstallCache(nextSystemSkills);
    } catch (error) {
      const apiErrorCode = error instanceof ApiError ? (error.code || "").toLowerCase() : "";
      const apiErrorMessage = error instanceof Error ? error.message.toLowerCase() : "";
      const indicatesAlreadyInstalled =
        nextInstalled &&
        (apiErrorCode.includes("already") ||
          apiErrorCode.includes("exists") ||
          apiErrorMessage.includes("already install"));
      const indicatesAlreadyRemoved =
        !nextInstalled &&
        (apiErrorCode.includes("not_found") ||
          apiErrorCode.includes("notfound") ||
          apiErrorMessage.includes("not installed") ||
          apiErrorMessage.includes("not found"));

      if (indicatesAlreadyInstalled || indicatesAlreadyRemoved) {
        const resolvedInstalled = indicatesAlreadyInstalled;
        setSystemSkills((previous) => {
          const next = previous.map((item) =>
            item.id === skill.id ? { ...item, installed: resolvedInstalled } : item
          );
          void persistSystemSkillInstallCache(next);
          return next;
        });
      } else {
        setSystemSkills((previous) => {
          const next = previous.map((item) =>
            item.id === skill.id ? { ...item, installed: skill.installed } : item
          );
          void persistSystemSkillInstallCache(next);
          return next;
        });
        Alert.alert(
          tr("技能更新失败", "Skill update failed"),
          error instanceof Error ? error.message : tr("请稍后重试", "Please try again later.")
        );
      }
    } finally {
      setSkillBusyId(null);
    }
  };

  const handleEditUserSkill = (skill: SettingsSkillItem) => {
    setSkillEditor({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      markdown: skill.markdown || "",
    });
    setSkillModalVisible(true);
  };

  const handleOpenCreateSkill = () => {
    setSkillEditor(emptySkillEditor);
    setSkillModalVisible(true);
  };

  const handleCloseSkillModal = () => {
    if (savingSkill) return;
    setSkillModalVisible(false);
    setSkillEditor(emptySkillEditor);
  };

  const handleSubmitSkill = async () => {
    const safeName = skillEditor.name.trim();
    const safeMarkdown = skillEditor.markdown.trim();
    if (!safeName || !safeMarkdown) {
      Alert.alert(
        tr("信息不完整", "Incomplete Skill"),
        tr("请填写技能名称和内容。", "Fill in both the skill name and content.")
      );
      return;
    }
    setSavingSkill(true);
    try {
      if (skillEditor.id) {
        await patchCustomSkill(skillEditor.id, {
          name: safeName,
          description: skillEditor.description.trim(),
          markdown: safeMarkdown,
        });
        const refreshed = await listCustomSkills();
        setUserSkills(refreshed.map(customSkillToSettingsSkill));
      } else {
        await createCustomSkill({
          name: safeName,
          description: skillEditor.description.trim(),
          markdown: safeMarkdown,
        });
        const refreshed = await listCustomSkills();
        setUserSkills(refreshed.map(customSkillToSettingsSkill));
      }
      setSkillModalVisible(false);
      setSkillEditor(emptySkillEditor);
    } catch (error) {
      Alert.alert(
        tr("技能保存失败", "Skill save failed"),
        error instanceof Error ? error.message : tr("请稍后重试", "Please try again later.")
      );
    } finally {
      setSavingSkill(false);
    }
  };

  const handleUploadKnowledge = async () => {
    if (uploadingKnowledge) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        multiple: false,
        copyToCacheDirectory: true,
        type: ["text/plain", "application/json", "text/markdown", "text/csv", "application/pdf"],
      });
      if (result.canceled || result.assets.length === 0) return;

      const asset = result.assets[0];
      setUploadingKnowledge(true);
      const uploaded = await uploadFileV2({
        uri: asset.uri,
        name: asset.name || `knowledge-${Date.now()}`,
        mimeType: asset.mimeType || "application/octet-stream",
      });
      const fileUrl = (uploaded.url || "").trim();
      if (!fileUrl) {
        throw new Error(tr("文件上传成功，但未返回可用地址。", "File uploaded but no usable URL was returned."));
      }

      const created = await createKnowledgeDataset({
        name: asset.name || tr("未命名知识库", "Untitled Knowledge"),
        entries: [
          {
            name: asset.name || "document",
            type: "file",
            contentType: asset.mimeType || "application/octet-stream",
            fileUrl,
            size: typeof asset.size === "number" ? asset.size : undefined,
          },
        ],
      });
      setKnowledgeDatasets((previous) => [created, ...previous.filter((item) => item.id !== created.id)]);
    } catch (error) {
      Alert.alert(
        tr("知识库上传失败", "Knowledge upload failed"),
        error instanceof Error ? error.message : tr("请稍后重试", "Please try again later.")
      );
    } finally {
      setUploadingKnowledge(false);
    }
  };

  const beginEditKnowledge = (dataset: KnowledgeDataset) => {
    setEditingKnowledgeId(dataset.id);
    setEditingKnowledgeName(dataset.name);
  };

  const handleSaveKnowledgeName = async (datasetId: string) => {
    const nextName = editingKnowledgeName.trim();
    if (!nextName) {
      Alert.alert(tr("请输入名称", "Enter a name"), tr("知识库名称不能为空。", "Knowledge name cannot be empty."));
      return;
    }
    setKnowledgeBusyId(datasetId);
    try {
      const updated = await updateKnowledgeDataset(datasetId, { name: nextName });
      setKnowledgeDatasets((previous) => previous.map((item) => (item.id === datasetId ? updated : item)));
      setEditingKnowledgeId(null);
      setEditingKnowledgeName("");
    } catch (error) {
      Alert.alert(
        tr("更新失败", "Update failed"),
        error instanceof Error ? error.message : tr("请稍后重试", "Please try again later.")
      );
    } finally {
      setKnowledgeBusyId(null);
    }
  };

  const handleDeleteKnowledge = (dataset: KnowledgeDataset) => {
    Alert.alert(
      tr("删除知识库", "Delete knowledge"),
      tr(`确认删除 ${dataset.name} 吗？`, `Delete ${dataset.name}?`),
      [
        { text: tr("取消", "Cancel"), style: "cancel" },
        {
          text: tr("删除", "Delete"),
          style: "destructive",
          onPress: () => {
            setKnowledgeBusyId(dataset.id);
            void deleteKnowledgeDataset(dataset.id)
              .then(() => {
                setKnowledgeDatasets((previous) => previous.filter((item) => item.id !== dataset.id));
                if (editingKnowledgeId === dataset.id) {
                  setEditingKnowledgeId(null);
                  setEditingKnowledgeName("");
                }
              })
              .catch((error: unknown) => {
                Alert.alert(
                  tr("删除失败", "Delete failed"),
                  error instanceof Error ? error.message : tr("请稍后重试", "Please try again later.")
                );
              })
              .finally(() => {
                setKnowledgeBusyId(null);
              });
          },
        },
      ]
    );
  };

  const handleSignOut = async () => {
    await signOut();
    router.replace("/sign-in");
  };

  const renderResourceState = () => {
    if (loadingResources) {
      return (
        <View style={styles.resourceState}>
          <ActivityIndicator size="small" color={isNeo ? "#93c5fd" : "#2563eb"} />
          <Text style={[styles.resourceStateText, isNeo && styles.resourceStateTextNeo]}>
            {tr("正在加载技能和知识库...", "Loading skills and knowledge...")}
          </Text>
        </View>
      );
    }
    if (!resourcesError) return null;
    return (
      <View style={[styles.resourceState, styles.resourceStateError]}>
        <Ionicons name="warning-outline" size={16} color="#ef4444" />
        <Text style={[styles.resourceStateText, styles.resourceStateErrorText]}>{resourcesError}</Text>
      </View>
    );
  };

  return (
    <SafeAreaView edges={APP_SAFE_AREA_EDGES} style={[styles.safeArea, isNeo && styles.safeAreaNeo]}>
      <View style={[styles.header, isNeo && styles.headerNeo]}>
        <Pressable style={[styles.headerBtn, isNeo && styles.headerBtnNeo]} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={isNeo ? "#e2e8f0" : "#111827"} />
        </Pressable>
        <Text style={[styles.headerTitle, isNeo && styles.headerTitleNeo]}>{tr("设置", "Settings")}</Text>
        <Pressable style={[styles.saveBtn, isNeo && styles.saveBtnNeo]} onPress={saveBotIdentity}>
          <Ionicons name="save-outline" size={16} color={isNeo ? "#111827" : "#ffffff"} />
          <Text style={[styles.saveBtnText, isNeo && styles.saveBtnTextNeo]}>{tr("保存", "Save")}</Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {renderResourceState()}

          <View style={[styles.card, isNeo && styles.cardNeo]}>
            <Text style={[styles.cardTitle, isNeo && styles.cardTitleNeo]}>{tr("我的资料", "My Profile")}</Text>
            <View style={styles.profileRow}>
              <Image source={{ uri: profileAvatar }} style={styles.profileAvatar} />
              <View style={styles.profileMeta}>
                <Text style={[styles.profileName, isNeo && styles.profileNameNeo]} numberOfLines={1}>
                  {user?.displayName || tr("未命名用户", "Unnamed User")}
                </Text>
                <Text style={[styles.profileSubtext, isNeo && styles.profileSubtextNeo]} numberOfLines={1}>
                  {profileProvider} · {profilePhone}
                </Text>
              </View>
            </View>
            <TextInput
              style={[styles.input, isNeo && styles.inputNeo]}
              value={profileName}
              onChangeText={setProfileName}
              placeholder={tr("用户名", "Username")}
              placeholderTextColor={isNeo ? "rgba(148,163,184,0.85)" : "#94a3b8"}
            />
            <TextInput
              style={[styles.input, isNeo && styles.inputNeo]}
              value={profileEmail}
              onChangeText={setProfileEmail}
              placeholder={tr("电子邮件", "Email")}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholderTextColor={isNeo ? "rgba(148,163,184,0.85)" : "#94a3b8"}
            />
            <TextInput
              style={[styles.input, isNeo && styles.inputNeo]}
              value={profileAvatarInput}
              onChangeText={setProfileAvatarInput}
              placeholder={tr("头像地址", "Avatar URL")}
              autoCapitalize="none"
              placeholderTextColor={isNeo ? "rgba(148,163,184,0.85)" : "#94a3b8"}
            />
            <View style={styles.inlineActions}>
              <Pressable style={[styles.secondaryBtn, isNeo && styles.secondaryBtnNeo]} onPress={randomizeProfileAvatar}>
                <Ionicons name="shuffle-outline" size={14} color={isNeo ? "#dbeafe" : "#1f2937"} />
                <Text style={[styles.secondaryBtnText, isNeo && styles.secondaryBtnTextNeo]}>
                  {tr("随机头像", "Random Avatar")}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.secondaryBtn, isNeo && styles.secondaryBtnNeo]}
                onPress={handlePickProfileAvatar}
                disabled={uploadingProfileAvatar || savingProfile}
              >
                {uploadingProfileAvatar ? (
                  <ActivityIndicator size="small" color={isNeo ? "#dbeafe" : "#2563eb"} />
                ) : (
                  <Ionicons name="cloud-upload-outline" size={14} color={isNeo ? "#dbeafe" : "#2563eb"} />
                )}
                <Text style={[styles.secondaryBtnText, isNeo && styles.secondaryBtnTextNeo]}>
                  {tr("上传头像", "Upload Avatar")}
                </Text>
              </Pressable>
            </View>
            <Pressable
              style={[styles.primaryBtn, savingProfile && styles.disabledBtn]}
              onPress={handleSaveProfile}
              disabled={savingProfile}
            >
              {savingProfile ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <Ionicons name="save-outline" size={16} color="#ffffff" />
                  <Text style={styles.primaryBtnText}>{tr("保存资料", "Save Profile")}</Text>
                </>
              )}
            </Pressable>
            <View style={styles.inlineActions}>
              <Pressable style={[styles.secondaryBtn, isNeo && styles.secondaryBtnNeo]} onPress={handleGenerateMyQr}>
                {generatingMyQr ? (
                  <ActivityIndicator size="small" color={isNeo ? "#dbeafe" : "#2563eb"} />
                ) : (
                  <Ionicons name="qr-code-outline" size={14} color={isNeo ? "#dbeafe" : "#2563eb"} />
                )}
                <Text style={[styles.secondaryBtnText, isNeo && styles.secondaryBtnTextNeo]}>
                  {tr("我的二维码", "My QR")}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.secondaryBtn, isNeo && styles.secondaryBtnNeo, !myQrToken && styles.disabledBtn]}
                onPress={handleShareMyQr}
                disabled={!myQrToken}
              >
                <Ionicons name="share-social-outline" size={14} color={isNeo ? "#dbeafe" : "#2563eb"} />
                <Text style={[styles.secondaryBtnText, isNeo && styles.secondaryBtnTextNeo]}>
                  {tr("分享", "Share")}
                </Text>
              </Pressable>
            </View>
            {myQrToken ? (
              <View style={[styles.qrCard, isNeo && styles.qrCardNeo]}>
                {friendQrSvg ? <SvgXml xml={friendQrSvg} width={160} height={160} style={styles.qrImage} /> : null}
                <Text style={[styles.qrTitle, isNeo && styles.qrTitleNeo]}>{tr("好友二维码", "Friend QR")}</Text>
                <Text style={[styles.qrHint, isNeo && styles.qrHintNeo]}>{`${tr("有效期", "Expires")}: ${myQrExpiresAt || "-"}`}</Text>
                <Text selectable style={[styles.qrToken, isNeo && styles.qrTokenNeo]}>
                  {myQrToken}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={[styles.card, isNeo && styles.cardNeo]}>
            <Text style={[styles.cardTitle, isNeo && styles.cardTitleNeo]}>{tr("Bot 身份", "Bot Identity")}</Text>
            <View style={styles.profileRow}>
              <Image source={{ uri: avatar }} style={styles.profileAvatar} />
              <View style={styles.profileMeta}>
                <Text style={[styles.profileName, isNeo && styles.profileNameNeo]} numberOfLines={1}>
                  {name || tr("未命名 Bot", "Unnamed Bot")}
                </Text>
                <Text style={[styles.profileSubtext, isNeo && styles.profileSubtextNeo]}>
                  {tr("仍通过 bot-config 保存", "Still saved via bot-config")}
                </Text>
              </View>
            </View>
            <TextInput
              style={[styles.input, isNeo && styles.inputNeo]}
              value={name}
              onChangeText={setName}
              placeholder={tr("Bot 名称", "Bot name")}
              placeholderTextColor={isNeo ? "rgba(148,163,184,0.85)" : "#94a3b8"}
            />
            <TextInput
              style={[styles.input, isNeo && styles.inputNeo]}
              value={avatar}
              onChangeText={setAvatar}
              placeholder={tr("Bot 头像 URL", "Bot avatar URL")}
              autoCapitalize="none"
              placeholderTextColor={isNeo ? "rgba(148,163,184,0.85)" : "#94a3b8"}
            />
            <Pressable style={[styles.secondaryBtn, isNeo && styles.secondaryBtnNeo]} onPress={randomizeAvatar}>
              <Ionicons name="shuffle-outline" size={14} color={isNeo ? "#dbeafe" : "#1f2937"} />
              <Text style={[styles.secondaryBtnText, isNeo && styles.secondaryBtnTextNeo]}>
                {tr("随机头像", "Random Avatar")}
              </Text>
            </Pressable>
            <TextInput
              style={[styles.textarea, isNeo && styles.textareaNeo]}
              multiline
              value={instruction}
              onChangeText={setInstruction}
              placeholder={tr("系统指令", "System instruction")}
              placeholderTextColor={isNeo ? "rgba(148,163,184,0.85)" : "#94a3b8"}
            />
          </View>

          <View style={[styles.card, isNeo && styles.cardNeo]}>
            <Text style={[styles.cardTitle, isNeo && styles.cardTitleNeo]}>{tr("Skills Store", "Skills Store")}</Text>
            <Text style={[styles.sectionHint, isNeo && styles.sectionHintNeo]}>
              {tr(
                "这里显示系统技能目录，以及你已安装或上传的技能。",
                "Browse system skills and manage the skills you installed or uploaded."
              )}
            </Text>
            <Pressable style={[styles.secondaryBtn, isNeo && styles.secondaryBtnNeo]} onPress={handleOpenCreateSkill}>
              <Ionicons name="add-outline" size={16} color={isNeo ? "#dbeafe" : "#1f2937"} />
              <Text style={[styles.secondaryBtnText, isNeo && styles.secondaryBtnTextNeo]}>
                {tr("上传技能", "Upload Skill")}
              </Text>
            </Pressable>
            {mergedSkills.length === 0 ? (
              <Text style={[styles.emptyText, isNeo && styles.emptyTextNeo]}>
                {tr("暂无技能。", "No skills available.")}
              </Text>
            ) : (
              mergedSkills.map((skill) => (
                <View key={skill.id} style={[styles.listCard, isNeo && styles.listCardNeo]}>
                  <View style={styles.listHeader}>
                    <View style={styles.listHeaderMain}>
                      <Text style={[styles.listTitle, isNeo && styles.listTitleNeo]}>{skill.name}</Text>
                      <Text style={[styles.listMeta, isNeo && styles.listMetaNeo]}>
                        {skill.source === "system" ? tr("系统技能", "System") : tr("我的技能", "Mine")} · {skill.version}
                      </Text>
                    </View>
                    {skill.source === "system" ? (
                      <Pressable
                        style={[styles.installBtn, skillBusyId === skill.id && styles.disabledBtn]}
                        onPress={() => void handleToggleSystemSkill(skill)}
                        disabled={skillBusyId === skill.id}
                      >
                        <Text style={styles.installBtnText}>
                          {skillBusyId === skill.id
                            ? tr("处理中...", "Working...")
                            : skill.installed
                              ? tr("移除", "Remove")
                              : tr("安装", "Install")}
                        </Text>
                      </Pressable>
                    ) : (
                      <Pressable style={styles.installBtn} onPress={() => handleEditUserSkill(skill)}>
                        <Text style={styles.installBtnText}>{tr("编辑", "Edit")}</Text>
                      </Pressable>
                    )}
                  </View>
                  <Text style={[styles.listDescription, isNeo && styles.listDescriptionNeo]}>{skill.description || "-"}</Text>
                </View>
              ))
            )}
          </View>

          <View style={[styles.card, isNeo && styles.cardNeo]}>
            <Text style={[styles.cardTitle, isNeo && styles.cardTitleNeo]}>{tr("知识库", "Knowledge")}</Text>
            <Text style={[styles.sectionHint, isNeo && styles.sectionHintNeo]}>
              {tr(
                "这里显示你上传的知识库，可用于补充个人资料和上下文信息。",
                "Manage the knowledge files you uploaded for personal context and reference."
              )}
            </Text>
            <Pressable
              style={[styles.secondaryBtn, isNeo && styles.secondaryBtnNeo, uploadingKnowledge && styles.disabledBtn]}
              onPress={handleUploadKnowledge}
              disabled={uploadingKnowledge}
            >
              {uploadingKnowledge ? (
                <ActivityIndicator size="small" color={isNeo ? "#dbeafe" : "#2563eb"} />
              ) : (
                <Ionicons name="cloud-upload-outline" size={14} color={isNeo ? "#dbeafe" : "#2563eb"} />
              )}
              <Text style={[styles.secondaryBtnText, isNeo && styles.secondaryBtnTextNeo]}>
                {tr("上传知识库", "Upload Knowledge")}
              </Text>
            </Pressable>
            {knowledgeDatasets.length === 0 ? (
              <Text style={[styles.emptyText, isNeo && styles.emptyTextNeo]}>
                {tr("暂无知识库。", "No knowledge datasets yet.")}
              </Text>
            ) : (
              knowledgeDatasets.map((dataset) => {
                const busy = knowledgeBusyId === dataset.id;
                const editing = editingKnowledgeId === dataset.id;
                return (
                  <View key={dataset.id} style={[styles.listCard, isNeo && styles.listCardNeo]}>
                    <View style={styles.listHeader}>
                      <View style={styles.listHeaderMain}>
                        <Text style={[styles.listTitle, isNeo && styles.listTitleNeo]}>{dataset.name}</Text>
                        <Text style={[styles.listMeta, isNeo && styles.listMetaNeo]}>
                          {tr("条目", "Entries")}: {dataset.entries.length}
                        </Text>
                      </View>
                      <View style={styles.inlineMiniActions}>
                        <Pressable
                          style={[styles.iconBtn, isNeo && styles.iconBtnNeo]}
                          onPress={() => beginEditKnowledge(dataset)}
                          disabled={busy}
                        >
                          <Ionicons name="create-outline" size={16} color={isNeo ? "#dbeafe" : "#1f2937"} />
                        </Pressable>
                        <Pressable
                          style={[styles.iconBtn, isNeo && styles.iconBtnNeo]}
                          onPress={() => handleDeleteKnowledge(dataset)}
                          disabled={busy}
                        >
                          <Ionicons name="trash-outline" size={16} color="#ef4444" />
                        </Pressable>
                      </View>
                    </View>
                    {editing ? (
                      <>
                        <TextInput
                          style={[styles.input, isNeo && styles.inputNeo]}
                          value={editingKnowledgeName}
                          onChangeText={setEditingKnowledgeName}
                          placeholder={tr("知识库名称", "Knowledge name")}
                          placeholderTextColor={isNeo ? "rgba(148,163,184,0.85)" : "#94a3b8"}
                        />
                        <View style={styles.inlineActions}>
                          <Pressable
                            style={[styles.primaryBtn, busy && styles.disabledBtn]}
                            onPress={() => void handleSaveKnowledgeName(dataset.id)}
                            disabled={busy}
                          >
                            {busy ? (
                              <ActivityIndicator size="small" color="#ffffff" />
                            ) : (
                              <>
                                <Ionicons name="save-outline" size={16} color="#ffffff" />
                                <Text style={styles.primaryBtnText}>{tr("保存名称", "Save Name")}</Text>
                              </>
                            )}
                          </Pressable>
                          <Pressable
                            style={[styles.secondaryBtn, isNeo && styles.secondaryBtnNeo]}
                            onPress={() => {
                              setEditingKnowledgeId(null);
                              setEditingKnowledgeName("");
                            }}
                          >
                            <Ionicons name="close-outline" size={14} color={isNeo ? "#dbeafe" : "#1f2937"} />
                            <Text style={[styles.secondaryBtnText, isNeo && styles.secondaryBtnTextNeo]}>
                              {tr("取消", "Cancel")}
                            </Text>
                          </Pressable>
                        </View>
                      </>
                    ) : null}
                  </View>
                );
              })
            )}
          </View>

          <View style={[styles.card, isNeo && styles.cardNeo]}>
            <Text style={[styles.cardTitle, isNeo && styles.cardTitleNeo]}>{tr("显示设置", "Display")}</Text>
            <View style={styles.inlineActions}>
              <Pressable
                style={[styles.secondaryBtn, isNeo && styles.secondaryBtnNeo, uiTheme === "classic" && styles.selectedBtn]}
                onPress={() => updateUiTheme("classic")}
              >
                <Ionicons name="sunny-outline" size={14} color={uiTheme === "classic" ? "#ffffff" : isNeo ? "#dbeafe" : "#1f2937"} />
                <Text
                  style={[
                    styles.secondaryBtnText,
                    isNeo && styles.secondaryBtnTextNeo,
                    uiTheme === "classic" && styles.selectedBtnText,
                  ]}
                >
                  {tr("经典", "Classic")}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.secondaryBtn, isNeo && styles.secondaryBtnNeo, uiTheme === "neo" && styles.selectedBtn]}
                onPress={() => updateUiTheme("neo")}
              >
                <Ionicons name="moon-outline" size={14} color={uiTheme === "neo" ? "#ffffff" : isNeo ? "#dbeafe" : "#1f2937"} />
                <Text
                  style={[
                    styles.secondaryBtnText,
                    isNeo && styles.secondaryBtnTextNeo,
                    uiTheme === "neo" && styles.selectedBtnText,
                  ]}
                >
                  {tr("霓虹", "Neo")}
                </Text>
              </Pressable>
            </View>
            <View style={styles.inlineActions}>
              <Pressable
                style={[styles.secondaryBtn, isNeo && styles.secondaryBtnNeo, language === "zh" && styles.selectedBtn]}
                onPress={() => updateLanguage("zh")}
              >
                <Ionicons name="language-outline" size={14} color={language === "zh" ? "#ffffff" : isNeo ? "#dbeafe" : "#1f2937"} />
                <Text
                  style={[
                    styles.secondaryBtnText,
                    isNeo && styles.secondaryBtnTextNeo,
                    language === "zh" && styles.selectedBtnText,
                  ]}
                >
                  {tr("中文", "Chinese")}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.secondaryBtn, isNeo && styles.secondaryBtnNeo, language === "en" && styles.selectedBtn]}
                onPress={() => updateLanguage("en")}
              >
                <Ionicons name="language-outline" size={14} color={language === "en" ? "#ffffff" : isNeo ? "#dbeafe" : "#1f2937"} />
                <Text
                  style={[
                    styles.secondaryBtnText,
                    isNeo && styles.secondaryBtnTextNeo,
                    language === "en" && styles.selectedBtnText,
                  ]}
                >
                  {tr("英文", "English")}
                </Text>
              </Pressable>
            </View>
          </View>

          <Pressable style={[styles.signOutBtn, isNeo && styles.signOutBtnNeo]} onPress={handleSignOut}>
            <Ionicons name="log-out-outline" size={16} color={isNeo ? "#fda4af" : "#b91c1c"} />
            <Text style={[styles.signOutBtnText, isNeo && styles.signOutBtnTextNeo]}>{tr("退出登录", "Sign Out")}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        animationType="slide"
        transparent
        visible={skillModalVisible}
        onRequestClose={handleCloseSkillModal}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.modalKeyboardWrap}
          >
            <View style={[styles.modalCard, isNeo && styles.modalCardNeo]}>
              <View style={styles.modalTopRow}>
                <Text style={[styles.cardTitle, isNeo && styles.cardTitleNeo]}>
                  {skillEditor.id ? tr("编辑技能", "Edit Skill") : tr("上传技能", "Upload Skill")}
                </Text>
                <Pressable style={[styles.iconBtn, isNeo && styles.iconBtnNeo]} onPress={handleCloseSkillModal}>
                  <Ionicons name="close-outline" size={18} color={isNeo ? "#dbeafe" : "#1f2937"} />
                </Pressable>
              </View>
              <TextInput
                style={[styles.input, isNeo && styles.inputNeo]}
                value={skillEditor.name}
                onChangeText={(value) => setSkillEditor((previous) => ({ ...previous, name: value }))}
                placeholder={tr("技能名称", "Skill name")}
                placeholderTextColor={isNeo ? "rgba(148,163,184,0.85)" : "#94a3b8"}
              />
              <TextInput
                style={[styles.input, isNeo && styles.inputNeo]}
                value={skillEditor.description}
                onChangeText={(value) => setSkillEditor((previous) => ({ ...previous, description: value }))}
                placeholder={tr("技能描述", "Skill description")}
                placeholderTextColor={isNeo ? "rgba(148,163,184,0.85)" : "#94a3b8"}
              />
              <TextInput
                style={[styles.modalTextarea, styles.textarea, isNeo && styles.textareaNeo]}
                multiline
                value={skillEditor.markdown}
                onChangeText={(value) => setSkillEditor((previous) => ({ ...previous, markdown: value }))}
                placeholder={tr("技能内容 / Markdown", "Skill content / markdown")}
                placeholderTextColor={isNeo ? "rgba(148,163,184,0.85)" : "#94a3b8"}
              />
              <View style={styles.inlineActions}>
                <Pressable
                  style={[styles.primaryBtn, savingSkill && styles.disabledBtn]}
                  onPress={handleSubmitSkill}
                  disabled={savingSkill}
                >
                  {savingSkill ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <>
                      <Ionicons name="save-outline" size={16} color="#ffffff" />
                      <Text style={styles.primaryBtnText}>
                        {skillEditor.id ? tr("更新技能", "Update Skill") : tr("上传技能", "Upload Skill")}
                      </Text>
                    </>
                  )}
                </Pressable>
                <Pressable
                  style={[styles.secondaryBtn, isNeo && styles.secondaryBtnNeo]}
                  onPress={handleCloseSkillModal}
                  disabled={savingSkill}
                >
                  <Ionicons name="close-outline" size={14} color={isNeo ? "#dbeafe" : "#1f2937"} />
                  <Text style={[styles.secondaryBtnText, isNeo && styles.secondaryBtnTextNeo]}>
                    {tr("取消", "Cancel")}
                  </Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  safeAreaNeo: {
    backgroundColor: "#050816",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(148,163,184,0.32)",
  },
  headerNeo: {
    borderBottomColor: "rgba(148,163,184,0.18)",
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    backgroundColor: "#e2e8f0",
  },
  headerBtnNeo: {
    backgroundColor: "rgba(15,23,42,0.92)",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  headerTitleNeo: {
    color: "#f8fafc",
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#2563eb",
  },
  saveBtnNeo: {
    backgroundColor: "#dbeafe",
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#ffffff",
  },
  saveBtnTextNeo: {
    color: "#111827",
  },
  keyboardAvoid: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 18,
    gap: 14,
  },
  card: {
    borderRadius: 22,
    padding: 18,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.18)",
    gap: 12,
  },
  cardNeo: {
    backgroundColor: "rgba(10,15,30,0.92)",
    borderColor: "rgba(96,165,250,0.16)",
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  cardTitleNeo: {
    color: "#f8fafc",
  },
  sectionHint: {
    fontSize: 13,
    lineHeight: 18,
    color: "#64748b",
  },
  sectionHintNeo: {
    color: "rgba(148,163,184,0.9)",
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  profileAvatar: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: "#cbd5e1",
  },
  profileMeta: {
    flex: 1,
    gap: 4,
  },
  profileName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  profileNameNeo: {
    color: "#f8fafc",
  },
  profileSubtext: {
    fontSize: 13,
    color: "#64748b",
  },
  profileSubtextNeo: {
    color: "rgba(148,163,184,0.88)",
  },
  input: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#111827",
  },
  inputNeo: {
    borderColor: "rgba(96,165,250,0.16)",
    backgroundColor: "rgba(15,23,42,0.88)",
    color: "#f8fafc",
  },
  textarea: {
    minHeight: 140,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#111827",
    textAlignVertical: "top",
  },
  textareaNeo: {
    borderColor: "rgba(96,165,250,0.16)",
    backgroundColor: "rgba(15,23,42,0.88)",
    color: "#f8fafc",
  },
  inlineActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  inlineMiniActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  primaryBtn: {
    minHeight: 46,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  primaryBtnText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
  secondaryBtn: {
    minHeight: 42,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  secondaryBtnNeo: {
    backgroundColor: "rgba(15,23,42,0.88)",
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1f2937",
  },
  secondaryBtnTextNeo: {
    color: "#dbeafe",
  },
  selectedBtn: {
    backgroundColor: "#2563eb",
  },
  selectedBtnText: {
    color: "#ffffff",
  },
  disabledBtn: {
    opacity: 0.55,
  },
  qrCard: {
    alignItems: "center",
    gap: 8,
    borderRadius: 18,
    backgroundColor: "#eff6ff",
    padding: 16,
  },
  qrCardNeo: {
    backgroundColor: "rgba(15,23,42,0.88)",
  },
  qrImage: {
    marginBottom: 4,
  },
  qrTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  qrTitleNeo: {
    color: "#f8fafc",
  },
  qrHint: {
    fontSize: 12,
    color: "#64748b",
  },
  qrHintNeo: {
    color: "rgba(148,163,184,0.9)",
  },
  qrToken: {
    fontSize: 12,
    color: "#0f172a",
    textAlign: "center",
  },
  qrTokenNeo: {
    color: "#dbeafe",
  },
  listCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.22)",
    backgroundColor: "#f8fafc",
    padding: 14,
    gap: 8,
  },
  listCardNeo: {
    borderColor: "rgba(96,165,250,0.16)",
    backgroundColor: "rgba(15,23,42,0.84)",
  },
  listHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  listHeaderMain: {
    flex: 1,
    gap: 4,
  },
  listTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  listTitleNeo: {
    color: "#f8fafc",
  },
  listMeta: {
    fontSize: 12,
    color: "#64748b",
  },
  listMetaNeo: {
    color: "rgba(148,163,184,0.9)",
  },
  listDescription: {
    fontSize: 13,
    lineHeight: 18,
    color: "#334155",
  },
  listDescriptionNeo: {
    color: "#cbd5e1",
  },
  installBtn: {
    minWidth: 74,
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "#1d4ed8",
    alignItems: "center",
    justifyContent: "center",
  },
  installBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#ffffff",
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e2e8f0",
  },
  iconBtnNeo: {
    backgroundColor: "rgba(30,41,59,0.88)",
  },
  emptyText: {
    fontSize: 14,
    color: "#64748b",
  },
  emptyTextNeo: {
    color: "rgba(148,163,184,0.9)",
  },
  resourceState: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "#e0f2fe",
  },
  resourceStateError: {
    backgroundColor: "#fee2e2",
  },
  resourceStateText: {
    flex: 1,
    color: "#0f172a",
    fontSize: 13,
  },
  resourceStateTextNeo: {
    color: "#dbeafe",
  },
  resourceStateErrorText: {
    color: "#991b1b",
  },
  signOutBtn: {
    minHeight: 48,
    marginBottom: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.24)",
    backgroundColor: "#fff1f2",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  signOutBtnNeo: {
    backgroundColor: "rgba(69,10,10,0.45)",
    borderColor: "rgba(251,113,133,0.28)",
  },
  signOutBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#b91c1c",
  },
  signOutBtnTextNeo: {
    color: "#fecdd3",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(2,6,23,0.58)",
    justifyContent: "center",
    padding: 18,
  },
  modalKeyboardWrap: {
    width: "100%",
  },
  modalCard: {
    borderRadius: 24,
    backgroundColor: "#ffffff",
    padding: 18,
    gap: 12,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.18)",
  },
  modalCardNeo: {
    backgroundColor: "rgba(10,15,30,0.98)",
    borderColor: "rgba(96,165,250,0.18)",
  },
  modalTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  modalTextarea: {
    minHeight: 220,
  },
});
