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
  WebGLRenderer,
} from 'three';
import { cssRgb } from '../core/tokens';

/** Past 1.5× device pixels the photo has no more detail to give, so a sharper canvas only costs GPU time. */
const MAX_DPR = 1.5;

// Each vertex of a grid over the photo is pushed back along its own ray by its depth, so at rest every pixel
// lands exactly where it is in the photo, whatever the depth or the field of view.
const VERT = `
uniform sampler2D uDepth;
uniform vec2 uTan; // tan of half the photo's field of view, across and up
uniform vec2 uInv; // inverse distance = uInv.x × depth + uInv.y (the dive target at 1)
varying vec2 vUv;
varying float vPass;
void main() {
  vUv = uv;
  float e = texture2D(uDepth, uv).r;
  float z = 1.0 / (uInv.x * e * e + uInv.y); // stored as the square root (tools/layer-depth.py)
  vec4 mv = modelViewMatrix * vec4(vec3((uv - 0.5) * 2.0 * uTan, -1.0) * z, 1.0);
  vPass = z / max(-mv.z, 1e-4); // how much nearer the camera has flown to this point
  gl_Position = projectionMatrix * mv;
}`;

// Premultiplied, like the browser draws the <img> cutouts: their soft edges blend the same way.
// A point the camera flies up to fades out (3.5× → 7× nearer) instead of filling the frame with blur.
const FRAG = `
uniform sampler2D uColor;
varying vec2 vUv;
varying float vPass;
void main() {
  vec4 c = texture2D(uColor, vUv);
  gl_FragColor = c * (1.0 - smoothstep(3.5, 7.0, vPass));
}`;

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
 * the sky stands, × the dive target's distance.
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
  private targetDepth = 0; // stored depth value at the dive target, read from the far layer's map
  private last = '';

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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_DPR));
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

  destroy() {
    this.canvas.removeEventListener('webglcontextlost', this.lost);
    this.scene.traverse((o) => (o as Mesh).geometry?.dispose());
    this.materials.forEach((m) => {
      (m.uniforms.uColor.value as Texture).dispose();
      (m.uniforms.uDepth.value as Texture).dispose();
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
      uniforms: { uColor: { value: color }, uDepth: { value: depth }, uTan: { value: this.tan }, uInv: { value: this.inv } },
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
