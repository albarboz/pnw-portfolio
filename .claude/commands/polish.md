---
description: Review a scene or section for feel, performance and accessibility
argument-hint: <scene or section name>
---

Review $ARGUMENTS against `CLAUDE.md`:

- Motion: does the timing feel intentional? Any jumps at the start or end of the pin?
- Performance: only `transform`/`opacity` animated? Canvas resolution within budget? Image sizes?
- Accessibility: reduced motion path, alt text, focus states, contrast of text over photos.
- Phone width (375 px): overflow, readable type, pin distance not too long.

List findings first, ordered by impact, then fix the top items and run `npm run build`.
