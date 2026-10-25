import { Paperclip, Presentation, Table, Search, ArrowUp } from "lucide-react";
import Icon from "./Icon";
import ModelPicker from "./ModelPicker";

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
  models,
  frontierInfo,
  selectedModel,
  onSelectModel,
}) {
  return (
    <div className="input-zone">
      {activeDoc && (
        <div className="attach-indicator">
          <span className="attach-indicator-icon"><Icon icon={Paperclip} size={14} /></span>
          <span className="attach-indicator-text">
            Attached: <strong>{activeDoc.fileName}</strong> — your next message can reference it
          </span>
          <span className="attach-indicator-clear" onClick={onClearDoc}>
            Remove
          </span>
        </div>
      )}
      <ModelPicker
        models={models}
        frontierInfo={frontierInfo}
        value={selectedModel}
        onChange={onSelectModel}
        disabled={loading || generating || searching}
      />
      <div className="input-shell">
        <label className="attach-btn" title="Attach a document">
          {uploading ? "…" : <Icon icon={Paperclip} />}
          <input
            ref={fileInputRef}
            type="file"
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
          <Icon icon={Presentation} />
        </div>
        <div
          className="attach-btn"
          title="Create an Excel spreadsheet from your message"
          onClick={() => onGenerate("xlsx")}
          style={{ opacity: !input.trim() || generating ? 0.4 : 1 }}
        >
          <Icon icon={Table} />
        </div>
        <div
          className={`attach-btn ${searchMode ? "active-mode" : ""}`}
          title={searchMode ? "Web search mode ON — click to turn off" : "Search the web for current info"}
          onClick={onToggleSearch}
        >
          <Icon icon={Search} />
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
              : "Message IsahiriAI…"
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
          <Icon icon={ArrowUp} stroke={2} />
        </div>
      </div>
    </div>
  );
}