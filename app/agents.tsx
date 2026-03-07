import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Alert,
  Image,
  Modal,
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
import { formatApiError } from "@/src/lib/api";
import { useAgentTown } from "@/src/state/agenttown-context";

export default function AgentsScreen() {
  const router = useRouter();
  const {
    agents,
    skillCatalog,
    customSkills,
    language,
    bootstrapReady,
    createAgent,
    toggleAgentSkill,
    createCustomSkill,
    patchCustomSkill,
    removeCustomSkill,
    executeCustomSkill,
  } = useAgentTown();
  const tr = (zh: string, en: string) => tx(language, zh, en);

  const [createModal, setCreateModal] = useState(false);
  const [skillModal, setSkillModal] = useState(false);
  const [name, setName] = useState("");
  const [persona, setPersona] = useState("");
  const [rolePrompt, setRolePrompt] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarInputVisible, setAvatarInputVisible] = useState(false);
  const [creatingAgent, setCreatingAgent] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [skillName, setSkillName] = useState("");
  const [skillDesc, setSkillDesc] = useState("");
  const [skillMarkdown, setSkillMarkdown] = useState("# Ability\n- Describe what this skill does\n\n## Inputs\n- input: user request\n\n## Output\n- concise actionable response");
  const [runningSkillId, setRunningSkillId] = useState<string | null>(null);
  const [skillOutput, setSkillOutput] = useState<string>("");

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === (selectedAgentId || agents[0]?.id)) || null,
    [agents, selectedAgentId]
  );

  const displayCatalogSkill = (skill: { id: string; name: string; description: string }) => {
    if (skill.id === "skill_reminder_scheduler") {
      return {
        name: tr("提醒助手", "Reminder Scheduler"),
        description: tr(
          "解析“10分钟后提醒我喝水 / 下个月1号提醒我生日”等自然语言并自动创建提醒任务。",
          "Parse natural-language reminder requests and auto-create scheduled reminder tasks."
        ),
      };
    }
    return { name: skill.name, description: skill.description };
  };

  const handleCreate = async () => {
    const safeName = name.trim();
    if (!safeName || creatingAgent) return;
    setError(null);
    setCreatingAgent(true);

    try {
      const created = await createAgent({
        name: safeName,
        avatar: avatarUrl.trim() || undefined,
        persona: persona.trim(),
        rolePrompt: rolePrompt.trim(),
        description: persona.trim(),
        tools: ["chat", "task_decomposer"],
      });

      if (created?.id) {
        setSelectedAgentId(created.id);
        setCreateModal(false);
        setName("");
        setPersona("");
        setRolePrompt("");
        setAvatarUrl("");
        setAvatarInputVisible(false);
      } else {
        setError(tr("创建失败，请重试", "Create failed, please retry"));
      }
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setCreatingAgent(false);
    }
  };

  const handleCreateCustomSkill = async () => {
    const safeName = skillName.trim();
    const safeMarkdown = skillMarkdown.trim();
    if (!safeName || !safeMarkdown) return;

    setError(null);
    try {
      const created = await createCustomSkill({
        name: safeName,
        description: skillDesc.trim(),
        markdown: safeMarkdown,
        permissionScope: "chat:read,tasks:write",
        executor: "sandbox",
      });

      if (created) {
        setSkillModal(false);
        setSkillName("");
        setSkillDesc("");
        setSkillOutput("");
      }
    } catch (err) {
      setError(formatApiError(err));
    }
  };

  const confirmRemoveSkillFromAgent = (skillId: string, skillName: string) => {
    if (!selectedAgent) return;
    Alert.alert(
      tr("移除 Skill", "Remove skill"),
      tr(
        `确认从 ${selectedAgent.name} 移除 ${skillName} 吗？`,
        `Remove ${skillName} from ${selectedAgent.name}?`
      ),
      [
        { text: tr("取消", "Cancel"), style: "cancel" },
        {
          text: tr("移除", "Remove"),
          style: "destructive",
          onPress: () => {
            void toggleAgentSkill(selectedAgent.id, skillId, false).catch((err) =>
              setError(formatApiError(err))
            );
          },
        },
      ]
    );
  };

  const confirmDeleteCustomSkill = (skillId: string, skillName: string) => {
    Alert.alert(
      tr("删除 Skill", "Delete skill"),
      tr(
        `确认删除 ${skillName} 吗？此操作不可撤销。`,
        `Delete ${skillName}? This cannot be undone.`
      ),
      [
        { text: tr("取消", "Cancel"), style: "cancel" },
        {
          text: tr("删除", "Delete"),
          style: "destructive",
          onPress: () => {
            void removeCustomSkill(skillId).catch((err) =>
              setError(formatApiError(err))
            );
          },
        },
      ]
    );
  };

  return (
    <KeyframeBackground>
      <SafeAreaView edges={APP_SAFE_AREA_EDGES} style={styles.safeArea}>
        <View style={styles.container}>
          <View style={styles.headerRow}>
            <Pressable style={styles.backBtn} onPress={() => router.back()}>
              <Ionicons name="chevron-back" size={18} color="#e2e8f0" />
            </Pressable>
            <Text style={styles.title}>{tr("Bots", "Bots")}</Text>
            <View style={styles.headerActions}>
              <Pressable style={styles.headerIcon} onPress={() => setSkillModal(true)}>
                <Ionicons name="document-text-outline" size={16} color="rgba(226,232,240,0.92)" />
              </Pressable>
              <Pressable style={styles.headerIconPrimary} onPress={() => setCreateModal(true)}>
                <Ionicons name="person-add-outline" size={16} color="#0b1220" />
              </Pressable>
            </View>
          </View>

          {error ? (
            <StateBanner
              variant="error"
              title={tr("操作失败", "Action failed")}
              message={error}
              actionLabel={tr("关闭", "Dismiss")}
              onAction={() => setError(null)}
            />
          ) : null}

          {!bootstrapReady ? (
            <LoadingSkeleton kind="cards" />
          ) : (
            <>
              <Text style={styles.sectionTitle}>{tr("我的 Bots", "My Bots")}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.agentRow}>
                {agents.map((agent) => {
                  const active = selectedAgent?.id === agent.id;
                  return (
                    <Pressable
                      key={agent.id}
                      style={[styles.agentCard, active && styles.agentCardActive]}
                      onPress={() => setSelectedAgentId(agent.id)}
                    >
                      <Text style={styles.agentName} numberOfLines={1}>
                        {agent.name}
                      </Text>
                      <Text style={styles.agentPersona} numberOfLines={2}>
                        {agent.persona || agent.description || tr("未填写 persona", "No persona")}
                      </Text>
                      <View style={styles.agentFooter}>
                        <Text style={styles.agentStatus}>{agent.status}</Text>
                        <Text style={styles.agentSkillCount}>
                          {tr(`${agent.installedSkillIds.length} 个技能`, `${agent.installedSkillIds.length} skills`)}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
                {agents.length === 0 ? (
                  <EmptyState
                    title={tr("暂无 Bot", "No bots yet")}
                    hint={tr("点击右上角创建一个 Bot", "Tap the top-right button to create a bot")}
                    icon="hardware-chip-outline"
                  />
                ) : null}
              </ScrollView>

              <Text style={styles.sectionTitle}>{tr("Skill Store", "Skill Store")}</Text>
              <ScrollView contentContainerStyle={styles.skillList} showsVerticalScrollIndicator={false}>
                {skillCatalog.map((skill) => {
                  const installed = Boolean(selectedAgent?.installedSkillIds?.includes(skill.id));
                  const display = displayCatalogSkill(skill);
                  return (
                    <View key={skill.id} style={styles.skillCard}>
                      <View style={styles.skillMain}>
                        <Text style={styles.skillName}>{display.name}</Text>
                        <Text style={styles.skillDesc}>{display.description}</Text>
                        <Text style={styles.skillMeta}>
                          {skill.type} · {skill.version}
                        </Text>
                        <Text style={styles.skillMeta}>{skill.permissionScope}</Text>
                      </View>
                      <Pressable
                        style={[styles.skillBtn, installed && styles.skillBtnInstalled, !selectedAgent && styles.skillBtnDisabled]}
                        disabled={!selectedAgent}
                        onPress={() => {
                          if (!selectedAgent) return;
                          if (installed) {
                            confirmRemoveSkillFromAgent(skill.id, display.name);
                            return;
                          }
                          void toggleAgentSkill(selectedAgent.id, skill.id, true).catch((err) =>
                            setError(formatApiError(err))
                          );
                        }}
                      >
                        <Text style={styles.skillBtnText}>{installed ? tr("移除", "Remove") : tr("安装", "Install")}</Text>
                      </Pressable>
                    </View>
                  );
                })}

                <Text style={[styles.sectionTitle, { marginTop: 10 }]}>
                  {tr("自定义 Skill（Markdown）", "Custom Skills (Markdown)")}
                </Text>
                {customSkills.map((skill) => (
                  <View key={skill.id} style={styles.skillCard}>
                    <View style={styles.skillMain}>
                      <Text style={styles.skillName}>{skill.name}</Text>
                      <Text style={styles.skillDesc}>{skill.description || tr("无描述", "No description")}</Text>
                      <Text style={styles.skillMeta}>
                        {skill.executor} · {skill.version}
                      </Text>
                      <Text style={styles.skillMeta}>{skill.permissionScope}</Text>
                      <Text style={styles.skillMeta}>
                        {tr("状态", "Status")}: {skill.enabled ? tr("启用", "Enabled") : tr("禁用", "Disabled")}
                      </Text>
                    </View>
                    <View style={styles.customSkillActions}>
                      <Pressable
                        style={[styles.skillBtn, (runningSkillId !== null || !skill.enabled) && styles.skillBtnDisabled]}
                        disabled={runningSkillId !== null || !skill.enabled}
                        onPress={async () => {
                          setError(null);
                          setRunningSkillId(skill.id);
                          try {
                            const output = await executeCustomSkill(
                              skill.id,
                              tr("请根据你的技能说明，输出可执行步骤", "Explain your executable steps based on the skill markdown")
                            );
                            if (output) {
                              setSkillOutput(`${skill.name}:\n${output}`);
                            }
                          } catch (err) {
                            setError(formatApiError(err));
                          } finally {
                            setRunningSkillId(null);
                          }
                        }}
                      >
                        <Text style={styles.skillBtnText}>
                          {runningSkillId === skill.id ? tr("执行中...", "Running...") : tr("测试执行", "Run Test")}
                        </Text>
                      </Pressable>
                      <Pressable
                        style={styles.toggleBtn}
                        onPress={() => {
                          void patchCustomSkill(skill.id, { enabled: !skill.enabled }).catch((err) =>
                            setError(formatApiError(err))
                          );
                        }}
                      >
                        <Text style={styles.toggleBtnText}>{skill.enabled ? tr("禁用", "Disable") : tr("启用", "Enable")}</Text>
                      </Pressable>
                      <Pressable
                        style={styles.deleteBtn}
                        onPress={() => confirmDeleteCustomSkill(skill.id, skill.name)}
                      >
                        <Text style={styles.deleteBtnText}>{tr("删除", "Delete")}</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
                {customSkills.length === 0 ? (
                  <EmptyState title={tr("暂无自定义 Skill", "No custom skills")} hint={tr("右上角上传一个 Skill", "Use the upload button to add one")} icon="document-text-outline" />
                ) : null}

                {skillOutput ? (
                  <View style={styles.outputCard}>
                    <Text style={styles.outputTitle}>{tr("执行输出", "Execution Output")}</Text>
                    <Text style={styles.outputText}>{skillOutput}</Text>
                  </View>
                ) : null}
              </ScrollView>
            </>
          )}
        </View>

        <Modal visible={createModal} transparent animationType="fade" onRequestClose={() => setCreateModal(false)}>
          <Pressable style={styles.modalOverlay} onPress={() => setCreateModal(false)}>
            <Pressable style={styles.modalCard} onPress={() => null}>
              <View style={styles.modalHeader}>
                <View style={styles.modalHeaderLeft}>
                  <View style={styles.modalTitleIcon}>
                    <Ionicons name="sparkles-outline" size={14} color="#bfdbfe" />
                  </View>
                  <Text style={styles.modalTitle}>{tr("Create Bot", "Create Bot")}</Text>
                </View>
                <Pressable style={styles.closeBtn} onPress={() => setCreateModal(false)}>
                  <Ionicons name="close" size={16} color="rgba(226,232,240,0.85)" />
                </Pressable>
              </View>

              <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
                <View style={styles.avatarArea}>
                  <View style={styles.avatarRingWrap}>
                    <View style={styles.avatarRing}>
                      {avatarUrl.trim() ? (
                        <Image source={{ uri: avatarUrl.trim() }} style={styles.avatarImage} />
                      ) : (
                        <Ionicons name="person" size={32} color="rgba(226,232,240,0.55)" />
                      )}
                    </View>
                    <Pressable style={styles.avatarUploadBtn} onPress={() => setAvatarInputVisible((v) => !v)}>
                      <Ionicons name="cloud-upload-outline" size={16} color="#ffffff" />
                    </Pressable>
                  </View>
                  <Text style={styles.avatarLabel}>{tr("上传头像", "Upload Avatar")}</Text>
                  <Text style={styles.avatarHint}>
                    {avatarUrl.trim() ? tr("已选择", "Selected") : tr("未选择文件", "No file chosen")}
                  </Text>
                </View>

                {avatarInputVisible ? (
                  <View style={styles.inlineBox}>
                    <Text style={styles.fieldLabel}>{tr("头像 URL（可选）", "AVATAR URL (OPTIONAL)")}</Text>
                    <View style={styles.inputRow}>
                      <Ionicons name="link-outline" size={16} color="rgba(148,163,184,0.9)" style={styles.inputIcon} />
                      <TextInput
                        value={avatarUrl}
                        onChangeText={setAvatarUrl}
                        placeholder={tr("粘贴图片链接", "Paste image URL")}
                        placeholderTextColor="rgba(148,163,184,0.75)"
                        style={styles.inputText}
                        autoCapitalize="none"
                        autoCorrect={false}
                      autoComplete="off"
                      textContentType="oneTimeCode"
                      importantForAutofill="no"
                      />
                    </View>
                  </View>
                ) : null}

                <View style={styles.inlineBox}>
                  <Text style={styles.fieldLabel}>{tr("名称 *", "NAME *")}</Text>
                  <View style={styles.inputRow}>
                    <TextInput
                      value={name}
                      onChangeText={setName}
                      placeholder={tr("例如：Architect Bot", "e.g. Architect Bot")}
                      placeholderTextColor="rgba(148,163,184,0.75)"
                      style={styles.inputText}
                    autoComplete="off"
                    textContentType="oneTimeCode"
                    importantForAutofill="no"
                    />
                  </View>
                </View>

                <View style={styles.inlineBox}>
                  <Text style={styles.fieldLabel}>{tr("角色 / 专长", "ROLE / EXPERTISE")}</Text>
                  <View style={styles.inputRow}>
                    <Ionicons name="briefcase-outline" size={16} color="rgba(148,163,184,0.9)" style={styles.inputIcon} />
                    <TextInput
                      value={persona}
                      onChangeText={setPersona}
                      placeholder={tr("例如：Python 后端开发者", "e.g. Python Backend Developer")}
                      placeholderTextColor="rgba(148,163,184,0.75)"
                      style={styles.inputText}
                    autoComplete="off"
                    textContentType="oneTimeCode"
                    importantForAutofill="no"
                    />
                  </View>
                </View>

                <View style={styles.inlineBox}>
                  <Text style={styles.fieldLabel}>{tr("系统指令", "SYSTEM INSTRUCTIONS")}</Text>
                  <View style={[styles.inputRow, styles.inputRowTall]}>
                    <TextInput
                      value={rolePrompt}
                      onChangeText={setRolePrompt}
                      placeholder={tr("描述这个 Bot 的行为、语气和边界...", "Describe how this bot should behave, tone, and boundaries...")}
                      placeholderTextColor="rgba(148,163,184,0.75)"
                      style={[styles.inputText, styles.inputTextTall]}
                      multiline
                      textAlignVertical="top"
                    autoComplete="off"
                    textContentType="oneTimeCode"
                    importantForAutofill="no"
                    />
                  </View>
                </View>

                <Pressable
                  style={[
                    styles.createBtn,
                    (!name.trim() || creatingAgent) && styles.createBtnDisabled,
                  ]}
                  disabled={!name.trim() || creatingAgent}
                  onPress={handleCreate}
                >
                  <Ionicons
                    name="checkmark"
                    size={16}
                    color={!name.trim() || creatingAgent ? "rgba(226,232,240,0.40)" : "#ffffff"}
                  />
                  <Text style={[styles.createBtnText, (!name.trim() || creatingAgent) && styles.createBtnTextDisabled]}>
                    {creatingAgent ? tr("创建中...", "Creating...") : tr("创建成员", "Create Member")}
                  </Text>
                </Pressable>
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>

        <Modal visible={skillModal} transparent animationType="fade" onRequestClose={() => setSkillModal(false)}>
          <Pressable style={styles.modalOverlay} onPress={() => setSkillModal(false)}>
            <Pressable style={styles.modalCard} onPress={() => null}>
              <View style={styles.modalHeader}>
                <View style={styles.modalHeaderLeft}>
                  <View style={styles.modalTitleIcon}>
                    <Ionicons name="document-text-outline" size={14} color="#bfdbfe" />
                  </View>
                  <Text style={styles.modalTitle}>{tr("Upload Skill", "Upload Skill")}</Text>
                </View>
                <Pressable style={styles.closeBtn} onPress={() => setSkillModal(false)}>
                  <Ionicons name="close" size={16} color="rgba(226,232,240,0.85)" />
                </Pressable>
              </View>

              <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
                <View style={styles.inlineBox}>
                  <Text style={styles.fieldLabel}>{tr("名称", "NAME")}</Text>
                  <TextInput
                    value={skillName}
                    onChangeText={setSkillName}
                    placeholder={tr("Skill 名称", "Skill name")}
                    placeholderTextColor="rgba(148,163,184,0.9)"
                    style={styles.fieldInput}
                  autoComplete="off"
                  textContentType="oneTimeCode"
                  importantForAutofill="no"
                  />
                </View>
                <View style={styles.inlineBox}>
                  <Text style={styles.fieldLabel}>{tr("描述", "DESCRIPTION")}</Text>
                  <TextInput
                    value={skillDesc}
                    onChangeText={setSkillDesc}
                    placeholder={tr("Skill 描述", "Skill description")}
                    placeholderTextColor="rgba(148,163,184,0.9)"
                    style={styles.fieldInput}
                  autoComplete="off"
                  textContentType="oneTimeCode"
                  importantForAutofill="no"
                  />
                </View>
                <View style={styles.inlineBox}>
                  <Text style={styles.fieldLabel}>{tr("Markdown", "MARKDOWN")}</Text>
                  <TextInput
                    value={skillMarkdown}
                    onChangeText={setSkillMarkdown}
                    placeholder={tr("Markdown 内容", "Markdown")}
                    placeholderTextColor="rgba(148,163,184,0.9)"
                    style={[styles.fieldInput, styles.fieldInputXL]}
                    multiline
                    textAlignVertical="top"
                  autoComplete="off"
                  textContentType="oneTimeCode"
                  importantForAutofill="no"
                  />
                </View>

                <Pressable style={[styles.createBtn, (!skillName.trim() || !skillMarkdown.trim()) && styles.createBtnDisabled]} onPress={handleCreateCustomSkill} disabled={!skillName.trim() || !skillMarkdown.trim()}>
                  <Ionicons name="cloud-upload-outline" size={16} color={!skillName.trim() || !skillMarkdown.trim() ? "rgba(226,232,240,0.40)" : "#0b1220"} />
                  <Text style={[styles.createBtnText, (!skillName.trim() || !skillMarkdown.trim()) && styles.createBtnTextDisabled]}>{tr("Upload", "Upload")}</Text>
                </Pressable>
              </ScrollView>
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
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerActions: {
    flexDirection: "row",
    gap: 10,
  },
  title: {
    color: "#e2e8f0",
    fontSize: 16,
    fontWeight: "900",
    flex: 1,
    textAlign: "center",
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
  headerIconPrimary: {
    width: 40,
    height: 40,
    borderRadius: 16,
    backgroundColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: {
    color: "rgba(148,163,184,0.92)",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
  },
  agentRow: {
    gap: 10,
    paddingBottom: 6,
  },
  agentCard: {
    width: 210,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(15,23,42,0.55)",
    padding: 14,
    gap: 8,
  },
  agentCardActive: {
    borderColor: "rgba(59,130,246,0.35)",
    backgroundColor: "rgba(30,64,175,0.18)",
  },
  agentName: {
    color: "#f8fafc",
    fontSize: 15,
    fontWeight: "900",
  },
  agentPersona: {
    color: "rgba(203,213,225,0.78)",
    fontSize: 12,
    lineHeight: 18,
    minHeight: 36,
    fontWeight: "600",
  },
  agentFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  agentStatus: {
    color: "rgba(191,219,254,0.95)",
    fontSize: 11,
    fontWeight: "900",
  },
  agentSkillCount: {
    color: "rgba(148,163,184,0.95)",
    fontSize: 11,
    fontWeight: "700",
  },
  skillList: {
    gap: 9,
    paddingBottom: 24,
  },
  skillCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(15,23,42,0.55)",
    padding: 14,
    gap: 8,
  },
  skillMain: {
    gap: 4,
  },
  skillName: {
    color: "#f8fafc",
    fontSize: 14,
    fontWeight: "900",
  },
  skillDesc: {
    color: "rgba(203,213,225,0.78)",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
  skillMeta: {
    color: "rgba(148,163,184,0.95)",
    fontSize: 11,
    fontWeight: "700",
  },
  skillBtn: {
    minHeight: 30,
    borderRadius: 14,
    backgroundColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
  },
  skillBtnInstalled: {
    backgroundColor: "rgba(254,202,202,0.92)",
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.55)",
  },
  skillBtnDisabled: {
    opacity: 0.55,
  },
  skillBtnText: {
    color: "#0b1220",
    fontSize: 12,
    fontWeight: "900",
  },
  customSkillActions: {
    flexDirection: "row",
    gap: 8,
  },
  toggleBtn: {
    minWidth: 74,
    minHeight: 30,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
  },
  toggleBtnText: {
    color: "rgba(226,232,240,0.86)",
    fontSize: 12,
    fontWeight: "900",
  },
  deleteBtn: {
    minWidth: 74,
    minHeight: 30,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.20)",
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
  },
  deleteBtnText: {
    color: "rgba(248,113,113,0.95)",
    fontSize: 12,
    fontWeight: "900",
  },
  outputCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.22)",
    backgroundColor: "rgba(30,64,175,0.16)",
    padding: 14,
    gap: 6,
  },
  outputTitle: {
    color: "#e2e8f0",
    fontSize: 12,
    fontWeight: "900",
  },
  outputText: {
    color: "rgba(226,232,240,0.86)",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.50)",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 18,
    ...(Platform.OS === "web"
      ? ({
          backdropFilter: "blur(16px)",
        } as any)
      : null),
  },
  modalCard: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(2,6,23,0.78)",
    overflow: "hidden",
    maxHeight: "92%",
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
    elevation: 18,
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
  modalHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  modalTitleIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(59,130,246,0.22)",
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.30)",
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
  avatarArea: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 4,
    paddingBottom: 6,
    gap: 6,
  },
  avatarRing: {
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderStyle: "dashed",
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarRingWrap: {
    width: 112,
    height: 112,
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarUploadBtn: {
    position: "absolute",
    right: -4,
    bottom: -4,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(37,99,235,0.95)",
    borderWidth: 1,
    borderColor: "rgba(147,197,253,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLabel: {
    color: "rgba(226,232,240,0.9)",
    fontSize: 12,
    fontWeight: "900",
    marginTop: 6,
  },
  avatarHint: {
    color: "rgba(148,163,184,0.95)",
    fontSize: 11,
    fontWeight: "700",
  },
  inlineBox: {
    gap: 8,
  },
  fieldLabel: {
    color: "rgba(148,163,184,0.90)",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },
  fieldInput: {
    minHeight: 42,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(0,0,0,0.40)",
    color: "#f8fafc",
    paddingHorizontal: 12,
    fontSize: 13,
    fontWeight: "600",
  },
  fieldInputTall: {
    minHeight: 110,
    paddingTop: 10,
    paddingBottom: 10,
  },
  fieldInputXL: {
    minHeight: 180,
    paddingTop: 10,
    paddingBottom: 10,
  },
  inputRow: {
    minHeight: 42,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(0,0,0,0.40)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  inputRowTall: {
    minHeight: 100,
    paddingTop: 10,
    paddingBottom: 10,
    alignItems: "flex-start",
  },
  inputIcon: {
    marginRight: 8,
    marginTop: 1,
  },
  inputText: {
    flex: 1,
    color: "#f8fafc",
    fontSize: 13,
    fontWeight: "600",
    paddingVertical: 10,
  },
  inputTextTall: {
    paddingVertical: 0,
    minHeight: 78,
  },
  createBtn: {
    minHeight: 44,
    borderRadius: 18,
    backgroundColor: "rgba(37,99,235,0.95)",
    borderWidth: 1,
    borderColor: "rgba(147,197,253,0.28)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  createBtnDisabled: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  createBtnText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
  },
  createBtnTextDisabled: {
    color: "rgba(226,232,240,0.40)",
  },
});
