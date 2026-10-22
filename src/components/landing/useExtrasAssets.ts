"use client";

// ИИ-картинки блоков лендинга — иллюстрации карточек бонусов, обложки
// «Популярных игр» и парящие объекты первого экрана — как шаги сборки.
// Ими пользуются и панель блоков (кнопки у каждого блока), и общая кнопка
// редактора «Вся графика под тему»: тема лендинга уходит в промпт каждого шага,
// чтобы бонусы, игры и объекты были в одном стиле с фоном.
//
// Ключи шагов: bonuses (все карточки одной сеткой), games, floaters; bonus-<i> — одна карточка
// (так шаги назывались раньше: задачи, поставленные до обновления, ещё могут прийти из очереди). apply раскладывает готовую картинку
// по месту (и после перезагрузки — когда серверная очередь досдала шаг).
import { useRef } from "react";
import { toast } from "sonner";

import { apiFetch } from "@/lib/api-client";
import { SLOT_SYMBOLS_PRICE_CREDITS } from "@/lib/credit-estimate";
import type { LandingExtras, LandingKind } from "@/lib/landingKit";
import { prepareSprite } from "@/lib/scenes/art";
import { sliceIconGrid } from "@/lib/spriteSlice";
import type { AssetStep } from "@/lib/useAssetRun";

const BONUS_STYLE = "glossy 3D casino promo illustration, polished gold, vivid saturated colours, soft studio light";

async function callRoute(route: string, body: Record<string, unknown>): Promise<string> {
  const res = await apiFetch(route, { method: "POST", json: body });
  const data = (await res.json()) as { imageUrl?: string; error?: string };
  if (!res.ok || !data.imageUrl) throw new Error(data.error || "Не удалось сгенерировать");
  return data.imageUrl;
}

