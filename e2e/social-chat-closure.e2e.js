/* global describe, beforeAll, it, afterAll, device, waitFor, element, by */

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
const SEED = `${Date.now()}`;

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
  "Don’t Allow",
  "不允许",
];

const fixture = {
  accountA: null,
  accountB: null,
  dmThreadId: "",
  groupThreadId: "",
  dmIncomingFromB: `[E2E][DM][B->A] ${SEED}`,
  dmOutgoingFromA: `[E2E][DM][A->B] ${SEED}`,
  groupIncomingFromA: `[E2E][GROUP][A-seed] ${SEED}`,
  groupOutgoingFromB: `[E2E][GROUP][B-send] ${SEED}`,
};

function waitMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function existsByText(text, timeout = 500) {
  try {
    await waitFor(element(by.text(text))).toBeVisible().withTimeout(timeout);
    return true;
  } catch {
    return false;
  }
}

async function existsByLabel(label, timeout = 500) {
  try {
    await waitFor(element(by.label(label))).toBeVisible().withTimeout(timeout);
    return true;
  } catch {
    return false;
  }
}

async function dismissSystemAlerts() {
  for (let i = 0; i < 4; i += 1) {
    let dismissed = false;
    for (const key of ALERT_BUTTONS) {
      if (await existsByLabel(key, 250)) {
        await element(by.label(key)).tap();
        dismissed = true;
        break;
      }
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
    launchArgs: {
      e2eMode: "1",
      e2eAuthEmail: email,
      e2eAuthPassword: ACCOUNT_PASSWORD,
      detoxEnableSynchronization: "0",
    },
  });
  await dismissSystemAlerts();
  await device.disableSynchronization();
  await waitMs(1200);
}

async function assertThreadHasMessage(token, threadId, content, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const list = await listThreadMessages(token, threadId, 120);
      if (Array.isArray(list) && list.some((item) => String(item?.content || "") === content)) {
        return;
      }
    } catch {
      // keep polling
    }
    await waitMs(1200);
  }
  throw new Error(`message not found in thread ${threadId}: ${content}`);
}

describe("Social chat closure (DM + Group)", () => {
  beforeAll(async () => {
    fixture.accountA = await ensureAccount(ACCOUNT_A_EMAIL, ACCOUNT_PASSWORD, "E2E User A");
    fixture.accountB = await ensureAccount(ACCOUNT_B_EMAIL, ACCOUNT_PASSWORD, "E2E User B");

    const { friendAtoB } = await ensureFriendship(fixture.accountA, fixture.accountB);
    fixture.dmThreadId = String(friendAtoB?.threadId || "").trim();
    if (!fixture.dmThreadId) {
      throw new Error("failed to locate DM thread id after friendship setup");
    }

    const group = await createThread(fixture.accountA.token, {
      name: `Detox Group ${SEED}`,
      isGroup: true,
      message: "detox group seed",
    });
    fixture.groupThreadId = String(group?.id || "").trim();
    if (!fixture.groupThreadId) {
      throw new Error("failed to create group thread");
    }

    await addThreadMember(fixture.accountA.token, fixture.groupThreadId, {
      friendId: friendAtoB.id,
      memberType: "human",
    });

    await sendThreadMessage(fixture.accountB.token, fixture.dmThreadId, fixture.dmIncomingFromB, {
      senderId: fixture.accountB.user.id,
      senderName: fixture.accountB.user.displayName || "E2E User B",
      senderType: "human",
    });

    await sendThreadMessage(fixture.accountA.token, fixture.groupThreadId, fixture.groupIncomingFromA, {
      senderId: fixture.accountA.user.id,
      senderName: fixture.accountA.user.displayName || "E2E User A",
      senderType: "human",
    });
  }, 300000);

  it("Account A receives and sends DM", async () => {
    await launchAs(ACCOUNT_A_EMAIL);
    await waitMs(7000);
    await dismissSystemAlerts();
    await device.takeScreenshot(`social-closure-a-home-${SEED}`);

    await assertThreadHasMessage(fixture.accountA.token, fixture.dmThreadId, fixture.dmIncomingFromB, 35000);
    await sendThreadMessage(fixture.accountA.token, fixture.dmThreadId, fixture.dmOutgoingFromA, {
      senderId: fixture.accountA.user.id,
      senderName: fixture.accountA.user.displayName || "E2E User A",
      senderType: "human",
    });
    await assertThreadHasMessage(fixture.accountB.token, fixture.dmThreadId, fixture.dmOutgoingFromA, 35000);
  }, 180000);

  it("Account B receives DM and joins group send", async () => {
    await launchAs(ACCOUNT_B_EMAIL);
    await waitMs(7000);
    await dismissSystemAlerts();
    await device.takeScreenshot(`social-closure-b-home-${SEED}`);

    await assertThreadHasMessage(fixture.accountB.token, fixture.dmThreadId, fixture.dmOutgoingFromA, 35000);
    await assertThreadHasMessage(fixture.accountB.token, fixture.groupThreadId, fixture.groupIncomingFromA, 35000);

    await sendThreadMessage(fixture.accountB.token, fixture.groupThreadId, fixture.groupOutgoingFromB, {
      senderId: fixture.accountB.user.id,
      senderName: fixture.accountB.user.displayName || "E2E User B",
      senderType: "human",
    });
    await assertThreadHasMessage(fixture.accountA.token, fixture.groupThreadId, fixture.groupOutgoingFromB, 35000);
  }, 180000);

  afterAll(async () => {
    try {
      await device.enableSynchronization();
    } catch {
      // ignore cleanup failure
    }
  });
});
