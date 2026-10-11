// Encrypted Incognito Vault — storage + crypto.
//
// Everything here runs in the browser. Nothing in this file ever talks to
// the backend or Supabase. Chats are encrypted with a key derived from a
// passphrase only the user knows, and the ciphertext is stored in the
// browser's IndexedDB on this device, one vault per logged-in user id.
//
// Crypto: passphrase -> PBKDF2-SHA256 (600,000 rounds, random salt)
//         -> AES-GCM 256-bit key (non-extractable), fresh random IV on
//         every save, and "<userId>|<recordId>" bound in as authenticated
//         data so a record can't be swapped between users or sessions.
//
// The key lives ONLY in this module's memory. A page reload, logout, or
// lockVault() throws it away.

const DB_NAME = "mychat4-vault";
const DB_VERSION = 1;
const META_STORE = "meta";
const SESSIONS_STORE = "sessions";

const PBKDF2_ITERATIONS = 600000;
export const MIN_PASSPHRASE_LENGTH = 8;
const CHECK_PLAINTEXT = "mychat4-vault-ok";

const enc = new TextEncoder();
const dec = new TextDecoder();

// ---------------------------------------------------------------
// In-memory state (never persisted)
// ---------------------------------------------------------------
let activeKey = null;
let activeUserId = null;
const pending = new Map(); // sessionId -> { session, timer, ctx }

export function isVaultSupported() {
  return (
    typeof indexedDB !== "undefined" &&
    typeof crypto !== "undefined" &&
    !!crypto.subtle
  );
}

export function isUnlockedFor(userId) {
  return !!activeKey && activeUserId === userId;
}

// ---------------------------------------------------------------
// IndexedDB helpers
// ---------------------------------------------------------------
let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "userId" });
      }
      if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
        const store = db.createObjectStore(SESSIONS_STORE, { keyPath: "key" });
        store.createIndex("byUser", "userId", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error || new Error("Could not open the vault database."));
    };
  });
  return dbPromise;
}

function requestToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// ---------------------------------------------------------------
// Crypto helpers
// ---------------------------------------------------------------
async function deriveKey(passphrase, salt, iterations) {
  const base = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase.normalize("NFKC")),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false, // non-extractable: the raw key bytes can never be read back out
    ["encrypt", "decrypt"]
  );
}

async function encryptBytes(key, plainBytes, aad) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: enc.encode(aad) },
    key,
    plainBytes
  );
  return { iv, data: new Uint8Array(ct) };
}

async function decryptBytes(key, record, aad) {
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: record.iv, additionalData: enc.encode(aad) },
    key,
    record.data
  );
  return new Uint8Array(pt);
}

// ---------------------------------------------------------------
// Vault lifecycle
// ---------------------------------------------------------------
export async function vaultExists(userId) {
  const db = await openDb();
  const tx = db.transaction(META_STORE, "readonly");
  const row = await requestToPromise(tx.objectStore(META_STORE).get(userId));
  return !!row;
}

