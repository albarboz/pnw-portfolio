import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import { prefersReducedMotion } from './motion';

gsap.registerPlugin(ScrollTrigger);

/**
 * Smooth scrolling with Lenis, driven by GSAP's ticker so Lenis and ScrollTrigger
 * share one animation loop. Skipped for reduced motion (native scroll instead).
 */
let lenis: Lenis | null = null;

/** How fast the page is scrolling right now, in px per frame (0 with native scroll, i.e. reduced motion). */
export const scrollVelocity = () => lenis?.velocity ?? 0;

export function initScroll(): Lenis | null {
  if (prefersReducedMotion()) return null;

  lenis = new Lenis({ lerp: 0.09 });
  const l = lenis;
  l.on('scroll', ScrollTrigger.update);
  // Pins change the page's height on every refresh, and Lenis only notices 250 ms later: a trail sign clicked in
  // between flew to the old, shorter limit and stopped halfway.
  ScrollTrigger.addEventListener('refresh', () => l.resize());
  gsap.ticker.add((time) => l.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
  return l;
}

export { gsap, ScrollTrigger };
