"use client";

// «Блоки лендинга»: что будет под первым экраном — галочками, сразу под
// тематикой. Тексты отмеченных блоков «Применить тему» переписывает под тему,
// картинки (бонусы, обложки игр) рисует «Сгенерировать все ассеты». Править
// тексты блока — в «Блоки под механикой» ниже.

import type { LandingExtras, LandingKind } from "@/lib/landingKit";

export type BlockId =
  | "timer" | "bonuses" | "jackpot" | "express" | "promo" | "games" | "features" | "trust"
  | "steps" | "winners" | "tournament" | "vip" | "reviews" | "app" | "faq" | "final";

/** Блоки в порядке на странице; only — только для казино или спорта. */
export const LANDING_BLOCKS: { id: BlockId; label: (k: LandingKind) => string; only?: LandingKind }[] = [
  { id: "timer", label: () => "Таймер бонуса" },
  { id: "bonuses", label: () => "Бонусы" },
  { id: "jackpot", label: (k) => (k === "sport" ? "Призовой фонд" : "Джекпот") },
  { id: "express", label: () => "Экспресс дня", only: "sport" },
  { id: "promo", label: () => "Промокод" },
  { id: "games", label: (k) => (k === "sport" ? "Топ-матчи" : "Популярные игры") },
  { id: "features", label: () => "Преимущества" },
  { id: "trust", label: () => "Доверие и платежи" },
  { id: "steps", label: () => "Как получить бонус" },
  { id: "winners", label: () => "Лента выигрышей" },
  { id: "tournament", label: () => "Турнир" },
  { id: "vip", label: () => "VIP-уровни" },
  { id: "reviews", label: () => "Отзывы" },
  { id: "app", label: () => "Приложение" },
  { id: "faq", label: () => "FAQ" },
  { id: "final", label: () => "Финальный призыв" },
];

export const blocksFor = (kind: LandingKind) => LANDING_BLOCKS.filter((b) => !b.only || b.only === kind);
/** Отмеченные блоки — для подбора текстов под тему. */
export const enabledBlocks = (x: LandingExtras, kind: LandingKind): BlockId[] => blocksFor(kind).filter((b) => x[b.id].on).map((b) => b.id);

export function LandingBlocksPicker({ value: x, onChange, kind }: { value: LandingExtras; onChange: (next: LandingExtras) => void; kind: LandingKind }) {
  const list = blocksFor(kind);
  const on = list.filter((b) => x[b.id].on).length;
  const set = (id: BlockId, v: boolean) => onChange({ ...x, [id]: { ...x[id], on: v } } as LandingExtras);
  const all = (v: boolean) => onChange(list.reduce((acc, b) => ({ ...acc, [b.id]: { ...acc[b.id], on: v } }), x) as LandingExtras);
  return (
    <fieldset>
      <div className="mb-2 flex items-center justify-between gap-2">
        <legend className="ds-h4">
          Блоки лендинга <span className="ds-caption">· {on} из {list.length}</span>
        </legend>
        <div className="flex gap-3 text-xs text-muted-foreground">
          <button type="button" onClick={() => all(true)} className="hover:text-foreground">Все</button>
          <button type="button" onClick={() => all(false)} className="hover:text-foreground">Ни одного</button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {list.map((b) => (
          <label
            key={b.id}
            className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-sm transition ${x[b.id].on ? "border-accent-green bg-accent-green/10" : "border-border hover:bg-white/5"}`}
          >
            <input type="checkbox" checked={x[b.id].on} onChange={(e) => set(b.id, e.target.checked)} className="h-4 w-4 shrink-0 accent-[var(--accent-green)]" />
            <span className="min-w-0 truncate">{b.label(kind)}</span>
          </label>
        ))}
      </div>
      <p className="mt-1.5 ds-caption">Под первым экраном — в этом порядке. «Применить тему» перепишет тексты отмеченных блоков под тематику.</p>
    </fieldset>
  );
}

/** Тексты блоков под тему поверх своих — общий код в landingBlocks (им пользуется и кампания). */
export { applyBlockTexts } from "@/lib/landingBlocks";
