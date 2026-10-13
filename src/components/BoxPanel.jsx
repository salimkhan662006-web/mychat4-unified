// Box panel (right-hand drawer): list your boxes; inside one, edit its
// Instructions and manage its Notes; attach it to the current chat.
import { useState, useEffect } from "react";
import {
  listBoxes,
  createBox,
  getBox,
  updateBox,
  deleteBox,
  addBoxNote,
  updateBoxNote,
  deleteBoxNote,
} from "../api";

const MAX_BOXES = 10;
const MAX_INSTRUCTIONS = 2000;
const MAX_NOTE = 500;
const MAX_NOTES = 50;

export default function BoxPanel({ open, onClose, activeBoxId, canAttach, onAttach, onBoxDeleted }) {
  const [boxes, setBoxes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [openBoxId, setOpenBoxId] = useState(null);
  const [detail, setDetail] = useState(null); // { box, notes }
  const [detailLoading, setDetailLoading] = useState(false);

  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);

  const [titleDraft, setTitleDraft] = useState("");
  const [instrDraft, setInstrDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const [noteDraft, setNoteDraft] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editingText, setEditingText] = useState("");

  useEffect(() => {
    if (open) {
      refreshList();
    } else {
      setOpenBoxId(null);
      setDetail(null);
      setError("");
    }
  }, [open]);

  async function refreshList() {
    setLoading(true);
    setError("");
    try {
      setBoxes(await listBoxes());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function openBox(id) {
    setOpenBoxId(id);
    setDetail(null);
    setError("");
    setDetailLoading(true);
    try {
      const data = await getBox(id);
      setDetail(data);
      setTitleDraft(data.box.title);
      setInstrDraft(data.box.instructions || "");
      setNoteDraft("");
      setEditingNoteId(null);
    } catch (err) {
      setError(err.message);
      setOpenBoxId(null);
    } finally {
      setDetailLoading(false);
    }
  }

  function backToList() {
    setOpenBoxId(null);
    setDetail(null);
    setError("");
    refreshList();
  }

  async function handleCreate() {
    if (creating) return;
    setCreating(true);
    setError("");
    try {
      const box = await createBox(newTitle.trim() || "New box", "");
      setNewTitle("");
      await openBox(box.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleSaveBox() {
    if (!detail || saving) return;
    setSaving(true);
    setError("");
    try {
      const box = await updateBox(detail.box.id, {
        title: titleDraft.trim() || detail.box.title,
        instructions: instrDraft,
      });
      setDetail((d) => ({ ...d, box }));
      setTitleDraft(box.title);
      setInstrDraft(box.instructions || "");
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteBox() {
    if (!detail) return;
    if (!window.confirm(`Delete box "${detail.box.title}" and all its notes? This can't be undone.`)) return;
    try {
      await deleteBox(detail.box.id);
      onBoxDeleted(detail.box.id);
      backToList();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleAddNote() {
    const content = noteDraft.trim();
    if (!content || noteBusy || !detail) return;
    setNoteBusy(true);
    setError("");
    try {
      const note = await addBoxNote(detail.box.id, content);
      setDetail((d) => ({ ...d, notes: [...d.notes, note] }));
      setNoteDraft("");
    } catch (err) {
      setError(err.message);
    } finally {
      setNoteBusy(false);
    }
  }

  async function handleSaveNote(noteId) {
    const content = editingText.trim();
    if (!content || noteBusy || !detail) return;
    setNoteBusy(true);
    setError("");
    try {
      const note = await updateBoxNote(detail.box.id, noteId, content);
      setDetail((d) => ({ ...d, notes: d.notes.map((n) => (n.id === noteId ? note : n)) }));
      setEditingNoteId(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setNoteBusy(false);
    }
  }

  async function handleDeleteNote(noteId) {
    if (!detail) return;
    setError("");
    try {
      await deleteBoxNote(detail.box.id, noteId);
      setDetail((d) => ({ ...d, notes: d.notes.filter((n) => n.id !== noteId) }));
    } catch (err) {
      setError(err.message);
    }
  }

  if (!open) return null;

  const dirty =
    detail &&
    (titleDraft.trim() !== detail.box.title || instrDraft.trim() !== (detail.box.instructions || ""));
  const isAttached = detail && activeBoxId === detail.box.id;

  return (
    <div className="bx-overlay" onClick={onClose}>
      <div className="bx-panel" onClick={(e) => e.stopPropagation()}>
        <div className="bx-header">
          {openBoxId && <div className="bx-icon-btn" onClick={backToList} title="All boxes">←</div>}
          <div className="bx-title">{openBoxId ? detail?.box.title || "Box" : "Boxes"}</div>
          <div className="bx-icon-btn" onClick={onClose}>✕</div>
        </div>

        {error && <div className="bx-error">{error}</div>}

        <div className="bx-body">
          {!openBoxId && (
            <>
              <div className="bx-intro">
                A box is a project space: standing instructions plus short notes. Attach one to a chat and the AI
                uses it. Incognito chats never use a box.
              </div>

              <div className="bx-create-row">
                <input
                  className="bx-input"
                  placeholder="New box name"
                  value={newTitle}
                  maxLength={100}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                />
                <button
                  className="bx-btn primary"
                  disabled={creating || boxes.length >= MAX_BOXES}
                  onClick={handleCreate}
                >
                  {creating ? "…" : "+ Create"}
                </button>
              </div>
              <div className="bx-counter">{boxes.length} / {MAX_BOXES} boxes</div>

              {loading && <div className="bx-muted">Loading boxes…</div>}
              {!loading && boxes.length === 0 && (
                <div className="bx-muted">No boxes yet. Create one above.</div>
              )}

              {boxes.map((b) => (
                <div key={b.id} className="bx-row" onClick={() => openBox(b.id)}>
                  <span className="bx-row-icon">📦</span>
                  <div className="bx-row-text">
                    <div className="bx-row-title">{b.title}</div>
                    <div className="bx-row-meta">
                      {b.has_instructions ? "Instructions set" : "No instructions"} · {b.note_count} note
                      {b.note_count === 1 ? "" : "s"}
                    </div>
                  </div>
                  {activeBoxId === b.id && <span className="bx-badge">Attached</span>}
                </div>
              ))}
            </>
          )}

          {openBoxId && detailLoading && <div className="bx-muted">Loading box…</div>}

          {openBoxId && detail && (
            <>
              <div className="bx-attach-row">
                {canAttach ? (
                  isAttached ? (
                    <button className="bx-btn ghost" onClick={() => onAttach(null)}>
                      ✓ Attached to this chat — detach
                    </button>
                  ) : (
                    <button className="bx-btn primary" onClick={() => onAttach(detail.box.id)}>
                      Use in this chat
                    </button>
                  )
                ) : (
                  <div className="bx-muted">Incognito chats can't use a box.</div>
                )}
              </div>

              <div className="bx-section-label">Name</div>
              <input
                className="bx-input"
                value={titleDraft}
                maxLength={100}
                onChange={(e) => setTitleDraft(e.target.value)}
              />

              <div className="bx-section-label">
                Instructions <span className="bx-counter-inline">{instrDraft.length} / {MAX_INSTRUCTIONS}</span>
              </div>
              <div className="bx-hint">How the AI should behave in chats that use this box.</div>
              <textarea
                className="bx-textarea"
                rows={6}
                maxLength={MAX_INSTRUCTIONS}
                placeholder='e.g. "Answer in two sentences. Use simple English."'
                value={instrDraft}
                onChange={(e) => setInstrDraft(e.target.value)}
              />
              <div className="bx-save-row">
                <button className="bx-btn primary" disabled={!dirty || saving} onClick={handleSaveBox}>
                  {saving ? "Saving…" : "Save"}
                </button>
                {savedFlash && <span className="bx-saved">✓ Saved</span>}
              </div>

              <div className="bx-section-label">
                Notes <span className="bx-counter-inline">{detail.notes.length} / {MAX_NOTES}</span>
              </div>
              <div className="bx-hint">Short facts the AI should know. No passwords, keys, or personal numbers.</div>

              {detail.notes.length === 0 && <div className="bx-muted">No notes yet.</div>}

              {detail.notes.map((n) => (
                <div key={n.id} className="bx-note">
                  {editingNoteId === n.id ? (
                    <>
                      <textarea
                        className="bx-textarea"
                        rows={3}
                        maxLength={MAX_NOTE}
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                      />
                      <div className="bx-save-row">
                        <button className="bx-btn primary small" disabled={noteBusy} onClick={() => handleSaveNote(n.id)}>
                          Save
                        </button>
                        <button className="bx-btn ghost small" onClick={() => setEditingNoteId(null)}>
                          Cancel
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="bx-note-text">{n.content}</div>
                      <div className="bx-note-actions">
                        {n.source === "ai" && <span className="bx-badge">AI</span>}
                        <span
                          className="bx-link"
                          onClick={() => { setEditingNoteId(n.id); setEditingText(n.content); }}
                        >
                          Edit
                        </span>
                        <span className="bx-link danger" onClick={() => handleDeleteNote(n.id)}>
                          Delete
                        </span>
                      </div>
                    </>
                  )}
                </div>
              ))}

              <textarea
                className="bx-textarea"
                rows={3}
                maxLength={MAX_NOTE}
                placeholder="Add a note…"
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
              />
              <div className="bx-save-row">
                <button
                  className="bx-btn primary"
                  disabled={!noteDraft.trim() || noteBusy || detail.notes.length >= MAX_NOTES}
                  onClick={handleAddNote}
                >
                  {noteBusy ? "…" : "+ Add note"}
                </button>
                <span className="bx-counter-inline">{noteDraft.length} / {MAX_NOTE}</span>
              </div>

              <div className="bx-danger-zone">
                <button className="bx-btn danger" onClick={handleDeleteBox}>Delete this box</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}