// Phone version of the graph: one file at a time and the files it connects to.
// Tap a connected file to hop to it. Link / Unlink work with taps instead of drags.
import { useState, useMemo } from "react";
import { ChevronRight } from "lucide-react";
import Icon from "./Icon";

export default function BoxNeighbours({ files, lines, onCreateLine, onDeleteLine }) {
  const [focusId, setFocusId] = useState(null);

  const degree = useMemo(() => {
    const d = {};
    lines.forEach((l) => {
      d[l.a_id] = (d[l.a_id] || 0) + 1;
      d[l.b_id] = (d[l.b_id] || 0) + 1;
    });
    return d;
  }, [lines]);

  // Start on the most connected file.
  const focus =
    files.find((f) => f.id === focusId) ||
    [...files].sort((a, b) => (degree[b.id] || 0) - (degree[a.id] || 0))[0];
  if (!focus) return null;

  const linked = lines
    .filter((l) => l.a_id === focus.id || l.b_id === focus.id)
    .map((l) => ({ line: l, other: files.find((f) => f.id === (l.a_id === focus.id ? l.b_id : l.a_id)) }))
    .filter((x) => x.other);
  const linkedIds = new Set(linked.map((x) => x.other.id));
  const others = files.filter((f) => f.id !== focus.id && !linkedIds.has(f.id));

  return (
    <div className="bx-nb">
      <select className="bx-select" value={focus.id} onChange={(e) => setFocusId(e.target.value)}>
        {files.map((f) => (
          <option key={f.id} value={f.id}>{f.filename}</option>
        ))}
      </select>

      <div className="bx-nb-focus">
        <div className="bx-nb-name">{focus.filename}</div>
        <div className="bx-row-meta">
          {linked.length} connected file{linked.length === 1 ? "" : "s"}
        </div>
      </div>

      <div className="bx-section-label">Connected to</div>
      {linked.length === 0 && <div className="bx-muted">Nothing yet. Link it to a file below.</div>}
      {linked.map(({ line, other }) => (
        <div key={line.id} className="bx-row" onClick={() => setFocusId(other.id)}>
          <div className="bx-row-text">
            <div className="bx-row-title">{other.filename}</div>
            <div className="bx-row-meta">{line.label ? line.label : "No label"}</div>
          </div>
          <span
            className="bx-link danger"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteLine(line.id);
            }}
          >
            Unlink
          </span>
          <Icon icon={ChevronRight} size={14} />
        </div>
      ))}

      {others.length > 0 && <div className="bx-section-label">Not connected</div>}
      {others.map((f) => (
        <div key={f.id} className="bx-row" style={{ cursor: "default" }}>
          <div className="bx-row-text">
            <div className="bx-row-title">{f.filename}</div>
          </div>
          <button className="bx-btn ghost small" onClick={() => onCreateLine(focus.id, f.id)}>Link</button>
        </div>
      ))}
    </div>
  );
}