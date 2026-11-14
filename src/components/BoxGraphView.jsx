// Full-page graph view of one workforce. Loads its own files and lines, so it always shows the newest data.
// Desktop: the Pixi graph. Phone: the tap-based neighbours map. Both create, delete and promote lines here
// ("Make it mine" turns an AI line into yours) and can re-scan the files for AI lines.
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import BoxGraph from "./BoxGraph";
import BoxNeighbours from "./BoxNeighbours";
import Icon from "./Icon";
import { useIsMobile } from "../useIsMobile";
import {
  listBoxFiles,
  listBoxLines,
  createBoxLine,
  deleteBoxLine,
  promoteBoxLine,
  rescanBoxLines,
  listBoxGroups,
  deleteBoxGroup,
  promoteBoxGroup,
  renameBoxGroup,
} from "../api";

export default function BoxGraphView({ boxId, title, onBack, onError }) {
  const isMobile = useIsMobile();
  const [files, setFiles] = useState([]);
  const [lines, setLines] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState({ text: "", info: false });
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // Groups are a bonus: if that call fails the graph still works.
    Promise.all([listBoxFiles(boxId), listBoxLines(boxId), listBoxGroups(boxId).catch(() => null)])
      .then(([f, l, g]) => {
        if (cancelled) return;
        setFiles(f.files || []);
        setLines(l.lines || []);
        setGroups(g ? g.groups || [] : []);
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
  }, [boxId]);

  // Messages fade away on their own.
  useEffect(() => {
    if (!notice.text) return;
    const t = setTimeout(() => setNotice({ text: "", info: false }), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  const say = (text, info = false) => setNotice({ text, info });

  // Replace a line that is already on screen (same id), otherwise add it.
  function upsertLine(line) {
    setLines((prev) => (prev.some((x) => x.id === line.id) ? prev.map((x) => (x.id === line.id ? line : x)) : [...prev, line]));
  }

  async function handleCreate(aId, bId) {
    say("");
    try {
      // Drawing over an AI line makes it yours: the server returns the same line, now kind "u".
      upsertLine(await createBoxLine(boxId, aId, bId, ""));
    } catch (err) {
      say(err.message);
    }
  }

  async function handleDelete(lineId) {
    say("");
    try {
      await deleteBoxLine(boxId, lineId);
      setLines((prev) => prev.filter((l) => l.id !== lineId));
    } catch (err) {
      say(err.message);
    }
  }

  async function handlePromote(lineId) {
    say("");
    try {
      upsertLine(await promoteBoxLine(boxId, lineId));
    } catch (err) {
      say(err.message);
    }
  }

  function upsertGroup(g) {
    setGroups((prev) => (prev.some((x) => x.id === g.id) ? prev.map((x) => (x.id === g.id ? g : x)) : [...prev, g]));
  }

  async function handleDeleteGroup(groupId) {
    say("");
    try {
      await deleteBoxGroup(boxId, groupId);
      setGroups((prev) => prev.filter((g) => g.id !== groupId));
    } catch (err) {
      say(err.message);
    }
  }

  async function handlePromoteGroup(groupId) {
    say("");
    try {
      upsertGroup(await promoteBoxGroup(boxId, groupId));
    } catch (err) {
      say(err.message);
    }
  }

  async function handleRenameGroup(groupId, name) {
    say("");
    try {
      upsertGroup(await renameBoxGroup(boxId, groupId, name));
    } catch (err) {
      say(err.message);
    }
  }

  async function handleRescan() {
    if (scanning) return;
    say("");
    setScanning(true);
    try {
      const r = await rescanBoxLines(boxId);
      if (r.status === "busy") {
        say("A scan is already running. Try again in a moment.", true);
      } else {
        const [fresh, freshGroups] = await Promise.all([listBoxLines(boxId), listBoxGroups(boxId).catch(() => null)]);
        setLines(fresh.lines || []);
        if (freshGroups) setGroups(freshGroups.groups || []);
        say(
          r.added || r.removed || r.updated
            ? `AI lines: ${r.added || 0} added, ${r.removed || 0} removed.`
            : "No changes. The AI lines are up to date.",
          true
        );
      }
    } catch (err) {
      say(err.message);
    } finally {
      setScanning(false);
    }
  }

  const shared = {
    files,
    lines,
    groups,
    onCreateLine: handleCreate,
    onDeleteLine: handleDelete,
    onPromoteLine: handlePromote,
    onDeleteGroup: handleDeleteGroup,
    onPromoteGroup: handlePromoteGroup,
    onRenameGroup: handleRenameGroup,
    onRescan: handleRescan,
    scanning,
  };

  return (
    <section className="wf-page wf-graphpage" aria-label="Workforce graph">
      <div className="bx-header">
        <div className="bx-icon-btn" onClick={onBack} title="Back to workforce">
          <Icon icon={ArrowLeft} size={14} />
        </div>
        <div className="bx-title">{title} · {isMobile ? "Map" : "Graph"}</div>
      </div>
      <div className={`wf-graph-stage ${isMobile ? "scroll" : ""}`}>
        {notice.text && (
          <div className={`bx-graph-notice ${notice.info ? "info" : ""}`} onClick={() => say("")}>{notice.text}</div>
        )}
        {loading && <div className="bx-muted" style={{ padding: 24 }}>Loading…</div>}
        {!loading && files.length < 2 && (
          <div className="bx-muted" style={{ padding: 24 }}>Add at least two files to see a graph.</div>
        )}
        {!loading && files.length >= 2 && !isMobile && <BoxGraph {...shared} />}
        {!loading && files.length >= 2 && isMobile && <BoxNeighbours {...shared} />}
      </div>
    </section>
  );
}