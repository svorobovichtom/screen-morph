// Screen morph: one screen turning into another, as a WebGL shader.
// https://svorobovich.com/ui/screen-morph/
//
// A soft, slightly ragged front rises through the screen. Near it both
// pictures blur a little and flow up with it, dark and coloured marks swap a
// little ahead of the ground (so a button changes shape instead of being cut
// by a line), and the incoming screen settles from a touch larger and lower.
// It is purely a function of progress, so it scrubs both ways: drive it from
// scroll, a drag, or play().
//
//   import { screenMorph } from "./screen-morph.js";
//
//   const morph = screenMorph(canvas, { from: imgA, to: imgB });
//   morph.set(0.5);          // 0 shows `from`, 1 shows `to`
//   await morph.play(1);     // or animate there
//
// At its best on light screens (white or pale ground), where it can tell a
// mark from the ground; dark ones morph too. Pictures fill the canvas like
// object-fit: cover, top-aligned. No WebGL: it crossfades on a 2D canvas
// instead.
//
// MIT License. Copyright (c) 2026 Tom Svorobovich
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the "Software"),
// to deal in the Software without restriction, including without limitation
// the rights to use, copy, modify, merge, publish, distribute, sublicense,
// and/or sell copies of the Software, and to permit persons to whom the
// Software is furnished to do so, subject to the following conditions: the
// above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
// FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
// DEALINGS IN THE SOFTWARE.

// The look, in screen heights unless noted.
const LOOK = {
  SOFT: 0.07, // half-width of the soft edge where one screen becomes the other
  INK: 0.05, // marks swap this far ahead of the front
  AMP: 0.07, // how ragged the front is
  BOW: 0.05, // the middle leads, the sides lag
  TILT: 0.05, // each front leans a little, odd seeds one way, even the other
  ZONE: 0.09, // reach of the blur and the flow around the front
  BLUR: 0.016, // max blur radius, of the width
  FLOW: 0.012, // how far content near the front is carried up
  GROW: 0.04, // the incoming screen starts this much larger...
  DROP: 0.03, // ...and this much lower
  VEIL: 0.1, // the lighter screen wins on the front, so the overlap never goes muddy
};

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

// vUv runs top-down, like an image's rows, so textures need no flip.
const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
${Object.entries(LOOK)
  .map(([k, v]) => `#define ${k} ${v.toFixed(4)}`)
  .join("\n")}
varying vec2 vUv;
uniform sampler2D uA;
uniform sampler2D uB;
uniform vec4 uFitA;    // cover fit: uv * xy + zw
uniform vec4 uFitB;
uniform float uP;      // 0..1 from A to B
uniform float uSeed;   // which front
uniform float uAspect; // canvas width / height

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = p * 2.03 + 17.0;
    a *= 0.5;
  }
  return v;
}

vec4 tap(sampler2D t, vec4 fit, vec2 uv) {
  return vec4(texture2D(t, clamp(uv, 0.0, 1.0) * fit.xy + fit.zw).rgb, 1.0);
}

// A small disc blur on a golden-angle spiral; one tap when r is tiny.
vec4 soft(sampler2D t, vec4 fit, vec2 uv, float r) {
  vec4 c = tap(t, fit, uv);
  if (r < 0.0006) return c;
  for (int i = 1; i < 14; i++) {
    float fi = float(i);
    float a = fi * 2.39996;
    vec2 o = vec2(cos(a), sin(a) * uAspect) * (sqrt(fi / 13.0) * r);
    c += tap(t, fit, uv + o);
  }
  return c / 14.0;
}

// How much of a mark a pixel is: dark or coloured, against a light ground.
float ink(vec4 p) {
  float l = dot(p.rgb, vec3(0.299, 0.587, 0.114));
  float s = max(p.r, max(p.g, p.b)) - min(p.r, min(p.g, p.b));
  return clamp((1.0 - l) * 1.4 + s * 0.8, 0.0, 1.0);
}

