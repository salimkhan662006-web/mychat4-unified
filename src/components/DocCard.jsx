// "Document attached" card with one-click preset tasks (summarise, key points, ...).

import { FileText } from "lucide-react";
import Icon from "./Icon";

const PRESET_TASKS = [
  { label: "Summarise", task: "Write a clear, concise summary of this document." },
  { label: "Key points", task: "Extract the key points as a bulleted list." },
  { label: "Flag risks", task: "Identify any risks, inconsistencies, or unusual clauses in this document." },
  { label: "Action items", task: "Find and list any action items, tasks, or deadlines mentioned." },
];

export default function DocCard({ message, onPresetTask }) {
  const m = message;
  return (
    <div className="msg-row ai">
      <div className="msg-avatar"></div>
      <div className="doc-block">
        <div className="doc-inline-card">
          <div className="doc-icon"><Icon icon={FileText} size={18} /></div>
          <div>
            <div className="doc-info-name">{m.content}</div>
            <div className="doc-info-meta">{m.docMeta}</div>
          </div>
        </div>
        <div className="preset-chips">
          {PRESET_TASKS.map((p) => (
            <div
              key={p.label}
              className="chip"
              onClick={() => onPresetTask(p.task, p.label)}
            >
              {p.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}