// Hub catalog — the single source the Hub screen's search filters over, plus a
// curated "popular" set for the inspiration row. Built from each tool's real
// template data so search results are genuine, not a separate hand-kept list.
import { PRESETS } from "@/components/PresetSidebar";
import { LANDING_TEMPLATE_CATEGORIES } from "@/lib/landingGen";
import { PLAYABLE_MECHANICS } from "@/lib/playableGen";
import { VIDEO_SCENE_TYPES } from "@/lib/videoGen";
import type { SectionId } from "@/lib/sections";

export type HubTemplate = {
  id: string;
  name: string;
  description: string;
  sectionId: SectionId;
  /** Deep-link that opens the section with this template preselected where the
   *  section supports it (banner/landing read the query param on mount);
   *  playable/video have no per-item deep-link yet, so they just open. */
  href: string;
  /** Real thumbnail image (banner presets ship JPGs). */
  preview?: string;
  /** Gradient fallback thumbnail (landing templates, and banners without art). */
  gradient?: string;
};

// Every template across the four tools, flattened. Order = banner → landing →
// playable → video (matches SECTIONS), so search results feel predictable.
export const ALL_TEMPLATES: HubTemplate[] = [
  ...PRESETS.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    sectionId: "banner" as const,
    href: `/banner?preset=${p.id}`,
    preview: p.preview,
    gradient: p.gradient,
  })),
  ...LANDING_TEMPLATE_CATEGORIES.flatMap((c) => c.templates).map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    sectionId: "landing" as const,
    href: `/landing?template=${t.id}`,
    gradient: t.gradient,
  })),
  ...PLAYABLE_MECHANICS.map((m) => ({
    id: m.id,
    name: m.label,
    description: m.description,
    sectionId: "playable" as const,
    href: `/playable`,
  })),
  ...VIDEO_SCENE_TYPES.map((s) => ({
    id: s.id,
    name: s.label,
    description: s.description,
    sectionId: "video" as const,
    href: `/video`,
  })),
];

/** Case-insensitive search over template name + description. */
export function searchTemplates(query: string, limit = 6): HubTemplate[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return ALL_TEMPLATES.filter(
    (t) => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q),
  ).slice(0, limit);
}

// ⚠️ MOCK / PLACEHOLDER — hand-picked "trending" set for the Hub inspiration
// row. There is no popularity/analytics feed yet; replace this array with a real
// one (same HubTemplate shape) once usage data exists. Curated to banner+landing
// because those have real preview art AND per-template deep-links.
const POPULAR_IDS = ["preset2", "gambling-bonus", "preset3", "sport-match", "preset4", "preset1"];

export const POPULAR_TEMPLATES: HubTemplate[] = POPULAR_IDS.map((id) =>
  ALL_TEMPLATES.find((t) => t.id === id),
).filter((t): t is HubTemplate => Boolean(t));
