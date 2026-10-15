// The scrolling conversation: picks the right card for each message type,
// shows the typing indicator, and keeps the view scrolled to the newest message.
import { Fragment, useEffect, useRef } from "react";
import MessageBubble from "./MessageBubble";
import SearchCard from "./SearchCard";
import DocCard from "./DocCard";
import GenCard from "./GenCard";
import SuggestChip from "./SuggestChip";

// The newest real AI reply (not a greeting/status line).
function lastAssistantTextId(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "assistant" && m.type === "text" && !m.isGreeting) return m.id;
  }
  return null;
}

// The user message that prompted the reply at `index`.
function userTextBefore(messages, index) {
  for (let i = index - 1; i >= 0; i--) {
    if (messages[i].role === "user" && messages[i].type === "text") return messages[i].content;
  }
  return "";
}

export default function MessageList({
  messages,
  streamingMsgId,
  displayed,
  busy,
  wakingBackend,
  errorMsg,
  importError,
  onPresetTask,
  onExpandPreview,
  onDownload,
  boxId,
}) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, displayed, busy]);

  const suggestTargetId = boxId ? lastAssistantTextId(messages) : null;

  return (
    <div className="messages">
      {messages.map((m, index) => {
        if (m.type === "doc-card") {
          return <DocCard key={m.id} message={m} onPresetTask={onPresetTask} />;
        }
        if (m.type === "search-card") {
          return <SearchCard key={m.id} message={m} />;
        }
        if (m.type === "doc-gen-card") {
          return (
            <GenCard
              key={m.id}
              message={m}
              onExpand={onExpandPreview}
              onDownload={onDownload}
            />
          );
        }

        const showSuggest = m.id === suggestTargetId && streamingMsgId !== m.id && !busy;

        return (
          <Fragment key={m.id}>
            <MessageBubble
              message={m}
              isStreaming={streamingMsgId === m.id}
              displayed={displayed}
            />
            {showSuggest && (
              <SuggestChip
                key={`sg-${m.id}`}
                boxId={boxId}
                userMessage={userTextBefore(messages, index)}
                reply={m.content}
              />
            )}
          </Fragment>
        );
      })}

      {busy && (
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
      {importError && <div className="error-box">Import failed: {importError}</div>}

      <div ref={bottomRef} />
    </div>
  );
}