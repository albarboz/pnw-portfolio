import type Lenis from 'lenis';
import { site, type Project } from '../content/site';
import { projectMeta, projectPath, projectTitleText } from '../content/paths';
import { haptic } from '../core/haptics';
import { prefersReducedMotion } from '../core/motion';
import { FogWipe } from '../effects/fog-wipe';
import { ARROW_OUT, projectTitle } from './content';

const projects = site.work.projects;

/**
 * Case studies: each project has its own page at work/<slug>/ (src/content/paths.ts), opened over the trail in a
 * native <dialog> (focus trap, Esc and an inert page come free). The page underneath never goes away, so closing it
 * lands exactly where you were.
 *
 * The address is the state: a project row or "Next project" pushes the case study's address, Back or Close returns,
 * and opening one of those addresses directly (vite.config.ts writes a page for each) starts on that case study.
 * Every change passes through a cloud (src/effects/fog-wipe.ts) and the page changes while nothing shows through.
 * Reduced motion: it changes at once.
 */
export interface CaseStudy {
  /** To the next (1) or previous (-1) case study, while one is open. */
  step: (by: number) => void;
  isOpen: () => boolean;
  destroy: () => void;
}

export function createCaseStudy(lenis: Lenis | null): CaseStudy {
  const dialog = document.querySelector<HTMLDialogElement>('[data-case-study]');
  const list = document.querySelector<HTMLElement>('[data-projects]');
  if (!dialog || !list) return { step() {}, isOpen: () => false, destroy() {} };

  const part = <T extends HTMLElement = HTMLElement>(name: string) =>
    dialog.querySelector<T>(`[data-cs="${name}"]`)!;
  const page = part('page');
  const title = part('title');
  const next = part<HTMLAnchorElement>('next');
  const wipe = new FogWipe(part<HTMLCanvasElement>('fog'), part('veil'));

  // The site root, also from a case study's own page, whose <base> points there. Opening a case study changes the
  // address to work/<slug>/, which would move every relative path the page fetches from then on (images, the
  // film), so the root is pinned as the base for good.
  const root = new URL(import.meta.env.BASE_URL, document.baseURI);
  const base = document.querySelector('base') ?? document.head.appendChild(document.createElement('base'));
  base.href = root.href;
  const urlOf = (p: Project | null) => new URL((p ? projectPath(p) : '') + location.search, root).href;
  const fromUrl = (): number | null => {
    if (!location.href.startsWith(root.href)) return null;
    const path = location.pathname.slice(root.pathname.length);
    const i = projects.findIndex((p) => path.replace(/\/?$/, '/') === projectPath(p));
    return i < 0 ? null : i;
  };

  let current: number | null = null; // the case study showing
  let fromList = false; // opened from a row on this visit: focus goes back to the rows on close
  let homeward = false; // Close stepped back through the history: wherever that lands, the trail is home
  let leaving = false; // the cloud is closing over the case study on the way back to the trail
  // How many case-study entries this visit has pushed onto the history, so Close can step back past all of them.
  const depth = () => (history.state as { cs?: number } | null)?.cs ?? 0;

  // ---------- warming ----------
  // A cover is a big photo: decoding it as the cloud clears would hitch the clearing, or show the page without it
  // for a moment. So each starts loading and decoding as soon as a visit is likely: a row pointed at, touched or
  // focused, and the next project once one is open.
  const warmed = new Set<number>();
  const warm = (i: number) => {
    const src = projects[i]?.image?.src;
    if (!src || warmed.has(i)) return;
    warmed.add(i);
    Object.assign(new Image(), { src }).decode().catch(() => {});
  };
  const onListNear = (e: Event) => {
    const row = (e.target as Element).closest<HTMLElement>('[data-project]');
    if (row) warm(Number(row.dataset.project));
  };

  // ---------- show / hide ----------
  const show = (i: number, instant = false) => {
    if (i === current && dialog.open && !leaving) return;
    warm(i);
    leaving = false;
    const opening = !dialog.open;
    if (opening) {
      lenis?.stop();
      dialog.showModal();
    }
    current = i;
    if (instant || prefersReducedMotion()) return fill(projects[i]);
    if (opening) page.style.opacity = '0'; // the trail shows through until the cloud has closed
    wipe.run(() => {
      fill(projects[i]);
      page.style.opacity = '';
      haptic('fog');
    });
  };

  const hide = () => {
    if (!dialog.open) return;
    if (prefersReducedMotion()) return finish();
    leaving = true;
    // only if no case study was asked for while the cloud passed
    wipe.run(() => (page.style.opacity = '0')).then(() => fromUrl() === null && finish());
  };

  // Also runs on the dialog's own close event (e.g. a forced second Esc), so cleanup always happens.
  const finish = () => {
    if (current === null) return;
    const row = fromList ? list.querySelector<HTMLElement>(`[data-project="${current}"]`) : null;
    current = null;
    fromList = false;
    if (dialog.open) dialog.close();
    if (fromUrl() !== null) history.replaceState(null, '', urlOf(null)); // closed by the browser (a second Esc)
    page.style.opacity = '';
    document.title = site.meta.title;
    row?.focus({ preventScroll: true });
    lenis?.start();
  };

  // ---------- the address ----------
  const go = (i: number) => {
    history.pushState({ cs: depth() + 1 }, '', urlOf(projects[i]));
    show(i);
  };
  const close = () => {
    if (depth() > 0) {
      homeward = true;
      return history.go(-depth()); // popstate hides it
    }
    history.replaceState(null, '', urlOf(null)); // opened from its own address: the trail is home
    hide();
  };
  const onPopState = () => {
    if (homeward) {
      homeward = false;
      // a visit that started on a case study steps back to that one's address: the trail takes its place
      if (fromUrl() !== null) history.replaceState(null, '', urlOf(null));
    }
    const i = fromUrl();
    if (i === null) hide();
    else show(i);
  };

  // ---------- filling the page ----------
  const fill = (p: Project) => {
    const { detail } = site.work;
    document.title = projectTitleText(p);
    part('meta').textContent = projectMeta(p);
    title.replaceChildren(projectTitle(p, 'cs-title-text'));
    part('lead').textContent = p.description;

    const img = part<HTMLImageElement>('image');
    img.hidden = !p.image;
    img.onerror = () => (img.hidden = true); // a cover that can't load leaves no broken frame behind
    if (p.image) {
      const { src, alt, width, height, focus } = p.image;
      Object.assign(img, { src, alt, width, height });
      // a cover of another shape is cut to fit, around the same spot the thumbnail shows
      img.style.objectPosition = focus ? `${focus.x * 100}% ${focus.y * 100}%` : '';
    }

    const text = part('text');
    text.replaceChildren(...(p.details ?? []).map((t) => el('p', t)));
    text.hidden = !text.children.length;

    const facts = part('facts');
    const rows: [string, string | undefined][] = [
      [detail.role, p.role],
      [detail.tools, p.tools?.join(', ')],
    ];
    facts.replaceChildren(
      ...rows.filter(([, value]) => value).flatMap(([label, value]) => [el('dt', label), el('dd', value!)]),
    );
    facts.hidden = !facts.children.length;

    const links = part('links');
    links.replaceChildren(
      ...(p.links ?? []).map(({ label, href }) => {
        const a = Object.assign(el('a', label, 'cs-link'), { href, target: '_blank', rel: 'noopener' });
        a.insertAdjacentHTML('beforeend', ARROW_OUT);
        return a;
      }),
    );
    links.hidden = !links.children.length;

    const after = projects[(projects.indexOf(p) + 1) % projects.length];
    warm(projects.indexOf(after));
    next.hidden = after === p;
    next.href = urlOf(after);
    part('next-title').textContent = after.title;

    page.scrollTop = 0;
    // the title's blaze paints in once the page shows (base.css), and focus starts at the title, so a screen
    // reader announces the new page
    title.classList.add('is-waiting');
    requestAnimationFrame(() => requestAnimationFrame(() => title.classList.remove('is-waiting')));
    title.focus({ preventScroll: true });
  };

  // ---------- events ----------
  // A plain click stays on the page; a click that asks for a new tab or window gets the case study's own page.
  const plainClick = (e: MouseEvent) => !(e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey);

  const onListClick = (e: MouseEvent) => {
    const row = (e.target as Element).closest<HTMLElement>('[data-project]');
    if (!row || !plainClick(e)) return;
    e.preventDefault();
    fromList = true;
    go(Number(row.dataset.project));
  };
  const onDialogClick = (e: MouseEvent) => {
    const target = e.target as Element;
    if (target.closest('[data-cs="close"]')) return close();
    if (target.closest('[data-cs="next"]') && plainClick(e)) {
      e.preventDefault();
      go((current! + 1) % projects.length);
    }
  };
  const onCancel = (e: Event) => {
    e.preventDefault(); // Esc: back through the cloud instead of closing at once
    close();
  };

  list.addEventListener('click', onListClick);
  list.addEventListener('pointerover', onListNear); // a touch fires it too, before the click
  list.addEventListener('focusin', onListNear);
  dialog.addEventListener('click', onDialogClick);
  dialog.addEventListener('cancel', onCancel);
  dialog.addEventListener('close', finish);
  window.addEventListener('popstate', onPopState);

  // Make the cloud before it's needed, so the shader fog is in by the first pass: as the work list comes near, or
  // now when the visit starts on a case study.
  const near = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      wipe.warm();
      near.disconnect();
    },
    { rootMargin: '150% 0px' },
  );
  near.observe(list);

  const start = fromUrl();
  if (start !== null) {
    wipe.warm();
    show(start, true);
  }

  return {
    step(by) {
      if (current === null || projects.length < 2) return;
      go((current + by + projects.length) % projects.length);
    },
    isOpen: () => dialog.open,
    destroy() {
      list.removeEventListener('click', onListClick);
      list.removeEventListener('pointerover', onListNear);
      list.removeEventListener('focusin', onListNear);
      dialog.removeEventListener('click', onDialogClick);
      dialog.removeEventListener('cancel', onCancel);
      dialog.removeEventListener('close', finish);
      window.removeEventListener('popstate', onPopState);
      near.disconnect();
      wipe.destroy();
      finish();
    },
  };
}

function el(tag: string, text: string, className = '') {
  return Object.assign(document.createElement(tag), { textContent: text, className });
}
