// ⚠️ MOCK / PLACEHOLDER DATA for the История section.
//
// Two things aren't backed by the API yet:
//   1. Projects across ALL four tools ("Мои проекты" tab) — the real
//      /api/history only stores banner projects. So HistoryApp loads real
//      banners when available and falls back to this cross-type mock for local
//      review / other tool types.
//   2. Credit-usage log ("Использование кредитов" tab) — there is no usage/
//      billing-log endpoint yet, so it is fully mocked here.
//
// Replace getMockProjects()/getMockCredits() with real endpoints when ready —
// the HistoryApp UI only depends on the Project / CreditTx shapes below.
import type { SectionId } from "@/lib/sections";

import presetWideAngle from "@/assets/preset-wide-angle.jpg";
import presetSlotBanner from "@/assets/preset-slot-banner.jpg";
import presetEvent from "@/assets/preset-event.jpg";
import presetSport from "@/assets/preset-sport.jpg";

export type ProjectType = SectionId; // "banner" | "landing" | "playable" | "video"

export type Project = {
  id: string;
  type: ProjectType;
  name: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  favorite: boolean;
  deleted: boolean; // in trash
  thumb?: string | null; // real preview image (banners)
  gradient?: string; // fallback thumbnail
  meta?: string; // small caption (e.g. "1080×1080", "6 сцен")
  /** Whether this row came from the real backend (so mutations hit the API). */
  real?: boolean;
};

export type CreditTx = {
  id: string;
  at: string; // ISO datetime
  kind: "spend" | "topup";
  amount: number; // positive magnitude; sign is derived from kind
  label: string;
  section?: ProjectType;
  projectId?: string;
};

const GRAD: Record<ProjectType, string> = {
  banner: "linear-gradient(135deg,#0f172a,#7c3aed,#22d3ee)",
  landing: "linear-gradient(135deg,#0f172a,#3b82f6,#93c5fd)",
  playable: "linear-gradient(135deg,#141a10,#4d7c0f,#a3e635)",
  video: "linear-gradient(135deg,#141b2e,#6366f1,#0a0e18)",
};

const H = 3600_000;
const D = 24 * H;

// Deterministic per-workspace bucketing for the MOCK data: each project lands
// in a stable subset of workspaces keyed by a hash of (projectId, workspaceId),
// so switching the active workspace shows a distinct, repeatable set of projects
// (that's how the isolation is testable before a backend stores a workspace id).
function wsHash(s: string): number {
  let x = 0;
  for (let i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) >>> 0;
  return x;
}
function inWorkspaceSeed(projectId: string, seed: string): boolean {
  // ~60% of projects per workspace — keeps every space populated while making
  // the sets clearly different between workspaces.
  return wsHash(projectId + "|" + seed) % 10 < 6;
}

/** Cross-type project list. Dates are relative to `now` so the day-grouping
 *  ("Сегодня"/"Вчера") stays meaningful. Called from a client effect to avoid
 *  SSR/CSR time drift. Pass `workspaceSeed` (the active workspace id) to get
 *  only that workspace's projects — see inWorkspaceSeed. */
export function getMockProjects(now = Date.now(), workspaceSeed?: string): Project[] {
  const iso = (ms: number) => new Date(now - ms).toISOString();
  const rows: Array<{
    id: string;
    type: ProjectType;
    name: string;
    ago: number;
    favorite: boolean;
    deleted: boolean;
    thumb?: string;
    meta?: string;
    grad?: boolean;
  }> = [
    { id: "m-b1", type: "banner", name: "Новогодний экспресс", ago: 0.4 * H, favorite: true, deleted: false, thumb: presetEvent.src, meta: "1080×1080" },
    { id: "m-b2", type: "banner", name: "Слот «Book of Sun»", ago: 2 * H, favorite: false, deleted: false, thumb: presetSlotBanner.src, meta: "1200×628" },
    { id: "m-l1", type: "landing", name: "Казино — приветственный бонус", ago: 5 * H, favorite: true, deleted: false, meta: "Лендинг · 5 блоков", grad: true },
    { id: "m-v1", type: "video", name: "Промо-ролик: осенний турнир", ago: 26 * H, favorite: false, deleted: false, meta: "Видео · 0:24", grad: true },
    { id: "m-p1", type: "playable", name: "Колесо фортуны — Halloween", ago: 27 * H, favorite: false, deleted: false, meta: "Плейбл · колесо", grad: true },
    { id: "m-b3", type: "banner", name: "Матч ЦСКА — Спартак", ago: 28 * H, favorite: false, deleted: false, thumb: presetSport.src, meta: "1080×1350" },
    { id: "m-b4", type: "banner", name: "Летняя акция: 300 фриспинов", ago: 2 * D + 3 * H, favorite: false, deleted: false, thumb: presetWideAngle.src, meta: "1080×1920" },
    { id: "m-l2", type: "landing", name: "Слот-лендинг «Gates of Olympus»", ago: 2 * D + 6 * H, favorite: false, deleted: false, meta: "Лендинг · 6 блоков", grad: true },
    { id: "m-p2", type: "playable", name: "Демо слота — Sweet Bonanza", ago: 3 * D, favorite: true, deleted: false, meta: "Плейбл · слот", grad: true },
    { id: "m-v2", type: "video", name: "Говорящий аватар: бонус дня", ago: 3 * D + 5 * H, favorite: false, deleted: false, meta: "Видео · 0:15", grad: true },
    { id: "m-b5", type: "banner", name: "Black Friday — кэшбэк 50%", ago: 4 * D, favorite: false, deleted: false, thumb: presetEvent.src, meta: "1200×628" },
    { id: "m-l3", type: "landing", name: "Ставки на футбол — экспресс дня", ago: 5 * D, favorite: false, deleted: false, meta: "Лендинг · 4 блока", grad: true },
    { id: "m-b6", type: "banner", name: "Джекпот недели", ago: 6 * D, favorite: false, deleted: false, thumb: presetSlotBanner.src, meta: "1080×1080" },
    { id: "m-v3", type: "video", name: "Скринкаст: как получить бонус", ago: 8 * D, favorite: false, deleted: false, meta: "Видео · 0:32", grad: true },
    { id: "m-p3", type: "playable", name: "Скретч-карта — новогодний приз", ago: 10 * D, favorite: false, deleted: false, meta: "Плейбл · скретч", grad: true },
    { id: "m-b7", type: "banner", name: "Приветственный пакет казино", ago: 12 * D, favorite: false, deleted: false, thumb: presetWideAngle.src, meta: "1200×1200" },
    // trash
    { id: "m-t1", type: "banner", name: "Черновик — старый баннер", ago: 1 * D, favorite: false, deleted: true, thumb: presetSport.src, meta: "1080×1080" },
    { id: "m-t2", type: "landing", name: "Тестовый лендинг", ago: 4 * D, favorite: false, deleted: true, meta: "Лендинг · 3 блока", grad: true },
  ];
  const mapped: Project[] = rows.map((r) => ({
    id: r.id,
    type: r.type,
    name: r.name,
    favorite: r.favorite,
    deleted: r.deleted,
    thumb: r.thumb ?? null,
    gradient: r.grad ? GRAD[r.type] : undefined,
    meta: r.meta,
    updatedAt: iso(r.ago),
    createdAt: iso(r.ago + 2 * H),
    real: false,
  }));
  return workspaceSeed ? mapped.filter((p) => inWorkspaceSeed(p.id, workspaceSeed)) : mapped;
}