export async function createVault(userId, passphrase) {
  if (!userId) throw new Error("You must be logged in to set up a vault.");
  if (!passphrase || passphrase.length < MIN_PASSPHRASE_LENGTH) {
    throw new Error(`Passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters.`);
  }
  if (await vaultExists(userId)) {
    throw new Error("A vault already exists for this account.");
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(passphrase, salt, PBKDF2_ITERATIONS);
  const check = await encryptBytes(key, enc.encode(CHECK_PLAINTEXT), `${userId}|__check__`);

  const db = await openDb();
  const tx = db.transaction(META_STORE, "readwrite");
  tx.objectStore(META_STORE).put({
    userId,
    salt,
    iterations: PBKDF2_ITERATIONS,
    check,
    createdAt: Date.now(),
  });
  await transactionDone(tx);

  activeKey = key;
  activeUserId = userId;
}

export async function unlockVault(userId, passphrase) {
  const db = await openDb();
  const tx = db.transaction(META_STORE, "readonly");
  const meta = await requestToPromise(tx.objectStore(META_STORE).get(userId));
  if (!meta) throw new Error("No vault exists for this account.");

  const key = await deriveKey(passphrase || "", meta.salt, meta.iterations);

  try {
    const bytes = await decryptBytes(key, meta.check, `${userId}|__check__`);
    if (dec.decode(bytes) !== CHECK_PLAINTEXT) throw new Error("bad check");
  } catch {
    throw new Error("Wrong passphrase.");
  }

  activeKey = key;
  activeUserId = userId;
}

/**
 * Locks the vault: flushes any save still waiting on its debounce timer
 * (so the last message isn't lost), then throws the key away.
 */
export async function lockVault() {
  const entries = [...pending.values()];
  pending.clear();
  entries.forEach((e) => clearTimeout(e.timer));

  activeKey = null;
  activeUserId = null;

  await Promise.all(
    entries.map((e) =>
      writeSession(e.ctx.userId, e.ctx.key, e.session).catch((err) =>
        console.warn("Vault flush on lock failed (non-fatal):", err.message)
      )
    )
  );
}

/**
 * Erases the vault for this user: every encrypted chat and the vault
 * record itself. Pending saves are discarded, not written.
 */
export async function eraseVault(userId) {
  pending.forEach((e) => clearTimeout(e.timer));
  pending.clear();
  if (activeUserId === userId) {
    activeKey = null;
    activeUserId = null;
  }

  const db = await openDb();
  const tx = db.transaction([META_STORE, SESSIONS_STORE], "readwrite");
  tx.objectStore(META_STORE).delete(userId);

  const sessions = tx.objectStore(SESSIONS_STORE);
  const cursorReq = sessions.index("byUser").openKeyCursor(IDBKeyRange.only(userId));
  cursorReq.onsuccess = () => {
    const cursor = cursorReq.result;
    if (cursor) {
      sessions.delete(cursor.primaryKey);
      cursor.continue();
    }
  };
  await transactionDone(tx);
}

// ---------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------
async function writeSession(userId, key, session) {
  const payload = {
    id: session.id,
    title: session.title,
    messages: session.messages,
  };
  const { iv, data } = await encryptBytes(
    key,
    enc.encode(JSON.stringify(payload)),
    `${userId}|${session.id}`
  );

  const db = await openDb();
  const tx = db.transaction(SESSIONS_STORE, "readwrite");
  tx.objectStore(SESSIONS_STORE).put({
    key: `${userId}:${session.id}`,
    userId,
    id: session.id,
    iv,
    data,
    updatedAt: Date.now(),
  });
  await transactionDone(tx);
}

/**
 * Debounced encrypted save. Does nothing while the vault is locked, which
 * is exactly the "locked = memory-only" rule.
 * session = { id, title, messages }
 */
export function queueSave(session, delayMs = 1200) {
  if (!activeKey || !activeUserId) return;

  const existing = pending.get(session.id);
  if (existing) clearTimeout(existing.timer);

  const ctx = { key: activeKey, userId: activeUserId };
  const timer = setTimeout(() => {
    pending.delete(session.id);
    writeSession(ctx.userId, ctx.key, session).catch((err) =>
      console.warn("Vault save failed (non-fatal):", err.message)
    );
  }, delayMs);

  pending.set(session.id, { session, timer, ctx });
}

/** Removes one session from the vault (used by Standard Delete). */
export async function removeSession(userId, sessionId) {
  const existing = pending.get(sessionId);
  if (existing) {
    clearTimeout(existing.timer);
    pending.delete(sessionId);
  }
  const db = await openDb();
  const tx = db.transaction(SESSIONS_STORE, "readwrite");
  tx.objectStore(SESSIONS_STORE).delete(`${userId}:${sessionId}`);
  await transactionDone(tx);
}

/** Decrypts and returns every saved session for the unlocked user. */
export async function loadAllSessions(userId) {
  if (!isUnlockedFor(userId)) throw new Error("Vault is locked.");

  const db = await openDb();
  const tx = db.transaction(SESSIONS_STORE, "readonly");
  const rows = await requestToPromise(
    tx.objectStore(SESSIONS_STORE).index("byUser").getAll(IDBKeyRange.only(userId))
  );

  const sessions = [];
  for (const row of rows) {
    try {
      const bytes = await decryptBytes(activeKey, row, `${userId}|${row.id}`);
      const parsed = JSON.parse(dec.decode(bytes));
      sessions.push({ ...parsed, updatedAt: row.updatedAt });
    } catch (err) {
      console.warn("Skipping an unreadable vault record:", err.message);
    }
  }
  sessions.sort((a, b) => a.updatedAt - b.updatedAt);
  return sessions;
}