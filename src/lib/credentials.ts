// Подключения пользователя к его сервисам (BYO): рекламные кабинеты (Meta,
// Google, TikTok) и почтовый сервис для рассылок. Ключи к ИИ — системные,
// здесь их нет.
//
// Ключи хранятся на сервере в зашифрованном виде (/api/integrations,
// миграция 0017). Браузер их не хранит и обратно не получает — только маску
// «••••abcd» и не секретные поля (ID кабинета, отправитель).
//
// Раньше ключи лежали в localStorage (dw_credentials) открытым текстом;
// migrateLegacyCredentials переносит их на сервер и стирает из браузера.
import { apiFetch } from "@/lib/api-client";
import type { AdPlatformId } from "@/lib/ads";
import type { EspProvider, IntegrationInput, IntegrationProvider, IntegrationView } from "@/lib/integrations/types";

export type { EspProvider } from "@/lib/integrations/types";

export class IntegrationsUnavailable extends Error {}

async function read(res: Response): Promise<IntegrationView[]> {
  const data = (await res.json().catch(() => ({}))) as { integrations?: IntegrationView[]; error?: string; detail?: string };
  if (res.status === 503) throw new IntegrationsUnavailable(data.detail || "Хранилище ключей недоступно");
  if (!res.ok) throw new Error(data.error || "Не удалось выполнить запрос");
  return data.integrations ?? [];
}

export async function listIntegrations(): Promise<IntegrationView[]> {
  return read(await apiFetch("/api/integrations"));
}

export async function saveIntegration(input: IntegrationInput): Promise<IntegrationView[]> {
  return read(await apiFetch("/api/integrations", { method: "PUT", json: input }));
}

export async function removeIntegration(provider: IntegrationProvider): Promise<void> {
  const res = await apiFetch(`/api/integrations?provider=${provider}`, { method: "DELETE" });
  if (res.status === 503) throw new IntegrationsUnavailable("Хранилище ключей недоступно");
  if (!res.ok) throw new Error("Не удалось отключить");
}

/** Подключён ли кабинет: есть ключ и ID кабинета. */
export function isAdConnected(list: IntegrationView[], id: AdPlatformId): boolean {
  const it = list.find((i) => i.provider === id);
  return !!(it?.public.last4 && it.public.accountId);
}

// ---- перенос старых ключей из браузера

const LEGACY_KEY = "dw_credentials";
type Legacy = {
  meta?: { token?: string; accountId?: string };
  google?: { token?: string; accountId?: string };
  tiktok?: { token?: string; accountId?: string };
  esp?: { provider?: EspProvider; apiKey?: string; sender?: string };
};

/**
 * Если в браузере остались ключи от старой версии — перенести их на сервер и
 * стереть локально. Стираем, только когда всё сохранилось: иначе ключи не
 * пропадут молча. Возвращает, сколько подключений перенесено.
 */
export async function migrateLegacyCredentials(): Promise<number> {
  if (typeof window === "undefined") return 0;
  let legacy: Legacy;
  try {
    const raw = window.localStorage.getItem(LEGACY_KEY);
    if (!raw) return 0;
    legacy = JSON.parse(raw) as Legacy;
  } catch {
    return 0;
  }
  const inputs: IntegrationInput[] = [];
  (["meta", "google", "tiktok"] as const).forEach((p) => {
    const c = legacy[p];
    if (c?.token?.trim()) inputs.push({ provider: p, secret: c.token, accountId: c.accountId ?? "" });
  });
  if (legacy.esp?.apiKey?.trim()) {
    inputs.push({ provider: "esp", secret: legacy.esp.apiKey, espProvider: legacy.esp.provider ?? "", sender: legacy.esp.sender ?? "" });
  }
  for (const input of inputs) await saveIntegration(input);
  try {
    window.localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* ignore */
  }
  return inputs.length;
}
