import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { KeyframeBackground } from "@/src/components/KeyframeBackground";
import { EmptyState, LoadingSkeleton, StateBanner } from "@/src/components/StateBlocks";
import { APP_SAFE_AREA_EDGES } from "@/src/constants/safe-area";
import { tx } from "@/src/i18n/translate";
import {
  bindNPCKnowledge,
  bindNPCSkill,
  deleteNPC,
  formatApiError,
  getNPC,
  listKnowledgeDatasets,
  listSkillCatalog,
  unbindNPCKnowledge,
  unbindNPCSkill,
  updateNPC,
} from "@/src/lib/api";
import { useAgentTown } from "@/src/state/agenttown-context";
import type { KnowledgeDataset, NPC, SkillCatalogItem } from "@/src/types";

function normalizeEditableValue(value?: string) {
  return (value || "").trim();
}

function normalizeNPCStatus(value?: string): "active" | "inactive" {
  return (value || "").trim().toLowerCase() === "inactive" ? "inactive" : "active";
}

export default function NPCConfigScreen() {
  const router = useRouter();
  const { npcId, entrySource } = useLocalSearchParams<{
    npcId: string;
    entrySource?: string;
  }>();
  const { language } = useAgentTown();
  const tr = (zh: string, en: string) => tx(language, zh, en);

  const [npc, setNpc] = useState<NPC | null>(null);
  const [skillCatalog, setSkillCatalog] = useState<SkillCatalogItem[]>([]);
  const [knowledgeList, setKnowledgeList] = useState<KnowledgeDataset[]>([]);
  const [formName, setFormName] = useState("");
  const [formAvatarUrl, setFormAvatarUrl] = useState("");
  const [formIntro, setFormIntro] = useState("");
  const [formSystemPrompt, setFormSystemPrompt] = useState("");
  const [formModelName, setFormModelName] = useState("");
  const [formStatus, setFormStatus] = useState<"active" | "inactive">("active");
  const [selectedSkillScope, setSelectedSkillScope] = useState<"system" | "user">("system");
  const [selectedSkillIds, setSelectedSkillIds] = useState<Set<string>>(new Set());
  const [selectedKnowledgeIds, setSelectedKnowledgeIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingBasics, setSavingBasics] = useState(false);
  const [bindingSkills, setBindingSkills] = useState(false);
  const [unbindingId, setUnbindingId] = useState<string | null>(null);
  const [bindingKnowledge, setBindingKnowledge] = useState(false);
  const [unbindingKnowledgeId, setUnbindingKnowledgeId] = useState<string | null>(null);
  const [deletingNpc, setDeletingNpc] = useState(false);

  const syncNPC = useCallback((nextNpc: NPC, options?: { resetForm?: boolean }) => {
    setNpc(nextNpc);
    if (options?.resetForm) {
      setFormName(nextNpc.name || "");
      setFormAvatarUrl(nextNpc.avatarUrl || "");
      setFormIntro(nextNpc.intro || "");
      setFormSystemPrompt(nextNpc.systemPrompt || "");
      setFormModelName(nextNpc.modelName || "");
      setFormStatus(normalizeNPCStatus(nextNpc.status));
    }
  }, []);

  const loadPage = useCallback(async () => {
    if (!npcId) return;
    setLoading(true);
    try {
      const [npcDetail, skills, knowledge] = await Promise.all([
        getNPC(npcId),
        listSkillCatalog(),
        listKnowledgeDatasets(),
      ]);
      syncNPC(npcDetail, { resetForm: true });
      setSkillCatalog(skills);
      setKnowledgeList(knowledge);
      setSelectedKnowledgeIds(new Set());
      setError(null);
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setLoading(false);
    }
  }, [npcId, syncNPC]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const boundSkillIds = useMemo(
    () => new Set((npc?.skillBindings || []).map((item) => item.skillId)),
    [npc?.skillBindings]
  );
  const boundKnowledgeIds = useMemo(() => new Set(npc?.knowledgeIds || []), [npc?.knowledgeIds]);
  const canModifyNpc = (npc?.scope || "").trim().toLowerCase() !== "system";
  const showHeaderChatEntry = String(entrySource || "").trim().toLowerCase() !== "chat";
  const basicsDirty = useMemo(() => {
    if (!npc) return false;
    return (
      normalizeEditableValue(formName) !== normalizeEditableValue(npc.name) ||
      normalizeEditableValue(formAvatarUrl) !== normalizeEditableValue(npc.avatarUrl) ||
      normalizeEditableValue(formIntro) !== normalizeEditableValue(npc.intro) ||
      normalizeEditableValue(formSystemPrompt) !== normalizeEditableValue(npc.systemPrompt) ||
      normalizeEditableValue(formModelName) !== normalizeEditableValue(npc.modelName) ||
      formStatus !== normalizeNPCStatus(npc.status)
    );
  }, [formAvatarUrl, formIntro, formModelName, formName, formStatus, formSystemPrompt, npc]);

  const availableSkillRows = useMemo(
    () => skillCatalog.filter((item) => !boundSkillIds.has(item.id)),
    [boundSkillIds, skillCatalog]
  );
  const availableKnowledgeRows = useMemo(
    () => knowledgeList.filter((item) => !boundKnowledgeIds.has(item.id)),
    [boundKnowledgeIds, knowledgeList]
  );
  const boundKnowledgeRows = useMemo(
    () => knowledgeList.filter((item) => boundKnowledgeIds.has(item.id)),
    [boundKnowledgeIds, knowledgeList]
  );

  const toggleSkillSelection = (skillId: string) => {
    setSelectedSkillIds((prev) => {
      const next = new Set(prev);
      if (next.has(skillId)) {
        next.delete(skillId);
      } else {
        next.add(skillId);
      }
      return next;
    });
  };

  const toggleKnowledgeSelection = (datasetId: string) => {
    setSelectedKnowledgeIds((prev) => {
      const next = new Set(prev);
      if (next.has(datasetId)) {
        next.delete(datasetId);
      } else {
        next.add(datasetId);
      }
      return next;
    });
  };

  const handleBindSkills = async () => {
    if (!npc || !canModifyNpc || bindingSkills || selectedSkillIds.size === 0) return;
    setBindingSkills(true);
    setError(null);
    try {
      const ids = Array.from(selectedSkillIds);
      await Promise.all(ids.map((skillId) => bindNPCSkill(npc.id, skillId, selectedSkillScope)));
      const refreshed = await getNPC(npc.id);
      syncNPC(refreshed);
      setSelectedSkillIds(new Set());
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setBindingSkills(false);
    }
  };

  const handleUnbindSkill = async (bindingId: string) => {
    if (!npc || !canModifyNpc || !bindingId || unbindingId) return;
    setUnbindingId(bindingId);
    setError(null);
    try {
      await unbindNPCSkill(npc.id, bindingId);
      const refreshed = await getNPC(npc.id);
      syncNPC(refreshed);
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setUnbindingId(null);
    }
  };

  const handleSaveBasics = async () => {
    if (!npc || !canModifyNpc || savingBasics) return;
    const trimmedName = normalizeEditableValue(formName);
    const trimmedPrompt = normalizeEditableValue(formSystemPrompt);
    if (!trimmedName || !trimmedPrompt) return;
    setSavingBasics(true);
    setError(null);
    try {
      const updated = await updateNPC(npc.id, {
        name: trimmedName,
        avatar_url: normalizeEditableValue(formAvatarUrl) || undefined,
        intro: normalizeEditableValue(formIntro) || undefined,
        system_prompt: trimmedPrompt,
        model_name: normalizeEditableValue(formModelName) || undefined,
        status: formStatus,
      });
      syncNPC(updated, { resetForm: true });
      if (String(entrySource || "").trim()) {
        router.back();
      }
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setSavingBasics(false);
    }
  };

  const handleBindKnowledge = async () => {
    if (!npc || !canModifyNpc || bindingKnowledge || selectedKnowledgeIds.size === 0) return;
    setBindingKnowledge(true);
    setError(null);
    try {
      const ids = Array.from(selectedKnowledgeIds);
      await Promise.all(ids.map((datasetId) => bindNPCKnowledge(npc.id, datasetId)));
      const refreshed = await getNPC(npc.id);
      syncNPC(refreshed);
      setSelectedKnowledgeIds(new Set());
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setBindingKnowledge(false);
    }
  };

  const handleUnbindKnowledge = async (datasetId: string) => {
    if (!npc || !canModifyNpc || !datasetId || unbindingKnowledgeId) return;
    setUnbindingKnowledgeId(datasetId);
    setError(null);
    try {
      await unbindNPCKnowledge(npc.id, datasetId);
      const refreshed = await getNPC(npc.id);
      syncNPC(refreshed);
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setUnbindingKnowledgeId(null);
    }
  };

  const handleDeleteNPC = () => {
    if (!npc || !canModifyNpc || deletingNpc) return;
    Alert.alert(
      tr("删除 NPC", "Delete NPC"),
      tr(`确认删除 ${npc.name} 吗？`, `Delete ${npc.name}?`),
      [
        { text: tr("取消", "Cancel"), style: "cancel" },
        {
          text: tr("删除", "Delete"),
          style: "destructive",
          onPress: () => {
            void (async () => {
              setDeletingNpc(true);
              setError(null);
              try {
                await deleteNPC(npc.id);
                router.replace("/");
              } catch (err) {
                setError(formatApiError(err));
              } finally {
                setDeletingNpc(false);
              }
            })();
          },
        },
      ]
    );
  };

  const selectedSkillCount = selectedSkillIds.size;
  const selectedKnowledgeCount = selectedKnowledgeIds.size;
  const canSaveBasics =
    Boolean(npc) &&
    canModifyNpc &&
    !savingBasics &&
    normalizeEditableValue(formName).length > 0 &&
    normalizeEditableValue(formSystemPrompt).length > 0 &&
    basicsDirty;

  return (
    <KeyframeBackground>
      <SafeAreaView edges={APP_SAFE_AREA_EDGES} style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.keyboardAvoid}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
        >
        <View style={styles.container}>
          <View style={styles.headerRow}>
            <Pressable style={styles.backBtn} onPress={() => router.back()}>
              <Ionicons name="chevron-back" size={18} color="#e2e8f0" />
            </Pressable>
            <Text style={styles.title}>{tr("NPC 配置", "NPC Config")}</Text>
            {showHeaderChatEntry ? (
              <Pressable
                style={styles.headerAction}
                onPress={() =>
                  npc
                    ? router.push({
                        pathname: "/npc-chat/[npcId]" as never,
                        params: { npcId: npc.id, name: npc.name } as never,
                      })
                    : null
                }
              >
                <Ionicons name="chatbubble-ellipses-outline" size={16} color="rgba(191,219,254,0.96)" />
              </Pressable>
            ) : (
              <View style={styles.headerActionPlaceholder} />
            )}
          </View>

          {error ? (
            <StateBanner
              variant="error"
              title={tr("加载失败", "Load failed")}
              message={error}
              actionLabel={tr("重试", "Retry")}
              onAction={() => void loadPage()}
            />
          ) : null}

          {loading ? (
            <LoadingSkeleton kind="cards" />
          ) : !npc ? (
            <EmptyState
              title={tr("NPC 不存在", "NPC not found")}
              hint={tr("请返回上一页重试", "Go back and try again")}
              icon="alert-circle-outline"
            />
          ) : (
            <>
            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.heroCard}>
                <View style={styles.sectionTopRow}>
                  <View style={styles.heroTextWrap}>
                    <Text style={styles.heroTitle}>{tr("基础信息", "Basic Info")}</Text>
                    <Text style={styles.heroMeta}>
                      {canModifyNpc
                        ? tr("更新当前 NPC 的基础配置", "Update this NPC basic configuration")
                        : tr("系统级 NPC 当前仅支持只读查看", "System NPC is read-only")}
                    </Text>
                  </View>
                </View>

                <Text style={styles.formLabel}>{tr("Name *", "Name *")}</Text>
                <TextInput
                  value={formName}
                  onChangeText={setFormName}
                  editable={canModifyNpc}
                  placeholder={tr("输入 NPC 名称", "Enter NPC name")}
                  placeholderTextColor="rgba(148,163,184,0.88)"
                  style={[styles.input, !canModifyNpc && styles.inputReadonly]}
                />

                <Text style={styles.formLabel}>{tr("Avatar URL", "Avatar URL")}</Text>
                <TextInput
                  value={formAvatarUrl}
                  onChangeText={setFormAvatarUrl}
                  editable={canModifyNpc}
                  autoCapitalize="none"
                  placeholder={tr("输入头像地址", "Enter avatar URL")}
                  placeholderTextColor="rgba(148,163,184,0.88)"
                  style={[styles.input, !canModifyNpc && styles.inputReadonly]}
                />

                <Text style={styles.formLabel}>{tr("System Prompt *", "System Prompt *")}</Text>
                <TextInput
                  value={formSystemPrompt}
                  onChangeText={setFormSystemPrompt}
                  editable={canModifyNpc}
                  multiline
                  textAlignVertical="top"
                  placeholder={tr("输入系统提示词", "Enter system prompt")}
                  placeholderTextColor="rgba(148,163,184,0.88)"
                  style={[styles.input, styles.textareaLg, !canModifyNpc && styles.inputReadonly]}
                />

                <Text style={styles.helperText}>
                  {tr("这里决定 NPC 的说话风格、身份设定和边界。", "This controls the NPC tone, persona, and boundaries.")}
                </Text>

                <Text style={styles.formLabel}>{tr("Intro", "Intro")}</Text>
                <TextInput
                  value={formIntro}
                  onChangeText={setFormIntro}
                  editable={canModifyNpc}
                  multiline
                  textAlignVertical="top"
                  placeholder={tr("输入 NPC 简介", "Enter NPC intro")}
                  placeholderTextColor="rgba(148,163,184,0.88)"
                  style={[styles.input, styles.textareaSm, !canModifyNpc && styles.inputReadonly]}
                />

                <Text style={styles.formLabel}>{tr("Model Name", "Model Name")}</Text>
                <TextInput
                  value={formModelName}
                  onChangeText={setFormModelName}
                  editable={canModifyNpc}
                  autoCapitalize="none"
                  placeholder="gpt-4.1-mini"
                  placeholderTextColor="rgba(148,163,184,0.88)"
                  style={[styles.input, !canModifyNpc && styles.inputReadonly]}
                />

                <Text style={styles.formLabel}>{tr("Status", "Status")}</Text>
                <View style={styles.statusRow}>
                  <Pressable
                    style={[styles.statusChip, formStatus === "active" && styles.statusChipActive, !canModifyNpc && styles.statusChipDisabled]}
                    disabled={!canModifyNpc}
                    onPress={() => setFormStatus("active")}
                  >
                    <Text style={[styles.statusChipText, formStatus === "active" && styles.statusChipTextActive]}>
                      {tr("启用", "Active")}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[styles.statusChip, formStatus === "inactive" && styles.statusChipActive, !canModifyNpc && styles.statusChipDisabled]}
                    disabled={!canModifyNpc}
                    onPress={() => setFormStatus("inactive")}
                  >
                    <Text style={[styles.statusChipText, formStatus === "inactive" && styles.statusChipTextActive]}>
                      {tr("停用", "Inactive")}
                    </Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.sectionCard}>
                <View style={styles.sectionTopRow}>
                  <View style={styles.sectionCopy}>
                    <Text style={styles.sectionTitle}>{tr("技能绑定", "Skill Binding")}</Text>
                    <Text style={styles.sectionSubtitle}>
                      {tr("选择多个技能后一次绑定到当前 NPC", "Select multiple skills and bind them to this NPC")}
                    </Text>
                  </View>
                  <Pressable
                    style={[
                      styles.primaryPill,
                      styles.sectionActionPill,
                      (!canModifyNpc || selectedSkillCount === 0 || bindingSkills) && styles.primaryPillDisabled,
                    ]}
                    disabled={!canModifyNpc || selectedSkillCount === 0 || bindingSkills}
                    onPress={handleBindSkills}
                  >
                    {bindingSkills ? (
                      <ActivityIndicator size="small" color="#0b1220" />
                    ) : (
                      <Text style={styles.primaryPillText}>
                        {selectedSkillCount > 0
                          ? tr(
                              `绑定 ${selectedSkillCount} 项 (${selectedSkillScope})`,
                              `Bind ${selectedSkillCount} (${selectedSkillScope})`
                            )
                          : tr("绑定技能", "Bind Skills")}
                      </Text>
                    )}
                  </Pressable>
                </View>

                <View style={styles.scopeRow}>
                  <Pressable
                    style={[styles.scopeChip, selectedSkillScope === "system" && styles.scopeChipActive]}
                    onPress={() => setSelectedSkillScope("system")}
                  >
                    <Text style={[styles.scopeChipText, selectedSkillScope === "system" && styles.scopeChipTextActive]}>
                      {tr("System", "System")}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[styles.scopeChip, selectedSkillScope === "user" && styles.scopeChipActive]}
                    onPress={() => setSelectedSkillScope("user")}
                  >
                    <Text style={[styles.scopeChipText, selectedSkillScope === "user" && styles.scopeChipTextActive]}>
                      {tr("User", "User")}
                    </Text>
                  </Pressable>
                </View>

                {availableSkillRows.length === 0 ? (
                  <EmptyState
                    title={tr("没有可绑定技能", "No skills available")}
                    hint={tr("当前技能目录为空或已全部绑定", "Skill catalog is empty or already bound")}
                    icon="sparkles-outline"
                  />
                ) : (
                  <View style={styles.tagGrid}>
                    {availableSkillRows.map((skill) => {
                      const active = selectedSkillIds.has(skill.id);
                      return (
                        <Pressable
                          key={skill.id}
                          style={[styles.tagItem, active && styles.tagItemActive]}
                          onPress={() => toggleSkillSelection(skill.id)}
                        >
                          <Text style={[styles.tagTitle, active && styles.tagTitleActive]}>{skill.name}</Text>
                          <Text style={[styles.tagDesc, active && styles.tagDescActive]} numberOfLines={2}>
                            {skill.description || tr("暂无描述", "No description")}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}

                <View style={styles.boundSection}>
                  <Text style={styles.subSectionTitle}>{tr("已绑定技能", "Bound Skills")}</Text>
                  {npc.skillBindings.length === 0 ? (
                    <EmptyState
                      title={tr("尚未绑定技能", "No skills bound yet")}
                      hint={tr("从上方技能目录中选择后进行绑定", "Select skills above and bind them")}
                      icon="hardware-chip-outline"
                    />
                  ) : (
                    <View style={styles.boundList}>
                      {npc.skillBindings.map((binding) => (
                        <View key={binding.id} style={styles.boundRow}>
                          <View style={styles.boundTextWrap}>
                            <Text style={styles.boundTitle}>{`${binding.skillName} (${binding.skillScope})`}</Text>
                          </View>
                          <Pressable
                            style={[styles.secondaryPill, (!canModifyNpc || unbindingId === binding.id) && styles.secondaryPillDisabled]}
                            disabled={!canModifyNpc || unbindingId === binding.id}
                            onPress={() => void handleUnbindSkill(binding.id)}
                          >
                            {unbindingId === binding.id ? (
                              <ActivityIndicator size="small" color="#f8fafc" />
                            ) : (
                              <Text style={styles.secondaryPillText}>{tr("解绑", "Unbind")}</Text>
                            )}
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </View>

              <View style={styles.sectionCard}>
                <View style={styles.sectionTopRow}>
                  <View style={styles.sectionCopy}>
                    <Text style={styles.sectionTitle}>{tr("知识库绑定", "Knowledge Binding")}</Text>
                    <Text style={styles.sectionSubtitle}>
                      {tr("选择多个知识库后一次绑定到当前 NPC", "Select multiple datasets and bind them to this NPC")}
                    </Text>
                  </View>
                  <Pressable
                    style={[
                      styles.primaryPill,
                      styles.sectionActionPill,
                      (!canModifyNpc || selectedKnowledgeCount === 0 || bindingKnowledge) && styles.primaryPillDisabled,
                    ]}
                    disabled={!canModifyNpc || selectedKnowledgeCount === 0 || bindingKnowledge}
                    onPress={() => void handleBindKnowledge()}
                  >
                    {bindingKnowledge ? (
                      <ActivityIndicator size="small" color="#0b1220" />
                    ) : (
                      <Text style={styles.primaryPillText}>
                        {selectedKnowledgeCount > 0
                          ? tr(`绑定 ${selectedKnowledgeCount} 项`, `Bind ${selectedKnowledgeCount}`)
                          : tr("绑定知识库", "Bind Knowledge")}
                      </Text>
                    )}
                  </Pressable>
                </View>

                {availableKnowledgeRows.length === 0 ? (
                  <EmptyState
                    title={tr("没有可绑定知识库", "No datasets available")}
                    hint={tr("当前知识库目录为空或已全部绑定", "Dataset catalog is empty or already bound")}
                    icon="library-outline"
                  />
                ) : (
                  <View style={styles.tagGrid}>
                    {availableKnowledgeRows.map((dataset) => {
                      const active = selectedKnowledgeIds.has(dataset.id);
                      return (
                        <Pressable
                          key={dataset.id}
                          style={[styles.tagItem, active && styles.tagItemActive]}
                          onPress={() => toggleKnowledgeSelection(dataset.id)}
                        >
                          <Text style={[styles.tagTitle, active && styles.tagTitleActive]}>{dataset.name}</Text>
                          <Text style={[styles.tagDesc, active && styles.tagDescActive]}>
                            {tr(`${dataset.entries.length} 条内容`, `${dataset.entries.length} entries`)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}

                <View style={styles.boundSection}>
                  <Text style={styles.subSectionTitle}>{tr("已绑定知识库", "Bound Knowledge")}</Text>
                  {boundKnowledgeRows.length === 0 ? (
                    <EmptyState
                      title={tr("尚未绑定知识库", "No datasets bound yet")}
                      hint={tr("从上方知识库列表中选择后进行绑定", "Select datasets above and bind them")}
                      icon="albums-outline"
                    />
                  ) : (
                    <View style={styles.boundList}>
                      {boundKnowledgeRows.map((dataset) => (
                        <View key={dataset.id} style={styles.boundRow}>
                          <View style={styles.boundTextWrap}>
                            <Text style={styles.boundTitle}>{dataset.name}</Text>
                            <Text style={styles.boundMeta}>
                              {tr(`${dataset.entries.length} 条内容`, `${dataset.entries.length} entries`)}
                            </Text>
                          </View>
                          <Pressable
                            style={[
                              styles.secondaryPill,
                              (!canModifyNpc || unbindingKnowledgeId === dataset.id) && styles.secondaryPillDisabled,
                            ]}
                            disabled={!canModifyNpc || unbindingKnowledgeId === dataset.id}
                            onPress={() => void handleUnbindKnowledge(dataset.id)}
                          >
                            {unbindingKnowledgeId === dataset.id ? (
                              <ActivityIndicator size="small" color="#f8fafc" />
                            ) : (
                              <Text style={styles.secondaryPillText}>{tr("解绑", "Unbind")}</Text>
                            )}
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </View>

              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>{tr("危险操作", "Danger Zone")}</Text>
                <Text style={styles.sectionSubtitle}>
                  {tr("删除 NPC 后将返回首页，当前操作不可撤销。", "Deleting this NPC returns to Home and cannot be undone.")}
                </Text>
                <Pressable
                  style={[styles.dangerBtn, (!canModifyNpc || deletingNpc) && styles.secondaryPillDisabled]}
                  disabled={!canModifyNpc || deletingNpc}
                  onPress={handleDeleteNPC}
                >
                  {deletingNpc ? (
                    <ActivityIndicator size="small" color="#fff1f2" />
                  ) : (
                    <Text style={styles.dangerBtnText}>{tr("删除 NPC", "Delete NPC")}</Text>
                  )}
                </Pressable>
              </View>
            </ScrollView>
            <View style={styles.footerBar}>
              <View style={styles.footerCopy}>
                <Text style={styles.footerTitle}>{tr("Prompt 与基础信息", "Prompt and basics")}</Text>
                <Text style={styles.footerHint}>
                  {canModifyNpc
                    ? tr("修改后点保存立即生效。", "Tap Save to apply changes immediately.")
                    : tr("系统级 NPC 当前为只读。", "System NPC is currently read-only.")}
                </Text>
              </View>
              <Pressable
                style={[styles.primaryPill, styles.footerSaveBtn, !canSaveBasics && styles.primaryPillDisabled]}
                disabled={!canSaveBasics}
                onPress={() => void handleSaveBasics()}
              >
                {savingBasics ? (
                  <ActivityIndicator size="small" color="#0b1220" />
                ) : (
                  <Text style={styles.primaryPillText}>{tr("保存", "Save")}</Text>
                )}
              </Pressable>
            </View>
            </>
          )}
        </View>
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
    gap: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
  title: {
    flex: 1,
    color: "#e2e8f0",
    fontSize: 16,
    fontWeight: "900",
    textAlign: "center",
  },
  headerAction: {
    width: 40,
    height: 40,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(191,219,254,0.18)",
    backgroundColor: "rgba(30,41,59,0.55)",
  },
  headerActionPlaceholder: {
    width: 40,
    height: 40,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingBottom: 120,
    gap: 12,
  },
  heroCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(15,23,42,0.68)",
    padding: 16,
    gap: 8,
  },
  heroTextWrap: {
    flex: 1,
    gap: 4,
  },
  heroTitle: {
    color: "#f8fafc",
    fontSize: 16,
    fontWeight: "900",
  },
  heroMeta: {
    color: "rgba(147,197,253,0.95)",
    fontSize: 12,
    fontWeight: "800",
  },
  formLabel: {
    color: "rgba(191,219,254,0.95)",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 4,
  },
  helperText: {
    color: "rgba(148,163,184,0.92)",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 2,
  },
  input: {
    minHeight: 46,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(2,6,23,0.45)",
    color: "#e2e8f0",
    paddingHorizontal: 14,
    fontSize: 14,
    fontWeight: "600",
  },
  inputReadonly: {
    opacity: 0.72,
  },
  textareaSm: {
    minHeight: 88,
    paddingTop: 12,
    paddingBottom: 12,
  },
  textareaLg: {
    minHeight: 144,
    paddingTop: 12,
    paddingBottom: 12,
  },
  statusRow: {
    flexDirection: "row",
    gap: 10,
  },
  statusChip: {
    flex: 1,
    minHeight: 40,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(2,6,23,0.38)",
    alignItems: "center",
    justifyContent: "center",
  },
  statusChipActive: {
    borderColor: "rgba(147,197,253,0.78)",
    backgroundColor: "rgba(30,64,175,0.28)",
  },
  statusChipDisabled: {
    opacity: 0.55,
  },
  statusChipText: {
    color: "rgba(226,232,240,0.9)",
    fontSize: 13,
    fontWeight: "800",
  },
  statusChipTextActive: {
    color: "#dbeafe",
  },
  sectionCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(15,23,42,0.62)",
    padding: 16,
    gap: 12,
  },
  sectionTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  sectionCopy: {
    flex: 1,
    minWidth: 0,
  },
  sectionTitle: {
    color: "#f8fafc",
    fontSize: 15,
    fontWeight: "900",
  },
  sectionSubtitle: {
    color: "rgba(148,163,184,0.95)",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  primaryPill: {
    minHeight: 38,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    backgroundColor: "#bfdbfe",
  },
  sectionActionPill: {
    maxWidth: "100%",
    alignSelf: "flex-start",
  },
  primaryPillDisabled: {
    opacity: 0.45,
  },
  primaryPillText: {
    color: "#0b1220",
    fontSize: 12,
    fontWeight: "900",
  },
  tagGrid: {
    gap: 10,
  },
  scopeRow: {
    flexDirection: "row",
    gap: 10,
  },
  scopeChip: {
    flex: 1,
    minHeight: 38,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(2,6,23,0.38)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  scopeChipActive: {
    borderColor: "rgba(147,197,253,0.78)",
    backgroundColor: "rgba(30,64,175,0.28)",
  },
  scopeChipText: {
    color: "rgba(226,232,240,0.9)",
    fontSize: 13,
    fontWeight: "800",
  },
  scopeChipTextActive: {
    color: "#dbeafe",
  },
  tagItem: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(2,6,23,0.38)",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  tagItemActive: {
    borderColor: "rgba(147,197,253,0.78)",
    backgroundColor: "rgba(30,64,175,0.28)",
  },
  tagTitle: {
    color: "rgba(248,250,252,0.95)",
    fontSize: 13,
    fontWeight: "800",
  },
  tagTitleActive: {
    color: "#dbeafe",
  },
  tagDesc: {
    color: "rgba(148,163,184,0.92)",
    fontSize: 12,
    lineHeight: 17,
  },
  tagDescActive: {
    color: "rgba(191,219,254,0.9)",
  },
  boundSection: {
    gap: 10,
  },
  subSectionTitle: {
    color: "rgba(191,219,254,0.95)",
    fontSize: 13,
    fontWeight: "800",
  },
  boundList: {
    gap: 10,
  },
  boundRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(2,6,23,0.38)",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  boundTextWrap: {
    flex: 1,
  },
  boundTitle: {
    color: "rgba(248,250,252,0.95)",
    fontSize: 13,
    fontWeight: "800",
  },
  boundMeta: {
    color: "rgba(148,163,184,0.92)",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  secondaryPill: {
    minHeight: 34,
    borderRadius: 999,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(239,68,68,0.18)",
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.28)",
  },
  secondaryPillDisabled: {
    opacity: 0.55,
  },
  secondaryPillText: {
    color: "#f8fafc",
    fontSize: 12,
    fontWeight: "800",
  },
  dangerBtn: {
    minHeight: 46,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(127,29,29,0.68)",
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.35)",
  },
  dangerBtnText: {
    color: "#fff1f2",
    fontSize: 13,
    fontWeight: "900",
  },
  footerBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(15,23,42,0.88)",
    marginBottom: 4,
  },
  footerCopy: {
    flex: 1,
    gap: 2,
  },
  footerTitle: {
    color: "#f8fafc",
    fontSize: 13,
    fontWeight: "800",
  },
  footerHint: {
    color: "rgba(148,163,184,0.9)",
    fontSize: 12,
    lineHeight: 17,
  },
  footerSaveBtn: {
    minWidth: 96,
  },
});
