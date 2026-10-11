// React hook that wraps vault.js so App.jsx only needs a few lines.
//
// status: "checking" | "unsupported" | "none" | "locked" | "unlocked"
//   none     = this account has no vault yet
//   locked   = a vault exists but the passphrase hasn't been entered
//   unlocked = key is in memory; incognito chats auto-save, encrypted
//
// The vault locks automatically when the logged-in user changes (logout
// or a different account) and on page reload (memory is simply gone).

import { useState, useEffect, useCallback } from "react";
import {
  isVaultSupported,
  vaultExists,
  createVault,
  unlockVault,
  lockVault,
  eraseVault,
  loadAllSessions,
  queueSave,
  removeSession,
} from "./vault.js";

export function useVault(userId) {
  const [status, setStatus] = useState("checking");
  const [dialogMode, setDialogMode] = useState(null); // "setup" | "unlock" | "erase" | null
  const [restoredSessions, setRestoredSessions] = useState([]);

  // Re-check whenever the logged-in person changes. Cleanup locks the vault,
  // so another account on the same browser can never see this one's chats.
  useEffect(() => {
    let cancelled = false;
    setRestoredSessions([]);
    setDialogMode(null);

    if (!userId) {
      setStatus("none");
      return;
    }
    if (!isVaultSupported()) {
      setStatus("unsupported");
      return;
    }

    setStatus("checking");
    vaultExists(userId)
      .then((exists) => {
        if (!cancelled) setStatus(exists ? "locked" : "none");
      })
      .catch(() => {
        if (!cancelled) setStatus("unsupported");
      });

    return () => {
      cancelled = true;
      lockVault();
    };
  }, [userId]);

  const setup = useCallback(
    async (passphrase) => {
      await createVault(userId, passphrase);
      setRestoredSessions([]);
      setStatus("unlocked");
      setDialogMode(null);
    },
    [userId]
  );

  const unlock = useCallback(
    async (passphrase) => {
      await unlockVault(userId, passphrase);
      const sessions = await loadAllSessions(userId);
      setRestoredSessions(sessions);
      setStatus("unlocked");
      setDialogMode(null);
    },
    [userId]
  );

  const lock = useCallback(async () => {
    await lockVault();
    setRestoredSessions([]);
    setStatus("locked");
  }, []);

  const erase = useCallback(async () => {
    await eraseVault(userId);
    setRestoredSessions([]);
    setStatus("none");
    setDialogMode(null);
  }, [userId]);

  // Encrypted, debounced. A no-op while locked (memory-only, as today).
  const saveSession = useCallback((session) => queueSave(session), []);

  // Standard Delete also removes the session from the vault.
  const deleteSession = useCallback(
    (sessionId) =>
      removeSession(userId, sessionId).catch((err) =>
        console.warn("Vault delete failed (non-fatal):", err.message)
      ),
    [userId]
  );

  return {
    status,
    isUnlocked: status === "unlocked",
    dialogMode,
    openDialog: setDialogMode,
    closeDialog: () => setDialogMode(null),
    restoredSessions, // [{ id, title, messages }] — filled after a successful unlock
    setup,
    unlock,
    lock,
    erase,
    saveSession,
    deleteSession,
  };
}