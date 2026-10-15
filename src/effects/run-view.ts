import { clamp, smoothstep } from '../core/math';
import { onShed, shed } from '../core/governor';
import { cssRgb } from '../core/tokens';
import { tuning } from '../core/tuning';
import { DITHER_GLSL } from './dither';
import { DEPTH_GLSL, type FilmDepth } from './film-depth';
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
// With the film's depth (src/effects/film-depth.ts) the edge runs ahead over what is nearer than the runner and
// behind over what is farther, so it follows the trunks and leaves the ferns first.
// MOTION BLUR (uBlur, uGhost; once the hand-off is over): flicked through fast, the film skips frames. Each point
// streaks toward the runner, where the trail runs off ahead (a camera rushing forward), and a trace of the frame
// before stays (uPrev), so the skipped frames read as speed. At an ordinary pace both are 0: the film untouched.
const FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uFrame, uPhoto, uPrev;
uniform float uBlur, uGhost;
uniform vec2 uFoe;
uniform float uHasPhoto;
uniform vec2 uScale, uOffset, uScaleAside, uOffsetAside, uOrigin, uPScale, uPOffset, uAPos, uASize;
uniform vec2 uFocus;
uniform float uAspect, uReveal, uReach, uAlign, uZoom, uAside, uTime, uDepthAmt;
// the film's own framing, eased toward its stepped-aside framing (runner moved away from the text)
vec2 own(vec2 uv) { return mix(uOffset, uOffsetAside, uAside) + uv * mix(uScale, uScaleAside, uAside); }
// the frame point under screen point uv: the film's own framing, or, while it still is the photo, the photo's
// (which shows more than the frame does: then it lands outside 0–1)
vec2 frameRaw(vec2 uv) {
  vec2 onPhoto = (uPOffset + (uFocus + (uv - uFocus) / uZoom) * uPScale - uAPos) / uASize;
  return mix(own(uv), onPhoto, uAlign);
}
vec2 frameAt(vec2 uv) { return clamp(frameRaw(uv), 0.0, 1.0); }
// a point of the frame showing, in the HQ film's frame (the phone film is a slice of it): via their places on the photo
uniform vec2 uMPos, uMSize;
vec2 master(vec2 f) { return (uAPos + f * uASize - uMPos) / uMSize; }
${DEPTH_GLSL}
uniform vec3 uFog;
${DITHER_GLSL}
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
vec3 moving(vec2 f) {
  vec3 c = texture2D(uFrame, f).rgb;
  if (uBlur <= 0.0) return c;
  for (int i = 1; i <= 6; i++) c += texture2D(uFrame, mix(f, uFoe, float(i) / 6.0 * uBlur * 0.07)).rgb;
  return mix(c / 7.0, texture2D(uPrev, f).rgb, uGhost);
}
void main() {
  if (uReveal >= 1.0) { // the hand-off is over: just the film, in its own framing
    gl_FragColor = vec4(moving(own(vUv)), 1.0);
    return;
  }
  vec2 d = (vUv - uOrigin) * vec2(uAspect, 1.0);
  float r = length(d);
  // Ring radius: from just inside the runner to past the farthest corner, plus room for the torn edge.
  // (Room for the depth too: what is farthest has that much further to go.)
  float R = mix(-0.25, uReach + 0.5 + uDepthAmt * 0.5, uReveal);
  // The edge, torn by noise that is itself warped (as the dive's fog is) and drifting slowly, so it billows.
  vec2 p = vUv * vec2(uAspect, 1.0);
  vec2 warp = vec2(fbm(p * 1.6 + vec2(uTime * 0.03, 0.0)), fbm(p * 1.6 + vec2(5.2, uTime * 0.02))) - 0.5;
  float edge = r + (fbm(p * 2.4 + warp * 1.2) - 0.5) * 0.6 - R; // < 0: inside
  // Not right at the runner: the ring still opens from him whole (his head would read as the far trees behind it).
  // Nor past the frame's edge, where there is no depth: it eases out there instead of smearing the edge row.
  vec2 f0 = frameRaw(vUv);
  vec2 out0 = max(-f0, f0 - 1.0);
  float byDepth = uDepthAmt * smoothstep(0.1, 0.35, r) * (1.0 - smoothstep(0.0, 0.08, max(out0.x, out0.y)));
  if (byDepth > 0.0) edge += byDepth * (nearness(frameRaw(uOrigin)) - nearness(f0));
  float inside = 1.0 - smoothstep(-0.2, 0.0, edge);
  // A bank of fog riding the edge: a dense core in a wide haze, thick and thin in billows rather than strands.
  float body = smoothstep(0.3, 0.8, fbm(p * 3.0 + warp * 2.0 + vec2(0.0, uTime * 0.05)));
  float core = exp(-edge * edge / 0.02);
  float haze = exp(-edge * edge / 0.09) * 0.45;
  float fog = (core * (0.45 + 0.55 * body) + haze * (0.6 + 0.4 * body)) * (1.0 - smoothstep(0.75, 1.0, uReveal));
  vec2 away = d / max(r, 1e-4) / vec2(uAspect, 1.0);
  // the fog's bend, only once the film has its own framing: while it still is the photo, a bent copy over the photo
  // shows the runner twice where the edge crosses him
  vec2 f = frameRaw(vUv - away * core * 0.02 * (1.0 - uAlign));
  vec3 col = texture2D(uFrame, clamp(f, 0.0, 1.0)).rgb;
  // Past the frame's edge (the photo's framing shows more than the first frame, and the edges stay out of it while the
  // framing eases over): the photo itself, where the frame would be on it. Clamped, the frame's last row would smear
  // across in streaks. The seam starts a little inside the frame, since the film drifts off the photo once the
  // runner sets off; it narrows to the edge as the film takes its own framing (which never shows past it).
  vec2 past = max(-f, f - 1.0);
  float off = smoothstep(-0.05 * uAlign, 0.0005, max(past.x, past.y)) * uHasPhoto;
  if (off > 0.0) col = mix(col, texture2D(uPhoto, clamp(uAPos + f * uASize, 0.0, 1.0)).rgb, off);
  fog = clamp(fog, 0.0, 1.0);
  col = mix(col, uFog * (0.94 + 0.06 * body), fog * 0.85); // a touch brighter where it's thick
  col += dither() * step(0.002, fog); // the haze's long soft falloff, without bands
  // Nothing before the hand-off: while the stage still rises over the descent (reveal 0) the torn edge would open a
  // patch of film around the runner's place on the stage, low on the screen: a second runner. Then in over a moment,
  // so the first wisps don't pop.
  float a = clamp(max(inside, fog * 0.92), 0.0, 1.0) * smoothstep(0.0, 0.06, uReveal);
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
  /** The HQ film's first frame on the photo, and its width / height: the depth is in its frame. */
  film: RunAlign & { aspect: number };
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
  private depthMap: FilmDepth | null = null;
  private frames: WebGLTexture[] = []; // two: the frame showing (unit 0) and the one before (unit 3, for the blur)
  private cur = 0;
  private last = '';
  private unshed = onShed(() => this.fit());

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
    // the frame showing becomes the one before, and the new one goes into the other texture
    this.cur = 1 - this.cur;
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.frames[1 - this.cur]);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.frames[this.cur]);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, src);
    if (src.width !== this.tex.w || src.height !== this.tex.h || align !== this.align) {
      this.tex = { w: src.width, h: src.height };
      this.align = align;
      this.fit();
    }
    this.last = '';
  }

  /** The trail photo the film opens from, for what the photo's framing shows past the film's frame. */
  photo(img: HTMLImageElement) {
    const gl = this.gl;
    if (!gl) return;
    this.texture(2, gl.RGB, img);
    gl.uniform1f(this.u.uHasPhoto, 1);
    this.last = '';
  }

  /** The film's depth (src/effects/film-depth.ts) for the ring's edge, from the decoded atlas. */
  depth(img: HTMLImageElement, info: FilmDepth) {
    const gl = this.gl;
    if (!gl) return;
    this.texture(1, gl.LUMINANCE, img);
    gl.uniform2f(this.u.uDGrid, info.cols, info.rows);
    gl.uniform1f(this.u.uDCount, info.count);
    gl.uniform2f(this.u.uDTexel, info.cols / img.width, info.rows / img.height);
    this.depthMap = info;
    this.last = '';
  }


  /**
   * `aside` (0–1): how far the film has stepped aside for a section reading over it; `t` (0–1): the film's
   * progress, for its depth; `blur` (0–1): how fast it's being flicked through (see MOTION BLUR above).
   */
  draw(reveal: number, aside = 0, t = 0, blur = 0) {
    const gl = this.gl;
    if (!gl || !this.tex.w) return;
    // while the ring is open its fog drifts, so it redraws every frame; otherwise only when something changed
    const opening = reveal > 0 && reveal < 1;
    const time = opening ? performance.now() / 1000 : 0;
    const D = this.depthMap;
    const amount = D ? tuning.run.depth : 0;
    const b = blur * tuning.run.blur;
    const key = `${reveal}|${aside}|${time}|${t}|${amount}|${b}`;
    if (key === this.last) return;
    this.last = key;
    gl.uniform1f(this.u.uBlur, b);
    gl.uniform1f(this.u.uGhost, Math.min(0.45, b * 0.4));
    gl.uniform1f(this.u.uDepthAmt, amount);
    if (D) gl.uniform1f(this.u.uDFrame, clamp(t / D.until, 0, 1) * (D.count - 1));
    gl.uniform1f(this.u.uTime, time % 1000);
    gl.uniform1f(this.u.uReveal, reveal);
    gl.uniform1f(this.u.uAside, aside);
    gl.uniform1f(this.u.uAlign, 1 - smoothstep(RUN_STILL_UNTIL, 1, reveal));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** An image on texture unit `unit` (the film's frames stay on unit 0, where upload() writes). */
  private texture(unit: number, format: GLenum, img: TexImageSource) {
    const gl = this.gl!;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, format, format, gl.UNSIGNED_BYTE, img);
    gl.activeTexture(gl.TEXTURE0);
  }

  destroy() {
    this.unshed();
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
    frame.push('uAPos', 'uASize', 'uAlign', 'uFocus', 'uZoom', 'uTime');
    const depth = ['uPhoto', 'uHasPhoto', 'uDepth', 'uDepthAmt', 'uDGrid', 'uDTexel', 'uDFrame', 'uDCount'];
    const film = ['uMPos', 'uMSize'];
    const blur = ['uPrev', 'uBlur', 'uGhost', 'uFoe'];
    for (const name of [...frame, ...depth, ...film, ...blur, 'uOrigin', 'uAspect', 'uReveal', 'uReach', 'uFog']) {
      this.u[name] = gl.getUniformLocation(prog, name);
    }
    for (const unit of [3, 0]) {
      const tex = gl.createTexture()!;
      this.frames.push(tex);
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    this.cur = 1; // frames[1] on unit 0, frames[0] on unit 3
    gl.uniform1i(this.u.uPrev, 3);
    gl.uniform1i(this.u.uFrame, 0);
    gl.uniform1i(this.u.uDepth, 1);
    gl.uniform1i(this.u.uPhoto, 2);
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
    const ratio = Math.min(window.devicePixelRatio || 1, MAX_DPR) * shed.scale; // fewer if frames run late (core/governor.ts)
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
    // the HQ film's frame on the photo, where the depth is
    const M = this.place.film;
    gl.uniform2f(this.u.uMPos, M.x, M.y);
    gl.uniform2f(this.u.uMSize, M.w, (M.w * photo.width) / (M.aspect * photo.height));
    // screen → frame, the film's own cover framing, around the runner where he is in the frame
    const fx = clamp((F.x - A.x) / size[0], 0, 1);
    const fy = clamp((F.y - A.y) / size[1], 0, 1);
    gl.uniform2f(this.u.uFoe, fx, fy); // the motion blur streaks toward him: the trail runs off ahead there
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
