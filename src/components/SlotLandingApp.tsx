"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Loader2, Monitor, Plus, Smartphone, Sparkles, Trash2, X } from "lucide-react";

import { SlotMachine } from "@/components/SlotMachine";
import { bgPreset, characterPreset, removeBackground } from "@/lib/landingCreative";
import { downloadText, slugify } from "@/lib/download";
import { buildSlotHtml } from "@/lib/slotExport";

const DEFAULT_SYMBOLS = ["🍒", "💎", "7️⃣", "🔔", "⭐", "🍋", "🍇", "🧧"];

// One-click themes: set background scene, character, accent and headline together
// so the whole landing matches a single тематика.
const THEMES: {
  id: string;
  label: string;
  accent: string;
  headline: string;
  bg: string;
  char: string;
}[] = [
  {
    id: "cartoon",
    label: "Мультяшный",
    accent: "#f97316",
    headline: "SPIN TO WIN!",
    bg: "яркий мультяшный лес: зелёные холмы, деревья, голубое небо с облаками, парящие золотые монеты",
    char: "мультяшный кролик-маскот с бейсбольной битой, дружелюбный, динамичная поза",
  },
  {
    id: "vegas",
    label: "Вегас",
    accent: "#eab308",
    headline: "JACKPOT NIGHT",
    bg: "ночной Лас-Вегас: неоновые вывески, золотые огни, ретро-казино маркиза, блеск и роскошь",
    char: "мультяшный крупье в смокинге с бабочкой, обаятельная уверенная поза",
  },
  {
    id: "beach",
    label: "Пляж",
    accent: "#06b6d4",
    headline: "LUCKY SPINS",
    bg: "тропический пляж: золотой песок, пальмы, бирюзовое море, воздушные шары, яркое летнее солнце",
    char: "мультяшный король-спасатель на пляже, корона, весёлый, шорты",
  },
  {
    id: "cyber",
    label: "Киберпанк",
    accent: "#8b5cf6",
    headline: "WIN IN CRYPT",
    bg: "неоновый киберпанк-фон: фиолетово-циановое свечение, геометрические параллелограммы, голографический UI, тёмная база",
    char: "кибер-девушка в неоновой экипировке, наушники, футуристичный стиль",
  },
  {
    id: "egypt",
    label: "Египет",
    accent: "#d97706",
    headline: "BOOK OF RICHES",
    bg: "древний Египет: золотые саркофаги, иероглифы на стенах, пирамиды вдали, тёплый песочный свет, богатство",
    char: "мультяшный фараон-маскот, золотые украшения, уверенная поза",
  },
];

