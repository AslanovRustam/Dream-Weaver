"use client";

// Автосохранение в «Мои проекты» сразу после генерации.
//
// Раньше проект попадал в историю только при скачивании: сгенерировал фон и
// персонажей, закрыл вкладку — в истории пусто. Теперь редактор отдаёт сюда
// свои ИИ-картинки (фон, персонажи, символы, блоки…); как только среди них
// появилась новая или сменилась — через паузу проект сохраняется под тем же id,
// что и при скачивании (одна запись на черновик).
//
// Первые секунды после открытия редактора не считаются: это черновик
// поднимается из localStorage (или открыт из истории), а не новая генерация.

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import type { SaveResult } from "./projects";

const SETTLE_MS = 2500;
const DEBOUNCE_MS = 1500;

/** Отпечаток картинок: только data:image и ссылки на картинки, где бы они ни лежали в объекте. */
export function artSignature(values: unknown[]): string {
  const out: string[] = [];
  const walk = (v: unknown, depth: number) => {
    if (depth > 6 || v == null) return;
    if (typeof v === "string") {
      if (v.startsWith("data:image") || /^https?:\/\/\S+\.(png|jpe?g|webp)(\?|$)/i.test(v)) out.push(`${v.length}:${v.slice(-24)}`);
      return;
    }
    if (Array.isArray(v)) v.forEach((x) => walk(x, depth + 1));
    else if (typeof v === "object") for (const x of Object.values(v as Record<string, unknown>)) walk(x, depth + 1);
  };
  values.forEach((v) => walk(v, 0));
  return out.join("|");
}

export function useProjectAutosave(o: { uid: string | null | undefined; art: unknown[]; save: () => Promise<SaveResult> }) {
  const sig = artSignature(o.art);
  const mountedAt = useRef(0);
  const last = useRef(sig);
  const told = useRef(false);
  const save = useRef(o.save);
  save.current = o.save;

  useEffect(() => {
    mountedAt.current = Date.now();
  }, []);

  useEffect(() => {
    if (!o.uid) return;
    // Подъём черновика при открытии — не генерация: только запоминаем.
    if (Date.now() - mountedAt.current < SETTLE_MS) {
      last.current = sig;
      return;
    }
    if (!sig || sig === last.current) return;
    const id = window.setTimeout(() => {
      last.current = sig;
      void save.current().then((r) => {
        if (r === "saved" && !told.current) {
          told.current = true;
          toast.success("Сохранено в «Мои проекты» — дальше сохраняется само");
        }
      });
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [sig, o.uid]);
}
