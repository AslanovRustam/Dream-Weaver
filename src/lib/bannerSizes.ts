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
    title: "Посты для соцсетей",
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
    title: "Сторис и короткие видео",
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
    title: "YouTube и презентации",
    subtitle: "Горизонтальные обложки 16:9",
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
    title: "Мини-форматы",
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

  // ----------------------------------------------------------------
  // Display / performance ads — IAB rectangles (square-ish tiles)
  // ----------------------------------------------------------------
  {
    id: "display-rect",
    title: "Display — прямоугольники",
    subtitle: "IAB медийка: квадраты и прямоугольные тайлы",
    sizes: [
      { w: 300, h: 250, ratio: "6:5", label: "Medium Rectangle" },
      { w: 336, h: 280, ratio: "6:5", label: "Large Rectangle" },
      { w: 180, h: 150, ratio: "6:5", label: "Rectangle" },
      { w: 580, h: 400, ratio: "29:20" },
      { w: 400, h: 400, ratio: "1:1" },
      { w: 125, h: 125, ratio: "1:1", label: "Button" },
      { w: 468, h: 400, ratio: "117:100" },
      { w: 600, h: 500, ratio: "6:5" },
      { w: 120, h: 90, ratio: "4:3" },
      { w: 160, h: 90, ratio: "16:9" },
      { w: 480, h: 320, ratio: "3:2" },
    ],
  },

  // ----------------------------------------------------------------
  // Display / performance ads — horizontal (leaderboards, banners)
  // ----------------------------------------------------------------
  {
    id: "display-horizontal",
    title: "Display — горизонтальные",
    subtitle: "Лидерборды и вытянутые баннеры",
    sizes: [
      { w: 728, h: 90, ratio: "364:45", label: "Leaderboard" },
      { w: 970, h: 90, ratio: "97:9", label: "Large Leaderboard" },
      { w: 970, h: 250, ratio: "97:25", label: "Billboard" },
      { w: 468, h: 60, ratio: "39:5", label: "Full Banner" },
      { w: 234, h: 60, ratio: "39:10", label: "Half Banner" },
      { w: 930, h: 180, ratio: "31:6" },
      { w: 980, h: 120, ratio: "49:6" },
      { w: 750, h: 100, ratio: "15:2" },
      { w: 750, h: 200, ratio: "15:4" },
      { w: 750, h: 300, ratio: "5:2" },
      { w: 1000, h: 90, ratio: "100:9" },
      { w: 1000, h: 120, ratio: "25:3" },
      { w: 960, h: 90, ratio: "32:3" },
      { w: 950, h: 90, ratio: "95:9" },
      { w: 800, h: 90, ratio: "80:9" },
      { w: 640, h: 100, ratio: "32:5" },
      { w: 400, h: 100, ratio: "4:1" },
      { w: 320, h: 100, ratio: "16:5", label: "Large Mobile Banner" },
      { w: 320, h: 50, ratio: "32:5", label: "Mobile Leaderboard" },
      { w: 300, h: 50, ratio: "6:1", label: "Mobile Banner" },
      { w: 120, h: 60, ratio: "2:1" },
    ],
  },

  // ----------------------------------------------------------------
  // Display / performance ads — vertical (skyscrapers, portraits)
  // ----------------------------------------------------------------
  {
    id: "display-vertical",
    title: "Display — вертикальные",
    subtitle: "Небоскрёбы и портретные тайлы",
    sizes: [
      { w: 160, h: 600, ratio: "4:15", label: "Wide Skyscraper" },
      { w: 120, h: 600, ratio: "1:5", label: "Skyscraper" },
      { w: 300, h: 600, ratio: "1:2", label: "Half-Page" },
      { w: 300, h: 1050, ratio: "2:7", label: "Portrait" },
      { w: 120, h: 240, ratio: "1:2", label: "Vertical Banner" },
      { w: 240, h: 600, ratio: "2:5" },
      { w: 200, h: 600, ratio: "1:3" },
      { w: 250, h: 600, ratio: "5:12" },
      { w: 120, h: 400, ratio: "3:10" },
      { w: 240, h: 400, ratio: "3:5" },
      { w: 300, h: 400, ratio: "3:4" },
      { w: 320, h: 480, ratio: "2:3" },
      { w: 250, h: 360, ratio: "25:36" },
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
  "display-rect": {
    layout:
      "DISPLAY RECTANGLE LAYOUT (square-ish IAB tile): compact centred composition. Logo top-center or top-left inside 12% safe zone. Headline near the top, key visual centred, CTA button bottom-center inside bottom 20%. Everything within the central 84% — generous margins so the tile reads at small sizes.",
    boost: { x: 0.08, y: 0.08, width: 0.84, height: 0.84, weight: 1.0 },
  },
  "display-horizontal": {
    layout:
      "HORIZONTAL LEADERBOARD LAYOUT (very wide banner, will be cropped to thin strips): keep EVERYTHING inside the CENTRAL HORIZONTAL BAND — the middle 60% of the height (from 20% to 80% vertically). Logo far left, headline center, CTA button far right, all vertically centered on one line. NOTHING important in the top 20% or bottom 20% — those bands get cropped away. Big, bold, legible.",
    boost: { x: 0.02, y: 0.2, width: 0.96, height: 0.6, weight: 1.0 },
  },
  "display-vertical": {
    layout:
      "VERTICAL SKYSCRAPER LAYOUT (very tall banner, will be cropped to narrow strips): keep EVERYTHING inside the CENTRAL VERTICAL COLUMN — the middle 60% of the width (from 20% to 80% horizontally). Stack logo (top), key visual (center), CTA button (bottom) along that central column. NOTHING important in the left 20% or right 20% — those get cropped away. Tall, stacked, legible.",
    boost: { x: 0.2, y: 0.02, width: 0.6, height: 0.96, weight: 1.0 },
  },
};

/** Get a use-case template for a SizeGroup id; returns null if unknown. */
export function getGroupTemplate(groupId: string | undefined): GroupTemplate | null {
  if (!groupId) return null;
  return GROUP_TEMPLATES[groupId] ?? null;
}
