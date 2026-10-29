// Full-size Obsidian-style graph of a workforce (IM-2, step 3).
// d3-force runs a LIVE physics simulation; Pixi.js draws it. Both load only when this mounts.
// Mouse: wheel = zoom, drag background = pan, drag a node = move it (others follow), hover = focus.
// Props: files [{id, filename, char_count}], lines [{id, a_id, b_id, ...}]
import { useEffect, useRef } from "react";

// ---- Look and feel: change values here only ----
const THEME = {
  bg: 0x0a0506,
  node: 0xff2e2e,
  nodeCore: 0xffb3b0,
  nodeLonely: 0x8a7570,   // files with no line yet
  glow: 0xff2e2e,
  line: 0xff4a4a,
  lineAlpha: 0.5,
  lineWidth: 1.4,
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
};

const MAX_LABEL = 26;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const shortName = (s) => (s.length > MAX_LABEL ? s.slice(0, MAX_LABEL - 1) + "…" : s);

export default function BoxGraph({ files, lines }) {
  const hostRef = useRef(null);
  const S = useRef({ setData: null, fit: null, data: { files, lines } }).current;
  S.data = { files, lines };

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
      const edgeG = new pixi.Graphics();
      const nodeLayer = new pixi.Container();
      world.addChild(edgeG, nodeLayer);
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
      let panning = null;
      let userMoved = false;
      let ticks = 0;

      // ---- Simulation (live) ----
      const sim = d3
        .forceSimulation()
        .force("link", d3.forceLink([]).id((n) => n.id).distance(THEME.linkDistance).strength(0.5))
        .force("charge", d3.forceManyBody().strength(THEME.repel))
        .force("collide", d3.forceCollide((n) => n.r + 18))
        .force("x", d3.forceX(0).strength(0.05))
        .force("y", d3.forceY(0).strength(0.05))
        .alphaDecay(0.03)
        .stop();

      // ---- Drawing helpers ----
      function zoomLabelAlpha() {
        return clamp((view.k - 0.45) / 0.5, 0, 1);
      }

      function refreshFocus() {
        const za = zoomLabelAlpha();
        const near = hoverId ? neighbours.get(hoverId) : null;
        objs.forEach(({ c, t, n }, id) => {
          const focused = !hoverId || id === hoverId || (near && near.has(id));
          c.alpha = focused ? 1 : THEME.dimAlpha;
          const base = n.deg === 0 ? 0.6 : 0.95;
          t.alpha = hoverId ? (focused ? 1 : 0) : za * base;
        });
        renderEdges();
      }

      function renderEdges() {
        edgeG.clear();
        const w = THEME.lineWidth / Math.sqrt(view.k);
        links.forEach((l) => {
          const a = l.source;
          const b = l.target;
          if (typeof a !== "object" || typeof b !== "object") return;
          const hot = hoverId && (a.id === hoverId || b.id === hoverId);
          const dim = hoverId && !hot;
          edgeG.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({
            width: hot ? w * 1.8 : w,
            color: THEME.line,
            alpha: dim ? THEME.dimAlpha * 0.5 : hot ? 0.95 : THEME.lineAlpha,
          });
        });
      }

      function render() {
        objs.forEach(({ c, n }) => c.position.set(n.x, n.y));
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

      // ---- Build (or rebuild) from the files and lines ----
      function setData() {
        const { files: fs, lines: ls } = S.data;
        nodes.forEach((n) => lastPos.set(n.id, { x: n.x, y: n.y }));
        nodeLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
        objs.clear();

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
        links = goodLines.map((l) => ({ id: l.id, source: l.a_id, target: l.b_id }));

        neighbours = new Map(nodes.map((n) => [n.id, new Set()]));
        goodLines.forEach((l) => {
          neighbours.get(l.a_id).add(l.b_id);
          neighbours.get(l.b_id).add(l.a_id);
        });

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
        sim.alpha(0.9).restart();
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

      // ---- Pan, drag, zoom ----
      app.stage.on("pointerdown", (e) => {
        panning = { sx: e.global.x, sy: e.global.y, vx: view.x, vy: view.y };
        userMoved = true;
      });
      app.stage.on("pointermove", (e) => {
        if (dragging) {
          const p = world.toLocal(e.global);
          dragging.fx = p.x;
          dragging.fy = p.y;
        } else if (panning) {
          view.x = panning.vx + (e.global.x - panning.sx);
          view.y = panning.vy + (e.global.y - panning.sy);
          applyView();
        }
      });
      function endDrag() {
        if (dragging) {
          dragging.fx = null;
          dragging.fy = null;
          dragging = null;
          sim.alphaTarget(0);
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

      const resizeObs = new ResizeObserver(() => {
        if (!userMoved) fit();
      });
      resizeObs.observe(host);

      S.setData = setData;
      S.fit = () => {
        userMoved = false;
        fit();
      };
      setData();

      cleanup = () => {
        sim.stop();
        resizeObs.disconnect();
        app.canvas.removeEventListener("wheel", onWheel);
        S.setData = null;
        S.fit = null;
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

  const lineCount = lines.length;
  return (
    <div className="bx-graph-wrap">
      <div ref={hostRef} className="bx-graph-host" />
      <div className="bx-graph-ui">
        <span className="bx-graph-count">{files.length} files · {lineCount} line{lineCount === 1 ? "" : "s"}</span>
        <button className="bx-btn ghost small" onClick={() => S.fit && S.fit()}>Fit</button>
      </div>
      <div className="bx-graph-hint">Scroll to zoom · drag the background to pan · drag a file to move it · hover to focus</div>
    </div>
  );
}