"use client";

// Блоки главной: мозаика работ в герое, инструменты с живыми превью, «один
// мастер — все площадки» и проверка перед модерацией. Картинки — настоящие
// результаты генераторов (public/previews, landing-previews, playable/previews).
// Всё декоративное — aria-hidden; движение выключается при reduced-motion.
import Link from "next/link";
import { ArrowRight, Check, Gamepad2, Gift, Languages, LayoutTemplate, Mail, Play, Plus, ShieldCheck, Sparkles, Stamp, TriangleAlert } from "lucide-react";

import { totalSizesCount } from "@/lib/bannerSizes";
import { useT, useTx } from "@/lib/i18n";
import { isSectionEnabled } from "@/lib/mvp";
import { SECTION_BY_ID, sectionEntryRoute, type Section } from "@/lib/sections";

export const HOME_ANIM = `
@keyframes homeFloat { from { transform: translateY(0) rotate(var(--r, 0deg)); } to { transform: translateY(-10px) rotate(var(--r, 0deg)); } }
.home-float { transform: rotate(var(--r, 0deg)); animation: homeFloat var(--t, 6s) ease-in-out var(--d, 0s) infinite alternate; }
@keyframes homeShine { 0% { transform: translateX(-120%) skewX(-18deg); } 55%, 100% { transform: translateX(260%) skewX(-18deg); } }
.home-shine::after { content: ""; position: absolute; inset: 0; width: 40%; background: linear-gradient(90deg, transparent, rgba(255,255,255,.55), transparent); animation: homeShine 2.6s ease-in-out infinite; }
@keyframes homeKen { from { transform: scale(1); } to { transform: scale(1.14) translateY(-3%); } }
.home-ken { animation: homeKen 7s ease-in-out infinite alternate; }
@keyframes homeBar { from { transform: scaleX(0); } to { transform: scaleX(1); } }
.home-bar { transform-origin: left; animation: homeBar 7s linear infinite; }
@media (prefers-reduced-motion: reduce) {
  .home-float, .home-ken, .home-bar { animation: none; }
  .home-shine::after { display: none; }
}
`;

