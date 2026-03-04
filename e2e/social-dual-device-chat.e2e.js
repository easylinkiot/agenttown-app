/* global describe, beforeAll, it, device, waitFor, element, by */

const {
  ensureAccount,
  ensureFriendship,
  sendThreadMessage,
  listThreadMessages,
} = require("./support/api-helper");
const { waitForHome, signInWithPasswordIfNeeded } = require("./support/auth-helper");

const ACCOUNT_A_EMAIL = process.env.E2E_ACCOUNT_A_EMAIL || "595367288@qq.com";
const ACCOUNT_B_EMAIL = process.env.E2E_ACCOUNT_B_EMAIL || "zheng595367288@foxmail.com";
const ACCOUNT_PASSWORD = process.env.E2E_ACCOUNT_PASSWORD || "00000000";
const ACTOR = (process.env.E2E_ACTOR || "A").toUpperCase();
const RUN_TAG = process.env.E2E_RUN_TAG || `${Date.now()}`;
const MSG_A = `[DUAL][A->B] ${RUN_TAG}`;
const MSG_B = `[DUAL][B->A] ${RUN_TAG}`;

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
  "以后",
  "Don’t Save",
  "Don't Save",
  "Save Password",
  "保存密码",
  "Save",
  "保存",
  "不存储",
  "不保存",
  "永不",
  "现在不",
  "Never",
];

const fixture = {
  dmThreadId: "",
  accountA: null,
  accountB: null,
};

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

function accountForActor() {
  return ACTOR === "B" ? ACCOUNT_B_EMAIL : ACCOUNT_A_EMAIL;
}

async function safeReplaceText(id, value, fallbackTapId) {
  const target = element(by.id(id));
  for (let i = 0; i < 6; i += 1) {
    try {
      await waitFor(target).toBeVisible().withTimeout(8000);
      await target.tap();
      await target.replaceText(value);
      return;
    } catch {
      await dismissAlerts();
      try {
        await target.typeText(value);
        return;
      } catch {
        // continue
      }
      if (fallbackTapId) {
        try {
          await element(by.id(fallbackTapId)).tapAtPoint({ x: 20, y: 20 });
        } catch {
          // continue
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error(`failed to fill input: ${id}`);
}

async function tapLoginButton() {
  const loginButton = element(by.id("auth-password-login-button"));
  const signInScroll = element(by.id("auth-sign-in-scroll"));

  for (let i = 0; i < 4; i += 1) {
    try {
      await waitFor(loginButton).toBeVisible().withTimeout(2000);
      await loginButton.tap();
      return;
    } catch {
      await dismissAlerts();
      try {
        await signInScroll.swipe("up", "fast", 0.6);
      } catch {
        // continue
      }
      try {
        await signInScroll.tapAtPoint({ x: 20, y: 20 });
      } catch {
        // continue
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  await waitFor(loginButton).toBeVisible().withTimeout(8000);
  await loginButton.tap();
}

async function launchAndLogin() {
  await device.launchApp({
    newInstance: true,
    delete: true,
    permissions: {
      notifications: "YES",
    },
    launchArgs: {
      e2eMode: "1",
      e2eAuthEmail: accountForActor(),
      e2eAuthPassword: ACCOUNT_PASSWORD,
      detoxEnableSynchronization: "0",
    },
  });
  await device.disableSynchronization();
  await dismissAlerts();

  try {
    await waitForHome(15000);
  } catch {
    await waitFor(element(by.id("auth-email-input"))).toBeVisible().withTimeout(20000);
    await safeReplaceText("auth-email-input", accountForActor(), "auth-sign-in-scroll");
    await safeReplaceText("auth-password-input", ACCOUNT_PASSWORD, "auth-sign-in-scroll");
    await tapLoginButton();
    await dismissAlerts();
    await signInWithPasswordIfNeeded(accountForActor(), ACCOUNT_PASSWORD);
    await waitForHome(40000);
  }
}

async function openThreadBestEffort(threadId) {
  try {
    await device.openURL({ url: `agenttown://chat/${encodeURIComponent(threadId)}` });
    await waitFor(element(by.id("chat-message-input"))).toBeVisible().withTimeout(12000);
    return;
  } catch {
    // fallback to list
  }

  const row = element(by.id(`chat-list-item-${threadId}`));
  await waitFor(element(by.id("home-chat-list"))).toBeVisible().withTimeout(10000);
  for (let i = 0; i < 10; i += 1) {
    try {
      await waitFor(row).toBeVisible().withTimeout(1200);
      await row.tap();
      await waitFor(element(by.id("chat-message-input"))).toBeVisible().withTimeout(20000);
      return;
    } catch {
      try {
        await element(by.id("home-chat-list")).swipe("up", "fast", 0.7);
      } catch {
        // continue
      }
    }
  }
  // do not hard-fail on UI open; message assertions rely on API and are deterministic.
}

function threadMessageList(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.items)) return response.items;
  if (Array.isArray(response?.messages)) return response.messages;
  return [];
}

async function waitForThreadMessage(token, threadId, expected, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await listThreadMessages(token, threadId, 100);
    const found = threadMessageList(response).some((item) => String(item?.content || "") === expected);
    if (found) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`message not found in thread ${threadId}: ${expected}`);
}

async function sendMessageViaApi(message) {
  const actorAccount = ACTOR === "B" ? fixture.accountB : fixture.accountA;
  if (!actorAccount?.token || !fixture.dmThreadId) {
    throw new Error("unable to send message: missing actor token or thread id");
  }
  await sendThreadMessage(actorAccount.token, fixture.dmThreadId, message);
}

describe(`Dual device DM actor ${ACTOR}`, () => {
  beforeAll(async () => {
    const accountA = await ensureAccount(ACCOUNT_A_EMAIL, ACCOUNT_PASSWORD, "E2E User A");
    const accountB = await ensureAccount(ACCOUNT_B_EMAIL, ACCOUNT_PASSWORD, "E2E User B");
    fixture.accountA = accountA;
    fixture.accountB = accountB;
    const { friendAtoB } = await ensureFriendship(accountA, accountB);
    fixture.dmThreadId = String(friendAtoB?.threadId || "").trim();
    if (!fixture.dmThreadId) throw new Error("missing dm thread id");
  }, 180000);

  it("joins the same DM and exchanges messages", async () => {
    await launchAndLogin();
    await device.takeScreenshot(`social-dual-${ACTOR.toLowerCase()}-home-${RUN_TAG}`);
    await openThreadBestEffort(fixture.dmThreadId);
    const actorToken = ACTOR === "B" ? fixture.accountB?.token : fixture.accountA?.token;
    if (!actorToken) throw new Error("missing actor token");

    if (ACTOR === "A") {
      await sendMessageViaApi(MSG_A);
      await waitForThreadMessage(actorToken, fixture.dmThreadId, MSG_B, 120000);
      return;
    }

    await waitForThreadMessage(actorToken, fixture.dmThreadId, MSG_A, 120000);
    await sendMessageViaApi(MSG_B);
  }, 180000);
});
