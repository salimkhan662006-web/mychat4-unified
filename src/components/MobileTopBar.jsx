// Phone top bar: avatar + incognito on the left, model picker + menu on the right.
import { useState, useEffect, useRef } from "react";
import { VenetianMask, Menu, Settings, User, Activity, Timer, LogOut, Package, FileText, X } from "lucide-react";
import Icon from "./Icon";
import ModelPicker from "./ModelPicker";
import { useAuth } from "../AuthContext";

export default function MobileTopBar({
  user, isIncognito, onToggleIncognito, onOpenHistory, onOpenSettings,
  boxAttached, onDetachBox, activeDoc, onClearDoc,
  models, frontierInfo, selectedModel, onSelectModel, modelDisabled,
}) {
  const { signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener("pointerdown", onOutside);
    return () => document.removeEventListener("pointerdown", onOutside);
  }, [menuOpen]);

  const meta = user?.user_metadata || {};
  const avatarUrl = meta.avatar_url || meta.picture || "";
  const initial = String(meta.full_name || meta.name || user?.email || "?").trim()[0]?.toUpperCase() || "?";

  function go(section) {
    setMenuOpen(false);
    onOpenSettings(section);
  }

  return (
    <div className="mobile-top" ref={wrapRef}>
      <div className="mt-row">
        <div className="mt-left">
          <div className="mt-avatar" onClick={() => setMenuOpen((o) => !o)} title="Account">
            {avatarUrl && !imgFailed ? (
              <img src={avatarUrl} alt="" referrerPolicy="no-referrer" onError={() => setImgFailed(true)} />
            ) : (
              initial
            )}
          </div>
          <div
            className={`mt-btn ${isIncognito ? "active" : ""}`}
            onClick={onToggleIncognito}
            title={isIncognito ? "End incognito session" : "Start incognito chat"}
          >
            <Icon icon={VenetianMask} size={18} />
          </div>
        </div>
        <div className="mt-right">
          <ModelPicker
            models={models}
            frontierInfo={frontierInfo}
            value={selectedModel}
            onChange={onSelectModel}
            disabled={modelDisabled}
          />
          <div className="mt-btn" onClick={onOpenHistory} title="Chats and menu">
            <Icon icon={Menu} size={18} />
          </div>
        </div>
      </div>

      {(boxAttached || activeDoc) && (
        <div className="mt-pills">
          {boxAttached && (
            <div className="active-doc-pill">
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
      )}

      {menuOpen && (
        <div className="mt-menu">
          <div className="mt-menu-email">{user?.email}</div>
          <div className="mt-menu-item" onClick={() => go("appearance")}><Icon icon={Settings} size={16} />Settings</div>
          <div className="mt-menu-item" onClick={() => go("account")}><Icon icon={User} size={16} />Account</div>
          <div className="mt-menu-item" onClick={() => go("usage")}><Icon icon={Activity} size={16} />Usage</div>
          <div className="mt-menu-item" onClick={() => go("limits")}><Icon icon={Timer} size={16} />Rate limits</div>
          <div className="mt-menu-item" onClick={() => { setMenuOpen(false); signOut(); }}><Icon icon={LogOut} size={16} />Log out</div>
        </div>
      )}
    </div>
  );
}