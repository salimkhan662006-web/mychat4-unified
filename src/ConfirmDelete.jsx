import { useState, useEffect } from "react";
import { confirmAccountDeletion } from "./api";

export default function ConfirmDelete() {
  const [status, setStatus] = useState("confirming"); // confirming | success | error
  const [message, setMessage] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    if (!token) {
      setStatus("error");
      setMessage("No deletion token found in this link.");
      return;
    }

    confirmAccountDeletion(token)
      .then((data) => {
        setStatus("success");
        setMessage(data.message);
      })
      .catch((err) => {
        setStatus("error");
        setMessage(err.message);
      });
  }, []);

  return (
    <div className="cd-root">
      <div className="cd-card">
        <div className="cd-logo">M4</div>

        {status === "confirming" && (
          <>
            <div className="cd-title">Deleting your account…</div>
            <div className="cd-desc">Please wait a moment.</div>
          </>
        )}

        {status === "success" && (
          <>
            <div className="cd-icon success">✓</div>
            <div className="cd-title">Account deleted</div>
            <div className="cd-desc">{message}</div>
          </>
        )}

        {status === "error" && (
          <>
            <div className="cd-icon error">✕</div>
            <div className="cd-title">Something went wrong</div>
            <div className="cd-desc">{message}</div>
          </>
        )}
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=Inter:wght@400;500&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }

        .cd-root {
          background: #000; min-height: 100vh; display: flex;
          align-items: center; justify-content: center;
          font-family: 'Inter', sans-serif; color: #E8E0DC;
        }

        .cd-card {
          width: 360px; max-width: 90vw; text-align: center;
          background: rgba(10,5,5,0.9); border: 1px solid rgba(255,46,46,0.2);
          border-radius: 20px; padding: 40px 32px;
          box-shadow: 0 0 60px rgba(255,46,46,0.12);
        }

        .cd-logo {
          width: 48px; height: 48px; border-radius: 50%; margin: 0 auto 20px;
          background: radial-gradient(circle at 30% 30%, #FF4444, #8B1A1A 70%);
          display: flex; align-items: center; justify-content: center;
          font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 17px;
          color: #0a0202;
        }

        .cd-icon {
          width: 44px; height: 44px; border-radius: 50%; margin: 0 auto 16px;
          display: flex; align-items: center; justify-content: center; font-size: 20px;
        }

        .cd-icon.success { background: rgba(74,222,128,0.15); color: #6BC98A; }
        .cd-icon.error { background: rgba(255,46,46,0.15); color: #FF6B6B; }

        .cd-title {
          font-family: 'Space Grotesk', sans-serif; font-weight: 600;
          font-size: 17px; margin-bottom: 8px; color: #F2E8E5;
        }

        .cd-desc { font-size: 13px; color: #8A7570; line-height: 1.6; }
      `}</style>
    </div>
  );
}