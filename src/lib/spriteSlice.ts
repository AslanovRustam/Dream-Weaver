// Slice ONE generated grid image (a sprite sheet of evenly-sized cells) into
// N separate PNG data URLs — used by the slot builder's "generate a full icon
// set in one call" feature (src/app/api/generate-slot-symbols) so we pay for
// a single AI generation instead of one call per symbol.

import { trimTransparent } from "./landingCreative";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = src;
  });
}

/**
 * Cut `imageDataUrl` into a `cols × rows` grid of equal-size cells (row-major
 * order: left→right, top→bottom) and return each cell as its own PNG data
 * URL, trimmed to its own non-transparent bounding box so icons of different
 * natural sizes still render evenly sized on the reel (same idea as
 * `trimTransparent` already does for a generated character).
 */
export async function sliceIconGrid(imageDataUrl: string, cols: number, rows: number): Promise<string[]> {
  if (cols <= 0 || rows <= 0) return [];
  const img = await loadImage(imageDataUrl);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const cw = w / cols;
  const ch = h / rows;

  const tiles: string[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(cw));
      canvas.height = Math.max(1, Math.round(ch));
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      ctx.drawImage(img, c * cw, r * ch, cw, ch, 0, 0, canvas.width, canvas.height);
      tiles.push(canvas.toDataURL("image/png"));
    }
  }

  return Promise.all(
    tiles.map(async (tile) => {
      try {
        return await trimTransparent(tile);
      } catch {
        return tile; // trimming is best-effort — an untrimmed tile is still usable
      }
    }),
  );
}
