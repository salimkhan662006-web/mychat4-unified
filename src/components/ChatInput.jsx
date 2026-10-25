import { useState, useEffect, useRef } from "react";
import { Paperclip, Presentation, Table, Search, ArrowUp, Plus, X, Check } from "lucide-react";
import ModelPicker from "./ModelPicker";
import Icon from "./Icon";
import { useIsMobile } from "../useIsMobile";

// Bottom input zone. Desktop: attach / generate / search buttons in the bar.
// Phone: one "+" Tools button that opens a vertical menu.

export default function ChatInput({
  input, onInputChange, onKeyDown, onSend, onGenerate, onToggleSearch, searchMode,
  loading, generating, searching, uploading, fileInputRef, onFileChange,
  activeDoc, onClearDoc, models, frontierInfo, selectedModel, onSelectModel,
}) {
  const isMobile = useIsMobile();
  const [toolsOpen, setToolsOpen] = useState(false);
  const toolsRef = useRef(null);

  useEffect(() => {
    if (!toolsOpen) return;
    function onOutside(e) {
      if (toolsRef.current && !toolsRef.current.contains(e.target)) setToolsOpen(false);
    }
    document.addEventListener("pointerdown", onOutside);
    return () => document.removeEventListener("pointerdown", onOutside);
  }, [toolsOpen]);

  const canGenerate = !!input.trim() && !generating;
  const placeholder = searching
    ? "Searching the web…"
    : searchMode
    ? "Search the web…"
    : generating
    ? "Planning your document…"
    : "Message IsahiriAI…";

  const textarea = (
    <textarea
      className="chat-input"
      placeholder={placeholder}
      rows={1}
      value={input}
      onChange={(e) => onInputChange(e.target.value)}
      onKeyDown={onKeyDown}
      disabled={loading || generating || searching}
    />
  );

  const sendBtn = (
    <div className="send-btn" style={{ opacity: !input.trim() || loading ? 0.4 : 1 }} onClick={onSend}>
      <Icon icon={ArrowUp} stroke={2} />
    </div>
  );

  return (
    <div className="input-zone">
      {activeDoc && (
        <div className="attach-indicator">
          <span className="attach-indicator-icon"><Icon icon={Paperclip} size={14} /></span>
          <span className="attach-indicator-text">
            Attached: <strong>{activeDoc.fileName}</strong> — your next message can reference it
          </span>
          <span className="attach-indicator-clear" onClick={onClearDoc}>Remove</span>
        </div>
      )}

      {!isMobile && (
        <ModelPicker
          models={models}
          frontierInfo={frontierInfo}
          value={selectedModel}
          onChange={onSelectModel}
          disabled={loading || generating || searching}
        />
      )}

      {isMobile ? (
        <div className="input-shell">
          <div className="tools-wrap" ref={toolsRef}>
            <div
              className={`attach-btn ${toolsOpen || searchMode ? "active-mode" : ""}`}
              title="Tools"
              onClick={() => setToolsOpen((o) => !o)}
            >
              {uploading ? "…" : <Icon icon={toolsOpen ? X : Plus} />}
            </div>
            {toolsOpen && (
              <div className="tools-menu">
                <div
                  className="tools-item"
                  onClick={() => { setToolsOpen(false); fileInputRef.current?.click(); }}
                >
                  <Icon icon={Paperclip} size={16} />Attach a document
                </div>
                <div
                  className={`tools-item ${canGenerate ? "" : "dim"}`}
                  onClick={() => { setToolsOpen(false); onGenerate("pptx"); }}
                >
                  <Icon icon={Presentation} size={16} />Create a presentation
                </div>
                <div
                  className={`tools-item ${canGenerate ? "" : "dim"}`}
                  onClick={() => { setToolsOpen(false); onGenerate("xlsx"); }}
                >
                  <Icon icon={Table} size={16} />Create a spreadsheet
                </div>
                <div
                  className={`tools-item ${searchMode ? "on" : ""}`}
                  onClick={() => { setToolsOpen(false); onToggleSearch(); }}
                >
                  <Icon icon={Search} size={16} />Search the web
                  {searchMode && <Icon icon={Check} size={14} className="tools-check" />}
                </div>
                <div className="tools-hint">Presentation and spreadsheet use the text you typed as the request.</div>
              </div>
            )}
          </div>
          <input ref={fileInputRef} type="file" onChange={onFileChange} style={{ display: "none" }} disabled={uploading} />
          {textarea}
          {sendBtn}
        </div>
      ) : (
        <div className="input-shell">
          <label className="attach-btn" title="Attach a document">
            {uploading ? "…" : <Icon icon={Paperclip} />}
            <input ref={fileInputRef} type="file" onChange={onFileChange} style={{ display: "none" }} disabled={uploading} />
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
          {textarea}
          {sendBtn}
        </div>
      )}
    </div>
  );
}