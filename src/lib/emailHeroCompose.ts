// Логотип поверх баннера — «медальоном» на верхней кромке.
//
// Приём простой: логотип стоит по центру сверху, половиной на картинке,
// половиной над ней. В вёрстке письма так сделать нельзя — отрицательных
// отступов и наложений почта не понимает. Поэтому склеиваем заранее: над
// баннером дорисовываем полосу цвета полотна письма и кладём логотип ровно на
// границу. Для получателя это одна картинка, а выглядит как наложение.
//
// Из-за полосы картинка зависит от цвета письма: сменили гамму — склеиваем
// заново из исходного баннера, который поэтому и хранится отдельно.

/** Ширина логотипа относительно ширины баннера. */
const LOGO_WIDTH_RATIO = 0.24;

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = src;
  });
}

/**
 * Склеить баннер с логотипом. Возвращает исходный баннер, если склеить не
 * вышло: письмо без медальона лучше, чем письмо без картинки.
 */
export async function composeHeroWithLogo(opts: {
  banner: string;
  logo: string;
  /** Цвет полотна письма — им закрашивается полоса над баннером. */
  background: string;
}): Promise<string> {
  try {
    const [banner, logo] = await Promise.all([load(opts.banner), load(opts.logo)]);
    const w = banner.naturalWidth;
    const logoW = Math.round(w * LOGO_WIDTH_RATIO);
    const logoH = Math.max(1, Math.round(logoW * (logo.naturalHeight / Math.max(1, logo.naturalWidth))));
    // Полоса ровно в половину логотипа: его центр приходится на кромку.
    const strip = Math.ceil(logoH / 2);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = banner.naturalHeight + strip;
    const ctx = canvas.getContext("2d");
    if (!ctx) return opts.banner;

    ctx.fillStyle = opts.background;
    ctx.fillRect(0, 0, canvas.width, strip);
    ctx.drawImage(banner, 0, strip);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(logo, Math.round((w - logoW) / 2), 0, logoW, logoH);

    return canvas.toDataURL("image/jpeg", 0.85);
  } catch {
    return opts.banner;
  }
}
