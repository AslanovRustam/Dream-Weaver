"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Clock,
  Coins,
  HelpCircle,
  Image as ImageIcon,
  LayoutGrid,
  Layout,
  RotateCcw,
  type LucideIcon,
} from "lucide-react";

import { AppHeader } from "@/components/AppHeader";
import { AppShell } from "@/components/AppShell";
import { BackButton } from "@/components/BackButton";
import { BANNER_TEMPLATES_ROUTE } from "@/components/PresetSidebar";

// ─────────────────────────────────────────────────────────────────────────────
// Быстрый старт — a walk-through of the three things a new account does in
// order: pick a template, make a banner from it, then make a landing. Every
// step describes a control that really exists in those screens (field labels,
// button captions), so the guide stays usable next to the product rather than
// describing an idealised version of it.
//
// Progress is per-browser (localStorage). It is a checklist the reader ticks,
// not telemetry: nothing here calls the API, so the page works for a guest.
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = "dw_onboarding_v1";

type Step = {
  id: string;
  title: string;
  body: string;
  /** Short aside: a concrete example, or the thing people get wrong. */
  hint?: string;
};

type Chapter = {
  id: string;
  n: number;
  icon: LucideIcon;
  overline: string;
  title: string;
  lead: string;
  preview: string;
  href: string;
  cta: string;
  steps: Step[];
};

const CHAPTERS: Chapter[] = [
  {
    id: "template",
    n: 1,
    icon: LayoutGrid,
    overline: "Шаг 1",
    title: "Выберите шаблон",
    lead: "Шаблон задаёт визуальный стиль креатива и набор полей под него. Содержимое — бренд, оффер, команды — вы зададите сами на следующем шаге.",
    preview: "/previews/preset20.webp",
    href: BANNER_TEMPLATES_ROUTE,
    cta: "Открыть каталог шаблонов",
    steps: [
      {
        id: "t1",
        title: "Откройте каталог",
        body: "Пункт «Баннер-генератор» в меню слева открывает каталог шаблонов. С экрана генератора сюда возвращает кнопка «К шаблонам» над списком настроек.",
      },
      {
        id: "t2",
        title: "Сузьте выбор",
        body: "Поиск ищет по названию шаблона. Иконка воронки справа от поиска фильтрует по категории: казино, слоты, спорт, ставки.",
        hint: "Не знаете категорию — листайте разделы как есть, плитки грузятся сразу.",
      },
      {
        id: "t3",
        title: "Посмотрите превью",
        body: "На плитке — пример готового креатива в этом стиле. Бренды и тексты на превью выдуманы: это образец оформления, а не то, что получите вы.",
      },
      {
        id: "t4",
        title: "Нажмите на шаблон",
        body: "Откроется генератор с этим шаблоном. Набор полей подстроится: у спортивных появятся стороны матча, коэффициенты и дата, у слотовых — название игры.",
        hint: "Шаблон можно сменить в любой момент, настройки при этом сохранятся.",
      },
    ],
  },
  {
    id: "banner",
    n: 2,
    icon: ImageIcon,
    overline: "Шаг 2",
    title: "Соберите баннер",
    lead: "Генератор рисует мастер-макет по вашему описанию, а затем пересобирает его под каждый рекламный формат.",
    preview: "/previews/preset1.webp",
    href: "/banner",
    cta: "Открыть баннер-генератор",
    steps: [
      {
        id: "b1",
        title: "Опишите оффер",
        body: "Поле «Описание» — главное. Пишите по-человечески, одним предложением, что рекламируем и на что ловим.",
        hint: "Например: «200% на первый депозит и 500 фриспинов для нового казино».",
      },
      {
        id: "b2",
        title: "Добавьте бренд",
        body: "Название проекта и PNG-лого. Прозрачность лого сохраняется, оно встаёт в макет, а не поверх него прямоугольником.",
      },
      {
        id: "b3",
        title: "Задайте акцентный цвет",
        body: "Цвет из брендбука в поле рядом с палитрой. Генератор строит вокруг него всю гамму креатива.",
      },
      {
        id: "b4",
        title: "Проверьте текст кнопки",
        body: "Пустое поле означает, что текст придумает ИИ. Если у вас есть утверждённая формулировка, впишите её.",
        hint: "«Играть», «Получить бонус», «Сделать ставку».",
      },
      {
        id: "b5",
        title: "Нажмите «Сгенерировать»",
        body: "На кнопке написано, сколько кредитов спишется. Первым приходит мастер-макет — большой горизонтальный баннер.",
        hint: "Результат не понравился — «Сгенерировать заново» даст другой вариант по тому же описанию.",
      },
      {
        id: "b6",
        title: "Соберите пакет форматов",
        body: "После мастера открывается панель ресайзов: отметьте нужные размеры и запустите пакет. Каждый формат перерисовывается под свой холст, а не обрезается.",
      },
      {
        id: "b7",
        title: "Заберите результат",
        body: "Скачайте отдельный формат с его карточки или весь пакет архивом. Проект сам сохраняется в «Историю», к нему можно вернуться и догенерировать форматы позже.",
      },
    ],
  },
  {
    id: "landing",
    n: 3,
    icon: Layout,
    overline: "Шаг 3",
    title: "Соберите лендинг",
    lead: "Лендинг-генератор отдаёт готовый HTML-файл: картинки внутри файла, внешних зависимостей нет. Его можно лить сразу.",
    preview: "/previews/hero-wheel.webp",
    href: "/landing",
    cta: "Открыть лендинг-генератор",
    steps: [
      {
        id: "l1",
        title: "Выберите механику",
        body: "Колесо фортуны, слот-машина, crash, матч-прогноз или классический беттинг-лендинг. Механика определяет, что будет в центре экрана и чем занят пользователь.",
        hint: "Пришли из баннера — бренд, цвет и оффер подставятся из него автоматически.",
      },
      {
        id: "l2",
        title: "Заполните тематику",
        body: "Поле «Тематика» обязательное: по нему собирается весь текст страницы. Кнопка со звёздочкой рядом предложит варианты, если не знаете, с чего начать.",
      },
      {
        id: "l3",
        title: "Бренд и заголовок",
        body: "Название, PNG-лого и заголовок первого экрана. Заголовок можно оставить пустым — тогда его напишет ИИ по тематике.",
      },
      {
        id: "l4",
        title: "Фон и персонажи",
        body: "Фон рисуется по описанию сцены. Персонажи по бокам генерируются отдельно и обрезаются по прозрачному краю, поэтому встают на любой фон.",
      },
      {
        id: "l5",
        title: "Кнопка и ссылка перехода",
        body: "Текст кнопки и CTA-ссылка. Макросы трекера вроде {clickurl} подставляются как есть, генератор их не трогает.",
        hint: "Все кнопки лендинга ведут на одну эту ссылку.",
      },
      {
        id: "l6",
        title: "Посмотрите «На весь экран»",
        body: "Кнопка открывает настоящий экспорт в рамке. Ширину и высоту можно тянуть мышью, кнопка «Повернуть» меняет ориентацию — так видно, как страница поведёт себя на разных экранах.",
      },
      {
        id: "l7",
        title: "Скачайте HTML",
        body: "«Скачать HTML» отдаёт один самодостаточный файл. Заливайте на свой хостинг или в партнёрскую программу — ничего дополнительно подключать не нужно.",
      },
    ],
  },
];

