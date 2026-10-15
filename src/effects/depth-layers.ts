import {
  Color,
  LinearFilter,
  Mesh,
  NormalBlending,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Texture,
  Vector2,
  Vector4,
  WebGLRenderer,
} from 'three';
import { onShed, shed } from '../core/governor';
import { cssRgb } from '../core/tokens';

/**
 * Full device pixels, like the <img> cutouts this replaces: a smaller canvas stretched to fit softens the photo
 * the moment it takes over. (It only redraws when the view changes.)
 */
const MAX_DPR = 3;

// Each vertex of a grid over the photo is pushed back along its own ray by its depth, so at rest every pixel
// lands exactly where it is in the photo, whatever the depth or the field of view. The photo is spread across
// each triangle flat on screen: at rest that is exact, while the usual perspective-correct spread shifts it by
// a fraction of a pixel in triangles that span a depth jump (a ridge against the sky). WebGL has no
// noperspective, so vUvW carries uv × w and w, and the fragment shader divides the GPU's correction back out.
// The depth map is smoothed here (5×5 taps, `uSmooth` = the radius in uv): a near tree right in front of a farther
// slope is a step in depth, and the triangles across that step stretch into streaks as the camera moves. Smoothed,
// the step becomes a ramp and the tree leans a little instead. The rest view stays exact either way.
const VERT = `
uniform sampler2D uDepth;
uniform vec2 uTan; // tan of half the photo's field of view, across and up
uniform vec2 uInv; // inverse distance = uInv.x × depth + uInv.y (the dive target at 1)
uniform vec2 uSmooth; // depth smoothing radius, across and down, in uv
varying vec3 vUvW;
varying vec2 vDist; // distance at rest, distance now: both vary linearly across a triangle, so they interpolate exactly
void main() {
  float e = 0.0, sum = 0.0;
  for (int i = -2; i <= 2; i++) {
    for (int j = -2; j <= 2; j++) {
      vec2 o = vec2(float(i), float(j)) * 0.5;
      float wt = exp(-2.0 * dot(o, o));
      e += wt * texture2D(uDepth, uv + o * uSmooth).r;
      sum += wt;
    }
  }
  e /= sum;
  float z = 1.0 / (uInv.x * e * e + uInv.y); // stored as the square root (tools/layer-depth.py)
  vec4 mv = modelViewMatrix * vec4(vec3((uv - 0.5) * 2.0 * uTan, -1.0) * z, 1.0);
  vDist = vec2(z, -mv.z);
  gl_Position = projectionMatrix * mv;
  vUvW = vec3(uv * gl_Position.w, gl_Position.w);
}`;

// Premultiplied, like the browser draws the <img> cutouts: their soft edges blend the same way.
// A point the camera flies up to fades out (3.5× → 7× nearer) instead of filling the frame with blur. Taken per
// pixel, not per vertex: the foreground stands nearer than the camera flies, and a triangle the camera is passing
// through spans from "far ahead" to "just passed", so a per-vertex fade misses parts of it.
// DETAIL (the far layer, once its sharper middle has loaded): blends that in by `uMix`, feathered at its edges.
// uRect is where it sits in uv (which runs up from the bottom, like the textures).
const FRAG = `
uniform sampler2D uColor;
#ifdef DETAIL
uniform sampler2D uDetail;
uniform vec4 uRect;
uniform float uMix;
#endif
varying vec3 vUvW;
varying vec2 vDist;
void main() {
  vec2 uv = vUvW.xy / vUvW.z;
  vec4 c = texture2D(uColor, uv);
#ifdef DETAIL
  vec2 d = (uv - uRect.xy) / uRect.zw;
  float edge = min(min(d.x, 1.0 - d.x), min(d.y, 1.0 - d.y));
  float k = uMix * smoothstep(0.0, 0.05, edge);
  if (k > 0.0) c.rgb = mix(c.rgb, texture2D(uDetail, d).rgb, k); // the far layer is opaque
#endif
  gl_FragColor = c * (1.0 - smoothstep(3.5, 7.0, vDist.x / max(vDist.y, 1e-4)));
}`;

