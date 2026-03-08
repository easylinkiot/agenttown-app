/* global describe, beforeAll, it, device, waitFor, element, by */

const { ensureAccount, createThread } = require('./support/api-helper');
const { signInWithPasswordIfNeeded, waitForHome } = require('./support/auth-helper');

const ACCOUNT_EMAIL = process.env.E2E_ACCOUNT_A_EMAIL || 'qa.sim2.20260304164502.a@agenttown.dev';
const ACCOUNT_PASSWORD = process.env.E2E_ACCOUNT_PASSWORD || 'AtSim#12345';
const SEED = process.env.E2E_RUN_TAG || `${Date.now()}`;

const fixture = {
  account: null,
  threadId: '',
};

function waitMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function openGroupThread(threadId) {
  const deepLink = `agenttown://chat/${encodeURIComponent(threadId)}`;
  for (let i = 0; i < 3; i += 1) {
    try {
      await device.openURL({ url: deepLink });
      await waitFor(element(by.id('chat-message-input'))).toBeVisible().withTimeout(8000);
      return;
    } catch {
      await waitMs(400);
    }
  }
  throw new Error(`failed to open group thread ${threadId}`);
}

describe('Group MyBot panel UI', () => {
  beforeAll(async () => {
    fixture.account = await ensureAccount(ACCOUNT_EMAIL, ACCOUNT_PASSWORD, 'E2E Group MyBot');
    const thread = await createThread(fixture.account.token, {
      name: `Detox MyBot Panel ${SEED}`,
      isGroup: true,
      message: 'seed',
      time: 'Now',
    });
    fixture.threadId = String(thread?.id || '').trim();
    if (!fixture.threadId) {
      throw new Error('missing group thread id');
    }

    await device.launchApp({
      newInstance: true,
      delete: true,
      permissions: {
        notifications: 'YES',
      },
      launchArgs: {
        e2eMode: '1',
        e2eAuthEmail: ACCOUNT_EMAIL,
        e2eAuthPassword: ACCOUNT_PASSWORD,
        detoxEnableSynchronization: '0',
      },
    });
    await device.disableSynchronization();
    await signInWithPasswordIfNeeded(ACCOUNT_EMAIL, ACCOUNT_PASSWORD);
    await waitForHome(15000);
  });

  it('opens the redesigned MyBot group panel', async () => {
    await openGroupThread(fixture.threadId);
    await waitFor(element(by.id('chat-mybot-panel-button'))).toBeVisible().withTimeout(8000);
    await waitMs(1500);
    try {
      await element(by.id('chat-mybot-panel-button')).tap();
    } catch {
      await waitMs(1200);
      await element(by.id('chat-mybot-panel-button')).tap();
    }
    await waitFor(element(by.id('chat-mybot-panel'))).toBeVisible().withTimeout(5000);
    await device.takeScreenshot(`group-mybot-panel-${SEED}`);
  });
});
