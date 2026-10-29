// Lines section of the Workforce page (IM-1: AI Intermetrolite).
// A line connects two files of this workforce. Only you draw it. When a question matches
// one of the two files, the AI may also read the best-matching parts of the other.
// The graph opens as its own full page (BoxGraphView).
import { useState, useEffect } from "react";
import { Link2 } from "lucide-react";
import { listBoxFiles, listBoxLines, createBoxLine, deleteBoxLine } from "../api";
import { useIsMobile } from "../useIsMobile";
import Icon from "./Icon";

export default function BoxLines({ boxId, version, onError, onOpenGraph }) {
  const [files, setFiles] = useState([]);
  const [lines, setLines] = useState([]);
  const [limits, setLimits] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [aId, setAId] = useState("");
  const [bId, setBId] = useState("");
  const [label, setLabel] = useState("");
  const isMobile = useIsMobile();

  // Loads on open, and again whenever a file is added or removed (version changes).
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([listBoxFiles(boxId), listBoxLines(boxId)])
      .then(([f, l]) => {
        if (cancelled) return;
        const fileList = f.files || [];
        setFiles(fileList);
        setLines(l.lines || []);
        setLimits(l.limits || null);
        // forget a choice whose file no longer exists
        setAId((cur) => (fileList.some((x) => x.id === cur) ? cur : ""));
        setBId((cur) => (fileList.some((x) => x.id === cur) ? cur : ""));
      })
      .catch((err) => {
        if (!cancelled) onError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [boxId, version]);

  const full = !!limits && limits.used_lines >= limits.max_lines;
  const canCreate = !!aId && !!bId && aId !== bId && !busy && !full;

  async function handleCreate() {
    if (!canCreate) return;
    onError("");
    setBusy(true);
    try {
      const line = await createBoxLine(boxId, aId, bId, label.trim());
      setLines((prev) => [...prev, line]);
      setLimits((lim) => (lim ? { ...lim, used_lines: lim.used_lines + 1 } : lim));
      setAId("");
      setBId("");
      setLabel("");
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(line) {
    onError("");
    try {
      await deleteBoxLine(boxId, line.id);
      setLines((prev) => prev.filter((x) => x.id !== line.id));
      setLimits((lim) => (lim ? { ...lim, used_lines: Math.max(lim.used_lines - 1, 0) } : lim));
    } catch (err) {
      onError(err.message);
    }
  }

  return (
    <>
      <div className="bx-section-label">
        Lines{" "}
        {limits && (
          <span className="bx-counter-inline">
            {limits.used_lines} / {limits.max_lines}
          </span>
        )}
      </div>
      <div className="bx-hint">
        A line connects two files. When a question matches one of them, the AI may also read the
        best-matching parts of the other. Only you create or delete lines. Labels are notes for you and
        are not sent to the AI.
      </div>

      {!isMobile && !loading && files.length >= 2 && onOpenGraph && (
        <div className="bx-save-row" style={{ marginBottom: 10 }}>
          <button className="bx-btn primary small" onClick={onOpenGraph}>Open graph</button>
        </div>
      )}

      {loading && <div className="bx-muted">Loading lines…</div>}
      {!loading && files.length < 2 && (
        <div className="bx-muted">Add at least two files above to draw a line between them.</div>
      )}
      {!loading && files.length >= 2 && lines.length === 0 && <div className="bx-muted">No lines yet.</div>}

      {lines.map((l) => (
        <div key={l.id} className="bx-row" style={{ cursor: "default" }}>
          <span className="bx-row-icon"><Icon icon={Link2} size={16} /></span>
          <div className="bx-row-text">
            <div className="bx-row-title">{l.a_name} ↔ {l.b_name}</div>
            <div className="bx-row-meta">{l.label ? l.label : "No label"}</div>
          </div>
          <span className="bx-badge">You</span>
          <span className="bx-link danger" onClick={() => handleDelete(l)}>
            Delete
          </span>
        </div>
      ))}

      {!loading && files.length >= 2 && (
        <div className="bx-line-form">
          <select className="bx-select" value={aId} onChange={(e) => setAId(e.target.value)}>
            <option value="">First file…</option>
            {files.filter((f) => f.id !== bId).map((f) => (
              <option key={f.id} value={f.id}>{f.filename}</option>
            ))}
          </select>
          <select className="bx-select" value={bId} onChange={(e) => setBId(e.target.value)}>
            <option value="">Second file…</option>
            {files.filter((f) => f.id !== aId).map((f) => (
              <option key={f.id} value={f.id}>{f.filename}</option>
            ))}
          </select>
          <input
            className="bx-input"
            placeholder="Label (optional, only for you)"
            value={label}
            maxLength={limits?.max_label_chars || 100}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
          <div className="bx-save-row" style={{ marginTop: 8 }}>
            <button className="bx-btn primary" disabled={!canCreate} onClick={handleCreate}>
              {busy ? "…" : "+ Add line"}
            </button>
            {full && <span className="bx-counter-inline">Line limit reached</span>}
          </div>
        </div>
      )}
    </>
  );
}