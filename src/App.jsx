import { useState, useRef, useEffect } from "react";
import {
  sendMessage,
  uploadDocument,
  runAgentTask,
  createConversation,
  getConversationMessages,
  saveMessage,
} from "./api";
import { useStreamingText } from "./useStreamingText";
import SettingsPanel from "./SettingsPanel";
import HistorySidebar from "./HistorySidebar";

const PRESET_TASKS = [
  { label: "Summarise", task: "Write a clear, concise summary of this document." },
  { label: "Key points", task: "Extract the key points as a bulleted list." },
  { label: "Flag risks", task: "Identify any risks, inconsistencies, or unusual clauses in this document." },
  { label: "Action items", task: "Find and list any action items, tasks, or deadlines mentioned." },
];

let idCounter = 0;
const nextId = () => `m-${Date.now()}-${idCounter++}`;

export default function App() {
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
        content: "Incognito mode — this chat won't be saved. It'll disappear when you refresh or close the tab.",
      },
    ]);
    setConversationId(sessionId);
    setIsIncognito(true);
    setActiveDoc(null);
    setLastDocAnswer(null);
    setIncognitoSessions((prev) => [...prev, { id: sessionId, title: "Incognito chat" }]);
    setHistoryOpen(false);
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
    if (!text || loading) return;

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
      });
      streamIntoMessage(msgId, data.reply);
      persistMessage(convId, "assistant", data.reply);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
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

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
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
              {isIncognito && <div className="incognito-badge">🕶 Incognito — not saved</div>}
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

              return (
                <div key={m.id} className={`msg-row ${m.role === "user" ? "user" : "ai"}`}>
                  {m.role === "assistant" && <div className="msg-avatar"></div>}
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
              <textarea
                className="chat-input"
                placeholder="Message MyChat4, or attach a document…"
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={loading}
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
          opacity: 0.35;
          mix-blend-mode: screen;
        }

        .smoke-1 {
          width: 500px; height: 500px;
          background: radial-gradient(circle, #FF2E2E 0%, #8B1A1A 60%, transparent 75%);
          top: -10%; left: -5%;
          animation: drift1 22s ease-in-out infinite;
        }

        .smoke-2 {
          width: 600px; height: 600px;
          background: radial-gradient(circle, #FF4444 0%, #6B0F0F 55%, transparent 75%);
          bottom: -15%; right: -10%;
          animation: drift2 28s ease-in-out infinite;
        }

        .smoke-3 {
          width: 380px; height: 380px;
          background: radial-gradient(circle, #FF6B6B 0%, #7A1515 60%, transparent 75%);
          top: 40%; left: 50%;
          animation: drift3 18s ease-in-out infinite;
          opacity: 0.22;
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
          0%, 100% { transform: translate(-50%, 0) scale(1); opacity: 0.22; }
          50% { transform: translate(-50%, -40px) scale(1.3); opacity: 0.32; }
        }

        .grain {
          position: fixed; inset: 0; z-index: 1; pointer-events: none;
          opacity: 0.025;
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

        .incognito-badge {
          font-size: 11.5px; color: #C9938D; padding: 6px 12px;
          background: rgba(139, 26, 26, 0.15); border: 1px solid rgba(255,46,46,0.25);
          border-radius: 20px;
        }

        .history-dot.incognito {
          background: rgba(139, 26, 26, 0.3); border-color: #8B1A1A;
        }

        .pill-clear { cursor: pointer; opacity: 0.6; padding: 0 2px; }
        .pill-clear:hover { opacity: 1; }

        .messages {
          flex: 1; overflow-y: auto; padding: 20px 32px;
          display: flex; flex-direction: column; gap: 20px;
        }

        .messages::-webkit-scrollbar { width: 5px; }
        .messages::-webkit-scrollbar-thumb { background: rgba(255,46,46,0.2); border-radius: 4px; }

        .msg-row { display: flex; gap: 22px; max-width: 100%; align-items: flex-start; }
        .msg-row.user { justify-content: flex-end; }

        .msg-avatar {
          width: 30px; height: 30px; border-radius: 50%;
          background: radial-gradient(circle at 30% 30%, #FF4444, #6B0F0F 70%);
          flex-shrink: 0; box-shadow: 0 0 12px rgba(255,46,46,0.35);
          margin-top: 2px;
        }

        .msg-bubble {
          max-width: 66%; padding: 14px 18px; border-radius: 18px;
          font-size: 14px; line-height: 1.7; position: relative;
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
          box-shadow: 0 0 8px rgba(255,46,46,0.7); margin-left: 2px;
          vertical-align: middle; animation: blink 0.9s step-start infinite;
        }

        @keyframes blink { 50% { opacity: 0; } }

        .provider-tag {
          margin-top: 8px; font-size: 10px; color: #8A7570;
          font-family: monospace; opacity: 0.7;
        }

        .doc-block { display: flex; flex-direction: column; gap: 8px; }

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
          box-shadow: 0 0 30px rgba(255,46,46,0.06);
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
          border: none; color: #0a0202; box-shadow: 0 0 16px rgba(255,46,46,0.4);
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