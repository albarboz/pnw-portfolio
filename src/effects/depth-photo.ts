/** Where the camera sits. 1 / 0 / 0 / 0 draws the photo exactly as its <img> would. */
export interface DepthCamera {
  /** Zoom of the whole frame around the <img>'s transform-origin. */
  zoom: number;
  /** Extra zoom for near pixels only (0.3 = the nearest grow 30% more than the farthest): a dolly forward. */
  dolly: number;
  /** Camera slide in CSS px. Near pixels move this far one way, far pixels part of it the other way. */
  x: number;
  y: number;
}

/** Depth that stays put when the camera slides (0 = far, 1 = near): about the runner's distance. */
const FOCUS = 0.45;
/** Past 1.5× device pixels the photo has no more detail to give, so a sharper canvas only costs GPU time. */
const MAX_DPR = 1.5;

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

// For each screen point, find the photo point that lands on it. Its depth decides how far it moved,
// so iterate: guess, read the depth there, re-solve. Damped, so it settles at silhouettes instead of flickering.
const FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uColor;
uniform sampler2D uDepth;
uniform vec2 uScale, uOffset, uOrigin, uShift;
uniform float uZoom, uDolly, uFocus;
vec2 photo(vec2 s) { return uOffset + s * uScale; }
void main() {
  vec2 s = vUv;
  float d = texture2D(uDepth, photo(s)).r;
  for (int i = 0; i < 5; i++) {
    s = uOrigin + (vUv - uOrigin - uShift * (d - uFocus)) / (uZoom * (1.0 + uDolly * d));
    d = mix(d, texture2D(uDepth, photo(s)).r, 0.6);
  }
  gl_FragColor = vec4(texture2D(uColor, clamp(photo(s), 0.0, 1.0)).rgb, 1.0);
}`;

/**
 * A cover photo redrawn in WebGL with a "2.5D" camera: every pixel moves by its depth (tools/depth-map.py),
 * so a zoom or slide opens up the scene instead of sliding a flat print.
 * The <img> stays in the page as the fallback: `onActive(true)` means the canvas has taken over and the
 * <img> can be hidden. No WebGL, a missing depth map or a lost context leave the <img> showing.
 * Reads object-position and transform-origin from the <img>'s CSS, so both always frame the photo the same way.
 */
export class DepthPhoto {
  private gl: WebGLRenderingContext | null;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private texSize = { w: 1, h: 1 };
  private view = { vw: 0, vh: 0 };
  private last = '';
  active = false;

  constructor(
    private canvas: HTMLCanvasElement,
    private img: HTMLImageElement,
    depthSrc: string | undefined,
    private onActive: (active: boolean) => void,
  ) {
    this.gl = depthSrc
      ? canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, powerPreference: 'low-power' })
      : null;
    if (this.gl && !this.init(this.gl)) this.gl = null;
    if (!this.gl || !depthSrc) return;
    canvas.addEventListener('webglcontextlost', this.onLost);
    this.load(depthSrc);
  }

  /** Size the canvas to a vw × vh stage. */
  resize(vw: number, vh: number) {
    this.view = { vw, vh };
    this.fitCanvas();
  }

  draw(cam: DepthCamera) {
    const gl = this.gl;
    if (!gl || !this.active) return;
    const key = `${cam.zoom}|${cam.dolly}|${cam.x}|${cam.y}`;
    if (key === this.last) return;
    this.last = key;
    gl.uniform2f(this.u.uShift, cam.x / this.view.vw, cam.y / this.view.vh);
    gl.uniform1f(this.u.uZoom, cam.zoom);
    gl.uniform1f(this.u.uDolly, cam.dolly);
    gl.uniform1f(this.u.uFocus, FOCUS);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  destroy() {
    this.canvas.removeEventListener('webglcontextlost', this.onLost);
    this.setActive(false);
    this.gl?.getExtension('WEBGL_lose_context')?.loseContext();
    this.gl = null;
  }

  private init(gl: WebGLRenderingContext) {
    const shader = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
    gl.useProgram(prog);

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW); // one full-screen triangle
    const aPos = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    for (const name of ['uColor', 'uDepth', 'uScale', 'uOffset', 'uOrigin', 'uShift', 'uZoom', 'uDolly', 'uFocus']) {
      this.u[name] = gl.getUniformLocation(prog, name);
    }
    [0, 1].forEach((unit) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    });
    gl.uniform1i(this.u.uColor, 0);
    gl.uniform1i(this.u.uDepth, 1);
    return true;
  }

  /** Upload the photo and its depth map. Until both are in, the <img> keeps showing. */
  private async load(depthSrc: string) {
    // The <img> may get its src late (data-defer in src/ui/content.ts); fetch the depth map once it has one.
    if (!this.img.getAttribute('src')) await new Promise((r) => this.img.addEventListener('load', r, { once: true }));
    const depth = new Image();
    depth.src = depthSrc;
    const ok = await Promise.all([this.img.decode(), depth.decode()]).then(
      () => true,
      () => false,
    );
    const gl = this.gl;
    if (!ok || !gl) return; // missing file, or destroyed meanwhile
    [this.img, depth].forEach((im, unit) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, im);
    });
    this.texSize = { w: this.img.naturalWidth, h: this.img.naturalHeight };
    this.fitCanvas();
    this.setActive(true);
  }

  /** Canvas size and the frame uniforms: cover-fit the photo exactly like the <img>'s CSS does. */
  private fitCanvas() {
    const gl = this.gl;
    const { vw, vh } = this.view;
    const { w: tw, h: th } = this.texSize;
    if (!gl || !vw || !vh) return;
    this.last = '';
    const cover = Math.max(vw / tw, vh / th); // CSS px per photo px
    // as many device pixels as the screen can show, but no more than the photo has to give
    const ratio = Math.min(window.devicePixelRatio || 1, MAX_DPR, Math.max(1, 1 / cover));
    this.canvas.width = Math.round(vw * ratio);
    this.canvas.height = Math.round(vh * ratio);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);

    const sx = vw / (tw * cover);
    const sy = vh / (th * cover);
    const css = getComputedStyle(this.img);
    const [px, py] = css.objectPosition.split(' ').map((v) => parseFloat(v) / 100);
    const [ox, oy] = css.transformOrigin.split(' ').map(parseFloat);
    gl.uniform2f(this.u.uScale, sx, sy);
    gl.uniform2f(this.u.uOffset, (1 - sx) * (px || 0.5), (1 - sy) * (py || 0.5));
    gl.uniform2f(this.u.uOrigin, ox / vw || 0.5, oy / vh || 0.5);
  }

  private setActive(on: boolean) {
    if (this.active === on) return;
    this.active = on;
    this.onActive(on);
  }

  private onLost = (e: Event) => {
    e.preventDefault();
    this.gl = null; // the <img> takes over for the rest of the visit
    this.setActive(false);
  };
}
