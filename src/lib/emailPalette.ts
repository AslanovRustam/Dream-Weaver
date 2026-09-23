// Цветовая гамма письма.
//
// Раньше у письма был только акцент, а фон выбирался бинарным переключателем
// «тёмная / светлая» из двух зашитых наборов. Для лендингов мы так не делаем:
// там человек задаёт цвет, а вся гамма считается от него. Письмо теперь
// устроено так же — базовый цвет задаёт полотно, подложки, разделители и
// текст, акцент отвечает за кнопки и выделения.
//
// Считаем гамму здесь, а не в exporter'е: те же числа нужны предпросмотру
// свотчей в форме и брифу генератора баннера, чтобы картинка попадала в цвет.

export type EmailPalette = {
  /** Кнопки, номера шагов — фон под текстом. */
  accent: string;
  /** Акцент для текста поверх полотна: подправлен под контраст. */
  accentText: string;
  /** Фон письма — идёт на body, внешнюю таблицу и её td. */
  page: string;
  /** Полотно письма: отличается от фона страницы, поэтому bgcolor разрешён. */
  panel: string;
  text: string;
  muted: string;
  footerBg: string;
  divider: string;
  chipBg: string;
  /** Текст на акценте — белый или тёмный, смотря насколько акцент светлый. */
  onAccent: string;
  /** Тёмная ли гамма. Нужно тем, кто рисует превью рядом с формой. */
  dark: boolean;
};

export type EmailGamma = {
  id: string;
  label: string;
  accent: string;
  base: string;
};

/**
 * Готовые гаммы. Не «темы» с зашитыми наборами цветов: каждая — это просто
 * пара «акцент + база», из которой считается всё остальное. Поэтому любую
 * можно взять за старт и подкрутить пипеткой, не ломая письмо.
 */
export const EMAIL_GAMMAS: EmailGamma[] = [
  { id: "night", label: "Ночь", accent: "#22c55e", base: "#060a16" },
  { id: "graphite", label: "Графит", accent: "#f97316", base: "#111317" },
  { id: "royal", label: "Роял", accent: "#FFC53D", base: "#1B1038" },
  { id: "crimson", label: "Кримсон", accent: "#FF3B5C", base: "#190A10" },
  { id: "ocean", label: "Океан", accent: "#35D0FF", base: "#061826" },
  { id: "forest", label: "Лес", accent: "#B7F14A", base: "#0A1A12" },
  { id: "paper", label: "Бумага", accent: "#7B5CFF", base: "#EDF0F5" },
  { id: "cream", label: "Крем", accent: "#C8102E", base: "#F6F1E7" },
];

export const DEFAULT_EMAIL_ACCENT = EMAIL_GAMMAS[0].accent;
export const DEFAULT_EMAIL_BASE = EMAIL_GAMMAS[0].base;

const HEX = /^#[0-9a-fA-F]{6}$/;

export function isHex(v: string | undefined): boolean {
  return !!v && HEX.test(v);
}

type Rgb = [number, number, number];

function parse(hex: string): Rgb {
  const h = hex.slice(1);
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function toHex(rgb: Rgb): string {
  return "#" + rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("");
}

/** Смешать два цвета; t — доля второго. */
function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  return toHex([ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t]);
}

/** Относительная яркость по WCAG — по ней решаем «тёмное или светлое». */
export function luminance(hex: string): number {
  const [r, g, b] = parse(hex).map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Довести цвет до читаемости на фоне: осветляем на тёмном, затемняем на
 * светлом, пока не наберём нужный контраст. Нужно для акцента в тексте —
 * тёмно-синий акцент на тёмном полотне иначе просто не виден, а человек
 * видит его нормальным в пипетке и не понимает, почему письмо «сломалось».
 */
function ensureContrast(color: string, bg: string, ratio: number): string {
  if (contrast(color, bg) >= ratio) return color;
  const towards = luminance(bg) < 0.4 ? "#ffffff" : "#000000";
  let out = color;
  for (let t = 0.1; t <= 0.9; t += 0.1) {
    out = mix(color, towards, t);
    if (contrast(out, bg) >= ratio) return out;
  }
  return out;
}

/** Гамма письма из пары «акцент + база». */
export function buildPalette(accentRaw: string | undefined, baseRaw: string | undefined): EmailPalette {
  const accent = isHex(accentRaw) ? accentRaw! : DEFAULT_EMAIL_ACCENT;
  const base = isHex(baseRaw) ? baseRaw! : DEFAULT_EMAIL_BASE;
  const dark = luminance(base) < 0.35;

  // Чернила гаммы: не чистый белый и не чистый чёрный — подмешиваем базу,
  // иначе текст выглядит инородным по отношению к фону.
  const ink = dark ? mix("#ffffff", base, 0.08) : mix("#0b1220", base, 0.08);
  const panel = dark ? mix(base, "#ffffff", 0.055) : mix(base, "#ffffff", 0.78);
  const footerBg = dark ? mix(base, "#000000", 0.3) : mix(base, "#ffffff", 0.5);

  return {
    accent,
    accentText: ensureContrast(accent, panel, 3),
    page: base,
    panel,
    text: ink,
    muted: mix(ink, base, 0.42),
    footerBg,
    divider: mix(panel, ink, 0.12),
    chipBg: mix(panel, ink, 0.07),
    // Белый текст на жёлтой кнопке нечитаем — выбираем по яркости акцента.
    onAccent: luminance(accent) > 0.45 ? mix("#000000", accent, 0.12) : "#ffffff",
    dark,
  };
}
