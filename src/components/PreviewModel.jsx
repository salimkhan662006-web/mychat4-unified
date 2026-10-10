// Full-size preview of a generated presentation or spreadsheet.
// `preview` is { plan, docType }.

export default function PreviewModal({ preview, onClose, onDownload }) {
  const { plan, docType } = preview;
  const isPptx = docType === "pptx";

  return (
    <div className="preview-modal-overlay" onClick={onClose}>
      <div className="preview-modal" onClick={(e) => e.stopPropagation()}>
        <div className="preview-modal-header">
          <div>
            <div className="preview-modal-title">{plan.title}</div>
            <div className="preview-modal-meta">
              {isPptx
                ? `${plan.slides?.length || 0} slides`
                : `${plan.rows?.length || 0} rows`}
            </div>
          </div>
          <div className="preview-modal-close" onClick={onClose}>✕</div>
        </div>

        <div className="preview-modal-body">
          {isPptx ? (
            plan.slides?.map((s, i) => (
              <div key={i} className="preview-modal-slide">
                <div className="preview-modal-slide-num">Slide {i + 1}</div>
                <div className="preview-modal-slide-heading">{s.heading}</div>
                {s.bullets?.map((b, j) => (
                  <div key={j} className="preview-modal-slide-bullet">• {b}</div>
                ))}
              </div>
            ))
          ) : (
            <table className="preview-modal-table">
              <thead>
                <tr>
                  {plan.headers?.map((h, i) => <th key={i}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {plan.rows?.map((row, i) => {
                  const isTotalRow = String(row[0] || "").toLowerCase().match(/total|sum|average|overall/);
                  return (
                    <tr key={i} className={isTotalRow ? "gen-total-row" : ""}>
                      {row.map((cell, j) => <td key={j}>{cell}</td>)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div
          className="gen-download-btn"
          style={{ margin: "16px 24px" }}
          onClick={() => onDownload(plan, docType)}
        >
          ⬇ Download {isPptx ? ".pptx" : ".xlsx"}
        </div>
      </div>
    </div>
  );
}