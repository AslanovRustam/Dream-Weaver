"use client";

import { PLAYABLE_MECHANIC_BY_ID } from "@/lib/playableGen";
import { PLAYABLE_TEMPLATES, type PlayableTemplate } from "@/lib/playableTemplates";

/**
 * Каталог шаблонов плейблов: лента карточек над формой. Полоса сверху —
 * цвет шаблона, под названием — механика, чтобы было видно, во что играем.
 */
export function PlayableTemplatePicker({ onPick }: { onPick: (t: PlayableTemplate) => void }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="ds-h4">Шаблон</span>
        <span className="ds-caption">механика, оффер и цвет; бренд и ссылку не тронет</span>
      </div>
      <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-2">
        {PLAYABLE_TEMPLATES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onPick(t)}
            title={t.when}
            className="w-40 shrink-0 snap-start overflow-hidden rounded-xl border border-border text-left transition hover:border-accent-green/60"
          >
            <span className="block h-1.5" style={{ backgroundColor: t.accent }} aria-hidden="true" />
            <span className="block p-2.5">
              <span className="block text-xs font-semibold text-foreground">{t.name}</span>
              <span className="mt-0.5 block ds-caption">
                {PLAYABLE_MECHANIC_BY_ID.get(t.mechanic)?.label}
              </span>
              <span className="mt-1 block ds-caption line-clamp-2">{t.when}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
