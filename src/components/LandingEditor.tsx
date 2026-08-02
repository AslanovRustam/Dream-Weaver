"use client";

// Full-page landing editor. Opened after "Сгенерировать" on the settings screen
// (which stashes the LandingInput in localStorage and routes here). Shows a large
// scrollable preview with device/orientation switching, per-language versions,
// side-panel text editing (bottom sheet on mobile), download / get-link, and
// regenerate. Generation itself is unchanged (src/lib/landingGen.ts) — this only
// changes where/how the result is shown and edited.
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type TouchEvent as ReactTouchEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Download,
  Link2,
  Loader2,
  Minus,
  Monitor,
  Plus,
  RefreshCw,
  RotateCcw,
  Smartphone,
  Type,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useConfirm } from "@/components/ui/confirm";
import { useAuth } from "@/lib/auth-context";
import {
  buildLandingHtml,
  defaultTextFor,
  normalizeLandingLang,
  LANDING_LANGS,
  LANDING_TEXT_FIELDS,
  LANDING_FONTS,
  LANDING_WEIGHTS,
  LANDING_FONT_SIZE,
  type LandingInput,
  type LandingTextField,
  type LandingTextOverrides,
  type LandingTextStyles,
  type TextStyle,
} from "@/lib/landingGen";

type Device = "desktop" | "mobile";
type Orientation = "portrait" | "landscape";

type StoredProject = {
  input: LandingInput;
  languages: string[];
  overridesByLang: Record<string, LandingTextOverrides>;
  stylesByField?: LandingTextStyles;
};

const KEY = (id: string) => `dw:landingProject:${id}`;
const langLabel = (code: string) => LANDING_LANGS.find((l) => l.code === code)?.short ?? code.toUpperCase();

