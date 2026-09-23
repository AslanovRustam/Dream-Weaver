// Как письмо выглядит в тёмной теме почтовика.
//
// Клиенты делятся на три группы, и письмо у них выглядит по-разному:
//
// 1. Не трогают цвета. Apple Mail и Gmail в вебе видят наши мета-теги
//    color-scheme / supported-color-schemes (чеклист свода, п.1) и понимают,
//    что письмо уже само знает, какого оно цвета.
// 2. Частичная инверсия. Outlook.com и почта на Windows перекрашивают только
//    околонейтральные места: светлый фон темнеет, тёмный текст светлеет,
//    брендовые цвета остаются.
// 3. Полная инверсия. Gmail на Android перекрашивает письмо целиком, включая
//    уже тёмное, — и тогда тёмное письмо становится светлым.
//
// Показываем третий случай: он самый разрушительный и единственный, который
// имеет смысл проверять глазами. Если письмо переживает его, остальные группы
// тем более не проблема.
//
// Чего инверсия не касается — картинок. Ровно об этом предупреждают наши
// инструкции по живому тексту: текст, впечатанный в баннер, не перекрашивается
// вместе с фоном и в тёмной теме остаётся «наклейкой» от прошлой темы.
// Поэтому в предпросмотре картинки специально оставлены как есть.

/** Все шестизначные hex в разметке: и bgcolor="...", и цвета в inline-стилях. */
const HEX_IN_HTML = /#[0-9a-fA-F]{6}\b/g;

function toHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}

function toHex(h: number, s: number, l: number): string {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(v * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * Цвет после инверсии: переворачиваем яркость, тон и насыщенность оставляем.
 * Клиенты не уводят цвета в чистый чёрный и белый, поэтому края поджимаем —
 * иначе предпросмотр пугал бы контрастом, которого в почте не бывает.
 */
export function invertColor(hex: string): string {
  const [h, s, l] = toHsl(hex);
  const inverted = Math.min(0.94, Math.max(0.06, 1 - l));
  return toHex(h, s, inverted);
}

/** Письмо таким, каким его покажет клиент, перекрашивающий письмо целиком. */
export function simulateDarkClient(html: string): string {
  return html.replace(HEX_IN_HTML, (m) => invertColor(m));
}
