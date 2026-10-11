"use client";

import { apiFetch } from "./api-client";
import { deleteDraft as deleteLocal, getDrafts as getLocal, saveDraft as saveLocal, withBlocks, type EmailDraft } from "./mailing";

/**
 * Черновики писем: база, когда она есть, и localStorage как запас.
 *
 * Пока миграция 0016 не применена (сервер отвечает 503) или человек не вошёл,
 * всё работает как раньше — в браузере. Когда база появляется, черновики из
 * браузера при первом же обращении переезжают туда под своими id, и дальше
 * localStorage — только кэш на случай обрыва сети.
 *
 * remote = false — в базу не ходим вовсе: гостю туда нельзя, а запись от его
 * имени ещё и открыла бы окно регистрации на каждое «Сохранить».
 */
export type DraftMeta = { id: string; name: string; subject: string; updatedAt: string };

export type SaveResult = "server" | "local";

const toMeta = (d: EmailDraft): DraftMeta => ({
  id: d.id,
  name: d.name,
  subject: d.subject,
  updatedAt: d.updatedAt,
});

/** Черновики, которые уже переносили в базу в этой вкладке. */
let migrated = false;

async function uploadLocalOnes(serverIds: Set<string>): Promise<boolean> {
  let any = false;
  for (const d of getLocal()) {
    if (serverIds.has(d.id)) continue;
    const res = await apiFetch("/api/email-drafts", { method: "PUT", json: { draft: d } }).catch(() => null);
    if (res?.ok) any = true;
  }
  return any;
}

async function fetchServerList(): Promise<DraftMeta[] | null> {
  const res = await apiFetch("/api/email-drafts").catch(() => null);
  if (!res || !res.ok) return null;
  const data = (await res.json().catch(() => null)) as { drafts?: DraftMeta[] } | null;
  return data?.drafts ?? null;
}

/** Список черновиков, свежие сверху. */
export async function listDrafts(remote: boolean): Promise<DraftMeta[]> {
  const server = remote ? await fetchServerList() : null;
  if (!server) return getLocal().map(toMeta);

  // Первое обращение к базе: всё, что лежит только в браузере, переносим.
  if (!migrated) {
    migrated = true;
    if (await uploadLocalOnes(new Set(server.map((d) => d.id)))) {
      return (await fetchServerList()) ?? server;
    }
  }
  return server;
}

/** Черновик целиком — для редактора. */
export async function loadDraft(id: string, remote: boolean): Promise<EmailDraft | null> {
  const res = !remote ? null : await apiFetch(`/api/email-drafts?id=${encodeURIComponent(id)}`).catch(() => null);
  if (res?.ok) {
    const data = (await res.json().catch(() => null)) as { draft?: EmailDraft } | null;
    if (data?.draft) return withBlocks(data.draft);
  }
  return getLocal().find((d) => d.id === id) ?? null;
}

/**
 * Сохранить. В браузер — всегда и сразу: это и кэш, и страховка, если сеть
 * отвалится. В базу — если она есть; результат говорит, куда удалось.
 */
export async function persistDraft(d: EmailDraft, remote: boolean): Promise<SaveResult> {
  saveLocal(d);
  if (!remote) return "local";
  const res = await apiFetch("/api/email-drafts", { method: "PUT", json: { draft: d } }).catch(() => null);
  return res?.ok ? "server" : "local";
}

export async function removeDraft(id: string, remote: boolean): Promise<void> {
  deleteLocal(id);
  if (!remote) return;
  await apiFetch(`/api/email-drafts?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
}
