// Каталог плейблов — только премиум-сцены: готовая хореография, ИИ-графика,
// выгрузка под сети. Один список на всё: страница каталога
// /playable/templates, левая колонка редактора, поиск на главной и скрипт,
// который снимает превью-картинки (scripts/playable-previews.mts).

import type { SceneId } from "./scenes/build";
import { SCENES } from "./scenes/presets";

export const PLAYABLE_TEMPLATES_ROUTE = "/playable/templates";
/** Что сейчас открыто в редакторе — каталог отмечает это плиткой. */
export const PLAYABLE_PICK_KEY = "dw_playable_pick";

export type PlayableCatalogItem = {
  id: string;
  name: string;
  description: string;
  /** Превью-картинка в public/; снимается скриптом из настоящего плейбла. */
  preview: string;
  scene: SceneId;
};

export const PLAYABLE_CATALOG: PlayableCatalogItem[] = SCENES.map((s) => ({
  id: `scene-${s.id}`,
  name: s.label,
  description: s.description,
  preview: `/playable/previews/scene-${s.id}.webp`,
  scene: s.id,
}));

export const PLAYABLE_CATALOG_BY_ID = new Map(PLAYABLE_CATALOG.map((i) => [i.id, i]));
export const DEFAULT_PLAYABLE_PICK = "scene-wheel";
