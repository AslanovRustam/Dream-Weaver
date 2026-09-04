"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Loader2, Monitor, Smartphone, Sparkles, X } from "lucide-react";

import { CrashGame } from "@/components/CrashGame";
import { bgPreset, characterPreset, removeBackground } from "@/lib/landingCreative";
import { downloadText, slugify } from "@/lib/download";
import { buildCrashHtml } from "@/lib/crashExport";
import { apiFetch } from "@/lib/api-client";
import { CostMeter } from "@/components/CostMeter";

// One-click themes: set background scene, character, accent and headline together.
const THEMES: {
  id: string;
  label: string;
  accent: string;
  headline: string;
  bg: string;
  char: string;
}[] = [
  {
    id: "cyber",
    label: "Киберпанк",
    accent: "#ef4444",
    headline: "УСПЕЙ ЗАБРАТЬ!",
    bg: "неоновый киберпанк-фон: фиолетово-циановое свечение, геометрические параллелограммы, голографический UI, тёмная база",
    char: "кибер-девушка в неоновой экипировке, наушники, футуристичный стиль",
  },
  {
    id: "space",
    label: "Космос",
    accent: "#22d3ee",
    headline: "TO THE MOON",
    bg: "космос: звёздное небо, туманности, планеты, летящая ракета, неоновое сияние",
    char: "мультяшный космонавт-маскот в скафандре, оптимистичная поза, большой шлем",
  },
  {
    id: "vegas",
    label: "Вегас",
    accent: "#eab308",
    headline: "CASH OUT NOW",
    bg: "ночной Лас-Вегас: неоновые вывески, золотые огни, ретро-казино маркиза, блеск и роскошь",
    char: "мультяшный крупье в смокинге с бабочкой, обаятельная уверенная поза",
  },
  {
    id: "cartoon",
    label: "Мультяшный",
    accent: "#f97316",
    headline: "CATCH THE WIN!",
    bg: "яркий мультяшный лес: зелёные холмы, деревья, голубое небо с облаками, парящие золотые монеты",
    char: "мультяшный кролик-маскот с бейсбольной битой, дружелюбный, динамичная поза",
  },
];

