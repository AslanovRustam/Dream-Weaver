// Проекты лендингов и плейблов в «Моих проектах» (таблица creative_projects,
// /api/projects). Проект — черновик редактора целиком: тот же объект, что
// редактор держит в localStorage и из которого сам восстанавливается.
//
// Сохранение — при скачивании: берём свежий черновик редактора и кладём на
// сервер под id, который редактор помнит рядом с черновиком (ключ «…__project»),
// — следующее скачивание обновит ту же запись. «Новый»/сброс в редакторе
// забывает id: дальше — новый проект.
//
// Открытие из истории — обратный путь: черновик проекта пишется в ключ
// редактора (для сцен — ещё и какая сцена выбрана), и история переходит в
// редактор, который поднимает его как обычный черновик.
//
// Пока миграция 0018 не применена, /api/projects отвечает 503 — сохранение
// молча пропускается, история показывает то же, что раньше.

import { apiFetch } from "./api-client";
import { PLAYABLE_PICK_KEY } from "./playableCatalog";
import { readActiveWorkspaceId, tagProjectWorkspace } from "./workspaces";

export const PROJECT_KINDS = ["landing-wheel", "landing-slot", "landing-crash", "landing-match", "landing-scene", "playable", "campaign"] as const;
export type ProjectKind = (typeof PROJECT_KINDS)[number];

/** Кампания: бриф — в localStorage, графика — в IndexedDB (в localStorage не влезает). */
export const CAMPAIGN_BRIEF_KEY = "dw_campaign_brief";
export const CAMPAIGN_ART_KEY = "campaign_art";

/** Что открыто в редакторе лендинга на сцене — своя метка, не путается с плейблами. */
export const LANDING_SCENE_PICK_KEY = "dw_landing_scene_pick";

/** Черновик сцены: у плейбла и лендинга на той же сцене — свои. */
export const sceneDraftKey = (scene: string, landing: boolean) => `dw_scene_draft_${scene}${landing ? "_landing" : ""}`;

const MECHANIC: Partial<Record<ProjectKind, { route: string; draftKey: string; label: string; preview: string }>> = {
  "landing-wheel": { route: "/wheel", draftKey: "dw_wheel_draft", label: "Колесо фортуны", preview: "/landing-previews/gambling-wheel.jpg" },
  "landing-slot": { route: "/slot", draftKey: "dw_slot_draft", label: "Слот-машина", preview: "/landing-previews/gambling-slot-machine.jpg" },
  "landing-crash": { route: "/crash", draftKey: "dw_crash_draft", label: "Crash-игра", preview: "/landing-previews/gambling-crash.jpg" },
  "landing-match": { route: "/match", draftKey: "dw_match_draft", label: "Матч-прогноз", preview: "/landing-previews/betting-match.jpg" },
};

export function projectDraftKey(kind: ProjectKind, scene = ""): string {
  if (kind === "campaign") return CAMPAIGN_BRIEF_KEY;
  if (kind === "landing-scene") return sceneDraftKey(scene, true);
  if (kind === "playable") return sceneDraftKey(scene, false);
  return MECHANIC[kind]!.draftKey;
}

/** Картинка карточки в истории: кадр сцены или превью механики. */
export function projectThumb(kind: ProjectKind, scene = ""): string {
  if (kind === "campaign") return scene ? `/playable/previews/scene-${scene}.webp` : "/landing-previews/gambling-wheel.jpg";
  return kind === "landing-scene" || kind === "playable" ? `/playable/previews/scene-${scene}.webp` : MECHANIC[kind]!.preview;
}

/** Подпись карточки: что это за проект. */
export function projectCaption(kind: ProjectKind): string {
  if (kind === "playable") return "Плейбл";
  if (kind === "campaign") return "Кампания";
  if (kind === "landing-scene") return "Лендинг на сцене";
  return `Лендинг · ${MECHANIC[kind]!.label}`;
}

