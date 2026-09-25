"use client";

import { Loader2 } from "lucide-react";

import { MAX_MASTER_VARIANTS, type MasterVariant } from "@/lib/generation-context";

/**
 * Сколько баннеров генерировать за раз.
 *
 * Каждый вариант — отдельная платная генерация, поэтому цифра рядом с кнопкой
 * умножается: человек должен видеть, во что ему обойдётся «попробовать
 * четыре», до нажатия, а не после.
 */
export function VariantCount({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="ds-caption">Вариантов за раз</span>
      <div className="flex rounded-lg border border-border p-0.5">
        {Array.from({ length: MAX_MASTER_VARIANTS }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            disabled={disabled}
            onClick={() => onChange(n)}
            aria-pressed={value === n}
            className={`min-h-8 w-8 rounded-md text-xs font-semibold transition disabled:opacity-50 ${
              value === n
                ? "bg-accent-green text-on-accent"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Полоса вариантов под холстом.
 *
 * Показываем её и во время генерации: первый готовый вариант уже на холсте, а
 * по остальным видно, что они ещё идут, — иначе кажется, что оплаченные
 * картинки потерялись. Упавший вариант остаётся в полосе с причиной: молча
 * исчезнуть он не может, деньги за него списаны.
 */
export function VariantStrip({
  variants,
  activeId,
  onPick,
}: {
  variants: MasterVariant[];
  activeId: string | null;
  onPick: (id: string) => void;
}) {
  if (variants.length < 2) return null;

  return (
    <div>
      <p className="mb-1.5 ds-caption">Варианты · выберите тот, с которым работаем дальше</p>
      <div className="flex flex-wrap gap-2">
        {variants.map((v, i) => {
          const active = v.id === activeId;
          if (v.status === "done" && v.imageUrl) {
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => onPick(v.id)}
                aria-pressed={active}
                title={`Вариант ${i + 1}`}
                className={`h-20 w-20 overflow-hidden rounded-lg border-2 transition ${
                  active ? "border-accent-green" : "border-border hover:border-accent-green/50"
                }`}
              >
                <img src={v.imageUrl} alt={`Вариант ${i + 1}`} className="h-full w-full object-cover" />
              </button>
            );
          }
          return (
            <div
              key={v.id}
              title={v.error}
              className="flex h-20 w-20 items-center justify-center rounded-lg border border-dashed border-border bg-background/40 p-1 text-center"
            >
              {v.status === "running" ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                <span className="ds-caption line-clamp-3 text-[10px]">{v.error || "Ошибка"}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
