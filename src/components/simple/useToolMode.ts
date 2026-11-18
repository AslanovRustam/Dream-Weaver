"use client";

// Режим инструмента: «Простой» (ТЗ → «Создать», всё решает движок ТЗ) или
// «Продвинутый» (ручные настройки, как было). Простой — приоритетный и по
// умолчанию: продвинутый включается, только если человек сам его выбрал в этом
// инструменте. Выбор помнится отдельно для каждого инструмента.
import { useEffect, useState } from "react";

export type ToolMode = "simple" | "advanced";

const key = (tool: string) => `dw_mode_${tool}`;

/**
 * [режим, выбрать режим (запоминается), показать режим только сейчас (не запоминается)].
 * Третье — для входа с готовыми данными, например «Сделать лендинг» из баннера:
 * их заполняет продвинутая форма, а выбор человека трогать нельзя.
 */
export function useToolMode(tool: string): [ToolMode, (m: ToolMode) => void, (m: ToolMode) => void] {
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
  return [mode, setMode, setModeState];
}
