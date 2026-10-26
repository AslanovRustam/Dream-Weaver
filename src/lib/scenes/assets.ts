// ИИ-графика сцены: какой запрос отправить за деталью и как разложить готовую
// картинку. Общее для редактора сцены (SceneStudio) и «Мне повезёт» в кампании —
// чтобы деталь, сгенерированная там и тут, выглядела и ложилась одинаково.
// Разкладка — в браузере (канвас): обрезка по видимой части, рама колеса,
// нарезка сетки символов.

import { SLOT_SYMBOLS_PRICE_CREDITS, PLAYABLE_ASSET_PRICE_CREDITS } from "../credit-estimate";
import { sliceIconGrid } from "../spriteSlice";
import { prepareBackground, prepareSprite, prepareWheelFrame, type FrameArt } from "./art";
import type { ScenePart } from "./presets";

/**
 * Стиль для ИИ — только из темы, без готовых палитр: пресеты перекрашивали
 * любую тему в своё золото или неон. Один на все детали сцены.
 */
export function sceneAiStyle(theme: string): string {
  return `materials, colour palette, lighting and mood taken from the theme "${theme}" — do NOT default to generic casino gold or rubies unless the theme itself asks for it; every asset of this game shares this look`;
}

export type ScenePartRequest = { route: string; body: Record<string, unknown>; credits: number };

/** Запрос за деталью: символы — одной сеткой 3×2, остальное — роутом деталей сцены. */
export function scenePartRequest(part: ScenePart, style: string, theme: string): ScenePartRequest {
  const th = theme.trim();
  if (part.kind === "symbols") {
    return {
      route: "/api/generate-slot-symbols",
      body: {
        prompt: [part.subject, `STYLE (shared by the whole game): ${style}.`, th ? `THEME: ${th}.` : ""].filter(Boolean).join(" "),
        count: 6,
      },
      credits: SLOT_SYMBOLS_PRICE_CREDITS,
    };
  }
  return {
    route: "/api/generate-playable-asset",
    body: { kind: part.kind, style, theme: th, ...(part.subject ? { subject: part.subject } : {}), ...(part.person ? { person: true } : {}) },
    credits: PLAYABLE_ASSET_PRICE_CREDITS,
  };
}

/** Что меняет готовая деталь в конфиге сцены. */
export type ScenePatch = {
  bgImage?: string;
  reward?: string;
  symbols?: string[];
  art?: Record<string, string | FrameArt>;
};

/** Разложить картинку детали: фон — без альфы, рама — с внутренним радиусом, символы — нарезкой. */
export async function prepareScenePart(part: ScenePart, dataUrl: string): Promise<ScenePatch> {
  switch (part.kind) {
    case "scene-bg":
      return { bgImage: await prepareBackground(dataUrl) };
    case "reward":
      return { reward: await prepareSprite(dataUrl, 600) };
    case "wheel-frame":
      return { art: { frame: await prepareWheelFrame(dataUrl) } };
    case "symbols": {
      // Сетка 3×2 одним вызовом → шесть иконок.
      const tiles = await sliceIconGrid(dataUrl, 3, 2);
      return { symbols: await Promise.all(tiles.map((t) => prepareSprite(t, 256, true))) };
    }
    default: {
      const size = part.size ?? (part.kind === "wheel-pointer" ? 300 : part.kind === "wheel-hub" ? 320 : 420);
      return { art: { [part.id]: await prepareSprite(dataUrl, size, part.kind === "wheel-hub") } };
    }
  }
}

/** Наложить деталь на то, что уже есть (детали art — по ключам, остальное — заменой). */
export function mergeScenePatch<T extends { bgImage?: string; reward?: string; symbols?: string[]; art?: Record<string, unknown> }>(cur: T, patch: ScenePatch): T {
  return {
    ...cur,
    ...(patch.bgImage !== undefined ? { bgImage: patch.bgImage } : {}),
    ...(patch.reward !== undefined ? { reward: patch.reward } : {}),
    ...(patch.symbols !== undefined ? { symbols: patch.symbols } : {}),
    ...(patch.art ? { art: { ...(cur.art ?? {}), ...patch.art } } : {}),
  };
}