export function LandingEditor({ id }: { id: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const { isAuthenticated, loading } = useAuth();

  const [input, setInput] = useState<LandingInput | null>(null);
  const [missing, setMissing] = useState(false);
  const [languages, setLanguages] = useState<string[]>([]);
  const [activeLang, setActiveLang] = useState("ru");
  const [overridesByLang, setOverridesByLang] = useState<Record<string, LandingTextOverrides>>({});
  // Typography is shared across languages (a headline's font/size/weight is the
  // same in every language version).
  const [stylesByField, setStylesByField] = useState<LandingTextStyles>({});
  const [styleField, setStyleField] = useState<LandingTextField | null>(null);

  const [device, setDevice] = useState<Device>("desktop");
  const [orientation, setOrientation] = useState<Orientation>("portrait");
  const [editOpen, setEditOpen] = useState(false);
  const [desktopFull, setDesktopFull] = useState(false);
  const [regenBusy, setRegenBusy] = useState(false);
  const [regenNonce, setRegenNonce] = useState(0);

  const initedRef = useRef(false);

  // Auth guard.
  useEffect(() => {
    if (!loading && !isAuthenticated) router.push("/login");
  }, [loading, isAuthenticated, router]);

  // Load the stashed project once.
  useEffect(() => {
    if (initedRef.current) return;
    initedRef.current = true;
    document.title = "Редактор лендинга — Dream Weaver Studio";
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(KEY(id)) : null;
      if (!raw) {
        setMissing(true);
        return;
      }
      const p = JSON.parse(raw) as StoredProject;
      if (!p || !p.input) {
        setMissing(true);
        return;
      }
      const base = p.languages && p.languages.length ? p.languages : [normalizeLandingLang(p.input.language)];
      setInput(p.input);
      setLanguages(base);
      setActiveLang(base[0]);
      setOverridesByLang(p.overridesByLang || {});
      setStylesByField(p.stylesByField || {});
      // On phones the main preview defaults to the mobile version (the desktop
      // version is viewed via the framed thumbnail → fullscreen zoom instead).
      if (typeof window !== "undefined" && window.innerWidth < 1024) setDevice("mobile");
    } catch {
      setMissing(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist edits back so a reload keeps them.
  useEffect(() => {
    if (!input) return;
    try {
      window.localStorage.setItem(
        KEY(id),
        JSON.stringify({ input, languages, overridesByLang, stylesByField }),
      );
    } catch {
      /* quota — ignore */
    }
  }, [id, input, languages, overridesByLang, stylesByField]);

  const activeInput = useMemo(
    () => (input ? { ...input, language: activeLang } : null),
    [input, activeLang],
  );

  const html = useMemo(() => {
    if (!activeInput) return "";
    return buildLandingHtml(activeInput, overridesByLang[activeLang] || {}, stylesByField);
    // regenNonce forces a rebuild+reload on "Перегенерировать"
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeInput, overridesByLang, activeLang, stylesByField, regenNonce]);

  const setField = (field: LandingTextField, value: string) =>
    setOverridesByLang((prev) => ({
      ...prev,
      [activeLang]: { ...(prev[activeLang] || {}), [field]: value },
    }));

  const resetField = (field: LandingTextField) =>
    setOverridesByLang((prev) => {
      const next = { ...(prev[activeLang] || {}) };
      delete next[field];
      return { ...prev, [activeLang]: next };
    });

  const setStyle = (field: LandingTextField, patch: Partial<TextStyle>) =>
    setStylesByField((prev) => ({ ...prev, [field]: { ...(prev[field] || {}), ...patch } }));
  const resetStyle = (field: LandingTextField) =>
    setStylesByField((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });

  const addLanguage = (code: string) => {
    if (languages.includes(code)) {
      setActiveLang(code);
      return;
    }
    setLanguages((prev) => [...prev, code]);
    setActiveLang(code);
    toast.success(`Добавлена версия: ${LANDING_LANGS.find((l) => l.code === code)?.label ?? code}`);
  };

  const download = () => {
    if (!html) return;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `landing-${activeLang}-${id}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success("Лендинг скачан (HTML)");
  };

  const getLink = async () => {
    const url = `https://share.dreamweaver.studio/l/${id}-${activeLang}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Ссылка на лендинг скопирована");
    } catch {
      toast("Ссылка на лендинг", { description: url });
    }
  };

  const regenerate = async () => {
    const hasEdits = Object.keys(overridesByLang[activeLang] || {}).length > 0;
    if (
      hasEdits &&
      !(await confirm({
        title: "Перегенерировать лендинг?",
        body: "Ручные правки текстов этого языка будут сброшены.",
        confirmLabel: "Перегенерировать",
      }))
    ) {
      return;
    }
    setOverridesByLang((prev) => ({ ...prev, [activeLang]: {} }));
    setRegenBusy(true);
    setTimeout(() => {
      setRegenNonce((n) => n + 1);
      setRegenBusy(false);
      toast.success("Лендинг перегенерирован");
    }, 900);
  };

  const goBack = () => router.push("/landing");

  if (loading || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Загрузка…
      </div>
    );
  }

  if (missing) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center text-foreground">
        <p className="ds-h4">Проект не найден</p>
        <p className="max-w-sm ds-caption">
          Данные лендинга не найдены (возможно, ссылка устарела). Вернитесь и сгенерируйте заново.
        </p>
        <button
          type="button"
          onClick={goBack}
          className="rounded-lg bg-accent-green px-5 py-2.5 text-sm font-semibold text-on-accent transition hover:bg-[var(--accent-hover)]"
        >
          К настройкам
        </button>
      </div>
    );
  }

  const projectName = input?.brandName?.trim() || "Лендинг без названия";
  const showOrientation = device === "mobile";

  // Preview frame sizing. Desktop = fills the area (landing shows desktop layout);
  // mobile = a fixed device frame that scrolls internally.
  const frame =
    device === "desktop"
      ? { className: "h-full w-full max-w-[1200px]", style: undefined as CSSProperties | undefined }
      : orientation === "landscape"
        ? { className: "", style: { width: 740, height: 380 } }
        : { className: "", style: { width: 390, height: 720 } };

  return (
    <div className="flex h-[100dvh] flex-col bg-background text-foreground">
      {/* Toolbar */}
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3 sm:px-4">
        <button
          type="button"
          onClick={goBack}
          className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-sm text-muted-foreground transition hover:bg-white/5 hover:text-foreground max-sm:min-h-11"
        >
          <ArrowLeft className="h-4 w-4" />
          Назад
        </button>
        <span className="mx-1 h-5 w-px bg-border" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{projectName}</p>
          <p className="ds-micro text-muted-foreground max-sm:hidden">Редактор лендинга</p>
        </div>
        <div className="ml-auto hidden items-center gap-2 lg:flex">
          <button
            type="button"
            onClick={download}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent-green px-4 py-2 text-sm font-semibold text-on-accent transition hover:bg-[var(--accent-hover)]"
          >
            <Download className="h-4 w-4" />
            Скачать
          </button>
          <button
            type="button"
            onClick={getLink}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm transition hover:bg-white/5"
          >
            <Link2 className="h-4 w-4" />
            Получить ссылку
            <span className="rounded-full bg-white/10 px-1.5 py-0.5 ds-micro text-muted-foreground">
              Скоро
            </span>
          </button>
        </div>
      </div>

      {/* Preview controls */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 sm:px-4">
        {/* Desktop: a real device toggle. Mobile: the preview IS the mobile
            version; the desktop version opens via a framed thumbnail → fullscreen
            zoom (honest, not a shrunk-to-nothing toggle). */}
        <div className="max-lg:hidden">
          <PillGroup>
            <Pill active={device === "desktop"} onClick={() => setDevice("desktop")}>
              <Monitor className="h-4 w-4" />
              <span>Десктоп</span>
            </Pill>
            <Pill active={device === "mobile"} onClick={() => setDevice("mobile")}>
              <Smartphone className="h-4 w-4" />
              <span>Мобайл</span>
            </Pill>
          </PillGroup>
        </div>
        <button
          type="button"
          onClick={() => setDesktopFull(true)}
          aria-label="Открыть десктоп-версию"
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-background p-1 pr-2.5 text-sm transition hover:bg-white/5 lg:hidden"
        >
          <DesktopThumb html={html} />
          <span className="text-muted-foreground">Десктоп</span>
        </button>

        {showOrientation ? (
          <PillGroup>
            <Pill active={orientation === "portrait"} onClick={() => setOrientation("portrait")}>
              Портрет
            </Pill>
            <Pill active={orientation === "landscape"} onClick={() => setOrientation("landscape")}>
              Пейзаж
            </Pill>
          </PillGroup>
        ) : null}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* Language versions */}
          <div className="flex items-center gap-1 rounded-lg border border-border bg-background p-0.5">
            {languages.map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => setActiveLang(code)}
                className={`min-h-8 rounded-md px-2.5 text-sm font-semibold transition ${
                  activeLang === code
                    ? "bg-accent-green text-on-accent"
                    : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                }`}
              >
                {langLabel(code)}
              </button>
            ))}
            <AddLanguageMenu languages={languages} onAdd={addLanguage} />
          </div>

          <button
            type="button"
            onClick={regenerate}
            disabled={regenBusy}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm transition hover:bg-white/5 disabled:opacity-50"
          >
            {regenBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span className="max-sm:hidden">Перегенерировать</span>
          </button>

          <button
            type="button"
            onClick={() => setEditOpen((v) => !v)}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 text-sm transition ${
              editOpen
                ? "border-accent-green bg-accent-green/10 text-accent-green"
                : "border-border hover:bg-white/5"
            }`}
          >
            <Type className="h-4 w-4" />
            <span className="max-sm:hidden">Тексты</span>
          </button>
        </div>
      </div>

      {/* Text-style panel — slides in above the preview (never covers the
          content below) when a field's "Aa" (стиль текста) is opened. */}
      {styleField ? (
        <TextStylePanel
          field={styleField}
          style={stylesByField[styleField] || {}}
          onChange={(patch) => setStyle(styleField, patch)}
          onReset={() => resetStyle(styleField)}
          onClose={() => setStyleField(null)}
        />
      ) : null}

      {/* Main: preview + desktop text panel */}
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 items-start justify-center overflow-auto bg-[var(--bg-surface)] p-4">
          <div
            className={`relative shrink-0 overflow-hidden rounded-xl border border-border bg-white shadow-xl ${frame.className}`}
            style={frame.style}
          >
            {regenBusy ? (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50">
                <Loader2 className="h-8 w-8 animate-spin text-accent-green" />
              </div>
            ) : null}
            <iframe
              key={`${activeLang}-${device}-${orientation}-${regenNonce}`}
              srcDoc={html}
              title="Превью лендинга"
              sandbox="allow-same-origin allow-popups"
              className="block h-full w-full"
              style={{ border: 0 }}
            />
          </div>
        </div>

        {/* Desktop text-edit side panel */}
        {editOpen ? (
          <aside className="hidden w-80 shrink-0 flex-col border-l border-border bg-panel lg:flex">
            <TextPanelHeader lang={activeLang} onClose={() => setEditOpen(false)} />
            <div className="flex-1 overflow-y-auto p-4">
              <TextFields
                activeInput={activeInput}
                overrides={overridesByLang[activeLang] || {}}
                onChange={setField}
                onReset={resetField}
                onEditStyle={setStyleField}
              />
            </div>
          </aside>
        ) : null}
      </div>

      {/* Mobile sticky actions */}
      <div className="flex shrink-0 gap-2 border-t border-border bg-panel p-3 lg:hidden">
        <button
          type="button"
          onClick={download}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent-green px-4 py-3 text-sm font-semibold text-on-accent transition hover:bg-[var(--accent-hover)]"
        >
          <Download className="h-4 w-4" />
          Скачать
        </button>
        <button
          type="button"
          onClick={getLink}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-4 py-3 text-sm transition hover:bg-white/5"
        >
          <Link2 className="h-4 w-4" />
          Ссылка
        </button>
      </div>

      {/* Mobile bottom sheet for text editing (same overlay pattern as elsewhere,
          gated at lg for the editor layout). */}
      <div
        aria-hidden={!editOpen}
        onClick={() => setEditOpen(false)}
        className={`fixed inset-0 z-40 bg-black/60 transition-opacity duration-200 lg:hidden ${
          editOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <div
        className={`fixed inset-x-0 bottom-0 z-50 flex max-h-[75vh] flex-col rounded-t-2xl border-t border-border bg-panel transition-transform duration-200 lg:hidden ${
          editOpen ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <TextPanelHeader lang={activeLang} onClose={() => setEditOpen(false)} />
        <div className="flex-1 overflow-y-auto p-4 pb-6">
          <TextFields
            activeInput={activeInput}
            overrides={overridesByLang[activeLang] || {}}
            onChange={setField}
            onReset={resetField}
            onEditStyle={setStyleField}
          />
        </div>
      </div>

      {/* Fullscreen desktop viewer (opened from the mobile thumbnail). */}
      {desktopFull ? (
        <DesktopZoomViewer html={html} onClose={() => setDesktopFull(false)} />
      ) : null}
    </div>
  );
}

// ---- small building blocks --------------------------------------------------

function PillGroup({ children }: { children: ReactNode }) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-background p-0.5">
      {children}
    </div>
  );
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-8 items-center gap-1.5 rounded-md px-2.5 text-sm transition ${
        active ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function AddLanguageMenu({
  languages,
  onAdd,
}: {
  languages: string[];
  onAdd: (code: string) => void;
}) {
  const addable = LANDING_LANGS.filter((l) => !languages.includes(l.code));
  return (
    <DropdownMenu scrimIntensity="light">
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Добавить язык"
          title="Добавить язык"
          disabled={addable.length === 0}
          className="ml-0.5 inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-sm text-accent-green transition hover:bg-white/5 disabled:opacity-40"
        >
          <Plus className="h-4 w-4" />
          <span className="max-sm:hidden">Язык</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-52 rounded-xl border-border bg-popover p-1.5 text-foreground"
      >
        {addable.length === 0 ? (
          <div className="px-2.5 py-2 ds-caption">Все языки добавлены</div>
        ) : (
          addable.map((l) => (
            <DropdownMenuItem
              key={l.code}
              onClick={() => onAdd(l.code)}
              className="gap-2.5 rounded-lg px-2.5 py-2 text-sm focus:bg-white/10 focus:text-foreground max-sm:py-3 max-sm:text-base"
            >
              <span className="w-7 shrink-0 font-semibold text-accent-green">{l.short}</span>
              {l.label}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TextPanelHeader({ lang, onClose }: { lang: string; onClose: () => void }) {
  return (
    <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
      <div>
        <p className="ds-h4">Тексты лендинга</p>
        <p className="ds-caption">Версия · {langLabel(lang)}</p>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Закрыть"
        className="rounded-md p-2 text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function TextFields({
  activeInput,
  overrides,
  onChange,
  onReset,
  onEditStyle,
}: {
  activeInput: LandingInput | null;
  overrides: LandingTextOverrides;
  onChange: (field: LandingTextField, value: string) => void;
  onReset: (field: LandingTextField) => void;
  onEditStyle: (field: LandingTextField) => void;
}) {
  if (!activeInput) return null;
  return (
    <div className="flex flex-col gap-4">
      <p className="ds-caption">Правки применяются к превью в реальном времени и к этой языковой версии.</p>
      {LANDING_TEXT_FIELDS.map((f) => {
        const edited = overrides[f.key] !== undefined;
        const value = edited ? (overrides[f.key] as string) : defaultTextFor(activeInput, f.key);
        return (
          <div key={f.key}>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <label className="ds-label">{f.label}</label>
              <div className="flex items-center gap-2.5">
                {edited ? (
                  <button
                    type="button"
                    onClick={() => onReset(f.key)}
                    className="inline-flex items-center gap-1 ds-micro text-muted-foreground transition hover:text-foreground"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Сбросить
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => onEditStyle(f.key)}
                  aria-label="Стиль текста"
                  title="Стиль текста"
                  className="relative flex h-7 w-7 items-center justify-center rounded-md bg-white/5 text-muted-foreground transition hover:bg-white/10 hover:text-foreground after:absolute after:-inset-1.5 after:content-['']"
                >
                  <span className="text-[13px] font-semibold leading-none">Aa</span>
                </button>
              </div>
            </div>
            {f.multiline ? (
              <textarea
                value={value}
                onChange={(e) => onChange(f.key, e.target.value)}
                rows={2}
                className="min-h-[64px] w-full resize-y rounded-lg border border-border bg-elevated px-3 py-2 text-sm outline-none focus:border-accent-green"
              />
            ) : (
              <input
                type="text"
                value={value}
                onChange={(e) => onChange(f.key, e.target.value)}
                className="h-11 w-full rounded-lg border border-border bg-elevated px-3 text-sm outline-none focus:border-accent-green"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// Reusable typography panel — shared by every text block. Slides in above the
// preview (never covers content below).
const DEFAULT_SIZE: Record<LandingTextField, number> = {
  heroHeadline: 44,
  lead: 18,
  cta: 16,
  offer: 13,
  benefitsTitle: 30,
  howtoTitle: 30,
  trustTitle: 30,
  ctaTitle: 30,
};

function TextStylePanel({
  field,
  style,
  onChange,
  onReset,
  onClose,
}: {
  field: LandingTextField;
  style: TextStyle;
  onChange: (patch: Partial<TextStyle>) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const label = LANDING_TEXT_FIELDS.find((f) => f.key === field)?.label ?? "";
  const size = style.fontSize ?? DEFAULT_SIZE[field];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-panel px-3 py-2.5 sm:px-4">
      <span className="text-sm font-medium">
        Стиль текста: <span className="text-accent-green">{label}</span>
      </span>

      <label className="flex items-center gap-1.5">
        <span className="ds-micro text-muted-foreground">Шрифт</span>
        <select
          value={style.fontFamily ?? ""}
          onChange={(e) => onChange({ fontFamily: e.target.value })}
          className="h-9 rounded-lg border border-border bg-elevated px-2 text-sm outline-none focus:border-accent-green"
        >
          {LANDING_FONTS.map((f) => (
            <option key={f.label} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-2">
        <span className="ds-micro text-muted-foreground">Размер</span>
        <input
          type="range"
          min={LANDING_FONT_SIZE.min}
          max={LANDING_FONT_SIZE.max}
          step={LANDING_FONT_SIZE.step}
          value={size}
          onChange={(e) => onChange({ fontSize: Number(e.target.value) })}
          className="w-24 accent-[var(--accent-green)] max-sm:w-16"
        />
        <input
          type="number"
          min={LANDING_FONT_SIZE.min}
          max={LANDING_FONT_SIZE.max}
          value={size}
          onChange={(e) => onChange({ fontSize: Number(e.target.value) })}
          className="h-9 w-14 rounded-lg border border-border bg-elevated px-2 text-sm outline-none focus:border-accent-green"
        />
        <span className="ds-micro text-muted-foreground">px</span>
      </label>

      <div className="flex items-center gap-1.5">
        <span className="ds-micro text-muted-foreground">Начертание</span>
        <div className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-background p-0.5">
          {LANDING_WEIGHTS.map((w) => (
            <button
              key={w.value}
              type="button"
              onClick={() => onChange({ fontWeight: w.value })}
              className={`min-h-8 rounded-md px-2.5 text-sm transition ${
                style.fontWeight === w.value
                  ? "bg-white/10 text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-1 ds-micro text-muted-foreground transition hover:text-foreground"
        >
          <RotateCcw className="h-3 w-3" />
          Сбросить
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть"
          className="rounded-md p-1.5 text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// Small monitor-framed live thumbnail of the desktop version (mobile only).
function DesktopThumb({ html }: { html: string }) {
  const W = 1280;
  const H = 800;
  const THUMB = 60;
  const scale = THUMB / W;
  return (
    <span
      className="relative block shrink-0 overflow-hidden rounded-sm border border-border bg-white"
      style={{ width: THUMB, height: Math.round(H * scale) }}
    >
      <iframe
        srcDoc={html}
        title="Десктоп-миниатюра"
        sandbox="allow-same-origin"
        aria-hidden
        tabIndex={-1}
        className="pointer-events-none absolute left-0 top-0 origin-top-left"
        style={{ width: W, height: H, transform: `scale(${scale})`, border: 0 }}
      />
    </span>
  );
}

// Fullscreen desktop viewer with pinch-zoom + pan (honest desktop preview on a
// phone, like viewing a desktop site in a mobile browser).
function DesktopZoomViewer({ html, onClose }: { html: string; onClose: () => void }) {
  const W = 1280;
  const H = 2600;
  const vpRef = useRef<HTMLDivElement>(null);
  const [t, setT] = useState({ x: 0, y: 16, s: 0.3 });
  const g = useRef({ mode: "none", sx: 0, sy: 0, tx: 0, ty: 0, d: 0, s: 1, cx: 0, cy: 0 });

  useEffect(() => {
    const vw = vpRef.current?.clientWidth ?? window.innerWidth;
    const s = Math.min(1, vw / W);
    setT({ x: (vw - W * s) / 2, y: 16, s });
  }, []);

  const clampS = (s: number) => Math.max(0.15, Math.min(4, s));

  const zoomAround = (cx: number, cy: number, factor: number) =>
    setT((p) => {
      const s1 = clampS(p.s * factor);
      const k = s1 / p.s;
      return { s: s1, x: cx - (cx - p.x) * k, y: cy - (cy - p.y) * k };
    });

  const onTouchStart = (e: ReactTouchEvent) => {
    if (e.touches.length === 1) {
      g.current = { ...g.current, mode: "pan", sx: e.touches[0].clientX, sy: e.touches[0].clientY, tx: t.x, ty: t.y };
    } else if (e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      g.current = {
        mode: "pinch",
        d: Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY),
        s: t.s,
        tx: t.x,
        ty: t.y,
        cx: (a.clientX + b.clientX) / 2,
        cy: (a.clientY + b.clientY) / 2,
        sx: 0,
        sy: 0,
      };
    }
  };
  const onTouchMove = (e: ReactTouchEvent) => {
    if (e.cancelable) e.preventDefault();
    const c = g.current;
    if (c.mode === "pan" && e.touches.length === 1) {
      setT((p) => ({ ...p, x: c.tx + (e.touches[0].clientX - c.sx), y: c.ty + (e.touches[0].clientY - c.sy) }));
    } else if (c.mode === "pinch" && e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      const d = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
      const s1 = clampS(c.s * (d / c.d));
      const rect = vpRef.current?.getBoundingClientRect();
      const px = c.cx - (rect?.left ?? 0);
      const py = c.cy - (rect?.top ?? 0);
      const k = s1 / c.s;
      setT({ s: s1, x: px - (px - c.tx) * k, y: py - (py - c.ty) * k });
    }
  };
  const onTouchEnd = () => {
    g.current.mode = "none";
  };
  const btnZoom = (factor: number) => {
    const rect = vpRef.current?.getBoundingClientRect();
    zoomAround((rect?.width ?? 0) / 2, (rect?.height ?? 0) / 2, factor);
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[var(--bg-void)]">
      <div className="flex h-12 shrink-0 items-center justify-between px-3 text-white">
        <span className="text-sm font-medium">Десктоп-версия · {Math.round(t.s * 100)}%</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => btnZoom(1 / 1.3)}
            aria-label="Уменьшить"
            className="flex items-center justify-center rounded-md p-2 transition hover:bg-white/10 max-sm:h-11 max-sm:w-11"
          >
            <Minus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => btnZoom(1.3)}
            aria-label="Увеличить"
            className="flex items-center justify-center rounded-md p-2 transition hover:bg-white/10 max-sm:h-11 max-sm:w-11"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="ml-1 flex items-center justify-center rounded-md p-2 transition hover:bg-white/10 max-sm:h-11 max-sm:w-11"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
      <div
        ref={vpRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className="relative flex-1 touch-none overflow-hidden bg-[var(--bg-void)]"
      >
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.s})` }}
        >
          <iframe
            srcDoc={html}
            title="Десктоп-версия"
            sandbox="allow-same-origin allow-popups"
            className="pointer-events-none block bg-white"
            style={{ width: W, height: H, border: 0 }}
          />
        </div>
      </div>
      <p className="shrink-0 bg-black py-2 text-center text-xs text-white/60">
        Двумя пальцами — масштаб, одним — прокрутка
      </p>
    </div>
  );
}
