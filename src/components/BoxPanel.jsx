// Workforce page: takes over the main area. List your workforces; inside one you get a
// Projects-style page: a chat input and recent chats on the left, cards for
// Instructions / Notes / Files / Lines on the right.
// (File and component names keep "Box" on purpose: only the words people see say Workforce.)
import { useState, useEffect } from "react";
import { ArrowLeft, X, Package, Check, ChevronDown, ChevronUp, ArrowUp, MessageSquare } from "lucide-react";
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
  listConversations,
} from "../api";

const MAX_BOXES = 10;
const MAX_INSTRUCTIONS = 2000;
const MAX_NOTE = 500;
const MAX_NOTES = 50;
const MAX_MESSAGE = 8000;

function timeAgo(iso) {
  const t = new Date(iso).getTime();
  if (!t) return "";
  const mins = Math.floor((Date.now() - t) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days < 30 ? `${days}d ago` : new Date(iso).toLocaleDateString();
}

function Card({ title, sub, open, onToggle, children }) {
  return (
    <div className={`wf-card ${open ? "open" : ""}`}>
      <div className="wf-card-head" onClick={onToggle}>
        <div className="wf-card-headtext">
          <div className="wf-card-title">{title}</div>
          {sub && <div className="wf-card-sub">{sub}</div>}
        </div>
        <span className="wf-card-caret"><Icon icon={open ? ChevronUp : ChevronDown} size={14} /></span>
      </div>
      {open && <div className="wf-card-body">{children}</div>}
    </div>
  );
}

export default function BoxPanel({ open, onClose, activeBoxId, onUse, onOpenChat, onBoxDeleted }) {
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

  const [cards, setCards] = useState({}); // which cards are open: { instructions, notes, files, lines }
  const [chatDraft, setChatDraft] = useState("");
  const [recent, setRecent] = useState([]); // chats that used this workforce

  useEffect(() => {
    if (open) {
      refreshList();
    } else {
      setOpenBoxId(null);
      setDetail(null);
      setError("");
      setChatDraft("");
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
    setRecent([]);
    setCards({});
    setChatDraft("");
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
    // Recent chats are a nice-to-have: a failure here is not shown as an error.
    listConversations()
      .then((all) => setRecent((all || []).filter((c) => c.box_id === id).slice(0, 8)))
      .catch((err) => console.warn("Recent chats unavailable (non-fatal):", err.message));
  }

  function backToList() {
    setOpenBoxId(null);
    setDetail(null);
    setError("");
    refreshList();
  }

  function toggleCard(key) {
    setCards((c) => ({ ...c, [key]: !c[key] }));
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

  function handleStartChat() {
    const text = chatDraft.trim();
    if (!text || !detail) return;
    setChatDraft("");
    onUse(detail.box.id, text);
  }

  if (!open) return null;

  const dirty =
    detail &&
    (titleDraft.trim() !== detail.box.title || instrDraft.trim() !== (detail.box.instructions || ""));

  const savedInstr = detail ? (detail.box.instructions || "").trim() : "";
  const instrPreview = savedInstr
    ? savedInstr.length > 110 ? savedInstr.slice(0, 110) + "…" : savedInstr
    : "No instructions yet";

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
        <div className={`wf-inner ${openBoxId ? "wide" : ""}`}>
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
            <div className="wf-grid">
              {/* ---------- Left: chat input + recent chats ---------- */}
              <div className="wf-left">
                <div className="wf-composer">
                  <textarea
                    className="wf-composer-input"
                    rows={3}
                    maxLength={MAX_MESSAGE}
                    placeholder="Ask in this workforce…"
                    value={chatDraft}
                    onChange={(e) => setChatDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleStartChat();
                      }
                    }}
                  />
                  <div className="wf-composer-bar">
                    <span className="wf-composer-hint">Starts a new chat that uses this workforce</span>
                    <div
                      className="send-btn"
                      style={{ opacity: chatDraft.trim() ? 1 : 0.4 }}
                      onClick={handleStartChat}
                      title="Start chat"
                    >
                      <Icon icon={ArrowUp} stroke={2} />
                    </div>
                  </div>
                </div>

                <div className="bx-section-label">Recent chats in this workforce</div>
                {recent.length === 0 && <div className="bx-muted">No chats yet. Ask something above.</div>}
                {recent.map((c) => (
                  <div key={c.id} className="bx-row" onClick={() => onOpenChat(c.id, detail.box.id)}>
                    <span className="bx-row-icon"><Icon icon={MessageSquare} size={15} /></span>
                    <div className="bx-row-text">
                      <div className="bx-row-title">{c.title}</div>
                    </div>
                    <span className="bx-row-meta">{timeAgo(c.updated_at)}</span>
                  </div>
                ))}
              </div>

              {/* ---------- Right: project cards ---------- */}
              <div className="wf-right">
                <Card
                  title="Instructions"
                  sub={instrPreview}
                  open={!!cards.instructions}
                  onToggle={() => toggleCard("instructions")}
                >
                  <div className="bx-section-label" style={{ marginTop: 0 }}>Name</div>
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
                </Card>

                <Card
                  title="Notes"
                  sub={`${detail.notes.length} / ${MAX_NOTES} short facts the AI should know`}
                  open={!!cards.notes}
                  onToggle={() => toggleCard("notes")}
                >
                  <div className="bx-hint">No passwords, keys, or personal numbers.</div>

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
                </Card>

                <Card
                  title="Files"
                  sub="Text, code and PDFs the AI can search"
                  open={!!cards.files}
                  onToggle={() => toggleCard("files")}
                >
                  <BoxFiles boxId={detail.box.id} onError={setError} onChanged={() => setFilesVersion((v) => v + 1)} />
                </Card>

                <Card
                  title="Lines"
                  sub="Connect files so the AI can follow the link"
                  open={!!cards.lines}
                  onToggle={() => toggleCard("lines")}
                >
                  <BoxLines boxId={detail.box.id} version={filesVersion} onError={setError} />
                </Card>

                <div className="bx-danger-zone">
                  <button className="bx-btn danger" onClick={handleDeleteBox}>Delete this workforce</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}