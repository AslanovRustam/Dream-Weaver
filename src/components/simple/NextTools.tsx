"use client";

// «Что дальше» после результата: тот же ТЗ — в другой инструмент одним кликом.
// Понятое ТЗ и результат (картинка) уходят передачей (lib/tz/handoff): инструмент
// откроется в простом режиме и сразу запустит свой автопилот. Если ТЗ понималось
// под другой инструмент, получатель поймёт его заново под себя (бесплатно).
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";

import type { TzRunInput, TzUnderstood } from "@/lib/tz/client";
import { putTzHandoff, type TzHandoffTarget } from "@/lib/tz/handoff";

type Next = { target: TzHandoffTarget; route: string; label: string };

const ALL: Next[] = [
  { target: "banner", route: "/banner", label: "Баннер" },
  { target: "gif", route: "/gif", label: "GIF из этого баннера" },
  { target: "landing", route: "/landing", label: "Лендинг в этом стиле" },
  { target: "playable", route: "/playable", label: "Плейбл" },
  { target: "email", route: "/email", label: "Письмо под эту акцию" },
  { target: "campaign", route: "/campaign", label: "Вся кампания" },
];

export function NextTools({
  from,
  understood,
  input,
  image,
  only,
}: {
  /** Откуда — эту цель не показываем. */
  from: TzHandoffTarget;
  understood: TzUnderstood;
  input: TzRunInput;
  /** Готовая картинка (баннер) — получатель возьмёт её как источник / референс. */
  image?: string;
  /** Ограничить список целей. */
  only?: TzHandoffTarget[];
}) {
  const router = useRouter();
  const list = ALL.filter((n) => n.target !== from && (!only || only.includes(n.target)) && (n.target !== "gif" || !!image));
  if (!list.length) return null;
  return (
    <div>
      <div className="mb-1.5 text-xs text-muted-foreground">Дальше по этому ТЗ</div>
      <div className="flex flex-wrap gap-1.5">
        {list.map((n) => (
          <button
            key={n.target}
            type="button"
            onClick={async () => {
              await putTzHandoff({ target: n.target, understood, input, decided: image ? { image } : undefined });
              router.push(n.route);
            }}
            className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs transition hover:border-accent-green/60 hover:bg-accent-green/5"
          >
            {n.label} <ArrowRight className="h-3 w-3" />
          </button>
        ))}
      </div>
    </div>
  );
}
