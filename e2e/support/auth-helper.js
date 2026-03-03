/* global __dirname, waitFor, element, by */
const fs = require("node:fs");
const path = require("node:path");

function loadManifestAccount() {
  try {
    const manifestPath = path.resolve(
      __dirname,
      "../../../agenttown-spec/workforce/evidence/runtime/business_case_manifest.json"
    );
    const payload = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const email = String(payload?.account?.email || "").trim();
    const password = String(payload?.account?.password || "").trim();
    if (!email || !password) return null;
    return { email, password };
  } catch {
    return null;
  }
}

function resolveE2ECredentials() {
  const envEmail = String(process.env.E2E_AUTH_EMAIL || "").trim();
  const envPassword = String(process.env.E2E_AUTH_PASSWORD || "").trim();
  if (envEmail && envPassword) return { email: envEmail, password: envPassword };
  const manifest = loadManifestAccount();
  if (manifest) return manifest;
  return {
    email: "qa.live.evidence@agenttown.dev",
    password: "AgentTown#2026!",
  };
}

async function existsById(id, timeout = 600) {
  try {
    await waitFor(element(by.id(id))).toBeVisible().withTimeout(timeout);
    return true;
  } catch {
    return false;
  }
}

async function existsByText(text, timeout = 600) {
  try {
    await waitFor(element(by.text(text))).toBeVisible().withTimeout(timeout);
    return true;
  } catch {
    return false;
  }
}

function waitMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHome(timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await existsById("home-chat-list", 500)) return;
    if (await existsById("home-mybot-entry", 500)) return;
    if (await existsByText("Ask anything", 450)) return;
    if (await existsByText("问点什么", 450)) return;
    if (await existsByText("Create Mini App", 450)) return;
    if (await existsByText("创建 Mini App", 450)) return;

    if (await existsById("chat-back-button", 250)) {
      try {
        await element(by.id("chat-back-button")).tap();
      } catch {
        // keep retrying home anchors
      }
      await waitMs(200);
      continue;
    }

    await waitMs(180);
  }
  throw new Error("home anchors not visible: home-chat-list/home-mybot-entry");
}

async function tryTapByText(text) {
  try {
    await waitFor(element(by.text(text))).toBeVisible().withTimeout(400);
    await element(by.text(text)).tap();
    return true;
  } catch {
    return false;
  }
}

async function safeReplaceText(id, value, scrollId = "auth-sign-in-scroll") {
  const input = element(by.id(id));
  for (let i = 0; i < 8; i += 1) {
    try {
      await waitFor(input).toBeVisible().withTimeout(4000);
      await input.replaceText(value);
      return;
    } catch {
      // keep trying with scroll + tap fallback
    }

    try {
      await waitFor(input).toBeVisible().whileElement(by.id(scrollId)).scroll(140, "down");
    } catch {
      // ignore and continue fallback
    }

    try {
      await input.tap();
      await input.replaceText(value);
      return;
    } catch {
      // continue retry
    }

    try {
      await element(by.id(scrollId)).tapAtPoint({ x: 20, y: 20 });
    } catch {
      // best effort keyboard dismiss
    }
  }
  throw new Error(`failed to fill input: ${id}`);
}

async function signInWithPassword(email, password) {
  try {
    await waitForHome(5000);
    return;
  } catch {
    // continue with explicit auth flow.
  }

  await waitFor(element(by.id("auth-sign-in-scroll"))).toBeVisible().withTimeout(30000);
  await waitFor(element(by.id("auth-email-input"))).toBeVisible().withTimeout(30000);
  await safeReplaceText("auth-email-input", email);
  await safeReplaceText("auth-password-input", password);
  try {
    await element(by.id("auth-password-input")).tapReturnKey();
  } catch {
    // keyboard action is not always available
  }
  await waitFor(element(by.id("auth-password-login-button"))).toBeVisible().withTimeout(8000);
  await element(by.id("auth-password-login-button")).tap();
  await waitForHome(40000);
}

async function signInGuestOrPasswordFallback() {
  try {
    await waitForHome(12000);
    return;
  } catch {
    // need login flow
  }

  const onAuthScreen =
    (await existsById("auth-sign-in-scroll", 1000)) ||
    (await existsById("auth-email-input", 1000)) ||
    (await existsById("auth-guest-login-button", 1000));
  if (!onAuthScreen) {
    return;
  }

  const scroll = element(by.id("auth-sign-in-scroll"));
  for (let i = 0; i < 8; i += 1) {
    try {
      await scroll.scrollTo("bottom");
    } catch {
      try {
        await scroll.swipe("up", "fast", 0.9);
      } catch {
        // continue
      }
    }
    if (await existsById("auth-guest-login-button", 1200)) {
      await element(by.id("auth-guest-login-button")).tap();
    } else if (await tryTapByText("Continue as Guest")) {
      // no-op
    } else {
      await tryTapByText("游客模式继续");
    }
    if (await existsById("home-mybot-entry", 4000)) return;
  }

  const creds = resolveE2ECredentials();
  await signInWithPassword(creds.email, creds.password);
}

async function signInWithPasswordIfNeeded(email, password) {
  try {
    await waitForHome(25000);
    return;
  } catch {
    await signInWithPassword(email, password);
  }
}

module.exports = {
  resolveE2ECredentials,
  waitForHome,
  signInWithPassword,
  signInWithPasswordIfNeeded,
  signInGuestOrPasswordFallback,
  existsById,
};
