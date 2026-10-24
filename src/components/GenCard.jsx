// Preview card for a generated presentation or spreadsheet, with a download button.

import { Presentation, Table, Maximize2, Download } from "lucide-react";
import Icon from "./Icon";

export default function GenCard({ message, onExpand, onDownload }) {
  const m = message;
  const isPptx = m.docType === "pptx";

  return (
    <div className="msg-row ai">
      <div className="msg-avatar"></div>
      <div className="gen-card">
        <div className="gen-card-header">
          <span className="gen-card-icon"><Icon icon={isPptx ? Presentation : Table} size={18} /></span>
          <div>
            <div className="gen-card-title">{m.plan.title}</div>
            <div className="gen-card-meta">
              {isPptx
                ? `${m.plan.slides?.length || 0} slides`
                : `${m.plan.rows?.length || 0} rows · ${m.plan.headers?.length || 0} columns`}
            </div>
          </div>
          <div
            className="gen-expand-btn"
            onClick={() => onExpand({ plan: m.plan, docType: m.docType })}
            title="View full preview"
          >
            <Icon icon={Maximize2} size={14} />
          </div>
        </div>

        {isPptx ? (
          <div className="gen-card-preview">
            {m.plan.slides?.map((s, i) => (
              <div key={i} className="gen-slide-preview">
                <div className="gen-slide-num">{i + 1}</div>
                <div>
                  <div className="gen-slide-heading">{s.heading}</div>
                  {s.bullets?.map((b, j) => (
                    <div key={j} className="gen-slide-bullet">• {b}</div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="gen-card-preview">
            <table className="gen-table-preview">
              <thead>
                <tr>
                  {m.plan.headers?.map((h, i) => <th key={i}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {m.plan.rows?.map((row, i) => {
                  const isTotalRow = String(row[0] || "").toLowerCase().match(/total|sum|average|overall/);
                  return (
                    <tr key={i} className={isTotalRow ? "gen-total-row" : ""}>
                      {row.map((cell, j) => <td key={j}>{cell}</td>)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div
          className="gen-download-btn"
          onClick={() => onDownload(m.plan, m.docType)}
        >
          <Icon icon={Download} size={14} className="ico-inline" />Download {isPptx ? ".pptx" : ".xlsx"}
        </div>
      </div>
    </div>
  );
}