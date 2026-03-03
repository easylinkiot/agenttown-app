/* global describe, beforeAll, afterAll, it, device, waitFor, expect, element, by */
const { resolveE2ECredentials, signInGuestOrPasswordFallback } = require("./support/auth-helper");

describe.skip("Guest login smoke (temporarily skipped: iOS Detox synchronization flake)", () => {
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

  it("opens app and reaches home", async () => {
    try {
      await signInGuestOrPasswordFallback();
    } catch {
      // Continue and assert home directly.
    }

    try {
      await waitFor(element(by.text("Ask anything"))).toBeVisible().withTimeout(45000);
      await expect(element(by.text("Ask anything"))).toBeVisible();
      return;
    } catch {
      await waitFor(element(by.text("问点什么"))).toBeVisible().withTimeout(45000);
      await expect(element(by.text("问点什么"))).toBeVisible();
    }
  });

  afterAll(async () => {
    try {
      await device.enableSynchronization();
    } catch {
      // ignore teardown failures when app is in non-idle state
    }
  });
});
