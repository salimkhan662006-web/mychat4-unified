import { useState, useEffect } from "react";
import {
  listConversations,
  updateConversation,
  deleteConversation,
  createBoxedConversation,
} from "./api";

export default function HistorySidebar({
  open,
  onClose,
  activeConversationId,
  onSelectConversation,
  onNewChat,
  onStartIncognito,
  incognitoSessions,
  onBoxCreated,
}) {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [boxMode, setBoxMode] = useState(false);
  const [boxSelection, setBoxSelection] = useState([]);
  const [creatingBox, setCreatingBox] = useState(false);

  useEffect(() => {
    if (open) fetchConversations();
  }, [open]);

  async function fetchConversations() {
    setLoading(true);
    setError("");
    try {
      const data = await listConversations();
      setConversations(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleTogglePin(e, conv) {
    e.stopPropagation();
    try {
      await updateConversation(conv.id, { pinned: !conv.pinned });
      fetchConversations();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(e, conv) {
    e.stopPropagation();
    if (!window.confirm(`Delete "${conv.title}"? This can't be undone.`)) return;
    try {
      await deleteConversation(conv.id);
      fetchConversations();
      if (activeConversationId === conv.id) onNewChat();
    } catch (err) {
      setError(err.message);
    }
  }

  function toggleBoxSelection(convId) {
    setBoxSelection((prev) =>
      prev.includes(convId) ? prev.filter((id) => id !== convId) : [...prev, convId]
    );
  }

  async function handleCreateBox() {
    if (boxSelection.length < 2) {
      setError("Select at least 2 chats to combine into a box.");
      return;
    }
    setCreatingBox(true);
    setError("");
    try {
      const title = `Box: ${boxSelection.length} chats combined`;
      const result = await createBoxedConversation(title, boxSelection);
      setBoxMode(false);
      setBoxSelection([]);
      fetchConversations();
      onBoxCreated(result.conversation);
    } catch (err) {
      setError(err.message);
    } finally {
      setCreatingBox(false);
    }
  }

  if (!open) return null;

  const pinned = conversations.filter((c) => c.pinned);
  const unpinned = conversations.filter((c) => !c.pinned);

  return (
    <div className="history-sidebar-overlay" onClick={onClose}>
      <div className="history-sidebar" onClick={(e) => e.stopPropagation()}>
        <div className="hs-header">
          <div className="hs-title">Chat History</div>
          <div className="hs-close" onClick={onClose}>✕</div>
        </div>

        <div className="hs-actions">
          <div className="hs-action-btn primary" onClick={onNewChat}>
            + New chat
          </div>
          <div className="hs-action-btn ghost" onClick={onStartIncognito}>
            🕶 Incognito
          </div>
        </div>

        <div className="hs-box-toggle">
          <div
            className={`hs-action-btn ${boxMode ? "active" : "ghost"}`}
            onClick={() => { setBoxMode(!boxMode); setBoxSelection([]); }}
          >
            📦 {boxMode ? "Cancel box selection" : "Combine chats into a box"}
          </div>
          {boxMode && boxSelection.length >= 2 && (
            <div className="hs-action-btn primary small" onClick={handleCreateBox}>
              {creatingBox ? "Creating…" : `Create box (${boxSelection.length})`}
            </div>
          )}
        </div>

        {error && <div className="hs-error">{error}</div>}

        <div className="hs-list">
          {incognitoSessions.length > 0 && (
            <>
              <div className="hs-section-label">Incognito (this session only)</div>
              {incognitoSessions.map((s) => (
                <div
                  key={s.id}
                  className={`hs-item incognito ${activeConversationId === s.id ? "active" : ""}`}
                  onClick={() => onSelectConversation(s.id, true)}
                >
                  <span className="hs-item-icon">🕶</span>
                  <span className="hs-item-title">{s.title}</span>
                  <span className="hs-item-badge">Incognito</span>
                </div>
              ))}
            </>
          )}

          {loading && <div className="hs-loading">Loading chats…</div>}

          {!loading && pinned.length > 0 && (
            <>
              <div className="hs-section-label">Pinned</div>
              {pinned.map((c) => (
                <ConversationRow
                  key={c.id}
                  conv={c}
                  active={activeConversationId === c.id}
                  boxMode={boxMode}
                  selected={boxSelection.includes(c.id)}
                  onSelect={() => (boxMode ? toggleBoxSelection(c.id) : onSelectConversation(c.id, false))}
                  onTogglePin={(e) => handleTogglePin(e, c)}
                  onDelete={(e) => handleDelete(e, c)}
                />
              ))}
            </>
          )}

          {!loading && unpinned.length > 0 && (
            <>
              <div className="hs-section-label">Recent</div>
              {unpinned.map((c) => (
                <ConversationRow
                  key={c.id}
                  conv={c}
                  active={activeConversationId === c.id}
                  boxMode={boxMode}
                  selected={boxSelection.includes(c.id)}
                  onSelect={() => (boxMode ? toggleBoxSelection(c.id) : onSelectConversation(c.id, false))}
                  onTogglePin={(e) => handleTogglePin(e, c)}
                  onDelete={(e) => handleDelete(e, c)}
                />
              ))}
            </>
          )}

          {!loading && conversations.length === 0 && incognitoSessions.length === 0 && (
            <div className="hs-empty">No chats yet — start one to see it here.</div>
          )}
        </div>
      </div>

      <style>{`
        .history-sidebar-overlay {
          position: fixed; inset: 0; z-index: 90;
          background: rgba(0,0,0,0.5);
          backdrop-filter: blur(3px);
        }

        .history-sidebar {
          position: absolute; top: 0; left: 0; height: 100%; width: 340px;
          background: #0a0505; border-right: 1px solid rgba(255,46,46,0.2);
          display: flex; flex-direction: column;
          box-shadow: 30px 0 60px rgba(0,0,0,0.5);
        }

        .hs-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 18px 20px; border-bottom: 1px solid rgba(255,46,46,0.1);
        }

        .hs-title {
          font-family: 'Space Grotesk', sans-serif; font-weight: 600;
          font-size: 15px; color: #F2E8E5;
        }

        .hs-close {
          width: 26px; height: 26px; border-radius: 8px;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: #8A7570; font-size: 12px;
          border: 1px solid rgba(255,46,46,0.15);
        }

        .hs-close:hover { background: rgba(255,46,46,0.1); color: #FF9E9E; }

        .hs-actions { display: flex; gap: 8px; padding: 14px 20px; }

        .hs-box-toggle {
          display: flex; flex-direction: column; gap: 8px;
          padding: 0 20px 14px;
        }

        .hs-action-btn {
          padding: 9px 14px; border-radius: 10px; font-size: 12.5px;
          font-weight: 500; cursor: pointer; text-align: center;
          transition: all 0.2s; flex: 1;
        }

        .hs-action-btn.small { flex: none; }

        .hs-action-btn.primary {
          background: linear-gradient(135deg, #FF2E2E, #8B1A1A);
          color: #0a0202; box-shadow: 0 0 14px rgba(255,46,46,0.35);
        }

        .hs-action-btn.ghost {
          background: rgba(255,255,255,0.03); border: 1px solid rgba(255,46,46,0.2);
          color: #C9938D;
        }

        .hs-action-btn.ghost:hover { background: rgba(255,46,46,0.08); }

        .hs-action-btn.active {
          background: rgba(255,46,46,0.2); border: 1px solid #FF2E2E; color: #FFB3B0;
        }

        .hs-error {
          margin: 0 20px 12px; padding: 10px 14px; font-size: 11.5px;
          background: rgba(255,46,46,0.1); border: 1px solid rgba(255,46,46,0.3);
          border-radius: 8px; color: #FF9E9E;
        }

        .hs-list { flex: 1; overflow-y: auto; padding: 0 12px 20px; }
        .hs-list::-webkit-scrollbar { width: 4px; }
        .hs-list::-webkit-scrollbar-thumb { background: rgba(255,46,46,0.2); border-radius: 4px; }

        .hs-section-label {
          font-size: 10.5px; font-weight: 600; color: #6B5551;
          text-transform: uppercase; letter-spacing: 0.08em;
          padding: 12px 10px 6px;
        }

        .hs-loading, .hs-empty {
          color: #6B5551; font-size: 12.5px; text-align: center; padding: 30px 20px;
        }

        .hs-item {
          display: flex; align-items: center; gap: 10px;
          padding: 10px 12px; border-radius: 10px; cursor: pointer;
          margin-bottom: 2px; transition: all 0.15s; position: relative;
        }

        .hs-item:hover { background: rgba(255,46,46,0.06); }
        .hs-item.active { background: rgba(255,46,46,0.14); }

        .hs-item.incognito { background: rgba(139, 26, 26, 0.08); }
        .hs-item.incognito.active { background: rgba(139, 26, 26, 0.18); }

        .hs-item-icon { font-size: 13px; flex-shrink: 0; }

        .hs-item-title {
          flex: 1; font-size: 12.5px; color: #D8C4C0;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }

        .hs-item-badge {
          font-size: 9px; padding: 2px 6px; border-radius: 6px;
          background: rgba(255,46,46,0.15); color: #E0A8A3; flex-shrink: 0;
        }

        .hs-item-actions {
          display: flex; gap: 4px; opacity: 0; transition: opacity 0.15s; flex-shrink: 0;
        }

        .hs-item:hover .hs-item-actions { opacity: 1; }

        .hs-item-action {
          width: 22px; height: 22px; border-radius: 6px;
          display: flex; align-items: center; justify-content: center;
          font-size: 11px; cursor: pointer; color: #8A7570;
        }

        .hs-item-action:hover { background: rgba(255,46,46,0.15); color: #FF9E9E; }
        .hs-item-action.pinned { color: #FFB3B0; }

        .hs-item-checkbox {
          width: 16px; height: 16px; border-radius: 4px;
          border: 1px solid rgba(255,46,46,0.4); flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          font-size: 10px;
        }

        .hs-item-checkbox.checked {
          background: #FF2E2E; border-color: #FF2E2E; color: #0a0202;
        }
      `}</style>
    </div>
  );
}

function ConversationRow({ conv, active, boxMode, selected, onSelect, onTogglePin, onDelete }) {
  return (
    <div className={`hs-item ${active ? "active" : ""}`} onClick={onSelect}>
      {boxMode && (
        <div className={`hs-item-checkbox ${selected ? "checked" : ""}`}>
          {selected ? "✓" : ""}
        </div>
      )}
      <span className="hs-item-icon">{conv.pinned ? "📌" : "💬"}</span>
      <span className="hs-item-title">{conv.title}</span>
      {!boxMode && (
        <div className="hs-item-actions">
          <div
            className={`hs-item-action ${conv.pinned ? "pinned" : ""}`}
            onClick={onTogglePin}
            title={conv.pinned ? "Unpin" : "Pin"}
          >
            📌
          </div>
          <div className="hs-item-action" onClick={onDelete} title="Delete">
            🗑
          </div>
        </div>
      )}
    </div>
  );
}