const ALL_STEP_IDS = CHAPTERS.flatMap((c) => c.steps.map((s) => s.id));

const NEXT_LINKS: { href: string; icon: LucideIcon; title: string; body: string }[] = [
  {
    href: "/history",
    icon: Clock,
    title: "История",
    body: "Все проекты со всеми форматами. Открывается на редактирование, ничего не теряется.",
  },
  {
    href: "/billing",
    icon: Coins,
    title: "Тарифы",
    body: "Кредиты и планы. Баланс всегда виден в шапке рядом с профилем.",
  },
  {
    href: "/help",
    icon: HelpCircle,
    title: "Помощь",
    body: "Частые вопросы и форма в поддержку, если что-то пошло не так.",
  },
];

export default function OnboardingPage() {
  const [done, setDone] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    document.title = "Быстрый старт — GenGO";
  }, []);

  // localStorage can throw (private mode, blocked site data) — the page has to
  // render either way, just without remembered progress.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const saved: unknown = raw ? JSON.parse(raw) : null;
      if (Array.isArray(saved)) {
        setDone(new Set(saved.filter((x): x is string => typeof x === "string")));
      }
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  const persist = useCallback((next: Set<string>) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = useCallback(
    (id: string) => {
      setDone((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const reset = useCallback(() => {
    setDone(new Set());
    persist(new Set());
  }, [persist]);

  const doneCount = useMemo(() => ALL_STEP_IDS.filter((id) => done.has(id)).length, [done]);
  const total = ALL_STEP_IDS.length;
  const pct = total ? Math.round((doneCount / total) * 100) : 0;

  // The chapter to nudge: the first one with an unticked step. It gets the
  // single lime button on the page; the others stay outlined.
  const activeChapterId = useMemo(() => {
    const open = CHAPTERS.find((c) => c.steps.some((s) => !done.has(s.id)));
    return open ? open.id : null;
  }, [done]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader />
      <AppShell>
        <div className="mx-auto max-w-4xl px-4 py-6 sm:py-8">
          <BackButton />

          <header className="mt-4">
            <p className="ds-overline ds-overline-accent">Быстрый старт</p>
            <h1 className="ds-h2 mt-2">Первый креатив за три шага</h1>
            <p className="mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
              Шаблон, баннер, лендинг — в этом порядке. Отмечайте пункты по ходу дела, страница
              запомнит, где вы остановились.
            </p>
          </header>

          {/* Progress */}
          <div className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-card">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="ds-overline">Прогресс</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  <span className="font-mono tabular-nums text-base font-semibold text-foreground">
                    {ready ? doneCount : 0}
                  </span>{" "}
                  из <span className="font-mono tabular-nums">{total}</span> пунктов
                </p>
              </div>
              {doneCount > 0 ? (
                <button
                  type="button"
                  onClick={reset}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground transition hover:border-accent-green/40 hover:text-foreground"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Сбросить
                </button>
              ) : null}
            </div>
            <div
              className="mt-4 h-2 w-full overflow-hidden rounded-full bg-white/[0.06]"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={ready ? pct : 0}
              aria-label="Пройдено пунктов быстрого старта"
            >
              <div
                className="h-full rounded-full bg-accent-green transition-[width] duration-500"
                style={{ width: `${ready ? pct : 0}%` }}
              />
            </div>
          </div>

          {/* Chapters */}
          <div className="mt-8 space-y-6">
            {CHAPTERS.map((chapter) => {
              const Icon = chapter.icon;
              const chapterDone = chapter.steps.filter((s) => done.has(s.id)).length;
              const complete = chapterDone === chapter.steps.length;
              const isActive = activeChapterId === chapter.id;

              return (
                <section
                  key={chapter.id}
                  className={`overflow-hidden rounded-2xl border bg-card shadow-card transition ${
                    isActive ? "border-accent-green/30" : "border-border"
                  }`}
                >
                  <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-start sm:gap-6 sm:p-6">
                    <span
                      aria-hidden
                      className="h-28 w-full shrink-0 overflow-hidden rounded-xl border border-white/10 bg-[var(--bg-surface)] sm:h-24 sm:w-36"
                    >
                      <img src={chapter.preview} alt="" className="h-full w-full object-cover" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="ds-feature-icon h-7 w-7 shrink-0">
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <p className="ds-overline">{chapter.overline}</p>
                        {complete ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-accent-green/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-green">
                            <Check className="h-3 w-3" />
                            Готово
                          </span>
                        ) : (
                          <span className="ds-caption font-mono tabular-nums">
                            {chapterDone}/{chapter.steps.length}
                          </span>
                        )}
                      </div>
                      <h2 className="ds-h3 mt-2">{chapter.title}</h2>
                      <p className="mt-2 text-sm text-muted-foreground">{chapter.lead}</p>
                    </div>
                  </div>

                  <ol className="border-t border-border">
                    {chapter.steps.map((step, i) => {
                      const checked = done.has(step.id);
                      return (
                        <li
                          key={step.id}
                          className="border-b border-border/60 last:border-b-0"
                        >
                          <div className="flex gap-3 px-5 py-4 sm:px-6">
                            <button
                              type="button"
                              onClick={() => toggle(step.id)}
                              aria-pressed={checked}
                              aria-label={
                                checked
                                  ? `Снять отметку: ${step.title}`
                                  : `Отметить выполненным: ${step.title}`
                              }
                              className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border font-mono text-xs tabular-nums transition ${
                                checked
                                  ? "border-accent-green bg-accent-green text-on-accent"
                                  : "border-border text-muted-foreground hover:border-accent-green/50 hover:text-foreground"
                              }`}
                            >
                              {checked ? <Check className="h-3.5 w-3.5" /> : i + 1}
                            </button>
                            <div className="min-w-0 flex-1">
                              <p
                                className={`text-sm font-medium transition ${
                                  checked ? "text-muted-foreground line-through" : "text-foreground"
                                }`}
                              >
                                {step.title}
                              </p>
                              <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
                              {step.hint ? (
                                <p className="mt-2 border-l-2 border-accent-green/30 pl-3 ds-caption">
                                  {step.hint}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ol>

                  <div className="border-t border-border p-5 sm:p-6">
                    <Link
                      href={chapter.href}
                      className={
                        isActive
                          ? "inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent-green px-4 text-sm font-semibold text-on-accent transition hover:bg-[var(--accent-hover)] hover:shadow-glow-lime"
                          : "inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-medium text-foreground transition hover:border-accent-green/40"
                      }
                    >
                      {chapter.cta}
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                </section>
              );
            })}
          </div>

          {/* What next */}
          <section className="mt-10">
            <p className="ds-overline ds-overline-accent">Дальше</p>
            <h2 className="ds-h3 mt-1">Куда идти после первого креатива</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {NEXT_LINKS.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="group rounded-2xl border border-border bg-card p-4 transition hover:border-accent-green/40"
                  >
                    <span className="ds-feature-icon h-8 w-8">
                      <Icon className="h-4 w-4" />
                    </span>
                    <p className="mt-3 text-sm font-medium">{item.title}</p>
                    <p className="mt-1 ds-caption">{item.body}</p>
                  </Link>
                );
              })}
            </div>
          </section>
        </div>
      </AppShell>
    </div>
  );
}
