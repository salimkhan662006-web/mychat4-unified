import { useState, useEffect } from "react";

const BACKEND_URL = "https://mychat4-backend.onrender.com";

const SETTINGS_SECTIONS = [
  { id: "usage", label: "Usage", icon: "📊" },
  { id: "limits", label: "Rate Limits", icon: "⏱️" },
  { id: "appearance", label: "Appearance", icon: "🎨" },
  { id: "account", label: "Account", icon: "👤" },
  { id: "about", label: "About", icon: "ℹ️" },
];

export default function SettingsPanel({ open, onClose, initialSection = "usage" }) {
  const [activeSection, setActiveSection] = useState(initialSection);
  const [usage, setUsage] = useState(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState("");

  const [limits, setLimits] = useState(null);
  const [limitsLoading, setLimitsLoading] = useState(false);
  const [limitsError, setLimitsError] = useState("");

  useEffect(() => {
    setActiveSection(initialSection);
  }, [initialSection, open]);

  useEffect(() => {
    if (open && activeSection === "usage" && !usage) {
      fetchUsage();
    }
    if (open && activeSection === "limits") {
      fetchLimits();
    }
  }, [open, activeSection]);

  async function fetchLimits() {
    setLimitsLoading(true);
    setLimitsError("");
    try {
      const res = await fetch(`${BACKEND_URL}/rate-limits`);
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();
      setLimits(data);
    } catch (err) {
      setLimitsError(err.message);
    } finally {
      setLimitsLoading(false);
    }
  }

  async function fetchUsage() {
    setUsageLoading(true);
    setUsageError("");
    try {
      const res = await fetch(`${BACKEND_URL}/usage`);
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();
      setUsage(data);
    } catch (err) {
      setUsageError(err.message);
    } finally {
      setUsageLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-sidebar">
          <div className="settings-title">Settings</div>
          {SETTINGS_SECTIONS.map((s) => (
            <div
              key={s.id}
              className={`settings-nav-item ${activeSection === s.id ? "active" : ""}`}
              onClick={() => setActiveSection(s.id)}
            >
              <span>{s.icon}</span>
              <span>{s.label}</span>
            </div>
          ))}
        </div>

        <div className="settings-content">
          <div className="settings-content-header">
            <div className="settings-content-title">
              {SETTINGS_SECTIONS.find((s) => s.id === activeSection)?.label}
            </div>
            <div className="settings-close" onClick={onClose}>✕</div>
          </div>

          {activeSection === "usage" && (
            <div className="settings-body">
              {usageLoading && (
                <div className="usage-loading">Loading usage data…</div>
              )}

              {usageError && (
                <div className="usage-error">
                  Couldn't load usage data: {usageError}
                  <div className="usage-retry" onClick={fetchUsage}>Retry</div>
                </div>
              )}

              {usage && !usageLoading && (
                <>
                  <div className="usage-summary-grid">
                    <div className="usage-stat-card">
                      <div className="usage-stat-value">{usage.total_requests.toLocaleString()}</div>
                      <div className="usage-stat-label">Total requests</div>
                    </div>
                    <div className="usage-stat-card">
                      <div className="usage-stat-value">{usage.total_tokens.toLocaleString()}</div>
                      <div className="usage-stat-label">Total tokens</div>
                    </div>
                    <div className="usage-stat-card">
                      <div className="usage-stat-value">{usage.total_prompt_tokens.toLocaleString()}</div>
                      <div className="usage-stat-label">Prompt tokens</div>
                    </div>
                    <div className="usage-stat-card">
                      <div className="usage-stat-value">{usage.total_completion_tokens.toLocaleString()}</div>
                      <div className="usage-stat-label">Response tokens</div>
                    </div>
                  </div>

                  <div className="usage-section-label">By provider</div>
                  <div className="usage-provider-list">
                    {Object.entries(usage.by_provider).map(([provider, stats]) => (
                      <div key={provider} className="usage-provider-row">
                        <div className="usage-provider-name">{provider}</div>
                        <div className="usage-provider-bar-track">
                          <div
                            className="usage-provider-bar-fill"
                            style={{
                              width: `${(stats.requests / usage.total_requests) * 100}%`,
                            }}
                          ></div>
                        </div>
                        <div className="usage-provider-stats">
                          {stats.requests} req · {stats.tokens.toLocaleString()} tok
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="usage-section-label">By feature</div>
                  <div className="usage-provider-list">
                    {Object.entries(usage.by_endpoint).map(([endpoint, stats]) => (
                      <div key={endpoint} className="usage-provider-row">
                        <div className="usage-provider-name">
                          {endpoint === "chat" ? "💬 Chat" : "📄 Documents"}
                        </div>
                        <div className="usage-provider-bar-track">
                          <div
                            className="usage-provider-bar-fill alt"
                            style={{
                              width: `${(stats.requests / usage.total_requests) * 100}%`,
                            }}
                          ></div>
                        </div>
                        <div className="usage-provider-stats">
                          {stats.requests} req · {stats.tokens.toLocaleString()} tok
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="usage-note">
                    Usage is tracked across all providers (Groq, Gemini, OpenRouter) and
                    persists permanently. Free-tier rate limits reset daily per provider.
                  </div>
                </>
              )}
            </div>
          )}

          {activeSection === "limits" && (
            <div className="settings-body">
              {limitsLoading && <div className="usage-loading">Loading rate limits…</div>}

              {limitsError && (
                <div className="usage-error">
                  Couldn't load rate limits: {limitsError}
                  <div className="usage-retry" onClick={fetchLimits}>Retry</div>
                </div>
              )}

              {limits && !limitsLoading && (
                <>
                  <div className="usage-note" style={{ marginTop: 0, marginBottom: 20 }}>
                    {limits.reset_note}. These are daily free-tier caps per provider —
                    when one fills up, your app automatically falls back to the next.
                  </div>

                  <div className="limits-list">
                    {Object.entries(limits.providers).map(([provider, stats]) => {
                      const isHigh = stats.percent_used >= 80;
                      const isMid = stats.percent_used >= 50 && stats.percent_used < 80;
                      return (
                        <div key={provider} className="limit-card">
                          <div className="limit-card-header">
                            <span className="limit-provider-name">{provider}</span>
                            <span className={`limit-percent ${isHigh ? "high" : isMid ? "mid" : "low"}`}>
                              {stats.percent_used}%
                            </span>
                          </div>
                          <div className="limit-bar-track">
                            <div
                              className={`limit-bar-fill ${isHigh ? "high" : isMid ? "mid" : "low"}`}
                              style={{ width: `${Math.min(stats.percent_used, 100)}%` }}
                            ></div>
                          </div>
                          <div className="limit-card-footer">
                            <span>{stats.used.toLocaleString()} used</span>
                            <span>{stats.remaining.toLocaleString()} remaining of {stats.cap.toLocaleString()}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {activeSection === "appearance" && (
            <div className="settings-body">
              <div className="settings-placeholder">
                Appearance settings — theme and animation controls coming soon.
              </div>
            </div>
          )}

          {activeSection === "account" && (
            <div className="settings-body">
              <div className="settings-placeholder">
                Account settings — coming soon.
              </div>
            </div>
          )}

          {activeSection === "about" && (
            <div className="settings-body">
              <div className="settings-placeholder">
                MyChat4 — built by Salim.<br />
                Powered by Groq, Gemini, and OpenRouter with automatic fallback.
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .settings-overlay {
          position: fixed; inset: 0; z-index: 100;
          background: rgba(0,0,0,0.7);
          display: flex; align-items: center; justify-content: center;
          backdrop-filter: blur(4px);
        }

        .settings-panel {
          width: 780px; max-width: 92vw; height: 560px; max-height: 86vh;
          background: #0a0505; border: 1px solid rgba(255,46,46,0.2);
          border-radius: 20px; display: flex; overflow: hidden;
          box-shadow: 0 0 60px rgba(255,46,46,0.15), 0 20px 60px rgba(0,0,0,0.6);
        }

        .settings-sidebar {
          width: 200px; flex-shrink: 0;
          background: rgba(255,255,255,0.02);
          border-right: 1px solid rgba(255,46,46,0.12);
          padding: 20px 12px;
        }

        .settings-title {
          font-family: 'Space Grotesk', sans-serif; font-weight: 600;
          font-size: 15px; color: #F2E8E5; padding: 4px 12px 16px;
        }

        .settings-nav-item {
          display: flex; align-items: center; gap: 10px;
          padding: 10px 12px; border-radius: 10px; cursor: pointer;
          font-size: 13px; color: #8A7570; margin-bottom: 2px;
          transition: all 0.15s;
        }

        .settings-nav-item:hover { background: rgba(255,46,46,0.06); color: #C9938D; }

        .settings-nav-item.active {
          background: rgba(255,46,46,0.14); color: #FFB3B0;
          box-shadow: inset 0 0 0 1px rgba(255,46,46,0.25);
        }

        .settings-content { flex: 1; display: flex; flex-direction: column; overflow: hidden; }

        .settings-content-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 18px 24px; border-bottom: 1px solid rgba(255,46,46,0.1);
        }

        .settings-content-title {
          font-family: 'Space Grotesk', sans-serif; font-weight: 600;
          font-size: 16px; color: #F2E8E5;
        }

        .settings-close {
          width: 28px; height: 28px; border-radius: 8px;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: #8A7570; font-size: 13px;
          border: 1px solid rgba(255,46,46,0.15); transition: all 0.15s;
        }

        .settings-close:hover { background: rgba(255,46,46,0.1); color: #FF9E9E; }

        .settings-body { flex: 1; overflow-y: auto; padding: 24px; }

        .settings-body::-webkit-scrollbar { width: 5px; }
        .settings-body::-webkit-scrollbar-thumb { background: rgba(255,46,46,0.2); border-radius: 4px; }

        .settings-placeholder {
          color: #6B5551; font-size: 13px; line-height: 1.7;
          padding: 20px; background: rgba(255,255,255,0.02);
          border-radius: 12px; border: 1px dashed rgba(255,46,46,0.15);
        }

        .usage-loading, .usage-error {
          color: #8A7570; font-size: 13px; padding: 20px; text-align: center;
        }

        .usage-error { color: #FF9E9E; }

        .usage-retry {
          display: inline-block; margin-top: 10px; padding: 6px 16px;
          background: rgba(255,46,46,0.12); border: 1px solid rgba(255,46,46,0.3);
          border-radius: 8px; cursor: pointer; color: #FFB3B0; font-size: 12px;
        }

        .usage-summary-grid {
          display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;
          margin-bottom: 28px;
        }

        .usage-stat-card {
          background: rgba(255,46,46,0.05); border: 1px solid rgba(255,46,46,0.15);
          border-radius: 12px; padding: 14px 16px;
        }

        .usage-stat-value {
          font-family: 'Space Grotesk', sans-serif; font-size: 22px; font-weight: 700;
          color: #F2E0DC; letter-spacing: -0.02em;
        }

        .usage-stat-label { font-size: 11px; color: #8A7570; margin-top: 4px; }

        .usage-section-label {
          font-size: 11px; font-weight: 600; color: #6B5551;
          text-transform: uppercase; letter-spacing: 0.08em;
          margin: 20px 0 10px;
        }

        .usage-provider-list { display: flex; flex-direction: column; gap: 10px; }

        .usage-provider-row {
          display: flex; align-items: center; gap: 12px;
          background: rgba(255,255,255,0.02); border: 1px solid rgba(255,46,46,0.1);
          border-radius: 10px; padding: 10px 14px;
        }

        .usage-provider-name {
          width: 90px; flex-shrink: 0; font-size: 12.5px; font-weight: 500;
          color: #E0A8A3; text-transform: capitalize;
        }

        .usage-provider-bar-track {
          flex: 1; height: 6px; background: rgba(255,255,255,0.05);
          border-radius: 4px; overflow: hidden;
        }

        .usage-provider-bar-fill {
          height: 100%; background: linear-gradient(90deg, #FF2E2E, #8B1A1A);
          border-radius: 4px; transition: width 0.4s ease;
        }

        .usage-provider-bar-fill.alt {
          background: linear-gradient(90deg, #FF6B6B, #C93A3A);
        }

        .usage-provider-stats {
          font-size: 11px; color: #8A7570; font-family: monospace;
          white-space: nowrap; width: 130px; text-align: right; flex-shrink: 0;
        }

        .usage-note {
          margin-top: 24px; font-size: 11.5px; color: #6B5551;
          line-height: 1.6; padding: 14px 16px;
          background: rgba(255,255,255,0.02); border-radius: 10px;
        }

        .limits-list { display: flex; flex-direction: column; gap: 14px; }

        .limit-card {
          background: rgba(255,255,255,0.02); border: 1px solid rgba(255,46,46,0.12);
          border-radius: 12px; padding: 16px;
        }

        .limit-card-header {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 10px;
        }

        .limit-provider-name {
          font-family: 'Space Grotesk', sans-serif; font-weight: 600;
          font-size: 14px; color: #F2E0DC; text-transform: capitalize;
        }

        .limit-percent { font-size: 13px; font-weight: 600; font-family: monospace; }
        .limit-percent.low { color: #6BC98A; }
        .limit-percent.mid { color: #E0B84A; }
        .limit-percent.high { color: #FF6B6B; }

        .limit-bar-track {
          height: 8px; background: rgba(255,255,255,0.05);
          border-radius: 5px; overflow: hidden; margin-bottom: 10px;
        }

        .limit-bar-fill {
          height: 100%; border-radius: 5px; transition: width 0.4s ease;
        }

        .limit-bar-fill.low { background: linear-gradient(90deg, #4ADE80, #22C55E); }
        .limit-bar-fill.mid { background: linear-gradient(90deg, #FBBF24, #E0B84A); }
        .limit-bar-fill.high { background: linear-gradient(90deg, #FF6B6B, #C93A3A); }

        .limit-card-footer {
          display: flex; justify-content: space-between;
          font-size: 11px; color: #8A7570; font-family: monospace;
        }
      `}</style>
    </div>
  );
}