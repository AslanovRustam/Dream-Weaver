// Catalog of standard banner sizes — grouped by USE CASE, not by raw
// aspect ratio. The end user thinks in terms of "this is for an
// Instagram post" or "this is a YouTube cover", not "this is 16:9".
//
// `ratio` stays attached to each size — that's what the model needs to
// know to compose the picture, and what the bucketing batch runner uses
// to merge same-aspect sizes into a single i2i call.

export type BannerSize = {
  w: number;
  h: number;
  ratio: string; // "16:9" / "1:1" / "9:16" / ...
  /** Optional human-readable hint shown after the dimensions. */
  label?: string;
  /** Id of the use-case group this size belongs to. Backfilled by buildGroupIndex().
   *  Used by the resize batch to pick a per-use-case layout template
   *  (Stories / YouTube / Pinterest / ...) and crop boost regions. */
  group_id?: string;
};

export type SizeGroup = {
  id: string;
  /** Group title shown in the picker. */
  title: string;
  /** Tiny subtitle / hint. */
  subtitle?: string;
  sizes: BannerSize[];
};

export const BANNER_SIZE_GROUPS: SizeGroup[] = [
  // ----------------------------------------------------------------
  // Social media posts — square + portrait (Instagram/Facebook feed)
  // ----------------------------------------------------------------
  {
    id: "social-posts",
    title: "Соцсети — посты",
    subtitle: "Instagram, Facebook, квадратные / портретные",
    sizes: [
      { w: 1080, h: 1080, ratio: "1:1", label: "Instagram post" },
      { w: 1200, h: 1200, ratio: "1:1", label: "Facebook post" },
      { w: 600, h: 600, ratio: "1:1", label: "Square small" },
      { w: 1080, h: 1350, ratio: "4:5", label: "Instagram / Facebook portrait" },
      { w: 864, h: 1080, ratio: "4:5", label: "Instagram portrait small" },
      { w: 1200, h: 1500, ratio: "4:5" },
    ],
  },

  // ----------------------------------------------------------------
  // Stories / Reels / TikTok / Shorts — vertical 9:16
  // ----------------------------------------------------------------
  {
    id: "stories",
    title: "Stories / Reels / TikTok",
    subtitle: "Вертикальные, для мобильных лент",
    sizes: [
      { w: 1080, h: 1920, ratio: "9:16", label: "Stories / Reels / TikTok / Shorts" },
      { w: 720, h: 1280, ratio: "9:16" },
      { w: 1440, h: 2560, ratio: "9:16", label: "High-res vertical" },
      { w: 360, h: 640, ratio: "9:16", label: "Small vertical" },
    ],
  },

  // ----------------------------------------------------------------
  // YouTube / presentations — 16:9 landscape
  // ----------------------------------------------------------------
  {
    id: "youtube",
    title: "YouTube / Презентации",
    subtitle: "Широкоформатные 16:9",
    sizes: [
      { w: 1920, h: 1080, ratio: "16:9", label: "Full HD" },
      { w: 1280, h: 720, ratio: "16:9", label: "HD" },
      { w: 2560, h: 1440, ratio: "16:9", label: "2K" },
      { w: 1600, h: 900, ratio: "16:9" },
      { w: 640, h: 360, ratio: "16:9", label: "Small wide" },
    ],
  },

  // ----------------------------------------------------------------
  // Web banners — horizontal (display ads, hero blocks)
  // ----------------------------------------------------------------
  {
    id: "web-horizontal",
    title: "Веб-баннеры — горизонтальные",
    subtitle: "Heroes, display-реклама, превью",
    sizes: [
      // 3:2 family
      { w: 1500, h: 1000, ratio: "3:2" },
      { w: 1200, h: 800, ratio: "3:2" },
      { w: 900, h: 600, ratio: "3:2" },
      { w: 600, h: 400, ratio: "3:2" },
      { w: 300, h: 200, ratio: "3:2", label: "Small banner" },
      // 4:3 family
      { w: 1280, h: 960, ratio: "4:3" },
      { w: 1024, h: 768, ratio: "4:3" },
      { w: 800, h: 600, ratio: "4:3" },
      { w: 640, h: 480, ratio: "4:3" },
      // 5:4 family
      { w: 1500, h: 1200, ratio: "5:4" },
      { w: 1350, h: 1080, ratio: "5:4" },
      { w: 1080, h: 864, ratio: "5:4" },
    ],
  },

  // ----------------------------------------------------------------
  // Web banners — vertical (sidebars, mobile sticky)
  // ----------------------------------------------------------------
  {
    id: "web-vertical",
    title: "Веб-баннеры — вертикальные",
    subtitle: "Сайдбары, мобильные блоки",
    sizes: [
      // 2:3 family
      { w: 1000, h: 1500, ratio: "2:3" },
      { w: 800, h: 1200, ratio: "2:3" },
      { w: 600, h: 900, ratio: "2:3" },
      { w: 400, h: 600, ratio: "2:3" },
      { w: 200, h: 300, ratio: "2:3", label: "Small vertical" },
      // 3:4 family (large + small — большие размеры это бывший Pinterest-блок)
      { w: 1080, h: 1440, ratio: "3:4" },
      { w: 960, h: 1280, ratio: "3:4" },
      { w: 768, h: 1024, ratio: "3:4" },
      { w: 600, h: 800, ratio: "3:4" },
      { w: 480, h: 640, ratio: "3:4" },
      { w: 240, h: 320, ratio: "3:4" },
    ],
  },

  // ----------------------------------------------------------------
  // Tiny / thumbnail / button-size assets
  // ----------------------------------------------------------------
  {
    id: "tiny",
    title: "Маленькие плашки",
    subtitle: "Превью, кнопки, иконки",
    sizes: [
      { w: 300, h: 300, ratio: "1:1", label: "Medium square" },
      { w: 250, h: 250, ratio: "1:1" },
      { w: 200, h: 200, ratio: "1:1", label: "Small square" },
      { w: 320, h: 240, ratio: "4:3", label: "Thumbnail 4:3" },
      { w: 320, h: 400, ratio: "4:5" },
      { w: 480, h: 600, ratio: "4:5" },
      { w: 400, h: 320, ratio: "5:4" },
      { w: 600, h: 480, ratio: "5:4" },
    ],
  },
];

