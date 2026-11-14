// Full-size Obsidian-style graph of a workforce (IM-2, steps 3-4; AI lines added in IM-3a).
// d3-force runs a LIVE physics simulation; Pixi.js draws it. Both load only when this mounts.
// Mouse: wheel = zoom, drag background = pan, drag a file = move it, hover = focus,
//        click a line = select it, "Draw line" toggle (or Shift) + drag file to file = new line.
// Your lines are solid. AI lines (found by reading the files) are dashed, dimmer, and coloured by
// type (imports / mentions / shared names): the colours live in ./lineKinds.js.
// Groups (IM-3b): each pattern group is a soft coloured hull behind its files (solid edge = yours,
// dashed edge = found by the AI). Click a group name to select it; hover it to light up its files.
// The Groups menu hides or shows hulls one by one.
// Props: files, lines, groups, onCreateLine(aId, bId), onDeleteLine(lineId), onPromoteLine(lineId),
//        onDeleteGroup(id), onPromoteGroup(id), onRenameGroup(id, name), onRescan(), scanning
import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { aiLinkType, aiColorNumber, AI_TYPE_COLORS, AI_TYPE_NAMES } from "./lineKinds";
import { groupColor, groupColorNumber, patternText } from "./groupKinds";
import Icon from "./Icon";

// ---- Look and feel: change values here only ----
const THEME = {
  bg: 0x0a0506,
  node: 0xff2e2e,
  nodeCore: 0xffb3b0,
  nodeLonely: 0x8a7570,   // files with no line yet
  glow: 0xff2e2e,
  line: 0xff4a4a,         // your lines
  lineSelected: 0xffd9d6,
  lineAlpha: 0.5,
  lineWidth: 1.4,
  aiAlpha: 0.42,          // AI lines are a little dimmer than yours
  aiDash: 7,              // dash and gap length of AI lines, in screen pixels
  aiGap: 5,
  aiStrength: 0.25,       // AI lines pull files together less than yours (0.5)
  labelColor: 0xe0d0cc,
  labelSize: 12,
  labelFont: "Inter, sans-serif",
  nodeBase: 5,            // radius of a file with no lines
  nodePerLine: 3.2,       // extra radius per sqrt(number of lines)
  linkDistance: 110,      // preferred length of a line
  repel: -320,            // how hard nodes push each other apart
  dimAlpha: 0.16,         // how faint unfocused things get on hover
  zoomMin: 0.15,
  zoomMax: 4,
  hullPad: 20,            // how far a group hull reaches around its files
  hullFill: 0.07,
  hullFillSel: 0.17,
  hullStroke: 0.55,
  hullLabelSize: 11,
  groupPull: 0.05,        // how strongly the files of a group drift together
  linePick: 12,           // how close (screen pixels) a click must be to a line to select it
  clickSlop: 6,           // a press that moves less than this (pixels) counts as a click
};

const MAX_LABEL = 26;
const MAX_DASHES = 400;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const shortName = (s) => (s.length > MAX_LABEL ? s.slice(0, MAX_LABEL - 1) + "…" : s);

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Pixi has no dashed lines: add many short segments to the current path. The caller strokes it.
function pathDashed(g, ax, ay, bx, by, dash, gap) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return;
  const step = dash + gap;
  const n = Math.min(Math.ceil(len / step), MAX_DASHES);
  const ux = dx / len;
  const uy = dy / len;
  for (let i = 0; i < n; i++) {
    const s = i * step;
    const e = Math.min(s + dash, len);
    g.moveTo(ax + ux * s, ay + uy * s).lineTo(ax + ux * e, ay + uy * e);
  }
}

// Convex hull (monotone chain) of [x, y] points.
function convexHull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [];
  for (const q of p) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
    lo.push(q);
  }
  const up = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
    up.push(q);
  }
  up.pop();
  lo.pop();
  return lo.concat(up);
}

