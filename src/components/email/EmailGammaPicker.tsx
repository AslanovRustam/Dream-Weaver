"use client";

import { Pipette } from "lucide-react";

import { buildPalette, EMAIL_GAMMAS, isHex } from "@/lib/emailPalette";

/**
 * Цветовая гамма письма — как на лендингах: человек задаёт цвет, остальное
 * считается от него. Готовые пары «акцент + фон» здесь не темы, а стартовые
 * точки: после выбора обе пипетки остаются рабочими.
 *
 * Образец справа собран теми же цветами, что уйдут в письмо, поэтому спорные
 * сочетания (кнопка в цвет фона, невидимый акцент в тексте) видны сразу, до
 * предпросмотра.
 */
export function EmailGammaPicker({
  accent,
  base,
  onChange,
}: {
  accent: string;
  base: string;
  onChange: (accent: string, base: string) => void;
}) {
  const p = buildPalette(accent, base);
  const active = EMAIL_GAMMAS.find((g) => g.accent.toLowerCase() === accent.toLowerCase() && g.base.toLowerCase() === base.toLowerCase());

  return (
    <div className="rounded-xl border border-border bg-background/40 p-3">
      <div className="mb-2 flex items-center gap-1.5">
        <label className="ds-h4">Цветовая гамма</label>
        <Pipette className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {EMAIL_GAMMAS.map((g) => (
          <button
            key={g.id}
            type="button"
            title={g.label}
            aria-label={`Гамма «${g.label}»`}
            aria-pressed={active?.id === g.id}
            onClick={() => onChange(g.accent, g.base)}
            className={`flex h-9 w-9 items-center justify-center rounded-lg border transition ${
              active?.id === g.id ? "border-accent-green" : "border-border hover:border-accent-green/50"
            }`}
            style={{ backgroundColor: g.base }}
          >
            <span className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: g.accent }} />
          </button>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-[auto_auto_1fr] items-center gap-3">
        <label className="flex items-center gap-2">
          <input
            type="color"
            value={isHex(accent) ? accent : p.accent}
            onChange={(e) => onChange(e.target.value, base)}
            aria-label="Акцентный цвет письма"
            className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-border bg-elevated p-0"
          />
          <span className="ds-caption">Акцент</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="color"
            value={isHex(base) ? base : p.page}
            onChange={(e) => onChange(accent, e.target.value)}
            aria-label="Базовый цвет письма"
            className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-border bg-elevated p-0"
          />
          <span className="ds-caption">Фон</span>
        </label>

        {/* Образец: полотно, текст, приглушённый текст и кнопка — то же, что в письме. */}
        <div
          className="flex items-center justify-end gap-2 rounded-lg px-2.5 py-2"
          style={{ backgroundColor: p.panel }}
          aria-hidden="true"
        >
          <span className="text-[11px] font-bold leading-none" style={{ color: p.text }}>
            Aa
          </span>
          <span className="text-[11px] leading-none" style={{ color: p.muted }}>
            текст
          </span>
          <span className="text-[11px] font-bold leading-none" style={{ color: p.accentText }}>
            акцент
          </span>
          <span
            className="rounded-full px-2 py-1 text-[10px] font-bold leading-none"
            style={{ backgroundColor: p.accent, color: p.onAccent }}
          >
            CTA
          </span>
        </div>
      </div>

      <p className="mt-2 ds-caption">
        Фон задаёт всё письмо: полотно, подвал, разделители и цвет текста. Акцент идёт на кнопки,
        номера шагов и выделения жирным.
      </p>
    </div>
  );
}
