import { useState } from "react";
import { useAuth } from "./AuthContext";

export default function AuthScreen() {
  const { signInWithEmail, signUpWithEmail, signInWithGoogle } = useAuth();
  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      if (mode === "signup") {
        await signUpWithEmail(email, password);
        setMessage("Account created! Check your email to confirm, then log in.");
        setMode("login");
      } else {
        await signInWithEmail(email, password);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setError("");
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="auth-root">
      <div className="smoke-layer">
        <div className="smoke-blob smoke-1"></div>
        <div className="smoke-blob smoke-2"></div>
        <div className="smoke-blob smoke-3"></div>
      </div>
      <div className="grain"></div>

      <div className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo-orb">M4</div>
          <div className="auth-brand-mark">
            MyChat<span>4</span>
          </div>
        </div>

        <div className="auth-tabs">
          <div
            className={`auth-tab ${mode === "login" ? "active" : ""}`}
            onClick={() => { setMode("login"); setError(""); setMessage(""); }}
          >
            Log in
          </div>
          <div
            className={`auth-tab ${mode === "signup" ? "active" : ""}`}
            onClick={() => { setMode("signup"); setError(""); setMessage(""); }}
          >
            Sign up
          </div>
        </div>

        <div className="google-btn" onClick={handleGoogle}>
          <span className="google-icon">G</span>
          Continue with Google
        </div>

        <div className="auth-divider"><span>or</span></div>

        <form onSubmit={handleSubmit} className="auth-form">
          <input
            className="auth-input"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="auth-input"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />

          {error && <div className="auth-error">{error}</div>}
          {message && <div className="auth-message">{message}</div>}

          <button className="auth-submit" type="submit" disabled={loading}>
            {loading ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
          </button>
        </form>

        <div className="auth-footer">
          {mode === "login" ? (
            <>Don't have an account? <span onClick={() => setMode("signup")}>Sign up</span></>
          ) : (
            <>Already have an account? <span onClick={() => setMode("login")}>Log in</span></>
          )}
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap');

        * { margin: 0; padding: 0; box-sizing: border-box; }

        .auth-root {
          background: #000000;
          font-family: 'Inter', sans-serif;
          color: #E8E0DC;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          overflow: hidden;
        }

        .smoke-layer { position: fixed; inset: 0; z-index: 0; overflow: hidden; pointer-events: none; }
        .smoke-blob { position: absolute; border-radius: 50%; filter: blur(80px); opacity: 0.35; mix-blend-mode: screen; }

        .smoke-1 { width: 500px; height: 500px; background: radial-gradient(circle, #FF2E2E 0%, #8B1A1A 60%, transparent 75%); top: -10%; left: -5%; animation: drift1 22s ease-in-out infinite; }
        .smoke-2 { width: 600px; height: 600px; background: radial-gradient(circle, #FF4444 0%, #6B0F0F 55%, transparent 75%); bottom: -15%; right: -10%; animation: drift2 28s ease-in-out infinite; }
        .smoke-3 { width: 380px; height: 380px; background: radial-gradient(circle, #FF6B6B 0%, #7A1515 60%, transparent 75%); top: 40%; left: 50%; animation: drift3 18s ease-in-out infinite; opacity: 0.22; }

        @keyframes drift1 { 0%,100%{transform:translate(0,0) scale(1);} 33%{transform:translate(60px,40px) scale(1.15);} 66%{transform:translate(-30px,70px) scale(0.9);} }
        @keyframes drift2 { 0%,100%{transform:translate(0,0) scale(1);} 40%{transform:translate(-70px,-50px) scale(1.1);} 70%{transform:translate(40px,-30px) scale(0.95);} }
        @keyframes drift3 { 0%,100%{transform:translate(-50%,0) scale(1); opacity:0.22;} 50%{transform:translate(-50%,-40px) scale(1.3); opacity:0.32;} }

        .grain {
          position: fixed; inset: 0; z-index: 1; pointer-events: none; opacity: 0.025;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
        }

        .auth-card {
          position: relative; z-index: 2; width: 380px; max-width: 90vw;
          background: rgba(10,5,5,0.85); border: 1px solid rgba(255,46,46,0.2);
          border-radius: 20px; padding: 36px 32px;
          box-shadow: 0 0 60px rgba(255,46,46,0.12), 0 20px 60px rgba(0,0,0,0.6);
          backdrop-filter: blur(10px);
        }

        .auth-logo { display: flex; flex-direction: column; align-items: center; gap: 12px; margin-bottom: 28px; }

        .auth-logo-orb {
          width: 52px; height: 52px; border-radius: 50%;
          background: radial-gradient(circle at 30% 30%, #FF4444, #8B1A1A 70%);
          display: flex; align-items: center; justify-content: center;
          font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 19px;
          color: #0a0202; box-shadow: 0 0 28px rgba(255,46,46,0.5);
        }

        .auth-brand-mark { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 20px; letter-spacing: -0.02em; color: #F2E8E5; }
        .auth-brand-mark span { color: #FF2E2E; text-shadow: 0 0 20px rgba(255,46,46,0.6); }

        .auth-tabs {
          display: flex; background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,46,46,0.15); border-radius: 12px;
          padding: 4px; margin-bottom: 20px;
        }

        .auth-tab { flex: 1; text-align: center; padding: 9px; border-radius: 8px; font-size: 13px; font-weight: 500; color: #8A7570; cursor: pointer; transition: all 0.2s; }
        .auth-tab.active { background: linear-gradient(135deg, rgba(255,46,46,0.18), rgba(139,26,26,0.25)); color: #FFB3B0; box-shadow: inset 0 0 0 1px rgba(255,46,46,0.3); }

        .google-btn {
          display: flex; align-items: center; justify-content: center; gap: 10px;
          padding: 12px; border-radius: 12px; background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,46,46,0.2); color: #E8E0DC; font-size: 13.5px;
          font-weight: 500; cursor: pointer; transition: all 0.2s; margin-bottom: 18px;
        }

        .google-btn:hover { background: rgba(255,46,46,0.08); border-color: rgba(255,46,46,0.35); }

        .google-icon {
          width: 20px; height: 20px; border-radius: 50%; background: #fff; color: #333;
          display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700;
        }

        .auth-divider { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; font-size: 11px; color: #5A4844; }
        .auth-divider::before, .auth-divider::after { content: ''; flex: 1; height: 1px; background: rgba(255,46,46,0.15); }

        .auth-form { display: flex; flex-direction: column; gap: 12px; }

        .auth-input {
          background: rgba(255,255,255,0.03); border: 1px solid rgba(255,46,46,0.2);
          border-radius: 12px; padding: 12px 16px; color: #EDE2DE; font-size: 13.5px;
          font-family: inherit; outline: none; transition: border-color 0.2s;
        }

        .auth-input:focus { border-color: rgba(255,46,46,0.5); }
        .auth-input::placeholder { color: #5A4844; }

        .auth-error { background: rgba(255,46,46,0.1); border: 1px solid rgba(255,46,46,0.3); color: #FF9E9E; font-size: 12px; padding: 10px 14px; border-radius: 8px; }
        .auth-message { background: rgba(74,222,128,0.08); border: 1px solid rgba(74,222,128,0.3); color: #6BC98A; font-size: 12px; padding: 10px 14px; border-radius: 8px; }

        .auth-submit {
          background: linear-gradient(135deg, #FF2E2E, #8B1A1A); border: none;
          border-radius: 12px; padding: 12px; color: #0a0202; font-size: 13.5px;
          font-weight: 600; cursor: pointer; font-family: inherit;
          box-shadow: 0 0 20px rgba(255,46,46,0.3); transition: all 0.2s;
        }

        .auth-submit:disabled { opacity: 0.5; cursor: not-allowed; }
        .auth-submit:not(:disabled):hover { box-shadow: 0 0 28px rgba(255,46,46,0.45); }

        .auth-footer { text-align: center; margin-top: 20px; font-size: 12px; color: #6B5551; }
        .auth-footer span { color: #FF6B6B; cursor: pointer; font-weight: 500; }
        .auth-footer span:hover { text-decoration: underline; }
      `}</style>
    </div>
  );
}