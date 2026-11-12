// Pattern groups (P-Groups) in the UI. ONE place for their colours and wording.
// The list (BoxLines), the graph hulls and the phone chips all read from here.
// Colours are cool on purpose, so they never get mixed up with the red/amber/mauve AI-line colours.
export const GROUP_COLORS = [
  "#6FB1FF", // blue
  "#7BE0B0", // mint
  "#FFD166", // gold
  "#C792EA", // violet
  "#FF9F6B", // orange
  "#5CE0E0", // cyan
  "#F78FB3", // pink
  "#B8E04C", // lime
];

export const PATTERN_KINDS = [
  { id: "prefix", label: "Names that start with…", placeholder: "Word, like box" },
  { id: "extension", label: "Same extension…", placeholder: "Extension, like .jsx" },
  { id: "tests", label: "Test files", placeholder: "" },
];

// The same group always gets the same colour (it comes from the group's id).
export function groupColor(id) {
  let h = 0;
  const s = String(id || "");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return GROUP_COLORS[h % GROUP_COLORS.length];
}

// Pixi wants colours as numbers (0xRRGGBB).
export function groupColorNumber(id) {
  return parseInt(groupColor(id).slice(1), 16);
}

// Plain-words description of what a group matches.
export function patternText(g) {
  if (!g) return "";
  if (g.pattern_type === "tests") return "test files";
  if (g.pattern_type === "prefix") return `names start with "${g.pattern_value}"`;
  if (g.pattern_type === "extension") return `${g.pattern_value} files`;
  return "";
}