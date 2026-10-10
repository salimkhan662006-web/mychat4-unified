// Enhanced Incognito Mode — "end session" dialog: save to a file, or delete for good.

export default function EincmDialog({ onSave, onDelete, onCancel }) {
  return (
    <div className="eincm-overlay" onClick={onCancel}>
      <div className="eincm-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="eincm-title">End this incognito session</div>
        <div className="eincm-desc">
          This chat was never saved anywhere. Choose what happens to it now.
        </div>

        <div className="eincm-option" onClick={onSave}>
          <div className="eincm-option-icon">📦</div>
          <div>
            <div className="eincm-option-title">Compressed Save</div>
            <div className="eincm-option-desc">
              Download this chat as a file you keep — readable as text, and you
              can drag it back into MyChat4 later to pick up right where you left off.
            </div>
          </div>
        </div>

        <div className="eincm-option danger" onClick={onDelete}>
          <div className="eincm-option-icon">🗑</div>
          <div>
            <div className="eincm-option-title">Standard Delete</div>
            <div className="eincm-option-desc">
              Gone for good, right now. Nothing is kept anywhere.
            </div>
          </div>
        </div>

        <div className="eincm-cancel" onClick={onCancel}>
          Keep chatting instead
        </div>
      </div>
    </div>
  );
}