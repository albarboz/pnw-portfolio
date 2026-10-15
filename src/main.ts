import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/sections.css';
import './styles/print.css';

import { initScroll, ScrollTrigger } from './core/scroll';
import { prefersReducedMotion } from './core/motion';
import { yieldToPaint } from './core/after-hero';
import { startGovernor } from './core/governor';
import { renderContent } from './ui/content';
import { createReveal } from './ui/reveal';
import { createTrailSign } from './ui/trail-sign';
import { createHeader } from './ui/header';
import { initCopyEmail } from './ui/copy-email';
import { createCaseStudy } from './ui/case-study';
import { createKeys } from './ui/keys';
import { createBarColor } from './ui/bar-color';
import { logColophon } from './ui/colophon';
import { createScenes } from './scenes';

// Dev only: ?data=worst|empty|one swaps the projects for stress-test data (src/dev/worst-case.ts).
if (import.meta.env.DEV) (await import('./dev/worst-case')).useDataset();

// 1. content first, so scenes measure real layout
renderContent();

// Let the browser paint the hero's text before the scenes are built (~80 ms on a slow phone): every layer they
// drive starts hidden in CSS, as their first frame has it. Not with reduced motion, whose still layout the scenes
// set: painting before it would shift the page.
if (!prefersReducedMotion()) await yieldToPaint();

// 2. smooth scroll (skipped for reduced motion)
const lenis = initScroll();

// 3. scenes and widgets
const scenes = createScenes();
const reveal = createReveal(); // after scenes, so pinned scroll space is measured
const trailSign = createTrailSign(lenis);
const header = createHeader(lenis); // after the scenes too: it measures where the sections are
initCopyEmail();
const caseStudy = createCaseStudy(lenis);
const keys = createKeys(lenis, caseStudy);
const barColor = createBarColor(); // after the scenes: it follows the descent's pin

// Watch the frame rate: if frames keep running late, the WebGL layers draw fewer pixels (src/core/governor.ts).
startGovernor();

// A note in the console for the curious (src/ui/colophon.ts).
logColophon();

// Recalculate trigger positions once fonts have settled. (ScrollTrigger refreshes on window load by itself.)
document.fonts?.ready.then(() => ScrollTrigger.refresh());

// Dev only: slider panel for the feel numbers in src/core/tuning.ts. Vite strips this from the build.
const tune = import.meta.env.DEV ? import('./dev/tune').then((m) => m.createTunePanel()) : null;

// Vite hot reload: tear down scenes cleanly so triggers don't stack up.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    tune?.then((pane) => pane.dispose());
    scenes.forEach((s) => s.destroy());
    reveal.destroy();
    trailSign.destroy();
    header.destroy();
    caseStudy.destroy();
    keys.destroy();
    barColor.destroy();
    lenis?.destroy();
  });
}
