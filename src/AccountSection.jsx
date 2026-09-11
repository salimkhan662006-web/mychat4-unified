import { useState, useEffect } from "react";
import { useAuth } from "./AuthContext";
import { getAccountSummary, resetAccountData, requestAccountDeletion } from "./api";

export default function AccountSection() {
  const { user, signOut } = useAuth();
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState("");

  const [resetConfirmText, setResetConfirmText] = useState("");
  const [resetting, setResetting] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteRequested, setDeleteRequested] = useState(false);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    fetchSummary();
  }, []);

  async function fetchSummary() {
    setSummaryLoading(true);
    setSummaryError("");
    try {
      const data = await getAccountSummary();
      setSummary(data);
    } catch (err) {
      setSummaryError(err.message);
    } finally {
      setSummaryLoading(false);
    }
  }

  async function handleReset() {
    if (resetConfirmText !== "RESET") return;
    setResetting(true);
    setActionError("");
    try {
      await resetAccountData();
      setResetDone(true);
      setResetConfirmText("");
      fetchSummary();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setResetting(false);
    }
  }

  async function handleDeleteRequest() {
    if (deleteConfirmText !== "DELETE") return;
    setDeleting(true);
    setActionError("");
    try {
      await requestAccountDeletion();
      setDeleteRequested(true);
      setDeleteConfirmText("");
    } catch (err) {
      setActionError(err.message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="settings-body">
      {/* Identity */}
      <div className="acc-section">
        <div className="acc-section-title">Signed in as</div>
        <div className="acc-identity-card">
          <div className="acc-avatar">{user.email?.[0]?.toUpperCase() || "?"}</div>
          <div>
            <div className="acc-email">{user.email}</div>
            <div className="acc-meta">
              Account created {new Date(user.created_at).toLocaleDateString()}
            </div>
          </div>
          <div className="acc-logout-btn" onClick={signOut}>Log out</div>
        </div>
      </div>

      {/* Data transparency */}
      <div className="acc-section">
        <div className="acc-section-title">What we store, and why</div>
        <div className="acc-transparency-card">
          <div className="acc-transparency-row">
            <span className="acc-transparency-icon">💬</span>
            <div>
              <div className="acc-transparency-label">Your conversations & messages</div>
              <div className="acc-transparency-desc">
                Stored so your chat history persists across devices and sessions. Never
                used to train any AI model, never shared with anyone.
              </div>
            </div>
          </div>
          <div className="acc-transparency-row">
            <span className="acc-transparency-icon">📊</span>
            <div>
              <div className="acc-transparency-label">Usage & token counts</div>
              <div className="acc-transparency-desc">
                Which AI provider answered each request and how many tokens it used —
                powers the Usage and Rate Limits screens. No message content is
                included in this data.
              </div>
            </div>
          </div>
          <div className="acc-transparency-row">
            <span className="acc-transparency-icon">🔑</span>
            <div>
              <div className="acc-transparency-label">Login identity</div>
              <div className="acc-transparency-desc">
                Your email (and, for Google sign-in, basic profile info from Google) —
                handled entirely by Supabase Auth. We never see or store your password.
              </div>
            </div>
          </div>
          <div className="acc-transparency-row">
            <span className="acc-transparency-icon">🚫</span>
            <div>
              <div className="acc-transparency-label">Incognito chats</div>
              <div className="acc-transparency-desc">
                Never written to any database, ever — they exist only in your browser's
                memory for that session.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Data summary */}
      <div className="acc-section">
        <div className="acc-section-title">Your data, right now</div>
        {summaryLoading && <div className="acc-loading">Loading…</div>}
        {summaryError && <div className="acc-error">{summaryError}</div>}
        {summary && !summaryLoading && (
          <div className="acc-summary-grid">
            <div className="acc-summary-stat">
              <div className="acc-summary-value">{summary.conversation_count}</div>
              <div className="acc-summary-label">Conversations</div>
            </div>
            <div className="acc-summary-stat">
              <div className="acc-summary-value">{summary.message_count}</div>
              <div className="acc-summary-label">Messages</div>
            </div>
            <div className="acc-summary-stat">
              <div className="acc-summary-value">{summary.total_tokens_used.toLocaleString()}</div>
              <div className="acc-summary-label">Tokens used total</div>
            </div>
          </div>
        )}
      </div>

      {actionError && <div className="acc-error" style={{ marginBottom: 16 }}>{actionError}</div>}

      {/* Reset data */}
      <div className="acc-section danger">
        <div className="acc-section-title">Reset data</div>
        <div className="acc-danger-desc">
          Permanently deletes all your conversations, messages, and usage history.
          Your account and login stay intact — this just wipes the slate clean.
        </div>
        {resetDone ? (
          <div className="acc-success">✓ All your data has been reset.</div>
        ) : (
          <div className="acc-confirm-row">
            <input
              className="acc-confirm-input"
              placeholder='Type "RESET" to confirm'
              value={resetConfirmText}
              onChange={(e) => setResetConfirmText(e.target.value)}
            />
            <button
              className="acc-danger-btn"
              disabled={resetConfirmText !== "RESET" || resetting}
              onClick={handleReset}
            >
              {resetting ? "Resetting…" : "Reset all data"}
            </button>
          </div>
        )}
      </div>

      {/* Delete account */}
      <div className="acc-section danger">
        <div className="acc-section-title">Delete account</div>
        <div className="acc-danger-desc">
          Permanently deletes your account and all associated data. This cannot be
          undone. We'll email you a confirmation link — nothing is deleted until you
          click it.
        </div>
        {deleteRequested ? (
          <div className="acc-success">
            ✓ Check your email — click the link we sent to finish deleting your account.
          </div>
        ) : (
          <div className="acc-confirm-row">
            <input
              className="acc-confirm-input"
              placeholder='Type "DELETE" to confirm'
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
            />
            <button
              className="acc-danger-btn severe"
              disabled={deleteConfirmText !== "DELETE" || deleting}
              onClick={handleDeleteRequest}
            >
              {deleting ? "Sending…" : "Delete account"}
            </button>
          </div>
        )}
      </div>

      <style>{`
        .acc-section { margin-bottom: 26px; }
        .acc-section.danger { padding-top: 4px; }

        .acc-section-title {
          font-size: 11px; font-weight: 600; color: #6B5551;
          text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 10px;
        }

        .acc-identity-card {
          display: flex; align-items: center; gap: 12px;
          background: rgba(255,255,255,0.02); border: 1px solid rgba(255,46,46,0.15);
          border-radius: 12px; padding: 14px 16px;
        }

        .acc-avatar {
          width: 40px; height: 40px; border-radius: 50%; flex-shrink: 0;
          background: radial-gradient(circle at 30% 30%, #FF4444, #8B1A1A 70%);
          display: flex; align-items: center; justify-content: center;
          font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 15px;
          color: #0a0202;
        }

        .acc-email { font-size: 13px; font-weight: 500; color: #F2E0DC; }
        .acc-meta { font-size: 11px; color: #6B5551; margin-top: 2px; }

        .acc-logout-btn {
          margin-left: auto; font-size: 11.5px; color: #E0A8A3; cursor: pointer;
          padding: 6px 12px; border: 1px solid rgba(255,46,46,0.25); border-radius: 8px;
        }

        .acc-logout-btn:hover { background: rgba(255,46,46,0.1); }

        .acc-transparency-card {
          background: rgba(255,255,255,0.02); border: 1px solid rgba(255,46,46,0.12);
          border-radius: 12px; padding: 6px 16px;
        }

        .acc-transparency-row {
          display: flex; gap: 12px; padding: 14px 0;
          border-bottom: 1px solid rgba(255,46,46,0.08);
        }

        .acc-transparency-row:last-child { border-bottom: none; }

        .acc-transparency-icon { font-size: 16px; flex-shrink: 0; margin-top: 1px; }

        .acc-transparency-label { font-size: 12.5px; font-weight: 600; color: #E0D0CC; margin-bottom: 3px; }
        .acc-transparency-desc { font-size: 11.5px; color: #6B5551; line-height: 1.55; }

        .acc-loading, .acc-error { font-size: 12px; color: #8A7570; }
        .acc-error { color: #FF9E9E; }

        .acc-summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }

        .acc-summary-stat {
          background: rgba(255,46,46,0.05); border: 1px solid rgba(255,46,46,0.15);
          border-radius: 12px; padding: 14px; text-align: center;
        }

        .acc-summary-value {
          font-family: 'Space Grotesk', sans-serif; font-size: 20px; font-weight: 700; color: #F2E0DC;
        }

        .acc-summary-label { font-size: 10.5px; color: #8A7570; margin-top: 4px; }

        .acc-danger-desc { font-size: 12px; color: #8A7570; line-height: 1.6; margin-bottom: 12px; }

        .acc-confirm-row { display: flex; gap: 8px; }

        .acc-confirm-input {
          flex: 1; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,46,46,0.25);
          border-radius: 10px; padding: 10px 14px; color: #EDE2DE; font-size: 12.5px;
          font-family: inherit; outline: none;
        }

        .acc-confirm-input::placeholder { color: #5A4844; }

        .acc-danger-btn {
          padding: 10px 18px; border-radius: 10px; border: 1px solid rgba(255,46,46,0.4);
          background: rgba(255,46,46,0.12); color: #FFB3B0; font-size: 12.5px;
          font-weight: 600; cursor: pointer; font-family: inherit; white-space: nowrap;
        }

        .acc-danger-btn:disabled { opacity: 0.35; cursor: not-allowed; }
        .acc-danger-btn:not(:disabled):hover { background: rgba(255,46,46,0.22); }

        .acc-danger-btn.severe {
          background: linear-gradient(135deg, #FF2E2E, #8B1A1A); color: #0a0202; border: none;
        }

        .acc-success {
          font-size: 12.5px; color: #6BC98A; background: rgba(74,222,128,0.08);
          border: 1px solid rgba(74,222,128,0.3); border-radius: 10px; padding: 12px 14px;
        }
      `}</style>
    </div>
  );
}