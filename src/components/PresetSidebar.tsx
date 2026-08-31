import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Filter, Search, X } from "lucide-react";
import { MobileScrim } from "@/components/MobileScrim";
import presetWideAngle from "@/assets/preset-wide-angle.jpg";
import presetSlotBanner from "@/assets/preset-slot-banner.jpg";
import presetEvent from "@/assets/preset-event.jpg";
import presetSport from "@/assets/preset-sport.jpg";

// Declarative per-template custom fields — a flexible dropdown/checkbox system.
// A preset lists the fields it wants; the UI renders them generically and the
// chosen values are compiled into a CUSTOMISATION prompt block (see
// compileTemplateOptions). Adding/editing options is pure data, no new UI code.
export type TemplateField =
  | {
      id: string;
      type: "select";
      label: string;
      options: { value: string; label: string; prompt?: string }[];
      default?: string;
    }
  | { id: string; type: "checkbox"; label: string; prompt: string; default?: boolean };

export type Preset = {
  id: string;
  name: string;
  description: string;
  gradient: string;
  preview?: string;
  examples: string[];
  template?: string;
  /** Shows a lime "Новое" badge on the tile and floats the preset to the top
   *  under the "Сначала новые" sort. */
  isNew?: boolean;
  /** Optional custom fields (dropdowns / checkboxes) shown for this template. */
  fields?: TemplateField[];
};

// ---- Reusable field library (shared across templates) ----------------------
const FIELD_SHOW_ODDS: TemplateField = {
  id: "showOdds",
  type: "checkbox",
  label: "Показать коэффициент",
  prompt: "Include a prominent sample betting odds accent.",
};
const FIELD_BONUS_BADGE: TemplateField = {
  id: "bonusBadge",
  type: "checkbox",
  label: "Бейдж-оффер",
  prompt: "Add a bold bonus/offer badge inside the central safe zone.",
};
const FIELD_SPORT: TemplateField = {
  id: "sport",
  type: "select",
  label: "Вид спорта",
  default: "football",
  options: [
    { value: "football", label: "Футбол", prompt: "Sport context: football (soccer)." },
    { value: "basketball", label: "Баскетбол", prompt: "Sport context: basketball." },
    { value: "tennis", label: "Теннис", prompt: "Sport context: tennis." },
    { value: "esports", label: "Киберспорт", prompt: "Sport context: esports." },
  ],
};
// Reusable field library shared across presets. "Авто" options carry no prompt,
// so they leave the template's own look untouched.
const FIELD_MATCH_MOMENT: TemplateField = {
  id: "moment",
  type: "select",
  label: "Момент",
  default: "action",
  options: [
    { value: "action", label: "Экшн", prompt: "Capture a dynamic mid-action moment." },
    { value: "start", label: "Старт", prompt: "Depict the start / kickoff moment." },
    { value: "win", label: "Победный момент", prompt: "Depict a triumphant victory moment." },
  ],
};
const FIELD_TIME_OF_DAY: TemplateField = {
  id: "timeOfDay",
  type: "select",
  label: "Время суток",
  default: "auto",
  options: [
    { value: "auto", label: "Авто" },
    { value: "day", label: "День", prompt: "Daytime setting." },
    { value: "night", label: "Ночь (софиты)", prompt: "Night setting under bright floodlights." },
    { value: "dusk", label: "Закат", prompt: "Dusk / golden-hour setting." },
  ],
};
const FIELD_CASINO_PROP: TemplateField = {
  id: "prop",
  type: "select",
  label: "Реквизит",
  default: "auto",
  options: [
    { value: "auto", label: "Авто" },
    { value: "coins", label: "Монеты", prompt: "Feature flying gold coins." },
    { value: "chips", label: "Фишки", prompt: "Feature casino chips." },
    { value: "cards", label: "Карты", prompt: "Feature playing cards." },
    { value: "diamonds", label: "Бриллианты", prompt: "Feature sparkling diamonds and gems." },
  ],
};
const FIELD_WIN_CALLOUT: TemplateField = {
  id: "callout",
  type: "select",
  label: "Плашка выигрыша",
  default: "auto",
  options: [
    { value: "auto", label: "Авто" },
    { value: "win", label: "WIN!", prompt: "Include a bold WIN! callout." },
    { value: "big", label: "BIG WIN", prompt: "Include a BIG WIN callout." },
    { value: "jackpot", label: "JACKPOT", prompt: "Include a JACKPOT callout." },
    { value: "mega", label: "MEGA WIN", prompt: "Include a MEGA WIN callout." },
  ],
};
const FIELD_JACKPOT_TIER: TemplateField = {
  id: "jackpotTier",
  type: "select",
  label: "Тир джекпота",
  default: "mega",
  options: [
    { value: "mega", label: "Mega", prompt: "Headline a Mega jackpot tier." },
    { value: "grand", label: "Grand", prompt: "Headline a Grand jackpot tier." },
    { value: "daily", label: "Daily", prompt: "Headline a Daily jackpot tier." },
  ],
};
const FIELD_ODDS_MULT: TemplateField = {
  id: "oddsMult",
  type: "select",
  label: "Множитель",
  default: "x50",
  options: [
    { value: "x10", label: "×10", prompt: "Headline a ×10 odds multiplier." },
    { value: "x25", label: "×25", prompt: "Headline a ×25 odds multiplier." },
    { value: "x50", label: "×50", prompt: "Headline a ×50 odds multiplier." },
    { value: "x100", label: "×100", prompt: "Headline a ×100 odds multiplier." },
  ],
};

/** Compile the user's field selections into a single CUSTOMISATION instruction
 *  string appended to the generation prompt. Empty when nothing meaningful. */
export function compileTemplateOptions(
  fields: TemplateField[] | undefined,
  values: Record<string, string | boolean>,
): string {
  if (!fields?.length) return "";
  const parts: string[] = [];
  for (const f of fields) {
    if (f.type === "select") {
      const v = (values[f.id] as string) ?? f.default;
      const opt = f.options.find((o) => o.value === v);
      if (opt?.prompt) parts.push(opt.prompt);
    } else {
      const on = (values[f.id] as boolean) ?? f.default ?? false;
      if (on) parts.push(f.prompt);
    }
  }
  return parts.join(" ");
}

