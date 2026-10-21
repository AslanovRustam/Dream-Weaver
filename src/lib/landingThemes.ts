// Готовые темы для лендингов-механик: акцент, заголовок на 4 языках, свой
// набор парящих объектов (landingKit, look.floatTheme), фон и подсказка для
// ИИ-фона — чтобы перегенерация оставалась в теме. Казино-темы общие для
// колеса, слота и краша, спортивные — для матча.
//
// Фон — рисованный SVG (themeBackground): градиенты и силуэты темы, без
// внешних файлов и без ИИ. Фоны от ИИ снимает scripts/gen-landing-themes.mts
// в public/landing-themes (нужны кредиты OpenAI) — тогда тема берёт их.

import type { LandingKind, LandingLang } from "./landingKit";

export type LandingTheme = {
  id: string;
  kind: LandingKind;
  name: string;
  accent: string;
  /** Заголовок первого экрана по языку лендинга. */
  headline: Record<LandingLang, string>;
  /** Тема для ИИ-фона в редакторе (поле «Тема оформления»). */
  theme: string;
  /** Промпт снятого фона — для скрипта генерации. */
  bgPrompt: string;
};


export const LANDING_THEMES: LandingTheme[] = [
  {
    id: "halloween",
    kind: "casino",
    name: "Хэллоуин",
    accent: "#f97316",
    headline: { ru: "ХЭЛЛОУИН-БОНУС", uk: "ГЕЛОВІН-БОНУС", en: "HALLOWEEN BONUS", es: "BONO HALLOWEEN" },
    theme: "Spooky Halloween night: carved glowing pumpkins, purple fog, full moon, bats, candles, gold coins",
    bgPrompt: "a spooky-luxurious Halloween night casino scene: carved jack-o'-lanterns glowing orange, violet fog, a huge full moon, bats, flickering candles and scattered gold coins on dark stone",
  },
  {
    id: "newyear",
    kind: "casino",
    name: "Новый год",
    accent: "#ef4444",
    headline: { ru: "НОВОГОДНИЙ ДЖЕКПОТ", uk: "НОВОРІЧНИЙ ДЖЕКПОТ", en: "NEW YEAR JACKPOT", es: "JACKPOT DE AÑO NUEVO" },
    theme: "Festive New Year night: snowfall, red and gold ornaments, gift boxes, fireworks, warm bokeh",
    bgPrompt: "a festive New Year casino night: gentle snowfall, glossy red and gold Christmas ornaments, wrapped gift boxes, golden fireworks in a deep navy sky, warm bokeh lights",
  },
  {
    id: "egypt",
    kind: "casino",
    name: "Египет",
    accent: "#eab308",
    headline: { ru: "ЗОЛОТО ФАРАОНА", uk: "ЗОЛОТО ФАРАОНА", en: "PHARAOH'S GOLD", es: "ORO DEL FARAÓN" },
    theme: "Ancient Egyptian tomb treasure: golden pharaoh relics, hieroglyph walls, torchlight, scarabs, sand haze",
    bgPrompt: "an ancient Egyptian treasure tomb: golden pharaoh relics and statues, hieroglyph-carved sandstone walls, flickering torchlight, jewelled scarabs, warm sand haze and heaps of gold",
  },
  {
    id: "neon",
    kind: "casino",
    name: "Неон",
    accent: "#d946ef",
    headline: { ru: "НЕОНОВАЯ НОЧЬ", uk: "НЕОНОВА НІЧ", en: "NEON NIGHT", es: "NOCHE DE NEÓN" },
    theme: "Cyberpunk neon casino street: magenta and cyan neon signs, wet reflective asphalt, light trails, holograms",
    bgPrompt: "a cyberpunk neon casino street at night: glowing magenta and cyan neon signs (no readable text), wet reflective asphalt, light trails, floating holographic chips and dice",
  },
  {
    id: "wildwest",
    kind: "casino",
    name: "Дикий Запад",
    accent: "#d97706",
    headline: { ru: "ЗОЛОТАЯ ЛИХОРАДКА", uk: "ЗОЛОТА ЛИХОМАНКА", en: "GOLD RUSH", es: "FIEBRE DEL ORO" },
    theme: "Wild West saloon at sunset: wooden saloon, gold nuggets, poker cards, revolver-free, dusty orange light",
    bgPrompt: "a Wild West gold-rush saloon at sunset: weathered wooden saloon interior, sacks of gold nuggets, poker cards and chips on a table, dusty warm orange light through the windows",
  },
  {
    id: "ocean",
    kind: "casino",
    name: "Сокровища океана",
    accent: "#06b6d4",
    headline: { ru: "СОКРОВИЩА ГЛУБИН", uk: "СКАРБИ ГЛИБИН", en: "TREASURES OF THE DEEP", es: "TESOROS DEL ABISMO" },
    theme: "Underwater treasure: sunken pirate chest overflowing with gold, coral reef, light rays, bubbles, pearls",
    bgPrompt: "an underwater treasure scene: a sunken pirate chest overflowing with gold coins and pearls, colourful coral reef, god rays from the surface, bubbles, turquoise depth",
  },
  {
    id: "stadium",
    kind: "sport",
    name: "Ночной стадион",
    accent: "#22c55e",
    headline: { ru: "МАТЧ ДНЯ", uk: "МАТЧ ДНЯ", en: "MATCH OF THE DAY", es: "PARTIDO DEL DÍA" },
    theme: "Football stadium at night: floodlights, green pitch, packed stands bokeh, light haze",
    bgPrompt: "a packed football stadium at night seen from pitch level: blazing floodlights, a lush green pitch, crowd as soft bokeh, light haze and sparks, no logos, no players' faces",
  },
  {
    id: "derby",
    kind: "sport",
    name: "Огненное дерби",
    accent: "#ef4444",
    headline: { ru: "ГОРЯЧЕЕ ДЕРБИ", uk: "ГАРЯЧЕ ДЕРБІ", en: "HOT DERBY", es: "DERBI CALIENTE" },
    theme: "Fiery derby atmosphere: red flares and smoke in the stands, sparks, dramatic red light over the pitch",
    bgPrompt: "a fiery football derby atmosphere: red flares and smoke rising from the stands, sparks, dramatic red and orange light over the pitch, cinematic, no logos, no faces",
  },
  {
    id: "champions",
    kind: "sport",
    name: "Ночь чемпионов",
    accent: "#3b82f6",
    headline: { ru: "НОЧЬ ЧЕМПИОНОВ", uk: "НІЧ ЧЕМПІОНІВ", en: "CHAMPIONS NIGHT", es: "NOCHE DE CAMPEONES" },
    theme: "Champions night: deep blue stadium lights, silver star-shaped confetti, glowing trophy silhouette",
    bgPrompt: "a grand champions-night stadium in deep blue light: silver star confetti falling, light beams, a softly glowing silver trophy silhouette in the far distance, no logos, no text",
  },
  {
    id: "final",
    kind: "sport",
    name: "Золотой финал",
    accent: "#eab308",
    headline: { ru: "ЗОЛОТОЙ ФИНАЛ", uk: "ЗОЛОТИЙ ФІНАЛ", en: "GOLDEN FINAL", es: "FINAL DE ORO" },
    theme: "Cup final celebration: golden confetti, fireworks over the stadium, warm gold light, trophy glow",
    bgPrompt: "a cup-final celebration over a stadium: golden confetti storm, fireworks bursting above the roof, warm gold spotlights, a glowing golden trophy shape in the distance, no logos, no text",
  },
];

