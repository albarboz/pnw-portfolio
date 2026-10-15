import { afterHero } from './after-hero';

/**
 * How much GPU work the descent asks for:
 * 2 = everything (shader fog, the overlook in 3D, the 2.5D trail);
 * 1 = the shader fog at a lower resolution, and the overlook stays flat cutouts;
 * 0 = the canvas fog, flat cutouts and the plain trail photo: no WebGL at all.
 */
export type QualityLevel = 0 | 1 | 2;

/**
 * The level for this device, from @pmndrs/detect-gpu (benchmark fps of the visitor's GPU), fetched after the hero
 * like everything it gates. Only GPUs known to be weak step down: one it has no data for (newer than its data,
 * which stopped growing in Dec 2025, or if the benchmark file fails to load) keeps everything, as before tiers.
 * A visitor saving data (`saveData()`) gets at most 1: no relief meshes or lens drops to download.
 * `?quality=0`, `1` or `2` in the URL forces a level, to see what a slower phone gets.
 */
export const quality: Promise<QualityLevel> = afterHero.then(async () => {
  const forced = new URLSearchParams(location.search).get('quality');
  if (forced === '0' || forced === '1' || forced === '2') return Number(forced) as QualityLevel;
  try {
    const { getGPUTier } = await import('@pmndrs/detect-gpu');
    // Served from this site (see benchmarks() in vite.config.ts), not from the library's default CDN.
    const gpu = await getGPUTier({ benchmarksURL: `${import.meta.env.BASE_URL}benchmarks` });
    if (import.meta.env.DEV) console.info('[quality]', gpu);
    if (gpu.type === 'WEBGL_UNSUPPORTED' || gpu.type === 'BLOCKLISTED') return 0;
    const top: QualityLevel = saveData() ? 1 : 2;
    if (gpu.type !== 'BENCHMARK') return top;
    return Math.min(gpu.tier, top) as QualityLevel; // tier 0 < 15 fps, 1 < 30 fps, 2–3 ≥ 30 fps
  } catch {
    return saveData() ? 1 : 2; // the library failed to load: same as before tiers
  }
});

/**
 * The visitor asked the browser to save data (Chrome's Lite mode, Android's Data Saver): Save-Data. The only signal
 * browsers send for it; `prefers-reduced-data` isn't in any browser yet. Chromium only, so false everywhere else.
 */
export function saveData(): boolean {
  return (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
}
