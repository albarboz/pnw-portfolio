import { site } from '../content/site';
import { afterHero } from '../core/after-hero';
import { quality, saveData } from '../core/quality';

/**
 * A note in the browser console for whoever opens it: whose site it is, which build, and how this visit runs
 * (the quality level, how the film is decoded, how long the page took to load). Facts only, logged once the
 * opening view is in, so it never weighs on the first paint.
 */
export function logColophon() {
  void Promise.all([quality, afterHero]).then(([level]) => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const visit = [
      `quality ${level}${saveData() ? ' (saving data)' : ''}`,
      `film decoded by ${'VideoDecoder' in window && level > 0 ? 'WebCodecs' : 'a <video>'}`,
      nav?.loadEventEnd ? `loaded in ${(nav.loadEventEnd / 1000).toFixed(2)} s` : '',
    ].filter(Boolean);
    console.info(
      `%c${site.name.first} ${site.name.last}%c\nBuild ${__BUILD__.commit} · ${__BUILD__.date}\nThis visit: ${visit.join(' · ')}\nCredits: humans.txt`,
      `font: 600 15px ${token('--display')}; letter-spacing: 0.04em; color: ${token('--blaze')}`,
      `font: 12px ${token('--body')}; line-height: 1.6`,
    );
  });
}
