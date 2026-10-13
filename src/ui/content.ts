import { site, type Project } from '../content/site';
import { afterHero } from '../core/after-hero';

/**
 * Fills the page from src/content/site.ts.
 *   data-text="about.heading"   → textContent
 *   data-img="descent.overlook" → src, alt, width, height, placeholder (src after the hero has loaded if data-defer)
 *   [data-projects]             → project rows (buttons that open the detail view)
 */
export function renderContent() {
  const get = (path: string): unknown =>
    path.split('.').reduce<unknown>((obj, key) => (obj as Record<string, unknown>)?.[key], site);

  document.querySelectorAll<HTMLElement>('[data-text]').forEach((el) => {
    const value = get(el.dataset.text!);
    if (typeof value === 'string') el.textContent = value;
  });

  document.querySelectorAll<HTMLImageElement>('[data-img]').forEach((img) => {
    const asset = get(img.dataset.img!) as
      | { src: string; alt: string; width: number; height: number; placeholder?: string }
      | undefined;
    if (!asset) return;
    // data-defer: a photo that isn't on screen yet waits until the hero has loaded
    if (img.hasAttribute('data-defer')) afterHero.then(() => (img.src = asset.src));
    else img.src = asset.src;
    img.alt = asset.alt;
    img.width = asset.width;
    img.height = asset.height;
    // a tiny blurred copy, stretched over the image box until the photo paints over it
    if (asset.placeholder) img.style.backgroundImage = `url("${asset.placeholder}")`;
  });

  const about = document.querySelector('[data-about-body]');
  if (about) {
    about.replaceChildren(
      ...site.about.paragraphs.map((text) => Object.assign(document.createElement('p'), { textContent: text })),
    );
  }

  const list = document.querySelector('[data-projects]');
  if (list) {
    list.replaceChildren(
      ...site.work.projects.map((p, i) => {
        const li = document.createElement('li');
        li.dataset.reveal = '';
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'work-row';
        row.dataset.project = String(i);
        row.setAttribute('aria-haspopup', 'dialog');

        const meta = document.createElement('span');
        meta.className = 'work-meta mono';
        meta.textContent = `${p.year} · ${p.kind}`;

        const desc = document.createElement('span');
        desc.className = 'work-desc';
        desc.textContent = p.description;

        row.append(projectTitle(p, 'work-title'), meta, desc);
        li.append(row);
        return li;
      }),
    );
  }

  const credits = document.querySelector('[data-credits]');
  if (credits) {
    credits.replaceChildren(
      ...site.credits.map((text) => Object.assign(document.createElement('span'), { textContent: text })),
    );
  }
}

/** Project title, plus an "Example" tag while the project is placeholder content. */
export function projectTitle(p: Project, className: string): HTMLElement {
  const title = document.createElement('span');
  title.className = className;
  title.textContent = p.title;
  if (p.example) {
    const tag = document.createElement('span');
    tag.className = 'example-tag';
    tag.textContent = site.work.detail.example;
    title.append(tag);
  }
  return title;
}
