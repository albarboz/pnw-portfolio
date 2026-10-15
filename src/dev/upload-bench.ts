import { BlobSource, Input, MP4, VideoSampleSink, type VideoSample } from 'mediabunny';
import { site } from '../content/site';

/** Frames timed per route (the first few are left out: the GPU warms up on them). */
const FRAMES = 40;
const WARMUP = 4;
/** Frames the decoder is asked for while none are closed, to see if it stalls (the direct route would hold ~16). */
const HOLD = 20;

/**
 * Dev only, `?bench=upload` on a phone: how long each route takes to get a decoded film frame into a WebGL texture,
 * shown on screen (no Web Inspector needed). The page itself doesn't boot, so nothing else competes.
 * - canvas: drawn into a 2D canvas, then uploaded from it (what src/effects/video-frames.ts does now)
 * - direct: the decoder's VideoFrame uploaded as is
 * - bitmap: the VideoFrame turned into an ImageBitmap, then uploaded
 * Each route's centre pixel is compared with the canvas route's, so a route that "works" but uploads black shows.
 */
export async function runUploadBench() {
  const out = document.createElement('pre');
  Object.assign(out.style, {
    position: 'fixed',
    inset: '0',
    margin: '0',
    padding: '16px',
    zIndex: '99999',
    overflow: 'auto',
    font: '13px/1.45 ui-monospace, monospace',
    whiteSpace: 'pre-wrap',
    background: 'Canvas',
    color: 'CanvasText',
  });
  document.body.append(out);
  const log = (s: string) => (out.textContent += s + '\n');

  log(navigator.userAgent);
  log(`screen ${innerWidth}×${innerHeight} @${devicePixelRatio}×`);
  if (!('VideoDecoder' in window)) return log('no WebCodecs here');

  log('downloading the phone film…');
  const blob = await (await fetch(site.run.phone.video)).blob();
  const input = new Input({ formats: [MP4], source: new BlobSource(blob) });
  const track = (await input.getPrimaryVideoTrack())!;
  const sink = new VideoSampleSink(track);
  const w = track.displayWidth;
  const h = track.displayHeight;
  log(`film ${w}×${h}\n`);

  const gl = document.createElement('canvas').getContext('webgl', { antialias: false, depth: false })!;
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  for (const [k, v] of [
    [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE],
    [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE],
    [gl.TEXTURE_MIN_FILTER, gl.LINEAR],
  ])
    gl.texParameteri(gl.TEXTURE_2D, k, v);
  const fb = gl.createFramebuffer();
  const upload = (src: TexImageSource) => {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, src);
    gl.finish(); // wait for the GPU, so the time is the whole upload
    return gl.getError();
  };
  /** The texture's centre pixel, read back through a framebuffer. */
  const centre = () => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const px = new Uint8Array(4);
    gl.readPixels(w >> 1, h >> 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return [...px.slice(0, 3)];
  };

  const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = canvas.getContext('2d', { alpha: false })!;

  type Route = (s: VideoSample) => Promise<{ prep: number; up: number; err: number }>;
  const routes: [string, Route][] = [
    [
      'canvas',
      async (s) => {
        const t0 = performance.now();
        s.draw(ctx, 0, 0, w, h);
        const t1 = performance.now();
        const err = upload(canvas);
        return { prep: t1 - t0, up: performance.now() - t1, err };
      },
    ],
    [
      'direct',
      async (s) => {
        const t0 = performance.now();
        const f = s.toVideoFrame();
        const t1 = performance.now();
        try {
          const err = upload(f);
          return { prep: t1 - t0, up: performance.now() - t1, err };
        } finally {
          f.close();
        }
      },
    ],
    [
      'bitmap',
      async (s) => {
        const t0 = performance.now();
        const f = s.toVideoFrame();
        const b = await createImageBitmap(f);
        f.close();
        const t1 = performance.now();
        const err = upload(b);
        b.close();
        return { prep: t1 - t0, up: performance.now() - t1, err };
      },
    ],
  ];

  const stat = (a: number[]) => {
    const s = [...a].sort((x, y) => x - y);
    return `median ${s[s.length >> 1].toFixed(1)} ms, p90 ${s[Math.floor(s.length * 0.9)].toFixed(1)} ms`;
  };
  let reference: number[] | null = null;
  for (const [name, route] of routes) {
    const prep: number[] = [];
    const up: number[] = [];
    let i = 0;
    let failed = '';
    let pixel: number[] = [];
    try {
      for await (const s of sink.samples(0)) {
        try {
          const r = await route(s);
          if (r.err) failed = `GL error ${r.err}`;
          if (i === WARMUP) pixel = centre();
          if (i >= WARMUP) {
            prep.push(r.prep);
            up.push(r.up);
          }
        } finally {
          s.close();
        }
        if (failed || ++i >= FRAMES + WARMUP) break;
      }
    } catch (e) {
      failed = String(e);
    }
    if (failed) {
      log(`${name}: FAILED (${failed})\n`);
      continue;
    }
    reference ??= pixel;
    const same = pixel.every((v, k) => Math.abs(v - reference![k]) <= 6);
    log(`${name}`);
    log(`  prepare: ${stat(prep)}`);
    log(`  upload:  ${stat(up)}`);
    log(`  total:   ${stat(prep.map((p, k) => p + up[k]))}`);
    log(`  centre pixel ${pixel.join(',')} ${same ? '(matches canvas)' : '(DIFFERENT from canvas!)'}\n`);
  }

  // Does the decoder keep going while frames are held open?
  log(`holding ${HOLD} frames open…`);
  const held: VideoSample[] = [];
  const it = sink.samples(0);
  const timeout = new Promise<'stalled'>((r) => setTimeout(() => r('stalled'), 4000));
  while (held.length < HOLD) {
    const r = await Promise.race([it.next(), timeout]);
    if (r === 'stalled' || r.done) break;
    held.push(r.value);
  }
  log(`  got ${held.length} of ${HOLD}${held.length < HOLD ? ' (the decoder stalls: the direct route needs a copy)' : ''}`);
  held.forEach((s) => s.close());
  void it.return();
  input.dispose();
  log('\ndone: screenshot this and send it');
}
