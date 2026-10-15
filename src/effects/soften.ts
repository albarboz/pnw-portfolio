/**
 * The photo blurred, for the focus pull: halved three times (each halving averages, so it's a smooth blur, not
 * dropped pixels), an eighth of its size. Drawn back up by the GPU's filtering, which blurs it a little more.
 */
export function soften(img: HTMLImageElement): HTMLCanvasElement {
  let src: HTMLImageElement | HTMLCanvasElement = img;
  let [w, h] = [img.naturalWidth, img.naturalHeight];
  for (let i = 0; i < 3; i++) {
    [w, h] = [Math.ceil(w / 2), Math.ceil(h / 2)];
    const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, w, h);
    src = c;
  }
  return src as HTMLCanvasElement;
}
