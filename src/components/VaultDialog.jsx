// Passphrase dialog for the Encrypted Incognito Vault.
// mode: "setup" | "unlock" | "erase"
// onSetup(passphrase) / onUnlock(passphrase) / onErase() return promises;
// a thrown Error's message is shown to the person.

import { useState } from "react";

const MIN_LEN = 8;

export default function VaultDialog({ mode, onSetup, onUnlock, onErase, onClose }) {
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [eraseText, setEraseText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!mode) return null;

  async function run(fn) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  function submitSetup(e) {
    e.preventDefault();
    if (pass.length < MIN_LEN) return setError(`Use at least ${MIN_LEN} characters.`);
    if (pass !== pass2) return setError("The two passphrases don't match.");
    if (!understood) return setError("Please tick the box to confirm you understand.");
    run(() => onSetup(pass));
  }

  function submitUnlock(e) {
    e.preventDefault();
    if (!pass) return setError("Enter your passphrase.");
    run(() => onUnlock(pass));
  }

  function submitErase(e) {
    e.preventDefault();
    if (eraseText !== "ERASE") return;
    run(() => onErase());
  }

  return (
    <div className="vault-overlay" onClick={busy ? undefined : onClose}>
      <div className="vault-dialog" onClick={(e) => e.stopPropagation()}>
        {mode === "setup" && (
          <form onSubmit={submitSetup}>
            <div className="vault-title">🔐 Set up your vault</div>
            <div className="vault-desc">
              Choose a passphrase. Your incognito chats will be encrypted on this
              device with it, so they survive closing the app without ever reaching
              our servers.
            </div>
            <div className="vault-warning">
              <strong>There is no reset.</strong> If you forget this passphrase, your
              vault chats are unrecoverable. The only way out is "Erase vault".
            </div>
            <input
              className="vault-input"
              type="password"
              placeholder={`Passphrase (min ${MIN_LEN} characters)`}
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              autoFocus
              autoComplete="new-password"
            />
            <input
              className="vault-input"
              type="password"
              placeholder="Type it again"
              value={pass2}
              onChange={(e) => setPass2(e.target.value)}
              autoComplete="new-password"
            />
            <label className="vault-check">
              <input
                type="checkbox"
                checked={understood}
                onChange={(e) => setUnderstood(e.target.checked)}
              />
              <span>I understand a forgotten passphrase cannot be recovered.</span>
            </label>
            <div className="vault-limits">
              Protects against someone browsing this device's browser storage. It does
              not protect against malware or a keylogger on the device, and a short or
              guessable passphrase can be cracked offline.
            </div>
            {error && <div className="vault-error">{error}</div>}
            <div className="vault-actions">
              <button type="button" className="vault-btn ghost" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button type="submit" className="vault-btn primary" disabled={busy}>
                {busy ? "Working…" : "Create vault"}
              </button>
            </div>
          </form>
        )}

        {mode === "unlock" && (
          <form onSubmit={submitUnlock}>
            <div className="vault-title">🔓 Unlock your vault</div>
            <div className="vault-desc">
              Enter your passphrase to bring your saved incognito chats back.
            </div>
            <input
              className="vault-input"
              type="password"
              placeholder="Passphrase"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              autoFocus
              autoComplete="current-password"
            />
            {error && <div className="vault-error">{error}</div>}
            <div className="vault-actions">
              <button type="button" className="vault-btn ghost" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button type="submit" className="vault-btn primary" disabled={busy}>
                {busy ? "Unlocking…" : "Unlock"}
              </button>
            </div>
            <div className="vault-link" onClick={() => !busy && setPass("") }>
              Forgot it? There is no reset — close this and choose "Erase" to start fresh.
            </div>
          </form>
        )}

        {mode === "erase" && (
          <form onSubmit={submitErase}>
            <div className="vault-title">🗑 Erase vault</div>
            <div className="vault-desc">
              This permanently deletes every encrypted chat in your vault and the
              vault itself. It cannot be undone.
            </div>
            <input
              className="vault-input"
              placeholder='Type "ERASE" to confirm'
              value={eraseText}
              onChange={(e) => setEraseText(e.target.value)}
              autoFocus
            />
            {error && <div className="vault-error">{error}</div>}
            <div className="vault-actions">
              <button type="button" className="vault-btn ghost" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button
                type="submit"
                className="vault-btn danger"
                disabled={eraseText !== "ERASE" || busy}
              >
                {busy ? "Erasing…" : "Erase vault"}
              </button>
            </div>
          </form>
        )}
      </div>

      <style>{`
        .vault-overlay {
          position: fixed; inset: 0; z-index: 130;
          background: rgba(0,0,0,0.78); backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center;
        }
        .vault-dialog {
          width: 440px; max-width: 90vw; max-height: 90vh; overflow-y: auto;
          background: #0a0505; border: 1px solid rgba(255,46,46,0.25);
          border-radius: 18px; padding: 28px;
          box-shadow: 0 0 60px rgba(255,46,46,0.15);
        }
        .vault-title {
          font-family: 'Space Grotesk', sans-serif; font-weight: 600;
          font-size: 16px; color: #F2E8E5; margin-bottom: 8px;
        }
        .vault-desc { font-size: 12.5px; color: #8A7570; line-height: 1.55; margin-bottom: 14px; }
        .vault-warning {
          font-size: 12px; color: #FFB3B0; line-height: 1.5; margin-bottom: 14px;
          background: rgba(255,46,46,0.1); border: 1px solid rgba(255,46,46,0.35);
          border-radius: 10px; padding: 10px 14px;
        }
        .vault-input {
          width: 100%; margin-bottom: 10px;
          background: rgba(255,255,255,0.03); border: 1px solid rgba(255,46,46,0.25);
          border-radius: 10px; padding: 11px 14px; color: #EDE2DE; font-size: 13px;
          font-family: inherit; outline: none;
        }
        .vault-input:focus { border-color: rgba(255,46,46,0.55); }
        .vault-input::placeholder { color: #5A4844; }
        .vault-check {
          display: flex; align-items: flex-start; gap: 8px; margin: 4px 0 12px;
          font-size: 12px; color: #C9B8B4; cursor: pointer; line-height: 1.4;
        }
        .vault-check input { margin-top: 2px; accent-color: #FF2E2E; }
        .vault-limits { font-size: 11px; color: #6B5551; line-height: 1.55; margin-bottom: 14px; }
        .vault-error {
          font-size: 12px; color: #FF9E9E; margin-bottom: 12px;
          background: rgba(255,46,46,0.08); border: 1px solid rgba(255,46,46,0.3);
          border-radius: 8px; padding: 9px 12px;
        }
        .vault-actions { display: flex; gap: 8px; justify-content: flex-end; }
        .vault-btn {
          padding: 10px 18px; border-radius: 10px; font-size: 12.5px; font-weight: 600;
          cursor: pointer; font-family: inherit; border: 1px solid transparent;
        }
        .vault-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .vault-btn.primary {
          background: linear-gradient(135deg, #FF2E2E, #8B1A1A); color: #0a0202;
          box-shadow: 0 0 16px rgba(255,46,46,0.3);
        }
        .vault-btn.ghost {
          background: rgba(255,255,255,0.03); border-color: rgba(255,46,46,0.2); color: #C9938D;
        }
        .vault-btn.danger {
          background: rgba(255,46,46,0.15); border-color: rgba(255,46,46,0.45); color: #FFB3B0;
        }
        .vault-link { margin-top: 14px; font-size: 11px; color: #6B5551; text-align: center; line-height: 1.5; }
      `}</style>
    </div>
  );
}