void main() {
  vec2 uv = vUv;
  if (uP <= 0.0) {
    gl_FragColor = tap(uA, uFitA, uv);
    return;
  }
  float p = uP;

  // Blur, flow and veil come and go with the move, so both ends are
  // exactly the still screens.
  float env = smoothstep(0.0, 0.12, p) * (1.0 - smoothstep(0.88, 1.0, p));

  // The front rises from below the screen to above it, ragged, bowed and
  // leaning: low enough at the start that even the marks running ahead are
  // off screen, high enough at the end that the lagging sides are past the top.
  float x = uv.x - 0.5;
  float lean = TILT * (mod(uSeed, 2.0) * 2.0 - 1.0);
  float lag = SOFT + AMP * 0.5 + abs(lean) * 0.5 + 0.01;
  float edge = mix(1.0 + lag + INK, -lag - BOW, p);
  float rag = fbm(vec2(uv.x * 1.9 + uSeed * 3.1, p * 1.3 + uSeed * 1.7)) - 0.5;
  float front = edge + BOW * 4.0 * x * x + lean * x + rag * AMP;
  float d = uv.y - front; // > 0: the front has passed, B shows

  float near = exp(-(d * d) / (ZONE * ZONE)) * env;

  // Both screens are carried up by the front together, so whatever changes,
  // changes inside one moving shape. The incoming one settles from a touch
  // larger and lower and has settled before the front reaches the top, so a
  // header the two share never doubles.
  vec2 flow = vec2(0.0, FLOW * near);
  vec2 drop = vec2(0.0, DROP);
  vec2 o = vec2(0.5, 0.32);
  float q = p * p * (3.0 - 2.0 * p);
  vec2 uvA = (uv - o) / (1.0 - 0.006 * q) + o + flow;
  float settle = smoothstep(0.0, 0.85, p);
  vec2 uvB = (uv - o) / mix(1.0 + GROW, 1.0, settle) + o - drop * (1.0 - settle) + flow;

  float r = BLUR * near;
  vec4 a = soft(uA, uFitA, uvA, r);
  vec4 b = soft(uB, uFitB, uvB, r);

  // Marks swap a little ahead of the ground, read off softened copies so a
  // detailed area swaps as one shape, not as speckle; only near the front.
  float marks = 0.0;
  if (d > -(SOFT + INK + 0.02) && d < SOFT + 0.02) {
    marks = max(ink(soft(uA, uFitA, uvA, 0.012)), ink(soft(uB, uFitB, uvB, 0.012)));
  }
  float mask = smoothstep(-SOFT, SOFT, d + INK * marks);
  vec4 c = mix(a, b, mask);

  // Where the two overlap most, the lighter of them instead of a muddy mix
  // (on light screens that is near white; on dark ones it stays dark).
  c.rgb = mix(c.rgb, max(a.rgb, b.rgb), VEIL * 2.0 * env * (1.0 - abs(mask * 2.0 - 1.0)));

  gl_FragColor = c;
}`;

const MAX_DPR = 2;

const sizeOf = (s) =>
  s instanceof HTMLImageElement
    ? [s.naturalWidth, s.naturalHeight]
    : s instanceof HTMLVideoElement
      ? [s.videoWidth, s.videoHeight]
      : [s.width, s.height];

const isReady = (s) => {
  const [w, h] = sizeOf(s);
  return w > 0 && h > 0 && (!(s instanceof HTMLImageElement) || s.complete);
};

/** A sine in-out: gentle at both ends. */
const ease = (t) => 0.5 - 0.5 * Math.cos(Math.PI * t);

/**
 * The morph on a canvas. `from` and `to` are images (or canvases, bitmaps,
 * video frames); an image still loading is drawn once it has loaded.
 *
 * @param {HTMLCanvasElement} canvas  sized by CSS; the drawing follows it
 * @param {{ from: CanvasImageSource, to: CanvasImageSource, seed?: number }} options
 *   seed: which front; each whole number draws its own
 */
export function screenMorph(canvas, { from, to, seed = 7 }) {
  let images = [from, to];
  let progress = 0;
  let frame = 0;
  let gl = null;
  let ctx2d = null;
  let u = {};
  let textures = [null, null];
  let size = [0, 0];

  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) {
      console.warn("screen-morph:", gl.getShaderInfoLog(shader));
      return null;
    }
    return shader;
  };

  const startGL = () => {
    gl = canvas.getContext("webgl", { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false });
    if (!gl) return false;
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    const program = gl.createProgram();
    if (!vs || !fs || !program) return false;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return false;
    gl.useProgram(program);

    // One triangle that covers the viewport.
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const pos = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

    for (const name of ["uA", "uB", "uFitA", "uFitB", "uP", "uSeed", "uAspect"]) u[name] = gl.getUniformLocation(program, name);
    gl.uniform1i(u.uA, 0);
    gl.uniform1i(u.uB, 1);
    return true;
  };

  if (!startGL()) {
    gl = null;
    ctx2d = canvas.getContext("2d");
  }

  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    textures = [null, null];
  });
  canvas.addEventListener("webglcontextrestored", () => {
    size = [0, 0];
    if (startGL()) draw();
  });

  const upload = (i) => {
    const source = images[i];
    if (textures[i] || !source || !isReady(source)) return textures[i];
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, source);
    textures[i] = t;
    return t;
  };

  // Cover, top-aligned, centred across.
  const fit = (source) => {
    const [w, h] = sizeOf(source);
    const box = size[0] / Math.max(1, size[1]);
    const own = w / Math.max(1, h);
    if (own > box) {
      const sx = box / own;
      return [sx, 1, (1 - sx) / 2, 0];
    }
    return [1, own / box, 0, 0];
  };

  const resize = () => {
    const dpr = Math.min(MAX_DPR, devicePixelRatio || 1);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (w === size[0] && h === size[1]) return;
    size = [w, h];
    canvas.width = w;
    canvas.height = h;
    if (gl) gl.viewport(0, 0, w, h);
  };

  const drawFallback = () => {
    const [a, b] = images;
    if (!ctx2d || !a || !b || !isReady(a) || !isReady(b)) return;
    const paint = (s, alpha) => {
      const [fx, fy, ox] = fit(s);
      const [w, h] = sizeOf(s);
      ctx2d.globalAlpha = alpha;
      ctx2d.drawImage(s, ox * w, 0, fx * w, fy * h, 0, 0, size[0], size[1]);
    };
    paint(a, 1);
    paint(b, progress);
    ctx2d.globalAlpha = 1;
  };

  const draw = () => {
    frame = 0;
    resize();
    if (!gl) return drawFallback();
    if (gl.isContextLost()) return;
    const ta = upload(0);
    const tb = upload(1);
    if (!ta || !tb) return;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, ta);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, tb);
    gl.uniform4fv(u.uFitA, fit(images[0]));
    gl.uniform4fv(u.uFitB, fit(images[1]));
    gl.uniform1f(u.uP, progress);
    gl.uniform1f(u.uSeed, seed);
    gl.uniform1f(u.uAspect, size[0] / size[1]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const redraw = () => {
    if (!frame) frame = requestAnimationFrame(draw);
  };

  // An image that is still loading is drawn once it is in.
  const watch = (source) => {
    if (source instanceof HTMLImageElement && !isReady(source)) {
      source.addEventListener("load", redraw, { once: true });
    }
  };
  images.forEach(watch);

  const observer = new ResizeObserver(redraw);
  observer.observe(canvas);

  let playing = null;

  const api = {
    /** Where the morph is, 0 to 1. */
    get progress() {
      return progress;
    },
    /** Show the morph at p: 0 is `from`, 1 is `to`. Stops a play(). */
    set(p) {
      playing = null;
      progress = Math.min(Math.max(p, 0), 1);
      redraw();
    },
    /** Animate to p (default 1) over ms (default 1000, scaled by the
     *  distance). Resolves when it gets there or another set/play takes over. */
    play(p = 1, ms = 1000) {
      const start = progress;
      const target = Math.min(Math.max(p, 0), 1);
      const duration = ms * Math.abs(target - start);
      const run = {};
      playing = run;
      return new Promise((resolve) => {
        const t0 = performance.now();
        const step = (now) => {
          if (playing !== run) return resolve();
          const t = duration > 0 ? Math.min(1, (now - t0) / duration) : 1;
          progress = start + (target - start) * ease(t);
          draw();
          if (t < 1) requestAnimationFrame(step);
          else {
            playing = null;
            resolve();
          }
        };
        requestAnimationFrame(step);
      });
    },
    /** New pictures; progress stays where it is. */
    setImages(nextFrom, nextTo) {
      images = [nextFrom, nextTo];
      if (gl) for (const t of textures) if (t) gl.deleteTexture(t);
      textures = [null, null];
      images.forEach(watch);
      redraw();
    },
    /** Another front. */
    setSeed(next) {
      seed = next;
      redraw();
    },
    /** Whether it is the shader (true) or the 2D crossfade (false). */
    get webgl() {
      return !!gl;
    },
    /** Stop watching the canvas's size. */
    destroy() {
      playing = null;
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    },
  };

  redraw();
  return api;
}
