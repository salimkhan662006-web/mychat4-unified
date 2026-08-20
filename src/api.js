// Unified API layer for MyChat4 — chat + document agent in one app.
// No API keys live here. Everything goes through our secure backend.

const BACKEND_URL = "https://mychat4-backend.onrender.com";

/**
 * Sends a chat message (with optional document context baked into
 * the history) and returns the AI's reply plus which provider answered.
 */
export async function sendMessage(history, newMessage) {
  const formattedHistory = history
    .filter((m) => m.type !== "doc-card") // don't send UI-only doc cards as chat turns
    .map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    }));

  const res = await fetch(`${BACKEND_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ history: formattedHistory, message: newMessage }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Backend error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  return data; // { reply, provider }
}

/**
 * Uploads a file (.pdf or .txt) and returns extracted text.
 */
export async function uploadDocument(file) {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${BACKEND_URL}/upload`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Upload failed (${res.status}): ${errText}`);
  }

  return res.json(); // { text, truncated }
}

/**
 * Runs a specific task (summarise, extract points, custom question, etc.)
 * against previously uploaded document text. Pass priorContext (the AI's
 * own previous answer on this document) to avoid resending the full
 * document text on repeat actions — this cuts tokens significantly.
 */
export async function runAgentTask(docText, task, priorContext = null) {
  const res = await fetch(`${BACKEND_URL}/agent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      doc_text: docText,
      task,
      prior_context: priorContext,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Agent task failed (${res.status}): ${errText}`);
  }

  return res.json(); // { result, provider }
}

// ---------------------------------------------------------------
// Conversation history
// ---------------------------------------------------------------
export async function createConversation(title = "New chat") {
  const res = await fetch(`${BACKEND_URL}/conversations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error(`Could not create conversation: ${res.status}`);
  return res.json();
}

export async function listConversations() {
  const res = await fetch(`${BACKEND_URL}/conversations`);
  if (!res.ok) throw new Error(`Could not list conversations: ${res.status}`);
  return res.json();
}

export async function getConversationMessages(conversationId) {
  const res = await fetch(`${BACKEND_URL}/conversations/${conversationId}/messages`);
  if (!res.ok) throw new Error(`Could not fetch messages: ${res.status}`);
  return res.json();
}

export async function updateConversation(conversationId, updates) {
  const res = await fetch(`${BACKEND_URL}/conversations/${conversationId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error(`Could not update conversation: ${res.status}`);
  return res.json();
}

export async function deleteConversation(conversationId) {
  const res = await fetch(`${BACKEND_URL}/conversations/${conversationId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Could not delete conversation: ${res.status}`);
  return res.json();
}

export async function saveMessage(conversationId, role, content, isPinnedRef = false) {
  const res = await fetch(`${BACKEND_URL}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      conversation_id: conversationId,
      role,
      content,
      is_pinned_ref: isPinnedRef,
    }),
  });
  if (!res.ok) throw new Error(`Could not save message: ${res.status}`);
  return res.json();
}

export async function togglePinMessage(messageId) {
  const res = await fetch(`${BACKEND_URL}/messages/${messageId}/pin`, {
    method: "PATCH",
  });
  if (!res.ok) throw new Error(`Could not toggle pin: ${res.status}`);
  return res.json();
}

export async function createBoxedConversation(title, sourceConversationIds) {
  const res = await fetch(`${BACKEND_URL}/conversations/box`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, source_conversation_ids: sourceConversationIds }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Could not create boxed chat: ${res.status} ${errText}`);
  }
  return res.json();
}

// ---------------------------------------------------------------
// Rate limits
// ---------------------------------------------------------------
export async function getRateLimits() {
  const res = await fetch(`${BACKEND_URL}/rate-limits`);
  if (!res.ok) throw new Error(`Could not fetch rate limits: ${res.status}`);
  return res.json();
}