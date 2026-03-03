/* global __dirname, describe, beforeAll, afterAll, it, device */
const fs = require("node:fs");
const path = require("node:path");

const manifestPath = path.resolve(
  __dirname,
  "../../agenttown-spec/workforce/evidence/runtime/business_case_manifest.json"
);
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

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

async function openThreadBestEffort(threadMeta) {
  const threadId = String(threadMeta?.id || "").trim();
  if (!threadId) return;

  try {
    await device.openURL({ url: `agenttown://chat/${encodeURIComponent(threadId)}` });
    await waitMs(1300);
  } catch {
    // Deep link can fail in simulator CI-like runs; keep screenshot flow non-blocking.
  }
}

async function captureCase(threadMeta, screenshotName) {
  console.log(`[e2e] capture start: ${screenshotName}`);
  await openThreadBestEffort(threadMeta);
  await waitMs(900);
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
        detoxEnableSynchronization: "0",
      },
    });
    await device.disableSynchronization();
    await waitMs(1500);
  });

  it("captures simulator screenshots for all business cases", async () => {
    await captureCase(threads.dm, `uat-dm-1v1-live-ios-${dateTag}`);
    await captureCase(threads.multi, `uat-multi-party-live-ios-${dateTag}`);
    await captureCase(threads.group, `uat-group-chat-live-ios-${dateTag}`);
    await captureCase(threads.translate, `uat-translate-live-ios-${dateTag}`);
    await captureCase(threads.bot, `uat-bot-live-ios-${dateTag}`);
    await captureCase(threads.npc, `uat-npc-live-ios-${dateTag}`);
  });

  afterAll(async () => {
    try {
      await device.enableSynchronization();
    } catch {
      // ignore teardown issues
    }
  });
});
