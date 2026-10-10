// The semi-circular rail on the left: history, new chat, incognito, import,
// and the usage / account / settings shortcuts.

export default function HistoryRail({
  isIncognito,
  importFileRef,
  onOpenHistory,
  onNewChat,
  onStartIncognito,
  onImportFile,
  onOpenSettings,
}) {
  return (
    <div className="history-rail">
      <div className="history-curve"></div>
      <div className="history-logo" onClick={onOpenHistory} title="Chat history">M4</div>
      <div className="history-items">
        <div
          className={`history-dot ${!isIncognito ? "active" : ""}`}
          title="Chat history"
          onClick={onOpenHistory}
        >
          💬
        </div>
        <div className="history-dot" title="New chat" onClick={onNewChat}>➕</div>
        <div
          className={`history-dot ${isIncognito ? "active incognito" : ""}`}
          title="Incognito chat"
          onClick={onStartIncognito}
        >
          🕶
        </div>
        <label className="history-dot" title="Import a saved .mchat file">
          📥
          <input
            ref={importFileRef}
            type="file"
            accept=".mchat,.txt"
            onChange={onImportFile}
            style={{ display: "none" }}
          />
        </label>
      </div>
      <div className="history-rail-bottom">
        <div className="history-dot" title="Rate limits" onClick={() => onOpenSettings("limits")}>
          ⏱️
        </div>
        <div className="history-dot" title="Usage" onClick={() => onOpenSettings("usage")}>
          📊
        </div>
        <div className="history-dot" title="Account" onClick={() => onOpenSettings("account")}>
          👤
        </div>
        <div className="history-dot" title="Settings" onClick={() => onOpenSettings("appearance")}>
          ⚙️
        </div>
      </div>
    </div>
  );
}