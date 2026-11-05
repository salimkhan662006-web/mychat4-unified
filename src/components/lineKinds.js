// AI lines (kind "a") come in three types, told apart by the label the scan writes:
//   "imports ..."               -> import   (strongest evidence)
//   "mentions the file name"    -> mention
//   "shares: name, name"        -> shared   (weakest evidence)
// ONE place for their colours. The list, the graph and the phone map all read from here,
// so a designer (or Gemini) only ever edits this block.
export const AI_TYPE_COLORS = {
  import: "#FF6B6B",   // strong red
  mention: "#FFA35C",  // warm amber
  shared: "#A58A9A",   // dim, cooler mauve
};

export const AI_TYPE_NAMES = {
  import: "imports",
  mention: "mentions the file name",
  shared: "shares names",
};

export function aiLinkType(label) {
  const l = String(label || "").toLowerCase();
  if (l.startsWith("imports")) return "import";
  if (l.startsWith("mentions")) return "mention";
  return "shared";
}

// Pixi wants colours as numbers (0xRRGGBB).
export function aiColorNumber(type) {
  return parseInt((AI_TYPE_COLORS[type] || AI_TYPE_COLORS.shared).slice(1), 16);
}