/** Where a detail image sits on its layer, as fractions of the photo from the top left. */
export interface DetailRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One cutout and the depth map that goes with it. */
export interface DepthLayer {
  img: HTMLImageElement;
  depth: string;
  /** Grid size across; the rows follow the photo's shape. More = finer depth, more vertices. */
  grid: number;
}

/**
 * Where the camera is, in the photo's frame: the photo at cover size (`w` × `h` px), the stage's window into it
 * (`vw` × `vh` px at `left`, `top`), the dive target (`target`, 0–1 of the photo, at distance 1), how far the
 * camera has flown toward it (`travel`, 0–1), the lens zoom around it (`zoom`), and the camera's sideways
 * offset (`x`, `y`, in the same units). `fov` is the photo's vertical field of view in degrees; `sky` how far
 * the sky stands, × the dive target's distance; `smooth` how much the depth steps are softened; `detail` how much
 * of the far layer's sharper middle shows (0–1, see setDetail).
 */
export interface DepthView {
  w: number;
  h: number;
  vw: number;
  vh: number;
  left: number;
  top: number;
  target: { x: number; y: number };
  travel: number;
  zoom: number;
  x: number;
  y: number;
  fov: number;
  sky: number;
  /** Depth smoothing radius, as a fraction of the photo's width (tuning.photo3d.smooth). */
  smooth: number;
  detail: number;
}

/**
 * The overlook's far and mid cutouts as relief meshes in three.js, pushed back by their depth maps
 * (tools/layer-depth.py), back to front. At rest they draw exactly what the flat cutouts show; as the camera
 * flies in, near slopes and trees stream past while the valley opens up.
 * The constructor throws without WebGL; `loaded` rejects if a depth map can't be read; `onLost` fires if the
 * GPU drops the context later.
 */
export class DepthLayers {
  readonly loaded: Promise<void>;

  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(50, 1, 0.001, 100); // the nearest slope stands at ~0.05 of the dive target
  private materials: ShaderMaterial[] = [];
  private tan = new Vector2();
  private inv = new Vector2();
  private smooth = new Vector2(); // shared by every layer's material
  private detailMix = { value: 0 }; // shared with the far layer's material once it has a detail image
  private targetDepth = 0; // stored depth value at the dive target, read from the far layer's map
  private last = '';
  private size = { vw: 0, vh: 0 };
  private unshed = onShed(() => this.size.vw && this.resize(this.size.vw, this.size.vh));

  constructor(
    private canvas: HTMLCanvasElement,
    layers: DepthLayer[],
    target: { x: number; y: number },
    private onLost: () => void,
  ) {
    // Opaque, cleared to the stage's fog: anything that fades out as the camera passes it fades into haze.
    this.renderer = new WebGLRenderer({ canvas, antialias: false, alpha: false, depth: false, stencil: false });
    const [r, g, b] = cssRgb('--fog');
    this.renderer.setClearColor(new Color().setRGB(r / 255, g / 255, b / 255));
    canvas.addEventListener('webglcontextlost', this.lost);

    const depths = layers.map((l) => {
      const im = new Image();
      im.src = l.depth;
      return im;
    });
    this.loaded = Promise.all(depths.map((im) => im.decode())).then(() => {
      this.targetDepth = sample(depths[0], target);
      layers.forEach((l, i) => this.addLayer(l, depths[i], i));
    });
  }

  resize(vw: number, vh: number) {
    this.size = { vw, vh };
    // fewer pixels if frames run late (core/governor.ts)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_DPR) * shed.scale);
    this.renderer.setSize(vw, vh, false); // CSS keeps it at 100%
    this.last = '';
  }