export function CrashLandingApp() {
  const [brand, setBrand] = useState("Fairspin");
  const [headline, setHeadline] = useState("УСПЕЙ ЗАБРАТЬ!");
  const [accent, setAccent] = useState("#ef4444");
  const [dark, setDark] = useState(true);
  const [ctaText, setCtaText] = useState("СТАРТ");
  const [theme, setTheme] = useState(
    "неоновый киберпанк-фон: фиолетово-циановое свечение, геометрические параллелограммы, голографический UI, тёмная база",
  );
  const [bgImage, setBgImage] = useState("");
  const [chars, setChars] = useState<{ left: string; right: string }>({ left: "", right: "" });
  const [charPrompts, setCharPrompts] = useState<{ left: string; right: string }>({
    left: "кибер-девушка в неоновой экипировке, наушники, футуристичный стиль",
    right: "",
  });
  const [charGenning, setCharGenning] = useState<"left" | "right" | null>(null);
  const [won, setWon] = useState<{ win: boolean; mult: string } | null>(null);
  const [spinSignal, setSpinSignal] = useState(0);
  const [viewport, setViewport] = useState<"desktop" | "portrait" | "landscape">("desktop");
  const [genning, setGenning] = useState(false);
  const [genError, setGenError] = useState("");
  const [costUsd, setCostUsd] = useState(0);

  const [restored, setRestored] = useState(false);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("dw_crash_draft");
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
      };
      try {
        window.localStorage.setItem("dw_crash_draft", JSON.stringify(data));
      } catch {
        try {
          window.localStorage.setItem(
            "dw_crash_draft",
            JSON.stringify({ ...data, bgImage: "", charLeft: "", charRight: "" }),
          );
        } catch {
          /* ignore */
        }
      }
    }, 500);
    return () => window.clearTimeout(id);
  }, [restored, brand, headline, accent, dark, ctaText, theme, bgImage, chars, charPrompts]);

  const applyTheme = (t: (typeof THEMES)[number]) => {
    setAccent(t.accent);
    setHeadline(t.headline);
    setTheme(t.bg);
    setCharPrompts((p) => ({ ...p, left: t.char }));
  };

  const genImage = async (payload: Record<string, unknown>): Promise<string> => {
    const res = await apiFetch("/api/generate-email-hero", { method: "POST", json: payload });
    const data = await res.json();
    if (!res.ok || !data.imageUrl) {
      throw new Error([data?.error || "Не удалось сгенерировать", data?.detail].filter(Boolean).join(" — "));
    }
    if (typeof data.costUsd === "number") setCostUsd((c) => c + data.costUsd);
    return data.imageUrl as string;
  };

  const generateBg = async () => {
    setGenning(true);
    setGenError("");
    try {
      setBgImage(await genImage({ presetTemplate: bgPreset(theme), feature: "landing-bg" }));
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
      const raw = await genImage({ presetTemplate: characterPreset(prompt), aspectRatio: "3:4", feature: "landing-character" });
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
          <h1 className="ds-h1 mt-1">Crash-игра</h1>
          <p className="ds-body mt-2 text-muted-foreground">
            Геймифицированный лендинг: множитель растёт — успей забрать до краха, ведите на регистрацию.
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
              value={/^#[0-9a-fA-F]{6}$/.test(accent) ? accent : "#ef4444"}
              onChange={(e) => setAccent(e.target.value)}
              aria-label="Акцент игры"
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
          {costUsd > 0 ? <div className="mt-2"><CostMeter total={costUsd} /></div> : null}
        </div>

        {/* Characters (optional) */}
        <div className="rounded-xl border border-border bg-background/40 p-3">
          <label className="ds-h4">
            Персонажи{" "}
            <span className="ds-caption font-normal normal-case tracking-normal">
              (опционально, по бокам игры)
            </span>
          </label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {renderCharSlot("left", "Слева")}
            {renderCharSlot("right", "Справа")}
          </div>
        </div>

        <Field label="Кнопка">
          <input className={inputCls} value={ctaText} onChange={(e) => setCtaText(e.target.value)} />
        </Field>

        <button
          type="button"
          onClick={() =>
            downloadText(
              `${slugify(brand, "crash")}-crash.html`,
              buildCrashHtml({
                brand,
                headline,
                accent,
                dark,
                ctaText,
                bgImage,
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
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-black/40" />

          {(["left", "right"] as const).map((side) =>
            chars[side] ? (
              <img
                key={side}
                src={chars[side]}
                alt=""
                className={`pointer-events-none absolute z-20 object-contain object-bottom drop-shadow-[0_10px_22px_rgba(0,0,0,0.55)] ${
                  viewport === "portrait" ? "h-[84%] max-w-[56%]" : "h-full max-w-[46%]"
                }`}
                style={{
                  [side]: viewport === "portrait" ? "-1%" : "-4%",
                  bottom: viewport === "portrait" ? "-7%" : "-9%",
                }}
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
              {headline || "УСПЕЙ ЗАБРАТЬ!"}
            </h2>

            <div
              className={`relative mt-3 flex w-full flex-1 justify-center ${
                viewport === "portrait" ? "items-start pt-2" : "items-center"
              }`}
            >
              <div className="relative z-10 mx-auto flex h-full w-full max-w-[420px] items-center justify-center">
                <CrashGame
                  accent={accent}
                  spinSignal={spinSignal}
                  startLabel={ctaText || "СТАРТ"}
                  onResult={(win, mult) => setWon({ win, mult })}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSpinSignal((s) => s + 1)}
              className="relative z-30 mb-1 mt-2 w-[82%] max-w-[380px] rounded-full py-3 text-center text-lg font-extrabold uppercase tracking-wide text-white shadow-lg transition active:scale-95"
              style={{ background: `linear-gradient(180deg, ${accent}, ${accent}cc)` }}
            >
              {ctaText || "СТАРТ"}
            </button>
          </div>

          {/* Win / crash modal */}
          {won !== null ? (
            <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 p-6">
              <div className="relative w-full max-w-xs rounded-2xl bg-white p-6 text-center shadow-2xl">
                {won.win ? (
                  <>
                    <p className="text-lg font-extrabold text-[#0f172a]">🚀 Забрал вовремя!</p>
                    <p className="mt-1 text-3xl font-extrabold" style={{ color: accent }}>
                      ×{won.mult}
                    </p>
                    <p className="mt-1 text-sm text-[#475569]">Отличный кэшаут — забирайте бонус!</p>
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
                    <p className="text-lg font-extrabold text-[#0f172a]">💥 Разбилось на ×{won.mult}</p>
                    <p className="mt-1 text-sm text-[#475569]">
                      Чуть не успел — попробуйте ещё раз и заберите вовремя!
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
                      Ещё раз
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
