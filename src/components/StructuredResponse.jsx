// Renders a structured AI response — a branching tree breakdown or a
// bar chart. Only ever used when the AI itself decided the content
// warranted it. Renders nothing if the structure is malformed, since
// the plain text bubble above already carries the actual answer.

function TreeDiagram({ root, branches }) {
  return (
    <div className="tree-diagram">
      <div className="tree-root">{root}</div>
      <div className="tree-branches">
        {branches.map((branch, i) => (
          <div key={i} className="tree-branch">
            <div className="tree-branch-label">{branch.label}</div>
            {branch.children?.length > 0 && (
              <div className="tree-children">
                {branch.children.map((child, j) => (
                  <div key={j} className="tree-child">{child}</div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function BarChart({ title, data }) {
  const maxValue = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="bar-chart">
      {title && <div className="bar-chart-title">{title}</div>}
      <div className="bar-chart-bars">
        {data.map((d, i) => (
          <div key={i} className="bar-chart-row">
            <div className="bar-chart-label">{d.label}</div>
            <div className="bar-chart-track">
              <div
                className="bar-chart-fill"
                style={{ width: `${(d.value / maxValue) * 100}%` }}
              ></div>
            </div>
            <div className="bar-chart-value">{d.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function StructuredResponse({ structure }) {
  if (!structure) return null;

  if (structure.format === "tree") {
    return <TreeDiagram root={structure.root} branches={structure.branches || []} />;
  }

  if (structure.format === "chart") {
    return <BarChart title={structure.title} data={structure.data || []} />;
  }

  return null;
}