// Unified API layer for MyChat4 — chat + document agent in one app.
// No API keys live here. Everything goes through our secure backend.
// Conversation/history endpoints require a logged-in user, so we
// attach the current Supabase session token to every request that
// needs it.

import { supabase } from "./supabaseClient";

const BACKEND_URL = "https://mychat4-backend.onrender.com";

/**
 * Returns headers with the current user's auth token attached, if
 * they're logged in. Chat/document endpoints work without a token too
 * (anonymous/incognito use), but history endpoints require one — the
 * backend will reject those with 401 if missing.
 */
async function authHeaders(extra = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const headers = { ...extra };
  if (session?.access_token) {
    headers["Authorization"] = `Bearer ${session.access_token}`;
  }
  return headers;
}

/**
 * Sends a chat message and returns the AI's reply plus which provider
 * answered. Works whether or not the user is logged in.
 */
export async function sendMessage(history, newMessage) {
  const formattedHistory = history
    .filter((m) => m.type !== "doc-card")
    .map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    }));

  const res = await fetch(`${BACKEND_URL}/chat`, {
    method: "POST",
    headers: await authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ history: formattedHistory, message: newMessage }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Backend error ${res.status}: ${errText}`);
  }

  return res.json(); // { reply, provider }
}

/**
 * Uploads a file (.pdf or .txt) and returns extracted text.
 */
export async function uploadDocument(file) {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${BACKEND_URL}/upload`, {
    method: "POST",
    headers: await authHeaders(),
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Upload failed (${res.status}): ${errText}`);
  }

  return res.json(); // { text, truncated }
}

/**
 * Runs a specific task against previously uploaded document text.
 */
export async function runAgentTask(docText, task, priorContext = null) {
  const res = await fetch(`${BACKEND_URL}/agent`, {
    method: "POST",
    headers: await authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ doc_text: docText, task, prior_context: priorContext }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Agent task failed (${res.status}): ${errText}`);
  }

  return res.json(); // { result, provider }
}

// ---------------------------------------------------------------
// Conversation history — all require login
// ---------------------------------------------------------------
export async function createConversation(title = "New chat") {
  const res = await fetch(`${BACKEND_URL}/conversations`, {
    method: "POST",
    headers: await authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ title }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Could not create conversation: ${res.status} ${errText}`);
  }
  return res.json();
}

export async function listConversations() {
  const res = await fetch(`${BACKEND_URL}/conversations`, {
    headers: await authHeaders(),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Could not list conversations: ${res.status} ${errText}`);
  }
  return res.json();
}

export async function getConversationMessages(conversationId) {
  const res = await fetch(`${BACKEND_URL}/conversations/${conversationId}/messages`, {
    headers: await authHeaders(),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Could not fetch messages: ${res.status} ${errText}`);
  }
  return res.json();
}

export async function updateConversation(conversationId, updates) {
  const res = await fetch(`${BACKEND_URL}/conversations/${conversationId}`, {
    method: "PATCH",
    headers: await authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Could not update conversation: ${res.status} ${errText}`);
  }
  return res.json();
}

export async function deleteConversation(conversationId) {
  const res = await fetch(`${BACKEND_URL}/conversations/${conversationId}`, {
    method: "DELETE",
    headers: await authHeaders(),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Could not delete conversation: ${res.status} ${errText}`);
  }
  return res.json();
}

export async function saveMessage(conversationId, role, content, isPinnedRef = false) {
  const res = await fetch(`${BACKEND_URL}/messages`, {
    method: "POST",
    headers: await authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      conversation_id: conversationId,
      role,
      content,
      is_pinned_ref: isPinnedRef,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Could not save message: ${res.status} ${errText}`);
  }
  return res.json();
}

export async function togglePinMessage(messageId) {
  const res = await fetch(`${BACKEND_URL}/messages/${messageId}/pin`, {
    method: "PATCH",
    headers: await authHeaders(),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Could not toggle pin: ${res.status} ${errText}`);
  }
  return res.json();
}

export async function createBoxedConversation(title, sourceConversationIds) {
  const res = await fetch(`${BACKEND_URL}/conversations/box`, {
    method: "POST",
    headers: await authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ title, source_conversation_ids: sourceConversationIds }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Could not create boxed chat: ${res.status} ${errText}`);
  }
  return res.json();
}

// ---------------------------------------------------------------
// Rate limits — public, no auth needed
// ---------------------------------------------------------------
export async function getRateLimits() {
  const res = await fetch(`${BACKEND_URL}/rate-limits`);
  if (!res.ok) throw new Error(`Could not fetch rate limits: ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------
// Account management
// ---------------------------------------------------------------
export async function getAccountSummary() {
  const res = await fetch(`${BACKEND_URL}/account/summary`, {
    headers: await authHeaders(),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Could not fetch account summary: ${res.status} ${errText}`);
  }
  return res.json();
}

export async function resetAccountData() {
  const res = await fetch(`${BACKEND_URL}/account/reset-data`, {
    method: "POST",
    headers: await authHeaders(),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Could not reset account data: ${res.status} ${errText}`);
  }
  return res.json();
}

export async function requestAccountDeletion() {
  const res = await fetch(`${BACKEND_URL}/account/request-deletion`, {
    method: "POST",
    headers: await authHeaders(),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Could not request account deletion: ${res.status} ${errText}`);
  }
  return res.json();
}

export async function confirmAccountDeletion(token) {
  const res = await fetch(`${BACKEND_URL}/account/confirm-deletion`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Could not confirm account deletion: ${res.status} ${errText}`);
  }
  return res.json();
}