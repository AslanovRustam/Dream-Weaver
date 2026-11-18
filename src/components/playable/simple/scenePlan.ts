// Решение автопилота для сцены: план движка ТЗ (job.plan у product «playable»)
// или — когда ТЗ понималось под другой инструмент (передача из лендинг-хаба) —
// собранное из общей части задания и того, что решил отправитель.
import type { SceneId } from "@/lib/scenes/build";
import type { TzJob } from "@/lib/tz/understand";
import { normalizePlayablePlan, PLAYABLE_SCENE_IDS, type PlayablePlan } from "@/lib/tz/plans/playable";

export type { PlayablePlan };

/** «wheel» или «scene-wheel» → id сцены; чужое — null. */
export function sceneIdOf(v: unknown): SceneId | null {
  const id = String(v ?? "").replace(/^scene-/, "");
  return (PLAYABLE_SCENE_IDS as string[]).includes(id) ? (id as SceneId) : null;
}

/** Главное число оффера и что оно считает: «5 000 000 сум» → 5000000, «сум». Проценты — только если другого нет. */
export function amountFromOffer(offer: string): { amount: number; unit: string } | null {
  const hits = [...offer.matchAll(/(\d[\d\s]*(?:[.,]\d+)?)\s*(%)?\s*([^\s\d%+,.;:!?()]{1,14})?/g)].map((m) => ({
    n: Number(m[1].replace(/\s/g, "").replace(",", ".")),
    pct: !!m[2],
    unit: m[2] ? "%" : (m[3] ?? ""),
  }));
  const ok = hits.filter((h) => Number.isFinite(h.n) && h.n > 0);
  const pick = ok.filter((h) => !h.pct).sort((a, b) => b.n - a.n)[0] ?? ok[0];
  return pick ? { amount: Math.round(pick.n), unit: pick.unit } : null;
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function planFromJob(job: TzJob, decided?: Record<string, unknown>): PlayablePlan {
  const own = job.product === "playable" && sceneIdOf((job.plan as { scene?: unknown })?.scene);
  const base: PlayablePlan = own
    ? normalizePlayablePlan(job.plan)
    : (() => {
        const off = amountFromOffer(str(decided?.offer) || job.offer);
        return normalizePlayablePlan({
          scene: sceneIdOf(decided?.scene) ?? "wheel",
          why: str(decided?.why),
          language: job.language,
          headline: str(decided?.headline),
          cta: str(decided?.cta),
          amount: off?.amount ?? 0,
          unit: off?.unit ?? "",
          legal: job.legal.join(" "),
          theme: [job.style.direction, job.style.mood].filter(Boolean).join("; "),
        });
      })();
  if (!decided) return base;
  // Отправитель решил сцену и тексты — они главнее; тексты под другую сцену не переносим.
  const scene = sceneIdOf(decided.scene) ?? base.scene;
  const same = scene === base.scene;
  const headline = str(decided.headline).slice(0, 80) || base.headline;
  const cta = str(decided.cta).slice(0, 28) || base.cta;
  const texts = { ...(same ? base.texts : {}), ...(headline ? { title: headline } : {}), ...(cta ? { cta } : {}) };
  return {
    ...base,
    scene,
    why: str(decided.why) || base.why,
    headline,
    cta,
    texts,
    prizes: same ? base.prizes : [],
    winPrize: same ? base.winPrize : 0,
  };
}