/** Телефон с превью 9:16 (анимированный WebP лендинга или плейбла). */
function Phone({ src, className = "", rounded = "rounded-[22px]" }: { src: string; className?: string; rounded?: string }) {
  return (
    <span className={`block border-[5px] border-[#0b0b10] bg-[#0b0b10] shadow-[0_30px_70px_-25px_rgba(0,0,0,0.95)] ring-1 ring-white/10 ${rounded} ${className}`}>
      <span className="block aspect-[240/427] overflow-hidden rounded-[17px]">
        <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" draggable={false} />
      </span>
    </span>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="mt-2 block text-center ds-micro uppercase tracking-wide text-hint">{children}</span>;
}

/** Мини-карточка проверки перед модерацией (для мозаики и блока модерации). */
function CheckCard({ big = false }: { big?: boolean }) {
  const t = useT();
  const rows = big ? (["r1", "r2", "r3", "r4"] as const) : (["r1", "r2", "r3"] as const);
  return (
    <div className={`rounded-2xl border border-white/10 bg-[rgba(17,17,24,0.88)] p-4 shadow-[0_30px_70px_-25px_rgba(0,0,0,0.95)] backdrop-blur-md ${big ? "" : "w-[250px]"}`}>
      {big ? (
        <span className="relative mb-3 block aspect-[3/2] overflow-hidden rounded-lg border border-white/10">
          <img src="/previews/preset20.webp" alt="" className="h-full w-full object-cover" loading="lazy" />
          <span className="absolute bottom-1.5 left-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">18+ · Glücksspiel kann süchtig machen</span>
        </span>
      ) : null}
      <div className="flex items-center gap-2 text-sm font-semibold">
        <ShieldCheck className="h-4 w-4 text-accent-green" />
        {t("hub.check.title")}
      </div>
      <div className="mt-1 text-xs text-hint">{t("hub.check.geo")}</div>
      <ul className="mt-3 flex flex-col gap-1.5 text-xs">
        {rows.map((r) => (
          <li key={r} className="flex items-start gap-1.5">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-green" />
            <span className="text-muted-foreground">{t(`hub.check.${r}`)}</span>
          </li>
        ))}
        {big ? (
          <li className="flex items-start gap-1.5">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
            <span>
              <span className="text-foreground">{t("hub.check.warn")}</span>
              <span className="mt-0.5 block text-hint">{t("hub.check.fix")}</span>
            </span>
          </li>
        ) : null}
      </ul>
      {big ? null : (
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[var(--lime-tint)] px-2.5 py-1 text-xs font-semibold text-accent-green">
          <Check className="h-3.5 w-3.5" /> {t("hub.check.ok")}
        </div>
      )}
    </div>
  );
}

/** Правая часть героя: телефоны с лендингом и плейблом, баннер и проверка. */
export function HeroMosaic() {
  const t = useT();
  return (
    <>
      <div aria-hidden className="pointer-events-none relative hidden h-[600px] lg:block">
        <span className="home-float absolute left-[37%] top-[11%] w-[150px] opacity-90" style={{ "--r": "2deg", "--t": "7s", "--d": "-2s" } as React.CSSProperties}>
          <Phone src="/landing-previews/gambling-crash.anim.webp" />
        </span>
        <span className="home-float absolute left-[4%] top-[3%] w-[180px]" style={{ "--r": "-5deg", "--t": "6s" } as React.CSSProperties}>
          <Phone src="/landing-previews/gambling-wheel.anim.webp" />
          <Tag>{t("hub.mosaic.landing")}</Tag>
        </span>
        <span className="home-float absolute right-[6%] top-0 w-[170px]" style={{ "--r": "5deg", "--t": "6.5s", "--d": "-1s" } as React.CSSProperties}>
          <Phone src="/playable/previews/scene-aviator.anim.webp" />
          <Tag>{t("hub.mosaic.playable")}</Tag>
        </span>
        <span className="home-float absolute bottom-[1%] left-[2%] z-10 w-[290px]" style={{ "--r": "-1.5deg", "--t": "8s", "--d": "-3s" } as React.CSSProperties}>
          <span className="home-shine relative block aspect-[3/2] overflow-hidden rounded-xl border border-white/10 shadow-[0_30px_70px_-25px_rgba(0,0,0,0.95)]">
            <img src="/previews/preset1.webp" alt="" className="h-full w-full object-cover" draggable={false} />
          </span>
          <Tag>{t("hub.mosaic.banner")}</Tag>
        </span>
        <span className="home-float absolute bottom-[5%] right-0 z-20" style={{ "--r": "1deg", "--t": "7.5s", "--d": "-4s" } as React.CSSProperties}>
          <CheckCard />
        </span>
      </div>

      {/* Телефон и планшет: те же работы лентой под полем ТЗ. */}
      <div aria-hidden className="grid grid-cols-3 gap-3 lg:hidden">
        <Phone src="/landing-previews/gambling-wheel.anim.webp" rounded="rounded-[18px]" />
        <Phone src="/playable/previews/scene-aviator.anim.webp" rounded="rounded-[18px]" />
        <Phone src="/landing-previews/gambling-crash.anim.webp" rounded="rounded-[18px]" />
      </div>
    </>
  );
}

// ---- Инструменты -----------------------------------------------------------

type ToolId = "bannerLayers" | "gif" | "videoAd" | "landing" | "playable" | "email";
const TOOLS: ToolId[] = ["bannerLayers", "gif", "videoAd", "landing", "playable", "email"];
const NEW_TOOL: ToolId = "videoAd";

function ToolVisual({ id }: { id: ToolId }) {
  switch (id) {
    case "bannerLayers":
      return (
        <div className="flex h-full items-center justify-center gap-2.5 p-4">
          <span className="block aspect-[3/2] h-[78%] overflow-hidden rounded-lg border border-white/10">
            <img src="/previews/preset14.webp" alt="" className="h-full w-full object-cover" loading="lazy" />
          </span>
          <span className="flex h-[78%] flex-col gap-2.5">
            <span className="block aspect-square h-[46%] overflow-hidden rounded-md border border-white/10">
              <img src="/previews/preset14.webp" alt="" className="h-full w-full object-cover" loading="lazy" />
            </span>
            <span className="block aspect-[9/16] min-h-0 flex-1 overflow-hidden rounded-md border border-white/10">
              <img src="/previews/preset14.webp" alt="" className="h-full w-full object-cover object-[30%_50%]" loading="lazy" />
            </span>
          </span>
        </div>
      );
    case "gif":
      return (
        <div className="flex h-full items-center justify-center p-4">
          <span className="home-shine relative block aspect-[3/2] h-[80%] overflow-hidden rounded-lg border border-white/10">
            <img src="/previews/preset20.webp" alt="" className="h-full w-full object-cover" loading="lazy" />
            <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">GIF · ≤150 KB</span>
          </span>
        </div>
      );
    case "videoAd":
      return (
        <div className="flex h-full items-center justify-center gap-3 p-4">
          <span className="relative block aspect-[9/16] h-[86%] overflow-hidden rounded-xl border-[4px] border-[#0b0b10] ring-1 ring-white/10">
            <img src="/previews/preset4.webp" alt="" className="home-ken h-full w-full object-cover" loading="lazy" />
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/55 backdrop-blur">
                <Play className="h-4 w-4 fill-white text-white" />
              </span>
            </span>
            <span className="absolute inset-x-2 bottom-2 h-1 overflow-hidden rounded-full bg-white/25">
              <span className="home-bar block h-full w-full bg-accent-green" />
            </span>
          </span>
          <span className="flex flex-col gap-1.5 text-[10px] font-semibold text-hint">
            {["9:16", "4:5", "1:1", "16:9"].map((r) => (
              <span key={r} className="rounded border border-border px-1.5 py-0.5">
                {r}
              </span>
            ))}
          </span>
        </div>
      );
    case "landing":
      return (
        <div className="flex h-full items-end justify-center gap-3 px-4 pt-4">
          <Phone src="/landing-previews/gambling-wheel.anim.webp" className="w-[30%] translate-y-[18%]" rounded="rounded-[16px]" />
          <Phone src="/landing-previews/gambling-slot-machine.anim.webp" className="w-[30%] translate-y-[8%]" rounded="rounded-[16px]" />
        </div>
      );
    case "playable":
      return (
        <div className="flex h-full items-end justify-center gap-3 px-4 pt-4">
          <Phone src="/playable/previews/scene-plinko.anim.webp" className="w-[30%] translate-y-[8%]" rounded="rounded-[16px]" />
          <Phone src="/playable/previews/scene-scratch.anim.webp" className="w-[30%] translate-y-[18%]" rounded="rounded-[16px]" />
        </div>
      );
    case "email":
      return (
        <div className="flex h-full items-center justify-center p-4">
          <span className="flex h-[86%] w-[62%] flex-col overflow-hidden rounded-lg border border-white/10 bg-[#f4f4f6]">
            <span className="block h-[46%] overflow-hidden">
              <img src="/previews/preset7.webp" alt="" className="h-full w-full object-cover" loading="lazy" />
            </span>
            <span className="flex flex-1 flex-col gap-1.5 p-2.5">
              <span className="h-2 w-3/4 rounded bg-[#1b1b22]/80" />
              <span className="h-1.5 w-full rounded bg-[#1b1b22]/25" />
              <span className="h-1.5 w-5/6 rounded bg-[#1b1b22]/25" />
              <span className="mt-auto h-4 w-1/2 self-center rounded bg-[#C6FF3D]" />
            </span>
          </span>
        </div>
      );
  }
}

export function ToolsGrid() {
  const t = useT();
  const tx = useTx();
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {TOOLS.map((id) => {
        const sec = SECTION_BY_ID.get(id as Section["id"]);
        if (!sec) return null;
        const soon = !isSectionEnabled(id);
        const title = tx(`sections.${id}.title`, sec.title);
        const Icon = id === "email" ? Mail : sec.icon;
        const body = (
          <>
            <div aria-hidden className="relative h-44 overflow-hidden border-b border-border bg-[radial-gradient(120%_90%_at_50%_0%,rgba(124,92,255,0.18),transparent_60%)]">
              <ToolVisual id={id} />
            </div>
            <div className="flex flex-1 flex-col p-4">
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-accent-green" />
                <h3 className="font-semibold">{title}</h3>
                {id === NEW_TOOL ? (
                  <span className="rounded-full bg-accent-green px-1.5 py-0.5 text-[10px] font-bold uppercase text-on-accent">{t("hub.tools.new")}</span>
                ) : null}
                {soon ? (
                  <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-hint">{t("common.soon")}</span>
                ) : null}
              </div>
              <p className="mt-1.5 text-sm text-muted-foreground">{t(`hub.tools.items.${id}`)}</p>
              {soon ? null : (
                <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-accent-green">
                  {t("hub.tools.open")}
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </span>
              )}
            </div>
          </>
        );
        const cls =
          "group flex flex-col overflow-hidden rounded-2xl border border-border bg-[var(--bg-surface)] text-left transition-all";
        return soon ? (
          <div key={id} aria-disabled="true" className={`${cls} opacity-60`}>
            {body}
          </div>
        ) : (
          <Link
            key={id}
            href={sectionEntryRoute(sec)}
            className={`${cls} hover:-translate-y-1 hover:border-accent-green/50 hover:shadow-[0_18px_54px_-18px_rgba(198,255,61,0.30)]`}
          >
            {body}
          </Link>
        );
      })}
    </div>
  );
}

