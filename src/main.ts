import './styles/tokens.css';
import './styles/base.css';
import './styles/sections.css';

import { initScroll, ScrollTrigger } from './core/scroll';
import { renderContent } from './ui/content';
import { createAltimeter } from './ui/altimeter';
import { createReveal } from './ui/reveal';
import { initCopyEmail } from './ui/copy-email';
import { createProjectDialog } from './ui/project-dialog';
import { createScenes } from './scenes';

// 1. content first, so scenes measure real layout
renderContent();

// 2. smooth scroll (skipped for reduced motion)
const lenis = initScroll();

// 3. scenes and widgets
const altimeter = createAltimeter();
const scenes = createScenes(altimeter);
altimeter.attach(); // after scenes, so pinned scroll space is measured
const reveal = createReveal(); // same reason
initCopyEmail();
const projectDialog = createProjectDialog(lenis);

// Recalculate trigger positions once fonts and images have settled.
document.fonts?.ready.then(() => ScrollTrigger.refresh());
window.addEventListener('load', () => ScrollTrigger.refresh());

// Dev only: slider panel for the feel numbers in src/core/tuning.ts. Vite strips this from the build.
const tune = import.meta.env.DEV ? import('./dev/tune').then((m) => m.createTunePanel()) : null;

// Vite hot reload: tear down scenes cleanly so triggers don't stack up.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    tune?.then((pane) => pane.dispose());
    scenes.forEach((s) => s.destroy());
    altimeter.destroy();
    reveal.destroy();
    projectDialog.destroy();
    lenis?.destroy();
  });
}
