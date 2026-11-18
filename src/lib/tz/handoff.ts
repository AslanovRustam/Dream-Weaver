"use client";

// Передача понятого ТЗ между инструментами в простом режиме.
//
// Пример: лендинг-хаб понял ТЗ и решил, что нужна механика «колесо» → кладёт
// сюда понятое ТЗ и уходит на /wheel. Колесо в простом режиме при открытии
// забирает передачу (takeTzHandoff) и сразу запускает свой автопилот — без
// повторного разбора ТЗ. Одна передача — один раз: take удаляет её.
// Хранится в IndexedDB: картинки ТЗ (data URL) не влезают в localStorage.
import { idbGet, idbSet } from "@/lib/idbStore";
import type { TzRunInput, TzUnderstood } from "./client";

export type TzHandoffTarget =
  | "wheel"
  | "slot"
  | "crash"
  | "match"
  | "scene"
  | "blocks"
  | "landing"
  | "playable"
  | "gif"
  | "email"
  | "banner"
  | "bannerLayers"
  | "campaign";

export type TzHandoff = {
  target: TzHandoffTarget;
  /** Понятое ТЗ (job.product — для какого инструмента понималось). */
  understood: TzUnderstood;
  /** Исходный ввод — если цели нужно понять ТЗ заново под себя. */
  input: TzRunInput;
  /** Что решил отправитель: механика, сцена, тексты… — свободная форма цели. */
  decided?: Record<string, unknown>;
  at: number;
};

const KEY = "dw:tzHandoff";
/** Передача старше этого — устарела (человек ушёл и вернулся позже). */
const TTL_MS = 10 * 60 * 1000;

export async function putTzHandoff(h: Omit<TzHandoff, "at">): Promise<void> {
  await idbSet(KEY, { ...h, at: Date.now() });
}

/** Забрать передачу для этой цели (и удалить). Чужую или устаревшую — не трогаем / удаляем. */
export async function takeTzHandoff(target: TzHandoffTarget): Promise<TzHandoff | null> {
  const h = await idbGet<TzHandoff>(KEY);
  if (!h) return null;
  if (Date.now() - h.at > TTL_MS) {
    await idbSet(KEY, undefined);
    return null;
  }
  if (h.target !== target) return null;
  await idbSet(KEY, undefined);
  return h;
}
