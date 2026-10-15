/**
 * Resolves once the opening view is in (the page's load event: HTML, CSS, fonts, scripts and the overlook photo),
 * has painted, and the browser has a quiet moment. Wait on it before fetching anything the visitor can't see yet
 * (the trail photo, the overlook cutouts, the shader fog), so none of it competes with the hero for bandwidth.
 */
export const afterHero = new Promise<void>((resolve) => {
  const idle = () =>
    'requestIdleCallback' in window ? requestIdleCallback(() => resolve(), { timeout: 1000 }) : setTimeout(resolve, 200);
  // Two frames: ScrollTrigger re-pins the stage on load, so let that repaint of the hero land first.
  const painted = () => requestAnimationFrame(() => requestAnimationFrame(idle));
  if (document.readyState === 'complete') painted();
  else window.addEventListener('load', painted, { once: true });
});

/**
 * Resolves just after the browser's next paint (a frame, then a task: rendering happens between the two), so what
 * the page has written so far shows before the work that follows. A tab in the background paints nothing and runs
 * no frames: there it resolves after 100 ms.
 */
export const yieldToPaint = () =>
  new Promise<void>((resolve) => {
    const done = () => resolve();
    requestAnimationFrame(() => setTimeout(done, 0));
    setTimeout(done, 100);
  });
