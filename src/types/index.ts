export interface ChatThread {
  id: string;
  name: string;
  avatar: string;
  message: string;
  time: string;
  targetType?: string;
  targetId?: string;
  unreadCount?: number;
  isVoiceCall?: boolean;
  isSystem?: boolean;
  highlight?: boolean;
  isGroup?: boolean;
  memberCount?: number;
  phoneNumber?: string;
  supportsVideo?: boolean;
  tag?: string;
  groupType?: "toc" | "tob" | string;
  groupSubCategory?: string;
  groupNpcName?: string;
  groupNpcAgentId?: string;
  groupCommanderUserId?: string;
}

export type UiTheme = "classic" | "neo";
export type AppLanguage = "zh" | "en" | "de";
export type ThreadDisplayLanguage = "zh" | "en" | "de";

export type TaskPriority = "High" | "Medium" | "Low";
export type TaskStatus = "Pending" | "In Progress" | "Done";

export interface TaskItem {
  id?: string;
  title: string;
  assignee: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueAt?: string;
  sourceThreadId?: string;
  sourceMessageId?: string;
  owner?: string;
}

export interface BotConfig {
  name: string;
  avatar: string;
  systemInstruction: string;
  documents: string[];
  installedSkillIds: string[];
  knowledgeKeywords: string[];
}

export type ConversationType =
  | "text"
  | "voice"
  | "reply"
  | "summary"
  | "image"
  | "system";

export interface ConversationMessage {
  id: string;
  threadId?: string;
  seqNo?: number;
  senderId?: string;
  senderName?: string;
  senderAvatar: string;
  senderType?: string;
  content: string;
  type: ConversationType | string;
  isMe: boolean;
  time?: string;
  voiceDuration?: string;
  replyContext?: string;
  imageUri?: string;
  imageName?: string;
}

export type FriendKind = "human" | "bot";

export interface Friend {
  id: string;
  ownerId?: string;
  userId?: string;
  name: string;
  avatar: string;
  kind: FriendKind;
  role?: string;
  company?: string;
  threadId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type FriendRequestStatus = "pending" | "accepted" | "rejected" | "canceled";

export interface FriendRequest {
  id: string;
  fromUserId: string;
  toUserId: string;
  fromName?: string;
  fromAvatar?: string;
  status: FriendRequestStatus;
  createdAt?: string;
  updatedAt?: string;
}

export type AgentStatus = "online" | "offline";

export interface Agent {
  id: string;
  name: string;
  avatar: string;
  description: string;
  rolePrompt: string;
  persona: string;
  tools: string[];
  safetyLevel: string;
  status: AgentStatus;
  installedSkillIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SkillCatalogItem {
  id: string;
  name: string;
  logo?: string;
  description: string;
  type: string;
  permissionScope: string;
  version: string;
  tags?: string[];
}

export interface CustomSkill {
  id: string;
  name: string;
  description: string;
  markdown: string;
  permissionScope: string;
  executor: string;
  version: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export type MiniAppStatus = "draft" | "generated" | "installed";

export interface MiniApp {
  id: string;
  name: string;
  summary: string;
  query: string;
  sources: string[];
  category: string;
  status: MiniAppStatus;
  installed: boolean;
  progress: number;
  preview?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface MiniAppTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
}

export type ThreadMemberType = "human" | "agent" | "role";

export interface ThreadMember {
  id: string;
  threadId?: string;
  name: string;
  avatar: string;
  memberType: ThreadMemberType;
  friendId?: string;
  agentId?: string;
  status?: string;
  createdAt?: string;
}

export interface RealtimeEvent<T = unknown> {
  type: string;
  threadId?: string;
  sentAt: string;
  payload: T;
}

export interface AppBootstrapState {
  botConfig: BotConfig;
  tasks: TaskItem[];
  chatThreads: ChatThread[];
  messages: Record<string, ConversationMessage[]>;
  friends?: Friend[];
  friendRequests?: FriendRequest[];
  threadMembers?: Record<string, ThreadMember[]>;
  agents: Agent[];
  skillCatalog: SkillCatalogItem[];
  customSkills?: CustomSkill[];
  miniApps: MiniApp[];
  miniAppTemplates: MiniAppTemplate[];
  myHouseType: number;
  uiTheme: UiTheme;
  language: AppLanguage;
  voiceModeEnabled: boolean;
  installedSkillIds?: string[];
}

export type UserRole = "admin" | "member" | "guest";

export interface AuthUser {
  id: string;
  email?: string;
  displayName: string;
  provider: string;
  providerUserId?: string;
  requireProfileSetup?: boolean;
  phone?: string;
  avatar?: string;
  role: UserRole;
  createdAt: string;
  updatedAt?: string;
}

export interface AiContextState {
  mode: "idle" | "loading" | "reply" | "task" | "brainstorm" | "custom";
  data: unknown;
}

export interface MarketModule {
  name: string;
  type: "file" | "folder";
  desc: string;
  size?: string;
  tags?: string[];
}

export interface MarketItem {
  id: string;
  name: string;
  description: string;
  fullDetail: string;
  modules: MarketModule[];
  keywords?: string[];
}

export interface MarketCategory {
  id: string;
  title: string;
  subtitle: string;
  items: MarketItem[];
}
