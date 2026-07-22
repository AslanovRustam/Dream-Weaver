import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Filter, Search, X } from "lucide-react";
import { MobileScrim } from "@/components/MobileScrim";
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
];

// Templates grouped into categories. Each category is an accordion: collapsed
// shows just "Label (N)" + chevron; expanding reveals a grid of all its
// templates so the user consciously picks one (no implicit default preview).
type Category = {
  id: string;
  label: string;
  presetIds: string[];
};

export const CATEGORIES: Category[] = [
  { id: "betting", label: "Betting", presetIds: ["preset3"] },
  { id: "gambling", label: "Gambling", presetIds: ["preset2", "preset1"] },
  { id: "sport", label: "Sport", presetIds: ["preset4"] },
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
          ? "border-accent-green shadow-[0_0_30px_rgba(234,255,160,0.16)]"
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
        return { ...cat, presets };
      })
      .filter((cat) => cat.presets.length > 0);
  }, [q, categoryFilter]);

  return (
    <aside className="flex w-full min-w-0 flex-col overflow-hidden border-border bg-panel max-lg:h-[calc(100dvh-4rem)] lg:h-full lg:w-auto lg:flex-[2] lg:rounded-2xl lg:border">
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
