"use client";

import { buildPalette } from "@/lib/emailPalette";
import { EMAIL_TEMPLATES, type EmailTemplate } from "@/lib/emailTemplates";

/**
 * Каталог шаблонов: лента карточек над формой.
 *
 * Карточка рисует гамму шаблона так же, как она ляжет в письмо — полотно,
 * заголовок, акцент и кнопка, — чтобы выбирать можно было глазами, а не по
 * названию.
 */
export function TemplatePicker({ onPick }: { onPick: (t: EmailTemplate) => void }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <label className="ds-h4">Шаблон</label>
        <span className="ds-caption">тексты, блоки и цвет; бренд и картинки не тронет</span>
      </div>
      <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-2">
        {EMAIL_TEMPLATES.map((t) => {
          const p = buildPalette(t.accent, t.base);
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onPick(t)}
              title={t.when}
              className="w-40 shrink-0 snap-start overflow-hidden rounded-xl border border-border text-left transition hover:border-accent-green/60"
            >
              <div className="flex flex-col gap-1.5 p-2.5" style={{ backgroundColor: p.panel }} aria-hidden="true">
                <span className="h-1.5 w-16 rounded-full" style={{ backgroundColor: p.text }} />
                <span className="h-1.5 w-24 rounded-full" style={{ backgroundColor: p.muted, opacity: 0.6 }} />
                <span
                  className="mt-1 h-3.5 w-14 rounded-full"
                  style={{ backgroundColor: p.accent }}
                />
              </div>
              <div className="p-2.5">
                <span className="block text-xs font-semibold text-foreground">{t.name}</span>
                <span className="mt-0.5 block ds-caption line-clamp-2">{t.when}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
