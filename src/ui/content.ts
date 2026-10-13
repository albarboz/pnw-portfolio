import { site, type Project, type ProjectImage } from '../content/site';
import { afterHero } from '../core/after-hero';

/**
 * Fills the page from src/content/site.ts.
 *   data-text="about.heading"   → textContent
 *   data-img="descent.overlook" → src, alt, width, height, placeholder (src after the hero has loaded if data-defer)
 *   [data-projects]             → project rows (buttons that open the detail view), with thumbnails
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

        const text = span('work-text');
        text.append(span('work-meta meta', `${p.year} · ${p.kind}`), projectTitle(p, 'work-title'), span('work-desc', p.description));

        if (p.image) row.append(projectThumb(p.image));
        else row.classList.add('no-thumb');
        row.append(text, openCue());
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

/**
 * The list's thumbnail: the cover, cropped around its focus and enlarged by its zoom (CSS reads both),
 * under a veil of fog that lifts as the row scrolls in ([data-lift], src/ui/reveal.ts).
 */
function projectThumb(image: ProjectImage): HTMLElement {
  const thumb = span('work-thumb');
  const img = Object.assign(document.createElement('img'), {
    src: image.src,
    alt: '', // the row's text names the project; the picture only sets the scene
    width: image.width,
    height: image.height,
    loading: 'lazy',
    decoding: 'async',
  });
  const { x, y } = image.focus ?? { x: 0.5, y: 0.5 };
  img.style.setProperty('--focus', `${x * 100}% ${y * 100}%`);
  img.style.setProperty('--zoom', String(image.zoom ?? 1));
  const fog = span('work-fog');
  fog.dataset.lift = '';
  thumb.append(img, fog);
  return thumb;
}

/** Round arrow on each row, so it reads as something that opens. */
function openCue(): HTMLElement {
  const cue = span('work-cue');
  cue.setAttribute('aria-hidden', 'true');
  // the trail sign's arrow, turned to point ahead
  cue.innerHTML = '<svg viewBox="0 0 12 12"><path d="M1.5 6h9M7 2.5 10.5 6 7 9.5"/></svg>';
  return cue;
}

function span(className: string, text = ''): HTMLSpanElement {
  return Object.assign(document.createElement('span'), { className, textContent: text });
}
