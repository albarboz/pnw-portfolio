/**
 * Depth for the opening of the trail run (tools/film-depth.py, Video Depth Anything): an atlas of depth frames,
 * 0 = far, 1 = near, in the HQ film's frame. The fog ring (src/effects/run-view.ts) reads it so its edge clears what
 * is nearer than the runner first and lingers on what is farther.
 */
export interface FilmDepth {
  src: string;
  /** The atlas's grid, and how many depth frames it holds (row by row). */
  cols: number;
  rows: number;
  count: number;
  /** Film progress (0–1) at the last depth frame; after it, the last one holds. */
  until: number;
}

/**
 * GLSL for the ring: `nearness(f)` at frame point `f` (the film frame's 0–1 coordinates), between the two depth
 * frames around the film's time. Needs the film's place on the photo (`uAPos`, `uASize`) declared before it.
 */
export const DEPTH_GLSL = `
uniform sampler2D uDepth;
uniform vec2 uDPos, uDSize, uDGrid; // the depth frame's place on the photo, its size there, and the atlas's grid
uniform vec2 uDTexel;               // one pixel of a depth frame, as a share of it
uniform float uDFrame, uDCount;     // depth frame at the film's time (fractional), and how many there are
float depthTile(vec2 p, float i) {
  float row = floor((i + 0.5) / uDGrid.x); // + 0.5: a GPU's division can land just under a whole row
  vec2 cell = vec2(i - row * uDGrid.x, row);
  // kept a pixel inside the frame: filtering any closer reads the next frame's edge in the atlas
  return texture2D(uDepth, (cell + clamp(p, uDTexel, 1.0 - uDTexel)) / uDGrid).r;
}
float nearness(vec2 f) {
  // frame → photo → depth frame; kept off its outermost rows, where the model's depth is least sure
  vec2 p = clamp((uAPos + clamp(f, 0.0, 1.0) * uASize - uDPos) / uDSize, 0.02, 0.98);
  float i = floor(uDFrame);
  return mix(depthTile(p, i), depthTile(p, min(i + 1.0, uDCount - 1.0)), uDFrame - i);
}`;

/** The atlas, decoded; null if it fails to load (the ring then stays plain). */
export function loadFilmDepth(src: string): Promise<HTMLImageElement | null> {
  const img = new Image();
  img.src = src;
  return img.decode().then(
    () => img,
    () => null,
  );
}
