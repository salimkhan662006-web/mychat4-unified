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
 * Reads a failed response and returns just the human-readable message.
 * The backend sends errors as {"detail": "..."}; we show the text, not the JSON.
 */
async function readErrorDetail(res) {
  const raw = await res.text();
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed.detail === "string") return parsed.detail;
    if (Array.isArray(parsed.detail)) return "Your request was not valid. Please check it and try again.";
  } catch {
    // not JSON — fall through to the raw text
  }
  return raw;
}

/**
 * Sends a chat message and returns the AI's reply plus which provider
 * answered. Works whether or not the user is logged in.
 */
export async function sendMessage(history, newMessage) {
  // Only real conversation turns go to the AI: skip document cards, generated-file
  // cards, and the app's own greeting/status messages (isGreeting).
  const formattedHistory = history
    .filter((m) => (m.type === "text" || m.type === "search-card") && !m.isGreeting)
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
    const errText = await readErrorDetail(res);
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
    const errText = await readErrorDetail(res);
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
    const errText = await readErrorDetail(res);
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
    const errText = await readErrorDetail(res);
    throw new Error(`Could not create conversation: ${res.status} ${errText}`);
  }
  return res.json();
}

export async function listConversations() {
  const res = await fetch(`${BACKEND_URL}/conversations`, {
    headers: await authHeaders(),
  });
  if (!res.ok) {
    const errText = await readErrorDetail(res);
    throw new Error(`Could not list conversations: ${res.status} ${errText}`);
  }
  return res.json();
}

export async function getConversationMessages(conversationId) {
  const res = await fetch(`${BACKEND_URL}/conversations/${conversationId}/messages`, {
    headers: await authHeaders(),
  });
  if (!res.ok) {
    const errText = await readErrorDetail(res);
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
    const errText = await readErrorDetail(res);
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
    const errText = await readErrorDetail(res);
    throw new Error(`Could not delete conversation: ${res.status} ${errText}`);
  }
  return res.json();
}

export async function saveMessage(conversationId, role, content, isPinnedRef = false, meta = null) {
  const res = await fetch(`${BACKEND_URL}/messages`, {
    method: "POST",
    headers: await authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      conversation_id: conversationId,
      role,
      content,
      is_pinned_ref: isPinnedRef,
      ...(meta ? { meta } : {}),
    }),
  });
  if (!res.ok) {
    const errText = await readErrorDetail(res);
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
    const errText = await readErrorDetail(res);
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
    const errText = await readErrorDetail(res);
    throw new Error(`Could not create boxed chat: ${res.status} ${errText}`);
  }
  return res.json();
}

// ---------------------------------------------------------------
// Usage + rate limits — both require login now
// ---------------------------------------------------------------
export async function getUsage() {
  const res = await fetch(`${BACKEND_URL}/usage`, {
    headers: await authHeaders(),
  });
  if (!res.ok) {
    const errText = await readErrorDetail(res);
    throw new Error(`Could not fetch usage: ${errText}`);
  }
  return res.json();
}

export async function getRateLimits() {
  const res = await fetch(`${BACKEND_URL}/rate-limits`, {
    headers: await authHeaders(),
  });
  if (!res.ok) {
    const errText = await readErrorDetail(res);
    throw new Error(`Could not fetch rate limits: ${errText}`);
  }
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
    const errText = await readErrorDetail(res);
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
    const errText = await readErrorDetail(res);
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
    const errText = await readErrorDetail(res);
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
    const errText = await readErrorDetail(res);
    throw new Error(`Could not confirm account deletion: ${res.status} ${errText}`);
  }
  return res.json();
}

// ---------------------------------------------------------------
// Document generation — Excel & PowerPoint
// ---------------------------------------------------------------
export async function planDocument(request, docType) {
  const res = await fetch(`${BACKEND_URL}/generate/plan`, {
    method: "POST",
    headers: await authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ request, doc_type: docType }),
  });
  if (!res.ok) {
    const errText = await readErrorDetail(res);
    throw new Error(`Could not plan document: ${res.status} ${errText}`);
  }
  return res.json(); // { plan, provider }
}

/**
 * Downloads the actual file. Triggers a real browser download rather
 * than returning the blob, since that's the whole point — a file the
 * user can open in PowerPoint or Excel.
 */
export async function downloadGeneratedFile(plan, docType) {
  const res = await fetch(`${BACKEND_URL}/generate/file`, {
    method: "POST",
    headers: await authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ plan, doc_type: docType }),
  });
  if (!res.ok) {
    const errText = await readErrorDetail(res);
    throw new Error(`Could not generate file: ${res.status} ${errText}`);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const ext = docType === "pptx" ? "pptx" : "xlsx";
  const safeTitle = (plan.title || "document").replace(/[^a-z0-9]/gi, "_").slice(0, 40);
  a.download = `${safeTitle}.${ext}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------
// Web search / research
// ---------------------------------------------------------------
export async function runWebSearch(query, conversationId = null) {
  const res = await fetch(`${BACKEND_URL}/search`, {
    method: "POST",
    headers: await authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ query, conversation_id: conversationId }),
  });
  if (!res.ok) {
    const errText = await readErrorDetail(res);
    throw new Error(`Search failed: ${res.status} ${errText}`);
  }
  return res.json(); // { answer, sources, provider }
}