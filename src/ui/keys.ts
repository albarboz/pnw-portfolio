import type Lenis from 'lenis';
import { site } from '../content/site';
import { flyTo } from './fly';

/**
 * Keyboard shortcuts, for the visitors who look for them: `?` lists them, G then a section's first letter flies
 * there (G A → About), J and K step through the case studies while one is open.
 * Single keys can be set off by speech input or a stray press, so the list can turn them all off (WCAG 2.1.4), and
 * a small footer button opens the list on screens with a mouse, also while they're off. The choice is remembered.
 * Never while typing in a field, or with Ctrl, ⌘ or Alt held.
 */
export function createKeys(
  lenis: Lenis | null,
  caseStudy: { step: (by: number) => void; isOpen: () => boolean },
): { destroy: () => void } {
  const dialog = document.querySelector<HTMLDialogElement>('[data-keys]');
  const openers = document.querySelectorAll<HTMLElement>('[data-keys-open]');
  if (!dialog) return { destroy() {} };
  const part = <T extends HTMLElement = HTMLElement>(name: string) =>
    dialog.querySelector<T>(`[data-keys-part="${name}"]`)!;
  const L = site.ui.keys;

  const OFF = 'keys-off';
  let off = false;
  try {
    off = localStorage.getItem(OFF) === '1';
  } catch {
    // storage blocked: shortcuts stay on for this visit
  }

  // G then the first letter of a section's name, for the sections on the page
  const sections = new Map<string, { label: string; el: HTMLElement }>();
  for (const { label, target } of site.sign.links) {
    const el = document.getElementById(target);
    const key = label.trim().charAt(0).toLowerCase();
    if (el && key && !sections.has(key)) sections.set(key, { label, el });
  }

  // ---------- the list ----------
  const kbd = (...keys: string[]) =>
    keys.flatMap((k, i) => [
      ...(i ? [document.createTextNode(` ${L.then} `)] : []),
      Object.assign(document.createElement('kbd'), { textContent: k }),
    ]);
  const row = (keys: Node[], what: string) => {
    const dt = document.createElement('dt');
    dt.append(...keys);
    return [dt, Object.assign(document.createElement('dd'), { textContent: what })];
  };

  part('title').textContent = L.title;
  part('close').textContent = L.close;
  part('list').replaceChildren(
    ...row(kbd('?'), L.help),
    ...[...sections].flatMap(([key, { label }]) => row(kbd('G', key.toUpperCase()), `${L.goTo} ${label}`)),
    ...row(kbd('J'), L.next),
    ...row(kbd('K'), L.previous),
    ...row(kbd('Esc'), L.closeCaseStudy),
  );
  const toggle = part<HTMLButtonElement>('toggle');
  const showToggle = () => {
    toggle.textContent = off ? L.on : L.off;
    toggle.setAttribute('aria-pressed', String(off));
    dialog.classList.toggle('is-off', off);
  };
  showToggle();
  openers.forEach((b) => ((b.textContent = L.open), (b.hidden = false))); // hidden until there's a list to open

  const open = () => {
    if (dialog.open) return;
    lenis?.stop();
    dialog.showModal();
  };
  const onClose = () => {
    // the case study under it keeps the page still
    if (!caseStudy.isOpen()) lenis?.start();
  };
  const onDialogClick = (e: MouseEvent) => {
    const t = e.target as Element;
    if (t === dialog || t.closest('[data-keys-part="close"]')) dialog.close(); // the backdrop, or Close
    else if (t.closest('[data-keys-part="toggle"]')) {
      off = !off;
      try {
        if (off) localStorage.setItem(OFF, '1');
        else localStorage.removeItem(OFF);
      } catch {
        // not remembered; still applies to this visit
      }
      showToggle();
    }
  };
  const onOpener = (e: Event) => {
    e.preventDefault();
    open();
  };

  // ---------- the keys ----------
  let g = 0; // when G was pressed: the next letter within a second and a half picks a section
  const onKey = (e: KeyboardEvent) => {
    if (off || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || dialog.open) return;
    const t = e.target as HTMLElement;
    if (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const after = performance.now() - g < 1500;
    g = 0;

    if (key === '?') open();
    else if (caseStudy.isOpen()) {
      if (key === 'j') caseStudy.step(1);
      else if (key === 'k') caseStudy.step(-1);
      else return;
    } else if (key === 'g' && !after) {
      g = performance.now();
    } else if (after && sections.has(key)) {
      flyTo(sections.get(key)!.el, lenis);
    } else return;
    e.preventDefault();
  };

  document.addEventListener('keydown', onKey);
  dialog.addEventListener('click', onDialogClick);
  dialog.addEventListener('close', onClose);
  openers.forEach((b) => b.addEventListener('click', onOpener));

  return {
    destroy() {
      document.removeEventListener('keydown', onKey);
      dialog.removeEventListener('click', onDialogClick);
      dialog.removeEventListener('close', onClose);
      openers.forEach((b) => b.removeEventListener('click', onOpener));
      if (dialog.open) dialog.close();
    },
  };
}
