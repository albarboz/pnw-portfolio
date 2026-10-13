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
export function initScroll(): Lenis | null {
  if (prefersReducedMotion()) return null;

  const lenis = new Lenis({ lerp: 0.09 });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
  return lenis;
}

export { gsap, ScrollTrigger };
