"use client";

// «Применить тему»: одна кнопка под тематикой — все тексты и промпты разом.
//
// Раньше тематика подставлялась только по ✨ у каждого поля: пользователь менял
// тему, жал «Сгенерировать», а фон и персонажи рисовались по промптам прошлой
// темы. Кнопка параллельно спрашивает /api/landing-suggest по всем полям,
// которые есть у механики, и заполняет их; картинки после этого генерируются
// уже под новую тему.

import { useState } from "react";
import { Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { useAuthGate } from "@/components/AuthGate";
import { apiFetch } from "@/lib/api-client";
import type { LandingExtras, LandingKind } from "@/lib/landingKit";
import { applyBlockTexts, enabledBlocks } from "@/components/landing/LandingBlocksPicker";

type Field = "headline" | "cta" | "bg" | "character" | "icon" | "teams";

/** В теме несколько персонажей («супермен и бетмен», «Zeus vs Hades») — тогда второй встаёт справа. */
export const topicHasPair = (topic: string) =>
  /\s(и|and|vs\.?|против|&)\s|,/i.test(` ${topic.trim()} `);

const LABELS: Record<Field, string> = {
  headline: "заголовок",
  bg: "фон",
  character: "персонаж",
  icon: "иконки",
  teams: "команды",
  cta: "кнопка",
};

export function ApplyTopicButton({
  topic,
  mechanic,
  fill,
  blocks,
}: {
  topic: string;
  mechanic: "wheel" | "slot" | "crash" | "match";
  /** Какие поля заполнять и чем. Несколько вызовов одного поля — разные варианты (персонаж слева и справа). */
  fill: { field: Field; side?: "left" | "right"; set: (text: string) => void }[];
  /** Блоки лендинга: тексты отмеченных — тоже под тему (/api/landing-blocks). */
  blocks?: { extras: LandingExtras; kind: LandingKind; onExtras: (update: (x: LandingExtras) => LandingExtras) => void };
}) {
  const [busy, setBusy] = useState(false);
  const { isGuest, openGate } = useAuthGate();
  const ready = topic.trim().length > 0;

  const run = async () => {
    if (!ready || busy) return;
    if (isGuest) return openGate("Подбор по теме — после входа");
    setBusy(true);
    try {
      const ids = blocks ? enabledBlocks(blocks.extras, blocks.kind) : [];
      const blocksDone =
        blocks && ids.length
          ? apiFetch("/api/landing-blocks", {
              method: "POST",
              json: { topic, kind: blocks.kind, lang: blocks.extras.htmlLang || blocks.extras.lang, blocks: ids },
            })
              .then(async (res) => {
                const data = res.ok ? ((await res.json().catch(() => null)) as { blocks?: Record<string, Record<string, unknown>> } | null) : null;
                const got = data?.blocks ?? {};
                if (!Object.keys(got).length) return false;
                blocks.onExtras((x) => applyBlockTexts(x, got));
                return true;
              })
              .catch(() => false)
          : Promise.resolve(false);
      const done = await Promise.all(
        fill.map(async ({ field, side, set }) => {
          const res = await apiFetch("/api/landing-suggest", {
            method: "POST",
            json: { topic, field, mechanic, side },
          }).catch(() => null);
          const data =
            res && res.ok
              ? ((await res.json().catch(() => null)) as { text?: string } | null)
              : null;
          if (typeof data?.text === "string" && data.text) {
            set(data.text);
            return field;
          }
          return null;
        }),
      );
      const ok = [...new Set(done.filter((f): f is Field => !!f))].map((f) => LABELS[f]);
      if (await blocksDone) ok.push(`тексты блоков (${ids.length})`);
      if (ok.length)
        toast.success(
          `Тема применена: ${ok.join(", ")}. Теперь генерируйте картинки — они будут под новую тему.`,
        );
      else toast.error("Не удалось подобрать — попробуйте ещё раз");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void run()}
      disabled={!ready || busy}
      className="mt-2 inline-flex h-9 items-center gap-2 rounded-lg bg-accent-green px-3 text-sm font-semibold text-on-accent transition hover:bg-[var(--accent-hover)] disabled:opacity-50"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
      Применить тему
    </button>
  );
}
