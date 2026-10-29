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
  updateConversation,
  listModels,
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
import MobileTopBar from "./components/MobileTopBar";
import TopBar from "./components/TopBar";
import MessageList from "./components/MessageList";
import ChatInput from "./components/ChatInput";
import PreviewModal from "./components/PreviewModal";
import EincmDialog from "./components/EincmDialog";
import BoxPanel from "./components/BoxPanel";
import VaultDialog from "./components/VaultDialog";
import { useVault } from "./useVault";
import { useIsMobile } from "./useIsMobile";

let idCounter = 0;
const nextId = () => `m-${Date.now()}-${idCounter++}`;

// Greeting / status messages are marked isGreeting so they are never sent
// to the AI as part of the conversation and never saved in .mchat files.
function systemMessage(content, extra = {}) {
  return { id: nextId(), role: "assistant", type: "text", content, isGreeting: true, ...extra };
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
  // Encrypted Incognito Vault (on-device only). Locks itself when the account changes.
  const vault = useVault(user?.id);
  const isMobile = useIsMobile();

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
  const [incognitoSessions, setIncognitoSessions] = useState([]); // [{ id, title, vaulted }] — vaulted ones are also kept encrypted on this device
  const [eincmDialogOpen, setEincmDialogOpen] = useState(false);
  const [eincmImportError, setEincmImportError] = useState("");
  const [generating, setGenerating] = useState(false);
  const [expandedPreview, setExpandedPreview] = useState(null); // { plan, docType } | null
  const [searchMode, setSearchMode] = useState(false);
  const [searching, setSearching] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [boxPanelOpen, setBoxPanelOpen] = useState(false);
  const [activeBoxId, setActiveBoxId] = useState(null); // box attached to the current chat
  // Model picker (SU-2). "auto" = the normal free chain. frontierInfo = { trial_total, trial_left }.
  const [models, setModels] = useState([]);
  const [frontierInfo, setFrontierInfo] = useState(null);
  const [selectedModel, setSelectedModel] = useState("auto");
  // Incognito chats never use a box, whatever is selected.
  const effectiveBoxId = isIncognito ? null : activeBoxId;
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
  // If the vault is unlocked and this session belongs to it, also queue an
  // encrypted, debounced save to THIS DEVICE's vault (never the server).
  useEffect(() => {
    if (isIncognito && conversationId) {
      incognitoStoreRef.current[conversationId] = messages;

      if (vault.isUnlocked) {
        const session = incognitoSessions.find((s) => s.id === conversationId);
        if (session?.vaulted) {
          vault.saveSession({ id: session.id, title: session.title, messages });
        }
      }
    }
  }, [messages, isIncognito, conversationId, incognitoSessions, vault.isUnlocked]);

  // After a successful unlock, bring the vault's chats back into the sidebar.
  useEffect(() => {
    const restored = vault.restoredSessions;
    if (!restored.length) return;
    restored.forEach((s) => {
      incognitoStoreRef.current[s.id] = s.messages;
    });
    setIncognitoSessions((prev) => {
      const have = new Set(prev.map((p) => p.id));
      const extra = restored
        .filter((s) => !have.has(s.id))
        .map((s) => ({ id: s.id, title: s.title, vaulted: true }));
      return extra.length ? [...prev, ...extra] : prev;
    });
  }, [vault.restoredSessions]);

  // PRIVACY: when the logged-in person changes (logout, or someone else logs in),
  // wipe everything the previous person had on screen — messages, incognito chats,
  // attached documents, open dialogs — so nothing leaks between accounts.
  useEffect(() => {
    loadSeqRef.current += 1;
    incognitoStoreRef.current = {};
    setMessages([greetingFor(user, "ready when you are. Ask me anything, or attach a document.")]);
    setActiveBoxId(null);
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
    setActiveBoxId(null);
    setBoxPanelOpen(false);
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
    const conv = await createConversation(title, activeBoxId);
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
        vault.isUnlocked
          ? "Enhanced Incognito — your vault is unlocked, so this chat is also saved, encrypted, on this device (never on any server). Lock the vault and it disappears from the screen until you unlock it again."
          : "Enhanced Incognito — this chat stays here in the app for your whole session, but it's never saved to any server. When you're done, you can delete it for good or compress it into a file you keep yourself."
      ),
    ]);
    setConversationId(sessionId);
    setIsIncognito(true);
    clearActiveDoc();
    setIncognitoSessions((prev) => [
      ...prev,
      { id: sessionId, title: `Incognito chat ${prev.length + 1}`, vaulted: vault.isUnlocked },
    ]);
    setHistoryOpen(false);
  }

  function forgetIncognitoSession(sessionId) {
    // Standard Delete (and "saved to a file") also removes it from the vault.
    const session = incognitoSessions.find((s) => s.id === sessionId);
    if (session?.vaulted) vault.deleteSession(sessionId);
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

  // Vault chats leave the screen when the vault locks or is erased.
  function clearVaultedFromScreen() {
    const active = incognitoSessions.find((s) => s.id === conversationId);
    incognitoSessions
      .filter((s) => s.vaulted)
      .forEach((s) => delete incognitoStoreRef.current[s.id]);
    setIncognitoSessions((prev) => prev.filter((s) => !s.vaulted));

    if (active?.vaulted) {
      loadSeqRef.current += 1;
      setMessages([greetingFor(user, "ready when you are. Ask me anything, or attach a document.")]);
      setConversationId(null);
      setIsIncognito(false);
      clearActiveDoc();
    }
  }

  async function handleVaultLock() {
    await vault.lock(); // flushes the last pending save, then drops the key
    clearVaultedFromScreen();
  }

  async function handleVaultErase() {
    await vault.erase(); // errors bubble up to the dialog
    clearVaultedFromScreen();
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
      setIncognitoSessions((prev) => [
        ...prev,
        { id: sessionId, title: restored.title, vaulted: vault.isUnlocked },
      ]);
      setHistoryOpen(false);
    } catch (err) {
      setEincmImportError(err.message);
    } finally {
      if (importFileRef.current) importFileRef.current.value = "";
    }
  }

  async function loadConversation(id, incognito, boxId = null) {
    setHistoryOpen(false);
       const seq = ++loadSeqRef.current;
    clearActiveDoc();
    setActiveBoxId(incognito ? null : boxId);

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
    setMessages([systemMessage("Loading this chat…", { isStatus: true })]);

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
      setMessages([systemMessage("Couldn't load this chat. Please try again.", { isStatus: true })]);
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
      const data = await withWakeDetection(sendMessage(history, text, effectiveBoxId, selectedModel));
      if (data.trial_left !== null && data.trial_left !== undefined) {
        setFrontierInfo((f) => (f ? { ...f, trial_left: data.trial_left } : f));
        if (data.trial_left <= 0) setSelectedModel("auto"); // trial used up: back to the free chain
      }
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
      if (String(err.message).includes("Backend error 402")) {
        // Frontier trial is used up: stop offering it and fall back to the free chain.
        setFrontierInfo((f) => (f ? { ...f, trial_left: 0 } : f));
        setSelectedModel("auto");
      }
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

  // After "Reset data" in Settings, clear what is on screen, so a deleted chat
  // and its box don't linger and new messages don't try to save into a chat
  // that no longer exists. (Incognito chats are local, so they are left alone.)
  useEffect(() => {
    function onDataReset() {
      setActiveBoxId(null);
      if (!isIncognito) startNewChat();
    }
    window.addEventListener("mychat4:data-reset", onDataReset);
    return () => window.removeEventListener("mychat4:data-reset", onDataReset);
  }, [isIncognito, user?.id]);

  // Attach (boxId) or detach (null) a box. If this chat already exists on the
  // server the link is saved there; otherwise it is saved when the chat is created.
  async function handleAttachBox(boxId) {
    const previous = activeBoxId;
    setActiveBoxId(boxId);
    setErrorMsg("");
    if (conversationId && !isIncognito) {
      try {
        await updateConversation(conversationId, { box_id: boxId });
      } catch (err) {
        setActiveBoxId(previous);
        setErrorMsg(`Could not update this chat's box: ${err.message}`);
      }
    }
  }

  function handleBoxDeleted(boxId) {
    if (activeBoxId === boxId) setActiveBoxId(null);
  }

  // Load the model list for the logged-in person. Free picks are remembered on this
  // device; Frontier is never remembered, so a metered model is always a deliberate choice.
  useEffect(() => {
    setModels([]);
    setFrontierInfo(null);
    setSelectedModel("auto");
    if (!user?.id) return;
    let cancelled = false;
    listModels()
      .then((d) => {
        if (cancelled) return;
        const list = d.models || [];
        setModels(list);
        setFrontierInfo(d.frontier || null);
        try {
          const saved = localStorage.getItem("mychat4_model");
          if (saved && list.some((m) => m.id === saved && m.tier !== "frontier")) setSelectedModel(saved);
        } catch {
          // storage unavailable: stay on Auto
        }
      })
      .catch((err) => console.warn("Model list unavailable (non-fatal):", err.message));
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  function handleSelectModel(id) {
    setSelectedModel(id);
    const m = models.find((x) => x.id === id);
    try {
      if (m && m.tier !== "frontier") localStorage.setItem("mychat4_model", id);
    } catch {
      // ignore
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
        {!isMobile && (
          <HistoryRail
            isIncognito={isIncognito}
            importFileRef={importFileRef}
            onOpenHistory={() => setHistoryOpen(true)}
            onNewChat={startNewChat}
            onStartIncognito={startIncognitoChat}
            onImportFile={handleImportFile}
            onOpenSettings={openSettings}
            onOpenBoxes={() => setBoxPanelOpen((o) => !o)}
          />
        )}

        <div className="main">
          {isMobile ? (
            <MobileTopBar
              user={user}
              isIncognito={isIncognito}
              onToggleIncognito={() => (isIncognito ? setEincmDialogOpen(true) : startIncognitoChat())}
              onOpenHistory={() => setHistoryOpen(true)}
              onOpenSettings={openSettings}
              boxAttached={!!effectiveBoxId}
              onDetachBox={() => handleAttachBox(null)}
              activeDoc={activeDoc}
              onClearDoc={clearActiveDoc}
              models={models}
              frontierInfo={frontierInfo}
              selectedModel={selectedModel}
              onSelectModel={handleSelectModel}
              modelDisabled={loading || searching || generating}
            />
          ) : (
            <TopBar
              isIncognito={isIncognito}
              onEndIncognito={() => setEincmDialogOpen(true)}
              boxAttached={!!effectiveBoxId}
              onDetachBox={() => handleAttachBox(null)}
              activeDoc={activeDoc}
              onClearDoc={clearActiveDoc}
            />
          )}

          <MessageList
            hero={isMobile}
            messages={messages}
            streamingMsgId={streamingMsgId}
            displayed={displayed}
            busy={loading || searching || generating}
            wakingBackend={wakingBackend}
            errorMsg={errorMsg}
            importError={eincmImportError}
            onPresetTask={handlePresetTask}
            boxId={effectiveBoxId}
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
            models={models}
            frontierInfo={frontierInfo}
            selectedModel={selectedModel}
            onSelectModel={handleSelectModel}
            activeDoc={activeDoc}
            onClearDoc={clearActiveDoc}
          />
        </div>

        <BoxPanel
          open={boxPanelOpen}
          onClose={() => setBoxPanelOpen(false)}
          activeBoxId={effectiveBoxId}
          canAttach={!isIncognito}
          onAttach={handleAttachBox}
          onBoxDeleted={handleBoxDeleted}
        />
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
        vaultStatus={vault.status}
        onVaultSetup={() => vault.openDialog("setup")}
        onVaultUnlock={() => vault.openDialog("unlock")}
        onVaultLock={handleVaultLock}
        onVaultErase={() => vault.openDialog("erase")}
        showTools={isMobile}
        onOpenBoxes={() => { setHistoryOpen(false); setBoxPanelOpen(true); }}
        importFileRef={importFileRef}
        onImportFile={handleImportFile}
      />

      {vault.dialogMode && (
        <VaultDialog
          mode={vault.dialogMode}
          onSetup={vault.setup}
          onUnlock={vault.unlock}
          onErase={handleVaultErase}
          onClose={vault.closeDialog}
        />
      )}

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