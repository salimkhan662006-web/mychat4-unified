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
import { messageFromRow } from "./messageMapping";
import SmokeBackground from "./components/SmokeBackground";
import HistoryRail from "./components/HistoryRail";
import TopBar from "./components/TopBar";
import MessageList from "./components/MessageList";
import ChatInput from "./components/ChatInput";
import PreviewModal from "./components/PreviewModal";
import EincmDialog from "./components/EincmDialog";

let idCounter = 0;
const nextId = () => `m-${Date.now()}-${idCounter++}`;

// Greeting / status messages are marked isGreeting so they are never sent
// to the AI as part of the conversation and never saved in .mchat files.
function systemMessage(content) {
  return { id: nextId(), role: "assistant", type: "text", content, isGreeting: true };
}

function firstNameOf(user) {
  const full = user?.user_metadata?.full_name || user?.user_metadata?.name;
  return full ? String(full).trim().split(/\s+/)[0] : "";
}

function greetingFor(user, text) {
  const name = firstNameOf(user);
  return systemMessage(`Hi${name ? ` ${name}` : ""} — ${text}`);
}

export default function App() {
  const { user, loading: authLoading } = useAuth();

  // messages: { id, role: "user"|"assistant", type: "text"|"doc-card"|"search-card"|"doc-gen-card", content, ... }
  const [messages, setMessages] = useState(() => [
    systemMessage("I'm ready when you are. Ask me anything, or attach a document and I'll read it for you."),
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
  const [incognitoSessions, setIncognitoSessions] = useState([]); // in-memory only: [{ id, title }]
  const [eincmDialogOpen, setEincmDialogOpen] = useState(false);
  const [eincmImportError, setEincmImportError] = useState("");
  const [generating, setGenerating] = useState(false);
  const [expandedPreview, setExpandedPreview] = useState(null); // { plan, docType } | null
  const [searchMode, setSearchMode] = useState(false);
  const [searching, setSearching] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const importFileRef = useRef(null);
  const fileInputRef = useRef(null);
  const { displayed, stream } = useStreamingText();
  const [streamingMsgId, setStreamingMsgId] = useState(null);

  // Every incognito session's messages, kept ONLY in this browser tab's memory
  // (never sent to the database). Lets you switch between incognito sessions
  // without losing or mixing up their messages.
  const incognitoStoreRef = useRef({});
  // Guards against a slow chat-load finishing after you've already clicked another chat.
  const loadSeqRef = useRef(0);

  // Keep the active incognito session's messages mirrored into the in-memory store.
  useEffect(() => {
    if (isIncognito && conversationId) {
      incognitoStoreRef.current[conversationId] = messages;
    }
  }, [messages, isIncognito, conversationId]);

  // PRIVACY: when the logged-in person changes (logout, or someone else logs in),
  // wipe everything the previous person had on screen — messages, incognito chats,
  // attached documents, open dialogs — so nothing leaks between accounts.
  useEffect(() => {
    loadSeqRef.current += 1;
    incognitoStoreRef.current = {};
    setMessages([greetingFor(user, "I'm ready when you are. Ask me anything, or attach a document and I'll read it for you.")]);
    setConversationId(null);
    setIsIncognito(false);
    setIncognitoSessions([]);
    setActiveDoc(null);
    setLastDocAnswer(null);
    setInput("");
    setErrorMsg("");
    setEincmImportError("");
    setSearchMode(false);
    setExpandedPreview(null);
    setEincmDialogOpen(false);
    setSettingsOpen(false);
    setHistoryOpen(false);
    setStreamingMsgId(null);
  }, [user?.id]);

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

  // `meta` carries the rich extras (tree/chart, search sources, generated-file
  // preview) so they are still there when this chat is reopened later.
  function persistMessage(convId, role, content, meta = null) {
    if (isIncognito || !convId) return; // never save incognito messages
    saveMessage(convId, role, content, false, meta).catch((err) =>
      console.warn("Message save failed (non-fatal):", err.message)
    );
  }

  function clearActiveDoc() {
    setActiveDoc(null);
    setLastDocAnswer(null);
  }

  function openSettings(section) {
    setSettingsSection(section);
    setSettingsOpen(true);
  }

  function startNewChat() {
    loadSeqRef.current += 1;
    setMessages([greetingFor(user, "ready when you are. Ask me anything, or attach a document.")]);
    setConversationId(null);
    setIsIncognito(false);
    clearActiveDoc();
    setHistoryOpen(false);
  }

  function startIncognitoChat() {
    loadSeqRef.current += 1;
    const sessionId = `incognito-${nextId()}`;
    setMessages([
      systemMessage(
        "Enhanced Incognito — this chat stays here in the app for your whole session, but it's never saved to any server. When you're done, you can delete it for good or compress it into a file you keep yourself."
      ),
    ]);
    setConversationId(sessionId);
    setIsIncognito(true);
    clearActiveDoc();
    setIncognitoSessions((prev) => [
      ...prev,
      { id: sessionId, title: `Incognito chat ${prev.length + 1}` },
    ]);
    setHistoryOpen(false);
  }

  function forgetIncognitoSession(sessionId) {
    delete incognitoStoreRef.current[sessionId];
    setIncognitoSessions((prev) => prev.filter((s) => s.id !== sessionId));
  }

  // EINCM — Enhanced Incognito Mode: standard delete or compressed save.
  function handleIncognitoStandardDelete() {
    forgetIncognitoSession(conversationId);
    setEincmDialogOpen(false);
    startNewChat();
  }

  async function handleIncognitoCompressedSave() {
    const realMessages = messages.filter((m) => m.type === "text" && !m.isGreeting);
    const session = incognitoSessions.find((s) => s.id === conversationId);
    const title = session?.title || "Incognito chat";

    try {
      const fileContent = await buildCompressedSaveFile(title, realMessages);
      downloadSaveFile(fileContent, title);
      // Once saved to a file, the in-app copy is removed — the file
      // is now the only place this chat exists.
      forgetIncognitoSession(conversationId);
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

      loadSeqRef.current += 1;
      const sessionId = `incognito-${nextId()}`;
      const restoredMessages = restored.messages.map((m) => ({
        id: nextId(),
        role: m.role,
        type: "text",
        content: m.content,
      }));

      setMessages([
        systemMessage(
          `Resumed from your saved file "${restored.title}" (originally saved ${new Date(restored.savedAt).toLocaleDateString()}). This is an Enhanced Incognito session — still never saved to any server.`
        ),
        ...restoredMessages,
      ]);
      setConversationId(sessionId);
      setIsIncognito(true);
      clearActiveDoc();
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
    const seq = ++loadSeqRef.current;
    clearActiveDoc();

    if (incognito) {
      // Incognito sessions live only in memory: restore this session's own
      // messages from the in-memory store (they were never saved anywhere else).
      setConversationId(id);
      setIsIncognito(true);
      setMessages(
        incognitoStoreRef.current[id] || [systemMessage("This incognito chat is empty — say something to get started.")]
      );
      return;
    }

    setIsIncognito(false);
    setConversationId(id);
    // Show a neutral placeholder right away so the previous chat's messages are
    // never visible (or typed into) while the selected chat is still loading.
    setMessages([systemMessage("Loading this chat…")]);

    try {
      const msgs = await getConversationMessages(id);
      if (seq !== loadSeqRef.current) return; // you've moved on to another chat
      if (msgs.length === 0) {
        setMessages([systemMessage("This chat is empty — say something to get started.")]);
        return;
      }
      setMessages(msgs.map(messageFromRow));
    } catch (err) {
      if (seq !== loadSeqRef.current) return;
      setMessages([systemMessage("Couldn't load this chat. Please try again.")]);
      setErrorMsg(`Could not load chat: ${err.message}`);
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || loading || searching || generating) return;

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
      persistMessage(convId, "assistant", data.reply, {
        type: "text",
        provider: data.provider,
        ...(data.structure ? { structure: data.structure } : {}),
      });
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

      persistMessage(convId, "assistant", data.answer, {
        type: "search-card",
        sources: data.sources,
        provider: data.provider,
      });
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
      persistMessage(convId, "assistant", data.result, { type: "text", provider: data.provider });
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

      persistMessage(convId, "assistant", plan.title || "Untitled", {
        type: "doc-gen-card",
        docType,
        plan,
        provider,
      });
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
      <SmokeBackground />

      <div className="app-shell">
        <HistoryRail
          isIncognito={isIncognito}
          importFileRef={importFileRef}
          onOpenHistory={() => setHistoryOpen(true)}
          onNewChat={startNewChat}
          onStartIncognito={startIncognitoChat}
          onImportFile={handleImportFile}
          onOpenSettings={openSettings}
        />

        <div className="main">
          <TopBar
            isIncognito={isIncognito}
            onEndIncognito={() => setEincmDialogOpen(true)}
            activeDoc={activeDoc}
            onClearDoc={clearActiveDoc}
          />

          <MessageList
            messages={messages}
            streamingMsgId={streamingMsgId}
            displayed={displayed}
            busy={loading || searching || generating}
            wakingBackend={wakingBackend}
            errorMsg={errorMsg}
            importError={eincmImportError}
            onPresetTask={handlePresetTask}
            onExpandPreview={setExpandedPreview}
            onDownload={handleDownloadGenerated}
          />

          <ChatInput
            input={input}
            onInputChange={setInput}
            onKeyDown={handleKeyDown}
            onSend={handleSend}
            onGenerate={handleGenerateDocument}
            onToggleSearch={() => setSearchMode(!searchMode)}
            searchMode={searchMode}
            loading={loading}
            generating={generating}
            searching={searching}
            uploading={uploading}
            fileInputRef={fileInputRef}
            onFileChange={handleFileChange}
            activeDoc={activeDoc}
            onClearDoc={clearActiveDoc}
          />
        </div>
      </div>

      {expandedPreview && (
        <PreviewModal
          preview={expandedPreview}
          onClose={() => setExpandedPreview(null)}
          onDownload={handleDownloadGenerated}
        />
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
        <EincmDialog
          onSave={handleIncognitoCompressedSave}
          onDelete={handleIncognitoStandardDelete}
          onCancel={() => setEincmDialogOpen(false)}
        />
      )}
    </div>
  );
}