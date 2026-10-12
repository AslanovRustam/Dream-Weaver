// Каталог плейблов — то, из чего начинают: премиум-сцены, готовые поводы
// (шаблоны конструктора) и пустые механики. Один список на всё: страница
// каталога /playable/templates, левая колонка редактора и скрипт, который
// снимает превью-картинки (scripts/playable-previews.mts).

import { PLAYABLE_MECHANICS, type PlayableMechanic } from "./playableGen";
import { PLAYABLE_TEMPLATES } from "./playableTemplates";
import type { SceneId } from "./scenes/build";
import { SCENES } from "./scenes/presets";

export const PLAYABLE_TEMPLATES_ROUTE = "/playable/templates";
/** Что сейчас открыто в редакторе — каталог отмечает это плиткой. */
export const PLAYABLE_PICK_KEY = "dw_playable_pick";

export type PlayableCategoryId = "premium" | "templates" | "blank";

export const PLAYABLE_CATEGORIES: { id: PlayableCategoryId; label: string; short: string }[] = [
  { id: "premium", label: "Премиум-сцены", short: "Премиум" },
  { id: "templates", label: "Готовые поводы", short: "Поводы" },
  { id: "blank", label: "С нуля", short: "С нуля" },
];

export type PlayableTarget =
  | { kind: "scene"; scene: SceneId }
  | { kind: "template"; templateId: string }
  | { kind: "mechanic"; mechanic: PlayableMechanic };

export type PlayableCatalogItem = {
  id: string;
  name: string;
  description: string;
  category: PlayableCategoryId;
  /** Превью-картинка в public/; снимается скриптом из настоящего плейбла. */
  preview: string;
  isNew?: boolean;
  target: PlayableTarget;
};

const previewOf = (id: string) => `/playable/previews/${id}.webp`;

export const PLAYABLE_CATALOG: PlayableCatalogItem[] = [
  ...SCENES.map((s) => ({
    id: `scene-${s.id}`,
    name: s.label,
    description: s.description,
    category: "premium" as const,
    preview: previewOf(`scene-${s.id}`),
    isNew: true,
    target: { kind: "scene" as const, scene: s.id },
  })),
  ...PLAYABLE_TEMPLATES.map((t) => ({
    id: `tpl-${t.id}`,
    name: t.name,
    description: t.when,
    category: "templates" as const,
    preview: previewOf(`tpl-${t.id}`),
    target: { kind: "template" as const, templateId: t.id },
  })),
  ...PLAYABLE_MECHANICS.map((m) => ({
    id: `mech-${m.id}`,
    name: m.label,
    description: m.description,
    category: "blank" as const,
    preview: previewOf(`mech-${m.id}`),
    target: { kind: "mechanic" as const, mechanic: m.id },
  })),
];

export const PLAYABLE_CATALOG_BY_ID = new Map(PLAYABLE_CATALOG.map((i) => [i.id, i]));
