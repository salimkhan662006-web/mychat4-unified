// Bottom input zone: attachment indicator, attach / generate / search buttons,
// the text box, and the send button.

export default function ChatInput({
  input,
  onInputChange,
  onKeyDown,
  onSend,
  onGenerate,
  onToggleSearch,
  searchMode,
  loading,
  generating,
  searching,
  uploading,
  fileInputRef,
  onFileChange,
  activeDoc,
  onClearDoc,
}) {
  return (
    <div className="input-zone">
      {activeDoc && (
        <div className="attach-indicator">
          <span className="attach-indicator-icon">📎</span>
          <span className="attach-indicator-text">
            Attached: <strong>{activeDoc.fileName}</strong> — your next message can reference it
          </span>
          <span className="attach-indicator-clear" onClick={onClearDoc}>
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
            onChange={onFileChange}
            style={{ display: "none" }}
            disabled={uploading}
          />
        </label>
        <div
          className="attach-btn"
          title="Create a PowerPoint from your message"
          onClick={() => onGenerate("pptx")}
          style={{ opacity: !input.trim() || generating ? 0.4 : 1 }}
        >
          🎯
        </div>
        <div
          className="attach-btn"
          title="Create an Excel spreadsheet from your message"
          onClick={() => onGenerate("xlsx")}
          style={{ opacity: !input.trim() || generating ? 0.4 : 1 }}
        >
          📊
        </div>
        <div
          className={`attach-btn ${searchMode ? "active-mode" : ""}`}
          title={searchMode ? "Web search mode ON — click to turn off" : "Search the web for current info"}
          onClick={onToggleSearch}
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
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={loading || generating || searching}
        />
        <div
          className="send-btn"
          style={{ opacity: !input.trim() || loading ? 0.4 : 1 }}
          onClick={onSend}
        >
          ↑
        </div>
      </div>
    </div>
  );
}