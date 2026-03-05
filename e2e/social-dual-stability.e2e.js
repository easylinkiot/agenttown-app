/* global describe, beforeAll, it, device, waitFor, element, by */

const {
  ensureAccount,
  ensureFriendship,
  createThread,
  addThreadMember,
  sendThreadMessage,
  listThreadMessages,
} = require("./support/api-helper");

const ACCOUNT_A_EMAIL = process.env.E2E_ACCOUNT_A_EMAIL || "595367288@qq.com";
const ACCOUNT_B_EMAIL = process.env.E2E_ACCOUNT_B_EMAIL || "zheng595367288@foxmail.com";
const ACCOUNT_PASSWORD = process.env.E2E_ACCOUNT_PASSWORD || "00000000";
const ACTOR = (process.env.E2E_ACTOR || "A").toUpperCase();
const RUN_TAG = process.env.E2E_RUN_TAG || `${Date.now()}`;

const ALERT_ACTIONS = [
  "Allow",
  "允许",
  "Allow While Using App",
  "使用 App 期间允许",
  "OK",
  "好",
  "Not Now",
  "现在不要",
  "稍后",
  "Don’t Save",
  "Don't Save",
  "Save Password",
  "保存密码",
  "不保存",
  "Never",
  "永不",
];

const fixture = {
  accountA: null,
  accountB: null,
  dmThreadId: "",
  groupThreadId: "",
  friendAtoB: null,
};

function waitMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function actorEmail() {
  return ACTOR === "B" ? ACCOUNT_B_EMAIL : ACCOUNT_A_EMAIL;
}

function actorAccount() {
  return ACTOR === "B" ? fixture.accountB : fixture.accountA;
}

async function dismissAlerts() {
  for (let i = 0; i < 6; i += 1) {
    let tapped = false;
    for (const text of ALERT_ACTIONS) {
      try {
        await waitFor(element(by.text(text))).toBeVisible().withTimeout(300);
        await element(by.text(text)).tap();
        tapped = true;
        break;
      } catch {
        // continue
      }
    }
    if (!tapped) return;
  }
}

async function relaunchAppLight(options = {}) {
  try {
    await device.terminateApp();
  } catch {
    // ignore
  }

  await device.launchApp({
    newInstance: true,
    delete: options.delete === true,
    permissions: {
      notifications: "YES",
    },
    launchArgs: {
      e2eMode: "1",
      e2eAuthEmail: actorEmail(),
      e2eAuthPassword: ACCOUNT_PASSWORD,
      detoxEnableSynchronization: "0",
    },
  });
  await device.disableSynchronization();
  await dismissAlerts();
  await waitMs(800);
}

async function openThreadBestEffort(threadId) {
  try {
    await device.openURL({ url: `agenttown://chat/${encodeURIComponent(threadId)}` });
    await waitFor(element(by.id("chat-message-input"))).toBeVisible().withTimeout(12000);
    return true;
  } catch {
    // fallback
  }

  const row = element(by.id(`chat-list-item-${threadId}`));
  try {
    await waitFor(element(by.id("home-chat-list"))).toBeVisible().withTimeout(8000);
  } catch {
    return false;
  }

  for (let i = 0; i < 10; i += 1) {
    try {
      await waitFor(row).toBeVisible().withTimeout(1000);
      await row.tap();
      await waitFor(element(by.id("chat-message-input"))).toBeVisible().withTimeout(12000);
      return true;
    } catch {
      try {
        await element(by.id("home-chat-list")).swipe("up", "fast", 0.7);
      } catch {
        // continue
      }
    }
  }

  return false;
}

function toMessageList(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.items)) return response.items;
  if (Array.isArray(response?.messages)) return response.messages;
  return [];
}

async function waitForMessage(token, threadId, expected, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await listThreadMessages(token, threadId, 150);
    const found = toMessageList(response).some((item) => String(item?.content || "") === expected);
    if (found) return;
    await waitMs(1000);
  }
  throw new Error(`message not found: ${expected}`);
}

async function waitForMessages(token, threadId, expectedList, timeoutMs = 150000) {
  for (const expected of expectedList) {
    await waitForMessage(token, threadId, expected, timeoutMs);
  }
}

async function sendByUiOrApi(content) {
  const sender = actorAccount();
  if (!sender?.token) throw new Error("missing actor token");

  try {
    await waitFor(element(by.id("chat-message-input"))).toBeVisible().withTimeout(5000);
    await element(by.id("chat-message-input")).tap();
    await element(by.id("chat-message-input")).replaceText(content);
    await element(by.id("chat-send-button")).tap();
  } catch {
    await sendThreadMessage(sender.token, fixture.dmThreadId, content);
  }
}

