// Full-page graph view of one workforce. Loads its own files and lines, so it always shows the newest data.
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import BoxGraph from "./BoxGraph";
import Icon from "./Icon";
import { listBoxFiles, listBoxLines } from "../api";

export default function BoxGraphView({ boxId, title, onBack, onError }) {
  const [files, setFiles] = useState([]);
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <section className="wf-page wf-graphpage" aria-label="Workforce graph">
      <div className="bx-header">
        <div className="bx-icon-btn" onClick={onBack} title="Back to workforce">
          <Icon icon={ArrowLeft} size={14} />
        </div>
        <div className="bx-title">{title} · Graph</div>
      </div>
      <div className="wf-graph-stage">
        {loading && <div className="bx-muted" style={{ padding: 24 }}>Loading graph…</div>}
        {!loading && files.length < 2 && (
          <div className="bx-muted" style={{ padding: 24 }}>Add at least two files to see a graph.</div>
        )}
        {!loading && files.length >= 2 && <BoxGraph files={files} lines={lines} />}
      </div>
    </section>
  );
}