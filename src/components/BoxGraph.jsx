// Graph view of a box (IM-2, step 3: read-only).
// d3-force works out where each file sits; Pixi.js draws it on a canvas.
// Both libraries are loaded only when this component mounts (desktop, graph tab).
// Props: files [{id, filename, char_count}], lines [{id, a_id, b_id, a_name, b_name, label}]
import { useEffect, useRef } from "react";

// ---- Look and feel: change values here only ----
const THEME = {
  bg: 0x0a0506,
  node: 0xff2e2e,
  nodeCore: 0xffb3b0,
  nodeLonely: 0x8a7570,   // files with no line yet
  glow: 0xff2e2e,
  line: 0xff4a4a,
  lineAlpha: 0.55,
  lineWidth: 1.6,
  ring: 0xff2e2e,
  ringAlpha: 0.07,
  labelColor: 0xe0d0cc,
  labelSize: 11,
  labelFont: "Inter, sans-serif",
  nodeMin: 6,             // radius of the smallest file
  nodeMax: 16,            // radius of the biggest file
  ringStep: 84,           // distance between orbit rings, in pixels
};

const MAX_LABEL = 22;

function shortName(name) {
  return name.length > MAX_LABEL ? name.slice(0, MAX_LABEL - 1) + "…" : name;
}

export default function BoxGraph({ files, lines }) {
  const hostRef = useRef(null);
  const stateRef = useRef({ app: null, ready: false, data: { files, lines } });

  // Keep the newest data handy for the drawing code.
  stateRef.current.data = { files, lines };

  useEffect(() => {
    let disposed = false;
    const host = hostRef.current;
    const S = stateRef.current;
    let resizeObs = null;

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

      const world = new pixi.Container();
      app.stage.addChild(world);
      S.app = app;
      S.pixi = pixi;
      S.d3 = d3;
      S.world = world;
      S.ready = true;
      draw();

      resizeObs = new ResizeObserver(() => draw());
      resizeObs.observe(host);
    })().catch((err) => console.warn("Graph view failed to start:", err));

    function draw() {
      const { app, pixi, d3, world } = S;
      if (!S.ready || !app) return;
      const { files: fs, lines: ls } = S.data;
      const w = app.screen.width;
      const h = app.screen.height;
      if (w < 10 || h < 10) return;

      world.removeChildren().forEach((c) => c.destroy({ children: true }));

      // ---- Nodes: size by amount of text, ring by number of lines ----
      const degree = {};
      ls.forEach((l) => {
        degree[l.a_id] = (degree[l.a_id] || 0) + 1;
        degree[l.b_id] = (degree[l.b_id] || 0) + 1;
      });
      const maxChars = Math.max(...fs.map((f) => f.char_count || 0), 1);
      const maxDeg = Math.max(...fs.map((f) => degree[f.id] || 0), 0);

      const nodes = fs.map((f, i) => {
        const d = degree[f.id] || 0;
        const ring = d === 0 ? maxDeg + 1 : maxDeg - d + 1; // most connected -> ring 1 (near the centre)
        const angle = (i / Math.max(fs.length, 1)) * Math.PI * 2;
        return {
          id: f.id,
          name: f.filename,
          deg: d,
          ring: d === maxDeg && maxDeg > 0 ? 0 : ring,
          r: THEME.nodeMin + (THEME.nodeMax - THEME.nodeMin) * Math.sqrt((f.char_count || 0) / maxChars),
          x: w / 2 + Math.cos(angle) * 120,
          y: h / 2 + Math.sin(angle) * 120,
        };
      });
      const byId = new Map(nodes.map((n) => [n.id, n]));
      const links = ls
        .filter((l) => byId.has(l.a_id) && byId.has(l.b_id))
        .map((l) => ({ source: l.a_id, target: l.b_id }));

      // ---- Layout: run the simulation to rest in one go (no animation yet) ----
      const maxRadius = Math.min(w, h) / 2 - 34;
      const ringR = (ring) => Math.min(ring * THEME.ringStep, maxRadius);
      const sim = d3
        .forceSimulation(nodes)
        .force("link", d3.forceLink(links).id((n) => n.id).distance(THEME.ringStep).strength(0.25))
        .force("charge", d3.forceManyBody().strength(-90))
        .force("collide", d3.forceCollide((n) => n.r + 14))
        .force("orbit", d3.forceRadial((n) => ringR(n.ring), w / 2, h / 2).strength(0.9))
        .stop();
      for (let i = 0; i < 260; i++) sim.tick();

      // ---- Draw: rings, lines, glow, nodes, labels ----
      const rings = new pixi.Graphics();
      const usedRings = new Set(nodes.map((n) => n.ring).filter((r) => r > 0));
      usedRings.forEach((r) => {
        rings.circle(w / 2, h / 2, ringR(r)).stroke({ width: 1, color: THEME.ring, alpha: THEME.ringAlpha });
      });
      world.addChild(rings);

      const edges = new pixi.Graphics();
      links.forEach((l) => {
        const a = l.source;
        const b = l.target;
        edges.moveTo(a.x, a.y).lineTo(b.x, b.y);
      });
      edges.stroke({ width: THEME.lineWidth, color: THEME.line, alpha: THEME.lineAlpha });
      world.addChild(edges);

      const dots = new pixi.Graphics();
      nodes.forEach((n) => {
        const lonely = n.deg === 0;
        const base = lonely ? THEME.nodeLonely : THEME.node;
        if (!lonely) {
          dots.circle(n.x, n.y, n.r + 7).fill({ color: THEME.glow, alpha: 0.1 });
          dots.circle(n.x, n.y, n.r + 3).fill({ color: THEME.glow, alpha: 0.16 });
        }
        dots.circle(n.x, n.y, n.r).fill({ color: base, alpha: lonely ? 0.7 : 1 });
        dots.circle(n.x, n.y, Math.max(n.r * 0.4, 2)).fill({ color: lonely ? 0xc9b8b4 : THEME.nodeCore });
      });
      world.addChild(dots);

      nodes.forEach((n) => {
        const t = new pixi.Text({
          text: shortName(n.name),
          style: { fontFamily: THEME.labelFont, fontSize: THEME.labelSize, fill: THEME.labelColor },
        });
        t.anchor.set(0.5, 0);
        t.position.set(n.x, n.y + n.r + 6);
        t.alpha = n.deg === 0 ? 0.6 : 0.95;
        world.addChild(t);
      });
    }

    S.redraw = draw;

    return () => {
      disposed = true;
      S.ready = false;
      if (resizeObs) resizeObs.disconnect();
      if (S.app) {
        S.app.destroy(true, { children: true });
        S.app = null;
      }
    };
  }, []);

  // Redraw when files or lines change.
  useEffect(() => {
    if (stateRef.current.ready && stateRef.current.redraw) stateRef.current.redraw();
  }, [files, lines]);

  return <div ref={hostRef} className="bx-graph" />;
}