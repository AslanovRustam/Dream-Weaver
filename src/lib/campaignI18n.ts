// Перевод кампании на язык без готовых текстов (немецкий, польский, …).
//
// Все тексты, которые увидит игрок, собираются в плоский словарь «путь → текст»
// из английского набора: подписи механик и блоков (kit.*), сами блоки
// лендинга (extras.*), тексты сцены плейбла (scene.*), письмо (email.*) и
// умолчания брифа (brief.*). Его один раз переводит /api/translate-texts,
// а сборщики кампании накладывают перевод по тем же путям.
//
// Письмо готово только по-русски, поэтому его тексты уходят в перевод для
// любого языка, кроме русского — и для готовых uk/en/es тоже.

import { defaultExtras, landingStrings, type LandingExtras, type LandingKind, type LandingStrings } from "./landingKit";
import { isBuiltInLang } from "./euLangs";
import type { EmailDraft } from "./mailing";
import { scenePreset } from "./scenes/presets";
import type { SceneId } from "./scenes/build";

export type CampaignI18n = Record<string, string>;

/** Что не переводим: картинки, валюты, числа, списки платёжек, названия игр. */
const SKIP = /(^|\.)(image|currency|rating|players|payments|lang|htmlLang|on|minutes)$|^extras\.games\.items\.\d+\.title$/;
const hasLetters = (s: string) => /\p{L}/u.test(s);

/** Плоский словарь строк объекта: { "bonuses.items.0.title": "…" }. */
export function flatten(obj: unknown, prefix: string, out: CampaignI18n = {}): CampaignI18n {
  if (typeof obj === "string") {
    if (!SKIP.test(prefix) && hasLetters(obj)) out[prefix] = obj;
  } else if (Array.isArray(obj)) {
    obj.forEach((v, i) => flatten(v, `${prefix}.${i}`, out));
  } else if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  }
  return out;
}

/** Копия объекта с переводами по путям prefix.*; чего нет в словаре — как было. */
export function applyFlat<T>(obj: T, prefix: string, tr: CampaignI18n): T {
  if (typeof obj === "string") return (tr[prefix] ?? obj) as T;
  if (Array.isArray(obj)) return obj.map((v, i) => applyFlat(v, `${prefix}.${i}`, tr)) as T;
  if (obj && typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) out[k] = applyFlat(v, prefix ? `${prefix}.${k}` : k, tr);
    return out as T;
  }
  return obj;
}

/** Переведённые подписи механики и блоков (kit.*) — для LandingExtras.strings. */
export function kitStringsFrom(tr: CampaignI18n): Partial<LandingStrings> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(tr)) if (k.startsWith("kit.")) out[k.slice(4)] = v;
  return out as Partial<LandingStrings>;
}

/** Текстовые поля письма, которые переводим. */
export const EMAIL_TEXT_FIELDS = ["subject", "preheader", "heroTitle", "heroSubtitle", "body", "stepsTitle", "ctaText", "bonusCtaText", "footer"] as const;
export function emailTexts(d: EmailDraft): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const k of EMAIL_TEXT_FIELDS) o[k] = d[k];
  o.steps = d.steps;
  return o;
}

/**
 * Словарь для перевода. Язык с готовыми текстами — только письмо (если не
 * русский); иначе — всё, из английского набора.
 */
export function campaignSource(opts: {
  lang: string;
  kind: LandingKind;
  scene: SceneId;
  defaults: { offer: string; cta: string; headline: string };
  email: EmailDraft;
}): CampaignI18n {
  const out: CampaignI18n = {};
  if (!isBuiltInLang(opts.lang)) {
    flatten(opts.defaults, "brief", out);
    flatten(landingStrings("en"), "kit", out);
    const x: Partial<LandingExtras> = defaultExtras("en", opts.kind);
    delete x.tracking;
    delete x.look;
    flatten(x, "extras", out);
    const p = scenePreset(opts.scene, "en");
    flatten({ text: p.text, legal: p.legal, unit: p.unit, prizes: p.prizes ?? [] }, "scene", out);
  }
  if (opts.lang !== "ru") flatten(emailTexts(opts.email), "email", out);
  return out;
}

/** Короткий отпечаток словаря — ключ кэша перевода. */
export function sourceHash(src: CampaignI18n): string {
  const s = JSON.stringify(Object.entries(src).sort(([a], [b]) => (a < b ? -1 : 1)));
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
