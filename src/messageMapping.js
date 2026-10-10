// Turns a message row saved in the database back into the message object the
// chat draws — including the rich extras (tree/chart, search sources,
// generated-file preview) that used to disappear when you reloaded a chat.

export function messageFromRow(row) {
  const meta = row.meta && typeof row.meta === "object" ? row.meta : null;
  const base = { id: row.id, role: row.role, content: row.content };

  if (meta?.type === "search-card") {
    return {
      ...base,
      type: "search-card",
      sources: Array.isArray(meta.sources) ? meta.sources : [],
      provider: meta.provider,
    };
  }

  if (meta?.type === "doc-gen-card" && meta.plan && (meta.docType === "pptx" || meta.docType === "xlsx")) {
    return {
      ...base,
      type: "doc-gen-card",
      docType: meta.docType,
      plan: meta.plan,
      provider: meta.provider,
    };
  }

  return {
    ...base,
    type: "text",
    provider: meta?.provider,
    structure: meta?.structure || null,
  };
}