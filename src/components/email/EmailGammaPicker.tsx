"use client";

import { Pipette } from "lucide-react";

import { buildPalette, isHex } from "@/lib/emailPalette";

// Нативная пипетка рисует образец цвета внутри своей рамки, и получается
// квадрат в квадрате. Убираем внутренние отступы и рамку образца — цвет
// заливает всю кнопку, остаётся только тонкий контур, чтобы цвет в тон
// интерфейса не сливался с фоном.
const SWATCH_CLS =
  "h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-border bg-elevated p-0 " +
  "[&::-moz-color-swatch]:rounded-[7px] [&::-moz-color-swatch]:border-0 " +
  "[&::-webkit-color-swatch]:rounded-[7px] [&::-webkit-color-swatch]:border-0 " +
  "[&::-webkit-color-swatch-wrapper]:rounded-[7px] [&::-webkit-color-swatch-wrapper]:p-0";

/**
 * Цветовая гамма письма — как на лендингах: человек задаёт два цвета, всё
 * остальное считается от них.
 *
 * Образец собран теми же цветами, что уйдут в письмо, и показывает именно
 * текст: заголовок, обычный абзац, выделение акцентом и кнопку. Спорные
 * сочетания — невидимый акцент, серый текст на сером полотне — видно сразу,
 * не доходя до предпросмотра.
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

  return (
    <div className="rounded-xl border border-border bg-background/40 p-3">
      <div className="mb-2 flex items-center gap-1.5">
        <label className="ds-h4">Цветовая гамма</label>
        <Pipette className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
      </div>

      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2">
          <input
            type="color"
            value={isHex(accent) ? accent : p.accent}
            onChange={(e) => onChange(e.target.value, base)}
            aria-label="Акцентный цвет письма"
            className={SWATCH_CLS}
          />
          <span className="ds-caption">Акцент</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="color"
            value={isHex(base) ? base : p.page}
            onChange={(e) => onChange(accent, e.target.value)}
            aria-label="Базовый цвет письма"
            className={SWATCH_CLS}
          />
          <span className="ds-caption">Фон</span>
        </label>
      </div>

      {/* Образец текста: полотно, заголовок, абзац, акцент и кнопка — ровно те
          цвета, которыми это напечатается в письме. */}
      <div className="mt-3 rounded-lg p-3" style={{ backgroundColor: p.panel }} aria-hidden="true">
        <p className="text-[13px] font-bold leading-snug" style={{ color: p.text }}>
          Заголовок письма
        </p>
        <p className="mt-1 text-[12px] leading-snug" style={{ color: p.muted }}>
          Обычный текст письма и{" "}
          <span className="font-bold" style={{ color: p.accentText }}>
            выделение акцентом
          </span>
          .
        </p>
        <span
          className="mt-2 inline-block rounded-full px-3 py-1.5 text-[11px] font-bold leading-none"
          style={{ backgroundColor: p.accent, color: p.onAccent }}
        >
          КНОПКА
        </span>
      </div>

      <p className="mt-2 ds-caption">
        Фон задаёт всё письмо: полотно, подвал, разделители и цвет текста. Акцент идёт на кнопки,
        номера шагов и выделения жирным.
      </p>
    </div>
  );
}
