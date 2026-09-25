"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Loader2 } from "lucide-react";

import type { AssetStepState } from "@/lib/useAssetRun";

/**
 * Что показывать на месте превью, пока лендинг собирается из баннера.
 *
 * Без этого превью жило своей жизнью: половина ассетов уже подставилась,
 * половина ещё генерируется, и человек видел недособранную страницу, принимая
 * её за результат. Перекрываем её на время сборки и говорим, что происходит:
 * шаги видны списком, а строка сверху меняется, чтобы не выглядело зависшим.
 */
const LINES: string[] = [
  "Разбираем баннер на составляющие…",
  "Переводим картинку в слова, а слова — в промпты…",
  "Подбираем фон под настроение баннера…",
  "Уговариваем персонажа встать поудобнее…",
  "Держим фирменные цвета в рамках приличия…",
  "Раскладываем элементы по местам…",
  "Проверяем, что ничего не уехало за край…",
];

export function BuildingOverlay({ steps }: { steps: AssetStepState[] }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  const order = useMemo(() => [...LINES].sort(() => Math.random() - 0.5), []);
  const done = steps.filter((s) => s.status === "done").length;

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/85 backdrop-blur-sm">
      <div className="flex max-w-xs flex-col items-center gap-3 px-6 text-center">
        <Loader2 className="h-7 w-7 animate-spin text-accent-green" />
        <p className="text-sm font-medium text-foreground">
          {order[Math.floor(seconds / 5) % order.length]}
        </p>
        <p className="ds-caption">
          Готово {done} из {steps.length} · {seconds} с
        </p>

        <ul className="mt-1 flex w-full flex-col gap-1">
          {steps.map((s) => (
            <li key={s.id} className="flex items-center gap-2 ds-caption">
              {s.status === "done" ? (
                <Check className="h-3.5 w-3.5 shrink-0 text-accent-green" />
              ) : s.status === "running" ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
              ) : s.status === "error" ? (
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
              ) : (
                <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-border" />
              )}
              <span className={s.status === "done" ? "text-foreground" : ""}>{s.label}</span>
            </li>
          ))}
        </ul>

        <p className="ds-caption">Превью откроется, когда всё будет на месте.</p>
      </div>
    </div>
  );
}
