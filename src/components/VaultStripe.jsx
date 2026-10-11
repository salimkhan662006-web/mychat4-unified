// Small strip for the top of the Incognito section in the history sidebar.
// status: "checking" | "unsupported" | "none" | "locked" | "unlocked"

export default function VaultStrip({ status, onSetup, onUnlock, onLock, onErase }) {
  if (status === "checking") return null;

  if (status === "unsupported") {
    return (
      <div className="vs-strip">
        <span className="vs-text">🔐 Vault unavailable in this browser. Incognito stays memory-only.</span>
      </div>
    );
  }

  return (
    <div className="vs-strip">
      {status === "none" && (
        <>
          <span className="vs-text">🔐 Keep incognito chats across sessions, encrypted on this device.</span>
          <span className="vs-btn primary" onClick={onSetup}>Set up</span>
        </>
      )}

      {status === "locked" && (
        <>
          <span className="vs-text">🔒 Vault locked. Incognito chats are memory-only.</span>
          <span className="vs-btn primary" onClick={onUnlock}>Unlock</span>
          <span className="vs-btn" onClick={onErase}>Erase</span>
        </>
      )}

      {status === "unlocked" && (
        <>
          <span className="vs-text">🔓 Vault unlocked. Incognito chats auto-save, encrypted.</span>
          <span className="vs-btn" onClick={onLock}>Lock</span>
          <span className="vs-btn" onClick={onErase}>Erase</span>
        </>
      )}

      <style>{`
        .vs-strip {
          display: flex; align-items: center; flex-wrap: wrap; gap: 6px;
          margin: 4px 0 8px; padding: 9px 10px; border-radius: 10px;
          background: rgba(139,26,26,0.1); border: 1px solid rgba(255,46,46,0.18);
        }
        .vs-text { flex: 1 1 100%; font-size: 11px; color: #C9938D; line-height: 1.4; }
        .vs-btn {
          font-size: 11px; padding: 4px 10px; border-radius: 8px; cursor: pointer;
          color: #E0A8A3; border: 1px solid rgba(255,46,46,0.25);
          background: rgba(255,255,255,0.03);
        }
        .vs-btn:hover { background: rgba(255,46,46,0.12); }
        .vs-btn.primary {
          background: linear-gradient(135deg, #FF2E2E, #8B1A1A); color: #0a0202;
          border: none; font-weight: 600;
        }
      `}</style>
    </div>
  );
}