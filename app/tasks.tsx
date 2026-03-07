import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  Modal,
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
import { TaskItem, TaskPriority, TaskStatus } from "@/src/types";

type FilterKey = "all" | TaskStatus;

function priorityScore(priority: TaskPriority) {
  if (priority === "High") return 3;
  if (priority === "Medium") return 2;
  return 1;
}

function statusScore(status: TaskStatus) {
  if (status === "Pending") return 1;
  if (status === "In Progress") return 2;
  return 3;
}

function nextStatus(status: TaskStatus): TaskStatus {
  if (status === "Pending") return "In Progress";
  if (status === "In Progress") return "Done";
  return "Pending";
}

export default function TasksScreen() {
  const router = useRouter();
  const { tasks, addTask, updateTask, language, bootstrapReady, refreshAll } = useAgentTown();
  const tr = (zh: string, en: string) => tx(language, zh, en);

  const [filter, setFilter] = useState<FilterKey>("all");
  const [sortBy, setSortBy] = useState<"latest" | "priority" | "status">("latest");
  const [createModal, setCreateModal] = useState(false);
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState("Jason");
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void refreshAll().catch((err) => setError(formatApiError(err)));
      return () => {};
    }, [refreshAll])
  );

  const list = useMemo(() => {
    const filtered = filter === "all" ? [...tasks] : tasks.filter((t) => t.status === filter);
    if (sortBy === "priority") filtered.sort((a, b) => priorityScore(b.priority) - priorityScore(a.priority));
    if (sortBy === "status") filtered.sort((a, b) => statusScore(a.status) - statusScore(b.status));
    return filtered;
  }, [filter, sortBy, tasks]);

  const handleCreate = () => {
    const safeTitle = title.trim();
    if (!safeTitle) return;
    const created: TaskItem = {
      id: `task_${Date.now()}`,
      title: safeTitle,
      assignee: assignee.trim() || "Jason",
      priority: "Medium",
      status: "Pending",
      owner: assignee.trim() || "Jason",
    };
    addTask(created);
    setCreateModal(false);
    setTitle("");
    setAssignee("Jason");
  };

  return (
    <KeyframeBackground>
      <SafeAreaView edges={APP_SAFE_AREA_EDGES} style={styles.safeArea}>
        <View style={styles.container}>
          <View style={styles.headerRow}>
            <Pressable style={styles.backBtn} onPress={() => router.back()}>
              <Ionicons name="chevron-back" size={18} color="#e2e8f0" />
            </Pressable>
            <Text style={styles.title}>{tr("待办", "Todo")}</Text>
            <Pressable style={styles.addBtn} onPress={() => setCreateModal(true)}>
              <Ionicons name="add" size={16} color="#0b1220" />
            </Pressable>
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

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.pillScroll}
            contentContainerStyle={styles.pillRow}
          >
            {([
              { key: "all", zh: "全部", en: "All" },
              { key: "Pending", zh: "待处理", en: "Pending" },
              { key: "In Progress", zh: "进行中", en: "In Progress" },
              { key: "Done", zh: "已完成", en: "Done" },
            ] as const).map((item) => (
              <Pressable
                key={item.key}
                style={[styles.pill, filter === item.key && styles.pillActive]}
                onPress={() => setFilter(item.key)}
              >
                <Text style={[styles.pillText, filter === item.key && styles.pillTextActive]}>
                  {tr(item.zh, item.en)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.pillScroll}
            contentContainerStyle={styles.pillRow}
          >
            {([
              { key: "latest", zh: "最新", en: "Latest" },
              { key: "priority", zh: "优先级", en: "Priority" },
              { key: "status", zh: "状态", en: "Status" },
            ] as const).map((item) => (
              <Pressable
                key={item.key}
                style={[styles.pill, sortBy === item.key && styles.pillActive]}
                onPress={() => setSortBy(item.key)}
              >
                <Text style={[styles.pillText, sortBy === item.key && styles.pillTextActive]}>
                  {tr(item.zh, item.en)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {!bootstrapReady ? (
            <LoadingSkeleton kind="cards" />
          ) : list.length === 0 ? (
            <EmptyState
              title={tr("暂无任务", "No tasks")}
              hint={tr("从聊天里长按消息即可转为任务", "Long-press a message in chat to convert it to a task")}
              icon="checkbox-outline"
            />
          ) : (
            <ScrollView contentContainerStyle={styles.listWrap} showsVerticalScrollIndicator={false}>
              {list.map((task) => (
                <View key={task.id || task.title} style={styles.card}>
                  <View style={styles.cardTop}>
                    <Text style={styles.taskTitle} numberOfLines={2}>
                      {task.title}
                    </Text>
                    <View style={styles.statusPill}>
                      <Text style={styles.statusText}>{task.status}</Text>
                    </View>
                  </View>
                  <Text style={styles.meta}>
                    {tr("负责人", "Owner")}: {task.assignee} · {tr("优先级", "Priority")}: {task.priority}
                  </Text>

                  {task.sourceThreadId ? (
                    <Pressable
                      style={styles.sourceBtn}
                      onPress={() =>
                        router.push({
                          pathname: "/chat/[id]",
                          params: {
                            id: task.sourceThreadId || "",
                            highlightMessageId: task.sourceMessageId || "",
                          },
                        })
                      }
                    >
                      <Ionicons name="return-up-forward-outline" size={12} color="#bfdbfe" />
                      <Text style={styles.sourceText}>{tr("查看来源消息", "Open source message")}</Text>
                    </Pressable>
                  ) : null}

                  {task.id ? (
                    <Pressable
                      style={styles.cycleBtn}
                      onPress={() =>
                        void updateTask(task.id as string, { status: nextStatus(task.status) }).catch((err) => setError(formatApiError(err)))
                      }
                    >
                      <Ionicons name="swap-horizontal-outline" size={14} color="#0b1220" />
                      <Text style={styles.cycleText}>{tr("状态流转", "Move status")}</Text>
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </ScrollView>
          )}
        </View>

        <Modal visible={createModal} transparent animationType="fade" onRequestClose={() => setCreateModal(false)}>
          <Pressable style={styles.modalOverlay} onPress={() => setCreateModal(false)}>
            <Pressable style={styles.modalCard} onPress={() => null}>
              <Text style={styles.modalTitle}>{tr("创建任务", "Create Task")}</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder={tr("任务标题 *", "Task title *")}
                placeholderTextColor="rgba(148,163,184,0.9)"
                style={styles.input}
              autoComplete="off"
              textContentType="oneTimeCode"
              importantForAutofill="no"
              />
              <TextInput
                value={assignee}
                onChangeText={setAssignee}
                placeholder={tr("负责人", "Assignee")}
                placeholderTextColor="rgba(148,163,184,0.9)"
                style={styles.input}
              autoComplete="off"
              textContentType="oneTimeCode"
              importantForAutofill="no"
              />
              <View style={styles.modalFooter}>
                <Pressable style={styles.ghostBtn} onPress={() => setCreateModal(false)}>
                  <Text style={styles.ghostText}>{tr("取消", "Cancel")}</Text>
                </Pressable>
                <Pressable style={[styles.ctaBtn, !title.trim() && styles.ctaBtnDisabled]} onPress={handleCreate}>
                  <Text style={styles.ctaText}>{tr("创建", "Create")}</Text>
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
    gap: 10,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
  title: {
    flex: 1,
    textAlign: "center",
    color: "#e2e8f0",
    fontSize: 16,
    fontWeight: "900",
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 16,
    backgroundColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
  },
  pillScroll: {
    flexGrow: 0,
  },
  pillRow: {
    gap: 8,
    paddingBottom: 2,
    paddingRight: 2,
    alignItems: "center",
  },
  pill: {
    alignSelf: "flex-start",
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  pillActive: {
    borderColor: "rgba(59,130,246,0.35)",
    backgroundColor: "rgba(30,64,175,0.22)",
  },
  pillText: {
    color: "rgba(203,213,225,0.75)",
    fontSize: 11,
    fontWeight: "900",
  },
  pillTextActive: {
    color: "#e2e8f0",
  },
  listWrap: {
    gap: 12,
    paddingTop: 4,
    paddingBottom: 18,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(15,23,42,0.55)",
    padding: 14,
    gap: 10,
  },
  cardTop: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  taskTitle: {
    flex: 1,
    color: "#e2e8f0",
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 20,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  statusText: {
    color: "rgba(226,232,240,0.86)",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },
  meta: {
    color: "rgba(148,163,184,0.95)",
    fontSize: 12,
    fontWeight: "700",
  },
  sourceBtn: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.22)",
    backgroundColor: "rgba(30,64,175,0.16)",
  },
  sourceText: {
    color: "rgba(226,232,240,0.92)",
    fontSize: 12,
    fontWeight: "900",
  },
  cycleBtn: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "#e2e8f0",
  },
  cycleText: {
    color: "#0b1220",
    fontSize: 12,
    fontWeight: "900",
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
    padding: 14,
    gap: 10,
  },
  modalTitle: {
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
  modalFooter: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end",
    paddingTop: 4,
  },
  ghostBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  ghostText: {
    color: "rgba(226,232,240,0.82)",
    fontSize: 12,
    fontWeight: "900",
  },
  ctaBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "#e2e8f0",
  },
  ctaBtnDisabled: {
    opacity: 0.55,
  },
  ctaText: {
    color: "#0b1220",
    fontSize: 12,
    fontWeight: "900",
  },
});
