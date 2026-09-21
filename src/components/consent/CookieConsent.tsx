"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Cookie, ShieldCheck, Sliders, X } from "lucide-react";

import { track } from "@/lib/analytics";
import {
  clearNonEssentialStorage,
  CONSENT_EVENT,
  CONSENT_OPEN_EVENT,
  MINIMAL,
  getConsent,
  saveConsent,
  type ConsentCategories,
} from "@/lib/consent";

// Cookie notice + settings. The copy says what we really store (see
// lib/consent.ts): no cookies of our own, no analytics, no ad pixels — a
// session in localStorage plus preferences and drafts. So this is a notice
// with a real control, not a consent wall: it never covers the page, and
// turning functional storage off actually wipes that storage.

type Row = {
  id: keyof ConsentCategories;
  title: string;
  body: string;
  locked?: boolean;
  note?: string;
};

// Consent is never pre-ticked: analytics starts off, and stays off until
// somebody turns it on deliberately.
const DEFAULT_DRAFT: ConsentCategories = { necessary: true, functional: true, analytics: false };

const ROWS: Row[] = [
  {
    id: "necessary",
    title: "Необходимые",
    body: "Держат вас в аккаунте между визитами и хранят ваш выбор в этом окне. Без них не работает вход.",
    locked: true,
  },
  {
    id: "functional",
    title: "Настройки и черновики",
    body: "Запоминают язык, свёрнутое меню, выбранный шаблон, бренд и незаконченные проекты — чтобы не собирать всё заново.",
    note: "Если выключить, сохранённые черновики и настройки будут удалены.",
  },
  {
    id: "analytics",
    title: "Аналитика",
    body: "Обезличенная статистика: какие инструменты используют и где спотыкаются.",
    note: "Сейчас не подключена. Переключатель хранит ваш выбор на будущее — без согласия мы её не включим.",
  },
];

