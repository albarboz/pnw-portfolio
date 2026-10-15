import { Pane } from 'tweakpane';
import { ScrollTrigger } from '../core/scroll';
import { tuning } from '../core/tuning';
import { site } from '../content/site';

/**
 * Dev-only slider panel (`npm run dev`, top right): tune the descent by feel while the page runs.
 * Edits `tuning` (src/core/tuning.ts) and `site.descent.diveZoom` in place; "Copy values" puts the current
 * numbers on the clipboard (and in the console) to paste back into those files. Never part of the build.
 */
export function createTunePanel() {
  // Fixed, so it stays in the corner while you scroll through the dive (Tweakpane's own wrapper scrolls away).
  const host = document.createElement('div');
  host.style.cssText = 'position: fixed; top: 16px; right: 16px; width: 280px; z-index: 100;';
  document.body.append(host);
  const pane = new Pane({ title: 'Tune', expanded: false, container: host });
  const dispose = pane.dispose.bind(pane);
  pane.dispose = () => {
    dispose();
    host.remove();
  };

  const fog = pane.addFolder({ title: 'Fog' });
  fog.addBinding(tuning.fog, 'strength', { min: 0.2, max: .80, step: 0.05 });
  fog.addBinding(tuning.fog, 'haze', { min: 0, max: 0.4, step: 0.01 });
  fog.addBinding(tuning.fog, 'banks', { label: 'clear patches', min: 0, max: 1, step: 0.01 });
  fog.addBinding(tuning.fog, 'near', { label: 'bottom fade', min: 0, max: 1, step: 0.01 });

  const dive = pane.addFolder({ title: 'Dive (length in screens)' });
  dive
    .addBinding(tuning, 'scroll', { label: 'length', min: 2, max: 6, step: 0.1 })
    .on('change', (e) => e.last && ScrollTrigger.refresh()); // re-measure once the slider is let go
  // ≤ 3: the 1792 px overlook gets soft beyond that (CLAUDE.md)
  dive.addBinding(site.descent, 'diveZoom', { label: 'zoom', min: 1.5, max: 3, step: 0.05 });

  const sign = pane.addFolder({ title: 'Trail sign trip (seconds)' });
  sign.addBinding(tuning.sign, 'base', { min: 0.4, max: 2, step: 0.05 });
  sign.addBinding(tuning.sign, 'perScreen', { label: 'per screen', min: 0, max: 1.2, step: 0.05 });
  sign.addBinding(tuning.sign, 'max', { min: 1, max: 6, step: 0.1 });

  const depth = pane.addFolder({ title: 'Dolly depth (far = 1)' });
  depth.addBinding(tuning.dolly, 'mid', { label: 'fir & slope', min: 0.3, max: 1, step: 0.01 });
  depth.addBinding(tuning.dolly, 'near', { label: 'edge branches', min: 0.2, max: 1, step: 0.01 });

  const p3 = pane.addFolder({ title: 'Overlook in 3D' });
  p3.addBinding(tuning.photo3d, 'show', { label: 'show 3D' });
  p3.addBinding(tuning.photo3d, 'sky', { label: 'valley depth', min: 1.05, max: 6, step: 0.05 });
  p3.addBinding(tuning.photo3d, 'fly', { label: 'fly vs zoom', min: 0, max: 0.6, step: 0.01 });
  p3.addBinding(tuning.photo3d, 'near', { label: 'edge branches', min: 0.03, max: 0.5, step: 0.005 });
  p3.addBinding(tuning.photo3d, 'fov', { label: 'photo fov°', min: 20, max: 100, step: 0.5 });
  p3.addBinding(tuning.photo3d, 'sway', { label: 'pointer sway', min: 0, max: 0.01, step: 0.0005 });
  p3.addBinding(tuning.photo3d, 'smooth', { label: 'depth smoothing', min: 0, max: 0.05, step: 0.001 });

  const sh = pane.addFolder({ title: 'Trail light shafts' });
  sh.addBinding(tuning.shafts, 'strength', { min: 0, max: 1, step: 0.01 });
  sh.addBinding(tuning.shafts, 'x', { label: 'light x', min: 0, max: 1, step: 0.01 });
  sh.addBinding(tuning.shafts, 'y', { label: 'light y', min: -0.5, max: 0.5, step: 0.01 });
  sh.addBinding(tuning.shafts, 'length', { min: 0.1, max: 1, step: 0.01 });
  sh.addBinding(tuning.shafts, 'threshold', { label: 'gap brightness', min: 0, max: 0.6, step: 0.01 });
  sh.addBinding(tuning.shafts, 'softness', { min: 0, max: 0.6, step: 0.01 });

  const rn = pane.addFolder({ title: 'Trail run' });
  rn.addBinding(tuning.run, 'reveal', { label: 'hand-off', min: 0.3, max: 2, step: 0.05 })
    .on('change', (e) => e.last && ScrollTrigger.refresh());
  rn.addBinding(tuning.run, 'gap', { min: 0.2, max: 2, step: 0.05 })
    .on('change', (e) => e.last && ScrollTrigger.refresh());
  rn.addBinding(tuning.run, 'slow', { label: 'pace reading', min: 0.05, max: 1, step: 0.05 })
    .on('change', (e) => e.last && ScrollTrigger.refresh());
  rn.addBinding(tuning.run, 'dim', { label: 'shade', min: 0, max: 1, step: 0.01 });
  rn.addBinding(tuning.run, 'depth', { label: 'ring by depth', min: 0, max: 1.5, step: 0.05 });

  const gr = pane.addFolder({ title: 'Film grain' });
  gr.addBinding(tuning.grain, 'amount', { min: 0, max: 0.5, step: 0.01 });
  gr.addBinding(tuning.grain, 'size', { min: 0.5, max: 3, step: 0.05 });

  // For scripts and the console: window.tuning is the live object the scenes read.
  (window as unknown as { tuning: typeof tuning }).tuning = tuning;

  pane.addButton({ title: 'Copy values' }).on('click', () => {
    const r = (n: number) => Math.round(n * 1000) / 1000;
    const { fog: f, dolly: d, photo3d: s, shafts: l, grain: g, sign: t, run: n } = tuning;
    const text = [
      '// src/core/tuning.ts',
      `scroll: ${r(tuning.scroll)},`,
      `fog: { strength: ${r(f.strength)}, haze: ${r(f.haze)}, banks: ${r(f.banks)}, near: ${r(f.near)} },`,
      `dolly: { mid: ${r(d.mid)}, near: ${r(d.near)} },`,
      `photo3d: { show: ${s.show}, sky: ${r(s.sky)}, fly: ${r(s.fly)}, fov: ${r(s.fov)}, sway: ${r(s.sway)}, near: ${r(s.near)}, smooth: ${r(s.smooth)} },`,
      `shafts: { strength: ${r(l.strength)}, x: ${r(l.x)}, y: ${r(l.y)}, length: ${r(l.length)}, threshold: ${r(l.threshold)}, softness: ${r(l.softness)} },`,
      `grain: { amount: ${r(g.amount)}, size: ${r(g.size)} },`,
      `sign: { base: ${r(t.base)}, perScreen: ${r(t.perScreen)}, max: ${r(t.max)} },`,
      `run: { reveal: ${r(n.reveal)}, gap: ${r(n.gap)}, slow: ${r(n.slow)}, dim: ${r(n.dim)}, depth: ${r(n.depth)} },`,
      '// src/content/site.ts',
      `diveZoom: ${r(site.descent.diveZoom)},`,
    ].join('\n');
    console.info(text);
    navigator.clipboard?.writeText(text).catch(() => {}); // the console copy is the fallback
  });

  return pane;
}
