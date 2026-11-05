// Lines section of the Workforce page (IM-1 + IM-3a).
// YOUR lines connect two files by hand: when a question matches one of them, the AI may also read
// the best-matching parts of the other. AI lines are found by reading the stored text of the files
// (imports, file names, shared names). The AI does not follow them in chat until you press
// "Make it mine". The graph opens as its own full page (BoxGraphView).
import { useState, useEffect, useRef } from "react";
import { Link2 } from "lucide-react";
import {
  listBoxFiles,
  listBoxLines,
  createBoxLine,
  deleteBoxLine,
  promoteBoxLine,
  rescanBoxLines,
} from "../api";
import { useIsMobile } from "../useIsMobile";
import { aiLinkType, AI_TYPE_COLORS, AI_TYPE_NAMES } from "./lineKinds";
import Icon from "./Icon";

export default function BoxLines({ boxId, version, onError, onOpenGraph }) {
  const [files, setFiles] = useState([]);
  const [lines, setLines] = useState([]);
  const [limits, setLimits] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [note, setNote] = useState("");
  const [aId, setAId] = useState("");
  const [bId, setBId] = useState("");
  const [label, setLabel] = useState("");
  const isMobile = useIsMobile();
  const seq = useRef(0); // ignores answers from a load that has been replaced by a newer one
  const firstVersion = useRef(version);

  async function load(silent) {
    const mine = ++seq.current;
    if (!silent) setLoading(true);
    try {
      const [f, l] = await Promise.all([listBoxFiles(boxId), listBoxLines(boxId)]);
      if (mine !== seq.current) return;
      const fileList = f.files || [];
      setFiles(fileList);
      setLines(l.lines || []);
      setLimits(l.limits || null);
      // forget a choice whose file no longer exists
      setAId((cur) => (fileList.some((x) => x.id === cur) ? cur : ""));
      setBId((cur) => (fileList.some((x) => x.id === cur) ? cur : ""));
    } catch (err) {
      if (!silent && mine === seq.current) onError(err.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }

  // Loads on open, and again whenever a file is added or removed (version changes).
  // After an upload the AI scan runs in the background on the server, so the list is
  // quietly refreshed twice more to pick up the new AI lines.
  useEffect(() => {
    load(false);
    const timers = [];
    if (version !== firstVersion.current) {
      timers.push(setTimeout(() => load(true), 3500), setTimeout(() => load(true), 9000));
    }
    return () => {
      timers.forEach(clearTimeout);
      seq.current += 1;
    };
  }, [boxId, version]);

  // Small messages fade away on their own.
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(""), 6000);
    return () => clearTimeout(t);
  }, [note]);

  const userLines = lines.filter((l) => l.kind !== "a");
  const aiLines = lines.filter((l) => l.kind === "a");
  const maxLines = limits?.max_lines ?? 100;
  const maxAi = limits?.max_a_lines ?? 60;
  const full = userLines.length >= maxLines;
  const canCreate = !!aId && !!bId && aId !== bId && !busy && !full;

  async function handleCreate() {
    if (!canCreate) return;
    onError("");
    setBusy(true);
    try {
      const line = await createBoxLine(boxId, aId, bId, label.trim());
      // Drawing over an AI line turns that AI line into yours: replace it, don't add a second row.
      setLines((prev) =>
        prev.some((x) => x.id === line.id) ? prev.map((x) => (x.id === line.id ? line : x)) : [...prev, line]
      );
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
    } catch (err) {
      onError(err.message);
    }
  }

  async function handlePromote(line) {
    onError("");
    if (full) {
      onError(`You already have ${maxLines} lines of your own. Delete one first.`);
      return;
    }
    try {
      const mine = await promoteBoxLine(boxId, line.id);
      setLines((prev) => prev.map((x) => (x.id === mine.id ? mine : x)));
    } catch (err) {
      onError(err.message);
    }
  }

  async function handleRescan() {
    if (scanning) return;
    onError("");
    setNote("");
    setScanning(true);
    try {
      const r = await rescanBoxLines(boxId);
      if (r.status === "busy") {
        setNote("A scan is already running. The list updates in a moment.");
        setTimeout(() => load(true), 3000);
      } else {
        await load(true);
        setNote(
          r.added || r.removed || r.updated
            ? `AI lines: ${r.added || 0} added, ${r.removed || 0} removed.`
            : "No changes. The AI lines are up to date."
        );
      }
    } catch (err) {
      onError(err.message);
    } finally {
      setScanning(false);
    }
  }

  return (
    <>
      <div className="bx-section-label">
        Lines{" "}
        {limits && (
          <span className="bx-counter-inline">
            {userLines.length} / {maxLines}
          </span>
        )}
      </div>
      <div className="bx-hint">
        A line connects two files. When a question matches one of them, the AI may also read the
        best-matching parts of the other. Only you create your lines. AI lines are found by reading your
        files; the AI follows them in chat only after you press Make it mine. Labels are notes for you and
        are not sent to the AI.
      </div>

      {!loading && files.length >= 2 && (
        <div className="bx-scan-row">
          {onOpenGraph && (
            <button className="bx-btn primary small" onClick={onOpenGraph}>
              {isMobile ? "Open map" : "Open graph"}
            </button>
          )}
          <button className="bx-btn ghost small" disabled={scanning} onClick={handleRescan}>
            {scanning ? "Scanning…" : "Re-scan files"}
          </button>
        </div>
      )}
      {note && <div className="bx-saved" style={{ marginBottom: 8 }}>{note}</div>}

      {loading && <div className="bx-muted">Loading lines…</div>}
      {!loading && files.length < 2 && (
        <div className="bx-muted">Add at least two files above to draw a line between them.</div>
      )}
      {!loading && files.length >= 2 && userLines.length === 0 && <div className="bx-muted">No lines of your own yet.</div>}

      {userLines.map((l) => (
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
        <>
          <div className="bx-section-label">
            Found by AI <span className="bx-counter-inline">{aiLines.length} / {maxAi}</span>
          </div>
          {aiLines.length === 0 && (
            <div className="bx-muted">None yet. Press Re-scan files, or add files that refer to each other.</div>
          )}
          {aiLines.map((l) => {
            const type = aiLinkType(l.label);
            const color = AI_TYPE_COLORS[type];
            return (
              <div key={l.id} className="bx-row" style={{ cursor: "default" }}>
                <span className="bx-row-icon" style={{ color }}><Icon icon={Link2} size={16} /></span>
                <div className="bx-row-text">
                  <div className="bx-row-title">{l.a_name} ↔ {l.b_name}</div>
                  <div className="bx-row-meta">{l.label || AI_TYPE_NAMES[type]}</div>
                </div>
                <span className="bx-badge ai" style={{ "--ai": color }} title="Found by reading your files">AI</span>
                <span
                  className={`bx-link ${full ? "disabled" : ""}`}
                  title={full ? "You are at your line limit" : "Turn this into one of your own lines"}
                  onClick={() => handlePromote(l)}
                >
                  Make it mine
                </span>
                <span className="bx-link danger" onClick={() => handleDelete(l)}>
                  Delete
                </span>
              </div>
            );
          })}
        </>
      )}

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