export function SlotLandingApp() {
  const [brand, setBrand] = useState("Fairspin");
  const [headline, setHeadline] = useState("SPIN TO WIN!");
  const [accent, setAccent] = useState("#818cf8");
  const [dark, setDark] = useState(true);
  const [ctaText, setCtaText] = useState("SPIN");
  const [theme, setTheme] = useState(
    "неоновый киберпанк-фон: фиолетово-циановое свечение, геометрические параллелограммы, голографический UI, тёмная база",
  );
  const [bgImage, setBgImage] = useState("");
  // Two independent, optional character slots — one on each side of the machine.
  const [chars, setChars] = useState<{ left: string; right: string }>({ left: "", right: "" });
  const [charPrompts, setCharPrompts] = useState<{ left: string; right: string }>({
    left: "кибер-девушка в неоновой экипировке, наушники, футуристичный стиль",
    right: "",
  });
  const [charGenning, setCharGenning] = useState<"left" | "right" | null>(null);
  const [symbols, setSymbols] = useState<string[]>(DEFAULT_SYMBOLS);
  const [won, setWon] = useState<{ win: boolean; symbol: string } | null>(null);
  const [spinSignal, setSpinSignal] = useState(0);
  const [viewport, setViewport] = useState<"desktop" | "portrait" | "landscape">("desktop");
  const [genning, setGenning] = useState(false);
  const [genError, setGenError] = useState("");

  // Persist the whole landing (config + generated images).
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("dw_slot_draft");
      if (raw) {
        const d = JSON.parse(raw) as Record<string, unknown>;
        if (typeof d.brand === "string") setBrand(d.brand);
        if (typeof d.headline === "string") setHeadline(d.headline);
        if (typeof d.accent === "string") setAccent(d.accent);
        if (typeof d.dark === "boolean") setDark(d.dark);
        if (typeof d.ctaText === "string") setCtaText(d.ctaText);
        if (typeof d.theme === "string") setTheme(d.theme);
        if (typeof d.bgImage === "string") setBgImage(d.bgImage);
        const cl = typeof d.charLeft === "string" ? d.charLeft : "";
        const cr = typeof d.charRight === "string" ? d.charRight : "";
        if (cl || cr) setChars({ left: cl, right: cr });
        if (typeof d.charPromptLeft === "string" || typeof d.charPromptRight === "string") {
          setCharPrompts((p) => ({
            left: typeof d.charPromptLeft === "string" ? d.charPromptLeft : p.left,
            right: typeof d.charPromptRight === "string" ? d.charPromptRight : p.right,
          }));
        }
        if (Array.isArray(d.symbols) && d.symbols.length >= 3) {
          setSymbols((d.symbols as unknown[]).map((s) => String(s)));
        }
      }
    } catch {
      /* ignore */
    }
    setRestored(true);
  }, []);
  useEffect(() => {
    if (!restored) return;
    const id = window.setTimeout(() => {
      const data = {
        brand,
        headline,
        accent,
        dark,
        ctaText,
        theme,
        bgImage,
        charLeft: chars.left,
        charRight: chars.right,
        charPromptLeft: charPrompts.left,
        charPromptRight: charPrompts.right,
        symbols,
      };
      try {
        window.localStorage.setItem("dw_slot_draft", JSON.stringify(data));
      } catch {
        try {
          window.localStorage.setItem(
            "dw_slot_draft",
            JSON.stringify({ ...data, bgImage: "", charLeft: "", charRight: "" }),
          );
        } catch {
          /* ignore */
        }
      }
    }, 500);
    return () => window.clearTimeout(id);
  }, [restored, brand, headline, accent, dark, ctaText, theme, bgImage, chars, charPrompts, symbols]);

  const applyTheme = (t: (typeof THEMES)[number]) => {
    setAccent(t.accent);
    setHeadline(t.headline);
    setTheme(t.bg);
    setCharPrompts((p) => ({ ...p, left: t.char }));
  };

  const setSymbol = (i: number, value: string) =>
    setSymbols((s) => s.map((v, idx) => (idx === i ? value : v)));
  const addSymbol = () => setSymbols((s) => (s.length < 12 ? [...s, "⭐"] : s));
  const removeSymbol = (i: number) =>
    setSymbols((s) => (s.length > 3 ? s.filter((_, idx) => idx !== i) : s));

  const genImage = async (payload: Record<string, unknown>): Promise<string> => {
    const res = await fetch("/api/generate-email-hero", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || !data.imageUrl) {
      throw new Error([data?.error || "Не удалось сгенерировать", data?.detail].filter(Boolean).join(" — "));
    }
    return data.imageUrl as string;
  };

  const generateBg = async () => {
    setGenning(true);
    setGenError("");
    try {
      setBgImage(await genImage({ presetTemplate: bgPreset(theme) }));
    } catch (e) {
      setGenError(e instanceof Error ? e.message : "Ошибка запроса");
    } finally {
      setGenning(false);
    }
  };

  const generateCharacter = async (side: "left" | "right") => {
    const prompt = charPrompts[side].trim();
    if (!prompt) return;
    setCharGenning(side);
    setGenError("");
    try {
      const raw = await genImage({ presetTemplate: characterPreset(prompt), aspectRatio: "3:4" });
      const cut = await removeBackground(raw);
      setChars((c) => ({ ...c, [side]: cut }));
    } catch (e) {
      setGenError(e instanceof Error ? e.message : "Ошибка запроса");
    } finally {
      setCharGenning(null);
    }
  };

  const inputCls =
    "h-11 w-full rounded-lg border border-border bg-elevated px-3 text-sm outline-none focus:border-accent-green";

  const renderCharSlot = (side: "left" | "right", title: string) => (
    <div className="rounded-lg border border-border/60 bg-background/40 p-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground">{title}</span>
        {chars[side] ? (
          <button
            type="button"
            onClick={() => setChars((c) => ({ ...c, [side]: "" }))}
            className="text-[11px] text-muted-foreground transition hover:text-foreground"
          >
            Убрать
          </button>
        ) : null}
      </div>
      <textarea
        className={`${inputCls} min-h-[52px] resize-y py-2 text-xs`}
        rows={2}
        value={charPrompts[side]}
        onChange={(e) => setCharPrompts((p) => ({ ...p, [side]: e.target.value }))}
        placeholder="Опишите персонажа / маскота"
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => generateCharacter(side)}
          disabled={charGenning !== null || !charPrompts[side].trim()}
          className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent-green px-3 text-xs font-semibold text-on-accent transition hover:bg-[var(--accent-hover)] disabled:opacity-60"
        >
          {charGenning === side ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          {charGenning === side ? "Генерирую…" : chars[side] ? "Перегенерировать" : "Сгенерировать"}
        </button>
        {chars[side] ? (
          <img
            src={chars[side]}
            alt=""
            className="h-9 w-9 shrink-0 rounded-md border border-border bg-white/5 object-contain"
          />
        ) : null}
      </div>
    </div>
  );

  return (
    <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-6 px-4 py-8 lg:grid-cols-[minmax(0,400px)_1fr]">
      {/* ── Config ─────────────────────────────────────────── */}
      <div className="flex flex-col gap-4">
        <header>
          <Link
            href="/landing"
            className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> К шаблонам лендингов
          </Link>
          <p className="ds-overline text-accent-green">Лендинг</p>
          <h1 className="ds-h1 mt-1">Слот-машина</h1>
          <p className="ds-body mt-2 text-muted-foreground">
            Геймифицированный лендинг: крутите барабаны, ловите три в ряд, ведите на регистрацию.
          </p>
        </header>

        <div>
          <label className="mb-2 block ds-h4">Тематика</label>
          <div className="flex flex-wrap gap-2">
            {THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => applyTheme(t)}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-medium text-muted-foreground transition hover:border-accent-green/50 hover:text-foreground"
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.accent }} />
                {t.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 ds-caption">
            Задаёт фон, персонажа, цвет и заголовок под тему — затем сгенерируйте фон и персонажа.
          </p>
        </div>

        <Field label="Заголовок">
          <input className={inputCls} value={headline} onChange={(e) => setHeadline(e.target.value)} />
        </Field>
        <div className="grid grid-cols-[1fr_auto_auto] items-end gap-3">
          <Field label="Бренд">
            <input className={inputCls} value={brand} onChange={(e) => setBrand(e.target.value)} />
          </Field>
          <div>
            <label className="mb-2 block ds-h4">Акцент</label>
            <input
              type="color"
              value={/^#[0-9a-fA-F]{6}$/.test(accent) ? accent : "#818cf8"}
              onChange={(e) => setAccent(e.target.value)}
              aria-label="Акцент машины"
              className="h-11 w-11 cursor-pointer rounded-lg border border-border bg-elevated"
            />
          </div>
          <div>
            <label className="mb-2 block ds-h4">Тёмный</label>
            <div className="flex h-11 items-center">
              <button
                type="button"
                role="switch"
                aria-checked={dark}
                aria-label="Тёмный фон"
                onClick={() => setDark((v) => !v)}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                  dark ? "bg-accent-green" : "bg-white/15"
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    dark ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* AI background */}
        <div className="rounded-xl border border-accent-green/25 bg-accent-green/[0.05] p-3">
          <Field label="Сцена / персонаж (для фона)">
            <textarea
              className={`${inputCls} min-h-[70px] resize-y py-2`}
              rows={2}
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
            />
          </Field>
          <button
            type="button"
            onClick={generateBg}
            disabled={genning}
            className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent-green px-4 text-sm font-semibold text-on-accent transition hover:bg-[var(--accent-hover)] disabled:opacity-60"
          >
            {genning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {genning ? "Генерирую фон…" : bgImage ? "Перегенерировать фон" : "Сгенерировать фон (ИИ)"}
          </button>
          {bgImage ? (
            <button
              type="button"
              onClick={() => setBgImage("")}
              className="mt-2 text-xs text-muted-foreground transition hover:text-foreground"
            >
              Убрать фон
            </button>
          ) : null}
          {genError ? <p className="mt-2 text-xs text-[color:var(--status-error)]">{genError}</p> : null}
        </div>

        {/* Characters (optional) — up to two, one flanking each side */}
        <div className="rounded-xl border border-border bg-background/40 p-3">
          <label className="ds-h4">
            Персонажи{" "}
            <span className="ds-caption font-normal normal-case tracking-normal">
              (опционально, по бокам машины)
            </span>
          </label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {renderCharSlot("left", "Слева")}
            {renderCharSlot("right", "Справа")}
          </div>
        </div>

        {/* Symbols */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="ds-h4">Символы барабанов</label>
            <button
              type="button"
              onClick={addSymbol}
              className="inline-flex items-center gap-1 text-xs font-medium text-accent-green transition hover:text-[var(--accent-hover)]"
            >
              <Plus className="h-3.5 w-3.5" /> Добавить
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {symbols.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  className={`${inputCls} h-10 text-center text-lg`}
                  value={s}
                  onChange={(e) => setSymbol(i, e.target.value)}
                  placeholder="🍒"
                  maxLength={4}
                />
                <button
                  type="button"
                  onClick={() => removeSymbol(i)}
                  aria-label="Удалить символ"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:border-[var(--status-error)]/50 hover:text-[var(--status-error)]"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <p className="mt-1.5 ds-caption">Эмодзи или короткий текст. Минимум 3 символа.</p>
        </div>

        <Field label="Кнопка">
          <input className={inputCls} value={ctaText} onChange={(e) => setCtaText(e.target.value)} />
        </Field>

        <button
          type="button"
          onClick={() =>
            downloadText(
              `${slugify(brand, "slot")}-slot.html`,
              buildSlotHtml({
                brand,
                headline,
                accent,
                dark,
                ctaText,
                bgImage,
                symbols,
                charLeft: chars.left,
                charRight: chars.right,
              }),
            )
          }
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent-green px-4 text-sm font-semibold text-on-accent transition hover:bg-[var(--accent-hover)]"
        >
          <Download className="h-4 w-4" /> Скачать HTML
        </button>
      </div>

      {/* ── Live landing preview ───────────────────────────── */}
      <div className="lg:sticky lg:top-6 lg:h-fit">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="ds-caption">Предпросмотр лендинга</p>
          <div className="flex rounded-lg border border-border p-0.5">
            {(
              [
                ["desktop", Monitor, "Десктоп", ""],
                ["landscape", Smartphone, "Моб. горизонталь", "rotate-90"],
                ["portrait", Smartphone, "Моб. вертикаль", ""],
              ] as const
            ).map(([v, Icon, title, rot]) => (
              <button
                key={v}
                type="button"
                onClick={() => setViewport(v)}
                title={title}
                aria-label={title}
                className={`flex h-8 w-8 items-center justify-center rounded-md transition ${
                  viewport === v ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className={`h-4 w-4 ${rot}`} />
              </button>
            ))}
          </div>
        </div>
        <div
          className={`relative w-full overflow-hidden rounded-2xl border border-border ${
            viewport === "portrait"
              ? "mx-auto aspect-[9/16] max-w-[300px]"
              : viewport === "landscape"
                ? "aspect-[16/9]"
                : "aspect-[16/11]"
          }`}
          style={{ background: dark ? "#1a1030" : "#fde8b0" }}
        >
          {bgImage ? (
            <img src={bgImage} alt="" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div
              className="absolute inset-0"
              style={{ background: `radial-gradient(80% 70% at 50% 30%, ${accent}55, transparent), ${dark ? "#160d29" : "#ffe9a8"}` }}
            />
          )}
          {/* Darkening for legibility */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-black/40" />

          {/* Characters — anchored to the VIEWPORT bottom (crop bleeds off the edge). */}
          {(["left", "right"] as const).map((side) =>
            chars[side] ? (
              <img
                key={side}
                src={chars[side]}
                alt=""
                className={`pointer-events-none absolute bottom-0 z-20 object-contain object-bottom drop-shadow-[0_10px_22px_rgba(0,0,0,0.55)] ${
                  viewport === "portrait" ? "h-[74%] max-w-[54%]" : "h-full max-w-[42%]"
                }`}
                style={{ [side]: viewport === "portrait" ? "0%" : "-2%" }}
              />
            ) : null,
          )}

          <div className="relative z-30 flex h-full flex-col items-center px-4 py-4">
            <div className="flex w-full items-center justify-between">
              <span className="text-sm font-extrabold text-white drop-shadow">{brand || "BRAND"}</span>
              <span className="rounded-full bg-black/30 px-2 py-0.5 text-[10px] font-medium text-white/80">EN</span>
            </div>

            <h2
              className="mt-1 text-center text-2xl font-extrabold uppercase leading-none tracking-tight sm:text-3xl"
              style={{ color: "#fff", textShadow: `0 2px 0 ${accent}, 0 4px 10px rgba(0,0,0,.5)` }}
            >
              {headline || "SPIN TO WIN!"}
            </h2>

            <div
              className={`relative mt-3 flex w-full flex-1 justify-center ${
                viewport === "portrait" ? "items-start pt-2" : "items-center"
              }`}
            >
              <div className="relative z-10 mx-auto flex h-full w-full max-w-[440px] items-center justify-center">
                <SlotMachine symbols={symbols} accent={accent} spinSignal={spinSignal} onResult={(win, symbol) => setWon({ win, symbol })} />
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSpinSignal((s) => s + 1)}
              className="relative z-30 mb-1 mt-2 w-[82%] max-w-[380px] rounded-full py-3 text-center text-lg font-extrabold uppercase tracking-wide text-white shadow-lg transition active:scale-95"
              style={{ background: `linear-gradient(180deg, ${accent}, ${accent}cc)` }}
            >
              {ctaText || "SPIN"}
            </button>
          </div>

          {/* Win / try-again modal */}
          {won !== null ? (
            <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 p-6">
              <div className="relative w-full max-w-xs rounded-2xl bg-white p-6 text-center shadow-2xl">
                {won.win ? (
                  <>
                    <p className="text-lg font-extrabold text-[#0f172a]">🎉 Джекпот!</p>
                    <p className="mt-1 text-3xl">
                      {won.symbol} {won.symbol} {won.symbol}
                    </p>
                    <p className="mt-1 text-sm text-[#475569]">Три в ряд — забирайте бонус!</p>
                    <button
                      type="button"
                      onClick={() => setWon(null)}
                      className="mt-4 w-full rounded-lg py-2.5 text-sm font-bold text-white"
                      style={{ backgroundColor: accent }}
                    >
                      Забрать бонус
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-lg font-extrabold text-[#0f172a]">😅 Почти!</p>
                    <p className="mt-1 text-sm text-[#475569]">
                      В этот раз не сошлось — крутите ещё раз, джекпот ждёт!
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setWon(null);
                        setSpinSignal((n) => n + 1);
                      }}
                      className="mt-4 w-full rounded-lg py-2.5 text-sm font-bold text-white"
                      style={{ backgroundColor: accent }}
                    >
                      Крутить ещё раз
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setWon(null)}
                  aria-label="Закрыть"
                  className="absolute right-3 top-3 text-[#94a3b8] hover:text-[#0f172a]"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-2 block ds-h4">{label}</label>
      {children}
    </div>
  );
}