export const landingThemesFor = (kind: LandingKind) => LANDING_THEMES.filter((t) => t.kind === kind);

// ---------------------------------------------------------------- рисованные фоны

/** Детерминированный «случай»: одна и та же тема — один и тот же фон. */
function rnd(seed: number) {
  let x = seed;
  return () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648;
}
const f1 = (n: number) => n.toFixed(1);

function dots(seed: number, n: number, fill: string, rMin: number, rMax: number, yMax = 1000, op = 1): string {
  const r = rnd(seed);
  let out = "";
  for (let i = 0; i < n; i++) out += `<circle cx="${f1(r() * 1000)}" cy="${f1(r() * yMax)}" r="${f1(rMin + r() * (rMax - rMin))}" fill="${fill}" opacity="${f1((0.3 + r() * 0.7) * op)}"/>`;
  return out;
}
const glow = (id: string, color: string, op = 1) =>
  `<radialGradient id="${id}"><stop offset="0" stop-color="${color}" stop-opacity="${op}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`;
const sky = (a: string, b: string, c: string) =>
  `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset=".55" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient>`;
const BAT = "M0 0 C-20 -26 -50 -20 -64 -4 C-48 -8 -40 2 -36 10 C-28 2 -16 4 -10 12 C-6 4 6 4 10 12 C16 4 28 2 36 10 C40 2 48 -8 64 -4 C50 -20 20 -26 0 0Z";

