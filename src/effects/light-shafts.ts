import { linkProgram } from './gl-program';

/** Where the light comes from and how it falls. Positions are fractions of the photo (0, 0 = top left). */
export interface ShaftSettings {
  x: number;
  y: number;
  /** How far each shaft reaches back toward the light: 1 = all the way. */
  length: number;
  /** How bright a far pixel must be (0–1 luminance) to let light through. */
  threshold: number;
  /** How wide the light is, as a fraction of the photo: wider = beams that feather out as they fall. */
  softness: number;
}

/** Bake size × the photo's. The shafts are soft, so a quarter is plenty and the one-off bake stays cheap. */
const SCALE = 0.25;
/** Texture unit the baked shafts live on; the photo and its depth map use 0 and 1. */
export const SHAFT_UNIT = 2;

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5; // texel row t holds photo row t, so the photo shader reads both with the same uv
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

// For each photo point, walk toward the light and average what shines through on the way: bright gaps
// between dark trunks become streaks. Only bright AND far pixels let light in, so the misty gaps glow but a
// pale jacket up close doesn't. The light has a width (uSoft): each step aims at a different point across it,
// so a beam starts at its gap and feathers out the farther it falls, like sun spread by mist.
const FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uColor;
uniform sampler2D uDepth;
uniform vec2 uLight;
uniform float uLength, uThreshold, uSoft;
const int N = 96;
float source(vec2 p) {
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) return 0.0;
  float lum = dot(texture2D(uColor, p).rgb, vec3(0.299, 0.587, 0.114));
  float far = 1.0 - smoothstep(0.12, 0.4, texture2D(uDepth, p).r);
  return smoothstep(uThreshold, uThreshold + 0.15, lum) * far;
}
void main() {
  vec2 dir = uLight - vUv;
  vec2 across = normalize(vec2(-dir.y, dir.x));
  float sum = 0.0, total = 0.0, w = 1.0;
  for (int i = 0; i < N; i++) {
    float t = (float(i) + 0.5) / float(N) * uLength;
    // spread evenly across the light's width, in the same order for every texel: random spreads speckle,
    // and the spread already hides the stacked copies a fixed step would show
    float side = fract(float(i) * 0.618034) - 0.5;
    sum += source(vUv + dir * t + across * side * uSoft * t) * w;
    total += w;
    w *= 0.98;
  }
  // keep the beams, drop the even glow under them, so clear mist shows between them
  gl_FragColor = vec4(vec3(smoothstep(0.08, 0.5, sum / total)), 1.0);
}`;

/**
 * Sun shafts for a photo, baked once into a small texture (on SHAFT_UNIT) that the photo shader adds on top.
 * They belong to the photo, not the camera, so nothing is redrawn per frame; settings changes re-bake.
 * Expects the photo on texture unit 0 and its depth map on unit 1.
 */
export class LightShafts {
  private u: Record<string, WebGLUniformLocation | null> = {};
  private fbo: WebGLFramebuffer;
  private tex: WebGLTexture;
  private last = '';

  private constructor(
    private gl: WebGLRenderingContext,
    private prog: WebGLProgram,
  ) {
    for (const name of ['uColor', 'uDepth', 'uLight', 'uLength', 'uThreshold', 'uSoft']) {
      this.u[name] = gl.getUniformLocation(prog, name);
    }
    gl.useProgram(prog);
    gl.uniform1i(this.u.uColor, 0);
    gl.uniform1i(this.u.uDepth, 1);

    this.tex = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0 + SHAFT_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // black until the first bake, so the photo shader can sample it from the start
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    this.fbo = gl.createFramebuffer()!;
  }

  static create(gl: WebGLRenderingContext) {
    const prog = linkProgram(gl, VERT, FRAG);
    return prog ? new LightShafts(gl, prog) : null;
  }

  /**
   * Bake for a photo of w × h pixels, unless these settings are already baked. Returns true if it drew:
   * the caller then has to restore its own program and viewport.
   */
  bake(w: number, h: number, s: ShaftSettings) {
    const key = `${w}|${h}|${s.x}|${s.y}|${s.length}|${s.threshold}|${s.softness}`;
    if (key === this.last) return false;
    const gl = this.gl;
    const bw = Math.max(1, Math.round(w * SCALE));
    const bh = Math.max(1, Math.round(h * SCALE));
    if (!this.last.startsWith(`${w}|${h}|`)) {
      gl.activeTexture(gl.TEXTURE0 + SHAFT_UNIT);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, bw, bh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, 0);
    }
    this.last = key;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, bw, bh);
    gl.useProgram(this.prog);
    gl.uniform2f(this.u.uLight, s.x, s.y);
    gl.uniform1f(this.u.uLength, s.length);
    gl.uniform1f(this.u.uThreshold, s.threshold);
    gl.uniform1f(this.u.uSoft, s.softness);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return true;
  }
}
