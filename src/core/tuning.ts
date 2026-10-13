/**
 * Feel knobs for the descent: how long the dive lasts, how the fog looks, how deep the overlook cutouts stand.
 * In `npm run dev` a slider panel (src/dev/tune.ts) edits these live; when something feels right, press
 * "Copy values" there and paste the numbers back here. The dive zoom lives in src/content/site.ts (`diveZoom`).
 * Scenes and effects read these every frame, so nothing needs a reload.
 */
export const tuning = {
  /** Scroll length of the descent, in screen heights. More = a slower dive. */
  scroll: 3.2,

  /** The shader fog (src/effects/fog3d.ts). The canvas fallback ignores these. */
  fog: {
    /** Overall thickness. */
    strength: 1.4,
    /** Even haze under the wisps: 0 = only wisps, 0.3 = a milky veil. */
    haze: 0.04,
    /** Thickness left in the clear patches between fog banks: 0 = clear air, 1 = no banks. */
    banks: 0.35,
    /** How much the fog thins toward the bottom of the frame, where the nearest trees are. */
    near: 0.45,
  },

  /** Distance of each overlook cutout from the camera's start (far = 1). Smaller = the camera passes it sooner. */
  dolly: {
    /** The tall fir and the slope below the overlook. */
    mid: 0.6,
    /** The branches at the edge of the frame. */
    near: 0.4,
  },
};
