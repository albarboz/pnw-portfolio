/**
 * Reads a hex color token from tokens.css as [r, g, b], for canvas code that needs channels.
 * Keeps colors out of TS: pass the token name, e.g. cssRgb('--fog-high').
 */
export function cssRgb(token: string): [number, number, number] {
  let hex = getComputedStyle(document.documentElement).getPropertyValue(token).trim().replace('#', '');
  if (hex.length === 3) hex = [...hex].map((c) => c + c).join('');
  const n = parseInt(hex, 16);
  if (hex.length !== 6 || Number.isNaN(n)) throw new Error(`${token} must be a #rrggbb color in tokens.css`);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