export default function BoxGraph({
  files,
  lines,
  groups = [],
  onCreateLine,
  onDeleteLine,
  onPromoteLine,
  onDeleteGroup,
  onPromoteGroup,
  onRenameGroup,
  onRescan,
  scanning,
}) {
  const hostRef = useRef(null);
  const menuRef = useRef(null);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [drawMode, setDrawMode] = useState(false);
  const [hidden, setHidden] = useState(() => new Set()); // groups switched off in the Groups menu
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const S = useRef({ setData: null, fit: null, select: null, cb: {}, drawMode: false, data: { files, lines } }).current;
  S.data = { files, lines };
  S.groups = groups;
  S.hidden = hidden;
  S.cb = { onCreateLine, onDeleteLine };
  S.drawMode = drawMode;
  S.setDraw = setDrawMode;
  S.setSel = setSelectedId;
  S.setSelGroup = setSelectedGroupId;

  useEffect(() => {
    let disposed = false;
    const host = hostRef.current;
    let cleanup = () => {};

    (async () => {
      const [pixi, d3] = await Promise.all([import("pixi.js"), import("d3-force")]);
      if (disposed) return;

      const app = new pixi.Application();
      await app.init({
        resizeTo: host,
        background: THEME.bg,
        antialias: true,
        autoDensity: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
      });
      if (disposed) {
        app.destroy(true, { children: true });
        return;
      }
      host.appendChild(app.canvas);
      app.canvas.style.display = "block";
      app.canvas.style.touchAction = "none";

      // ---- Scene ----
      const world = new pixi.Container();
      const hullG = new pixi.Graphics(); // group hulls, drawn behind everything
      const edgeG = new pixi.Graphics();
      const hullLabelLayer = new pixi.Container(); // group names, above the files
      const nodeLayer = new pixi.Container();
      const rubberG = new pixi.Graphics(); // the guide line while drawing
      const edgeLabel = new pixi.Text({
        text: "",
        style: { fontFamily: THEME.labelFont, fontSize: 11, fill: 0xffd9d6 },
        resolution: 2,
      });
      edgeLabel.anchor.set(0.5, 1);
      edgeLabel.visible = false;
      world.addChild(hullG, edgeG, nodeLayer, hullLabelLayer, edgeLabel, rubberG);
      app.stage.addChild(world);
      app.stage.eventMode = "static";
      app.stage.hitArea = app.screen; // empty background also receives pointer events

      const view = { x: app.screen.width / 2, y: app.screen.height / 2, k: 1 };
      function applyView() {
        world.position.set(view.x, view.y);
        world.scale.set(view.k);
      }
      applyView();

      let nodes = [];
      let links = [];
      let neighbours = new Map();
      const objs = new Map(); // id -> { c, t, n }
      const lastPos = new Map();
      let hoverId = null;
      let dragging = null;
      let linking = null;
      let linkTarget = null;
      let panning = null;
      let selectedLineId = null;
      let selectedGroupId = null;
      let hoverLineId = null;
      let hoverGroup = null;
      let groupList = []; // visible groups: { id, ai, color, nodes, ids, label }
      let nodeById = new Map();
      let userMoved = false;
      let ticks = 0;
      let first = true;

      // ---- Simulation (live) ----
      const sim = d3
        .forceSimulation()
        .force(
          "link",
          d3.forceLink([]).id((n) => n.id).distance(THEME.linkDistance).strength((l) => (l.ai ? THEME.aiStrength : 0.5))
        )
        .force("charge", d3.forceManyBody().strength(THEME.repel))
        .force("collide", d3.forceCollide((n) => n.r + 18))
        .force("x", d3.forceX(0).strength(0.05))
        .force("y", d3.forceY(0).strength(0.05))
        .alphaDecay(0.03)
        .stop();
      sim.force("groups", groupForce);

      // ---- Selection ----
      function select(id) {
        selectedLineId = id;
        S.setSel(id);
        if (id && selectedGroupId) {
          selectedGroupId = null;
          S.setSelGroup(null);
        }
        renderEdges();
        renderHulls();
      }

      function selectGroup(id) {
        selectedGroupId = id;
        S.setSelGroup(id);
        if (id && selectedLineId) {
          selectedLineId = null;
          S.setSel(null);
        }
        renderEdges();
        renderHulls();
      }

      // Files of one group drift gently toward their common centre, so the hull stays compact.
      function groupForce(alpha) {
        groupList.forEach((gr) => {
          if (gr.nodes.length < 2) return;
          const k = THEME.groupPull * alpha * (gr.ai ? 0.6 : 1);
          let cx = 0;
          let cy = 0;
          gr.nodes.forEach((n) => {
            cx += n.x;
            cy += n.y;
          });
          cx /= gr.nodes.length;
          cy /= gr.nodes.length;
          gr.nodes.forEach((n) => {
            n.vx += (cx - n.x) * k;
            n.vy += (cy - n.y) * k;
          });
        });
      }

      function hoverGroupSet() {
        if (!hoverGroup) return null;
        const gr = groupList.find((x) => x.id === hoverGroup);
        return gr ? gr.ids : null;
      }

      // (Re)builds the visible groups and their name labels. Does not draw; render() does.
      function buildGroups() {
        hullLabelLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
        groupList = [];
        hoverGroup = null;
        (S.groups || []).forEach((g) => {
          if (S.hidden.has(g.id)) return;
          const members = (g.files || []).map((f) => nodeById.get(f.id)).filter(Boolean);
          if (!members.length) return;
          const color = groupColorNumber(g.id);
          const t = new pixi.Text({
            text: g.name,
            style: { fontFamily: THEME.labelFont, fontSize: THEME.hullLabelSize, fill: color },
            resolution: 2,
          });
          t.anchor.set(0.5, 1);
          t.eventMode = "static";
          t.cursor = "pointer";
          t.on("pointerover", () => {
            hoverGroup = g.id;
            refreshFocus();
          });
          t.on("pointerout", () => {
            if (hoverGroup === g.id) hoverGroup = null;
            refreshFocus();
          });
          t.on("pointerdown", (e) => {
            e.stopPropagation(); // keep the background from starting a pan
            selectGroup(selectedGroupId === g.id ? null : g.id);
          });
          hullLabelLayer.addChild(t);
          groupList.push({ id: g.id, ai: g.created_by === "a", color, nodes: members, ids: new Set(members.map((m) => m.id)), label: t });
        });
        if (selectedGroupId && !groupList.some((x) => x.id === selectedGroupId)) selectGroup(null);
      }

      function renderHulls() {
        hullG.clear();
        const w = THEME.lineWidth / Math.sqrt(view.k);
        const dash = THEME.aiDash / view.k;
        const gap = THEME.aiGap / view.k;
        groupList.forEach((gr) => {
          const pts = [];
          gr.nodes.forEach((n) => {
            const R = n.r + THEME.hullPad;
            for (let i = 0; i < 16; i++) {
              const a = (i / 16) * Math.PI * 2;
              pts.push([n.x + Math.cos(a) * R, n.y + Math.sin(a) * R]);
            }
          });
          const hull = convexHull(pts);
          if (hull.length < 3) return;
          const sel = gr.id === selectedGroupId;
          const flat = hull.flat();
          hullG.poly(flat, true).fill({ color: gr.color, alpha: sel ? THEME.hullFillSel : THEME.hullFill });
          const stroke = { width: sel ? w * 2.2 : w * 1.2, color: gr.color, alpha: sel ? 1 : THEME.hullStroke };
          if (gr.ai) {
            for (let i = 0; i < hull.length; i++) {
              const a = hull[i];
              const b = hull[(i + 1) % hull.length];
              pathDashed(hullG, a[0], a[1], b[0], b[1], dash, gap);
            }
            hullG.stroke(stroke);
          } else {
            hullG.poly(flat, true).stroke(stroke);
          }
          let top = hull[0];
          let cx = 0;
          hull.forEach((p) => {
            if (p[1] < top[1]) top = p;
            cx += p[0];
          });
          gr.label.position.set(cx / hull.length, top[1] - 3);
          gr.label.alpha = sel ? 1 : 0.85;
        });
      }

      // ---- Drawing helpers ----
      function zoomLabelAlpha() {
        return clamp((view.k - 0.45) / 0.5, 0, 1);
      }

      function refreshFocus() {
        const za = zoomLabelAlpha();
        const near = hoverId ? neighbours.get(hoverId) : null;
        const gm = hoverGroupSet();
        objs.forEach(({ c, t, n }, id) => {
          const focused = gm ? gm.has(id) : !hoverId || id === hoverId || (near && near.has(id));
          c.alpha = focused ? 1 : THEME.dimAlpha;
          const base = n.deg === 0 ? 0.6 : 0.95;
          t.alpha = hoverId || gm ? (focused ? 1 : 0) : za * base;
        });
        renderEdges();
      }

      function renderEdges() {
        edgeG.clear();
        const w = THEME.lineWidth / Math.sqrt(view.k);
        const dash = THEME.aiDash / view.k;
        const gap = THEME.aiGap / view.k;
        const gm = hoverGroupSet();
        let sel = null;
        links.forEach((l) => {
          const a = l.source;
          const b = l.target;
          if (typeof a !== "object" || typeof b !== "object") return;
          const isSel = l.id === selectedLineId;
          if (isSel) sel = l;
          const hot = (hoverId && (a.id === hoverId || b.id === hoverId)) || l.id === hoverLineId;
          const dim = ((hoverId && !hot) || (gm && !(gm.has(a.id) && gm.has(b.id)))) && !isSel && l.id !== hoverLineId;
          if (l.ai) pathDashed(edgeG, a.x, a.y, b.x, b.y, dash, gap);
          else edgeG.moveTo(a.x, a.y).lineTo(b.x, b.y);
          edgeG.stroke({
            width: isSel ? w * 2.4 : hot ? w * 1.8 : w,
            color: isSel ? THEME.lineSelected : l.color,
            alpha: isSel ? 1 : dim ? THEME.dimAlpha * 0.5 : hot ? 0.95 : l.ai ? THEME.aiAlpha : THEME.lineAlpha,
          });
        });
        if (sel && sel.label) {
          edgeLabel.text = sel.label;
          edgeLabel.position.set((sel.source.x + sel.target.x) / 2, (sel.source.y + sel.target.y) / 2 - 5);
          edgeLabel.visible = true;
        } else {
          edgeLabel.visible = false;
        }
      }

      function render() {
        objs.forEach(({ c, n }) => c.position.set(n.x, n.y));
        renderHulls();
        renderEdges();
      }

      function fit() {
        if (!nodes.length) return;
        const w = app.screen.width;
        const h = app.screen.height;
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        nodes.forEach((n) => {
          x0 = Math.min(x0, n.x - n.r);
          x1 = Math.max(x1, n.x + n.r);
          y0 = Math.min(y0, n.y - n.r);
          y1 = Math.max(y1, n.y + n.r + 22); // room for the label
        });
        const pad = 70;
        const k = clamp(
          Math.min((w - pad * 2) / Math.max(x1 - x0, 1), (h - pad * 2) / Math.max(y1 - y0, 1)),
          0.2,
          2
        );
        view.k = k;
        view.x = w / 2 - ((x0 + x1) / 2) * k;
        view.y = h / 2 - ((y0 + y1) / 2) * k;
        applyView();
        refreshFocus();
      }

      // ---- Hit tests (world coordinates) ----
      function pickLine(p) {
        let best = null;
        let bd = THEME.linePick / view.k;
        links.forEach((l) => {
          if (typeof l.source !== "object" || typeof l.target !== "object") return;
          const d = distToSegment(p.x, p.y, l.source.x, l.source.y, l.target.x, l.target.y);
          if (d < bd) {
            bd = d;
            best = l;
          }
        });
        return best;
      }

      function pickNode(p, exceptId) {
        let best = null;
        let bd = Infinity;
        nodes.forEach((n) => {
          if (n.id === exceptId) return;
          const d = Math.hypot(p.x - n.x, p.y - n.y);
          if (d <= n.r + 12 / view.k && d < bd) {
            bd = d;
            best = n;
          }
        });
        return best;
      }

      function setLinkTarget(id) {
        if (id === linkTarget) return;
        linkTarget = id;
        objs.forEach(({ c }, nid) => c.scale.set(nid === id ? 1.3 : 1));
      }

      // ---- Build (or rebuild) from the files and lines ----
      function setData() {
        const { files: fs, lines: ls } = S.data;
        nodes.forEach((n) => lastPos.set(n.id, { x: n.x, y: n.y }));
        nodeLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
        objs.clear();
        linkTarget = null;

        const ids = new Set(fs.map((f) => f.id));
        const degree = {};
        const goodLines = ls.filter((l) => ids.has(l.a_id) && ids.has(l.b_id));
        goodLines.forEach((l) => {
          degree[l.a_id] = (degree[l.a_id] || 0) + 1;
          degree[l.b_id] = (degree[l.b_id] || 0) + 1;
        });

        nodes = fs.map((f, i) => {
          const d = degree[f.id] || 0;
          const p = lastPos.get(f.id);
          const a = (i / Math.max(fs.length, 1)) * Math.PI * 2;
          return {
            id: f.id,
            name: f.filename,
            deg: d,
            r: THEME.nodeBase + THEME.nodePerLine * Math.sqrt(d),
            x: p ? p.x : Math.cos(a) * 70,
            y: p ? p.y : Math.sin(a) * 70,
          };
        });
        links = goodLines.map((l) => {
          const ai = l.kind === "a";
          return {
            id: l.id,
            source: l.a_id,
            target: l.b_id,
            label: l.label || "",
            ai,
            color: ai ? aiColorNumber(aiLinkType(l.label)) : THEME.line,
          };
        });

        neighbours = new Map(nodes.map((n) => [n.id, new Set()]));
        goodLines.forEach((l) => {
          neighbours.get(l.a_id).add(l.b_id);
          neighbours.get(l.b_id).add(l.a_id);
        });

        if (selectedLineId && !links.some((l) => l.id === selectedLineId)) select(null);

        nodeById = new Map(nodes.map((n) => [n.id, n]));
        buildGroups();

        nodes.forEach((n) => {
          const lonely = n.deg === 0;
          const c = new pixi.Container();
          const g = new pixi.Graphics();
          if (!lonely) {
            g.circle(0, 0, n.r + 9).fill({ color: THEME.glow, alpha: 0.07 });
            g.circle(0, 0, n.r + 4).fill({ color: THEME.glow, alpha: 0.15 });
          }
          g.circle(0, 0, n.r).fill({ color: lonely ? THEME.nodeLonely : THEME.node, alpha: lonely ? 0.8 : 1 });
          g.circle(0, 0, Math.max(n.r * 0.38, 1.6)).fill({ color: lonely ? 0xc9b8b4 : THEME.nodeCore });
          const t = new pixi.Text({
            text: shortName(n.name),
            style: { fontFamily: THEME.labelFont, fontSize: THEME.labelSize, fill: THEME.labelColor },
            resolution: 2,
          });
          t.anchor.set(0.5, 0);
          t.position.set(0, n.r + 6);
          c.addChild(g, t);
          c.eventMode = "static";
          c.cursor = "pointer";
          c.hitArea = new pixi.Circle(0, 0, n.r + 9);
          c.on("pointerover", () => {
            hoverId = n.id;
            refreshFocus();
          });
          c.on("pointerout", () => {
            if (hoverId === n.id) hoverId = null;
            refreshFocus();
          });
          c.on("pointerdown", (e) => {
            e.stopPropagation(); // keep the background from starting a pan
            if (S.drawMode || e.shiftKey) {
              linking = { n };
              return;
            }
            dragging = n;
            n.fx = n.x;
            n.fy = n.y;
            sim.alphaTarget(0.3).restart();
          });
          nodeLayer.addChild(c);
          objs.set(n.id, { c, t, n });
        });

        sim.nodes(nodes);
        sim.force("link").links(links);
        ticks = 0;
        sim.alpha(first ? 0.9 : 0.4).restart();
        first = false;
        render();
        refreshFocus();
      }

      sim.on("tick", () => {
        ticks += 1;
        render();
        if (ticks === 45 && !userMoved) fit();
      });
      sim.on("end", () => {
        if (!userMoved) fit();
      });

      // ---- Pan, drag, draw, zoom ----
      app.stage.on("pointerdown", (e) => {
        panning = { sx: e.global.x, sy: e.global.y, vx: view.x, vy: view.y, moved: false };
        userMoved = true;
      });
      app.stage.on("pointermove", (e) => {
        if (linking) {
          const p = world.toLocal(e.global);
          rubberG.clear();
          rubberG.moveTo(linking.n.x, linking.n.y).lineTo(p.x, p.y).stroke({
            width: 1.8 / Math.sqrt(view.k),
            color: THEME.nodeCore,
            alpha: 0.9,
          });
          const t = pickNode(p, linking.n.id);
          setLinkTarget(t ? t.id : null);
        } else if (dragging) {
          const p = world.toLocal(e.global);
          dragging.fx = p.x;
          dragging.fy = p.y;
        } else if (panning) {
          const dx = e.global.x - panning.sx;
          const dy = e.global.y - panning.sy;
          if (Math.hypot(dx, dy) > THEME.clickSlop) panning.moved = true;
          view.x = panning.vx + dx;
          view.y = panning.vy + dy;
          applyView();
        } else {
          // Hovering a line: it brightens and the cursor turns into a pointer, so you can see it is clickable.
          const hl = hoverId ? null : pickLine(world.toLocal(e.global));
          const id = hl ? hl.id : null;
          if (id !== hoverLineId) {
            hoverLineId = id;
            app.stage.cursor = id ? "pointer" : "default";
            renderEdges();
          }
        }
      });
      function endDrag(e) {
        if (linking) {
          const from = linking.n;
          const p = world.toLocal(e.global);
          const t = pickNode(p, from.id);
          linking = null;
          rubberG.clear();
          setLinkTarget(null);
          if (t && S.cb.onCreateLine) S.cb.onCreateLine(from.id, t.id);
          return;
        }
        if (dragging) {
          dragging.fx = null;
          dragging.fy = null;
          dragging = null;
          sim.alphaTarget(0);
        }
        if (panning && !panning.moved) {
          // A click on the background: select the line under it, or clear the selection.
          const line = pickLine(world.toLocal(e.global));
          select(line ? line.id : null);
        }
        panning = null;
      }
      app.stage.on("pointerup", endDrag);
      app.stage.on("pointerupoutside", endDrag);

      function onWheel(ev) {
        ev.preventDefault();
        userMoved = true;
        const rect = app.canvas.getBoundingClientRect();
        const mx = ev.clientX - rect.left;
        const my = ev.clientY - rect.top;
        const nk = clamp(view.k * Math.exp(-ev.deltaY * 0.0015), THEME.zoomMin, THEME.zoomMax);
        const wx = (mx - view.x) / view.k;
        const wy = (my - view.y) / view.k;
        view.k = nk;
        view.x = mx - wx * nk;
        view.y = my - wy * nk;
        applyView();
        refreshFocus();
      }
      app.canvas.addEventListener("wheel", onWheel, { passive: false });

      function onKey(ev) {
        if (ev.key !== "Escape") return;
        select(null);
        selectGroup(null);
        S.setDraw(false);
      }
      window.addEventListener("keydown", onKey);

      const resizeObs = new ResizeObserver(() => {
        if (!userMoved) fit();
      });
      resizeObs.observe(host);

      S.setData = setData;
      S.select = select;
      S.selectGroup = selectGroup;
      S.applyGroups = () => {
        buildGroups();
        render();
        sim.alpha(Math.max(sim.alpha(), 0.2)).restart();
      };
      S.fit = () => {
        userMoved = false;
        fit();
      };
      setData();

      cleanup = () => {
        sim.stop();
        resizeObs.disconnect();
        app.canvas.removeEventListener("wheel", onWheel);
        window.removeEventListener("keydown", onKey);
        S.setData = null;
        S.fit = null;
        S.select = null;
        S.selectGroup = null;
        S.applyGroups = null;
        app.destroy(true, { children: true });
      };
    })().catch((err) => console.warn("Graph view failed to start:", err));

    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  // Rebuild when files or lines change (positions of existing files are kept).
  useEffect(() => {
    if (S.setData) S.setData();
  }, [files, lines]);

  // Groups changed (loaded, renamed, deleted) or a group was shown/hidden.
  useEffect(() => {
    if (S.applyGroups) S.applyGroups();
  }, [groups, hidden]);

  // A hidden or deleted group cannot stay selected.
  useEffect(() => {
    if (selectedGroupId && !groups.some((g) => g.id === selectedGroupId)) setSelectedGroupId(null);
  }, [groups, selectedGroupId]);

  useEffect(() => {
    setRenaming(false);
  }, [selectedGroupId]);

  // The Groups menu closes when you click anywhere else.
  useEffect(() => {
    if (!menuOpen) return;
    function onOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener("pointerdown", onOutside);
    return () => document.removeEventListener("pointerdown", onOutside);
  }, [menuOpen]);

  function toggleGroup(id) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const userCount = lines.filter((l) => l.kind !== "a").length;
  const aiCount = lines.length - userCount;
  const sel = selectedId ? lines.find((l) => l.id === selectedId) : null;
  const selAi = !!sel && sel.kind === "a";
  const selType = selAi ? aiLinkType(sel.label) : null;
  const selGroup = !sel && selectedGroupId ? groups.find((g) => g.id === selectedGroupId) : null;
  const selGroupAi = !!selGroup && selGroup.created_by === "a";

  async function saveRename() {
    const name = renameDraft.trim();
    if (!name || !selGroup || !onRenameGroup) return;
    await onRenameGroup(selGroup.id, name);
    setRenaming(false);
  }

  return (
    <div className="bx-graph-wrap">
      <div ref={hostRef} className="bx-graph-host" />
      <div className="bx-graph-ui">
        <span className="bx-graph-count">
          {files.length} files · {userCount} line{userCount === 1 ? "" : "s"}
          {aiCount > 0 ? ` · ${aiCount} AI` : ""}
          {groups.length > 0 ? ` · ${groups.length} group${groups.length === 1 ? "" : "s"}` : ""}
        </span>
        {groups.length > 0 && (
          <div className="bx-groups-wrap" ref={menuRef}>
            <button
              className={`bx-btn small ${menuOpen ? "primary" : "ghost"}`}
              onClick={() => setMenuOpen((v) => !v)}
              title="Show or hide group hulls"
            >
              Groups <Icon icon={ChevronDown} size={12} className="ico-inline" />
            </button>
            {menuOpen && (
              <div className="bx-groups-menu">
                <div className="bx-groups-actions">
                  <span className="bx-link" onClick={() => setHidden(new Set())}>Show all</span>
                  <span className="bx-link" onClick={() => setHidden(new Set(groups.map((g) => g.id)))}>Hide all</span>
                </div>
                {groups.map((g) => {
                  const on = !hidden.has(g.id);
                  const color = groupColor(g.id);
                  return (
                    <div key={g.id} className={`bx-groups-item ${on ? "" : "off"}`} onClick={() => toggleGroup(g.id)}>
                      <span className="bx-groups-swatch" style={{ background: color, opacity: on ? 1 : 0.25 }} />
                      <span className="bx-groups-name">{g.name}</span>
                      {g.created_by === "a" && <span className="bx-badge ai" style={{ "--ai": color }}>AI</span>}
                      <span className="bx-row-meta">{g.files.length}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        <button
          className={`bx-btn small ${drawMode ? "primary" : "ghost"}`}
          onClick={() => setDrawMode((v) => !v)}
          title="Drag from one file onto another to link them (Shift-drag does the same)"
        >
          {drawMode ? "Drawing…" : "Draw line"}
        </button>
        <button className="bx-btn ghost small" onClick={() => S.fit && S.fit()}>Fit</button>
        {onRescan && (
          <button
            className="bx-btn ghost small"
            disabled={scanning}
            onClick={onRescan}
            title="Read the files again and refresh the AI lines and groups"
          >
            {scanning ? "Scanning…" : "Re-scan"}
          </button>
        )}
      </div>

      {sel && (
        <div className="bx-graph-card">
          <div className="bx-graph-card-title">{sel.a_name} ↔ {sel.b_name}</div>
          <div className="bx-graph-card-meta">
            {selAi ? (
              <>
                <span className="bx-badge ai" style={{ "--ai": AI_TYPE_COLORS[selType] }}>AI</span>{" "}
                {sel.label || AI_TYPE_NAMES[selType]}
              </>
            ) : sel.label ? (
              sel.label
            ) : (
              "No label"
            )}
          </div>
          <div className="bx-save-row">
            {selAi && onPromoteLine && (
              <button className="bx-btn primary small" onClick={() => onPromoteLine(sel.id)}>Make it mine</button>
            )}
            <button className="bx-btn danger small" onClick={() => onDeleteLine && onDeleteLine(sel.id)}>Delete line</button>
            <button className="bx-btn ghost small" onClick={() => S.select && S.select(null)}>Close</button>
          </div>
        </div>
      )}

      {selGroup && (
        <div className="bx-graph-card">
          <div className="bx-graph-card-title">{selGroup.name}</div>
          <div className="bx-graph-card-meta">
            {selGroupAi ? (
              <span className="bx-badge ai" style={{ "--ai": groupColor(selGroup.id) }}>AI</span>
            ) : (
              <span className="bx-badge">You</span>
            )}{" "}
            {patternText(selGroup)} · {selGroup.files.length} file{selGroup.files.length === 1 ? "" : "s"}
          </div>
          {renaming ? (
            <>
              <input
                className="bx-input"
                style={{ marginBottom: 8 }}
                value={renameDraft}
                maxLength={60}
                autoFocus
                onChange={(e) => setRenameDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveRename()}
              />
              <div className="bx-save-row">
                <button className="bx-btn primary small" disabled={!renameDraft.trim()} onClick={saveRename}>Save</button>
                <button className="bx-btn ghost small" onClick={() => setRenaming(false)}>Cancel</button>
              </div>
            </>
          ) : (
            <div className="bx-save-row">
              {selGroupAi && onPromoteGroup && (
                <button className="bx-btn primary small" onClick={() => onPromoteGroup(selGroup.id)}>Make it mine</button>
              )}
              {onRenameGroup && (
                <button
                  className="bx-btn ghost small"
                  onClick={() => {
                    setRenameDraft(selGroup.name);
                    setRenaming(true);
                  }}
                >
                  Rename
                </button>
              )}
              <button className="bx-btn danger small" onClick={() => onDeleteGroup && onDeleteGroup(selGroup.id)}>Delete group</button>
              <button className="bx-btn ghost small" onClick={() => S.selectGroup && S.selectGroup(null)}>Close</button>
            </div>
          )}
        </div>
      )}

      <div className="bx-graph-hint">
        {drawMode
          ? "Drag from one file onto another to link them · Esc to stop"
          : "Scroll to zoom · drag background to pan · drag a file to move it · click a line or a group name to select it · Shift-drag draws a line · dashed = found by the AI"}
      </div>
    </div>
  );
}