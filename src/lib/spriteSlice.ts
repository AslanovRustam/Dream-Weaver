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
 * Убрать из клетки чужие куски. ИИ рисует иконки сеткой неровно: соседняя
 * иконка заходит краем в клетку, и после обрезки под главной иконкой торчат
 * обрывки (монеты, края). Оставляем самый большой непрозрачный кусок — саму
 * иконку; из остальных стираем те, что касаются края клетки (это соседи), и
 * крошки. Отдельные искры и блики внутри клетки остаются.
 */
function dropStrayIslands(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;
  const solid = (i: number) => px[i * 4 + 3] > 24;
  const label = new Int32Array(w * h).fill(-1);
  const sizes: number[] = [];
  const touches: boolean[] = [];
  const stack: number[] = [];
  for (let start = 0; start < w * h; start++) {
    if (label[start] !== -1 || !solid(start)) continue;
    const id = sizes.length;
    let size = 0;
    let edge = false;
    label[start] = id;
    stack.push(start);
    while (stack.length) {
      const i = stack.pop()!;
      size++;
      const x = i % w;
      const y = (i - x) / w;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edge = true;
      const next = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
      for (const n of next) {
        if (n >= 0 && label[n] === -1 && solid(n)) {
          label[n] = id;
          stack.push(n);
        }
      }
    }
    sizes.push(size);
    touches.push(edge);
  }
  if (sizes.length < 2) return;
  const main = sizes.indexOf(Math.max(...sizes));
  const drop = sizes.map((s, id) => id !== main && (touches[id] || s < sizes[main] * 0.004));
  if (!drop.some(Boolean)) return;
  for (let i = 0; i < w * h; i++) if (label[i] >= 0 && drop[label[i]]) px[i * 4 + 3] = 0;
  ctx.putImageData(data, 0, 0);
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
      dropStrayIslands(ctx, canvas.width, canvas.height);
      tiles.push(canvas.toDataURL("image/png"));
    }
  }

  return Promise.all(
    tiles.map(async (tile) => {
      try {
        return await trimTransparent(tile);
      } catch {
        return tile;
      }
    }),
  );
}
