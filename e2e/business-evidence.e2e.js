/* global __dirname, describe, beforeAll, it, device, element, by, waitFor */
const fs = require("node:fs");
const path = require("node:path");

const manifestPath = path.resolve(
  __dirname,
  "../../agenttown-spec/workforce/evidence/runtime/business_case_manifest.json"
);
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

const email = manifest.account.email;
const password = manifest.account.password;
const threads = {
  dm: manifest.threads.dm_1v1,
  multi: manifest.threads.multi_party,
  group: manifest.threads.group_chat,
  translate: manifest.threads.translate,
  bot: manifest.threads.bot,
  npc: manifest.threads.npc,
};
const dateTag = new Date().toISOString().slice(0, 10).replace(/-/g, "");

function waitMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHome(timeout = 30000) {
  const startedAt = Date.now();
  const waitAttempts = [
    (remain) => waitFor(element(by.id("home-chat-list"))).toBeVisible().withTimeout(Math.max(1000, remain)),
    (remain) => waitFor(element(by.id("home-mybot-entry"))).toBeVisible().withTimeout(Math.max(1000, remain)),
  ];

  for (const attempt of waitAttempts) {
    const elapsed = Date.now() - startedAt;
    const remain = Math.max(1000, timeout - elapsed);
    try {
      await attempt(remain);
      return;
    } catch {
      // Try fallback anchor.
    }
  }

  throw new Error("home anchors not visible: home-chat-list/home-mybot-entry");
}

async function signInIfNeeded() {
  try {
    await waitForHome(20000);
    return;
  } catch {
    // not signed in yet
  }

  await waitFor(element(by.id("auth-email-input"))).toBeVisible().withTimeout(30000);
  await element(by.id("auth-email-input")).tap();
  await element(by.id("auth-email-input")).replaceText(email);
  await waitFor(element(by.id("auth-password-input")))
    .toBeVisible()
    .whileElement(by.id("auth-sign-in-scroll"))
    .scroll(120, "down");
  await element(by.id("auth-password-input")).tap();
  await element(by.id("auth-password-input")).replaceText(password);
  try {
    await element(by.id("auth-password-input")).tapReturnKey();
  } catch {
    // iOS keyboard action is not always available in CI.
  }
  try {
    await element(by.id("auth-sign-in-scroll")).tapAtPoint({ x: 20, y: 20 });
  } catch {
    // best effort: dismiss keyboard if still visible
  }
  await element(by.id("auth-password-login-button")).tap();
  await waitForHome(30000);
}

async function tryOpen(el) {
  try {
    await waitFor(el).toBeVisible().withTimeout(1200);
    await el.tap();
    await waitFor(element(by.id("chat-back-button"))).toBeVisible().withTimeout(15000);
    return true;
  } catch {
    return false;
  }
}

async function openThread(threadMeta) {
  const threadId = threadMeta?.id || "";
  const threadName = threadMeta?.name || "";

  if (threadId) {
    try {
      await device.openURL({ url: `agenttown://chat/${encodeURIComponent(threadId)}` });
      await waitFor(element(by.id("chat-back-button"))).toBeVisible().withTimeout(15000);
      return;
    } catch {
      // Fallback to list-based navigation below.
    }
  }

  await waitForHome(20000);
  const rowById = threadId ? element(by.id(`chat-list-item-${threadId}`)) : null;
  const rowByName = threadName ? element(by.text(threadName)) : null;

  for (let i = 0; i < 10; i += 1) {
    if (rowById && (await tryOpen(rowById))) {
      return;
    }
    if (rowByName && (await tryOpen(rowByName))) {
      return;
    }

    await waitFor(element(by.id("home-chat-list"))).toBeVisible().withTimeout(6000);
    try {
      await element(by.id("home-chat-list")).swipe("up", "fast", 0.7);
    } catch {
      try {
        await element(by.id("home-chat-list")).swipe("down", "fast", 0.55);
      } catch {
        // FlatList may be shorter than the viewport and refuse to swipe.
      }
    }
    await waitMs(900);
  }
  await device.takeScreenshot(`uat-thread-missing-${dateTag}`);
  throw new Error(`thread not found on home list: ${threadId}`);
}

async function captureCase(threadMeta, screenshotName) {
  // Keep explicit progress logs in CI/local runs to prove each case executed.
  console.log(`[e2e] capture start: ${screenshotName}`);
  await openThread(threadMeta);
  await waitFor(element(by.id("chat-message-input"))).toBeVisible().withTimeout(15000);
  await device.takeScreenshot(screenshotName);
  console.log(`[e2e] capture done: ${screenshotName}`);
}

describe("Business Evidence (Simulator)", () => {
  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      delete: true,
      launchArgs: {
        e2eMode: "1",
        e2eAuthEmail: email,
        e2eAuthPassword: password,
        detoxEnableSynchronization: "0",
      },
    });
    await signInIfNeeded();
  });

  it("captures simulator screenshots for all business cases", async () => {
    await captureCase(threads.dm, `uat-dm-1v1-live-ios-${dateTag}`);
    await captureCase(threads.multi, `uat-multi-party-live-ios-${dateTag}`);
    await captureCase(threads.group, `uat-group-chat-live-ios-${dateTag}`);
    await captureCase(threads.translate, `uat-translate-live-ios-${dateTag}`);
    await captureCase(threads.bot, `uat-bot-live-ios-${dateTag}`);
    await captureCase(threads.npc, `uat-npc-live-ios-${dateTag}`);
  });
});
