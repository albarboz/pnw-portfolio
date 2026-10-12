const query = window.matchMedia('(prefers-reduced-motion: reduce)');

/** True when the visitor asked the OS for less motion. Scenes must still show all content. */
export const prefersReducedMotion = () => query.matches;

/** 0 when reduced motion is on, 1 otherwise. Multiply zooms, parallax and drift by this. */
export const motionScale = () => (query.matches ? 0 : 1);
