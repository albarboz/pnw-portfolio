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
  fog.addBinding(tuning.fog, 'strength', { min: 0.3, max: 3, step: 0.05 });
  fog.addBinding(tuning.fog, 'haze', { min: 0, max: 0.4, step: 0.01 });
  fog.addBinding(tuning.fog, 'banks', { label: 'clear patches', min: 0, max: 1, step: 0.01 });
  fog.addBinding(tuning.fog, 'near', { label: 'bottom fade', min: 0, max: 1, step: 0.01 });

  const dive = pane.addFolder({ title: 'Dive (length in screens)' });
  dive
    .addBinding(tuning, 'scroll', { label: 'length', min: 2, max: 6, step: 0.1 })
    .on('change', (e) => e.last && ScrollTrigger.refresh()); // re-measure once the slider is let go
  // ≤ 3: the 1792 px overlook gets soft beyond that (CLAUDE.md)
  dive.addBinding(site.descent, 'diveZoom', { label: 'zoom', min: 1.5, max: 3, step: 0.05 });

  const depth = pane.addFolder({ title: 'Dolly depth (far = 1)' });
  depth.addBinding(tuning.dolly, 'mid', { label: 'fir & slope', min: 0.3, max: 1, step: 0.01 });
  depth.addBinding(tuning.dolly, 'near', { label: 'edge branches', min: 0.2, max: 1, step: 0.01 });

  pane.addButton({ title: 'Copy values' }).on('click', () => {
    const r = (n: number) => Math.round(n * 1000) / 1000;
    const { fog: f, dolly: d } = tuning;
    const text = [
      '// src/core/tuning.ts',
      `scroll: ${r(tuning.scroll)},`,
      `fog: { strength: ${r(f.strength)}, haze: ${r(f.haze)}, banks: ${r(f.banks)}, near: ${r(f.near)} },`,
      `dolly: { mid: ${r(d.mid)}, near: ${r(d.near)} },`,
      '// src/content/site.ts',
      `diveZoom: ${r(site.descent.diveZoom)},`,
    ].join('\n');
    console.info(text);
    navigator.clipboard?.writeText(text).catch(() => {}); // the console copy is the fallback
  });

  return pane;
}
