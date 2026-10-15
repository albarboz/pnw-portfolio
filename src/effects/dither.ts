/**
 * GLSL: `dither()` gives noise of ±1/255 (triangular, two taps of interleaved gradient noise, Jimenez 2014) to add
 * to a color just before it's written, so soft 8-bit gradients (fog, haze) break up into grain instead of bands.
 * Fixed to the pixel grid, so a still frame stays still.
 */
export const DITHER_GLSL = `
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
float dither() { return (ign(gl_FragCoord.xy) + ign(gl_FragCoord.xy + 5.588238) - 1.0) / 255.0; }
`;