  draw(v: DepthView) {
    if (!this.materials.length) return;
    const key = Object.values(v).join('|');
    if (key === this.last) return;
    this.last = key;

    // Depth maps are relative (right up to a scale and an offset): pin the dive target at 1 and the sky at `sky`.
    const dT = this.targetDepth ** 2;
    this.inv.set((1 - 1 / v.sky) / Math.max(dT, 1e-4), 1 / v.sky);
    const ty = Math.tan(((v.fov / 2) * Math.PI) / 180);
    this.tan.set(ty * (v.w / v.h), ty);
    this.smooth.set(v.smooth, v.smooth * (v.w / v.h)); // same distance across and down
    this.detailMix.value = v.detail;

    const cam = this.camera;
    cam.fov = v.fov;
    cam.aspect = v.w / v.h;
    // The lens zoom scales the photo around the dive target, like the flat cutouts' CSS zoom does.
    const k = v.zoom;
    const tx = v.target.x * v.w;
    const tyPx = v.target.y * v.h;
    cam.setViewOffset(v.w * k, v.h * k, v.left + tx * (k - 1), v.top + tyPx * (k - 1), v.vw, v.vh);
    // Fly along the ray through the dive target (it stays put on screen); sway sideways with the pointer.
    cam.position.set((v.target.x - 0.5) * 2 * this.tan.x, -(v.target.y - 0.5) * 2 * ty, -1);
    cam.position.multiplyScalar(v.travel);
    cam.position.x += v.x;
    cam.position.y += v.y;
    this.renderer.render(this.scene, cam);
  }

  /** A sharper copy of part of the first (far) layer, blended in by `DepthView.detail`. Call once `loaded` resolves. */
  setDetail(img: HTMLImageElement, r: DetailRect) {
    const m = this.materials[0];
    if (!m) return;
    const tex = new Texture(img);
    tex.needsUpdate = true;
    m.uniforms.uDetail = { value: tex };
    m.uniforms.uRect = { value: new Vector4(r.x, 1 - r.y - r.h, r.w, r.h) };
    m.uniforms.uMix = this.detailMix;
    m.defines = { DETAIL: '' };
    m.needsUpdate = true;
    this.last = '';
  }

  destroy() {
    this.unshed();
    this.canvas.removeEventListener('webglcontextlost', this.lost);
    this.scene.traverse((o) => (o as Mesh).geometry?.dispose());
    this.materials.forEach((m) => {
      (m.uniforms.uColor.value as Texture).dispose();
      (m.uniforms.uDepth.value as Texture).dispose();
      (m.uniforms.uDetail?.value as Texture | undefined)?.dispose();
      m.dispose();
    });
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  private addLayer(layer: DepthLayer, depthImg: HTMLImageElement, order: number) {
    const color = new Texture(layer.img);
    color.premultiplyAlpha = true;
    color.needsUpdate = true;
    const depth = new Texture(depthImg);
    depth.minFilter = depth.magFilter = LinearFilter; // read in the vertex shader: no mipmaps
    depth.generateMipmaps = false;
    depth.needsUpdate = true;
    const material = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uColor: { value: color },
        uDepth: { value: depth },
        uTan: { value: this.tan },
        uInv: { value: this.inv },
        uSmooth: { value: this.smooth },
      },
      transparent: true,
      premultipliedAlpha: true,
      blending: NormalBlending,
      depthTest: false, // drawn back to front, layer by layer
      depthWrite: false,
    });
    const { naturalWidth: w, naturalHeight: h } = layer.img;
    const mesh = new Mesh(new PlaneGeometry(1, 1, layer.grid, Math.round((layer.grid * h) / w)), material);
    mesh.renderOrder = order;
    mesh.frustumCulled = false; // the vertex shader moves it; its bounds say nothing
    this.materials.push(material);
    this.scene.add(mesh);
  }

  private lost = () => this.onLost();
}

/** The depth map's value (0–1, as stored) at a point given as a fraction of the photo. */
function sample(img: HTMLImageElement, p: { x: number; y: number }) {
  const c = document.createElement('canvas');
  c.width = c.height = 1;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img, p.x * img.naturalWidth, p.y * img.naturalHeight, 1, 1, 0, 0, 1, 1);
  return ctx.getImageData(0, 0, 1, 1).data[0] / 255;
}
