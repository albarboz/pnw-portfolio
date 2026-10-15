import { site, type Project } from '../content/site';
import { projectPath, projectSlug } from '../content/paths';
import type { CaseStudy } from './case-study';

/**
 * Back where you were: the last case study a visitor opened is remembered on their device (localStorage, nothing
 * leaves it), and on a later visit one quiet line under the trail sign offers it again ("Back on the trail at …").
 * Not on the visit that opened it, not after a month, and not when the visit starts on a case study's own address.
 */
const KEY = 'last-case-study';
const MONTH = 30 * 24 * 3600 * 1000;

let earlier: { slug: string; at: number } | null = null;
try {
  // read before this visit opens anything and overwrites it
  earlier = JSON.parse(localStorage.getItem(KEY) ?? 'null');
} catch {
  // storage blocked or unreadable: nothing to offer
}

/** Called as each case study opens (src/ui/case-study.ts). */
export function rememberCaseStudy(p: Project) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ slug: projectSlug(p), at: Date.now() }));
  } catch {
    // not remembered; nothing else depends on it
  }
}

export function createResume(caseStudy: CaseStudy): { destroy: () => void } {
  const line = document.querySelector<HTMLElement>('[data-resume]');
  const link = line?.querySelector('a');
  const projects = site.work.projects;
  const i = earlier && Date.now() - earlier.at < MONTH ? projects.findIndex((p) => projectSlug(p) === earlier!.slug) : -1;
  if (!line || !link || i < 0 || caseStudy.isOpen()) return { destroy() {} };

  link.href = projectPath(projects[i]);
  link.replaceChildren(`${site.ui.resume} `, Object.assign(document.createElement('strong'), { textContent: projects[i].title }));
  line.hidden = false;

  const onClick = (e: MouseEvent) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // a new tab gets its own page
    e.preventDefault();
    line.hidden = true; // taken up; it would only point back at where you already are
    caseStudy.open(i);
  };
  link.addEventListener('click', onClick);
  return {
    destroy() {
      link.removeEventListener('click', onClick);
      line.hidden = true;
    },
  };
}
