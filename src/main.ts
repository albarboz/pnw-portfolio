import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/sections.css';

import { initScroll, ScrollTrigger } from './core/scroll';
import { renderContent } from './ui/content';
import { createReveal } from './ui/reveal';
import { createSectionIndex } from './ui/section-index';
import { initCopyEmail } from './ui/copy-email';
import { createProjectDialog } from './ui/project-dialog';
import { createScenes } from './scenes';

// 1. content first, so scenes measure real layout
renderContent();

// 2. smooth scroll (skipped for reduced motion)
const lenis = initScroll();

// 3. scenes and widgets
const scenes = createScenes();
const reveal = createReveal(); // after scenes, so pinned scroll space is measured
const sectionIndex = createSectionIndex(lenis); // same reason
initCopyEmail();
const projectDialog = createProjectDialog(lenis);

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
    sectionIndex.destroy();
    projectDialog.destroy();
    lenis?.destroy();
  });
}
