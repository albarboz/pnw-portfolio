import { clamp, smoothstep } from '../core/math';
import { cssRgb } from '../core/tokens';
import { linkProgram } from './gl-program';

/**
 * Device pixels per CSS pixel, at most. Drawn at the screen's own density, not the footage's: a 1× canvas blown up
 * 3× by a phone's compositor filters the picture twice and blurs the fog ring's edge.
 */
const MAX_DPR = 2;

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

// The hand-off from the trail photo: the film is revealed in a ring growing out from the runner, its edge torn by
// noise, with a band of fog riding the edge that bends the picture slightly as it passes. Outside the ring the canvas
// is clear, so the photo underneath (the descent's last frame) still shows. Premultiplied alpha.
// The film opens framed exactly as the photo (its first frame laid where it sits on the photo, at the photo's zoom),
// so until the ring has cleared the runner it is the photo; then it eases to its own cover framing as it finishes:
// a small push-in as the runner sets off.
const FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uFrame;
uniform vec2 uScale, uOffset, uScaleAside, uOffsetAside, uOrigin, uPScale, uPOffset, uAPos, uASize;
uniform vec2 uFocus;
uniform float uAspect, uReveal, uReach, uAlign, uZoom, uAside;
// the film's own framing, eased toward its stepped-aside framing (runner moved away from the text)
vec2 own(vec2 uv) { return mix(uOffset, uOffsetAside, uAside) + uv * mix(uScale, uScaleAside, uAside); }
uniform vec3 uFog;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + 17.0; a *= 0.5; }
  return v;
}
void main() {
  if (uReveal >= 1.0) { // the hand-off is over: just the film, in its own framing
    gl_FragColor = vec4(texture2D(uFrame, own(vUv)).rgb, 1.0);
    return;
  }
  vec2 d = (vUv - uOrigin) * vec2(uAspect, 1.0);
  float r = length(d);
  // Ring radius: from just inside the runner to past the farthest corner, plus room for the torn edge.
  float R = mix(-0.25, uReach + 0.45, uReveal);
  float edge = r + (fbm(vUv * vec2(uAspect, 1.0) * 3.2) - 0.5) * 0.55 - R; // < 0: inside
  float inside = 1.0 - smoothstep(-0.16, 0.0, edge);
  float rim = exp(-edge * edge / 0.012) * (1.0 - smoothstep(0.75, 1.0, uReveal));
  vec2 away = d / max(r, 1e-4) / vec2(uAspect, 1.0);
  // the fog's bend, only once the film has its own framing: while it still is the photo, a bent copy over the photo
  // shows the runner twice where the edge crosses him
  vec2 uv = vUv - away * rim * 0.025 * (1.0 - uAlign);
  vec2 film = own(uv);
  vec2 onPhoto = (uPOffset + (uFocus + (uv - uFocus) / uZoom) * uPScale - uAPos) / uASize;
  vec3 col = texture2D(uFrame, clamp(mix(film, onPhoto, uAlign), 0.0, 1.0)).rgb;
  float fog = rim * (0.55 + 0.45 * fbm(vUv * 7.0 + 3.0));
  col = mix(col, uFog, fog * 0.8);
  float a = clamp(max(inside, fog * 0.9), 0.0, 1.0);
  gl_FragColor = vec4(col * a, a);
}`;

/**
 * Share of the hand-off during which the film holds its first frame in the photo's framing, so the ring opens on a
 * picture identical to the one it replaces (no doubled runner in its soft edge). After it, the runner sets off.
 */
export const RUN_STILL_UNTIL = 0.45;

/** Stepped aside (a section reading over the film, wide screens): a slight push in, and the runner's place across it. */
const ASIDE_ZOOM = 1.12;
const ASIDE_X = 0.66;

/** The trail photo the film opens from. */
export interface RunPlacement {
  /** The photo's size in px (its aspect ratio is what matters). */
  photo: { width: number; height: number };
  /** The photo's object-position, as fractions: the runner. Also the origin of its zoom. */
  focus: { x: number; y: number };
  /** The photo's zoom at rest (the descent's landed zoom). */
  zoom: number;
}

/** Where a film's first frame sits on the photo: left, top and width, as fractions of the photo. */
export interface RunAlign {
  x: number;
  y: number;
  w: number;
}

/**
 * The trail run drawn in WebGL: the current frame cover-fitted to the stage around the runner, and the fog-ring
 * hand-off from the trail photo (`reveal`), starting in the photo's own framing so the first frame lands on it.
 * `ok` is false without WebGL; the caller then shows the <video> instead.
 */
export class RunView {
  private gl: WebGLRenderingContext | null;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private tex = { w: 0, h: 0 };
  private view = { vw: 0, vh: 0 };
  private dpr = 0;
  private align: RunAlign = { x: 0, y: 0, w: 1 };
  private last = '';

  constructor(
    private canvas: HTMLCanvasElement,
    private place: RunPlacement,
    private onLost: () => void,
  ) {
    this.gl = canvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      powerPreference: 'low-power',
    });
    if (this.gl && !this.init(this.gl)) this.gl = null;
    canvas.addEventListener('webglcontextlost', this.lost);
  }

  get ok() {
    return this.gl !== null;
  }

  resize(vw: number, vh: number) {
    // Phones fire resize whenever the toolbar slides (each change of scroll direction), but the lvh stage keeps its
    // size: skip, since resizing the canvas clears it and the film would blink.
    if (vw === this.view.vw && vh === this.view.vh && window.devicePixelRatio === this.dpr) return;
    this.view = { vw, vh };
    this.dpr = window.devicePixelRatio;
    this.fit();
  }

  /** A new frame (or the poster, until frames arrive), and where its film sits on the photo. */
  upload(src: TexImageSource & { width: number; height: number }, align: RunAlign) {
    const gl = this.gl;
    if (!gl) return;
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, src);
    if (src.width !== this.tex.w || src.height !== this.tex.h || align !== this.align) {
      this.tex = { w: src.width, h: src.height };
      this.align = align;
      this.fit();
    }
    this.last = '';
  }

  /** `aside` (0–1): how far the film has stepped aside for a section reading over it. */
  draw(reveal: number, aside = 0) {
    const gl = this.gl;
    if (!gl || !this.tex.w) return;
    const key = `${reveal}|${aside}`;
    if (key === this.last) return;
    this.last = key;
    gl.uniform1f(this.u.uReveal, reveal);
    gl.uniform1f(this.u.uAside, aside);
    gl.uniform1f(this.u.uAlign, 1 - smoothstep(RUN_STILL_UNTIL, 1, reveal));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  destroy() {
    this.canvas.removeEventListener('webglcontextlost', this.lost);
    this.gl?.getExtension('WEBGL_lose_context')?.loseContext();
    this.gl = null;
  }

  private init(gl: WebGLRenderingContext) {
    const prog = linkProgram(gl, VERT, FRAG);
    if (!prog) return false;
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW); // one full-screen triangle
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const frame = ['uFrame', 'uScale', 'uOffset', 'uScaleAside', 'uOffsetAside', 'uAside', 'uPScale', 'uPOffset'];
    frame.push('uAPos', 'uASize', 'uAlign', 'uFocus', 'uZoom');
    for (const name of [...frame, 'uOrigin', 'uAspect', 'uReveal', 'uReach', 'uFog']) {
      this.u[name] = gl.getUniformLocation(prog, name);
    }
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(this.u.uFrame, 0);
    gl.uniform3fv(this.u.uFog, cssRgb('--fog').map((c) => c / 255));
    return true;
  }

  /** Canvas size and the two framings: the photo's (cover around the runner) and the film's own (the same). */
  private fit() {
    const gl = this.gl;
    const { vw, vh } = this.view;
    const { w: tw, h: th } = this.tex;
    if (!gl || !vw || !vh || !tw) return;
    this.last = '';
    const cover = Math.max(vw / tw, vh / th); // CSS px per frame px
    const ratio = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const [cw, ch] = [Math.round(vw * ratio), Math.round(vh * ratio)];
    // even the same size, set again, would clear the canvas
    if (this.canvas.width !== cw || this.canvas.height !== ch) Object.assign(this.canvas, { width: cw, height: ch });
    gl.viewport(0, 0, cw, ch);

    // screen → photo, like the trail photo's object-fit: cover around the runner
    const { photo, focus: F } = this.place;
    const A = this.align;
    const pc = Math.max(vw / photo.width, vh / photo.height);
    const ps = [vw / (photo.width * pc), vh / (photo.height * pc)];
    const po = [(1 - ps[0]) * F.x, (1 - ps[1]) * F.y];
    gl.uniform2f(this.u.uPScale, ps[0], ps[1]);
    gl.uniform2f(this.u.uPOffset, po[0], po[1]);
    // the first frame's place on the photo
    const size = [A.w, (A.w * photo.width * th) / (tw * photo.height)];
    gl.uniform2f(this.u.uAPos, A.x, A.y);
    gl.uniform2f(this.u.uASize, size[0], size[1]);
    // screen → frame, the film's own cover framing, around the runner where he is in the frame
    const fx = clamp((F.x - A.x) / size[0], 0, 1);
    const fy = clamp((F.y - A.y) / size[1], 0, 1);
    const sx = vw / (tw * cover);
    const sy = vh / (th * cover);
    const [ox, oy] = [(1 - sx) * fx, (1 - sy) * fy];
    gl.uniform2f(this.u.uScale, sx, sy);
    gl.uniform2f(this.u.uOffset, ox, oy);
    // Stepped aside: on a wide screen the text reads on the left, so the runner moves right, as far as the frame's
    // edge allows after a slight push in; at the same height. Upright screens keep the plain framing.
    const push = vw > vh ? ASIDE_ZOOM : 1;
    const [ax, ay] = [sx / push, sy / push];
    const runnerY = (fy - oy) / sy;
    const asideX = vw > vh ? clamp(fx - ASIDE_X * ax, 0, 1 - ax) : ox;
    gl.uniform2f(this.u.uScaleAside, ax, ay);
    gl.uniform2f(this.u.uOffsetAside, asideX, clamp(fy - runnerY * ay, 0, 1 - ay));

    // the photo's zoom around the runner, as the descent leaves it
    gl.uniform2f(this.u.uFocus, F.x, F.y);
    gl.uniform1f(this.u.uZoom, this.place.zoom);
    // The ring starts at the runner, where the photo shows him.
    const z = this.place.zoom;
    const origin = [F.x + ((F.x - po[0]) / ps[0] - F.x) * z, F.y + ((F.y - po[1]) / ps[1] - F.y) * z];
    gl.uniform2f(this.u.uOrigin, origin[0], origin[1]);
    const aspect = vw / vh;
    gl.uniform1f(this.u.uAspect, aspect);
    // distance from the origin to the farthest corner, in the same units as the ring
    const reach = Math.hypot(Math.max(origin[0], 1 - origin[0]) * aspect, Math.max(origin[1], 1 - origin[1]));
    gl.uniform1f(this.u.uReach, reach);
  }

  private lost = (e: Event) => {
    e.preventDefault();
    this.gl = null;
    this.onLost();
  };
}
