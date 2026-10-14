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
    /**
     * How much the depth steps are softened, as a fraction of the photo's width. A near tree in front of a farther
     * slope smears as the camera moves; softened, it leans a little instead. 0 = sharp depth.
     */
    smooth: 0.04,
  },

  /**
   * Sun shafts in the trail photo (src/effects/light-shafts.ts), falling from the bright gap in the canopy.
   * Baked once per setting, so moving these sliders costs one redraw, not a per-frame cost.
   */
  shafts: {
    /** Brightness. 0 = off. */
    strength: 0.1,
    /** Where the light comes from, as a fraction of the photo (0, 0 = top left; y < 0 = above the frame). */
    x: 0.75,
    y: -0.25,
    /** How far each shaft reaches back toward the light: 1 = all the way. Shorter = shorter, crisper streaks. */
    length: 1,
    /** How bright a far pixel must be to let light through (0–1). Lower = more gaps glow. */
    threshold: 0.3,
    /** How wide the light is, as a fraction of the photo. Wider = beams that feather out as they fall. 0 = sharp. */
    softness: 0.2,
  },

  /** Film grain over the whole descent (src/effects/grain.ts), so the smooth fog shares the photos' grain. */
  grain: {
    /** Strength: 0 = off. */
    amount: 0.05,
    /** Grain size in CSS px. Bigger = coarser, like faster film. */
    size: 1,
  },

  /**
   * The trail sign's trip to a section (src/ui/trail-sign.ts): the dive plays on the way down, so a long trip
   * takes long enough to watch. Seconds = base + perScreen × screens travelled, capped at max.
   */
  sign: {
    base: 1.1,
    perScreen: 0.55,
    max: 3.4,
  },

  /** The trail run (src/scenes/run.ts): the film behind About and Work. Lengths in screen heights. */
  run: {
    /** The hand-off from the trail photo: how long the fog ring takes to open the film. */
    reveal: 0.8,
    /** Open trail before About, between the sections and after Work, where the film runs at full pace. */
    gap: 0.7,
    /** The film's pace while About reads over it, as a share of its pace in the gaps. */
    slow: 0.3,
    /** Strength of the shade on the text's side while a section reads over the film (1 = as drawn in CSS). */
    dim: 1,
  },

  /** Distance of each overlook cutout from the camera's start (far = 1). Smaller = the camera passes it sooner. */
  dolly: {
    /** The tall fir and the slope below the overlook. */
    mid: 0.6,
    /** The branches at the edge of the frame. */
    near: 0.4,
  },
};
