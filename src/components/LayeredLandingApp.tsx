"use client";

// Конструктор лендинга из баннера по слоям: слои приходят из раздела «Слои»
// (IndexedDB, ключ dw:layeredLanding), здесь выбираются анимация появления,
// эффект и ссылка оффера; превью — живая страница, экспорт — один HTML-файл.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Download, Loader2, RotateCcw } from "lucide-react";
import type { BannerSprites } from "@/lib/bannerLayers";
import { downloadText, slugify } from "@/lib/download";
import { idbGet } from "@/lib/idbStore";
import { defaultExtras, type LandingLang } from "@/lib/landingKit";
import type { LandingVertical } from "@/lib/landingGen";
import {
  buildLayeredHeroLanding,
  HERO_EFFECTS,
  HERO_ENTRANCES,
  type HeroEffect,
  type HeroEntrance,
} from "@/lib/layeredHero";

type Saved = {
  sprites: BannerSprites;
  accent: string;
  brand: string;
  language: string;
  vertical: LandingVertical;
};

const LANGS: LandingLang[] = ["ru", "uk", "en", "es"];

function Pills<T extends string>(p: { items: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {p.items.map((it) => (
        <button
          key={it.id}
          type="button"
          onClick={() => p.onChange(it.id)}
          className={`rounded-lg border px-3 py-1.5 text-sm transition ${
            p.value === it.id ? "border-accent-green bg-accent-green/10 text-foreground" : "border-border hover:border-foreground/40"
          }`}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function LayeredLandingApp() {
  const [saved, setSaved] = useState<Saved | null | undefined>(undefined);
  const [entrance, setEntrance] = useState<HeroEntrance>("drop");
  const [effect, setEffect] = useState<HeroEffect>("casino");
  const [ctaUrl, setCtaUrl] = useState("");
  const [replay, setReplay] = useState(0);

  useEffect(() => {
    document.title = "Лендинг из слоёв — GenGO";
    idbGet<Saved>("dw:layeredLanding").then((s) => setSaved(s?.sprites?.items?.length ? s : null));
  }, []);

  const html = useMemo(() => {
    if (!saved) return "";
    const lang = (LANGS as string[]).includes(saved.language) ? (saved.language as LandingLang) : "ru";
    const kind = saved.vertical === "gambling" ? "casino" : "sport";
    return buildLayeredHeroLanding({
      sprites: saved.sprites,
      entrance,
      effect,
      accent: saved.accent,
      extras: defaultExtras(lang, kind),
      ctaUrl: ctaUrl.trim(),
      kind,
      title: saved.brand || "Promo",
    });
  }, [saved, entrance, effect, ctaUrl]);

  if (saved === undefined)
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Загружаем слои…
      </div>
    );
  if (!saved)
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-muted-foreground">
          Слоёв пока нет. Сгенерируйте баннер в разделе «Слои» и нажмите «Лендинг из слоёв».
        </p>
        <Link href="/banner-layers" className="rounded-lg bg-accent-green px-4 py-2 text-sm font-medium text-on-accent">
          Открыть «Слои»
        </Link>
      </div>
    );

  return (
    <div className="flex flex-col gap-4 p-3 lg:h-[calc(100vh-4rem-1px)] lg:flex-row lg:overflow-hidden">
      <aside className="flex shrink-0 flex-col gap-5 rounded-2xl border border-border bg-card p-4 lg:w-80 lg:overflow-y-auto">
        <div>
          <h1 className="text-base font-semibold">Лендинг из слоёв</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Первый экран собран из слоёв баннера: {saved.sprites.items.length} элементов поверх чистого фона.
          </p>
        </div>
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">Появление</h2>
          <Pills items={HERO_ENTRANCES} value={entrance} onChange={setEntrance} />
        </section>
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">Эффект</h2>
          <Pills items={HERO_EFFECTS} value={effect} onChange={setEffect} />
        </section>
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">Ссылка оффера</h2>
          <input
            value={ctaUrl}
            onChange={(e) => setCtaUrl(e.target.value)}
            placeholder="https://…"
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
        </section>
        <div className="mt-auto flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setReplay((n) => n + 1)}
            className="flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm hover:border-foreground/40"
          >
            <RotateCcw className="h-4 w-4" /> Проиграть заново
          </button>
          <button
            type="button"
            onClick={() => downloadText(`${slugify(saved.brand)}-layers.html`, html)}
            className="flex items-center justify-center gap-2 rounded-lg bg-accent-green px-4 py-2 text-sm font-medium text-on-accent"
          >
            <Download className="h-4 w-4" /> Скачать HTML
          </button>
        </div>
      </aside>
      <div className="min-h-[70vh] flex-1 overflow-hidden rounded-2xl border border-border bg-black">
        <iframe key={`${entrance}-${effect}-${replay}`} title="Превью лендинга" srcDoc={html} className="h-full min-h-[70vh] w-full" />
      </div>
    </div>
  );
}
