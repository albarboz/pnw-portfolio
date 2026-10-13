import type Lenis from 'lenis';
import { gsap } from '../core/scroll';
import { prefersReducedMotion } from '../core/motion';
import { site, type Project } from '../content/site';
import { projectTitle } from './content';

/**
 * Project detail view in a native <dialog> (focus trap, Esc and inert page come free).
 *
 * Opening flies the row's title into the dialog (FLIP: measure both spots, then tween the
 * dialog title's transform from the row's spot back to zero) while the sheet and text fade in.
 * Closing re-measures and flies it home, so it lands right even if the row moved.
 * Page scroll is locked while open. Reduced motion: opens and closes instantly.
 */
export function createProjectDialog(lenis: Lenis | null): { destroy: () => void } {
  const dialog = document.querySelector<HTMLDialogElement>('[data-project-dialog]');
  const list = document.querySelector<HTMLElement>('[data-projects]');
  if (!dialog || !list) return { destroy() {} };

  const part = <T extends HTMLElement = HTMLElement>(name: string) =>
    dialog.querySelector<T>(`[data-pd="${name}"]`)!;
  const [scrim, scroll, panel, sheet, title] = ['scrim', 'scroll', 'panel', 'sheet', 'title'].map((n) => part(n));
  const fades = dialog.querySelectorAll<HTMLElement>('[data-pd-fade]');

  let row: HTMLButtonElement | null = null;
  let tl: gsap.core.Timeline | null = null;
  let closing = false;

  const rowTitle = () => row!.querySelector<HTMLElement>('.work-title')!;

  /** x, y and scale that place `el` (origin top-left) over `target`, sized by font-size ratio. */
  const flipTo = (el: HTMLElement, target: HTMLElement) => {
    const a = el.getBoundingClientRect();
    const b = target.getBoundingClientRect();
    const size = (e: Element) => parseFloat(getComputedStyle(e).fontSize);
    // a includes any transform already applied; subtract it to get the resting spot
    const x = Number(gsap.getProperty(el, 'x'));
    const y = Number(gsap.getProperty(el, 'y'));
    return { x: b.left - (a.left - x), y: b.top - (a.top - y), scale: size(target) / size(el) };
  };

  const open = (button: HTMLButtonElement) => {
    row = button;
    fill(site.work.projects[Number(button.dataset.project)]);
    lenis?.stop();
    dialog.showModal();
    scroll.scrollTop = 0;
    if (prefersReducedMotion()) return;

    tl = gsap
      .timeline({ defaults: { duration: 0.6, ease: 'power3.inOut' } })
      .set(rowTitle(), { opacity: 0 })
      .fromTo(scrim, { opacity: 0 }, { opacity: 1, duration: 0.4, ease: 'power1.out' }, 0)
      .fromTo(sheet, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out' }, 0.05)
      .fromTo(title, { ...flipTo(title, rowTitle()), transformOrigin: '0 0' }, { x: 0, y: 0, scale: 1 }, 0)
      .fromTo(fades, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out', stagger: 0.04 }, 0.25);
  };

  const close = () => {
    if (!dialog.open || closing) return;
    if (prefersReducedMotion() || !row) return finish();
    closing = true;
    tl?.kill();
    tl = gsap
      .timeline({ defaults: { duration: 0.35, ease: 'power3.inOut' }, onComplete: finish })
      .to(fades, { opacity: 0, y: 12, duration: 0.15, ease: 'power2.out' }, 0)
      .to(title, flipTo(title, rowTitle()), 0.05)
      .to(sheet, { opacity: 0, y: 40, duration: 0.3, ease: 'power2.out' }, 0.05)
      .to(scrim, { opacity: 0, duration: 0.3, ease: 'power2.out' }, 0.1);
  };

  // Also runs on the dialog's own close event (e.g. a forced second Esc), so cleanup always happens.
  const finish = () => {
    if (!row) return;
    tl?.kill();
    tl = null;
    closing = false;
    if (dialog.open) dialog.close();
    gsap.set([scrim, sheet, title, ...fades], { clearProps: 'all' });
    gsap.set(rowTitle(), { clearProps: 'opacity' });
    row.focus({ preventScroll: true });
    row = null;
    lenis?.start();
  };

  const fill = (p: Project) => {
    const { detail } = site.work;
    part('meta').textContent = `${p.year} · ${p.kind}`;
    title.replaceChildren(projectTitle(p, 'pd-title-text'));

    const img = part<HTMLImageElement>('image');
    img.hidden = !p.image;
    if (p.image) Object.assign(img, p.image);

    part('body').replaceChildren(...(p.details ?? [p.description]).map((text) => el('p', text)));

    const facts = part('facts');
    const rows: [string, string | undefined][] = [
      [detail.role, p.role],
      [detail.tools, p.tools?.join(', ')],
    ];
    facts.replaceChildren(
      ...rows.filter(([, value]) => value).flatMap(([label, value]) => [el('dt', label, 'mono'), el('dd', value!)]),
    );
    facts.hidden = !facts.children.length;

    const links = part('links');
    links.replaceChildren(
      ...(p.links ?? []).map(({ label, href }) =>
        Object.assign(el('a', label, 'btn'), { href, target: '_blank', rel: 'noopener' }),
      ),
    );
    links.hidden = !links.children.length;
  };

  const onListClick = (e: MouseEvent) => {
    const button = (e.target as Element).closest<HTMLButtonElement>('[data-project]');
    if (button) open(button);
  };
  const onCancel = (e: Event) => {
    e.preventDefault(); // Esc: animate out instead of closing at once
    close();
  };
  const onDialogClick = (e: MouseEvent) => {
    const target = e.target as Element;
    if (target.closest('[data-pd="close"]') || !panel.contains(target)) close();
  };

  list.addEventListener('click', onListClick);
  dialog.addEventListener('cancel', onCancel);
  dialog.addEventListener('click', onDialogClick);
  dialog.addEventListener('close', finish);

  return {
    destroy() {
      list.removeEventListener('click', onListClick);
      dialog.removeEventListener('cancel', onCancel);
      dialog.removeEventListener('click', onDialogClick);
      dialog.removeEventListener('close', finish);
      finish();
    },
  };
}

function el(tag: string, text: string, className = '') {
  return Object.assign(document.createElement(tag), { textContent: text, className });
}
