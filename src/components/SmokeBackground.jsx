// The signature glowing red smoke + film-grain layers behind the whole app.
// Primary: a WebGL shader (domain-warped noise) drawn at half resolution.
// Fallback: the original three CSS blobs if WebGL or the shader is unavailable.
// The intensity slider (AppearanceContext) drives brightness; 0 stops all drawing.
import { useEffect, useRef, useState } from "react";
import { useAppearance } from "../AppearanceContext";

// ---- Tuning knobs ----
const SCALE = 0.5;          // canvas size vs screen size. Lower = lighter on the GPU, softer smoke
const FPS_DESKTOP = 30;
const FPS_MOBILE = 24;
const SPEED = 0.06;         // how fast the smoke flows
const BRIGHT = 1.9;         // overall brightness at slider = 1
const OCTAVES = 4;          // 3 is lighter on weak phones

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
#define OCT ${OCTAVES}
const float SPEED = ${SPEED.toFixed(3)};
const float BRIGHT = ${BRIGHT.toFixed(3)};
uniform vec2 uRes;
uniform float uTime;
uniform float uIntensity;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < OCT; i++) {
    v += a * noise(p);
    p = p * 2.02 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y);
  float t = uTime * SPEED;
  // bounded circular drift, so numbers never grow however long the tab stays open
  vec2 a = vec2(cos(t * 0.9), sin(t * 0.6));
  vec2 b = vec2(sin(t * 0.7), cos(t * 1.1));

  vec2 q = vec2(fbm(p * 1.5 + a * 1.3), fbm(p * 1.5 + vec2(5.2, 1.3) + b * 1.3));
  vec2 r = vec2(fbm(p * 1.5 + 3.0 * q + vec2(1.7, 9.2) + a),
                fbm(p * 1.5 + 3.0 * q + vec2(8.3, 2.8) + b));
  float f = fbm(p * 1.3 + 3.0 * r);

  float dens = smoothstep(0.30, 0.95, f + 0.35 * length(q));
  // calmer in the middle (text stays readable), stronger toward the corners
  float edge = smoothstep(0.10, 0.95, length(p * vec2(0.85, 1.0)));
  dens *= mix(0.45, 1.0, edge);

  vec3 deep = vec3(0.32, 0.03, 0.05);
  vec3 hot = vec3(1.00, 0.17, 0.17);
  vec3 col = mix(deep, hot, smoothstep(0.35, 1.0, f + 0.4 * r.x)) * dens;
  gl_FragColor = vec4(col * uIntensity * BRIGHT, 1.0);
}
`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.warn("Smoke shader failed (falling back to CSS):", gl.getShaderInfoLog(sh));
    return null;
  }
  return sh;
}

export default function SmokeBackground() {
  const { settings } = useAppearance();
  const intensity = settings.smokeIntensity;
  const [mode, setMode] = useState("webgl"); // "webgl" | "css"
  const canvasRef = useRef(null);
  const intensityRef = useRef(intensity);
  const kickRef = useRef(null);

  intensityRef.current = intensity;

  // Wake up (or stop) the loop when the slider changes.
  useEffect(() => {
    if (kickRef.current) kickRef.current();
  }, [intensity]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "low-power",
    });
    if (!gl) {
      setMode("css");
      return;
    }

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    const prog = vs && fs ? gl.createProgram() : null;
    if (!prog) {
      setMode("css");
      return;
    }
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn("Smoke program failed to link (falling back to CSS)");
      setMode("css");
      return;
    }
    gl.useProgram(prog);

    // One big triangle that covers the whole screen.
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, "uRes");
    const uTime = gl.getUniformLocation(prog, "uTime");
    const uInt = gl.getUniformLocation(prog, "uIntensity");

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const frameGap = 1000 / (window.matchMedia("(max-width: 720px)").matches ? FPS_MOBILE : FPS_DESKTOP);
    const start = performance.now();
    let raf = 0;
    let last = 0;
    let disposed = false;

    function resize() {
      const w = Math.max(2, Math.round(window.innerWidth * SCALE));
      const h = Math.max(2, Math.round(window.innerHeight * SCALE));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    }

    function draw(now) {
      resize();
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, (now - start) / 1000);
      gl.uniform1f(uInt, intensityRef.current);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    function shouldAnimate() {
      return !disposed && !document.hidden && intensityRef.current > 0 && !reduce.matches;
    }

    function loop(now) {
      raf = 0;
      if (!shouldAnimate()) return;
      if (now - last >= frameGap) {
        last = now;
        draw(now);
      }
      raf = requestAnimationFrame(loop);
    }

    // Decides what to do right now: stop, draw one still frame, or run the loop.
    function kick() {
      if (disposed) return;
      if (intensityRef.current <= 0) {
        canvas.style.visibility = "hidden"; // nothing is drawn at all
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        return;
      }
      canvas.style.visibility = "visible";
      if (reduce.matches) {
        draw(start + 20000); // one still frame, no animation
        return;
      }
      if (!raf && shouldAnimate()) raf = requestAnimationFrame(loop);
    }
    kickRef.current = kick;

    function onVisibility() {
      if (document.hidden) {
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
      } else {
        kick();
      }
    }
    function onResize() {
      if (reduce.matches && intensityRef.current > 0) draw(start + 20000);
    }
    function onLost(e) {
      e.preventDefault();
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      setMode("css"); // simplest safe recovery: the original blobs
    }

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("resize", onResize);
    canvas.addEventListener("webglcontextlost", onLost);
    reduce.addEventListener("change", kick);
    kick();

    return () => {
      disposed = true;
      kickRef.current = null;
      if (raf) cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", onResize);
      canvas.removeEventListener("webglcontextlost", onLost);
      reduce.removeEventListener("change", kick);
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
    };
  }, []);

  return (
    <>
      <div className="smoke-layer">
        {mode === "webgl" ? (
          <canvas ref={canvasRef} className="smoke-canvas" />
        ) : (
          <>
            <div className="smoke-blob smoke-1"></div>
            <div className="smoke-blob smoke-2"></div>
            <div className="smoke-blob smoke-3"></div>
          </>
        )}
      </div>
      <div className="grain"></div>
    </>
  );
}