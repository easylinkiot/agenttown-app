/* global describe, beforeAll, afterAll, it, device, waitFor, expect, element, by */
const {
  resolveE2ECredentials,
  existsById,
} = require("./support/auth-helper");

function waitMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForEntryPoint(timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await existsById("home-chat-list", 500)) return "home-chat-list";
    if (await existsById("home-mybot-entry", 500)) return "home-mybot-entry";
    if (await existsById("auth-sign-in-scroll", 500)) return "auth-sign-in-scroll";
    if (await existsById("auth-email-input", 500)) return "auth-email-input";
    await waitMs(200);
  }
  throw new Error("entry point not visible: auth-sign-in-scroll/auth-email-input/home anchors");
}

describe("Guest entry smoke", () => {
  const creds = resolveE2ECredentials();

  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      delete: true,
      launchArgs: {
        e2eMode: "1",
        e2eAuthEmail: creds.email,
        e2eAuthPassword: creds.password,
        detoxEnableSynchronization: "0",
      },
    });
    await device.disableSynchronization();
  });

  it(
    "opens app and shows auth or home entry",
    async () => {
      const entryId = await waitForEntryPoint(30000);
      if (!entryId) throw new Error("entry id missing");
      await device.takeScreenshot(`guest-entry-${Date.now()}`);
    },
    90000
  );

  afterAll(async () => {
    try {
      await device.enableSynchronization();
    } catch {
      // ignore teardown failures when app is in non-idle state
    }
  });
});
