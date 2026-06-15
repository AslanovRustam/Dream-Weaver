import { Check } from "lucide-react";
import presetWideAngle from "@/assets/preset-wide-angle.jpg";
import presetSlotBanner from "@/assets/preset-slot-banner.jpg";
import presetEvent from "@/assets/preset-event.jpg";
import presetSport from "@/assets/preset-sport.jpg";

export type Preset = {
  id: string;
  name: string;
  description: string;
  gradient: string;
  preview?: string;
  examples: string[];
  template?: string;
};

export const PRESETS: Preset[] = [
  {
    id: "preset1",
    name: "Широкий угол",
    description: "Яркая инфографика для товара с крупными цифрами и характеристиками",
    gradient: "linear-gradient(135deg,#a3e635,#22d3ee,#f0abfc)",
    preview: presetWideAngle,
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
    name: "Баннер по слоту",
    description: "Премиум gaming-баннер для конкретного слота",
    gradient: "linear-gradient(135deg,#0f172a,#7c3aed,#22d3ee)",
    preview: presetSlotBanner,
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
    name: "Событие",
    description: "Гемблинг/беттинг баннер под событие или повод",
    gradient: "linear-gradient(135deg,#1e1b4b,#dc2626,#f59e0b)",
    preview: presetEvent,
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
    name: "Спорт / Ставки",
    description: "Беттинг-баннер под спортивное событие (face-off, fight poster, esports)",
    gradient: "linear-gradient(135deg,#0b1220,#1d4ed8,#dc2626)",
    preview: presetSport,
    examples: [
      "linear-gradient(135deg,#0b1220,#1d4ed8)",
      "linear-gradient(160deg,#0a0a0a,#dc2626)",
      "linear-gradient(120deg,#020617,#22d3ee)",
      "linear-gradient(140deg,#1e1b4b,#ef4444)",
    ],
    template: "SPORT_PRESET",
  },
];

type Props = {
  value: string;
  onChange: (id: string) => void;
};

export function PresetSidebar({ value, onChange }: Props) {
  return (
    <aside className="flex h-[calc(100vh-2rem)] w-[220px] shrink-0 flex-col overflow-hidden rounded-2xl border border-border bg-panel">
      <div className="border-b border-border px-3 py-2.5">
        <h2 className="text-sm font-semibold">Шаблоны</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        <div className="flex flex-col gap-1.5">
          {PRESETS.map((p) => {
            const selected = value === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onChange(p.id)}
                className={`group relative flex items-center gap-2.5 overflow-hidden rounded-lg border p-1.5 text-left transition ${
                  selected
                    ? "border-accent-green ring-1 ring-accent-green"
                    : "border-border hover:border-white/30"
                }`}
              >
                <div
                  className="h-12 w-12 shrink-0 rounded-md bg-cover bg-center"
                  style={
                    p.preview
                      ? { backgroundImage: `url(${p.preview})` }
                      : { background: p.gradient }
                  }
                />
                <p className="min-w-0 flex-1 truncate text-xs font-medium">{p.name}</p>
                {selected && (
                  <div className="shrink-0 rounded-full bg-accent-green p-0.5 text-black">
                    <Check size={10} />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
