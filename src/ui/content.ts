import { site } from '../content/site';

/**
 * Fills the page from src/content/site.ts.
 *   data-text="about.heading"   → textContent
 *   data-img="descent.overlook" → src, alt, width, height
 *   [data-projects]             → project list
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
      | { src: string; alt: string; width: number; height: number }
      | undefined;
    if (!asset) return;
    img.src = asset.src;
    img.alt = asset.alt;
    img.width = asset.width;
    img.height = asset.height;
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
      ...site.work.projects.map((p) => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = p.href;

        const title = document.createElement('span');
        title.className = 'work-title';
        title.textContent = p.title;
        if (p.example) {
          const tag = document.createElement('span');
          tag.className = 'example-tag';
          tag.textContent = 'Example';
          title.append(tag);
        }

        const meta = document.createElement('span');
        meta.className = 'work-meta mono';
        meta.textContent = `${p.year} · ${p.kind}`;

        const desc = document.createElement('span');
        desc.className = 'work-desc';
        desc.textContent = p.description;

        a.append(title, meta, desc);
        li.append(a);
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