/** Unique key for a size — used as React key and as Map identifier. */
export function sizeKey(s: { w: number; h: number }): string {
  return `${s.w}x${s.h}`;
}

/** Total count of sizes across all groups (used for "select all" maths). */
export function totalSizesCount(): number {
  return BANNER_SIZE_GROUPS.reduce((sum, g) => sum + g.sizes.length, 0);
}

// Inject group_id into every size at module-load time so consumers (the
// resize batch, smart-crop) can resolve "this 1080×1920 → stories" without
// repeated lookups.
BANNER_SIZE_GROUPS.forEach((g) => {
  g.sizes.forEach((s) => {
    s.group_id = g.id;
  });
});

/**
 * Per-use-case layout template + crop-boost region.
 *
 * `layout` is the natural-language template that gets embedded into the
 * resize prompt, telling the model where logo / headline / visual / CTA
 * should live within this specific banner type's frame.
 *
 * `boost` is the rectangle (normalised 0–1 coords on the i2i result) that
 * smartcrop should TRY to preserve when cropping — the area that the
 * layout template told the model to keep important content in. Format
 * matches smartcrop's `boost` option.
 */
export type GroupTemplate = {
  layout: string;
  boost: { x: number; y: number; width: number; height: number; weight: number };
};

export const GROUP_TEMPLATES: Record<string, GroupTemplate> = {
  "social-posts": {
    layout:
      "SOCIAL POST LAYOUT (square / portrait feed): logo small at TOP-CENTER (within top 12% of canvas). Headline below logo (top 18–32%). Key visual centred in the middle 40–55% of height. Supporting text under the visual. CTA button bottom-center within bottom 18% but with ≥ 10% clearance from the bottom edge. ALL text and the CTA live inside the central 84% column (≥ 8% margin both sides).",
    boost: { x: 0.08, y: 0.05, width: 0.84, height: 0.9, weight: 1.0 },
  },
  stories: {
    layout:
      "STORIES / REELS / TIKTOK LAYOUT (vertical mobile 9:16): logo TOP-CENTER inside top 12% safe zone. Headline below logo (top 14–24%). Key visual is the dominant element occupying the central 50–60% of the height. Supporting text below visual (60–80% Y). CTA button bottom-center within bottom 14% but with ≥ 10% clearance from the bottom edge (Instagram UI overlays the very bottom). ALL text in the central 78% column.",
    boost: { x: 0.1, y: 0.06, width: 0.8, height: 0.88, weight: 1.0 },
  },
  youtube: {
    layout:
      "YOUTUBE / PRESENTATION LAYOUT (16:9 horizontal): horizontal split. Text-stack (logo + headline + supporting + CTA) lives in EITHER the LEFT 40% column OR the RIGHT 40% column. Key visual occupies the opposite 50–60% column. Top and bottom 12% are reserved as breathing room — NO text or important content there.",
    boost: { x: 0.04, y: 0.12, width: 0.92, height: 0.76, weight: 1.0 },
  },
  "web-horizontal": {
    layout:
      "WEB HORIZONTAL BANNER LAYOUT (3:2 / 4:3 / 5:4): typical display-ad split. Logo top-left corner inside 10% safe area. Headline and supporting copy in left 45% column. Key visual on the right 50%. CTA button bottom of the text column or under the headline. Generous side margins (≥ 8%).",
    boost: { x: 0.06, y: 0.1, width: 0.88, height: 0.8, weight: 1.0 },
  },
  "web-vertical": {
    layout:
      "WEB VERTICAL BANNER LAYOUT (2:3 / 3:4 sidebar): stacked vertical composition. Logo top inside 12% safe zone. Headline below. Key visual centred. CTA bottom inside bottom 18%. Compact width — text within central 80% column. Tight but generous top/bottom padding.",
    boost: { x: 0.1, y: 0.06, width: 0.8, height: 0.88, weight: 1.0 },
  },
  tiny: {
    layout:
      "TINY TILE LAYOUT (small thumbnail / button-size): minimalism. Only the brand logo + at most ONE short word or number. Huge margins (≥ 14% from every edge). NO long text — at this size text becomes unreadable. Visual must be instantly recognisable at small scale.",
    boost: { x: 0.14, y: 0.14, width: 0.72, height: 0.72, weight: 1.0 },
  },
};

/** Get a use-case template for a SizeGroup id; returns null if unknown. */
export function getGroupTemplate(groupId: string | undefined): GroupTemplate | null {
  if (!groupId) return null;
  return GROUP_TEMPLATES[groupId] ?? null;
}
