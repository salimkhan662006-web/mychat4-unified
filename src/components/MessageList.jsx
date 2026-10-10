// The scrolling conversation: picks the right card for each message type,
// shows the typing indicator, and keeps the view scrolled to the newest message.
import { useEffect, useRef } from "react";
import MessageBubble from "./MessageBubble";
import SearchCard from "./SearchCard";
import DocCard from "./DocCard";
import GenCard from "./GenCard";

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
}) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, displayed, busy]);

  return (
    <div className="messages">
      {messages.map((m) => {
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
        return (
          <MessageBubble
            key={m.id}
            message={m}
            isStreaming={streamingMsgId === m.id}
            displayed={displayed}
          />
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