import { site, type Project } from './site';

/** A project's slug: its own `slug`, or its title in lowercase words joined by dashes ("Trail run tracker" → trail-run-tracker). */
export function projectSlug(p: Project): string {
  return (
    p.slug ??
    p.title
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '') // accents off: "Café" → cafe
      .toLowerCase()
      .replace(/['’]/g, '') // "Café Vita’s" → cafe-vitas, not cafe-vita-s
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  );
}

/**
 * A project's case study, relative to the site root: work/<slug>/. vite.config.ts writes a page there for link
 * previews and search; src/ui/case-study.ts opens it over the trail.
 */
export const projectPath = (p: Project) => `work/${projectSlug(p)}/`;

/** A case study's page title: the project, then the site ("Trail run tracker · Into the Fog"). */
export const projectTitleText = (p: Project) => `${p.title} · ${site.meta.title}`;
