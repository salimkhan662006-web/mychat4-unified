// Enhanced Incognito Mode (EINCM) — compression and file format utilities.
//
// Nothing in this file ever talks to the backend. Compression happens
// entirely in the browser using the native CompressionStream API, and
// the resulting file is written straight to the user's device via a
// download — this is the whole point of EINCM: the data never touches
// Supabase, ever, even when "saved."

const MCHAT_MAGIC = "MYCHAT4-EINCM-v1";

async function compressToBase64(obj) {
  const json = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);

  const cs = new CompressionStream("gzip");
  const writer = cs.writable.getWriter();
  writer.write(bytes);
  writer.close();

  const compressedChunks = [];
  const reader = cs.readable.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    compressedChunks.push(value);
  }

  const totalLength = compressedChunks.reduce((sum, c) => sum + c.length, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of compressedChunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  let binary = "";
  for (let i = 0; i < merged.length; i++) {
    binary += String.fromCharCode(merged[i]);
  }
  return btoa(binary);
}

async function decompressFromBase64(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  const ds = new DecompressionStream("gzip");
  const writer = ds.writable.getWriter();
  writer.write(bytes);
  writer.close();

  const decompressedChunks = [];
  const reader = ds.readable.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    decompressedChunks.push(value);
  }

  const totalLength = decompressedChunks.reduce((sum, c) => sum + c.length, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of decompressedChunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  const json = new TextDecoder().decode(merged);
  return JSON.parse(json);
}

/**
 * Builds the full dual-purpose .mchat file content: a human-readable
 * header and transcript, followed by an embedded compressed block for
 * exact re-import.
 */
export async function buildCompressedSaveFile(chatTitle, messages) {
  const timestamp = new Date().toISOString();
  const messageCount = messages.length;

  const readableTranscript = messages
    .map((m) => {
      const speaker = m.role === "user" ? "You" : "MyChat4";
      return `${speaker}:\n${m.content}\n`;
    })
    .join("\n---\n\n");

  const payload = {
    magic: MCHAT_MAGIC,
    title: chatTitle,
    savedAt: timestamp,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  };

  const compressedBlock = await compressToBase64(payload);

  const fileContent = `# MyChat4 — Enhanced Incognito Save
# Title: ${chatTitle}
# Saved: ${timestamp}
# Messages: ${messageCount}
#
# This file is readable as plain text below, and can also be dragged
# back into MyChat4 to resume this exact conversation. Nothing in this
# chat was ever stored on any server — it lives only in this file now.

${readableTranscript}

# ============================================================
# Do not edit anything below this line — it's used to restore
# this chat if you drag this file back into MyChat4.
# ============================================================
__MCHAT4_DATA__${compressedBlock}__END__
`;

  return fileContent;
}

export function downloadSaveFile(content, chatTitle) {
  const safeTitle = chatTitle.replace(/[^a-z0-9]/gi, "_").slice(0, 40) || "incognito_chat";
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeTitle}.mchat`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function parseCompressedSaveFile(fileText) {
  const match = fileText.match(/__MCHAT4_DATA__([\s\S]+?)__END__/);
  if (!match) {
    throw new Error("This doesn't look like a valid MyChat4 save file.");
  }

  const compressedBlock = match[1].trim();
  const payload = await decompressFromBase64(compressedBlock);

  if (payload.magic !== MCHAT_MAGIC) {
    throw new Error("This file's format isn't recognized by this version of MyChat4.");
  }

  return {
    title: payload.title,
    savedAt: payload.savedAt,
    messages: payload.messages,
  };
}