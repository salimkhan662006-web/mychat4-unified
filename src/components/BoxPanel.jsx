// Workforce page: takes over the main area. List your workforces; inside one, edit its
// Instructions, Notes, Files and Lines, or start a new chat that uses it.
// (File and component names keep "Box" on purpose: only the words people see say Workforce.)
import { useState, useEffect } from "react";
import { ArrowLeft, X, Package, Check } from "lucide-react";
import BoxFiles from "./BoxFiles";
import BoxLines from "./BoxLines";
import Icon from "./Icon";
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

export default function BoxPanel({ open, onClose, activeBoxId, onUse, onBoxDeleted }) {
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
  const [filesVersion, setFilesVersion] = useState(0); // bumps when a file is added or removed

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
      const box = await createBox(newTitle.trim() || "New workforce", "");
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
    if (!window.confirm(`Delete workforce "${detail.box.title}" and all its notes, files and lines? This can't be undone.`)) return;
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

  return (
    <section className="wf-page" aria-label="Workforce">
      <div className="bx-header">
        {openBoxId && (
          <div className="bx-icon-btn" onClick={backToList} title="All workforces">
            <Icon icon={ArrowLeft} size={14} />
          </div>
        )}
        <div className="bx-title">{openBoxId ? detail?.box.title || "Workforce" : "Workforces"}</div>
        <button className="bx-btn ghost small" onClick={onClose} title="Close and return to a new chat">
          <Icon icon={X} size={13} className="ico-inline" />Close
        </button>
      </div>

      {error && <div className="bx-error">{error}</div>}

      <div className="bx-body">
        <div className="wf-inner">
          {!openBoxId && (
            <>
              <div className="bx-intro">
                A workforce is a project space: standing instructions, short notes, files and lines. Start a chat
                with one and the AI uses it. Incognito chats never use a workforce.
              </div>

              <div className="bx-create-row">
                <input
                  className="bx-input"
                  placeholder="New workforce name"
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
              <div className="bx-counter">{boxes.length} / {MAX_BOXES} workforces</div>

              {loading && <div className="bx-muted">Loading workforces…</div>}
              {!loading && boxes.length === 0 && (
                <div className="bx-muted">No workforces yet. Create one above.</div>
              )}

              {boxes.map((b) => (
                <div key={b.id} className="bx-row" onClick={() => openBox(b.id)}>
                  <span className="bx-row-icon"><Icon icon={Package} size={16} /></span>
                  <div className="bx-row-text">
                    <div className="bx-row-title">{b.title}</div>
                    <div className="bx-row-meta">
                      {b.has_instructions ? "Instructions set" : "No instructions"} · {b.note_count} note
                      {b.note_count === 1 ? "" : "s"}
                    </div>
                  </div>
                  {activeBoxId === b.id && <span className="bx-badge">In use</span>}
                </div>
              ))}
            </>
          )}

          {openBoxId && detailLoading && <div className="bx-muted">Loading workforce…</div>}

          {openBoxId && detail && (
            <>
              <div className="bx-attach-row">
                <button className="bx-btn primary" onClick={() => onUse(detail.box.id)}>
                  Start a new chat with this workforce
                </button>
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
              <div className="bx-hint">How the AI should behave in chats that use this workforce.</div>
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
                {savedFlash && <span className="bx-saved"><Icon icon={Check} size={12} className="ico-inline" />Saved</span>}
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

              <BoxFiles boxId={detail.box.id} onError={setError} onChanged={() => setFilesVersion((v) => v + 1)} />
              <BoxLines boxId={detail.box.id} version={filesVersion} onError={setError} />
              <div className="bx-danger-zone">
                <button className="bx-btn danger" onClick={handleDeleteBox}>Delete this workforce</button>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}