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

  /** The overlook in 3D: the far and mid cutouts pushed back by their depth maps (src/effects/depth-layers.ts). */
  photo3d: {
    /** Off = keep the flat cutouts, to compare. Switches only while the camera is at rest. */
    show: true,
    /** How far away the sky and the last ridges stand, × the distance to the dive target. More = a deeper valley. */
    sky: 1.5,
    /**
     * How much of the dive is the camera flying in (the rest is the lens zooming). More = the trees rush past
     * sooner. The total magnification stays `diveZoom` in src/content/site.ts.
     */
    fly: 0.25,
    /** Vertical field of view of the photo, in degrees. Wider = stronger perspective as the camera moves. */
    fov: 55,
    /** How far the camera sways with the pointer, × the distance to the dive target. */
    sway: 0.001,
    /** Distance of the near branches (a flat card above the fog), × the distance to the dive target. */
    near: 0.12,
  },

  /** Distance of each overlook cutout from the camera's start (far = 1). Smaller = the camera passes it sooner. */
  dolly: {
    /** The tall fir and the slope below the overlook. */
    mid: 0.6,
    /** The branches at the edge of the frame. */
    near: 0.4,
  },
};
