// Lines section of the Workforce page (IM-1 + IM-3a).
// YOUR lines connect two files by hand: when a question matches one of them, the AI may also read
// the best-matching parts of the other. AI lines are found by reading the stored text of the files
// (imports, file names, shared names). The AI does not follow them in chat until you press
// "Make it mine". The graph opens as its own full page (BoxGraphView).
import { useState, useEffect, useRef } from "react";
import { Link2, Layers } from "lucide-react";
import {
  listBoxFiles,
  listBoxLines,
  createBoxLine,
  deleteBoxLine,
  promoteBoxLine,
  rescanBoxLines,
  listBoxGroups,
  createBoxGroup,
  deleteBoxGroup,
  promoteBoxGroup,
} from "../api";
import { useIsMobile } from "../useIsMobile";
import { aiLinkType, AI_TYPE_COLORS, AI_TYPE_NAMES } from "./lineKinds";
import { PATTERN_KINDS, groupColor, patternText } from "./groupKinds";
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
  const [groups, setGroups] = useState([]);
  const [gLimits, setGLimits] = useState(null);
  const [expanded, setExpanded] = useState(null); // group whose files are shown
  const [gKind, setGKind] = useState("prefix");
  const [gWord, setGWord] = useState("");
  const [gName, setGName] = useState("");
  const [gBusy, setGBusy] = useState(false);
  const isMobile = useIsMobile();
  const seq = useRef(0); // ignores answers from a load that has been replaced by a newer one
  const firstVersion = useRef(version);

  async function load(silent) {
    const mine = ++seq.current;
    if (!silent) setLoading(true);
    try {
      // Groups are a bonus: if that call fails the Lines card still works.
      const [f, l, g] = await Promise.all([
        listBoxFiles(boxId),
        listBoxLines(boxId),
        listBoxGroups(boxId).catch(() => null),
      ]);
      if (mine !== seq.current) return;
      const fileList = f.files || [];
      setFiles(fileList);
      setLines(l.lines || []);
      setLimits(l.limits || null);
      if (g) {
        setGroups(g.groups || []);
        setGLimits(g.limits || null);
      }
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

  const userGroups = groups.filter((g) => g.created_by !== "a");
  const aiGroups = groups.filter((g) => g.created_by === "a");
  const maxGroups = gLimits?.max_groups ?? 12;
  const maxAiGroups = gLimits?.max_a_groups ?? 8;
  const groupsFull = userGroups.length >= maxGroups;
  const canCreateGroup = (gKind === "tests" || !!gWord.trim()) && !gBusy && !groupsFull;
  const kindInfo = PATTERN_KINDS.find((k) => k.id === gKind) || PATTERN_KINDS[0];

  async function handleCreateGroup() {
    if (!canCreateGroup) return;
    onError("");
    setGBusy(true);
    try {
      const g = await createBoxGroup(boxId, gKind, gKind === "tests" ? "" : gWord.trim(), gName.trim());
      // Creating over an AI group turns that AI group into yours: replace it, don't add a second row.
      setGroups((prev) => (prev.some((x) => x.id === g.id) ? prev.map((x) => (x.id === g.id ? g : x)) : [...prev, g]));
      setGWord("");
      setGName("");
      setExpanded(g.id);
    } catch (err) {
      onError(err.message);
    } finally {
      setGBusy(false);
    }
  }

  async function handleDeleteGroup(g) {
    onError("");
    try {
      await deleteBoxGroup(boxId, g.id);
      setGroups((prev) => prev.filter((x) => x.id !== g.id));
      if (expanded === g.id) setExpanded(null);
    } catch (err) {
      onError(err.message);
    }
  }

  async function handlePromoteGroup(g) {
    onError("");
    if (groupsFull) {
      onError(`You already have ${maxGroups} groups of your own. Delete one first.`);
      return;
    }
    try {
      const mine = await promoteBoxGroup(boxId, g.id);
      setGroups((prev) => prev.map((x) => (x.id === mine.id ? mine : x)));
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
        const gr = r.groups;
        const parts = [
          r.added || r.removed || r.updated
            ? `AI lines: ${r.added || 0} added, ${r.removed || 0} removed.`
            : "No changes. The AI lines are up to date.",
        ];
        if (gr && (gr.added || gr.removed || gr.members_added || gr.members_removed)) {
          parts.push(`Groups: ${gr.added || 0} added, ${gr.removed || 0} removed.`);
        }
        setNote(parts.join(" "));
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

      {!loading && files.length >= 1 && (
        <>
          <div className="bx-section-label">
            Groups{" "}
            <span className="bx-counter-inline">
              {userGroups.length} / {maxGroups} yours · {aiGroups.length} / {maxAiGroups} AI
            </span>
          </div>
          <div className="bx-hint">
            A group collects files that share a name pattern: test files, names that start with the same word,
            or the same extension. AI groups are found by reading your file names. Groups are for you to see;
            the AI does not follow them in chat. Names are notes for you and are not sent to the AI.
          </div>

          {groups.length === 0 && (
            <div className="bx-muted">None yet. Add three or more files that share a pattern, or press Re-scan files.</div>
          )}

          {groups.map((g) => {
            const ai = g.created_by === "a";
            const color = groupColor(g.id);
            const open = expanded === g.id;
            return (
              <div key={g.id}>
                <div className="bx-row" onClick={() => setExpanded(open ? null : g.id)}>
                  <span className="bx-row-icon" style={{ color }}><Icon icon={Layers} size={16} /></span>
                  <div className="bx-row-text">
                    <div className="bx-row-title">{g.name}</div>
                    <div className="bx-row-meta">
                      {patternText(g)} · {g.files.length} file{g.files.length === 1 ? "" : "s"}
                    </div>
                  </div>
                  {ai ? (
                    <span className="bx-badge ai" style={{ "--ai": color }} title="Found by reading your file names">AI</span>
                  ) : (
                    <span className="bx-badge">You</span>
                  )}
                  {ai && (
                    <span
                      className={`bx-link ${groupsFull ? "disabled" : ""}`}
                      title={groupsFull ? "You are at your group limit" : "Turn this into one of your own groups"}
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePromoteGroup(g);
                      }}
                    >
                      Make it mine
                    </span>
                  )}
                  <span
                    className="bx-link danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteGroup(g);
                    }}
                  >
                    Delete
                  </span>
                </div>
                {open && (
                  <div className="bx-group-files">
                    {g.files.length === 0 && <div className="bx-group-file">No files match any more.</div>}
                    {g.files.map((f) => (
                      <div key={f.id} className="bx-group-file">{f.filename}</div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          <div className="bx-line-form">
            <select className="bx-select" value={gKind} onChange={(e) => setGKind(e.target.value)}>
              {PATTERN_KINDS.map((k) => (
                <option key={k.id} value={k.id}>{k.label}</option>
              ))}
            </select>
            {gKind !== "tests" && (
              <input
                className="bx-input"
                style={{ marginBottom: 8 }}
                placeholder={kindInfo.placeholder}
                value={gWord}
                maxLength={20}
                onChange={(e) => setGWord(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateGroup()}
              />
            )}
            <input
              className="bx-input"
              placeholder="Name (optional, only for you)"
              value={gName}
              maxLength={gLimits?.max_name_chars || 60}
              onChange={(e) => setGName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateGroup()}
            />
            <div className="bx-save-row" style={{ marginTop: 8 }}>
              <button className="bx-btn primary" disabled={!canCreateGroup} onClick={handleCreateGroup}>
                {gBusy ? "…" : "+ Add group"}
              </button>
              {groupsFull && <span className="bx-counter-inline">Group limit reached</span>}
            </div>
          </div>
        </>
      )}
    </>
  );
}