export function CookieConsent() {
  const [mounted, setMounted] = useState(false);
  const [needsChoice, setNeedsChoice] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<ConsentCategories>(DEFAULT_DRAFT);

  useEffect(() => {
    setMounted(true);
    const current = getConsent();
    setNeedsChoice(current === null);
    if (current) {
      setDraft({ necessary: true, functional: current.functional, analytics: current.analytics });
      // Enforce the choice on every load, not just when it is made: something
      // written during the last session would otherwise quietly survive.
      if (!current.functional) clearNonEssentialStorage();
    }
  }, []);

  // The legal page opens the same dialog through this event.
  useEffect(() => {
    const onOpen = () => {
      const current = getConsent();
      setDraft(
        current
          ? { necessary: true, functional: current.functional, analytics: current.analytics }
          : DEFAULT_DRAFT,
      );
      setDialogOpen(true);
    };
    window.addEventListener(CONSENT_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, onOpen);
  }, []);

  useEffect(() => {
    const onChange = () => setNeedsChoice(getConsent() === null);
    window.addEventListener(CONSENT_EVENT, onChange);
    return () => window.removeEventListener(CONSENT_EVENT, onChange);
  }, []);

  useEffect(() => {
    if (!dialogOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDialogOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialogOpen]);

  const decide = useCallback((c: ConsentCategories) => {
    saveConsent(c);
    track("consent_set", { functional: c.functional, analytics: c.analytics });
    setNeedsChoice(false);
    setDialogOpen(false);
  }, []);

  if (!mounted) return null;
  if (!needsChoice && !dialogOpen) return null;

  return createPortal(
    <>
      {needsChoice && !dialogOpen ? (
        <div
          role="region"
          aria-label="Уведомление о cookie"
          className="fixed inset-x-0 bottom-0 z-[150] p-3 sm:p-4"
        >
          <div className="mx-auto flex max-w-4xl flex-col gap-3 rounded-2xl border border-border bg-popover p-4 text-foreground shadow-[0_24px_70px_-20px_rgba(0,0,0,0.95)] sm:flex-row sm:items-center sm:gap-4 sm:p-5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-green/15 text-accent-green">
              <Cookie className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Мы храним минимум</p>
              <p className="mt-1 ds-caption">
                Вход в аккаунт, настройки интерфейса и черновики проектов — всё в вашем браузере.
                Рекламных пикселей и аналитических трекеров у нас нет.{" "}
                <Link href="/legal#cookies" className="text-accent-green underline-offset-2 hover:underline">
                  Подробнее
                </Link>
              </p>
            </div>
            {/* On a phone the primary sits on its own row at the top of the
                group: wrapped last it lands in the thumb-zone corner, where
                floating widgets live. */}
            <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
              <button
                type="button"
                onClick={() => setDialogOpen(true)}
                className="order-2 inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-border px-3 text-sm font-medium text-muted-foreground transition hover:border-accent-green/40 hover:text-foreground sm:order-none"
              >
                <Sliders className="h-3.5 w-3.5" />
                Настроить
              </button>
              <button
                type="button"
                onClick={() => decide(MINIMAL)}
                className="order-3 min-h-10 rounded-xl border border-border px-3 text-sm font-medium text-muted-foreground transition hover:border-accent-green/40 hover:text-foreground sm:order-none"
              >
                Только необходимое
              </button>
              <button
                type="button"
                onClick={() => decide(DEFAULT_DRAFT)}
                className="order-1 col-span-2 min-h-10 rounded-xl bg-accent-green px-4 text-sm font-semibold text-on-accent transition hover:bg-[var(--accent-hover)] sm:order-none sm:col-auto"
              >
                Хорошо
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {dialogOpen ? (
        <div className="fixed inset-0 z-[220] flex items-end justify-center p-3 sm:items-center sm:p-6">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setDialogOpen(false)}
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Настройки хранения данных"
            className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-popover text-foreground shadow-[0_30px_90px_-24px_rgba(0,0,0,0.95)]"
          >
            <div className="flex items-start justify-between gap-3 border-b border-border p-5">
              <div>
                <p className="ds-overline ds-overline-accent">Cookie и локальное хранилище</p>
                <h2 className="ds-h4 mt-1">Что мы храним в вашем браузере</h2>
              </div>
              <button
                type="button"
                onClick={() => setDialogOpen(false)}
                aria-label="Закрыть"
                className="relative -mr-1 -mt-1 shrink-0 text-muted-foreground transition after:absolute after:-inset-2.5 after:content-[''] hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto">
              <p className="flex items-start gap-2 border-b border-border bg-white/[0.02] px-5 py-3 ds-caption">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent-green" />
                <span>
                  Своих cookie мы не ставим — только запись вашего выбора в этом окне. Данные лежат
                  в localStorage вашего браузера и никуда не уходят.
                </span>
              </p>

              {ROWS.map((row) => {
                const on = row.locked ? true : draft[row.id] === true;
                return (
                  <div key={row.id} className="flex items-start gap-3 border-b border-border/60 p-5 last:border-b-0">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={on}
                      aria-label={row.title}
                      disabled={row.locked}
                      onClick={() =>
                        setDraft((p) => ({ ...p, necessary: true, [row.id]: !p[row.id] }))
                      }
                      className={`mt-0.5 flex h-6 w-11 shrink-0 items-center rounded-full border p-0.5 transition ${
                        on ? "border-accent-green bg-accent-green/80" : "border-border bg-white/[0.06]"
                      } ${row.locked ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
                    >
                      <span
                        className={`h-4 w-4 rounded-full transition ${
                          on ? "translate-x-5 bg-on-accent" : "translate-x-0 bg-muted-foreground"
                        }`}
                      />
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {row.title}
                        {row.locked ? (
                          <span className="ml-2 rounded-full border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                            всегда
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-1 ds-caption">{row.body}</p>
                      {row.note ? (
                        <p className="mt-1.5 border-l-2 border-accent-green/30 pl-2.5 ds-caption">
                          {row.note}
                        </p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-border p-5">
              <button
                type="button"
                onClick={() => decide(MINIMAL)}
                className="min-h-10 rounded-xl px-2 text-sm text-muted-foreground transition hover:text-foreground"
              >
                Только необходимое
              </button>
              <button
                type="button"
                onClick={() => decide(draft)}
                className="min-h-10 rounded-xl bg-accent-green px-4 text-sm font-semibold text-on-accent transition hover:bg-[var(--accent-hover)]"
              >
                Сохранить выбор
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>,
    document.body,
  );
}
