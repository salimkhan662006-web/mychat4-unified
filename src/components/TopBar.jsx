// Brand mark on the left; incognito badge, attached-box pill and
// attached-document pill on the right.

export default function TopBar({
  isIncognito,
  onEndIncognito,
  boxAttached,
  onDetachBox,
  activeDoc,
  onClearDoc,
}) {
  return (
    <div className="top-bar">
      <div className="brand">
        <div className="brand-mark">
          Isahiri<span>AI</span>
        </div>
      </div>
      <div className="top-bar-right">
        {isIncognito && (
          <div className="incognito-badge">
            🕶 Enhanced Incognito — not saved
            <span className="incognito-end-btn" onClick={onEndIncognito}>
              End session
            </span>
          </div>
        )}
        {boxAttached && (
          <div className="active-doc-pill" title="This chat uses a box">
            📦 Box attached
            <span className="pill-clear" onClick={onDetachBox}>
              ✕
            </span>
          </div>
        )}
        {activeDoc && (
          <div className="active-doc-pill">
            📄 {activeDoc.fileName}
            <span className="pill-clear" onClick={onClearDoc}>
              ✕
            </span>
          </div>
        )}
      </div>
    </div>
  );
}