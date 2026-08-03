"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Coins,
  Loader2,
  Mail,
  MessageCircle,
  Paperclip,
  Search,
  Send,
  UserCog,
  Wand2,
  X,
} from "lucide-react";

import { AppHeader } from "@/components/AppHeader";
import { BackButton } from "@/components/BackButton";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ─────────────────────────────────────────────────────────────────────────────
// Content — realistic FAQ tied to what the product actually does (4 generators,
// credits, account). Grouped by topic; each item has a stable id so search can
// auto-expand matches. Answers reference real flows (history, "Безопасность"
// block in the account, content-language selector, Enterprise → support mailto).
// ─────────────────────────────────────────────────────────────────────────────
type FaqItem = { id: string; q: string; a: string };
type FaqGroup = { id: string; title: string; icon: typeof Coins; items: FaqItem[] };

const FAQ_GROUPS: FaqGroup[] = [
  {
    id: "credits",
    title: "Кредиты и оплата",
    icon: Coins,
    items: [
      {
        id: "credits-how",
        q: "Как начисляются и списываются кредиты?",
        a: "Кредиты — внутренняя валюта студии. Они списываются за каждую генерацию: баннер, лендинг, playable или видео. Текущий баланс виден в шапке рядом с профилем и в личном кабинете. Когда кредитов мало, чип с балансом подсвечивается — это сигнал пополнить заранее.",
      },
      {
        id: "credits-cost",
        q: "Сколько кредитов стоит одна генерация?",
        a: "Стоимость зависит от инструмента и параметров: видео и playable расходуют больше, чем один статичный баннер. Списание показывается при запуске генерации, а полную историю трат видно в личном кабинете — в блоке «История использования».",
      },
      {
        id: "credits-topup",
        q: "Как пополнить баланс или оплатить тариф?",
        a: "Откройте раздел «Тарифы» (кнопка в шапке или в личном кабинете), выберите план и нажмите «Выбрать план». Для индивидуального объёма выберите план «Корпоративный» — откроется письмо в поддержку, и мы подберём условия под ваши задачи.",
      },
      {
        id: "credits-empty",
        q: "Что делать, если кредиты закончились?",
        a: "Пока баланс на нуле, запуск новых генераций недоступен. Пополните баланс в разделе «Тарифы» — доступ восстановится сразу после оплаты. Уже созданные проекты и вся история при этом сохраняются.",
      },
    ],
  },
  {
    id: "generation",
    title: "Генерация и экспорт",
    icon: Wand2,
    items: [
      {
        id: "gen-banner",
        q: "Как сгенерировать баннер?",
        a: "Откройте раздел «Баннер», задайте тематику, стиль и нужные форматы, при желании добавьте референс — и нажмите «Сгенерировать». Результат появится справа: его можно перегенерировать или сохранить в историю.",
      },
      {
        id: "gen-landing",
        q: "Как собрать лендинг?",
        a: "В разделе «Лендинг» опишите оффер и выберите структуру. Студия соберёт страницу по блокам, а их можно поправить в визуальном редакторе. Готовый проект сохраняется в истории и доступен для повторного открытия.",
      },
      {
        id: "gen-playable",
        q: "Как сделать playable?",
        a: "Раздел «Playable» собирает интерактивную мини-механику под кампанию. Выберите тип механики и параметры, запустите генерацию и предпросмотрите результат прямо в браузере перед сохранением.",
      },
      {
        id: "gen-video",
        q: "Как сгенерировать видео?",
        a: "В разделе «Видео» задайте сценарий или промпт и параметры ролика, затем запустите генерацию. Это дольше, чем статика, — прогресс отображается на карточке генерации, а готовый ролик попадает в историю.",
      },
      {
        id: "gen-resizes",
        q: "Как скачать готовый пакет ресайзов?",
        a: "После генерации баннера нажмите на скачивание в карточке результата — студия соберёт все выбранные форматы в один пакет. Если ссылка недоступна, значит генерация или сборка ресайзов ещё не завершилась: дождитесь окончания и повторите.",
      },
    ],
  },
  {
    id: "account",
    title: "Аккаунт и доступ",
    icon: UserCog,
    items: [
      {
        id: "acc-email",
        q: "Как сменить email?",
        a: "Email меняет администратор вручную — напишите в поддержку с текущего адреса, и мы обновим его. Это защищает аккаунт от несанкционированной смены доступа.",
      },
      {
        id: "acc-password",
        q: "Как сменить пароль?",
        a: "Пароль меняется самостоятельно в личном кабинете — в блоке «Безопасность». Если вы входите через Google, там же можно задать пароль и включить вход по паролю.",
      },
      {
        id: "acc-history",
        q: "Где посмотреть историю проектов?",
        a: "Все сгенерированные баннеры, лендинги, playable и видео собраны в разделе «История». Проекты можно переименовывать, дублировать, восстанавливать из корзины и открывать заново.",
      },
      {
        id: "acc-language",
        q: "Чем управляет переключатель «Язык генерации»?",
        a: "Он задаёт язык создаваемого контента — текстов на баннерах, лендингах и в роликах. Интерфейс студии при этом остаётся русским. Переключатель находится в шапке рядом с профилем.",
      },
    ],
  },
];

