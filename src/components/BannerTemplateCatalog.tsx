"use client";

// Full-page banner template catalog (/banner/templates) — the entry point of
// the banner generator, mirroring the landing flow: pick a template first,
// then land in the editor (/banner?preset=<id>). This is the ONLY place with
// template search + category filtering; the in-editor PresetSidebar just
// switches between templates and links back here.
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Search, X } from "lucide-react";

import { CATEGORIES, PRESETS, type Preset } from "@/components/PresetSidebar";

const PRESET_BY_ID = new Map(PRESETS.map((p) => [p.id, p]));

const TABS = [{ id: "all", label: "Все" }, ...CATEGORIES.map((c) => ({ id: c.id, label: c.label }))];

function CatalogTile({
  preset,
  current,
  onPick,
}: {
  preset: Preset;
  current: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={`group relative flex flex-col overflow-hidden rounded-2xl border bg-[var(--bg-surface)] text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-green focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
        current
          ? "border-accent-green shadow-[0_0_30px_rgba(198,255,61,0.16)]"
          : "border-border hover:border-accent-green/40 hover:bg-[var(--bg-surface-hover)]"
      }`}
    >
      <div
        className="aspect-[4/3] w-full bg-cover bg-center"
        style={
          preset.preview
            ? { backgroundImage: `url(${preset.preview})`, backgroundColor: "#0b0d12" }
            : { background: preset.gradient }
        }
      />
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="text-sm font-medium leading-snug">{preset.name}</p>
        <p className="line-clamp-2 ds-caption">{preset.description}</p>
        <span className="mt-auto inline-flex items-center gap-1 pt-2 text-xs font-medium text-accent-green opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
          {current ? "Открыть" : "Выбрать"}
          <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </div>
      {preset.isNew && !current ? (
        <span className="absolute left-2 top-2 rounded-full bg-accent-green px-2 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-wide text-on-accent">
          Новое
        </span>
      ) : null}
      {current ? (
        <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-accent-green px-2 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-wide text-on-accent">
          <Check className="h-3 w-3" />
          Текущий
        </span>
      ) : null}
    </button>
  );
}

export function BannerTemplateCatalog() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<string>("all");
  // The template the editor is currently on (persisted by ImageGenApp) —
  // marked so the user sees where they'd land if they just go "back".
  const [currentId, setCurrentId] = useState<string | null>(null);
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("dw_preset");
      if (stored && PRESET_BY_ID.has(stored)) setCurrentId(stored);
    } catch {
      /* ignore */
    }
  }, []);

  const q = query.trim().toLowerCase();

  const groups = useMemo(
    () =>
      CATEGORIES.filter((cat) => tab === "all" || cat.id === tab)
        .map((cat) => ({
          ...cat,
          presets: cat.presetIds
            .map((id) => PRESET_BY_ID.get(id))
            .filter((p): p is Preset => Boolean(p))
            .filter(
              (p) =>
                !q || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q),
            ),
        }))
        .filter((cat) => cat.presets.length > 0),
    [q, tab],
  );
  const total = groups.reduce((n, g) => n + g.presets.length, 0);

  const pick = (p: Preset) => {
    try {
      window.localStorage.setItem("dw_preset", p.id);
    } catch {
      /* ignore */
    }
    router.push(`/banner?preset=${encodeURIComponent(p.id)}`);
  };

  return (
    <div className="w-full bg-background text-foreground">
      <div className="mx-auto w-full max-w-7xl px-4 pt-4 pb-12 sm:px-6 sm:pt-8">
        <h1 className="sr-only">Шаблоны баннеров</h1>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="ds-overline ds-overline-accent">Шаг 1 из 2 · Шаблон</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
              Выберите шаблон баннера
            </h2>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              Сначала шаблон — потом описание, настройки и генерация. Сменить шаблон можно в любой
              момент кнопкой «К шаблонам» в редакторе.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto">
            <div className="flex h-11 w-full items-center gap-2 rounded-lg border border-border bg-elevated px-3 transition focus-within:border-accent-green focus-within:ring-1 focus-within:ring-accent-green sm:w-72">
              <Search size={16} className="shrink-0 text-muted-foreground" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Поиск по шаблонам"
                aria-label="Поиск по шаблонам"
                className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Очистить поиск"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:text-foreground"
                >
                  <X size={14} />
                </button>
              ) : null}
            </div>
            <div className="flex rounded-lg border border-border p-0.5">
              {TABS.map((t) => {
                const active = tab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    aria-pressed={active}
                    className={`flex min-h-9 flex-1 items-center justify-center rounded-md px-3 text-xs font-semibold transition sm:flex-none ${
                      active
                        ? "bg-[var(--lime-tint)] text-accent-green"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {total === 0 ? (
          <div className="mt-16 flex flex-col items-center gap-3 text-center">
            <Search className="h-8 w-8 text-muted-foreground/40" />
            <div className="space-y-1">
              <p className="text-sm font-medium">Ничего не найдено</p>
              <p className="ds-caption">
                {q ? `По запросу «${query.trim()}» шаблонов нет` : "В этой категории пока нет шаблонов"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setTab("all");
              }}
              className="rounded-lg border border-border px-3 py-1.5 text-xs transition hover:bg-white/5"
            >
              Сбросить
            </button>
          </div>
        ) : (
          <div className="mt-6 flex flex-col gap-8">
            {groups.map((g) => (
              <section key={g.id}>
                <div className="mb-3 flex items-baseline gap-2">
                  <h3 className="ds-h4">{g.label}</h3>
                  <span className="ds-caption tabular-nums">{g.presets.length}</span>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
                  {g.presets.map((p) => (
                    <CatalogTile
                      key={p.id}
                      preset={p}
                      current={p.id === currentId}
                      onPick={() => pick(p)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