// ---- Один мастер — все площадки -------------------------------------------

// Настоящие ресайзы мастера Candy Rush (3:2 — сам мастер, previews/preset2):
// тот же путь, что в продукте — i2i под пропорцию площадки, кроп до размера.
const FORMAT_BOXES: { key: string; r: string; ratio: number; src: string }[] = [
  { key: "feed", r: "1:1", ratio: 1, src: "/home/formats/candy-1x1.webp" },
  { key: "portrait", r: "4:5", ratio: 4 / 5, src: "/home/formats/candy-4x5.webp" },
  { key: "stories", r: "9:16", ratio: 9 / 16, src: "/home/formats/candy-9x16.webp" },
  { key: "youtube", r: "16:9", ratio: 16 / 9, src: "/home/formats/candy-16x9.webp" },
  { key: "display", r: "3:2", ratio: 3 / 2, src: "/home/formats/candy-3x2.webp" },
  { key: "sidebar", r: "2:3", ratio: 2 / 3, src: "/home/formats/candy-2x3.webp" },
];

export function FormatsBlock() {
  const t = useT();
  return (
    <div className="grid items-center gap-8 lg:grid-cols-[0.9fr_1.1fr]">
      <div>
        <p className="ds-overline ds-overline-accent">{t("hub.formats.overline")}</p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{t("hub.formats.title", { n: totalSizesCount() })}</h2>
        <p className="mt-3 max-w-md text-muted-foreground">{t("hub.formats.body")}</p>
        <ul className="mt-5 flex flex-wrap gap-2 text-xs">
          {(["gif", "video", "landing"] as const).map((k) => (
            <li key={k} className="rounded-full border border-border px-3 py-1.5 text-muted-foreground">
              {t(`hub.formats.chips.${k}`)}
            </li>
          ))}
        </ul>
      </div>
      <div aria-hidden className="flex flex-wrap items-end justify-center gap-3 rounded-2xl border border-border bg-[var(--bg-surface)] p-4 sm:p-6">
        {FORMAT_BOXES.map((f) => (
          <span key={f.key} className="flex flex-col items-center">
            <span
              className="relative block h-24 overflow-hidden rounded-lg border border-white/10 sm:h-32"
              style={{ aspectRatio: String(f.ratio) }}
            >
              <img src={f.src} alt="" className="h-full w-full object-cover" loading="lazy" />
              <span className="absolute left-1 top-1 rounded bg-black/65 px-1 text-[10px] font-semibold text-white">{f.r}</span>
            </span>
            <span className="mt-1.5 max-w-[9rem] text-center text-[11px] leading-tight text-hint">{t(`hub.formats.boxes.${f.key}`)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ---- Проверка перед модерацией --------------------------------------------

export function ModerationBlock() {
  const t = useT();
  return (
    <div className="grid items-center gap-8 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="order-2 lg:order-1">
        <div className="mx-auto max-w-sm">
          <CheckCard big />
        </div>
      </div>
      <div className="order-1 lg:order-2">
        <p className="ds-overline ds-overline-accent">{t("hub.moderation.overline")}</p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{t("hub.moderation.title")}</h2>
        <p className="mt-3 max-w-md text-muted-foreground">{t("hub.moderation.body")}</p>
        <ul className="mt-5 flex flex-col gap-2 text-sm">
          {(["p1", "p2", "p3"] as const).map((k) => (
            <li key={k} className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent-green" />
              <span className="text-muted-foreground">{t(`hub.moderation.${k}`)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ---- Шаблон как визуал ------------------------------------------------------
// Ценность: шаблон — не рамка для текста, а готовая продающая композиция.
// Человек добавляет своё (игру, лого, оффер, язык) — модель рисует баннер
// заново, игра в главной роли, оформление — по шаблону. Дальше этот визуал
// расходится по форматам, GIF, видео и лендингу. Картинки — шаблон Candy Rush
// и его настоящие ресайзы (public/home/formats).

const TEMPLATE_KINDS = [
  { id: "preset1", kind: "casino" },
  { id: "preset4", kind: "football" },
  { id: "preset5", kind: "fight" },
  { id: "preset45", kind: "mascot" },
  { id: "preset94", kind: "pop" },
  { id: "preset35", kind: "esports" },
] as const;

const TEMPLATE_INPUTS = [
  { key: "game", icon: Gamepad2 },
  { key: "logo", icon: Stamp },
  { key: "offer", icon: Gift },
  { key: "lang", icon: Languages },
] as const;

function StepLabel({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--lime-tint)] text-[11px] text-accent-green">{n}</span>
      {children}
    </div>
  );
}

export function TemplateVisualBlock() {
  const t = useT();
  return (
    <div>
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr] lg:items-end">
        <div>
          <p className="ds-overline ds-overline-accent">{t("hub.templ.overline")}</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{t("hub.templ.title")}</h2>
        </div>
        <p className="max-w-xl text-muted-foreground lg:justify-self-end">{t("hub.templ.body")}</p>
      </div>

      {/* Шаблоны разные — спорт, единоборства, маскот, поп-арт, киберспорт.
          Каждая плитка ведёт прямо в свой шаблон. */}
      <ul className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-6">
        {TEMPLATE_KINDS.map(({ id, kind }) => (
          <li key={id}>
            <Link href={`/banner?preset=${id}`} className="group block">
              <span className="block overflow-hidden rounded-xl border border-white/10 transition group-hover:border-accent-green/60">
                <img src={`/previews/${id}.webp`} alt="" className="aspect-[3/2] w-full object-cover transition duration-500 group-hover:scale-105" loading="lazy" />
              </span>
              <span className="mt-1.5 block truncate text-xs text-muted-foreground transition group-hover:text-foreground">
                {t(`hub.templ.kinds.${kind}`)}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {/* Доказательство: один и тот же шаблон → три разные игры (настоящие
          генерации, public/home/templ). Композиция одна, игра и тема — свои. */}
      <p className="mt-10 text-sm font-semibold">{t("hub.templ.example")}</p>
      {/* Шаблон — крупно, три игры из него — колонкой справа помельче
          (на телефоне — рядом под шаблоном). Высота колонки ≈ высоте шаблона. */}
      <div className="mt-3 grid items-center gap-3 lg:grid-cols-[3fr_auto_1fr] lg:gap-4">
        <figure className="relative">
          <div className="overflow-hidden rounded-2xl border-2 border-accent-green/70 shadow-[0_0_0_6px_rgba(198,255,61,0.08),0_30px_80px_-30px_rgba(0,0,0,0.9)]">
            <img src="/home/templ/candy.webp" alt="" className="aspect-[3/2] w-full object-cover" loading="lazy" />
          </div>
          <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-lg bg-black/75 px-2.5 py-1.5 text-xs font-semibold text-white backdrop-blur sm:text-sm">
            <LayoutTemplate className="h-4 w-4 text-accent-green" />
            {t("hub.templ.oneTemplate")}
          </span>
        </figure>

        <span aria-hidden className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-accent-green text-on-accent">
          <ArrowRight className="h-4 w-4 rotate-90 lg:rotate-0" />
        </span>

        <ul className="grid grid-cols-3 gap-2 sm:gap-3 lg:grid-cols-1">
          {(["pharaoh", "viking", "neon"] as const).map((g) => (
            <li key={g} className="relative overflow-hidden rounded-xl border border-white/10">
              <img src={`/home/templ/${g}.webp`} alt="" className="aspect-[3/2] w-full object-cover transition duration-500 hover:scale-105" loading="lazy" />
              <span className="absolute bottom-1.5 left-1.5 inline-flex max-w-[calc(100%-12px)] items-center gap-1 truncate rounded-md bg-black/75 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur sm:text-[11px]">
                <Gamepad2 className="h-3 w-3 shrink-0 text-accent-green" />
                <span className="truncate">{t(`hub.templ.games.${g}`)}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <ul className="mt-5 grid gap-x-6 gap-y-3 sm:grid-cols-3">
        {(["v1", "v2", "v3"] as const).map((k) => (
          <li key={k} className="flex gap-2.5">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--lime-tint)]">
              <Check className="h-3 w-3 text-accent-green" />
            </span>
            <span className="text-sm">
              <b className="font-semibold">{t(`hub.templ.${k}.title`)}</b>
              <span className="text-muted-foreground"> — {t(`hub.templ.${k}.body`)}</span>
            </span>
          </li>
        ))}
      </ul>

      {/* Схема: шаблон → + ваше → готово (и дальше по всей кампании). */}
      <div className="mt-6 grid gap-4 rounded-2xl border border-border bg-[var(--bg-surface)] p-4 sm:p-6 lg:grid-cols-[1fr_auto_0.8fr_auto_1.2fr] lg:items-center">
        <div>
          <StepLabel n={1}>{t("hub.templ.s1")}</StepLabel>
          <div className="relative overflow-hidden rounded-xl border border-white/10">
            {/* Шаблон как «чертёж»: та же композиция, приглушённая, с зонами —
                куда встанет лого, игра, оффер и кнопка. Цветной итог — на шаге 3. */}
            <img src="/home/formats/candy-3x2.webp" alt="" className="aspect-[3/2] w-full object-cover opacity-45 grayscale" loading="lazy" />
            <div aria-hidden className="absolute inset-0">
              {(
                [
                  ["logo", "left-[30%] right-[30%] top-[4%] h-[30%]"],
                  ["hero", "left-[26%] right-[26%] top-[36%] h-[31%]"],
                  ["cta", "left-[32%] right-[32%] top-[69%] h-[16%]"],
                ] as const
              ).map(([k, pos]) => (
                <span
                  key={k}
                  className={`absolute ${pos} flex items-center justify-center rounded-md border border-dashed border-accent-green/80 bg-accent-green/10`}
                >
                  <span className="rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-semibold text-accent-green">{t(`hub.templ.zone.${k}`)}</span>
                </span>
              ))}
            </div>
            <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-black/70 px-2 py-1 text-[11px] font-semibold text-white backdrop-blur">
              <LayoutTemplate className="h-3.5 w-3.5 text-accent-green" />
              {t("hub.templ.tag")}
            </span>
          </div>
          <p className="mt-2 text-xs text-hint">{t("hub.templ.s1hint")}</p>
        </div>

        <span aria-hidden className="mx-auto flex h-9 w-9 items-center justify-center rounded-full border border-border text-accent-green">
          <Plus className="h-4 w-4" />
        </span>

        <div>
          <StepLabel n={2}>{t("hub.templ.s2")}</StepLabel>
          <ul className="flex flex-col gap-2">
            {TEMPLATE_INPUTS.map(({ key, icon: Icon }) => (
              <li key={key} className="flex items-start gap-2.5 rounded-lg border border-border bg-background/40 px-3 py-2">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-accent-green" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{t(`hub.templ.in.${key}.title`)}</span>
                  <span className="block text-xs text-hint">{t(`hub.templ.in.${key}.body`)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <span aria-hidden className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-accent-green text-on-accent">
          <ArrowRight className="h-4 w-4 rotate-90 lg:rotate-0" />
        </span>

        <div>
          <StepLabel n={3}>{t("hub.templ.s3")}</StepLabel>
          <div aria-hidden className="flex items-end gap-2">
            <span className="block aspect-[9/16] w-[22%] overflow-hidden rounded-lg border border-white/10">
              <img src="/home/formats/candy-9x16.webp" alt="" className="h-full w-full object-cover" loading="lazy" />
            </span>
            <span className="block aspect-square w-[34%] overflow-hidden rounded-lg border border-white/10">
              <img src="/home/formats/candy-1x1.webp" alt="" className="h-full w-full object-cover" loading="lazy" />
            </span>
            <span className="home-shine relative block aspect-[16/9] w-[44%] overflow-hidden rounded-lg border border-white/10">
              <img src="/home/formats/candy-16x9.webp" alt="" className="h-full w-full object-cover" loading="lazy" />
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {(["sizes", "gif", "video", "landing"] as const).map((k) => (
              <span key={k} className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground">
                {t(`hub.templ.out.${k}`)}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link
          href="/banner-layers/templates"
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent-green px-4 text-sm font-semibold text-on-accent transition hover:bg-[var(--accent-hover)] hover:shadow-glow-lime"
        >
          <Sparkles className="h-4 w-4" />
          {t("hub.templ.cta")}
        </Link>
        <span className="text-xs text-hint">{t("hub.templ.ctaNote")}</span>
      </div>
    </div>
  );
}
