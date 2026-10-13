import {
  Mesh,
  NoBlending,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { cssRgb } from '../core/tokens';
import type { FogOptions } from './fog';

const VERT = `
varying vec2 vUv;
void main() {
  vUv = vec2(uv.x, 1.0 - uv.y); // y down, like the page
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

// Three slices of fbm noise at different depths. Rush flies the camera forward: every slice grows as it
// comes closer and fades out as it passes, then returns at the back with a fresh pattern. The sin² fades of
// three evenly spaced slices always add up to 1.5, so the fog keeps the same thickness while it streams by.
const FRAG = `
precision highp float;
varying vec2 vUv;
uniform vec2 uRes;
uniform vec2 uOffset;
uniform vec3 uTint;
uniform float uTime, uDensity, uRush, uYMin, uSeed;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
float fbm(vec3 p) {
  float sum = 0.0, amp = 0.5;
  for (int i = 0; i < 5; i++) {
    sum += amp * noise(p);
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    amp *= 0.5;
  }
  return sum;
}

void main() {
  vec2 c = vUv - 0.5;
  c.x *= uRes.x / uRes.y; // square units, 1 = the canvas height
  float thick = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float z = (fi + 0.5) / 3.0 + uRush * 0.9;
    float phase = fract(z); // 0 = far, 1 = passing the camera
    float seed = uSeed + floor(z) * 7.31 + fi * 3.7;
    vec2 p = (c - uOffset * (0.3 + phase)) / exp2(phase * 2.0);
    p.x += uTime * (0.012 + 0.006 * fi) * (mod(fi, 2.0) < 0.5 ? 1.0 : -1.0);
    vec3 q = vec3(p * vec2(1.3, 2.9), seed + uTime * 0.04); // stretched flat, like valley fog
    q.xy += 0.6 * vec2(noise(q * 0.7 + 4.0), noise(q * 0.7 + 9.0)) - 0.3; // a little warp makes wisps
    float s = 0.04 + 0.96 * smoothstep(0.34, 0.78, fbm(q)); // a breath of haze, then wisps with clear air between
    float w = sin(3.14159265 * phase);
    thick += s * w * w / 1.5;
  }
  // Real mist drifts in banks: a slow, large pattern thins it to a third in places so it never reads as a flat veil.
  float bank = smoothstep(0.3, 0.75, noise(vec3(c * vec2(0.8, 1.7) + vec2(uTime * 0.008, 0.0), uSeed + 50.0 + uTime * 0.015)));
  // Less air between you and the nearest trees: the fog thins toward the bottom of the frame.
  float near = smoothstep(0.62, 1.0, vUv.y);
  // Over the overlook the fog lies low in the valley; as we fly into it, it fills the frame evenly.
  float inside = smoothstep(0.0, 1.0, uRush);
  float band = smoothstep(uYMin - 0.15, uYMin + 0.3, vUv.y) * mix(0.35, 1.0, bank) * (1.0 - 0.45 * near);
  thick *= mix(band, 1.0, inside);
  float a = 1.0 - exp(-thick * pow(uDensity, 0.7) * 1.4);
  gl_FragColor = vec4(uTint * a, a); // premultiplied, like the canvas expects
}`;

/**
 * Shader fog: full-screen fbm noise in three slices that stream past the camera on `rush`.
 * Same knobs as the canvas `Fog` (`density`, `rush`, `offsetX/Y`, `draw(time)`), so the scene drives either.
 * The constructor throws without WebGL; `onLost` fires if the GPU drops the context later.
 */
export class Fog3D {
  density = 0.4;
  rush = 0;
  offsetX = 0;
  offsetY = 0;

  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new OrthographicCamera();
  private material: ShaderMaterial;
  private opts: Required<FogOptions>;
  private last = ''; // inputs of the frame on the canvas, so a still frame (reduced motion) is drawn once
  private size = new Vector2(2, 2);

  constructor(
    private canvas: HTMLCanvasElement,
    options: FogOptions = {},
    private onLost: () => void = () => {},
  ) {
    this.opts = { count: 0, tint: '--fog', resolution: 0.33, yMin: 0.15, ...options };
    this.renderer = new WebGLRenderer({
      canvas,
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'low-power',
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(this.opts.resolution);
    const [r, g, b] = cssRgb(this.opts.tint);
    // Raw sRGB tint: a plain ShaderMaterial skips three's color management, so the canvas gets these values as-is.
    this.material = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      blending: NoBlending,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uRes: { value: this.size },
        uOffset: { value: new Vector2() },
        uTint: { value: new Vector3(r / 255, g / 255, b / 255) },
        uTime: { value: 0 },
        uDensity: { value: 0 },
        uRush: { value: 0 },
        uYMin: { value: this.opts.yMin },
        uSeed: { value: Math.random() * 100 },
      },
    });
    this.scene.add(new Mesh(new PlaneGeometry(2, 2), this.material));
    canvas.addEventListener('webglcontextlost', this.lost);
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.size.set(Math.max(2, rect.width), Math.max(2, rect.height));
    this.renderer.setSize(this.size.x, this.size.y, false); // CSS keeps it at 100%
    this.last = '';
  }

  clear() {
    if (this.last === 'clear') return;
    this.renderer.clear();
    this.last = 'clear';
  }

  /** @param time seconds; pass 0 for a still frame */
  draw(time: number) {
    if (this.density <= 0.005) return this.clear();
    const key = `${time}|${this.density}|${this.rush}|${this.offsetX}|${this.offsetY}`;
    if (key === this.last) return;
    this.last = key;
    const u = this.material.uniforms;
    u.uTime.value = time;
    u.uDensity.value = this.density;
    u.uRush.value = this.rush;
    // the canvas fog's parallax: up to 40 × 20 CSS px for the nearest fog, in canvas-height units
    (u.uOffset.value as Vector2).set((this.offsetX * 40) / this.size.y, (this.offsetY * 20) / this.size.y);
    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    this.canvas.removeEventListener('webglcontextlost', this.lost);
    this.scene.traverse((o) => (o as Mesh).geometry?.dispose());
    this.material.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  private lost = () => this.onLost();
}