/** Count of ACTIVE (non-trash) mock projects in a workspace — powers the
 *  project-count badge on the workspace cards. */
export function countMockProjects(workspaceSeed: string, now = Date.now()): number {
  return getMockProjects(now, workspaceSeed).filter((p) => !p.deleted).length;
}

/** Mock credits SPENT within a workspace: sum of spend-transactions whose
 *  project belongs to that workspace's set. The account balance stays global —
 *  this is only a per-space "spent here" view for the workspace summary. */
export function mockWorkspaceSpend(workspaceSeed: string, now = Date.now()): number {
  const ids = new Set(getMockProjects(now, workspaceSeed).map((p) => p.id));
  return getMockCredits(now)
    .filter((t) => t.kind === "spend" && !!t.projectId && ids.has(t.projectId))
    .reduce((s, t) => s + t.amount, 0);
}

const SPEND_LABEL: Record<ProjectType, string> = {
  banner: "Генерация баннера",
  landing: "Генерация лендинга",
  playable: "Генерация плейбла",
  video: "Генерация видео",
};

/** Mock credit-usage log (spend + topups), newest first. */
export function getMockCredits(now = Date.now()): CreditTx[] {
  const at = (ms: number) => new Date(now - ms).toISOString();
  return [
    { id: "t1", at: at(0.4 * H), kind: "spend", amount: 2, label: SPEND_LABEL.banner, section: "banner", projectId: "m-b1" },
    { id: "t2", at: at(2 * H), kind: "spend", amount: 6, label: "Пакет ресайзов (12 форматов)", section: "banner", projectId: "m-b2" },
    { id: "t3", at: at(5 * H), kind: "spend", amount: 3, label: SPEND_LABEL.landing, section: "landing", projectId: "m-l1" },
    { id: "t4", at: at(1 * D), kind: "topup", amount: 50, label: "Пополнение баланса" },
    { id: "t5", at: at(1 * D + 2 * H), kind: "spend", amount: 5, label: SPEND_LABEL.video, section: "video", projectId: "m-v1" },
    { id: "t6", at: at(2 * D), kind: "spend", amount: 4, label: SPEND_LABEL.playable, section: "playable", projectId: "m-p1" },
    { id: "t7", at: at(2 * D + 4 * H), kind: "spend", amount: 2, label: SPEND_LABEL.banner, section: "banner", projectId: "m-b4" },
    { id: "t8", at: at(3 * D), kind: "spend", amount: 3, label: SPEND_LABEL.landing, section: "landing", projectId: "m-l2" },
    { id: "t9", at: at(5 * D), kind: "spend", amount: 4, label: SPEND_LABEL.playable, section: "playable", projectId: "m-p2" },
    { id: "t10", at: at(8 * D), kind: "topup", amount: 100, label: "Пополнение баланса" },
    { id: "t11", at: at(9 * D), kind: "spend", amount: 5, label: SPEND_LABEL.video, section: "video", projectId: "m-v3" },
    { id: "t12", at: at(12 * D), kind: "spend", amount: 2, label: SPEND_LABEL.banner, section: "banner", projectId: "m-b7" },
    { id: "t13", at: at(20 * D), kind: "spend", amount: 6, label: "Пакет ресайзов (12 форматов)", section: "banner" },
    { id: "t14", at: at(35 * D), kind: "topup", amount: 50, label: "Пополнение баланса" },
  ];
}