export const PRESETS: Preset[] = [
  {
    id: "preset1",
    fields: [FIELD_BONUS_BADGE],
    name: "Широкий угол",
    description: "Яркая инфографика для товара с крупными цифрами и характеристиками",
    gradient: "linear-gradient(135deg,#a3e635,#22d3ee,#f0abfc)",
    preview: presetWideAngle.src,
    examples: [
      "linear-gradient(135deg,#a3e635,#22d3ee)",
      "linear-gradient(160deg,#f0abfc,#a3e635)",
      "linear-gradient(120deg,#22d3ee,#fde68a)",
      "linear-gradient(140deg,#fbcfe8,#a3e635)",
    ],
    template: `High-impact e-commerce infographic for {SUBJECT}. Foreground: An extreme close-up of a hand holding the product toward the camera, glossy and detailed, presented at a flattering angle that shows the packaging/label clearly. The hand and product have a slight macro-lens blur to create a sense of depth. Central Subject: In the mid-ground, a smiling young female model with natural, brand-appropriate styling, interacting with the product naturally and looking radiant. Background & Lighting: A clean, soft-focus backdrop with a subtle gradient that matches the brand mood. The scene is accented by diagonal rainbow prism lens flares and soft light leaks. Several blurred copies of the product float artistically in the background. Lighting is soft, professional and highlights the product material. Typography & Layout (Sans-Serif, White): Top Center (Background): Massive, bold brand-style headline in the subject's native language, positioned behind the model. Top Right: Bold product name. Mid-Left: a short key feature line. Mid-Right: a large bold NUMBER with a short unit/benefit caption. Bottom-Right: another large bold NUMBER with a short unit/benefit caption. Derive the headline, product name, feature line, and the two big numbers from the subject description above — keep them short, punchy, and commercially relevant, written in the language that matches the brand and audience (e.g. Ukrainian brands → Ukrainian text). Example reference adaptation for "Моршинська" natural water: Foreground — a hand holding a glossy clear PET bottle of Моршинська with crisp blue label toward camera, condensation droplets, macro blur; Central Subject — a smiling young woman with light freckles and softly wavy hair, wearing a fresh sky-blue knit top, holding the bottle near her face; Background — soft-focus misty Carpathian forest at sunrise with a light-blue gradient and diagonal rainbow prism flares, several blurred bottles floating; Typography (white, sans-serif, Ukrainian): background headline "МОРШИНСЬКА", top-right "Моршинська Природна", mid-left "Чиста вода з Карпатських джерел", mid-right "100%" + "природна мінералізація", bottom-right "4" + "ступені фільтрації природою". Style: 8k resolution, commercial product photography, vibrant yet natural color palette, sharp focus on the product, shallow depth of field, clean advertising aesthetic.`,
  },
  {
    id: "preset2",
    fields: [FIELD_WIN_CALLOUT, FIELD_CASINO_PROP],
    name: "Баннер по слоту",
    description: "Премиум gaming-баннер для конкретного слота",
    gradient: "linear-gradient(135deg,#0f172a,#7c3aed,#22d3ee)",
    preview: presetSlotBanner.src,
    examples: [
      "linear-gradient(135deg,#0f172a,#7c3aed)",
      "linear-gradient(160deg,#1e1b4b,#22d3ee)",
      "linear-gradient(120deg,#020617,#a855f7)",
      "linear-gradient(140deg,#0c4a6e,#06b6d4)",
    ],
    template: `Create banners in a premium gaming advertising style: vibrant, cinematic, highly detailed, glossy, high-contrast, with depth, glow effects, atmospheric lighting, soft smoke, particles, reflections, and dynamic energy. The composition must feel clean, balanced, modern, and highly readable.

GENERAL STRUCTURE
1. The logo is always the first visual anchor.
2. The headline is the largest text element after the key visual.
3. The CTA button is placed below the text block.
4. The key visual is the emotional focal point of the banner: detailed, expressive, premium, and visually dominant.
5. The background must support the composition without competing with the text.
6. Maintain generous spacing and visual breathing room between all elements.
7. Keep all important content inside safe margins (5–8% from edges).

HORIZONTAL BANNER LAYOUT
Use a two-column composition.
Left Side: logo top-left; main text block below; left-aligned; large bold readable headline; secondary text smaller below; CTA button below text; calmer darker left side for readability.
Right Side: key visual on the right occupying ~40–55% of width; subject large, detailed, dimensional, premium; cinematic lighting, glow, reflections, particles, depth; may slightly overlap outside its area dynamically but never interfere with text readability.
Eye flow: logo → headline → supporting text → CTA → key visual.

SQUARE & VERTICAL BANNER LAYOUT
Centered vertical composition, top to bottom: logo, key visual, headline, supporting text, CTA. Center-align all elements. Key visual is the dominant central focus. Text large, compact, highly readable. CTA stands out without overpowering the headline. Consistent vertical spacing. Avoid overcrowding the top. Avoid long text lines in vertical formats.

COLOR & TYPOGRAPHY
Text colors selected from the key visual palette using color theory and professional contrast. Warm visuals pair with cooler typography; dark/cool visuals use bright warm/neon/light accents. Use analogous palettes for harmony, complementary for advertising contrast, accent colors for CTA and highlighted words. Headline must have maximum readability and contrast. Secondary text softer. CTA color belongs to accent palette. Glow, shadows, outlines, gradients, depth allowed if readability improves. Avoid more than 2–3 dominant colors.

BACKGROUND
Dark, rich, atmospheric backgrounds with gradients and depth. Text area visually cleaner and darker. Key visual area may have brighter lighting and energy. Add subtle blur, particles, light rays, reflections, smoke, cinematic effects. Background never overpowers typography.

KEY VISUAL
Premium, detailed, dimensional, visually rich. Realistic lighting, rim light, reflections, highlights, shadows. Supporting decorative elements for depth and movement. Creates emotion and attention instantly. Supports the marketing message but never replaces CTA hierarchy.

CTA BUTTON
Below the text block. Highly visible, contrast-driven. Rounded corners, subtle depth/shadow/glow. Readable at small sizes. CTA color belongs to the palette while standing out.

HIERARCHY: Logo → Headline → Supporting text → CTA → Key visual. Headline dominates typography hierarchy. Supporting text clearly secondary. CTA attracts attention without overpowering headline. Key visual emotionally enhances the banner while supporting readability.

AVOID: text over highly detailed background; overcrowding; weak contrast; random unrelated colors; tiny unreadable text; visual clutter; broken hierarchy; key visual overlapping logo or important text.

FINAL DIRECTION: a premium modern gaming advertisement — clean structure, cinematic lighting, powerful key visual, highly readable typography, strong emotional impact, balanced composition, cohesive color harmony based on professional contrast and color wheel principles.

The subject of the banner is the slot "{SUBJECT}". The reference images attached include the SLOT SCREENSHOT (use it as the key visual — reproduce its art, characters, symbols and color palette faithfully and dimensionally) and optionally the SLOT LOGO / BRAND LOGO (reproduce them exactly, no redesign, place them according to the layout rules above).`,
  },
  {
    id: "preset3",
    fields: [FIELD_BONUS_BADGE, FIELD_WIN_CALLOUT],
    name: "Событие",
    description: "Гемблинг/беттинг баннер под событие или повод",
    gradient: "linear-gradient(135deg,#1e1b4b,#dc2626,#f59e0b)",
    preview: presetEvent.src,
    examples: [
      "linear-gradient(135deg,#1e1b4b,#dc2626)",
      "linear-gradient(160deg,#0f172a,#f59e0b)",
      "linear-gradient(120deg,#7c2d12,#fbbf24)",
      "linear-gradient(140deg,#312e81,#ef4444)",
    ],
    template: "EVENT_PRESET",
  },
  {
    id: "preset4",
    fields: [FIELD_SPORT, FIELD_SHOW_ODDS],
    name: "Спорт / Ставки",
    description: "Беттинг-баннер под спортивное событие (face-off, fight poster, esports)",
    gradient: "linear-gradient(135deg,#0b1220,#1d4ed8,#dc2626)",
    preview: presetSport.src,
    examples: [
      "linear-gradient(135deg,#0b1220,#1d4ed8)",
      "linear-gradient(160deg,#0a0a0a,#dc2626)",
      "linear-gradient(120deg,#020617,#22d3ee)",
      "linear-gradient(140deg,#1e1b4b,#ef4444)",
    ],
    template: "SPORT_PRESET",
  },
  {
    id: "preset5",
    fields: [FIELD_SHOW_ODDS, FIELD_MATCH_MOMENT],
    name: "Боевые искусства",
    description: "Кинематографичный fighter-портрет: бокс/ММА, пот, энергетический свет",
    gradient: "linear-gradient(135deg,#0b0b0f,#dc2626,#f59e0b)",
    examples: [
      "linear-gradient(135deg,#0b0b0f,#dc2626)",
      "linear-gradient(160deg,#111827,#f59e0b)",
      "linear-gradient(120deg,#7f1d1d,#f97316)",
      "linear-gradient(140deg,#0b0b0f,#ef4444)",
    ],
    template: "MARTIAL_ARTS_PRESET",
    isNew: true,
  },
  // ── Style/effect templates (Higgsfield-inspired) — plain `template` strings
  //    that flow through the generic adaptPrompt rewrite. Each swaps only the
  //    visual STYLE; {SUBJECT} is filled with the banner topic at generation. ──
  {
    id: "preset6",
    fields: [FIELD_JACKPOT_TIER, FIELD_CASINO_PROP, FIELD_WIN_CALLOUT],
    name: "Джекпот-взрыв",
    description: "Взрыв монет и фишек, big-win энергия, объёмный свет",
    gradient: "linear-gradient(135deg,#0b0b0f,#f59e0b,#fde047)",
    examples: [
      "linear-gradient(135deg,#0b0b0f,#f59e0b)",
      "linear-gradient(160deg,#1e1b4b,#fde047)",
      "linear-gradient(120deg,#7c2d12,#fbbf24)",
      "linear-gradient(140deg,#0b0b0f,#f97316)",
    ],
    isNew: true,
    template:
      "Create a high-energy casino/gambling advertisement banner for {SUBJECT}. " +
      "STYLE: explosive big-win moment — a burst of gold coins, casino chips and confetti flying toward the camera, volumetric light rays, sparks, glowing particles, dramatic depth of field. " +
      "COMPOSITION: the hero subject sits in the CENTER emerging from the explosion; coins and chips radiate outward; strong central focal point. " +
      "LIGHTING: warm golden key light, rim light on the subject, glints on metallic coins. " +
      "TYPOGRAPHY & LAYOUT: bold headline area kept in the central safe zone; leave room for a CTA button below; do not clutter the corners. " +
      "COLOR: black/deep-navy base with gold and lime accents. " +
      "AVOID: muddy contrast, unreadable text, more than 3 dominant colors, generic stock-photo look.",
  },
  {
    id: "preset7",
    fields: [FIELD_CASINO_PROP, FIELD_WIN_CALLOUT],
    name: "Ультрафиолет / Неон",
    description: "Киберпанк-неон, фиолет-циан свечение, голо-UI",
    gradient: "linear-gradient(135deg,#0f0524,#7c3aed,#22d3ee)",
    examples: [
      "linear-gradient(135deg,#0f0524,#7c3aed)",
      "linear-gradient(160deg,#1e1b4b,#22d3ee)",
      "linear-gradient(120deg,#3b0764,#06b6d4)",
      "linear-gradient(140deg,#020617,#a855f7)",
    ],
    isNew: true,
    template:
      "Create a cyberpunk neon advertisement banner for {SUBJECT}. " +
      "STYLE: ultraviolet neon aesthetic — glowing purple and cyan light, holographic UI panels, laser grid, wet reflective floor, volumetric haze, glassmorphism, high-tech energy. " +
      "COMPOSITION: hero subject centered with a strong neon rim light separating it from a dark futuristic background. " +
      "LIGHTING: neon key lights (magenta + cyan), glowing edges, reflections and lens flares. " +
      "TYPOGRAPHY & LAYOUT: crisp modern sans-serif with subtle glow; headline and CTA inside the central safe zone. " +
      "COLOR: near-black base, 2 neon accents (violet + cyan) only. " +
      "AVOID: washed-out contrast, cluttered corners, unreadable glowing text, more than 3 dominant colors.",
  },
  {
    id: "preset8",
    fields: [FIELD_CASINO_PROP, FIELD_WIN_CALLOUT],
    name: "Рулетка в движении",
    description: "Крутящаяся рулетка и шарик, motion-blur, стол казино",
    gradient: "linear-gradient(135deg,#0b0b0f,#166534,#f59e0b)",
    examples: [
      "linear-gradient(135deg,#0b0b0f,#166534)",
      "linear-gradient(160deg,#14532d,#f59e0b)",
      "linear-gradient(120deg,#052e16,#fbbf24)",
      "linear-gradient(140deg,#0b0b0f,#15803d)",
    ],
    isNew: true,
    template:
      "Create a premium casino roulette advertisement banner for {SUBJECT}. " +
      "STYLE: dynamic spinning roulette wheel — glossy red/black pockets, a bright ball caught mid-spin with motion blur, green felt table, chips and a gold rim, dramatic depth of field, cinematic casino energy. " +
      "COMPOSITION: the roulette wheel as the hero element (angled 3/4 view) in the central focal area; hero subject or brand accent alongside. " +
      "LIGHTING: warm spotlight on the wheel, glossy specular highlights, soft rim light. " +
      "TYPOGRAPHY & LAYOUT: bold headline and CTA inside the central safe zone; leave the corners for atmosphere. " +
      "COLOR: casino green felt + red/black + gold accent (max 3 dominant colors). " +
      "AVOID: flat lifeless wheel, unreadable text, cluttered corners, generic stock-photo look.",
  },
  {
    id: "preset9",
    fields: [FIELD_CASINO_PROP, FIELD_WIN_CALLOUT],
    name: "Ретро-Вегас / Vaporwave",
    description: "80–90-е Вегас: хром-текст, неон-закат, VHS-зерно",
    gradient: "linear-gradient(135deg,#2b1055,#ff2d95,#ffd36e)",
    examples: [
      "linear-gradient(135deg,#2b1055,#ff2d95)",
      "linear-gradient(160deg,#1a103d,#ffd36e)",
      "linear-gradient(120deg,#3b0764,#f472b6)",
      "linear-gradient(140deg,#0f172a,#fb7185)",
    ],
    isNew: true,
    template:
      "Create a retro 80s–90s Las Vegas / vaporwave advertisement banner for {SUBJECT}. " +
      "STYLE: nostalgic vaporwave — chrome 3D lettering, sunset gradient (magenta→purple→orange), palm-tree silhouettes, retro marquee light bulbs, subtle VHS grain and scanlines, grid horizon. " +
      "COMPOSITION: hero subject centered against the sunset grid; retro sun behind. " +
      "LIGHTING: warm neon glow, chrome reflections. " +
      "TYPOGRAPHY & LAYOUT: bold chrome/neon headline, retro CTA, all within the central safe zone. " +
      "COLOR: magenta, purple and warm orange accents. " +
      "AVOID: modern flat minimalism, unreadable text, overly busy grain.",
  },
  {
    id: "preset10",
    fields: [FIELD_CASINO_PROP, FIELD_WIN_CALLOUT],
    name: "Luxury Noir (VIP)",
    description: "Чёрное с золотом, драматичный свет, премиум hi-roller",
    gradient: "linear-gradient(135deg,#000000,#1c1917,#d4af37)",
    examples: [
      "linear-gradient(135deg,#000000,#d4af37)",
      "linear-gradient(160deg,#0b0b0f,#b8860b)",
      "linear-gradient(120deg,#1c1917,#eab308)",
      "linear-gradient(140deg,#000000,#facc15)",
    ],
    isNew: true,
    template:
      "Create a luxury black-and-gold VIP casino advertisement banner for {SUBJECT}. " +
      "STYLE: cinematic noir premium — deep blacks, gold accents, dramatic single-source lighting, soft smoke, elegant high-roller mood, gold-foil details, film-noir shadows. " +
      "COMPOSITION: hero subject centered, dramatic chiaroscuro, lots of dark negative space. " +
      "LIGHTING: one hard key light, deep falloff into shadow, gold specular highlights. " +
      "TYPOGRAPHY & LAYOUT: elegant serif or refined sans headline in gold, understated CTA, central safe zone. " +
      "COLOR: black base + gold accent only (2 colors). " +
      "AVOID: bright cheerful palettes, clutter, weak contrast, more than 2 dominant colors.",
  },
  {
    id: "preset11",
    fields: [FIELD_WIN_CALLOUT, FIELD_CASINO_PROP],
    name: "Комикс поп-арт",
    description: "Полутон Бен-Дэй, чернильный контур, «WIN!» в облаке",
    gradient: "linear-gradient(135deg,#1d4ed8,#facc15,#ef4444)",
    examples: [
      "linear-gradient(135deg,#1d4ed8,#facc15)",
      "linear-gradient(160deg,#2563eb,#ef4444)",
      "linear-gradient(120deg,#f59e0b,#dc2626)",
      "linear-gradient(140deg,#1e3a8a,#fbbf24)",
    ],
    isNew: true,
    template:
      "Create a comic-book pop-art advertisement banner for {SUBJECT}. " +
      "STYLE: bold comic pop-art — thick black ink outlines, Ben-Day halftone dots, vivid primary colors, dynamic action lines, a burst/star callout, optional speech bubble. " +
      "COMPOSITION: energetic centered hero with radial action lines; comic-panel feel. " +
      "LIGHTING: flat cel-shaded comic lighting, hard highlights. " +
      "TYPOGRAPHY & LAYOUT: bold comic display font, headline inside a burst or bubble, CTA as a comic button — all in the central safe zone. " +
      "COLOR: 2–3 vivid primaries (blue, red, yellow). " +
      "AVOID: photorealism, muddy gradients, tiny unreadable text.",
  },
  {
    id: "preset12",
    fields: [FIELD_CASINO_PROP, FIELD_WIN_CALLOUT],
    name: "Покер-нуар",
    description: "Роял-флеш и стопки фишек макро, драматичный стол",
    gradient: "linear-gradient(135deg,#0b0b0f,#7f1d1d,#d4af37)",
    examples: [
      "linear-gradient(135deg,#0b0b0f,#7f1d1d)",
      "linear-gradient(160deg,#1c1917,#d4af37)",
      "linear-gradient(120deg,#450a0a,#eab308)",
      "linear-gradient(140deg,#0b0b0f,#b91c1c)",
    ],
    isNew: true,
    template:
      "Create a cinematic poker advertisement banner for {SUBJECT}. " +
      "STYLE: dramatic poker-noir — a winning hand of cards (e.g. a royal flush) and tall stacks of casino chips shot macro on a dark felt table, moody low-key lighting, cigar smoke haze, gold accents, high-stakes cinematic mood. " +
      "COMPOSITION: hero cards and chip stacks as the central focal point; optional confident player hand or subject alongside. " +
      "LIGHTING: single warm overhead table light, deep shadow falloff, gold specular glints on chips. " +
      "TYPOGRAPHY & LAYOUT: bold headline and CTA inside the central safe zone; keep corners dark and atmospheric. " +
      "COLOR: dark felt (green or deep red) base + gold accent (max 3 dominant colors). " +
      "AVOID: bright flat lighting, unreadable text, cluttered corners, generic stock-photo look.",
  },
  {
    id: "preset13",
    fields: [FIELD_SPORT, FIELD_SHOW_ODDS],
    name: "Голо-статборд",
    description: "Голографические коэффициенты, HUD, стат-графы",
    gradient: "linear-gradient(135deg,#020617,#1d4ed8,#22d3ee)",
    examples: [
      "linear-gradient(135deg,#020617,#1d4ed8)",
      "linear-gradient(160deg,#0b1220,#22d3ee)",
      "linear-gradient(120deg,#0f172a,#38bdf8)",
      "linear-gradient(140deg,#020617,#3b82f6)",
    ],
    isNew: true,
    template:
      "Create a sports-betting holographic data-board advertisement banner for {SUBJECT}. " +
      "STYLE: futuristic HUD / data-viz — glowing holographic odds, stat bars and line graphs, translucent UI panels, tracking reticles, a stadium/arena backdrop with floodlights and haze. " +
      "COMPOSITION: hero subject (athlete or team symbol) centered with data overlays floating around; a clear odds/number highlight. " +
      "LIGHTING: cool blue key light, glowing HUD accents, rim light on the subject. " +
      "TYPOGRAPHY & LAYOUT: tabular futuristic numerals for odds, bold headline and CTA in the central safe zone. " +
      "COLOR: dark navy base with electric blue + cyan accents. " +
      "AVOID: fake scrambled numbers, cluttered edges, unreadable tiny stats, more than 3 dominant colors.",
  },
  {
    id: "preset14",
    fields: [FIELD_WIN_CALLOUT],
    name: "Стрит / граффити",
    description: "Спрей-текстуры, граффити-теги, стритвир-энергия",
    gradient: "linear-gradient(135deg,#111827,#22c55e,#f43f5e)",
    examples: [
      "linear-gradient(135deg,#111827,#22c55e)",
      "linear-gradient(160deg,#0b0f17,#f43f5e)",
      "linear-gradient(120deg,#1f2937,#a3e635)",
      "linear-gradient(140deg,#0f172a,#fb7185)",
    ],
    isNew: true,
    template:
      "Create an urban street-graffiti advertisement banner for {SUBJECT}. " +
      "STYLE: raw streetwear energy — spray-paint textures, graffiti tags and throw-ups on a concrete wall, dripping paint, stencil marks, torn poster layers, gritty grain, bold hype aesthetic. " +
      "COMPOSITION: hero subject centered against the painted wall; graffiti frames the headline. " +
      "LIGHTING: natural street lighting with strong contrast. " +
      "TYPOGRAPHY & LAYOUT: bold graffiti/stencil display headline, spray-style CTA, kept within the central safe zone. " +
      "COLOR: gritty base + 1–2 vivid spray accents. " +
      "AVOID: clean corporate minimalism, unreadable overlapping tags, weak contrast.",
  },
  {
    id: "preset15",
    name: "Мистик-фэнтези",
    description: "Эпик-фэнтези: руны, сокровища, магические частицы",
    gradient: "linear-gradient(135deg,#1e1b4b,#7c3aed,#d4af37)",
    examples: [
      "linear-gradient(135deg,#1e1b4b,#7c3aed)",
      "linear-gradient(160deg,#0b0b2b,#d4af37)",
      "linear-gradient(120deg,#312e81,#a855f7)",
      "linear-gradient(140deg,#0f172a,#eab308)",
    ],
    isNew: true,
    template:
      "Create an epic fantasy slot advertisement banner for {SUBJECT}. " +
      "STYLE: mythic fantasy realm — glowing magical runes, treasure hoards, dragons or mystical creatures, enchanted particles and embers, ornate carved gold frame, dramatic sword-and-sorcery mood. " +
      "COMPOSITION: hero subject centered as the fantasy focal point, magical light emanating outward, ornate framing. " +
      "LIGHTING: magical volumetric glow, warm gold + arcane purple light. " +
      "TYPOGRAPHY & LAYOUT: ornate fantasy display headline, gilded CTA, all within the central safe zone. " +
      "COLOR: deep purple/navy base with gold and arcane accents. " +
      "AVOID: modern flat UI, unreadable ornate text, more than 3 dominant colors.",
    fields: [
      {
        id: "creature",
        type: "select",
        label: "Существо",
        default: "dragon",
        options: [
          { value: "dragon", label: "Дракон", prompt: "Feature a mighty dragon as the central creature." },
          { value: "phoenix", label: "Феникс", prompt: "Feature a blazing phoenix as the central creature." },
          { value: "griffin", label: "Грифон", prompt: "Feature a majestic griffin as the central creature." },
          { value: "kraken", label: "Кракен", prompt: "Feature a monstrous kraken as the central creature." },
        ],
      },
      {
        id: "setting",
        type: "select",
        label: "Локация",
        default: "vault",
        options: [
          { value: "vault", label: "Сокровищница", prompt: "Setting: a glowing treasure vault." },
          { value: "dungeon", label: "Подземелье", prompt: "Setting: a dark dungeon." },
          { value: "forest", label: "Зачарованный лес", prompt: "Setting: an enchanted forest." },
          { value: "lair", label: "Логово в лаве", prompt: "Setting: a volcanic lair." },
        ],
      },
      FIELD_BONUS_BADGE,
    ],
  },
  // ── Betting-native templates (sportsbook domain) — plain `template` strings
  //    routed through adaptPrompt like the others. ──
  {
    id: "preset16",
    fields: [FIELD_WIN_CALLOUT, FIELD_SHOW_ODDS],
    name: "Победный купон",
    description: "Выигрышный бет-слип, денежный дождь, зелёный тикет",
    gradient: "linear-gradient(135deg,#0b0b0f,#15803d,#facc15)",
    examples: [
      "linear-gradient(135deg,#0b0b0f,#15803d)",
      "linear-gradient(160deg,#052e16,#facc15)",
      "linear-gradient(120deg,#14532d,#fbbf24)",
      "linear-gradient(140deg,#0b0b0f,#22c55e)",
    ],
    isNew: true,
    template:
      "Create a sports-betting WIN advertisement banner for {SUBJECT}. " +
      "STYLE: winning-moment energy — a glowing bet slip / ticket marked as WON, cash and coins raining, green confirmation glow, celebration sparks, stadium bokeh. " +
      "COMPOSITION: the winning bet slip as the hero element in the central focal area, money and a big payout number around it. " +
      "LIGHTING: bright green success glow, warm highlights on coins. " +
      "TYPOGRAPHY & LAYOUT: bold headline and CTA in the central safe zone; a large payout figure allowed as an accent. " +
      "COLOR: dark base + betting green + gold accent. " +
      "AVOID: fake scrambled numbers on the slip, unreadable text, cluttered corners.",
  },
  {
    id: "preset17",
    fields: [FIELD_SPORT, FIELD_SHOW_ODDS, FIELD_MATCH_MOMENT],
    name: "Live-ставки",
    description: "Красный LIVE, in-play тикер, динамичный стадион",
    gradient: "linear-gradient(135deg,#0b0b0f,#dc2626,#f59e0b)",
    examples: [
      "linear-gradient(135deg,#0b0b0f,#dc2626)",
      "linear-gradient(160deg,#111827,#f59e0b)",
      "linear-gradient(120deg,#450a0a,#ef4444)",
      "linear-gradient(140deg,#0b0b0f,#f97316)",
    ],
    isNew: true,
    template:
      "Create a LIVE in-play sports-betting advertisement banner for {SUBJECT}. " +
      "STYLE: real-time broadcast energy — a pulsing red LIVE badge, an in-play odds ticker, motion-blurred action, floodlit stadium, dynamic camera feel, HUD score strip. " +
      "COMPOSITION: hero action moment centered with a LIVE badge and a live odds panel in the central zone. " +
      "LIGHTING: stadium floodlights, punchy contrast, red accent glow. " +
      "TYPOGRAPHY & LAYOUT: broadcast-style headline, live odds numerals and CTA inside the central safe zone. " +
      "COLOR: dark base + broadcast red + one accent. " +
      "AVOID: static lifeless composition, unreadable ticker text, cluttered corners.",
  },
  {
    id: "preset18",
    fields: [FIELD_ODDS_MULT, FIELD_SHOW_ODDS],
    name: "Экспресс x50",
    description: "Аккумулятор: цепочка исходов, крупный множитель",
    gradient: "linear-gradient(135deg,#0b1220,#1d4ed8,#a3e635)",
    examples: [
      "linear-gradient(135deg,#0b1220,#1d4ed8)",
      "linear-gradient(160deg,#020617,#a3e635)",
      "linear-gradient(120deg,#1e3a8a,#22d3ee)",
      "linear-gradient(140deg,#0b1220,#3b82f6)",
    ],
    isNew: true,
    template:
      "Create an accumulator (parlay) sports-betting advertisement banner for {SUBJECT}. " +
      "STYLE: combo-bet energy — a chain of linked selections building up to one huge total-odds multiplier, glowing connectors, ticket stack, ascending arrow, electric momentum. " +
      "COMPOSITION: the chained selections lead the eye to a big central multiplier number (the hero), CTA below. " +
      "LIGHTING: cool blue base with a lime energy accent, glowing links. " +
      "TYPOGRAPHY & LAYOUT: bold multiplier figure as the accent, headline + CTA in the central safe zone. " +
      "COLOR: navy base + blue + lime accent. " +
      "AVOID: unreadable odds text, cluttered chain, more than 3 dominant colors.",
  },
  {
    id: "preset19",
    name: "Коэффициент-буст",
    description: "Усиленные коэффициенты, молния, электрический акцент",
    gradient: "linear-gradient(135deg,#020617,#2563eb,#22d3ee)",
    examples: [
      "linear-gradient(135deg,#020617,#2563eb)",
      "linear-gradient(160deg,#0b1220,#22d3ee)",
      "linear-gradient(120deg,#1e3a8a,#38bdf8)",
      "linear-gradient(140deg,#020617,#3b82f6)",
    ],
    isNew: true,
    template:
      "Create an ODDS BOOST sports-betting advertisement banner for {SUBJECT}. " +
      "STYLE: high-voltage boost — a boosted odds figure with lightning bolts, electric sparks, an upward 'boosted from → to' motif, energetic glow, charged atmosphere. " +
      "COMPOSITION: one large boosted-odds number as the hero in the central zone, lightning framing it. " +
      "LIGHTING: electric blue + cyan glow, bright rim on the number. " +
      "TYPOGRAPHY & LAYOUT: huge bold odds numeral accent, short headline + CTA inside the central safe zone. " +
      "COLOR: near-black base + electric blue/cyan accents. " +
      "AVOID: fake garbled numbers, cluttered corners, weak contrast.",
    fields: [
      {
        id: "boostTo",
        type: "select",
        label: "Множитель буста",
        default: "x5",
        options: [
          { value: "x2", label: "×2", prompt: "Show a boosted odds multiplier of x2." },
          { value: "x5", label: "×5", prompt: "Show a boosted odds multiplier of x5." },
          { value: "x10", label: "×10", prompt: "Show a boosted odds multiplier of x10." },
          { value: "x50", label: "×50", prompt: "Show a boosted odds multiplier of x50." },
        ],
      },
      FIELD_SPORT,
      {
        id: "promoDay",
        type: "select",
        label: "Повод промо",
        default: "friday",
        options: [
          { value: "friday", label: "Boost Friday", prompt: "Promo occasion: Boost Friday." },
          { value: "weekend", label: "Weekend Special", prompt: "Promo occasion: Weekend Special." },
          { value: "daily", label: "Daily Boost", prompt: "Promo occasion: Daily Boost." },
        ],
      },
    ],
  },
  {
    id: "preset20",
    name: "Приветственный бонус",
    description: "Фрибет/бонус, подарок, «100%», монеты",
    gradient: "linear-gradient(135deg,#1e1b4b,#7c3aed,#facc15)",
    examples: [
      "linear-gradient(135deg,#1e1b4b,#7c3aed)",
      "linear-gradient(160deg,#0f172a,#facc15)",
      "linear-gradient(120deg,#3b0764,#fbbf24)",
      "linear-gradient(140deg,#1e1b4b,#a855f7)",
    ],
    isNew: true,
    template:
      "Create a welcome-bonus / free-bet sports-betting advertisement banner for {SUBJECT}. " +
      "STYLE: gift-and-reward energy — a glowing gift box or free-bet token spilling coins, a bold bonus percentage callout, ribbons, sparkles, premium promo mood. " +
      "COMPOSITION: the bonus offer (gift + big percentage) centered as the hero, CTA directly below. " +
      "LIGHTING: warm celebratory glow, gold highlights on coins. " +
      "TYPOGRAPHY & LAYOUT: large bonus figure as accent, welcome headline + CTA in the central safe zone. " +
      "COLOR: violet base + gold accent. " +
      "AVOID: cluttered promo callouts, unreadable text, more than 3 dominant colors.",
    fields: [
      {
        id: "bonusPercent",
        type: "select",
        label: "Бонус %",
        default: "100",
        options: [
          { value: "100", label: "100%", prompt: "The headline welcome bonus is 100%." },
          { value: "150", label: "150%", prompt: "The headline welcome bonus is 150%." },
          { value: "200", label: "200%", prompt: "The headline welcome bonus is 200%." },
          { value: "500", label: "500%", prompt: "The headline welcome bonus is 500%." },
        ],
      },
      { id: "freeBet", type: "checkbox", label: "Фрибет", prompt: "Also mention a free bet offer." },
      {
        id: "offerType",
        type: "select",
        label: "Тип оффера",
        default: "welcome",
        options: [
          { value: "welcome", label: "Приветственный", prompt: "Frame it as a welcome bonus offer." },
          { value: "deposit", label: "На депозит", prompt: "Frame it as a deposit-match offer." },
          { value: "cashback", label: "Кэшбэк", prompt: "Frame it as a cashback offer." },
        ],
      },
    ],
  },
  {
    id: "preset23",
    fields: [FIELD_JACKPOT_TIER, FIELD_WIN_CALLOUT],
    name: "Тото / лотерея",
    description: "Лото-шары, счастливые числа, призовой пул",
    gradient: "linear-gradient(135deg,#042f2e,#0d9488,#fbbf24)",
    examples: [
      "linear-gradient(135deg,#042f2e,#0d9488)",
      "linear-gradient(160deg,#022c22,#fbbf24)",
      "linear-gradient(120deg,#134e4a,#facc15)",
      "linear-gradient(140deg,#042f2e,#14b8a6)",
    ],
    isNew: true,
    template:
      "Create a toto / lottery betting advertisement banner for {SUBJECT}. " +
      "STYLE: jackpot-draw energy — bouncing numbered lottery balls, lucky numbers, a glowing prize-pool figure, sparkles and confetti, hopeful bright mood. " +
      "COMPOSITION: lottery balls and a big prize-pool number centered as the hero, CTA below. " +
      "LIGHTING: bright playful glow, glossy highlights on the balls. " +
      "TYPOGRAPHY & LAYOUT: large prize figure accent, short headline + CTA in the central safe zone. " +
      "COLOR: teal base + gold accent. " +
      "AVOID: fake scrambled numbers, cluttered balls, unreadable text.",
  },
  {
    id: "preset24",
    fields: [FIELD_SPORT],
    name: "Дерби эмблем",
    description: "Столкновение эмблем/флагов, VS, без лиц",
    gradient: "linear-gradient(135deg,#0b1220,#1d4ed8,#dc2626)",
    examples: [
      "linear-gradient(135deg,#0b1220,#1d4ed8)",
      "linear-gradient(160deg,#0b0b0f,#dc2626)",
      "linear-gradient(120deg,#1e3a8a,#ef4444)",
      "linear-gradient(140deg,#020617,#2563eb)",
    ],
    isNew: true,
    template:
      "Create a rivalry / derby sports-betting advertisement banner for {SUBJECT}. " +
      "STYLE: emblem clash — two large stylized team crests or national flags facing off across a central VS divider, sparks at the clash point, dramatic split warm-vs-cool sides, arena atmosphere. NO human faces — symbolism only. " +
      "COMPOSITION: symmetrical left-vs-right emblems with a bold VS in the center; odds and CTA in the central zone. " +
      "LIGHTING: dramatic rim light on each crest, sparks and haze at the divider. " +
      "TYPOGRAPHY & LAYOUT: bold matchup headline, VS mark and CTA within the central safe zone. " +
      "COLOR: split palette — cool side vs warm side + neutral base. " +
      "AVOID: photorealistic named athletes, unreadable text, cluttered corners.",
  },
  {
    id: "preset25",
    fields: [FIELD_SHOW_ODDS, FIELD_WIN_CALLOUT],
    name: "Кэшаут",
    description: "Момент кэшаута, зафиксированный выигрыш, зелёная кнопка",
    gradient: "linear-gradient(135deg,#0b0b0f,#16a34a,#a3e635)",
    examples: [
      "linear-gradient(135deg,#0b0b0f,#16a34a)",
      "linear-gradient(160deg,#052e16,#a3e635)",
      "linear-gradient(120deg,#14532d,#22c55e)",
      "linear-gradient(140deg,#0b0b0f,#4ade80)",
    ],
    isNew: true,
    template:
      "Create a CASH OUT sports-betting advertisement banner for {SUBJECT}. " +
      "STYLE: secure-your-winnings energy — a glowing green CASH OUT button being pressed, a bet slip converting to guaranteed cash, upward secured-profit motif, coins, reassuring premium feel. " +
      "COMPOSITION: the cash-out button and secured payout figure centered as the hero, CTA aligned with it. " +
      "LIGHTING: confident green success glow, gold highlights on cash. " +
      "TYPOGRAPHY & LAYOUT: bold payout figure accent, short headline + CTA in the central safe zone. " +
      "COLOR: dark base + betting green + lime accent. " +
      "AVOID: fake garbled numbers, cluttered corners, unreadable text.",
  },
  // ── Top-10 most-bet-on sports — sport-specific betting banner templates.
  //    Environments mirror the server SPORT_BG map for authenticity. ──
  {
    id: "preset26",
    fields: [FIELD_SHOW_ODDS, FIELD_MATCH_MOMENT, FIELD_TIME_OF_DAY],
    name: "Футбол",
    description: "Беттинг-баннер под футбол: стадион, экшн, командные цвета",
    gradient: "linear-gradient(135deg,#052e16,#16a34a,#f1f5f9)",
    examples: [
      "linear-gradient(135deg,#052e16,#16a34a)",
      "linear-gradient(160deg,#0b1220,#22c55e)",
      "linear-gradient(120deg,#14532d,#f1f5f9)",
      "linear-gradient(140deg,#052e16,#4ade80)",
    ],
    isNew: true,
    template:
      "Create a premium football (soccer) sports-betting advertisement banner for {SUBJECT}. " +
      "ENVIRONMENT: a stadium with floodlights, packed stands blurred in the background, green pitch tint, atmospheric smoke. " +
      "HERO: a dynamic stylized non-identifiable footballer striking or celebrating with a soccer ball, generic team kit, motion energy — no real named player, no real club logos. " +
      "STYLE: cinematic sports-poster — dramatic rim light, haze, sparks, high contrast, intense energy. " +
      "TYPOGRAPHY & LAYOUT: bold sports headline, an odds/matchup accent and a CTA button, all inside the central safe zone. " +
      "COLOR: pitch green + white with one bright accent. " +
      "AVOID: photorealistic real named athletes or real club crests, unreadable text, cluttered corners, more than 3 dominant colors.",
  },
  {
    id: "preset27",
    fields: [FIELD_SHOW_ODDS, FIELD_MATCH_MOMENT, FIELD_TIME_OF_DAY],
    name: "Баскетбол",
    description: "Беттинг-баннер под баскетбол: арена, паркет, данк",
    gradient: "linear-gradient(135deg,#0b0b0f,#ea580c,#f59e0b)",
    examples: [
      "linear-gradient(135deg,#0b0b0f,#ea580c)",
      "linear-gradient(160deg,#111827,#f59e0b)",
      "linear-gradient(120deg,#7c2d12,#fb923c)",
      "linear-gradient(140deg,#0b0b0f,#f97316)",
    ],
    isNew: true,
    template:
      "Create a premium basketball sports-betting advertisement banner for {SUBJECT}. " +
      "ENVIRONMENT: an indoor arena with reflective hardwood court, dramatic spotlight beams, blurred crowd silhouette. " +
      "HERO: a dynamic stylized non-identifiable basketball player dunking or shooting, generic jersey, motion trail, no real named player or team logos. " +
      "STYLE: cinematic sports-poster — hard rim light, haze, sparks, high contrast, explosive energy. " +
      "TYPOGRAPHY & LAYOUT: bold headline, odds accent and CTA button in the central safe zone. " +
      "COLOR: deep base + basketball orange accent. " +
      "AVOID: photorealistic real named athletes or real logos, unreadable text, cluttered corners, more than 3 dominant colors.",
  },
  {
    id: "preset28",
    fields: [FIELD_SHOW_ODDS, FIELD_MATCH_MOMENT, FIELD_TIME_OF_DAY],
    name: "Американский футбол",
    description: "Беттинг-баннер под NFL: стадион, экшн, спред",
    gradient: "linear-gradient(135deg,#0b1220,#1e3a8a,#94a3b8)",
    examples: [
      "linear-gradient(135deg,#0b1220,#1e3a8a)",
      "linear-gradient(160deg,#020617,#94a3b8)",
      "linear-gradient(120deg,#1e3a8a,#e2e8f0)",
      "linear-gradient(140deg,#0b1220,#3b82f6)",
    ],
    isNew: true,
    template:
      "Create a premium American football (NFL-style) sports-betting advertisement banner for {SUBJECT}. " +
      "ENVIRONMENT: an NFL-style stadium with end-zone lights and atmospheric haze. " +
      "HERO: a dynamic stylized non-identifiable American-football player in helmet and pads charging with the ball, generic uniform, no real named player or team logos. " +
      "STYLE: cinematic sports-poster — dramatic lighting, dust, sparks, gritty texture, high contrast. " +
      "TYPOGRAPHY & LAYOUT: bold headline, a spread/odds accent and CTA button in the central safe zone. " +
      "COLOR: navy/steel base + one bright accent. " +
      "AVOID: photorealistic real named athletes or real logos, unreadable text, cluttered corners, more than 3 dominant colors.",
  },
  {
    id: "preset29",
    fields: [FIELD_SHOW_ODDS, FIELD_MATCH_MOMENT, FIELD_TIME_OF_DAY],
    name: "Теннис",
    description: "Беттинг-баннер под теннис: корт, подача, матч",
    gradient: "linear-gradient(135deg,#0b1220,#1d4ed8,#a3e635)",
    examples: [
      "linear-gradient(135deg,#0b1220,#1d4ed8)",
      "linear-gradient(160deg,#020617,#a3e635)",
      "linear-gradient(120deg,#1e3a8a,#22d3ee)",
      "linear-gradient(140deg,#0b1220,#84cc16)",
    ],
    isNew: true,
    template:
      "Create a premium tennis sports-betting advertisement banner for {SUBJECT}. " +
      "ENVIRONMENT: a tennis court (hard/clay/grass) with stadium stands and atmospheric depth. " +
      "HERO: a dynamic stylized non-identifiable tennis player mid-serve or forehand with a racket and ball, generic sportswear, motion, no real named player. " +
      "STYLE: cinematic sports-poster — crisp rim light, haze, high contrast, athletic energy. " +
      "TYPOGRAPHY & LAYOUT: bold headline, odds accent and CTA button in the central safe zone. " +
      "COLOR: court blue + lime accent. " +
      "AVOID: photorealistic real named athletes or real logos, unreadable text, cluttered corners, more than 3 dominant colors.",
  },
  {
    id: "preset30",
    fields: [FIELD_SHOW_ODDS, FIELD_MATCH_MOMENT],
    name: "Крикет",
    description: "Беттинг-баннер под крикет: поле, бэтсмен, T20",
    gradient: "linear-gradient(135deg,#052e16,#0d9488,#f59e0b)",
    examples: [
      "linear-gradient(135deg,#052e16,#0d9488)",
      "linear-gradient(160deg,#022c22,#f59e0b)",
      "linear-gradient(120deg,#134e4a,#fbbf24)",
      "linear-gradient(140deg,#052e16,#14b8a6)",
    ],
    isNew: true,
    template:
      "Create a premium cricket sports-betting advertisement banner for {SUBJECT}. " +
      "ENVIRONMENT: a cricket field with stadium floodlights and atmospheric depth. " +
      "HERO: a dynamic stylized non-identifiable batsman mid-shot with bat and ball, generic kit and pads, motion, no real named player or team logos. " +
      "STYLE: cinematic sports-poster — dramatic floodlight rim, haze, sparks, high contrast. " +
      "TYPOGRAPHY & LAYOUT: bold headline, odds accent and CTA button in the central safe zone. " +
      "COLOR: field green/teal + gold accent. " +
      "AVOID: photorealistic real named athletes or real logos, unreadable text, cluttered corners, more than 3 dominant colors.",
  },
  {
    id: "preset31",
    fields: [FIELD_SHOW_ODDS, FIELD_MATCH_MOMENT, FIELD_TIME_OF_DAY],
    name: "Бейсбол",
    description: "Беттинг-баннер под бейсбол: даймонд, свинг, MLB",
    gradient: "linear-gradient(135deg,#0b1220,#b91c1c,#e2e8f0)",
    examples: [
      "linear-gradient(135deg,#0b1220,#b91c1c)",
      "linear-gradient(160deg,#020617,#e2e8f0)",
      "linear-gradient(120deg,#7f1d1d,#f1f5f9)",
      "linear-gradient(140deg,#0b1220,#ef4444)",
    ],
    isNew: true,
    template:
      "Create a premium baseball (MLB-style) sports-betting advertisement banner for {SUBJECT}. " +
      "ENVIRONMENT: a baseball diamond with stadium lights at dusk. " +
      "HERO: a dynamic stylized non-identifiable batter mid-swing with bat and ball, generic uniform and cap, motion, no real named player or team logos. " +
      "STYLE: cinematic sports-poster — dramatic dusk lighting, dust, sparks, high contrast. " +
      "TYPOGRAPHY & LAYOUT: bold headline, odds accent and CTA button in the central safe zone. " +
      "COLOR: navy/red + off-white accent. " +
      "AVOID: photorealistic real named athletes or real logos, unreadable text, cluttered corners, more than 3 dominant colors.",
  },
  {
    id: "preset32",
    fields: [FIELD_SHOW_ODDS, FIELD_MATCH_MOMENT, FIELD_TIME_OF_DAY],
    name: "Хоккей",
    description: "Беттинг-баннер под хоккей: лёд, буллит, NHL",
    gradient: "linear-gradient(135deg,#0b1220,#0284c7,#e0f2fe)",
    examples: [
      "linear-gradient(135deg,#0b1220,#0284c7)",
      "linear-gradient(160deg,#020617,#e0f2fe)",
      "linear-gradient(120deg,#075985,#bae6fd)",
      "linear-gradient(140deg,#0b1220,#38bdf8)",
    ],
    isNew: true,
    template:
      "Create a premium ice hockey (NHL-style) sports-betting advertisement banner for {SUBJECT}. " +
      "ENVIRONMENT: an ice rink with frost particles, arena boards, cold blue ice glow and atmospheric mist. " +
      "HERO: a dynamic stylized non-identifiable hockey player skating and shooting with stick and puck, generic jersey, ice spray, no real named player or team logos. " +
      "STYLE: cinematic sports-poster — cold rim light, frost, sparks, high contrast. " +
      "TYPOGRAPHY & LAYOUT: bold headline, odds accent and CTA button in the central safe zone. " +
      "COLOR: ice blue + white with one accent. " +
      "AVOID: photorealistic real named athletes or real logos, unreadable text, cluttered corners, more than 3 dominant colors.",
  },
  {
    id: "preset33",
    fields: [FIELD_SHOW_ODDS, FIELD_MATCH_MOMENT, FIELD_TIME_OF_DAY],
    name: "Скачки",
    description: "Беттинг-баннер под скачки: ипподром, финиш, фаворит",
    gradient: "linear-gradient(135deg,#052e16,#15803d,#facc15)",
    examples: [
      "linear-gradient(135deg,#052e16,#15803d)",
      "linear-gradient(160deg,#0b0b0f,#facc15)",
      "linear-gradient(120deg,#14532d,#fbbf24)",
      "linear-gradient(140deg,#052e16,#22c55e)",
    ],
    isNew: true,
    template:
      "Create a premium horse-racing sports-betting advertisement banner for {SUBJECT}. " +
      "ENVIRONMENT: a racetrack with turf, rails and grandstand, dramatic finish-line atmosphere, dust and motion. " +
      "HERO: dynamic stylized racehorses with jockeys charging toward the finish line, heavy motion blur, no real named horses or silks. " +
      "STYLE: cinematic sports-poster — warm dust glow, speed streaks, high contrast, adrenaline. " +
      "TYPOGRAPHY & LAYOUT: bold headline, odds accent and CTA button in the central safe zone. " +
      "COLOR: turf green + gold accent. " +
      "AVOID: photorealistic real named athletes or logos, unreadable text, cluttered corners, more than 3 dominant colors.",
  },
  {
    id: "preset35",
    name: "Киберспорт",
    description: "Беттинг-баннер под esports: арена, LED, про-игрок",
    gradient: "linear-gradient(135deg,#0f0524,#a855f7,#22d3ee)",
    examples: [
      "linear-gradient(135deg,#0f0524,#a855f7)",
      "linear-gradient(160deg,#020617,#22d3ee)",
      "linear-gradient(120deg,#3b0764,#06b6d4)",
      "linear-gradient(140deg,#0f0524,#7c3aed)",
    ],
    isNew: true,
    template:
      "Create a premium esports betting advertisement banner for {SUBJECT}. " +
      "ENVIRONMENT: a dark esports arena with massive LED screens, neon RGB stage lighting, stage smoke and holographic UI. " +
      "HERO: a dynamic stylized non-identifiable pro gamer at a gaming setup with a headset, focused, neon rim light, no real named player or team logos. " +
      "STYLE: cinematic esports-finals — RGB neon lighting, haze, glowing accents, high contrast. " +
      "TYPOGRAPHY & LAYOUT: bold gamer-style headline, odds accent and CTA button in the central safe zone. " +
      "COLOR: dark base + two neon accents (violet + cyan). " +
      "AVOID: photorealistic real named players or real team logos, unreadable text, cluttered corners, more than 3 dominant colors.",
    fields: [
      {
        id: "game",
        type: "select",
        label: "Игра",
        default: "cs2",
        options: [
          { value: "cs2", label: "CS2", prompt: "Esports title: Counter-Strike 2 — tactical FPS aesthetic." },
          { value: "dota", label: "Dota 2", prompt: "Esports title: Dota 2 — fantasy MOBA aesthetic." },
          { value: "lol", label: "LoL", prompt: "Esports title: League of Legends — fantasy MOBA aesthetic." },
          { value: "valorant", label: "Valorant", prompt: "Esports title: Valorant — tactical FPS aesthetic." },
        ],
      },
      {
        id: "stage",
        type: "select",
        label: "Стадия турнира",
        default: "final",
        options: [
          { value: "group", label: "Групповой этап", prompt: "Tournament stage: group stage." },
          { value: "quarter", label: "Четвертьфинал", prompt: "Tournament stage: quarterfinal." },
          { value: "semi", label: "Полуфинал", prompt: "Tournament stage: semifinal." },
          { value: "final", label: "Гранд-финал", prompt: "Tournament stage: grand final." },
        ],
      },
      FIELD_SHOW_ODDS,
      FIELD_BONUS_BADGE,    ],
  },
];