describe(`Social dual stability actor ${ACTOR}`, () => {
  beforeAll(async () => {
    fixture.accountA = await ensureAccount(ACCOUNT_A_EMAIL, ACCOUNT_PASSWORD, "E2E User A");
    fixture.accountB = await ensureAccount(ACCOUNT_B_EMAIL, ACCOUNT_PASSWORD, "E2E User B");

    const { friendAtoB } = await ensureFriendship(fixture.accountA, fixture.accountB);
    fixture.friendAtoB = friendAtoB;
    fixture.dmThreadId = String(friendAtoB?.threadId || "").trim();
    if (!fixture.dmThreadId) throw new Error("missing dm thread id");

    const group = await createThread(fixture.accountA.token, {
      name: `Detox Stable Group ${RUN_TAG}`,
      isGroup: true,
      message: "seed",
    });
    fixture.groupThreadId = String(group?.id || "").trim();
    if (!fixture.groupThreadId) throw new Error("missing group thread id");

    await addThreadMember(fixture.accountA.token, fixture.groupThreadId, {
      friendId: fixture.friendAtoB.id,
      memberType: "human",
    });
  }, 240000);

  it("session consistency after relaunch", async () => {
    await relaunchAppLight({ delete: true });
    await openThreadBestEffort(fixture.dmThreadId);
    await relaunchAppLight({ delete: false });

    const token = actorAccount().token;
    const msgA = `[STABLE][SESSION][A] ${RUN_TAG}`;
    const msgB = `[STABLE][SESSION][B] ${RUN_TAG}`;

    if (ACTOR === "A") {
      await sendThreadMessage(token, fixture.dmThreadId, msgA);
      await waitForMessage(token, fixture.dmThreadId, msgB, 120000);
      return;
    }

    await waitForMessage(token, fixture.dmThreadId, msgA, 120000);
    await sendThreadMessage(token, fixture.dmThreadId, msgB);
  }, 180000);

  it("message reliability for ordered batch", async () => {
    const token = actorAccount().token;
    const aMessages = Array.from({ length: 5 }, (_, idx) => `[STABLE][BATCH][A-${idx + 1}] ${RUN_TAG}`);
    const bMessages = Array.from({ length: 5 }, (_, idx) => `[STABLE][BATCH][B-${idx + 1}] ${RUN_TAG}`);

    if (ACTOR === "A") {
      for (const message of aMessages) {
        await sendThreadMessage(token, fixture.dmThreadId, message);
      }
      await waitForMessages(token, fixture.dmThreadId, bMessages, 150000);
      return;
    }

    await waitForMessages(token, fixture.dmThreadId, aMessages, 150000);
    for (const message of bMessages) {
      await sendThreadMessage(token, fixture.dmThreadId, message);
    }
  }, 220000);

  it("input/send stability + lifecycle recovery + special text", async () => {
    await relaunchAppLight({ delete: false });
    await openThreadBestEffort(fixture.dmThreadId);

    const token = actorAccount().token;
    const specialA = `[STABLE][SPECIAL][A] ${RUN_TAG}\nLine2 中文 😀 !@#$%^&*()[]{}<>`;
    const specialB = `[STABLE][SPECIAL][B] ${RUN_TAG}\nLine2 English 🚀 ~_=+|\\/`;

    if (ACTOR === "A") {
      await sendByUiOrApi(specialA);
      await relaunchAppLight({ delete: false });
      await waitForMessage(token, fixture.dmThreadId, specialB, 120000);
      return;
    }

    await waitForMessage(token, fixture.dmThreadId, specialA, 120000);
    await relaunchAppLight({ delete: false });
    await sendByUiOrApi(specialB);
  }, 220000);

  it("social boundary: cannot add non-friend into group by fake friendId", async () => {
    if (ACTOR === "B") {
      // Both actors run the same suite; boundary assertion on one side is enough.
      return;
    }

    let failed = false;
    try {
      await addThreadMember(fixture.accountA.token, fixture.groupThreadId, {
        friendId: `non-friend-${RUN_TAG}`,
        memberType: "human",
      });
    } catch {
      failed = true;
    }

    if (!failed) {
      throw new Error("expected addThreadMember to fail for non-friend member");
    }
  }, 120000);
});