const ART: Record<string, () => string> = {
  halloween: () =>
    `<defs>${sky("#14061f", "#2a0d3a", "#0a0410")}${glow("moon", "#ffd38a", 0.55)}${glow("fog", "#7c3aed", 0.35)}</defs><rect width="1000" height="1000" fill="url(#sky)"/>` +
    dots(7, 60, "#fff", 0.8, 2.2, 600) +
    `<circle cx="760" cy="200" r="260" fill="url(#moon)"/><circle cx="760" cy="200" r="110" fill="#ffe7b0"/><circle cx="720" cy="180" r="18" fill="#e8c98a" opacity=".6"/><circle cx="790" cy="240" r="12" fill="#e8c98a" opacity=".5"/>` +
    [[200, 220, 1], [330, 150, 0.7], [560, 300, 0.8], [880, 380, 0.6]].map(([x, y, k]) => `<path transform="translate(${x} ${y}) scale(${k})" d="${BAT}" fill="#05020a"/>`).join("") +
    `<ellipse cx="500" cy="1000" rx="900" ry="260" fill="url(#fog)"/><path d="M0 880 Q120 820 240 870 T480 860 T720 880 T1000 850 V1000 H0Z" fill="#07030c"/>`,
  newyear: () =>
    `<defs>${sky("#061226", "#0d2147", "#040a17")}${glow("b1", "#ef4444", 0.5)}${glow("b2", "#fbbf24", 0.5)}</defs><rect width="1000" height="1000" fill="url(#sky)"/>` +
    ([[150, 220, 160, "b1"], [820, 160, 200, "b2"], [700, 520, 140, "b1"], [240, 620, 180, "b2"]] as const).map(([x, y, r, g]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#${g})"/>`).join("") +
    dots(11, 140, "#ffffff", 1.2, 4.2) +
    `<path d="M0 900 Q250 840 500 890 T1000 870 V1000 H0Z" fill="#e8f1ff" opacity=".9"/><path d="M0 940 Q300 900 600 935 T1000 925 V1000 H0Z" fill="#ffffff"/>`,
  egypt: () =>
    `<defs>${sky("#3a1606", "#b4541a", "#f2b35a")}${glow("sun", "#ffe28a", 0.8)}</defs><rect width="1000" height="1000" fill="url(#sky)"/>` +
    `<circle cx="500" cy="420" r="320" fill="url(#sun)"/><circle cx="500" cy="420" r="120" fill="#ffd56a"/>` +
    `<path d="M80 860 L330 520 L580 860Z" fill="#5a2a0c"/><path d="M330 520 L580 860 L470 860Z" fill="#3a1a06"/><path d="M520 860 L760 560 L1000 860Z" fill="#4a2209"/><path d="M760 560 L1000 860 L900 860Z" fill="#2e1404"/>` +
    `<path d="M0 860 Q500 820 1000 860 V1000 H0Z" fill="#2a1204"/>` +
    dots(19, 40, "#ffe7a3", 0.8, 2, 500, 0.6),
  neon: () =>
    `<defs>${sky("#09021a", "#1c0638", "#05010d")}${glow("sunN", "#ff3bd4", 0.6)}<linearGradient id="sunB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd23f"/><stop offset="1" stop-color="#ff3bd4"/></linearGradient></defs><rect width="1000" height="1000" fill="url(#sky)"/>` +
    `<circle cx="500" cy="470" r="330" fill="url(#sunN)"/><circle cx="500" cy="470" r="170" fill="url(#sunB)"/>` +
    [500, 530, 560, 590, 615].map((y, i) => `<rect x="300" y="${y}" width="400" height="${6 + i * 3}" fill="#1c0638"/>`).join("") +
    `<rect y="640" width="1000" height="360" fill="#0b0220"/>` +
    Array.from({ length: 13 }, (_, i) => `<path d="M500 640 L${-700 + i * 200} 1000" stroke="#22d3ee" stroke-opacity=".55" stroke-width="2"/>`).join("") +
    [660, 690, 730, 790, 870, 970].map((y) => `<path d="M0 ${y} H1000" stroke="#ff3bd4" stroke-opacity=".5" stroke-width="2"/>`).join("") +
    dots(23, 50, "#ffffff", 0.8, 2, 420),
  wildwest: () =>
    `<defs>${sky("#2a0e05", "#c2410c", "#fdba74")}${glow("sunW", "#fff1c2", 0.8)}</defs><rect width="1000" height="1000" fill="url(#sky)"/>` +
    `<circle cx="320" cy="560" r="300" fill="url(#sunW)"/><circle cx="320" cy="560" r="110" fill="#fff1c2"/>` +
    `<path d="M0 760 L120 760 L150 640 L360 640 L390 760 L620 760 L650 680 L860 680 L890 760 L1000 760 V1000 H0Z" fill="#4a1a08"/>` +
    `<path d="M770 900 V700 Q770 680 790 680 Q810 680 810 700 V900Z M770 790 H735 V740 Q735 725 750 725 Q765 725 765 740 V770 H770Z M810 760 H845 V720 Q845 705 830 705 Q815 705 815 720 V745 H810Z" fill="#1e0b03"/>` +
    `<path d="M0 880 Q500 850 1000 880 V1000 H0Z" fill="#2a0e05"/>`,
  ocean: () =>
    `<defs>${sky("#0e7490", "#083344", "#020b12")}<linearGradient id="ray" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e0fbff" stop-opacity=".45"/><stop offset="1" stop-color="#e0fbff" stop-opacity="0"/></linearGradient></defs><rect width="1000" height="1000" fill="url(#sky)"/>` +
    [[120, 60], [330, 90], [560, 70], [760, 110]].map(([x, w]) => `<path d="M${x} 0 L${x + w} 0 L${x + w * 3} 800 L${x + w * 1.4} 800Z" fill="url(#ray)"/>`).join("") +
    dots(31, 45, "#bff6ff", 3, 12, 900, 0.5) +
    `<path d="M0 880 Q150 820 300 870 Q420 830 560 880 Q720 840 860 870 Q940 850 1000 870 V1000 H0Z" fill="#06202a"/>` +
    `<path d="M120 880 Q110 800 140 760 M150 880 Q170 820 150 780 M820 880 Q800 790 840 750 M860 880 Q880 820 860 790" stroke="#f472b6" stroke-width="10" stroke-linecap="round" fill="none" opacity=".8"/>`,
  stadium: () =>
    `<defs>${sky("#04140c", "#0b3a1f", "#0f5a2c")}${glow("fl", "#f0fff6", 0.75)}</defs><rect width="1000" height="1000" fill="url(#sky)"/>` +
    `<circle cx="120" cy="80" r="300" fill="url(#fl)"/><circle cx="880" cy="80" r="300" fill="url(#fl)"/>` +
    dots(41, 90, "#d9ffe8", 1, 3, 420, 0.4) +
    `<path d="M0 620 L1000 620 L1000 1000 L0 1000Z" fill="#14702f"/>` +
    [0, 1, 2, 3, 4].map((i) => `<path d="M${i * 220 - 60} 620 L${i * 220 + 50} 620 L${i * 300 - 80} 1000 L${i * 300 - 230} 1000Z" fill="#1a8a3a" opacity=".6"/>`).join("") +
    `<path d="M0 620 H1000" stroke="#fff" stroke-opacity=".5" stroke-width="3"/>`,
  derby: () =>
    `<defs>${sky("#1a0303", "#4a0a06", "#120202")}${glow("smk", "#ef4444", 0.55)}${glow("flr", "#ffb347", 0.8)}</defs><rect width="1000" height="1000" fill="url(#sky)"/>` +
    [[180, 620, 360], [520, 560, 420], [860, 640, 340]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#smk)"/>`).join("") +
    [[150, 760], [480, 720], [840, 780]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="60" fill="url(#flr)"/>`).join("") +
    dots(53, 80, "#ffcf7a", 1, 3.5, 1000, 0.7) +
    `<path d="M0 820 Q500 780 1000 820 V1000 H0Z" fill="#0d0101"/>`,
  champions: () =>
    `<defs>${sky("#030a2a", "#0b1f6b", "#020617")}${glow("lb", "#93c5fd", 0.5)}</defs><rect width="1000" height="1000" fill="url(#sky)"/>` +
    `<circle cx="500" cy="300" r="420" fill="url(#lb)"/>` +
    dots(61, 120, "#e0ecff", 1, 3.2) +
    Array.from({ length: 6 }, (_, i) => `<path d="M${500 + (i - 2.5) * 40} 0 L${500 + (i - 2.5) * 220} 1000" stroke="#bcd3ff" stroke-opacity=".12" stroke-width="40"/>`).join("") +
    `<path d="M0 860 Q500 820 1000 860 V1000 H0Z" fill="#020617"/>`,
  final: () => {
    const r = rnd(71);
    let confetti = "";
    for (let i = 0; i < 90; i++) {
      const x = r() * 1000;
      const y = r() * 900;
      confetti += `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(6 + r() * 8)}" height="${f1(10 + r() * 10)}" fill="${["#fde68a", "#f59e0b", "#fff7d6"][i % 3]}" transform="rotate(${f1(r() * 360)} ${f1(x)} ${f1(y)})" opacity=".85"/>`;
    }
    return (
      `<defs>${sky("#1a1003", "#4a3006", "#0d0802")}${glow("gl", "#fde68a", 0.6)}</defs><rect width="1000" height="1000" fill="url(#sky)"/>` +
      `<circle cx="500" cy="380" r="460" fill="url(#gl)"/>` +
      confetti +
      `<path d="M0 860 Q500 820 1000 860 V1000 H0Z" fill="#0d0802"/>`
    );
  },
};

function b64(s: string): string {
  if (typeof btoa === "function") return btoa(s);
  return Buffer.from(s, "binary").toString("base64");
}

/** Рисованный фон темы — data-URL SVG (base64: в CSS url() без кавычек и скобок). */
export function themeBackground(id: string): string {
  const art = ART[id];
  if (!art) return "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice">${art()}</svg>`;
  return `data:image/svg+xml;base64,${b64(svg)}`;
}

// ---------------------------------------------------------------- фоны от ИИ

/** Фон темы от ИИ (scripts/gen-landing-themes.mts) — лежит в public/landing-themes. */
export const themePhotoUrl = (id: string) => `/landing-themes/${id}.webp`;

const photoCache = new Map<string, Promise<string>>();

/**
 * Фон темы для выгрузки: картинка от ИИ, встроенная data-URL (лендинг — один
 * файл), а если её нет или сеть подвела — рисованный SVG. Только в браузере.
 */
export function loadThemeBackground(id: string): Promise<string> {
  if (!photoCache.has(id)) {
    photoCache.set(
      id,
      fetch(themePhotoUrl(id))
        .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
        .then(
          (blob) =>
            new Promise<string>((resolve, reject) => {
              const fr = new FileReader();
              fr.onload = () => (typeof fr.result === "string" ? resolve(fr.result) : reject(new Error("read")));
              fr.onerror = () => reject(new Error("read"));
              fr.readAsDataURL(blob);
            }),
        )
        .catch(() => {
          photoCache.delete(id);
          return themeBackground(id);
        }),
    );
  }
  return photoCache.get(id)!;
}
