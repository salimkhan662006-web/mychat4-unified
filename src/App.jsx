import { useState, useRef, useEffect } from "react";
import {
  sendMessage,
  uploadDocument,
  runAgentTask,
  createConversation,
  getConversationMessages,
  saveMessage,
  planDocument,
  downloadGeneratedFile,
  runWebSearch,
} from "./api";
import { useStreamingText } from "./useStreamingText";
import SettingsPanel from "./SettingsPanel";
import HistorySidebar from "./HistorySidebar";
import { useAuth } from "./AuthContext";
import AuthScreen from "./AuthScreen";
import { buildCompressedSaveFile, downloadSaveFile, parseCompressedSaveFile } from "./eincm";

const PRESET_TASKS = [
  { label: "Summarise", task: "Write a clear, concise summary of this document." },
  { label: "Key points", task: "Extract the key points as a bulleted list." },
  { label: "Flag risks", task: "Identify any risks, inconsistencies, or unusual clauses in this document." },
  { label: "Action items", task: "Find and list any action items, tasks, or deadlines mentioned." },
];

let idCounter = 0;
const nextId = () => `m-${Date.now()}-${idCounter++}`;

// Extracts a display hostname from a URL without ever throwing —
// search results come from the open web, so a malformed URL shouldn't
// be able to crash the whole chat view.
function safeHostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Splits a search answer on [n] citation markers and renders each one
 * as a small clickable chip that scrolls to and briefly highlights the
 * matching source card below. messageId scopes the source element ids
 * so citations in different search answers never collide.
 */
