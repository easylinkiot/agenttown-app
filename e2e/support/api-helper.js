const DEFAULT_API_BASE_URL = "http://127.0.0.1:8080";

function resolveApiBaseUrl() {
  const raw =
    process.env.E2E_API_BASE_URL ||
    process.env.EXPO_PUBLIC_API_BASE_URL ||
    DEFAULT_API_BASE_URL;
  return raw.replace(/\/+$/, "");
}

function withPath(baseUrl, path) {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

async function apiRequest(path, options = {}) {
  const baseUrl = resolveApiBaseUrl();
  const url = withPath(baseUrl, path);
  const method = options.method || "GET";
  const headers = {
    "Content-Type": "application/json",
    ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    ...(options.headers || {}),
  };

  const response = await fetch(url, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const error = new Error(
      payload?.message || `request failed: ${method} ${path} (${response.status})`
    );
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

async function login(email, password) {
  return apiRequest("/v1/auth/login", {
    method: "POST",
    body: { email, password },
  });
}

async function register(email, password, displayName) {
  return apiRequest("/v1/auth/register", {
    method: "POST",
    body: { email, password, displayName },
  });
}

async function forgotPassword(email) {
  return apiRequest("/v1/auth/forgot", {
    method: "POST",
    body: { email },
  });
}

async function verifyResetCode(email, code) {
  return apiRequest("/v1/auth/verify", {
    method: "POST",
    body: { email, code },
  });
}

async function resetPassword(email, resetToken, password) {
  return apiRequest("/v1/auth/reset", {
    method: "POST",
    body: { email, resetToken, password },
  });
}

async function ensureAccount(email, password, displayName) {
  try {
    return await login(email, password);
  } catch (loginErr) {
    try {
      return await register(email, password, displayName);
    } catch (registerErr) {
      const message = String(registerErr?.message || "");
      const looksLikeExisting = registerErr?.status === 400 && /already registered|exists/i.test(message);
      if (!looksLikeExisting) {
        throw registerErr;
      }
    }
  }

  const forgot = await forgotPassword(email);
  const code = forgot?.verificationCode || forgot?.devCode;
  if (!code) {
    throw new Error(`failed to reset password for ${email}: missing verification code`);
  }
  const verified = await verifyResetCode(email, code);
  const resetToken = verified?.resetToken;
  if (!resetToken) {
    throw new Error(`failed to reset password for ${email}: missing reset token`);
  }
  await resetPassword(email, resetToken, password);
  return login(email, password);
}

async function listFriends(token) {
  return apiRequest("/v1/friends", { token });
}

async function createFriendRequest(token, targetUserId) {
  return apiRequest("/v1/friends", {
    method: "POST",
    token,
    body: { userId: targetUserId },
  });
}

async function listFriendRequests(token) {
  return apiRequest("/v1/friend-requests", { token });
}

async function acceptFriendRequest(token, requestId) {
  return apiRequest(`/v1/friend-requests/${encodeURIComponent(requestId)}/accept`, {
    method: "POST",
    token,
    body: {},
  });
}

async function ensureFriendship(accountA, accountB) {
  let friendsA = await listFriends(accountA.token);
  const existing = friendsA.find((item) => String(item.userId || "").trim() === accountB.user.id);
  if (!existing) {
    try {
      await createFriendRequest(accountA.token, accountB.user.id);
    } catch (err) {
      const message = String(err?.message || "");
      const isExpected =
        err?.status === 400 && /already exists|already pending|pending|friend already exists/i.test(message);
      if (!isExpected) throw err;
    }

    const requests = await listFriendRequests(accountB.token);
    const pending = requests.find(
      (item) =>
        String(item.status || "").trim() === "pending" &&
        String(item.fromUserId || "").trim() === accountA.user.id
    );
    if (pending?.id) {
      await acceptFriendRequest(accountB.token, pending.id);
    }
    friendsA = await listFriends(accountA.token);
  }

  const friendAtoB = friendsA.find((item) => String(item.userId || "").trim() === accountB.user.id);
  if (!friendAtoB) {
    throw new Error("friendship setup failed: missing A->B friend relation");
  }
  const friendsB = await listFriends(accountB.token);
  const friendBtoA = friendsB.find((item) => String(item.userId || "").trim() === accountA.user.id);
  if (!friendBtoA) {
    throw new Error("friendship setup failed: missing B->A friend relation");
  }
  return { friendAtoB, friendBtoA };
}

async function createThread(token, payload) {
  return apiRequest("/v1/chat/threads", {
    method: "POST",
    token,
    body: payload,
  });
}

async function addThreadMember(token, threadId, payload) {
  return apiRequest(`/v1/chat/threads/${encodeURIComponent(threadId)}/members`, {
    method: "POST",
    token,
    body: payload,
  });
}

async function sendThreadMessage(token, threadId, content, ext = {}) {
  return apiRequest(`/v1/chat/threads/${encodeURIComponent(threadId)}/messages`, {
    method: "POST",
    token,
    body: {
      content,
      type: "text",
      isMe: true,
      requestAI: false,
      ...ext,
    },
  });
}

async function listThreadMessages(token, threadId, limit = 100) {
  const params = new URLSearchParams();
  if (limit > 0) params.set("limit", String(limit));
  const qs = params.toString();
  return apiRequest(`/v1/chat/threads/${encodeURIComponent(threadId)}/messages${qs ? `?${qs}` : ""}`, {
    token,
  });
}

module.exports = {
  ensureAccount,
  ensureFriendship,
  createThread,
  addThreadMember,
  sendThreadMessage,
  listThreadMessages,
};
