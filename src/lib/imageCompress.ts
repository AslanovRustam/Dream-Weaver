// Сжатие картинок в браузере — перед тем как картинка попадёт в черновик или
// уедет генератору.
//
// Генератор отдаёт баннер 1792px и под два мегабайта: на экране это незаметно,
// а в письме означает долгую загрузку на мобильном интернете. Письмо шириной
// 600, картинку показываем в 1200 (ретина), остальное — лишние байты.
//
// Жмём на клиенте, а не на сервере: картинка уже здесь, отправлять её туда и
// обратно ради уменьшения — тратить тот же трафик, который экономим.

export type CompressResult = {
  dataUrl: string;
  width: number;
  height: number;
  bytes: number;
  /** Вес до сжатия — чтобы показать человеку, что произошло. */
  bytesBefore: number;
  /** Сжатие не понадобилось: картинка и так в рамках. */
  skipped: boolean;
};

function bytesOfDataUrl(dataUrl: string): number {
  const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.round((b64.length * 3) / 4) - pad);
}

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = src;
  });
}

function draw(img: HTMLImageElement, width: number, background: string): HTMLCanvasElement {
  const scale = Math.min(1, width / img.naturalWidth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext("2d");
  if (ctx) {
    // JPEG не умеет прозрачность, а письмо — тем более: за ней окажется
    // чёрный прямоугольник. Подкладываем цвет полотна письма.
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  }
  return canvas;
}

/**
 * Перерисовать SVG в PNG.
 *
 * Логотип в режиме «референс» уходит генератору входной картинкой, а он
 * принимает только растр — SVG он отвергает, и генерация падает с невнятной
 * ошибкой про формат. Рисуем в канвасе с прозрачным фоном: логотип потом
 * ложится и на баннер, и в письмо, а белая подложка там была бы лишней.
 */
export async function rasterizeSvg(dataUrl: string, width = 512): Promise<string> {
  if (!dataUrl.startsWith("data:image/svg")) return dataUrl;
  const img = await load(dataUrl);
  const scale = width / Math.max(1, img.naturalWidth);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  try {
    return canvas.toDataURL("image/png");
  } catch {
    return dataUrl;
  }
}

/**
 * Ужать картинку до целевого веса.
 *
 * Сначала уменьшаем до нужной ширины, потом понижаем качество JPEG, и только
 * если этого не хватило — уменьшаем ещё. Порядок важен: резкость теряется
 * заметнее, чем качество сжатия, поэтому размер трогаем последним.
 *
 * Если уложиться не удалось (бывает на шумных фотографиях), возвращаем лучшее
 * из полученного: картинка всё равно легче исходной, а решение показывать её
 * или менять — за человеком.
 */
export async function compressImage(
  dataUrl: string,
  opts: { maxWidth: number; maxBytes: number; background: string },
): Promise<CompressResult> {
  const bytesBefore = bytesOfDataUrl(dataUrl);
  const img = await load(dataUrl);

  if (bytesBefore <= opts.maxBytes && img.naturalWidth <= opts.maxWidth) {
    return {
      dataUrl,
      width: img.naturalWidth,
      height: img.naturalHeight,
      bytes: bytesBefore,
      bytesBefore,
      skipped: true,
    };
  }

  let best: CompressResult | null = null;
  for (const width of [opts.maxWidth, Math.round(opts.maxWidth * 0.75), Math.round(opts.maxWidth * 0.5)]) {
    const canvas = draw(img, width, opts.background);
    for (const quality of [0.82, 0.72, 0.62, 0.52]) {
      const out = canvas.toDataURL("image/jpeg", quality);
      const bytes = bytesOfDataUrl(out);
      const candidate: CompressResult = {
        dataUrl: out,
        width: canvas.width,
        height: canvas.height,
        bytes,
        bytesBefore,
        skipped: false,
      };
      if (!best || bytes < best.bytes) best = candidate;
      if (bytes <= opts.maxBytes) return candidate;
    }
  }

  return best ?? { dataUrl, width: img.naturalWidth, height: img.naturalHeight, bytes: bytesBefore, bytesBefore, skipped: true };
}