function renderAnswerWithCitations(text, messageId) {
  const parts = text.split(/(\[\d+\])/g);

  function handleCitationClick(num) {
    const el = document.getElementById(`${messageId}-source-${num}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("search-source-flash");
    setTimeout(() => el.classList.remove("search-source-flash"), 1200);
  }

  return parts.map((part, i) => {
    const match = part.match(/^\[(\d+)\]$/);
    if (match) {
      const num = match[1];
      return (
        <span
          key={i}
          className="citation-chip"
          onClick={() => handleCitationClick(num)}
        >
          {num}
        </span>
      );
    }
    return part.split("\n").map((line, j, arr) => (
      <span key={`${i}-${j}`}>
        {line}
        {j < arr.length - 1 && <br />}
      </span>
    ));
  });
}

/**
 * Renders a structured AI response — a branching tree breakdown or a
 * bar chart — only ever called when the AI itself decided the content
 * warranted it. Falls back to rendering nothing if the structure is
 * malformed, since the plain text bubble above already carries the
 * actual answer either way.
 */
function StructuredResponse({ structure }) {
  if (!structure) return null;

  if (structure.format === "tree") {
    return <TreeDiagram root={structure.root} branches={structure.branches || []} />;
  }

  if (structure.format === "chart") {
    return <BarChart title={structure.title} data={structure.data || []} />;
  }

  return null;
}

function TreeDiagram({ root, branches }) {
  return (
    <div className="tree-diagram">
      <div className="tree-root">{root}</div>
      <div className="tree-branches">
        {branches.map((branch, i) => (
          <div key={i} className="tree-branch">
            <div className="tree-branch-label">{branch.label}</div>
            {branch.children?.length > 0 && (
              <div className="tree-children">
                {branch.children.map((child, j) => (
                  <div key={j} className="tree-child">{child}</div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function BarChart({ title, data }) {
  const maxValue = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="bar-chart">
      {title && <div className="bar-chart-title">{title}</div>}
      <div className="bar-chart-bars">
        {data.map((d, i) => (
          <div key={i} className="bar-chart-row">
            <div className="bar-chart-label">{d.label}</div>
            <div className="bar-chart-track">
              <div
                className="bar-chart-fill"
                style={{ width: `${(d.value / maxValue) * 100}%` }}
              ></div>
            </div>
            <div className="bar-chart-value">{d.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const { user, loading: authLoading, signOut } = useAuth();

  // messages: { id, role: "user"|"assistant", type: "text"|"doc-card", content, docText?, provider? }
  const [messages, setMessages] = useState([
    {
      id: nextId(),
      role: "assistant",
      type: "text",
      content:
        "Hi Salim — I'm ready when you are. Ask me anything, or attach a document and I'll read it for you.",
    },
  ]);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeDoc, setActiveDoc] = useState(null); // { text, fileName }
  const [lastDocAnswer, setLastDocAnswer] = useState(null); // most recent AI answer on activeDoc
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [wakingBackend, setWakingBackend] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState("usage");

  // Conversation persistence
  const [conversationId, setConversationId] = useState(null);
  const [isIncognito, setIsIncognito] = useState(false);
  const [incognitoSessions, setIncognitoSessions] = useState([]); // in-memory only
  const [eincmDialogOpen, setEincmDialogOpen] = useState(false);
  const [eincmImportError, setEincmImportError] = useState("");
  const importFileRef = useRef(null);
  const [generating, setGenerating] = useState(false);
  const [expandedPreview, setExpandedPreview] = useState(null); // { plan, docType } | null
  const [searchMode, setSearchMode] = useState(false);
  const [searching, setSearching] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);
  const { displayed, streaming, stream } = useStreamingText();
  const [streamingMsgId, setStreamingMsgId] = useState(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, displayed, loading]);

  function pushMessage(msg) {
    const withId = { id: nextId(), ...msg };
    setMessages((prev) => [...prev, withId]);
    return withId.id;
  }

  function streamIntoMessage(id, fullText) {
    setStreamingMsgId(id);
    stream(fullText, () => setStreamingMsgId(null));
  }

  // Render's free tier sleeps after inactivity — the first request can
  // take 30-60s to wake it. Show a friendly note if a request runs long,
  // instead of leaving the person staring at a plain spinner.
  async function withWakeDetection(promise) {
    const timer = setTimeout(() => setWakingBackend(true), 4000);
    try {
      return await promise;
    } finally {
      clearTimeout(timer);
      setWakingBackend(false);
    }
  }

  // Ensures a conversation exists before saving messages to it.
  // Incognito conversations only ever exist in memory — never call
  // this for them.
  async function ensureConversation(firstMessageText) {
    if (isIncognito) return null; // incognito never persists
    if (conversationId) return conversationId;

    const title = firstMessageText.slice(0, 48) || "New chat";
    const conv = await createConversation(title);
    setConversationId(conv.id);
    return conv.id;
  }

  function persistMessage(convId, role, content) {
    if (isIncognito || !convId) return; // never save incognito messages
    saveMessage(convId, role, content).catch((err) =>
      console.warn("Message save failed (non-fatal):", err.message)
    );
  }

  function startNewChat() {
    setMessages([
      {
        id: nextId(),
        role: "assistant",
        type: "text",
        content: "Hi Salim — ready when you are. Ask me anything, or attach a document.",
      },
    ]);
    setConversationId(null);
    setIsIncognito(false);
    setActiveDoc(null);
    setLastDocAnswer(null);
    setHistoryOpen(false);
  }

  function startIncognitoChat() {
    const sessionId = `incognito-${nextId()}`;
    setMessages([
      {
        id: nextId(),
        role: "assistant",
        type: "text",
        content: "Enhanced Incognito — this chat stays here in the app for your whole session, but it's never saved to any server. When you're done, you can delete it for good or compress it into a file you keep yourself.",
      },
    ]);
    setConversationId(sessionId);
    setIsIncognito(true);
    setActiveDoc(null);
    setLastDocAnswer(null);
    setIncognitoSessions((prev) => [...prev, { id: sessionId, title: "Incognito chat" }]);
    setHistoryOpen(false);
  }

  // EINCM — Enhanced Incognito Mode: standard delete or compressed save.
  function handleIncognitoStandardDelete() {
    setIncognitoSessions((prev) => prev.filter((s) => s.id !== conversationId));
    setEincmDialogOpen(false);
    startNewChat();
  }

  async function handleIncognitoCompressedSave() {
    const realMessages = messages.filter((m) => m.type === "text");
    const session = incognitoSessions.find((s) => s.id === conversationId);
    const title = session?.title || "Incognito chat";

    try {
      const fileContent = await buildCompressedSaveFile(title, realMessages);
      downloadSaveFile(fileContent, title);
      // Once saved to a file, the in-app copy is removed — the file
      // is now the only place this chat exists.
      setIncognitoSessions((prev) => prev.filter((s) => s.id !== conversationId));
      setEincmDialogOpen(false);
      startNewChat();
    } catch (err) {
      setErrorMsg(`Could not create save file: ${err.message}`);
      setEincmDialogOpen(false);
    }
  }

  async function handleImportFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setEincmImportError("");

    try {
      const text = await file.text();
      const restored = await parseCompressedSaveFile(text);

      const sessionId = `incognito-${nextId()}`;
      const restoredMessages = restored.messages.map((m) => ({
        id: nextId(),
        role: m.role,
        type: "text",
        content: m.content,
      }));

      setMessages([
        {
          id: nextId(),
          role: "assistant",
          type: "text",
          content: `Resumed from your saved file "${restored.title}" (originally saved ${new Date(restored.savedAt).toLocaleDateString()}). This is an Enhanced Incognito session — still never saved to any server.`,
        },
        ...restoredMessages,
      ]);
      setConversationId(sessionId);
      setIsIncognito(true);
      setActiveDoc(null);
      setLastDocAnswer(null);
      setIncognitoSessions((prev) => [...prev, { id: sessionId, title: restored.title }]);
      setHistoryOpen(false);
    } catch (err) {
      setEincmImportError(err.message);
    } finally {
      if (importFileRef.current) importFileRef.current.value = "";
    }
  }

  async function loadConversation(id, incognito) {
    setHistoryOpen(false);
    if (incognito) {
      // Incognito sessions live entirely in this component's memory
      // already — nothing to fetch, just switch the active pointer.
      // (Full incognito message history isn't refetched since it was
      // never saved; this is a simplified single-session model.)
      setConversationId(id);
      setIsIncognito(true);
      return;
    }

    setIsIncognito(false);
    setConversationId(id);
    setActiveDoc(null);
    setLastDocAnswer(null);

    try {
      const msgs = await getConversationMessages(id);
      if (msgs.length === 0) {
        setMessages([{
          id: nextId(),
          role: "assistant",
          type: "text",
          content: "This chat is empty — say something to get started.",
        }]);
        return;
      }
      setMessages(
        msgs.map((m) => ({
          id: m.id,
          role: m.role,
          type: "text",
          content: m.content,
        }))
      );
    } catch (err) {
      setErrorMsg(`Could not load chat: ${err.message}`);
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || loading || searching) return;

    if (searchMode) {
      return handleSearchSend(text);
    }

    pushMessage({ role: "user", type: "text", content: text });
    setInput("");
    setLoading(true);
    setErrorMsg("");

    try {
      const convId = await ensureConversation(text);
      persistMessage(convId, "user", text);

      const history = messages;
      const data = await withWakeDetection(sendMessage(history, text));
      const msgId = pushMessage({
        role: "assistant",
        type: "text",
        content: data.reply,
        provider: data.provider,
        structure: data.structure || null,
      });
      streamIntoMessage(msgId, data.reply);
      persistMessage(convId, "assistant", data.reply);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSearchSend(query) {
    pushMessage({ role: "user", type: "text", content: `🔍 ${query}` });
    setInput("");
    setSearching(true);
    setErrorMsg("");

    try {
      const convId = await ensureConversation(query);
      persistMessage(convId, "user", `🔍 ${query}`);

      const data = await withWakeDetection(runWebSearch(query, convId));

      pushMessage({
        role: "assistant",
        type: "search-card",
        content: data.answer,
        sources: data.sources,
        provider: data.provider,
      });

      persistMessage(convId, "assistant", data.answer);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSearching(false);
    }
  }

  async function handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    setErrorMsg("");

    try {
      const data = await withWakeDetection(uploadDocument(file));
      setActiveDoc({ text: data.text, fileName: file.name, truncated: data.truncated });
      setLastDocAnswer(null); // fresh document, no prior context yet
      pushMessage({
        role: "assistant",
        type: "doc-card",
        content: file.name,
        docMeta: `${data.text.length.toLocaleString()} characters${
          data.truncated ? " · truncated to fit" : ""
        }`,
      });
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handlePresetTask(task, label) {
    if (!activeDoc || loading) return;
    pushMessage({ role: "user", type: "text", content: label });
    setLoading(true);
    setErrorMsg("");

    try {
      const convId = await ensureConversation(label);
      persistMessage(convId, "user", label);

      // Pass the previous answer as context so we don't resend the full
      // document text on every click — cuts tokens on repeat actions.
      const data = await withWakeDetection(
        runAgentTask(activeDoc.text, task, lastDocAnswer)
      );
      setLastDocAnswer(data.result);
      const msgId = pushMessage({
        role: "assistant",
        type: "text",
        content: data.result,
        provider: data.provider,
      });
      streamIntoMessage(msgId, data.result);
      persistMessage(convId, "assistant", data.result);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Excel / PowerPoint generation — plans content as structured JSON,
  // shows a preview card in chat, and offers a real downloadable file.
  async function handleGenerateDocument(docType) {
    const requestText = input.trim();
    if (!requestText || generating) return;

    const label = docType === "pptx" ? "🎯 Create a presentation" : "📊 Create a spreadsheet";
    pushMessage({ role: "user", type: "text", content: `${label}: "${requestText}"` });
    setInput("");
    setGenerating(true);
    setErrorMsg("");

    try {
      const convId = await ensureConversation(requestText);
      persistMessage(convId, "user", `${label}: ${requestText}`);

      const { plan, provider } = await withWakeDetection(planDocument(requestText, docType));

      pushMessage({
        role: "assistant",
        type: "doc-gen-card",
        content: plan.title || "Untitled",
        docType,
        plan,
        provider,
      });

      persistMessage(convId, "assistant", `Generated ${docType.toUpperCase()} plan: ${plan.title}`);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setGenerating(false);
    }
  }

  async function handleDownloadGenerated(plan, docType) {
    try {
      await downloadGeneratedFile(plan, docType);
    } catch (err) {
      setErrorMsg(`Could not download file: ${err.message}`);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // While Supabase checks for an existing session (e.g. on page load),
  // show nothing rather than flashing the login screen unnecessarily.
  if (authLoading) {
    return (
      <div style={{ background: "#000", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#8A7570", fontSize: 13, fontFamily: "Inter, sans-serif" }}>Loading…</div>
      </div>
    );
  }

  // No logged-in user — show the login/signup screen instead of the app.
  if (!user) {
    return <AuthScreen />;
  }

  return (
    <div className="app-root">
      {/* Signature glowing smoke background */}
      <div className="smoke-layer">
        <div className="smoke-blob smoke-1"></div>
        <div className="smoke-blob smoke-2"></div>
        <div className="smoke-blob smoke-3"></div>
      </div>
      <div className="grain"></div>

      <div className="app-shell">
        {/* Semi-circular history rail */}
        <div className="history-rail">
          <div className="history-curve"></div>
          <div className="history-logo" onClick={() => setHistoryOpen(true)} title="Chat history">M4</div>
          <div className="history-items">
            <div
              className={`history-dot ${!isIncognito ? "active" : ""}`}
              title="Chat history"
              onClick={() => setHistoryOpen(true)}
            >
              💬
            </div>
            <div className="history-dot" title="New chat" onClick={startNewChat}>➕</div>
            <div
              className={`history-dot ${isIncognito ? "active incognito" : ""}`}
              title="Incognito chat"
              onClick={startIncognitoChat}
            >
              🕶
            </div>
            <label className="history-dot" title="Import a saved .mchat file">
              📥
              <input
                ref={importFileRef}
                type="file"
                accept=".mchat,.txt"
                onChange={handleImportFile}
                style={{ display: "none" }}
              />
            </label>
          </div>
          <div className="history-rail-bottom">
            <div
              className="history-dot"
              title="Rate limits"
              onClick={() => { setSettingsSection("limits"); setSettingsOpen(true); }}
            >
              ⏱️
            </div>
            <div
              className="history-dot"
              title="Usage"
              onClick={() => { setSettingsSection("usage"); setSettingsOpen(true); }}
            >
              📊
            </div>
            <div
              className="history-dot"
              title="Account"
              onClick={() => { setSettingsSection("account"); setSettingsOpen(true); }}
            >
              👤
            </div>
            <div
              className="history-dot"
              title="Settings"
              onClick={() => { setSettingsSection("appearance"); setSettingsOpen(true); }}
            >
              ⚙️
            </div>
          </div>
        </div>

        {/* Main chat column */}
        <div className="main">
          <div className="top-bar">
            <div className="brand">
              <div className="brand-mark">
                MyChat<span>4</span>
              </div>
            </div>
            <div className="top-bar-right">
              {isIncognito && (
                <div className="incognito-badge">
                  🕶 Enhanced Incognito — not saved
                  <span className="incognito-end-btn" onClick={() => setEincmDialogOpen(true)}>
                    End session
                  </span>
                </div>
              )}
              {activeDoc && (
                <div className="active-doc-pill">
                  📄 {activeDoc.fileName}
                  <span className="pill-clear" onClick={() => setActiveDoc(null)}>
                    ✕
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="messages">
            {messages.map((m) => {
              const isStreamingThis = streamingMsgId === m.id;
              const shownText = isStreamingThis ? displayed : m.content;

              if (m.type === "doc-card") {
                return (
                  <div key={m.id} className="msg-row ai">
                    <div className="msg-avatar"></div>
                    <div className="doc-block">
                      <div className="doc-inline-card">
                        <div className="doc-icon">📄</div>
                        <div>
                          <div className="doc-info-name">{m.content}</div>
                          <div className="doc-info-meta">{m.docMeta}</div>
                        </div>
                      </div>
                      <div className="preset-chips">
                        {PRESET_TASKS.map((p) => (
                          <div
                            key={p.label}
                            className="chip"
                            onClick={() => handlePresetTask(p.task, p.label)}
                          >
                            {p.label}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              }

              if (m.type === "search-card") {
                return (
                  <div key={m.id} className="msg-row ai">
                    <div className="msg-avatar"></div>
                    <div className="search-card">
                      <div className="search-card-label">🔍 Web search</div>
                      <div className="search-card-answer">
                        {renderAnswerWithCitations(m.content, m.id)}
                      </div>
                      {m.sources?.length > 0 && (
                        <div className="search-sources">
                          <div className="search-sources-label">Sources</div>
                          {m.sources.map((s, i) => (
                            <a
                              key={i}
                              id={`${m.id}-source-${i + 1}`}
                              className="search-source-item"
                              href={s.url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <span className="search-source-num">{i + 1}</span>
                              <div className="search-source-text">
                                <div className="search-source-title">{s.title}</div>
                                <div className="search-source-url">{safeHostname(s.url)}</div>
                              </div>
                            </a>
                          ))}
                        </div>
                      )}
                      {m.provider && <div className="provider-tag">{m.provider}</div>}
                    </div>
                  </div>
                );
              }

              if (m.type === "doc-gen-card") {
                const isPptx = m.docType === "pptx";
                return (
                  <div key={m.id} className="msg-row ai">
                    <div className="msg-avatar"></div>
                    <div className="gen-card">
                      <div className="gen-card-header">
                        <span className="gen-card-icon">{isPptx ? "🎯" : "📊"}</span>
                        <div>
                          <div className="gen-card-title">{m.plan.title}</div>
                          <div className="gen-card-meta">
                            {isPptx
                              ? `${m.plan.slides?.length || 0} slides`
                              : `${m.plan.rows?.length || 0} rows · ${m.plan.headers?.length || 0} columns`}
                          </div>
                        </div>
                        <div
                          className="gen-expand-btn"
                          onClick={() => setExpandedPreview({ plan: m.plan, docType: m.docType })}
                          title="View full preview"
                        >
                          ⤢
                        </div>
                      </div>

                      {isPptx ? (
                        <div className="gen-card-preview">
                          {m.plan.slides?.map((s, i) => (
                            <div key={i} className="gen-slide-preview">
                              <div className="gen-slide-num">{i + 1}</div>
                              <div>
                                <div className="gen-slide-heading">{s.heading}</div>
                                {s.bullets?.map((b, j) => (
                                  <div key={j} className="gen-slide-bullet">• {b}</div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="gen-card-preview">
                          <table className="gen-table-preview">
                            <thead>
                              <tr>
                                {m.plan.headers?.map((h, i) => <th key={i}>{h}</th>)}
                              </tr>
                            </thead>
                            <tbody>
                              {m.plan.rows?.map((row, i) => {
                                const isTotalRow = String(row[0] || "").toLowerCase().match(/total|sum|average|overall/);
                                return (
                                  <tr key={i} className={isTotalRow ? "gen-total-row" : ""}>
                                    {row.map((cell, j) => <td key={j}>{cell}</td>)}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}

                      <div
                        className="gen-download-btn"
                        onClick={() => handleDownloadGenerated(m.plan, m.docType)}
                      >
                        ⬇ Download {isPptx ? ".pptx" : ".xlsx"}
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div key={m.id} className={`msg-row ${m.role === "user" ? "user" : "ai"}`}>
                  {m.role === "assistant" && <div className="msg-avatar"></div>}
                  <div className="ai-response-stack">
                    <div className="msg-bubble">
                      {shownText.split("\n").map((line, j, arr) => (
                        <span key={j}>
                          {line}
                          {j < arr.length - 1 && <br />}
                        </span>
                      ))}
                      {isStreamingThis && <span className="stream-cursor"></span>}
                      {m.provider && !isStreamingThis && (
                        <div className="provider-tag">{m.provider}</div>
                      )}
                    </div>
                    {!isStreamingThis && m.structure && (
                      <StructuredResponse structure={m.structure} />
                    )}
                  </div>
                </div>
              );
            })}

            {loading && (
              <div className="msg-row ai">
                <div className="msg-avatar"></div>
                <div className="msg-bubble typing-bubble">
                  {wakingBackend ? (
                    <span className="waking-text">Waking up the AI backend, this can take up to a minute on first use…</span>
                  ) : (
                    <>
                      <span className="type-dot"></span>
                      <span className="type-dot" style={{ animationDelay: "0.2s" }}></span>
                      <span className="type-dot" style={{ animationDelay: "0.4s" }}></span>
                    </>
                  )}
                </div>
              </div>
            )}

            {errorMsg && <div className="error-box">{errorMsg}</div>}
            {eincmImportError && <div className="error-box">Import failed: {eincmImportError}</div>}

            <div ref={bottomRef} />
          </div>

          <div className="input-zone">
            {activeDoc && (
              <div className="attach-indicator">
                <span className="attach-indicator-icon">📎</span>
                <span className="attach-indicator-text">
                  Attached: <strong>{activeDoc.fileName}</strong> — your next message can reference it
                </span>
                <span className="attach-indicator-clear" onClick={() => { setActiveDoc(null); setLastDocAnswer(null); }}>
                  Remove
                </span>
              </div>
            )}
            <div className="input-shell">
              <label className="attach-btn" title="Attach a document">
                {uploading ? "…" : "📎"}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt"
                  onChange={handleFileChange}
                  style={{ display: "none" }}
                  disabled={uploading}
                />
              </label>
              <div
                className="attach-btn"
                title="Create a PowerPoint from your message"
                onClick={() => handleGenerateDocument("pptx")}
                style={{ opacity: !input.trim() || generating ? 0.4 : 1 }}
              >
                🎯
              </div>
              <div
                className="attach-btn"
                title="Create an Excel spreadsheet from your message"
                onClick={() => handleGenerateDocument("xlsx")}
                style={{ opacity: !input.trim() || generating ? 0.4 : 1 }}
              >
                📊
              </div>
              <div
                className={`attach-btn ${searchMode ? "active-mode" : ""}`}
                title={searchMode ? "Web search mode ON — click to turn off" : "Search the web for current info"}
                onClick={() => setSearchMode(!searchMode)}
              >
                🔍
              </div>
              <textarea
                className="chat-input"
                placeholder={
                  searching
                    ? "Searching the web…"
                    : searchMode
                    ? "Search the web…"
                    : generating
                    ? "Planning your document…"
                    : "Message MyChat4, attach a document, or generate a presentation/spreadsheet…"
                }
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={loading || generating || searching}
              />
              <div
                className="send-btn"
                style={{ opacity: !input.trim() || loading ? 0.4 : 1 }}
                onClick={handleSend}
              >
                ↑
              </div>
            </div>
          </div>
        </div>
      </div>

      {expandedPreview && (
        <div className="preview-modal-overlay" onClick={() => setExpandedPreview(null)}>
          <div className="preview-modal" onClick={(e) => e.stopPropagation()}>
            <div className="preview-modal-header">
              <div>
                <div className="preview-modal-title">{expandedPreview.plan.title}</div>
                <div className="preview-modal-meta">
                  {expandedPreview.docType === "pptx"
                    ? `${expandedPreview.plan.slides?.length || 0} slides`
                    : `${expandedPreview.plan.rows?.length || 0} rows`}
                </div>
              </div>
              <div className="preview-modal-close" onClick={() => setExpandedPreview(null)}>✕</div>
            </div>

            <div className="preview-modal-body">
              {expandedPreview.docType === "pptx" ? (
                expandedPreview.plan.slides?.map((s, i) => (
                  <div key={i} className="preview-modal-slide">
                    <div className="preview-modal-slide-num">Slide {i + 1}</div>
                    <div className="preview-modal-slide-heading">{s.heading}</div>
                    {s.bullets?.map((b, j) => (
                      <div key={j} className="preview-modal-slide-bullet">• {b}</div>
                    ))}
                  </div>
                ))
              ) : (
                <table className="preview-modal-table">
                  <thead>
                    <tr>
                      {expandedPreview.plan.headers?.map((h, i) => <th key={i}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {expandedPreview.plan.rows?.map((row, i) => {
                      const isTotalRow = String(row[0] || "").toLowerCase().match(/total|sum|average|overall/);
                      return (
                        <tr key={i} className={isTotalRow ? "gen-total-row" : ""}>
                          {row.map((cell, j) => <td key={j}>{cell}</td>)}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div
              className="gen-download-btn"
              style={{ margin: "16px 24px" }}
              onClick={() => handleDownloadGenerated(expandedPreview.plan, expandedPreview.docType)}
            >
              ⬇ Download {expandedPreview.docType === "pptx" ? ".pptx" : ".xlsx"}
            </div>
          </div>

          <style>{`
            .preview-modal-overlay {
              position: fixed; inset: 0; z-index: 120;
              background: rgba(0,0,0,0.8); backdrop-filter: blur(4px);
              display: flex; align-items: center; justify-content: center;
              padding: 30px;
            }

            .preview-modal {
              width: 700px; max-width: 100%; max-height: 85vh;
              background: #0a0505; border: 1px solid rgba(255,46,46,0.25);
              border-radius: 18px; display: flex; flex-direction: column;
              box-shadow: 0 0 60px rgba(255,46,46,0.15);
            }

            .preview-modal-header {
              display: flex; align-items: center; justify-content: space-between;
              padding: 20px 24px; border-bottom: 1px solid rgba(255,46,46,0.12);
            }

            .preview-modal-title {
              font-family: 'Space Grotesk', sans-serif; font-weight: 600;
              font-size: 16px; color: #F2E8E5;
            }

            .preview-modal-meta { font-size: 11.5px; color: #8A7570; margin-top: 3px; }

            .preview-modal-close {
              width: 30px; height: 30px; border-radius: 8px;
              display: flex; align-items: center; justify-content: center;
              cursor: pointer; color: #8A7570; border: 1px solid rgba(255,46,46,0.15);
            }

            .preview-modal-close:hover { background: rgba(255,46,46,0.1); color: #FF9E9E; }

            .preview-modal-body {
              flex: 1; overflow-y: auto; padding: 20px 24px;
            }

            .preview-modal-body::-webkit-scrollbar { width: 5px; }
            .preview-modal-body::-webkit-scrollbar-thumb { background: rgba(255,46,46,0.2); border-radius: 4px; }

            .preview-modal-slide {
              padding: 14px 0; border-bottom: 1px solid rgba(255,46,46,0.1);
            }

            .preview-modal-slide:last-child { border-bottom: none; }

            .preview-modal-slide-num {
              font-size: 10px; color: #FF6B6B; font-weight: 600;
              text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px;
            }

            .preview-modal-slide-heading {
              font-size: 15px; font-weight: 600; color: #F2E0DC; margin-bottom: 8px;
            }

            .preview-modal-slide-bullet {
              font-size: 12.5px; color: #C9B8B4; line-height: 1.7;
            }

            .preview-modal-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }

            .preview-modal-table th {
              text-align: left; padding: 10px 12px; color: #FFB3B0; font-weight: 600;
              border-bottom: 2px solid rgba(255,46,46,0.3); position: sticky; top: 0;
              background: #0a0505;
            }

            .preview-modal-table td {
              padding: 10px 12px; color: #C9B8B4; border-bottom: 1px solid rgba(255,46,46,0.08);
            }
          `}</style>
        </div>
      )}

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        initialSection={settingsSection}
      />

      <HistorySidebar
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        activeConversationId={conversationId}
        onSelectConversation={loadConversation}
        onNewChat={startNewChat}
        onStartIncognito={startIncognitoChat}
        incognitoSessions={incognitoSessions}
        onBoxCreated={(conv) => loadConversation(conv.id, false)}
      />

      {eincmDialogOpen && (
        <div className="eincm-overlay" onClick={() => setEincmDialogOpen(false)}>
          <div className="eincm-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="eincm-title">End this incognito session</div>
            <div className="eincm-desc">
              This chat was never saved anywhere. Choose what happens to it now.
            </div>

            <div className="eincm-option" onClick={handleIncognitoCompressedSave}>
              <div className="eincm-option-icon">📦</div>
              <div>
                <div className="eincm-option-title">Compressed Save</div>
                <div className="eincm-option-desc">
                  Download this chat as a file you keep — readable as text, and you
                  can drag it back into MyChat4 later to pick up right where you left off.
                </div>
              </div>
            </div>

            <div className="eincm-option danger" onClick={handleIncognitoStandardDelete}>
              <div className="eincm-option-icon">🗑</div>
              <div>
                <div className="eincm-option-title">Standard Delete</div>
                <div className="eincm-option-desc">
                  Gone for good, right now. Nothing is kept anywhere.
                </div>
              </div>
            </div>

            <div className="eincm-cancel" onClick={() => setEincmDialogOpen(false)}>
              Keep chatting instead
            </div>
          </div>

          <style>{`
            .eincm-overlay {
              position: fixed; inset: 0; z-index: 110;
              background: rgba(0,0,0,0.75); backdrop-filter: blur(4px);
              display: flex; align-items: center; justify-content: center;
            }

            .eincm-dialog {
              width: 420px; max-width: 90vw;
              background: #0a0505; border: 1px solid rgba(255,46,46,0.25);
              border-radius: 18px; padding: 28px;
              box-shadow: 0 0 60px rgba(255,46,46,0.15);
            }

            .eincm-title {
              font-family: 'Space Grotesk', sans-serif; font-weight: 600;
              font-size: 16px; color: #F2E8E5; margin-bottom: 6px;
            }

            .eincm-desc { font-size: 12.5px; color: #8A7570; line-height: 1.5; margin-bottom: 20px; }

            .eincm-option {
              display: flex; gap: 12px; padding: 14px; border-radius: 12px;
              background: rgba(255,46,46,0.06); border: 1px solid rgba(255,46,46,0.2);
              cursor: pointer; margin-bottom: 10px; transition: all 0.2s;
            }

            .eincm-option:hover { background: rgba(255,46,46,0.12); }

            .eincm-option.danger { background: rgba(139,26,26,0.08); border-color: rgba(255,46,46,0.15); }
            .eincm-option.danger:hover { background: rgba(139,26,26,0.16); }

            .eincm-option-icon { font-size: 20px; flex-shrink: 0; margin-top: 2px; }

            .eincm-option-title { font-size: 13.5px; font-weight: 600; color: #F2E0DC; margin-bottom: 4px; }
            .eincm-option-desc { font-size: 11.5px; color: #8A7570; line-height: 1.5; }

            .eincm-cancel {
              text-align: center; font-size: 12px; color: #6B5551;
              cursor: pointer; padding: 10px; margin-top: 4px;
            }

            .eincm-cancel:hover { color: #E0A8A3; }
          `}</style>
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap');

        * { margin: 0; padding: 0; box-sizing: border-box; }

        .app-root {
          background: #000000;
          font-family: 'Inter', sans-serif;
          color: #E8E0DC;
          height: 100vh;
          overflow: hidden;
          position: relative;
        }

        .smoke-layer {
          position: fixed;
          inset: 0;
          z-index: 0;
          overflow: hidden;
          pointer-events: none;
        }

        .smoke-blob {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          opacity: calc(var(--smoke-intensity, 0.35) * 1);
          mix-blend-mode: screen;
          transition: opacity 0.4s ease;
        }

        .smoke-1 {
          width: calc(500px * (0.7 + var(--smoke-intensity, 0.35) * 0.6));
          height: calc(500px * (0.7 + var(--smoke-intensity, 0.35) * 0.6));
          background: radial-gradient(circle, #FF2E2E 0%, #8B1A1A 60%, transparent 75%);
          top: -10%; left: -5%;
          animation: drift1 22s ease-in-out infinite;
        }

        .smoke-2 {
          width: calc(600px * (0.7 + var(--smoke-intensity, 0.35) * 0.6));
          height: calc(600px * (0.7 + var(--smoke-intensity, 0.35) * 0.6));
          background: radial-gradient(circle, #FF4444 0%, #6B0F0F 55%, transparent 75%);
          bottom: -15%; right: -10%;
          animation: drift2 28s ease-in-out infinite;
        }

        .smoke-3 {
          width: calc(380px * (0.7 + var(--smoke-intensity, 0.35) * 0.6));
          height: calc(380px * (0.7 + var(--smoke-intensity, 0.35) * 0.6));
          background: radial-gradient(circle, #FF6B6B 0%, #7A1515 60%, transparent 75%);
          top: 40%; left: 50%;
          animation: drift3 18s ease-in-out infinite;
          opacity: calc(var(--smoke-intensity, 0.35) * 0.63);
        }

        @keyframes drift1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(60px, 40px) scale(1.15); }
          66% { transform: translate(-30px, 70px) scale(0.9); }
        }
        @keyframes drift2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          40% { transform: translate(-70px, -50px) scale(1.1); }
          70% { transform: translate(40px, -30px) scale(0.95); }
        }
        @keyframes drift3 {
          0%, 100% { transform: translate(-50%, 0) scale(1); }
          50% { transform: translate(-50%, -40px) scale(1.3); }
        }

        .grain {
          position: fixed; inset: 0; z-index: 1; pointer-events: none;
          opacity: var(--grain-opacity, 0.025);
          transition: opacity 0.3s ease;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
        }

        .app-shell { position: relative; z-index: 2; display: flex; height: 100vh; }

        .history-rail {
          position: relative; width: 88px; flex-shrink: 0;
          display: flex; flex-direction: column; align-items: center;
          padding: 24px 0; z-index: 3; height: 100%;
        }

        .history-curve {
          position: absolute; top: 0; left: -180px; width: 268px; height: 100%;
          background: linear-gradient(135deg, rgba(20,8,8,0.95), rgba(10,4,4,0.98));
          border-radius: 0 140px 140px 0;
          border: 1px solid rgba(255,46,46,0.15);
          border-left: none;
          box-shadow: 20px 0 60px rgba(0,0,0,0.6), inset -1px 0 0 rgba(255,46,46,0.08);
        }

        .history-logo {
          position: relative; width: 44px; height: 44px; border-radius: 50%;
          background: radial-gradient(circle at 30% 30%, #FF4444, #8B1A1A 70%);
          display: flex; align-items: center; justify-content: center;
          font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 17px;
          color: #0a0202;
          box-shadow: 0 0 24px rgba(255,46,46,0.5), 0 0 4px rgba(255,46,46,0.8);
          margin-bottom: 32px; cursor: pointer;
        }

        .history-items { position: relative; display: flex; flex-direction: column; gap: 14px; align-items: center; }

        .history-rail-bottom {
          position: relative; margin-top: auto; display: flex;
          flex-direction: column; gap: 10px; align-items: center;
          padding-bottom: 4px;
        }

        .history-dot {
          width: 40px; height: 40px; border-radius: 50%;
          background: rgba(255,46,46,0.06);
          border: 1px solid rgba(255,46,46,0.18);
          display: flex; align-items: center; justify-content: center;
          font-size: 15px; color: #B8756B; cursor: pointer;
          transition: all 0.25s ease;
        }

        .history-dot:hover {
          background: rgba(255,46,46,0.14); border-color: rgba(255,46,46,0.45);
          color: #FF6B6B; transform: scale(1.08); box-shadow: 0 0 16px rgba(255,46,46,0.25);
        }

        .history-dot.active {
          background: rgba(255,46,46,0.22); border-color: #FF2E2E;
          color: #FFAFAF; box-shadow: 0 0 20px rgba(255,46,46,0.4);
        }

        .main {
          flex: 1; display: flex; flex-direction: column;
          max-width: 900px; margin: 0 auto; width: 100%; position: relative;
        }

        .top-bar {
          display: flex; align-items: center; justify-content: space-between;
          padding: 20px 32px 16px;
        }

        .brand-mark {
          font-family: 'Space Grotesk', sans-serif; font-weight: 700;
          font-size: 19px; letter-spacing: -0.02em; color: #F2E8E5;
        }

        .brand-mark span { color: #FF2E2E; text-shadow: 0 0 20px rgba(255,46,46,0.6); }

        .active-doc-pill {
          display: flex; align-items: center; gap: 8px;
          background: rgba(255,46,46,0.08); border: 1px solid rgba(255,46,46,0.28);
          border-radius: 20px; padding: 6px 12px; font-size: 12px; color: #F2C4BF;
        }

        .top-bar-right { display: flex; align-items: center; gap: 10px; }

        .user-menu {
          display: flex; align-items: center; gap: 8px;
          padding: 6px 10px; border-radius: 20px;
          background: rgba(255,255,255,0.03); border: 1px solid rgba(255,46,46,0.15);
        }

        .user-email { font-size: 11px; color: #8A7570; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        .logout-btn {
          width: 20px; height: 20px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 11px; color: #8A7570; cursor: pointer; transition: all 0.15s;
        }

        .logout-btn:hover { background: rgba(255,46,46,0.15); color: #FF9E9E; }

        .incognito-badge {
          font-size: 11.5px; color: #C9938D; padding: 6px 12px;
          background: rgba(139, 26, 26, 0.15); border: 1px solid rgba(255,46,46,0.25);
          border-radius: 20px; display: flex; align-items: center; gap: 10px;
        }

        .incognito-end-btn {
          font-size: 10.5px; color: #FF9E9E; cursor: pointer;
          padding: 3px 9px; border-radius: 10px; background: rgba(255,46,46,0.15);
          font-weight: 600; white-space: nowrap;
        }

        .incognito-end-btn:hover { background: rgba(255,46,46,0.28); }

        .history-dot.incognito {
          background: rgba(139, 26, 26, 0.3); border-color: #8B1A1A;
        }

        .pill-clear { cursor: pointer; opacity: 0.6; padding: 0 2px; }
        .pill-clear:hover { opacity: 1; }

        .messages {
          flex: 1; overflow-y: auto; padding: 20px 32px;
          display: flex; flex-direction: column; gap: var(--message-gap, 20px);
          transition: gap 0.25s ease;
        }

        .messages::-webkit-scrollbar { width: 5px; }
        .messages::-webkit-scrollbar-thumb { background: rgba(255,46,46,0.2); border-radius: 4px; }

        .msg-row { display: flex; gap: 22px; max-width: 100%; align-items: flex-start; }
        .msg-row.user { justify-content: flex-end; }

        .msg-avatar {
          width: 30px; height: 30px; border-radius: 50%;
          background: radial-gradient(circle at 30% 30%, #FF4444, #6B0F0F 70%);
          flex-shrink: 0;
          box-shadow: 0 0 calc(var(--glow-intensity, 0.5) * 24px) rgba(255,46,46, calc(var(--glow-intensity, 0.5) * 0.7));
          margin-top: 2px;
          transition: box-shadow 0.25s ease;
        }

        .ai-response-stack {
          display: flex; flex-direction: column; gap: 12px; max-width: 70%;
        }

        .msg-bubble {
          max-width: 66%; padding: var(--bubble-padding, 14px 18px); border-radius: 18px;
          font-size: var(--chat-font-size, 14px); line-height: 1.7; position: relative;
          transition: padding 0.25s ease, font-size 0.25s ease;
        }

        .ai-response-stack .msg-bubble { max-width: 100%; }

        /* ---------- Tree diagram ---------- */
        .tree-diagram {
          background: rgba(255,46,46,0.04); border: 1px solid rgba(255,46,46,0.18);
          border-radius: 16px; padding: 18px; width: 100%;
        }

        .tree-root {
          font-size: 13.5px; font-weight: 700; color: #FFB3B0;
          background: rgba(255,46,46,0.18); border: 1px solid rgba(255,46,46,0.4);
          border-radius: 10px; padding: 10px 16px; text-align: center;
          margin-bottom: 16px; position: relative;
        }

        .tree-root::after {
          content: ''; position: absolute; bottom: -16px; left: 50%;
          width: 1px; height: 16px; background: rgba(255,46,46,0.35);
        }

        .tree-branches {
          display: flex; flex-wrap: wrap; gap: 12px; justify-content: center;
        }

        .tree-branch {
          flex: 1; min-width: 140px; background: rgba(0,0,0,0.25);
          border: 1px solid rgba(255,46,46,0.15); border-radius: 12px; padding: 12px;
          position: relative;
        }

        .tree-branch::before {
          content: ''; position: absolute; top: -12px; left: 50%;
          width: 1px; height: 12px; background: rgba(255,46,46,0.3);
        }

        .tree-branch-label {
          font-size: 12px; font-weight: 600; color: #E0A8A3; margin-bottom: 8px;
        }

        .tree-children { display: flex; flex-direction: column; gap: 5px; }

        .tree-child {
          font-size: 11px; color: #9A8580; padding-left: 10px;
          border-left: 2px solid rgba(255,46,46,0.2);
        }

        /* ---------- Bar chart ---------- */
        .bar-chart {
          background: rgba(255,46,46,0.04); border: 1px solid rgba(255,46,46,0.18);
          border-radius: 16px; padding: 18px; width: 100%;
        }

        .bar-chart-title {
          font-size: 12.5px; font-weight: 600; color: #FFB3B0; margin-bottom: 14px;
        }

        .bar-chart-bars { display: flex; flex-direction: column; gap: 10px; }

        .bar-chart-row { display: flex; align-items: center; gap: 10px; }

        .bar-chart-label {
          width: 90px; flex-shrink: 0; font-size: 11.5px; color: #C9B8B4;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }

        .bar-chart-track {
          flex: 1; height: 16px; background: rgba(0,0,0,0.3);
          border-radius: 8px; overflow: hidden;
        }

        .bar-chart-fill {
          height: 100%; background: linear-gradient(90deg, #8B1A1A, #FF2E2E);
          border-radius: 8px; transition: width 0.6s ease;
        }

        .bar-chart-value {
          width: 44px; flex-shrink: 0; font-size: 11px; color: #8A7570;
          text-align: right; font-family: monospace;
        }

        .msg-row.ai .msg-bubble {
          background: rgba(255,255,255,0.035); border: 1px solid rgba(255,46,46,0.1);
          color: #EDE2DE;
        }

        .msg-row.user .msg-bubble {
          background: linear-gradient(135deg, rgba(139,26,26,0.5), rgba(90,10,10,0.6));
          border: 1px solid rgba(255,46,46,0.3); color: #FDEEEC;
        }

        .stream-cursor {
          display: inline-block; width: 7px; height: 15px; background: #FF4444;
          box-shadow: 0 0 calc(var(--glow-intensity, 0.5) * 16px) rgba(255,46,46, calc(var(--glow-intensity, 0.5) * 0.9));
          margin-left: 2px;
          vertical-align: middle; animation: blink 0.9s step-start infinite;
        }

        @keyframes blink { 50% { opacity: 0; } }

        .provider-tag {
          margin-top: 8px; font-size: 10px; color: #8A7570;
          font-family: monospace; opacity: 0.7;
        }

        .doc-block { display: flex; flex-direction: column; gap: 8px; }

        .attach-btn.active-mode {
          background: rgba(255,46,46,0.2); border-color: #FF2E2E; color: #FFB3B0;
          box-shadow: 0 0 12px rgba(255,46,46,0.35);
        }

        .search-card {
          background: rgba(255,46,46,0.05); border: 1px solid rgba(255,46,46,0.22);
          border-radius: 18px; padding: 18px 20px; max-width: 560px; width: 100%;
          box-shadow: 0 0 24px rgba(255,46,46,0.06);
        }

        .search-card-label {
          font-size: 10.5px; font-weight: 600; color: #FF6B6B;
          text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 12px;
        }

        .search-card-answer {
          font-size: var(--chat-font-size, 14px); line-height: 1.7; color: #EDE2DE;
          margin-bottom: 14px;
        }

        .citation-chip {
          display: inline-flex; align-items: center; justify-content: center;
          min-width: 16px; height: 16px; padding: 0 4px; border-radius: 5px;
          background: rgba(255,46,46,0.22); color: #FFB3B0; font-size: 10px;
          font-weight: 700; cursor: pointer; vertical-align: 2px;
          margin: 0 1px; transition: all 0.15s;
        }

        .citation-chip:hover { background: rgba(255,46,46,0.4); color: #fff; }

        .search-source-flash {
          animation: sourceFlash 1.2s ease;
        }

        @keyframes sourceFlash {
          0%, 100% { background: rgba(255,46,46,0.04); }
          25% { background: rgba(255,46,46,0.3); border-color: #FF2E2E; }
        }

        .search-sources { border-top: 1px solid rgba(255,46,46,0.12); padding-top: 12px; }

        .search-sources-label {
          font-size: 10px; color: #6B5551; text-transform: uppercase;
          letter-spacing: 0.08em; margin-bottom: 8px; font-weight: 600;
        }

        .search-source-item {
          display: flex; align-items: flex-start; gap: 10px; padding: 8px 10px;
          border-radius: 10px; text-decoration: none; margin-bottom: 4px;
          background: rgba(255,46,46,0.04); border: 1px solid transparent;
          transition: all 0.2s;
        }

        .search-source-item:hover {
          background: rgba(255,46,46,0.1); border-color: rgba(255,46,46,0.25);
        }

        .search-source-num {
          width: 18px; height: 18px; border-radius: 50%; flex-shrink: 0;
          background: rgba(255,46,46,0.2); color: #FFB3B0; font-size: 10px;
          font-weight: 600; display: flex; align-items: center; justify-content: center;
          margin-top: 1px;
        }

        .search-source-text { min-width: 0; }

        .search-source-title {
          font-size: 12px; font-weight: 500; color: #E0D0CC;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }

        .search-source-url { font-size: 10.5px; color: #6B5551; margin-top: 2px; }

        .gen-card {
          background: rgba(255,46,46,0.04); border: 1px solid rgba(255,46,46,0.22);
          border-radius: 16px; padding: 18px; max-width: 520px; width: 100%;
        }

        .gen-card-header { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }

        .gen-card-icon {
          width: 38px; height: 38px; border-radius: 10px; flex-shrink: 0;
          background: rgba(255,46,46,0.15); display: flex; align-items: center;
          justify-content: center; font-size: 17px;
        }

        .gen-card-title { font-size: 13.5px; font-weight: 600; color: #F2E0DC; }
        .gen-card-meta { font-size: 10.5px; color: #8A7570; margin-top: 2px; }

        .gen-expand-btn {
          margin-left: auto; width: 28px; height: 28px; border-radius: 8px;
          display: flex; align-items: center; justify-content: center;
          font-size: 14px; color: #8A7570; cursor: pointer;
          border: 1px solid rgba(255,46,46,0.18); flex-shrink: 0;
        }

        .gen-expand-btn:hover { background: rgba(255,46,46,0.1); color: #FF9E9E; }

        .gen-card-preview {
          background: rgba(0,0,0,0.3); border-radius: 10px; padding: 12px;
          margin-bottom: 14px; max-height: 340px; overflow-y: auto;
        }

        .gen-total-row td {
          font-weight: 700 !important; color: #FF9E9E !important;
          border-top: 2px solid rgba(255,46,46,0.3) !important;
        }

        .gen-slide-preview {
          display: flex; gap: 10px; padding: 8px 0;
          border-bottom: 1px solid rgba(255,46,46,0.08);
        }

        .gen-slide-preview:last-child { border-bottom: none; }

        .gen-slide-num {
          width: 20px; height: 20px; border-radius: 50%; flex-shrink: 0;
          background: rgba(255,46,46,0.2); color: #FFB3B0; font-size: 10px;
          font-weight: 600; display: flex; align-items: center; justify-content: center;
          margin-top: 1px;
        }

        .gen-slide-heading { font-size: 12px; font-weight: 600; color: #E0D0CC; margin-bottom: 3px; }
        .gen-slide-bullet { font-size: 11px; color: #8A7570; line-height: 1.5; }

        .gen-more-note { font-size: 10.5px; color: #6B5551; text-align: center; padding-top: 8px; }

        .gen-table-preview { width: 100%; border-collapse: collapse; font-size: 11px; }

        .gen-table-preview th {
          text-align: left; padding: 6px 8px; color: #FFB3B0; font-weight: 600;
          border-bottom: 1px solid rgba(255,46,46,0.25);
        }

        .gen-table-preview td {
          padding: 6px 8px; color: #C9B8B4; border-bottom: 1px solid rgba(255,46,46,0.08);
        }

        .gen-download-btn {
          text-align: center; padding: 10px; border-radius: 10px;
          background: linear-gradient(135deg, #FF2E2E, #8B1A1A); color: #0a0202;
          font-size: 12.5px; font-weight: 600; cursor: pointer;
          box-shadow: 0 0 16px rgba(255,46,46,0.3); transition: all 0.2s;
        }

        .gen-download-btn:hover { box-shadow: 0 0 24px rgba(255,46,46,0.45); }

        .doc-inline-card {
          background: rgba(255,46,46,0.05); border: 1px solid rgba(255,46,46,0.22);
          border-radius: 14px; padding: 14px 16px; display: flex; align-items: center;
          gap: 12px; max-width: 340px;
        }

        .doc-icon {
          width: 36px; height: 36px; border-radius: 10px;
          background: rgba(255,46,46,0.15); display: flex; align-items: center;
          justify-content: center; font-size: 16px; flex-shrink: 0;
        }

        .doc-info-name { font-size: 12.5px; font-weight: 600; color: #F2E0DC; }
        .doc-info-meta { font-size: 10.5px; color: #8A7570; margin-top: 2px; }

        .preset-chips { display: flex; gap: 8px; flex-wrap: wrap; }

        .chip {
          font-size: 11.5px; padding: 7px 14px; border-radius: 20px;
          background: rgba(255,46,46,0.06); border: 1px solid rgba(255,46,46,0.25);
          color: #E0A8A3; cursor: pointer; transition: all 0.2s;
        }

        .chip:hover {
          background: rgba(255,46,46,0.16); color: #FFC7C4;
          box-shadow: 0 0 10px rgba(255,46,46,0.2);
        }

        .typing-bubble { display: flex; gap: 5px; align-items: center; padding: 16px 18px; }

        .type-dot {
          width: 7px; height: 7px; border-radius: 50%; background: #FF4444;
          display: inline-block; animation: dotbounce 1.2s ease-in-out infinite;
          box-shadow: 0 0 6px rgba(255,46,46,0.5);
        }

        @keyframes dotbounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-6px); opacity: 1; }
        }

        .error-box {
          background: rgba(255,46,46,0.08); border: 1px solid rgba(255,46,46,0.35);
          color: #FF9E9E; font-size: 12px; padding: 12px 16px; border-radius: 10px;
          white-space: pre-wrap;
        }

        .input-zone { padding: 16px 32px 26px; }

        .attach-indicator {
          display: flex; align-items: center; gap: 8px;
          background: rgba(255,46,46,0.07); border: 1px solid rgba(255,46,46,0.25);
          border-radius: 12px; padding: 8px 14px; margin-bottom: 10px;
          font-size: 12px; color: #E0A8A3;
        }

        .attach-indicator-icon { font-size: 13px; }
        .attach-indicator-text { flex: 1; }
        .attach-indicator-text strong { color: #F2C4BF; font-weight: 600; }

        .attach-indicator-clear {
          cursor: pointer; color: #8A7570; font-size: 11px;
          padding: 3px 8px; border-radius: 6px; transition: all 0.15s;
        }

        .attach-indicator-clear:hover { color: #FF9E9E; background: rgba(255,46,46,0.1); }

        .waking-text {
          font-size: 12.5px; color: #E0A8A3; padding: 2px 4px; line-height: 1.5;
        }

        .input-shell {
          display: flex; align-items: flex-end; gap: 10px;
          background: rgba(255,255,255,0.03); border: 1px solid rgba(255,46,46,0.2);
          border-radius: 16px; padding: 10px 12px 10px 16px;
          box-shadow: 0 0 calc(var(--glow-intensity, 0.5) * 60px) rgba(255,46,46, calc(var(--glow-intensity, 0.5) * 0.12));
          transition: box-shadow 0.25s ease;
        }

        .attach-btn, .send-btn {
          width: 36px; height: 36px; border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; flex-shrink: 0; font-size: 16px; transition: all 0.2s;
        }

        .attach-btn {
          background: transparent; border: 1px solid rgba(255,46,46,0.2); color: #8A7570;
        }

        .attach-btn:hover { background: rgba(255,46,46,0.08); color: #E0A8A3; }

        .send-btn {
          background: linear-gradient(135deg, #FF2E2E, #8B1A1A);
          border: none; color: #0a0202;
          box-shadow: 0 0 calc(var(--glow-intensity, 0.5) * 32px) rgba(255,46,46, calc(var(--glow-intensity, 0.5) * 0.8));
          transition: box-shadow 0.25s ease;
        }

        .chat-input {
          flex: 1; background: transparent; border: none; outline: none;
          color: #EDE2DE; font-size: 14px; font-family: inherit; padding: 8px 0;
          resize: none; max-height: 160px;
        }

        .chat-input::placeholder { color: #5A4844; }
      `}</style>
    </div>
  );
}