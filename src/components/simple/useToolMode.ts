"use client";

// Режим инструмента: «Простой» (ТЗ → «Создать», всё решает движок ТЗ) или
// «Продвинутый» (ручные настройки, как было). Простой — приоритетный и по
// умолчанию: продвинутый включается, только если человек сам его выбрал в этом
// инструменте. Выбор помнится отдельно для каждого инструмента.
import { useEffect, useState } from "react";

export type ToolMode = "simple" | "advanced";

const key = (tool: string) => `dw_mode_${tool}`;

export function useToolMode(tool: string): [ToolMode, (m: ToolMode) => void] {
  const [mode, setModeState] = useState<ToolMode>("simple");
  useEffect(() => {
    try {
      setModeState(window.localStorage.getItem(key(tool)) === "advanced" ? "advanced" : "simple");
    } catch {
      /* ignore */
    }
  }, [tool]);
  const setMode = (m: ToolMode) => {
    setModeState(m);
    try {
      window.localStorage.setItem(key(tool), m);
    } catch {
      /* ignore */
    }
  };
  return [mode, setMode];
}
