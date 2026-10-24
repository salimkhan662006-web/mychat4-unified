// The rail on the left: history, new chat, incognito, import, boxes,
// and the usage / account / settings shortcuts.
import { MessageSquare, Plus, VenetianMask, Package, Download, Timer, Activity, User, Settings } from "lucide-react";
import Icon from "./Icon";

export default function HistoryRail({
  isIncognito, importFileRef, onOpenHistory, onNewChat, onStartIncognito,
  onImportFile, onOpenSettings, onOpenBoxes,
}) {
  return (
    <div className="history-rail">
      <div className="history-curve"></div>
      <div className="history-logo" onClick={onOpenHistory} title="Chat history">IA</div>
      <div className="history-items">
        <div className={`history-dot ${!isIncognito ? "active" : ""}`} title="Chat history" onClick={onOpenHistory}>
          <Icon icon={MessageSquare} />
        </div>
        <div className="history-dot" title="New chat" onClick={onNewChat}><Icon icon={Plus} /></div>
        <div className={`history-dot ${isIncognito ? "active incognito" : ""}`} title="Incognito chat" onClick={onStartIncognito}>
          <Icon icon={VenetianMask} />
        </div>
        <div className="history-dot" title="Boxes" onClick={onOpenBoxes}><Icon icon={Package} /></div>
        <label className="history-dot" title="Import a saved .mchat file">
          <Icon icon={Download} />
          <input ref={importFileRef} type="file" accept=".mchat,.txt" onChange={onImportFile} style={{ display: "none" }} />
        </label>
      </div>
      <div className="history-rail-bottom">
        <div className="history-dot" title="Rate limits" onClick={() => onOpenSettings("limits")}><Icon icon={Timer} /></div>
        <div className="history-dot" title="Usage" onClick={() => onOpenSettings("usage")}><Icon icon={Activity} /></div>
        <div className="history-dot" title="Account" onClick={() => onOpenSettings("account")}><Icon icon={User} /></div>
        <div className="history-dot" title="Settings" onClick={() => onOpenSettings("appearance")}><Icon icon={Settings} /></div>
      </div>
    </div>
  );
}