// Generated 3:2 preview banners live in public/previews/<id>.png
// (see scripts/gen-previews.mjs). Attach each as its tile preview; presets
// without a generated file keep their gradient fallback.
for (const p of PRESETS) {
  if (!p.preview) p.preview = `/previews/${p.id}.webp`;
}

// Templates grouped into categories. Each category is an accordion: collapsed
// shows just "Label (N)" + chevron; expanding reveals a grid of all its
// templates so the user consciously picks one (no implicit default preview).
type Category = {
  id: string;
  label: string;
  presetIds: string[];
};

// Mutually exclusive — every preset lives in exactly one category (no cross-listing).
export const CATEGORIES: Category[] = [
  {
    id: "gambling",
    label: "Gambling",
    presetIds: [
      "preset1",
      "preset2",
      "preset6",
      "preset7",
      "preset8",
      "preset9",
      "preset10",
      "preset11",
      "preset12",
      "preset15",
    ],
  },
  {
    id: "betting",
    label: "Betting",
    presetIds: [
      "preset3",
      "preset14",
      "preset16",
      "preset17",
      "preset18",
      "preset19",
      "preset20",
      "preset23",
      "preset24",
      "preset25",
    ],
  },
  {
    id: "sport",
    label: "Sport",
    presetIds: [
      "preset4",
      "preset5",
      "preset13",
      "preset26",
      "preset27",
      "preset28",
      "preset29",
      "preset30",
      "preset31",
      "preset32",
      "preset33",
      "preset35",
    ],
  },
];

