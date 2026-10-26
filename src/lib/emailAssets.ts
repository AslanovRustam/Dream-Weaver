"use client";

import { apiFetch } from "./api-client";
import type { EmailAssetUrls } from "./emailExport";
import { EMAIL_BLOCK_DEFAULTS, type EmailDraft } from "./mailing";
import { APP_STORE_BADGE, GOOGLE_PLAY_BADGE } from "./emailStoreBadges";

/**
 * Разместить картинки письма на хостинге перед выгрузкой.
 *
 * Отправляем только те картинки, которые реально попадут в письмо: лого
 * рисуется лишь когда нет баннера, значки магазинов — лишь при включённом блоке.
 * Уже размещённые не шлём повторно: кэш по хешу содержимого живёт, пока открыта
 * вкладка, и повторная выгрузка того же письма не гоняет мегабайты.
 */
const hosted = new Map<string, string>();

async function digest(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Какие картинки войдут в письмо — ровно по тем правилам, что в сборке. */
export function emailImages(draft: EmailDraft): Partial<Record<keyof EmailAssetUrls, string>> {
  const blocks = { ...EMAIL_BLOCK_DEFAULTS, ...(draft.blocks ?? {}) };
  const out: Partial<Record<keyof EmailAssetUrls, string>> = {};
  if (blocks.hero) {
    if (draft.heroImage) out.hero = draft.heroImage;
    else if (draft.brandMode === "logo" && draft.logo) out.logo = draft.logo;
  }
  if (blocks.apps) {
    out.appStore = APP_STORE_BADGE;
    out.googlePlay = GOOGLE_PLAY_BADGE;
  }
  return out;
}

export async function hostEmailImages(draft: EmailDraft): Promise<EmailAssetUrls> {
  const images = emailImages(draft);
  const result: EmailAssetUrls = {};
  const toUpload: Record<string, string> = {};
  const keys: Record<string, string> = {};

  for (const [key, value] of Object.entries(images) as [keyof EmailAssetUrls, string][]) {
    // Картинка уже по ссылке (например, из истории) — размещать нечего.
    if (!value.startsWith("data:")) {
      result[key] = value;
      continue;
    }
    const k = await digest(value);
    const cached = hosted.get(k);
    if (cached) result[key] = cached;
    else {
      toUpload[key] = value;
      keys[key] = k;
    }
  }

  if (Object.keys(toUpload).length > 0) {
    const res = await apiFetch("/api/email-assets", { method: "POST", json: { images: toUpload } });
    const data = (await res.json().catch(() => ({}))) as { urls?: Record<string, string>; error?: string };
    if (!res.ok || !data.urls) throw new Error(data.error || "Не удалось разместить картинки");
    for (const [key, url] of Object.entries(data.urls)) {
      result[key as keyof EmailAssetUrls] = url;
      if (keys[key]) hosted.set(keys[key], url);
    }
  }
  return result;
}
