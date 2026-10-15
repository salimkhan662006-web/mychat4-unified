// "💡 Suggest note" chip under the latest reply of a box-attached chat.
// Tapping it asks the backend for 0-3 short notes. Nothing is saved until
// the person taps Save on a suggestion. Suggestions live only in this
// component's memory.
import { useState } from "react";
import { suggestBoxNotes, addBoxNote } from "../api";

const MAX_NOTE = 500;

export default function SuggestChip({ boxId, userMessage, reply }) {
  const [status, setStatus] = useState("idle"); // idle | loading | ready | done
  const [items, setItems] = useState([]); // { id, text, editing, draft, busy }
  const [skipped, setSkipped] = useState(0);
  const [savedCount, setSavedCount] = useState(0);
  const [error, setError] = useState("");

  async function handleSuggest() {
    setStatus("loading");
    setError("");
    try {
      const data = await suggestBoxNotes(boxId, userMessage.slice(0, 4000), reply.slice(0, 6000));
      const list = (data.suggestions || []).map((text, i) => ({
        id: i,
        text,
        editing: false,
        draft: text,
        busy: false,
      }));
      setItems(list);
      setSkipped(data.skipped || 0);
      setStatus(list.length ? "ready" : "done");
    } catch (err) {
      setError(err.message);
      setStatus("idle");
    }
  }

  function patchItem(id, patch) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function removeItem(id) {
    const next = items.filter((it) => it.id !== id);
    setItems(next);
    if (next.length === 0) setStatus("done");
  }

  async function handleSave(item) {
    const text = (item.editing ? item.draft : item.text).trim();
    if (!text || item.busy) return;
    patchItem(item.id, { busy: true });
    setError("");
    try {
      await addBoxNote(boxId, text, "ai");
      setSavedCount((c) => c + 1);
      removeItem(item.id);
    } catch (err) {
      setError(err.message);
      patchItem(item.id, { busy: false });
    }
  }

  return (
    <div className="sg-wrap">
      {status === "idle" && (
        <span className="chip" onClick={handleSuggest} title="Ask the AI what is worth saving to this box">
          💡 Suggest note
        </span>
      )}

      {status === "loading" && <span className="sg-muted">Looking for something worth saving…</span>}

      {error && <div className="sg-error">{error}</div>}

      {status === "ready" && (
        <div className="sg-card">
          <div className="sg-label">Save to this box?</div>
          {items.map((it) => (
            <div key={it.id} className="sg-item">
              {it.editing ? (
                <textarea
                  className="bx-textarea"
                  rows={2}
                  maxLength={MAX_NOTE}
                  value={it.draft}
                  onChange={(e) => patchItem(it.id, { draft: e.target.value })}
                />
              ) : (
                <div className="sg-text">{it.text}</div>
              )}
              <div className="sg-actions">
                <button className="bx-btn primary small" disabled={it.busy} onClick={() => handleSave(it)}>
                  {it.busy ? "…" : "Save"}
                </button>
                {!it.editing && (
                  <button
                    className="bx-btn ghost small"
                    disabled={it.busy}
                    onClick={() => patchItem(it.id, { editing: true, draft: it.text })}
                  >
                    Edit
                  </button>
                )}
                <button className="bx-btn ghost small" disabled={it.busy} onClick={() => removeItem(it.id)}>
                  Dismiss
                </button>
              </div>
            </div>
          ))}
          {skipped > 0 && (
            <div className="sg-muted">
              {skipped} suggestion{skipped === 1 ? " was" : "s were"} skipped because it looked sensitive.
            </div>
          )}
        </div>
      )}

      {status === "done" && (
        <div className="sg-muted">
          {savedCount > 0
            ? `✓ Saved ${savedCount} note${savedCount === 1 ? "" : "s"} to this box.`
            : skipped > 0
            ? "Nothing safe to save from this reply."
            : "Nothing worth saving from this reply."}
        </div>
      )}
    </div>
  );
}