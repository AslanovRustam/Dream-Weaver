"use client";

// ТЗ с главной → простой режим «Кампании».
//
// Главная кладёт сюда ввод (текст, файлы, картинки, что собрать) и уходит на
// /campaign; кампания при открытии забирает его и запускает разбор (до плана и
// цены — кредиты не тратятся). Гость сначала идёт на вход: ТЗ ждёт здесь, а
// главная после входа сама отправит его в кампанию. IndexedDB — файлы ТЗ в
// data URL не влезают в localStorage.
import { idbGet, idbSet } from "@/lib/idbStore";
import type { TzRunInput } from "@/lib/tz/client";

const KEY = "dw:hubBrief";
/** Сколько ТЗ ждёт: хватает на регистрацию с подтверждением почты. */
const TTL_MS = 2 * 60 * 60 * 1000;

type Stored = { input: TzRunInput; at: number };

export async function putHubBrief(input: TzRunInput): Promise<void> {
  await idbSet(KEY, { input, at: Date.now() } satisfies Stored);
}

async function fresh(): Promise<Stored | null> {
  const v = await idbGet<Stored>(KEY);
  if (!v) return null;
  if (Date.now() - v.at > TTL_MS) {
    await idbSet(KEY, undefined);
    return null;
  }
  return v;
}

/** Есть ли ТЗ, ожидающее запуска (не забирает его). */
export async function hasHubBrief(): Promise<boolean> {
  return !!(await fresh().catch(() => null));
}

/** Забрать ТЗ (и удалить): одно ТЗ — один запуск. */
export async function takeHubBrief(): Promise<TzRunInput | null> {
  const v = await fresh();
  if (!v) return null;
  await idbSet(KEY, undefined);
  return v.input;
}