const PRESET_BY_ID = new Map(PRESETS.map((p) => [p.id, p]));

type Props = {
  value: string;
  onChange: (id: string) => void;
};

// Grid tile: thumbnail on top, name below — reads clearly as one of several
// options in the expanded category grid (vs a single full-width "default").
function PresetTile({
  preset,
  selected,
  onSelect,
}: {
  preset: Preset;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group relative flex flex-col gap-1.5 overflow-hidden rounded-lg border p-1.5 text-left transition ${
        selected
          ? "border-accent-green shadow-[0_0_30px_rgba(198,255,61,0.16)]"
          : "border-border hover:bg-[var(--bg-surface-hover)]"
      }`}
    >
      <div
        className="aspect-[4/3] w-full rounded-md bg-cover bg-center"
        style={
          preset.preview
            ? { backgroundImage: `url(${preset.preview})` }
            : { background: preset.gradient }
        }
      />
      <p className="truncate text-xs font-medium">{preset.name}</p>
      {preset.isNew && !selected && (
        <span className="absolute left-1.5 top-1.5 rounded-full bg-accent-green px-1.5 py-0.5 text-[9px] font-semibold uppercase leading-none tracking-wide text-on-accent">
          Новое
        </span>
      )}
      {selected && (
        <span className="absolute right-1.5 top-1.5 rounded-full bg-accent-green p-0.5 text-on-accent">
          <Check size={10} />
        </span>
      )}
    </button>
  );
}

const CATEGORY_OPTIONS = [
  { id: "all", label: "Все категории" },
  ...CATEGORIES.map((c) => ({ id: c.id, label: c.label })),
];

export function PresetSidebar({ value, onChange }: Props) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // Filter dropdown (opened from the funnel icon in the search input).
  // `categoryFilter` is the applied value; `draftCategory` is what the
  // panel is editing until "Применить" commits it.
  const [filterOpen, setFilterOpen] = useState(false);
  const [catMenuOpen, setCatMenuOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [draftCategory, setDraftCategory] = useState("all");
  // Sort order for the tiles inside each category. "popular" keeps the authored
  // order; "new" floats presets flagged isNew to the top. Mirrors Sibrik's
  // "Популярне / Найновіші" gallery sort.
  const [sortBy, setSortBy] = useState<"popular" | "new">("popular");

  const q = query.trim().toLowerCase();
  const searching = q.length > 0;
  const filterActive = categoryFilter !== "all";
  const draftLabel =
    CATEGORY_OPTIONS.find((o) => o.id === draftCategory)?.label ?? "Все категории";
  const appliedLabel = CATEGORY_OPTIONS.find((o) => o.id === categoryFilter)?.label ?? "";

  const clearFilter = () => {
    setCategoryFilter("all");
    setDraftCategory("all");
    closeFilter();
  };

  const openFilter = () => {
    setDraftCategory(categoryFilter);
    setFilterOpen((o) => !o);
    setCatMenuOpen(false);
  };
  const closeFilter = () => {
    setFilterOpen(false);
    setCatMenuOpen(false);
  };

  // Close the filter dropdown when clicking anywhere outside it.
  const filterRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!filterOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        closeFilter();
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [filterOpen]);

  // For each category, resolve its presets (in defined order) and filter by the
  // current search query + the applied category filter. Categories with no
  // matches (or excluded by the filter) are hidden entirely.
  const groups = useMemo(() => {
    return CATEGORIES.filter((cat) => categoryFilter === "all" || cat.id === categoryFilter)
      .map((cat) => {
        const presets = cat.presetIds
          .map((id) => PRESET_BY_ID.get(id))
          .filter((p): p is Preset => Boolean(p))
          .filter(
            (p) =>
              !q ||
              p.name.toLowerCase().includes(q) ||
              p.description.toLowerCase().includes(q),
          );
        const sorted =
          sortBy === "new"
            ? [...presets].sort((a, b) => Number(Boolean(b.isNew)) - Number(Boolean(a.isNew)))
            : presets;
        return { ...cat, presets: sorted };
      })
      .filter((cat) => cat.presets.length > 0);
  }, [q, categoryFilter, sortBy]);

  return (
    <aside className="flex w-full min-w-0 flex-col overflow-hidden border-border bg-panel max-lg:h-[calc(100dvh-4rem)] lg:h-full lg:w-auto lg:min-w-[220px] lg:flex-[2] lg:rounded-2xl lg:border">
      <div className="border-b border-border px-4 py-2.5">
        <h2 className="ds-h4">Шаблоны</h2>
      </div>
      <div ref={filterRef} className="relative px-4 pb-2 pt-2">
        <div className="flex h-12 w-full items-center gap-2 rounded-lg border border-border bg-background px-3 transition focus-within:border-accent-green focus-within:ring-1 focus-within:ring-accent-green">
          <Search size={16} className="shrink-0 text-foreground/70" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по шаблонам"
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground/70 placeholder:text-foreground/70 focus:outline-none"
          />
          <button
            type="button"
            onClick={openFilter}
            aria-label="Фильтр"
            aria-expanded={filterOpen}
            className={`relative -mr-1 flex shrink-0 items-center justify-center rounded-md p-1 transition after:absolute after:-inset-2.5 after:content-[''] ${
              filterActive || filterOpen
                ? "text-accent-green"
                : "text-foreground/70 hover:text-foreground"
            }`}
          >
            <Filter size={16} />
            {filterActive && (
              <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-accent-green" />
            )}
          </button>
        </div>

        {filterActive && (
          <div className="mt-2 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={clearFilter}
              className="flex items-center gap-1 rounded-md bg-white/5 px-2 py-1 text-xs text-foreground transition hover:bg-white/10"
            >
              {appliedLabel}
              <X size={12} className="text-muted-foreground" />
            </button>
            <button
              type="button"
              onClick={clearFilter}
              className="text-xs text-muted-foreground transition hover:text-foreground"
            >
              Очистить
            </button>
          </div>
        )}

        {/* Mobile overlay behind the category dropdown (same shared pattern as
            the header menus). Desktop keeps the plain popover. */}
        <MobileScrim open={filterOpen} onClose={closeFilter} />
        {filterOpen && (
          <div className="absolute left-4 right-4 top-full z-50 mt-1 rounded-lg border border-border bg-popover p-3 text-foreground shadow-xl">
              <p className="mb-2 ds-h4">Категория</p>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setCatMenuOpen((o) => !o)}
                  className="flex w-full items-center justify-between rounded-lg border border-border bg-white/5 px-3 py-2 text-sm transition hover:bg-white/10"
                >
                  <span>{draftLabel}</span>
                  <ChevronDown
                    size={16}
                    className={`text-muted-foreground transition ${catMenuOpen ? "rotate-180" : ""}`}
                  />
                </button>
                {catMenuOpen && (
                  <div className="mt-1 overflow-hidden rounded-lg border border-border bg-card">
                    {CATEGORY_OPTIONS.map((opt) => {
                      const active = draftCategory === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            // Apply immediately on click (no separate "Применить"
                            // step) — matches Canva/Abyssale-style instant filters.
                            setDraftCategory(opt.id);
                            setCategoryFilter(opt.id);
                            closeFilter();
                          }}
                          className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition ${
                            active
                              ? "bg-accent-green/15 text-accent-green"
                              : "text-foreground hover:bg-white/10"
                          }`}
                        >
                          {opt.label}
                          {active && <Check size={14} />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5 px-4 pb-1 pt-0.5">
        <span className="ds-caption shrink-0">Сортировка</span>
        <div className="ml-auto flex rounded-lg border border-border p-0.5">
          {(
            [
              ["popular", "Популярные"],
              ["new", "Новые"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSortBy(id)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                sortBy === id
                  ? "bg-white/10 text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-2">
        {groups.length === 0 && (
          <div className="flex flex-col items-center gap-3 px-2 py-12 text-center">
            <Search className="h-7 w-7 text-muted-foreground/40" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">Ничего не найдено</p>
              <p className="ds-caption">
                {q
                  ? `По запросу «${query.trim()}» шаблонов нет`
                  : "В этой категории пока нет шаблонов"}
              </p>
            </div>
            {(searching || filterActive) && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  clearFilter();
                }}
                className="rounded-lg border border-border px-3 py-1.5 text-xs text-foreground transition hover:bg-white/5"
              >
                Сбросить
              </button>
            )}
          </div>
        )}
        <div className="flex flex-col gap-3">
          {groups.map((cat) => {
            // The category HEADER is the accordion toggle: collapsed shows only
            // "Label (N)" + chevron — no preview card, so nothing reads as a
            // pre-selected default. Expanded reveals the full grid of templates,
            // so the user consciously sees there are several options and picks
            // one. Search force-opens matching categories.
            const isExpanded = searching || expanded[cat.id];
            return (
              <div
                key={cat.id}
                className="overflow-hidden rounded-xl border border-border bg-[var(--bg-surface)]"
              >
                <button
                  type="button"
                  onClick={() =>
                    setExpanded((prev) => ({ ...prev, [cat.id]: !prev[cat.id] }))
                  }
                  aria-expanded={Boolean(isExpanded)}
                  className="flex min-h-11 w-full items-center gap-2 px-3 py-2.5 text-left transition hover:bg-white/5"
                >
                  <span className="flex-1 truncate text-sm font-semibold">
                    {cat.label}
                    <span className="ml-1.5 font-normal text-muted-foreground">
                      ({cat.presets.length})
                    </span>
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-muted-foreground transition ${
                      isExpanded ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {isExpanded ? (
                  <div className="border-t border-border p-2.5">
                    <div className="grid max-h-[52vh] grid-cols-2 gap-2 overflow-y-auto">
                      {cat.presets.map((p) => (
                        <PresetTile
                          key={p.id}
                          preset={p}
                          selected={value === p.id}
                          onSelect={() => onChange(p.id)}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