export function useExtrasAssets({
  value,
  onChange,
  kind,
  theme = "",
}: {
  value: LandingExtras;
  onChange: (next: LandingExtras) => void;
  kind: LandingKind;
  /** Тема лендинга — в промпт каждой картинки. */
  theme?: string;
}) {
  // Последнее значение — для результатов, которые приходят позже.
  const latest = useRef(value);
  latest.current = value;
  const themeLine = theme.trim() ? ` Visual theme of the whole landing: ${theme.trim().slice(0, 300)}.` : "";

  /** Разложить готовую картинку по месту; false — ключ не наш. */
  const apply = async (key: string, dataUrl: string): Promise<boolean> => {
    if (key === "bonuses") {
      // Сетка 3×2: картинки по порядку карточек с заголовками.
      const tiles = await sliceIconGrid(dataUrl, 3, 2);
      const imgs = await Promise.all(tiles.map((t) => prepareSprite(t, 360)));
      const cur = latest.current;
      let k = 0;
      onChange({ ...cur, bonuses: { ...cur.bonuses, items: cur.bonuses.items.map((b) => (b.title.trim() && imgs[k] ? { ...b, image: imgs[k++] } : b)) } });
      return true;
    }
    if (key.startsWith("bonus-")) {
      const i = Number(key.slice(6));
      if (!Number.isFinite(i)) return false;
      const img = await prepareSprite(dataUrl, 360);
      const cur = latest.current;
      onChange({ ...cur, bonuses: { ...cur.bonuses, items: cur.bonuses.items.map((b, j) => (j === i ? { ...b, image: img } : b)) } });
      return true;
    }
    if (key === "games") {
      const tiles = await sliceIconGrid(dataUrl, 4, 2);
      const imgs = await Promise.all(tiles.map((t) => prepareSprite(t, 300)));
      const cur = latest.current;
      onChange({ ...cur, games: { ...cur.games, items: cur.games.items.map((g, i) => (imgs[i] ? { ...g, image: imgs[i] } : g)) } });
      return true;
    }
    if (key === "floaters") {
      const tiles = await sliceIconGrid(dataUrl, 3, 2);
      const imgs = await Promise.all(tiles.map((t) => prepareSprite(t, 220)));
      const cur = latest.current;
      onChange({ ...cur, look: { ...cur.look, floaters: true, floatImgs: imgs } });
      return true;
    }
    return false;
  };

  /** Шаг: на сервере (очередь) — route + body; во вкладке — тот же запрос и apply. */
  const step = (id: string, label: string, credits: number, route: string, body: Record<string, unknown>): AssetStep => ({
    id,
    label,
    credits,
    run: async () => {
      try {
        await apply(id, await callRoute(route, body));
        return true;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Не удалось сгенерировать");
        return false;
      }
    },
    server: { route, body },
  });

  /** Все карточки бонусов одной генерацией сеткой — в 4–6 раз дешевле и в одном стиле. */
  const bonusesStep = (): AssetStep | null => {
    const list = value.bonuses.items.filter((b) => b.title.trim()).slice(0, 6);
    if (!list.length) return null;
    return step("bonuses", `Иллюстрации бонусов — ${list.length} шт.`, SLOT_SYMBOLS_PRICE_CREDITS, "/api/generate-slot-symbols", {
      count: 6,
      prompt:
        `Six illustrations for ${kind === "sport" ? "sports-betting" : "casino"} bonus cards, one per tile, in this order: ` +
        list.map((b, i) => `${i + 1}) "${b.title.slice(0, 60)}" — ${b.text.slice(0, 80)}`).join("; ") +
        (list.length < 6 ? `; the remaining tiles: matching decorative bonus objects (gift box, coins, chest)` : "") +
        `. Each tile: a single iconic object that represents that bonus. ${BONUS_STYLE}, no text.${themeLine}`,
    });
  };

  const gamesStep = (): AssetStep => {
    const names = value.games.items.map((g) => g.title.trim()).filter(Boolean).slice(0, 8);
    return step("games", kind === "sport" ? "Иконки матчей — 8 штук" : "Обложки игр — 8 штук", SLOT_SYMBOLS_PRICE_CREDITS, "/api/generate-slot-symbols", {
      count: 8,
      prompt:
        (kind === "sport"
          ? `Eight sports icons for match cards, one per tile, in this order: ${names.map((n, i) => `${i + 1}) ${n}`).join("; ")}. Each tile: the ball or emblem of that sport with dynamic energy, no team logos, no text.`
          : `Eight hero symbols for online slot game covers, one per tile, in this order: ${names.map((n, i) => `${i + 1}) "${n}"`).join("; ")}. Each tile: the single iconic object or character that this game title suggests, no text.`) + themeLine,
    });
  };

  const floatStep = (): AssetStep =>
    step("floaters", "Парящие объекты — 6 штук", SLOT_SYMBOLS_PRICE_CREDITS, "/api/generate-slot-symbols", {
      count: 6,
      prompt:
        (theme.trim()
          ? `Six floating 3D decorative objects for a ${kind === "sport" ? "sports-betting" : "casino"} landing page hero that fit the theme, one per tile, all different, glossy, dynamic tilted angle, no text.`
          : kind === "sport"
            ? "Six floating 3D objects for a sports-betting landing page hero, one per tile: a football, a gold trophy cup, a gold medal, a basketball, a gold star, a stack of gold coins. Glossy, dynamic angle, no text."
            : "Six floating 3D objects for a casino landing page hero, one per tile: a red casino chip, a gold coin, an ace playing card tilted, a white dice, a sparkling diamond, a pair of cherries. Glossy, dynamic tilted angle, no text.") + themeLine,
    });

  /**
   * Всё, что включено на лендинге: бонусы с заголовками, обложки — если блок
   * игр включён, объекты — если они на первом экране (у лендинга на сцене их нет).
   */
  const allSteps = (opts: { floaters?: boolean } = {}): AssetStep[] => [
    ...(value.bonuses.on ? [bonusesStep()].filter((x): x is AssetStep => !!x) : []),
    ...(value.games.on && value.games.items.some((g) => g.title.trim()) ? [gamesStep()] : []),
    ...(opts.floaters !== false && value.look.floaters ? [floatStep()] : []),
  ];

  return { apply, bonusesStep, gamesStep, floatStep, allSteps };
}