const idKey = (draftKey: string) => `${draftKey}__project`;
const newId = () => `prj_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** «Новый»/сброс в редакторе: следующее скачивание — уже другой проект. */
export function forgetProject(draftKey: string) {
  try {
    window.localStorage.removeItem(idKey(draftKey));
  } catch {
    /* хранилище недоступно */
  }
}

export type SaveResult = "saved" | "unavailable" | "error";

/**
 * Сохранить проект из черновика редактора. Черновик пишется с задержкой
 * (~500 мс после правки), поэтому читаем его чуть позже — уже свежим.
 */
export async function saveProject(o: {
  kind: ProjectKind;
  scene?: string;
  name: string;
  uid: string | null | undefined;
  /** Данные проекта, если они не только в черновике редактора (кампания: бриф + графика). */
  data?: () => Promise<unknown>;
}): Promise<SaveResult> {
  if (!o.uid) return "unavailable"; // гостю сохранять некуда
  await new Promise((r) => setTimeout(r, 700));
  const draftKey = projectDraftKey(o.kind, o.scene);
  let data: unknown;
  let id: string;
  try {
    if (o.data) data = await o.data();
    else {
      const raw = window.localStorage.getItem(draftKey);
      if (!raw) return "error";
      data = JSON.parse(raw);
    }
    if (!data) return "error";
    id = window.localStorage.getItem(idKey(draftKey)) || newId();
  } catch {
    return "error";
  }
  const res = await apiFetch("/api/projects", {
    method: "PUT",
    json: { project: { id, kind: o.kind, scene: o.scene ?? "", name: o.name.trim().slice(0, 200), data } },
  }).catch(() => null);
  if (!res) return "error";
  if (res.status === 503) return "unavailable";
  if (!res.ok) return "error";
  try {
    window.localStorage.setItem(idKey(draftKey), id);
    const ws = readActiveWorkspaceId(o.uid);
    if (ws) tagProjectWorkspace(o.uid, id, ws);
  } catch {
    /* id не запомнили — следующее скачивание создаст новую запись */
  }
  return "saved";
}

export type ProjectMeta = { id: string; kind: ProjectKind; scene: string; name: string; createdAt: string; updatedAt: string; deleted: boolean };

/** Список для истории; null — таблицы ещё нет или сеть упала. */
export async function listProjects(): Promise<ProjectMeta[] | null> {
  const res = await apiFetch("/api/projects").catch(() => null);
  if (!res || !res.ok) return null;
  const body = (await res.json().catch(() => null)) as { projects?: ProjectMeta[] } | null;
  return (body?.projects ?? []).filter((p) => PROJECT_KINDS.includes(p.kind));
}

/** Подготовить редактор к открытию проекта; вернуть, куда перейти. */
export async function openProject(id: string): Promise<string> {
  const res = await apiFetch(`/api/projects?id=${encodeURIComponent(id)}`);
  const body = (await res.json().catch(() => null)) as { project?: { kind: ProjectKind; scene: string; data: unknown }; error?: string } | null;
  if (!res.ok || !body?.project) throw new Error(body?.error || "Не удалось открыть проект");
  const { kind, scene, data } = body.project;
  const draftKey = projectDraftKey(kind, scene);
  if (kind === "campaign") {
    const c = data as { brief?: unknown; art?: unknown };
    try {
      window.localStorage.setItem(draftKey, JSON.stringify(c.brief ?? {}));
      window.localStorage.setItem(idKey(draftKey), id);
    } catch {
      throw new Error("Браузер не дал сохранить черновик — проверьте место или настройки cookie");
    }
    const { idbSet } = await import("./idbStore");
    await idbSet(CAMPAIGN_ART_KEY, c.art ?? undefined);
    return "/campaign";
  }
  try {
    window.localStorage.setItem(draftKey, JSON.stringify(data));
    window.localStorage.setItem(idKey(draftKey), id);
  } catch {
    throw new Error("Браузер не дал сохранить черновик — проверьте место или настройки cookie");
  }
  if (kind === "landing-scene") return `/landing/scene?pick=scene-${scene}`;
  if (kind === "playable") {
    try {
      window.localStorage.setItem(PLAYABLE_PICK_KEY, `scene-${scene}`);
    } catch {
      /* выбор сцены придёт из ссылки */
    }
    return `/playable?pick=scene-${scene}`;
  }
  return MECHANIC[kind]!.route;
}

export async function patchProject(id: string, patch: { name?: string; deleted?: boolean }) {
  await apiFetch("/api/projects", { method: "PATCH", json: { id, ...patch } }).catch(() => null);
}
export async function deleteProject(id: string) {
  await apiFetch(`/api/projects?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
}