const SUPPORT_EMAIL = "support@clickable.agency";
const TOPICS = ["Технический вопрос", "Оплата", "Предложение", "Другое"] as const;

export default function HelpPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [openItems, setOpenItems] = useState<string[]>([]);

  useEffect(() => {
    document.title = "Помощь и поддержка — Dream Weaver Studio";
  }, []);

  // Arriving at /help#contact (from the header "Написать в поддержку" or the Hub
  // help card) smoothly scrolls to the support section. scroll-mt on the target
  // keeps it clear of the sticky header.
  useEffect(() => {
    if (typeof window === "undefined" || window.location.hash !== "#contact") return;
    const el = document.getElementById("contact");
    if (el) requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, []);

  // Searching auto-expands every matching answer; clearing collapses them all.
  // Computed from the source data (not derived render state) so it stays stable.
  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      setOpenItems([]);
      return;
    }
    const ids: string[] = [];
    for (const g of FAQ_GROUPS) {
      for (const it of g.items) {
        if (it.q.toLowerCase().includes(q) || it.a.toLowerCase().includes(q)) ids.push(it.id);
      }
    }
    setOpenItems(ids);
  }, [query]);

  const q = query.trim().toLowerCase();
  const filteredGroups = FAQ_GROUPS.map((g) => ({
    ...g,
    items: q
      ? g.items.filter((it) => it.q.toLowerCase().includes(q) || it.a.toLowerCase().includes(q))
      : g.items,
  })).filter((g) => g.items.length > 0);
  const noResults = q.length > 0 && filteredGroups.length === 0;

  const goBack = () => {
    // "Назад" returns to the previous section; if the page was opened directly
    // (no in-app history), fall back to the Hub instead of a dead click.
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/");
  };

  return (
    <div className="min-h-screen">
      <div className="ds-aurora" aria-hidden />
      <AppHeader />

      {/* Decorative aurora + fading dot-grid, same brand backdrop as the Hub.
          aria-hidden, no pointer events, sits behind content by DOM order. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[440px] overflow-hidden"
      >
        <div className="ds-hero-glow absolute inset-0" />
        <div className="ds-dotgrid ds-dotgrid-fade absolute inset-0 opacity-[0.14]" />
      </div>

      <div className="relative mx-auto max-w-3xl px-4 py-6 sm:py-8">
        <BackButton onClick={goBack} className="-ml-2 mb-6" />

        {/* ── Hero: heading + knowledge-base search ─────────────────────────── */}
        <header className="text-center">
          <span className="ds-overline ds-overline-accent">Центр поддержки</span>
          <h1 className="ds-h1 mt-3">Как мы можем помочь?</h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Найдите ответ в базе знаний или напишите нам — обычно отвечаем в течение 24 часов.
          </p>

          <div className="mt-6">
            <div className="flex h-13 w-full items-center gap-3 rounded-2xl border border-border bg-[var(--bg-surface)] px-4 transition focus-within:border-accent-green focus-within:ring-1 focus-within:ring-accent-green">
              <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Искать в базе знаний…"
                aria-label="Поиск по базе знаний"
                className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-hint sm:text-sm"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Очистить поиск"
                  className="relative flex shrink-0 text-muted-foreground transition after:absolute after:-inset-2.5 after:content-[''] hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </div>
        </header>

        {/* ── FAQ ───────────────────────────────────────────────────────────── */}
        <section className="mt-10">
          <h2 className="ds-h3 mb-4">Частые вопросы</h2>

          {noResults ? (
            <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-card">
              <p className="text-sm font-medium">Ничего не найдено</p>
              <p className="mx-auto mt-1 max-w-xs ds-caption">
                По запросу «{query.trim()}» ответов нет. Задайте вопрос через форму ниже — мы
                поможем.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredGroups.map((g) => {
                const Icon = g.icon;
                return (
                  <Card key={g.id}>
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2.5">
                        <span className="ds-feature-icon h-9 w-9">
                          <Icon className="h-[18px] w-[18px]" />
                        </span>
                        {g.title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <Accordion
                        type="multiple"
                        value={openItems}
                        onValueChange={setOpenItems}
                      >
                        {g.items.map((it) => (
                          <AccordionItem
                            key={it.id}
                            value={it.id}
                            className="border-border last:border-0"
                          >
                            <AccordionTrigger className="text-[15px] font-medium hover:no-underline">
                              {it.q}
                            </AccordionTrigger>
                            <AccordionContent className="pr-6 text-sm leading-relaxed text-muted-foreground">
                              {it.a}
                            </AccordionContent>
                          </AccordionItem>
                        ))}
                      </Accordion>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Ways to reach support ─────────────────────────────────────────── */}
        <section id="contact" className="mt-10 scroll-mt-24">
          <h2 className="ds-h3 mb-1">Не нашли ответ?</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Выберите удобный способ связи — или опишите вопрос в форме ниже.
          </p>

          <div className="grid gap-4 sm:grid-cols-3">
            <ContactCard
              icon={Mail}
              title="Электронная почта"
              subtitle={SUPPORT_EMAIL}
              href={`mailto:${SUPPORT_EMAIL}`}
              cta="Написать письмо"
            />
            <ContactCard
              icon={Send}
              title="Telegram"
              subtitle="Оперативные ответы в мессенджере"
              soon
            />
            <ContactCard
              icon={MessageCircle}
              title="Онлайн-чат"
              subtitle="Прямо в интерфейсе студии"
              soon
            />
          </div>
        </section>

        {/* ── Feedback form (mock submit) ───────────────────────────────────── */}
        <section className="mt-6 mb-4">
          <SupportForm />
        </section>
      </div>
    </div>
  );
}

// A single "way to reach us" card. Available channels get a lime feature-icon
// and a CTA; upcoming ones get a neutral icon and a "Скоро" pill instead.
function ContactCard({
  icon: Icon,
  title,
  subtitle,
  href,
  cta,
  soon = false,
}: {
  icon: typeof Mail;
  title: string;
  subtitle: string;
  href?: string;
  cta?: string;
  soon?: boolean;
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-border bg-card p-5 shadow-card">
      <span
        className={
          soon
            ? "flex h-11 w-11 items-center justify-center rounded-xl bg-white/5 text-muted-foreground"
            : "ds-feature-icon h-11 w-11"
        }
      >
        <Icon className="h-5 w-5" />
      </span>
      <h3 className="ds-h4 mt-4">{title}</h3>
      <p className="mt-1 ds-caption">{subtitle}</p>
      <div className="mt-4 pt-1">
        {soon ? (
          <span className="ds-pill ds-pill-neutral">
            <span className="ds-dot" />
            Скоро
          </span>
        ) : (
          <a
            href={href}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[color:var(--border-strong)] px-4 text-sm font-medium text-foreground transition hover:border-white/28 hover:bg-[var(--overlay-hover)]"
          >
            <Mail className="h-4 w-4" />
            {cta}
          </a>
        )}
      </div>
    </div>
  );
}

// Support request form. NOTE: mock submit — there is no support endpoint yet, so
// this simulates a successful send. TODO(backend): replace the timeout with a
// real POST /api/support (fields: topic, email, message, screenshot) once it
// exists; keep the success/error states below.
function SupportForm() {
  const [topic, setTopic] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const fieldCls = "min-h-11 text-base sm:text-sm";

  const reset = () => {
    setTopic("");
    setEmail("");
    setMessage("");
    setFile(null);
    setError("");
    setStatus("idle");
  };

  const onPickFile = (f: File | null) => {
    if (!f) return;
    // On reject, clear the native input too — a file input's onChange only fires
    // when the value CHANGES, so without this, re-picking the same file after a
    // rejection would be a silent no-op.
    if (!f.type.startsWith("image/")) {
      setError("Скриншот должен быть изображением (PNG или JPG).");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setError("Файл больше 5 МБ — прикрепите изображение поменьше.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setError("");
    setFile(f);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!topic) {
      setError("Выберите тему обращения.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Укажите корректный email для ответа.");
      return;
    }
    if (message.trim().length < 10) {
      setError("Опишите вопрос подробнее — минимум 10 символов.");
      return;
    }
    setStatus("sending");
    // Simulated send. Swap for the real API call when the backend is ready.
    await new Promise((r) => setTimeout(r, 900));
    setStatus("sent");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Форма обращения</CardTitle>
        <CardDescription>
          Опишите вопрос — ответим на указанный email в течение 24 часов.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {status === "sent" ? (
          // ── Submission status ──────────────────────────────────────────────
          <div className="flex flex-col items-center py-4 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-green/15 text-accent-green">
              <CheckCircle2 className="h-6 w-6" />
            </span>
            <p className="ds-h4 mt-4">Обращение отправлено</p>
            <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
              Мы ответим в течение 24 часов на{" "}
              <span className="text-foreground">{email.trim()}</span>.
            </p>
            <Button variant="outline" className="mt-5 min-h-11 w-full sm:w-auto" onClick={reset}>
              Отправить ещё одно
            </Button>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={submit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="help-topic" className="mb-2 block ds-label">
                  Тема обращения
                </label>
                <Select value={topic} onValueChange={setTopic}>
                  <SelectTrigger id="help-topic" className={fieldCls}>
                    <SelectValue placeholder="Выберите тему" />
                  </SelectTrigger>
                  <SelectContent>
                    {TOPICS.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label htmlFor="help-email" className="mb-2 block ds-label">
                  Email для ответа
                </label>
                <Input
                  id="help-email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={fieldCls}
                />
              </div>
            </div>

            <div>
              <label htmlFor="help-message" className="mb-2 block ds-label">
                Описание проблемы
              </label>
              <Textarea
                id="help-message"
                rows={5}
                placeholder="Расскажите, что произошло и в каком разделе…"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="text-base sm:text-sm"
              />
            </div>

            <div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
              />
              {file ? (
                <div className="flex w-full items-center gap-2 rounded-lg border border-border bg-elevated py-2 pl-3 pr-2 text-sm sm:inline-flex sm:w-auto sm:max-w-full">
                  <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 truncate text-foreground">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setFile(null);
                      if (fileRef.current) fileRef.current.value = "";
                    }}
                    aria-label="Убрать файл"
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[color:var(--border-strong)] bg-elevated px-4 text-sm text-muted-foreground transition hover:border-white/28 hover:text-foreground sm:w-auto sm:justify-start"
                >
                  <Paperclip className="h-4 w-4" />
                  Прикрепить скриншот
                </button>
              )}
              <p className="mt-1.5 ds-caption">PNG или JPG до 5 МБ, необязательно.</p>
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            <div className="flex flex-col gap-3 pt-1">
              <Button
                type="submit"
                disabled={status === "sending"}
                className="min-h-11 w-full sm:w-auto sm:self-start"
              >
                {status === "sending" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Отправляем…
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Отправить обращение
                  </>
                )}
              </Button>
              <p className="ds-caption">
                Демонстрационная отправка: форма имитирует обращение. Подключение к реальной
                поддержке появится позже.
              </p>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
