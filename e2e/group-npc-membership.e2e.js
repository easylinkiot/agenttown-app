/* global describe, beforeAll, afterAll, it, expect, device, waitFor, element, by */

const {
  ensureAccount,
  createThread,
  listThreadMembers,
  createNPC,
  deleteNPC,
} = require("./support/api-helper");
const { waitForHome, signInWithPasswordIfNeeded } = require("./support/auth-helper");

const ACCOUNT_A_EMAIL = process.env.E2E_ACCOUNT_A_EMAIL || "qa.sim2.20260304164502.a@agenttown.dev";
const ACCOUNT_PASSWORD = process.env.E2E_ACCOUNT_PASSWORD || "AtSim#12345";
const SEED = process.env.E2E_RUN_TAG || `${Date.now()}`;

const ALERT_BUTTONS = [
  "Allow",
  "Allow While Using App",
  "Allow Once",
  "OK",
  "Continue",
  "允许",
  "允许一次",
  "使用 App 期间允许",
  "好",
  "继续",
  "稍后",
  "Not Now",
  "Don’t Save",
  "Don't Save",
  "Save Password",
  "保存密码",
  "Save",
  "保存",
];

const fixture = {
  accountA: null,
  groupThreadId: "",
  configuredNpc: null,
  extraNpc: null,
  configuredMember: null,
};

function waitMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toTestIdSegment(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "") || "unknown";
}

function memberItems(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.items)) return response.items;
  if (Array.isArray(response?.members)) return response.members;
  return [];
}

async function existsByText(text, timeout = 500) {
  try {
    await waitFor(element(by.text(text))).toBeVisible().withTimeout(timeout);
    return true;
  } catch {
    return false;
  }
}

async function dismissSystemAlerts() {
  for (let i = 0; i < 4; i += 1) {
    let dismissed = false;
    for (const key of ALERT_BUTTONS) {
      if (await existsByText(key, 250)) {
        await element(by.text(key)).tap();
        dismissed = true;
        break;
      }
    }
    if (!dismissed) return;
  }
}

async function launchAs(email) {
  await device.launchApp({
    newInstance: true,
    delete: true,
    permissions: {
      notifications: "YES",
    },
    launchArgs: {
      e2eMode: "1",
      e2eAuthEmail: email,
      e2eAuthPassword: ACCOUNT_PASSWORD,
      detoxEnableSynchronization: "0",
    },
  });
  await device.disableSynchronization();
  await dismissSystemAlerts();
  await signInWithPasswordIfNeeded(email, ACCOUNT_PASSWORD);
  await dismissSystemAlerts();
  await waitForHome(30000);
}

async function openGroupThread(threadId) {
  const deepLink = `agenttown://chat/${encodeURIComponent(threadId)}`;
  for (let i = 0; i < 4; i += 1) {
    try {
      await device.openURL({ url: deepLink });
      await dismissSystemAlerts();
      await waitFor(element(by.id("chat-message-input"))).toBeVisible().withTimeout(8000);
      return;
    } catch {
      await dismissSystemAlerts();
      await waitMs(400);
    }
  }
  throw new Error(`failed to open group thread ${threadId}`);
}

async function waitForConfiguredNpcMember(timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await listThreadMembers(fixture.accountA.token, fixture.groupThreadId);
    const found = memberItems(response).find(
      (item) => String(item?.npcId || "").trim() === String(fixture.configuredNpc?.id || "").trim()
    );
    if (found) {
      fixture.configuredMember = found;
      return found;
    }
    await waitMs(900);
  }
  throw new Error("configured group NPC was not backfilled into thread members");
}

describe("Configured group NPC membership", () => {
  beforeAll(async () => {
    fixture.accountA = await ensureAccount(ACCOUNT_A_EMAIL, ACCOUNT_PASSWORD, "E2E Group NPC Owner");

    fixture.configuredNpc = await createNPC(fixture.accountA.token, {
      name: `Detox Group NPC ${SEED}`,
      intro: "Configured group npc",
      system_prompt: "You are the configured group npc.",
      model_name: "gpt-4.1-mini",
    });

    fixture.extraNpc = await createNPC(fixture.accountA.token, {
      name: `Detox Candidate NPC ${SEED}`,
      intro: "Candidate npc",
      system_prompt: "You are the manual add candidate npc.",
      model_name: "gpt-4.1-mini",
    });

    const thread = await createThread(fixture.accountA.token, {
      name: `Detox Group NPC Membership ${SEED}`,
      isGroup: true,
      groupNpcName: fixture.configuredNpc.name,
      message: `Configured NPC seed ${SEED}`,
    });
    fixture.groupThreadId = String(thread?.id || "").trim();
    if (!fixture.groupThreadId) throw new Error("missing group thread id");

    await launchAs(ACCOUNT_A_EMAIL);
    await openGroupThread(fixture.groupThreadId);
  }, 240000);

  it("backfills configured group npc and hides it from add-member npc candidates", async () => {
    const member = await waitForConfiguredNpcMember(45000);
    await device.takeScreenshot(`group-npc-chat-open-${SEED}`);

    await waitFor(element(by.id("chat-add-member-button"))).toBeVisible().withTimeout(8000);
    await element(by.id("chat-add-member-button")).tap();
    await waitFor(element(by.id("chat-member-modal"))).toBeVisible().withTimeout(8000);
    await waitFor(element(by.id("chat-member-filter-role"))).toBeVisible().withTimeout(5000);
    await element(by.id("chat-member-filter-role")).tap();

    const configuredCurrentId = `chat-member-current-${toTestIdSegment(member.id || member.name)}`;
    const configuredCandidateId = `chat-member-candidate-${toTestIdSegment(`npc:${fixture.configuredNpc.id}`)}`;
    const extraCandidateId = `chat-member-candidate-${toTestIdSegment(`npc:${fixture.extraNpc.id}`)}`;

    await waitFor(element(by.id(configuredCurrentId))).toBeVisible().withTimeout(12000);
    await waitFor(element(by.id(extraCandidateId))).toBeVisible().withTimeout(12000);
    await expect(element(by.id(configuredCandidateId))).not.toExist();

    await device.takeScreenshot(`group-npc-member-modal-${SEED}`);
  }, 180000);

  afterAll(async () => {
    try {
      if (fixture.extraNpc?.id) {
        await deleteNPC(fixture.accountA.token, fixture.extraNpc.id);
      }
    } catch {
      // best effort cleanup
    }
    try {
      if (fixture.configuredNpc?.id) {
        await deleteNPC(fixture.accountA.token, fixture.configuredNpc.id);
      }
    } catch {
      // best effort cleanup
    }
    try {
      await device.enableSynchronization();
    } catch {
      // ignore cleanup flake
    }
  });
});
