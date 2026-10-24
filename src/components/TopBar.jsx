// Brand mark on the left; incognito badge, attached-box pill and
// attached-document pill on the right.
import { VenetianMask, Package, FileText, X } from "lucide-react";
import Icon from "./Icon";

export default function TopBar({ isIncognito, onEndIncognito, boxAttached, onDetachBox, activeDoc, onClearDoc }) {
  return (
    <div className="top-bar">
      <div className="brand">
        <div className="brand-mark">Isahiri<span>AI</span></div>
      </div>
      <div className="top-bar-right">
        {isIncognito && (
          <div className="incognito-badge">
            <Icon icon={VenetianMask} size={14} /> Enhanced Incognito — not saved
            <span className="incognito-end-btn" onClick={onEndIncognito}>End session</span>
          </div>
        )}
        {boxAttached && (
          <div className="active-doc-pill" title="This chat uses a box">
            <Icon icon={Package} size={14} /> Box attached
            <span className="pill-clear" onClick={onDetachBox}><Icon icon={X} size={12} /></span>
          </div>
        )}
        {activeDoc && (
          <div className="active-doc-pill">
            <Icon icon={FileText} size={14} /> {activeDoc.fileName}
            <span className="pill-clear" onClick={onClearDoc}><Icon icon={X} size={12} /></span>
          </div>
        )}
      </div>
    </div>
  );
}