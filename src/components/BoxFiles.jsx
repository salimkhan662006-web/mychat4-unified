// Technical files section of the Box panel (K3).
// Upload text/code/PDF files into a box, see what is stored, delete files.
// Only extracted text is kept on the server, never the original file.
import { useState, useEffect, useRef } from "react";
import { listBoxFiles, uploadBoxFile, deleteBoxFile } from "../api";

// No `accept` filter on the input on purpose: phones hide files whose type they
// don't know (.py, .jsx...), so the picker looked empty. We check the type here instead.
const ALLOWED = [".txt", ".md", ".py", ".js", ".jsx", ".ts", ".tsx", ".json", ".csv", ".css", ".html", ".sql", ".yml", ".yaml", ".pdf"];

function extOf(name) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

function formatChars(n) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M chars`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k chars`;
  return `${n} chars`;
}

export default function BoxFiles({ boxId, onError }) {
  const [files, setFiles] = useState([]);
  const [limits, setLimits] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  async function refresh() {
    const data = await listBoxFiles(boxId);
    setFiles(data.files || []);
    setLimits(data.limits || null);
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFiles([]);
    setLimits(null);
    listBoxFiles(boxId)
      .then((data) => {
        if (cancelled) return;
        setFiles(data.files || []);
        setLimits(data.limits || null);
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

  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file || busy) return;
    onError("");
    if (!ALLOWED.includes(extOf(file.name))) {
      onError(`"${file.name}" isn't a supported type. Allowed: ${ALLOWED.join(" ")}`);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    if (limits && file.size > limits.max_upload_bytes) {
      onError(`That file is over ${Math.round(limits.max_upload_bytes / (1024 * 1024))} MB.`);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setBusy(true);
    try {
      await uploadBoxFile(boxId, file);
      await refresh();
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleDelete(file) {
    if (!window.confirm(`Remove "${file.filename}" from this box?`)) return;
    onError("");
    try {
      await deleteBoxFile(boxId, file.id);
      await refresh();
    } catch (err) {
      onError(err.message);
    }
  }

  const full = limits && limits.used_files >= limits.max_files;

  return (
    <>
      <div className="bx-section-label">
        Technical files{" "}
        {limits && (
          <span className="bx-counter-inline">
            {limits.used_files} / {limits.max_files} files · {formatChars(limits.used_chars)} of{" "}
            {formatChars(limits.max_chars)} used (all boxes)
          </span>
        )}
      </div>
      <div className="bx-hint">
        Text, code and text PDFs (.txt .md .py .js .jsx .json .csv and more). The AI reads only the parts that
        match your question. Only the text is kept, never the original file. Files with passwords, keys or
        personal numbers are refused.
      </div>

      {loading && <div className="bx-muted">Loading files…</div>}
      {!loading && files.length === 0 && <div className="bx-muted">No files yet.</div>}

      {files.map((f) => (
        <div key={f.id} className="bx-row" style={{ cursor: "default" }}>
          <span className="bx-row-icon">📄</span>
          <div className="bx-row-text">
            <div className="bx-row-title">{f.filename}</div>
            <div className="bx-row-meta">
              {formatChars(f.char_count)} · {f.chunk_count} part{f.chunk_count === 1 ? "" : "s"}
            </div>
          </div>
          <span className="bx-link danger" onClick={() => handleDelete(f)}>
            Remove
          </span>
        </div>
      ))}

      <div className="bx-save-row" style={{ marginTop: 8 }}>
        <label className={`bx-btn primary ${busy || full ? "disabled" : ""}`} style={{ opacity: busy || full ? 0.4 : 1 }}>
          {busy ? "Reading and indexing…" : "+ Add file"}
          <input
            ref={inputRef}
            type="file"
            onChange={handleFile}
            disabled={busy || full}
            style={{ display: "none" }}
          />
        </label>
      </div>
    </>
  );
}