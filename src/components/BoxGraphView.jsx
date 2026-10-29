// Full-page graph view of one workforce. Loads its own files and lines, so it always shows the newest data.
// Desktop: the Pixi graph. Phone: the tap-based neighbours map. Both create and delete lines here.
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import BoxGraph from "./BoxGraph";
import BoxNeighbours from "./BoxNeighbours";
import Icon from "./Icon";
import { useIsMobile } from "../useIsMobile";
import { listBoxFiles, listBoxLines, createBoxLine, deleteBoxLine } from "../api";

export default function BoxGraphView({ boxId, title, onBack, onError }) {
  const isMobile = useIsMobile();
  const [files, setFiles] = useState([]);
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([listBoxFiles(boxId), listBoxLines(boxId)])
      .then(([f, l]) => {
        if (cancelled) return;
        setFiles(f.files || []);
        setLines(l.lines || []);
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
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  async function handleCreate(aId, bId) {
    setNotice("");
    try {
      const line = await createBoxLine(boxId, aId, bId, "");
      setLines((prev) => [...prev, line]);
    } catch (err) {
      setNotice(err.message);
    }
  }

  async function handleDelete(lineId) {
    setNotice("");
    try {
      await deleteBoxLine(boxId, lineId);
      setLines((prev) => prev.filter((l) => l.id !== lineId));
    } catch (err) {
      setNotice(err.message);
    }
  }

  return (
    <section className="wf-page wf-graphpage" aria-label="Workforce graph">
      <div className="bx-header">
        <div className="bx-icon-btn" onClick={onBack} title="Back to workforce">
          <Icon icon={ArrowLeft} size={14} />
        </div>
        <div className="bx-title">{title} · {isMobile ? "Map" : "Graph"}</div>
      </div>
      <div className={`wf-graph-stage ${isMobile ? "scroll" : ""}`}>
        {notice && <div className="bx-graph-notice" onClick={() => setNotice("")}>{notice}</div>}
        {loading && <div className="bx-muted" style={{ padding: 24 }}>Loading…</div>}
        {!loading && files.length < 2 && (
          <div className="bx-muted" style={{ padding: 24 }}>Add at least two files to see a graph.</div>
        )}
        {!loading && files.length >= 2 && !isMobile && (
          <BoxGraph files={files} lines={lines} onCreateLine={handleCreate} onDeleteLine={handleDelete} />
        )}
        {!loading && files.length >= 2 && isMobile && (
          <BoxNeighbours files={files} lines={lines} onCreateLine={handleCreate} onDeleteLine={handleDelete} />
        )}
      </div>
    </section>
  );
}