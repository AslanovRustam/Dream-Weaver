"use client";

// /billing — тарифы / пополнение кредитов. Открывается из кнопки
// «Пополнить» в личном кабинете. UI ONLY: оплата и логика начисления
// кредитов не реализованы — кнопки CTA это заглушки (см. TODO в PlanCard).
//
// Раскладка по мотивам higgsfield.ai/pricing:
//   • верхняя панель управления: слева переключатель «Индивидуальные /
//     Бизнес», справа тумблер «Ежемесячно / Ежегодно» (годовой = −20%);
//   • три тарифа карточками, средний выделен как «популярный»
//     (лаймовый бордер + градиент + бейдж + лёгкое увеличение);
//   • на годовой оплате под кнопкой — строка экономии за год.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, Sparkles, X } from "lucide-react";

import { AppHeader } from "@/components/AppHeader";
import { useAuth } from "@/lib/auth-context";

type Audience = "individual" | "business";

type Plan = {
  id: string;
  name: string;
  tagline: string;
  // Цена в месяц при помесячной оплате. null = индивидуальная цена ("По запросу").
  monthly: number | null;
  credits: string;
  creditNotes: string[];
  features: { text: string; included: boolean }[];
  popular?: boolean;
  cta?: string;
};

// Плейсхолдер-каталог: суммы, объёмы кредитов и состав тарифов
// иллюстративные, пока не подключена реальная тарификация. Годовая цена
// считается как monthly × 0.8 (скидка 20%). Средний тариф — «популярный».
const INDIVIDUAL_PLANS: Plan[] = [
  {
    id: "start",
    name: "Старт",
    tagline: "Для первых проектов и тестов",
    monthly: 15,
    credits: "300 кредитов/мес",
    creditNotes: ["≈ 75 генераций баннеров", "≈ 150 ресайзов"],
    features: [
      { text: "Параллельные генерации: до 2", included: true },
      { text: "Все форматы ресайзов", included: true },
      { text: "Приоритетная очередь генерации", included: false },
    ],
  },
  {
    id: "pro",
    name: "Профи",
    tagline: "Для регулярной работы",
    monthly: 50,
    credits: "1 000 кредитов/мес",
    creditNotes: ["≈ 250 генераций баннеров", "≈ 500 ресайзов"],
    features: [
      { text: "Параллельные генерации: до 6", included: true },
      { text: "Приоритетная очередь генерации", included: true },
      { text: "Ранний доступ к новым функциям", included: true },
    ],
    popular: true,
  },
  {
    id: "studio",
    name: "Студия",
    tagline: "Максимум объёма для потока задач",
    monthly: 125,
    credits: "3 000 кредитов/мес",
    creditNotes: ["≈ 750 генераций баннеров", "≈ 1 500 ресайзов"],
    features: [
      { text: "Параллельные генерации: до 12", included: true },
      { text: "Приоритетная очередь генерации", included: true },
      { text: "Самая низкая цена за кредит", included: true },
    ],
  },
];

const BUSINESS_PLANS: Plan[] = [
  {
    id: "team",
    name: "Команда",
    tagline: "Для небольшой команды дизайнеров",
    monthly: 250,
    credits: "8 000 кредитов/мес",
    creditNotes: ["≈ 2 000 генераций баннеров", "до 5 пользователей"],
    features: [
      { text: "Общий баланс на команду", included: true },
      { text: "Роли и права доступа", included: true },
      { text: "Выделенный менеджер", included: false },
    ],
  },
  {
    id: "agency",
    name: "Агентство",
    tagline: "Для агентств и больших потоков",
    monthly: 600,
    credits: "20 000 кредитов/мес",
    creditNotes: ["≈ 5 000 генераций баннеров", "до 15 пользователей"],
    features: [
      { text: "Общий баланс на команду", included: true },
      { text: "Роли и права доступа", included: true },
      { text: "Выделенный менеджер", included: true },
    ],
    popular: true,
  },
  {
    id: "enterprise",
    name: "Корпоративный",
    tagline: "Индивидуальные условия под задачи",
    monthly: null,
    credits: "Кредиты по договору",
    creditNotes: ["Объём под ваш поток", "Без лимита пользователей"],
    features: [
      { text: "Кастомный объём кредитов", included: true },
      { text: "SSO и контроль доступа", included: true },
      { text: "Приоритетная поддержка и SLA", included: true },
    ],
    cta: "Связаться с нами",
  },
];

export default function BillingPage() {
  const router = useRouter();
  const { isAuthenticated, loading } = useAuth();
  const [audience, setAudience] = useState<Audience>("individual");
  const [annual, setAnnual] = useState(true);

  useEffect(() => {
    document.title = "Тарифы — Dream Weaver Studio";
  }, []);

  useEffect(() => {
    if (!loading && !isAuthenticated) router.push("/login");
  }, [loading, isAuthenticated, router]);

  const plans = audience === "individual" ? INDIVIDUAL_PLANS : BUSINESS_PLANS;

  return (
    <div className="min-h-screen">
      <AppHeader />
      <div className="mx-auto max-w-5xl px-4 py-8">
        <Link
          href="/account"
          className="-mx-2 mb-6 inline-flex min-h-11 w-fit items-center gap-1 rounded-lg px-2 text-sm text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
        >
          <ChevronLeft className="h-5 w-5" />
          Назад
        </Link>

        <div className="mb-8 text-center">
          <h1 className="ds-h1 sm:text-3xl">Тарифы</h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Кредиты начисляются каждый месяц и тратятся на генерацию баннеров и ресайзов.
            При оплате за год — скидка 20%.
          </p>
        </div>

        {/* Панель управления. Desktop: аудитория слева, период справа. Mobile:
            период сверху, табы аудитории под ним (flex-col-reverse). */}
        <div className="mb-10 flex flex-col-reverse items-center justify-between gap-4 sm:flex-row">
          <Segmented
            value={audience}
            onChange={(v) => setAudience(v as Audience)}
            options={[
              { value: "individual", label: "Индивидуальные" },
              { value: "business", label: "Бизнес" },
            ]}
          />
          <PeriodSwitch annual={annual} onChange={setAnnual} />
        </div>

        <div className="grid items-stretch gap-6 md:grid-cols-3">
          {plans.map((plan) => (
            <PlanCard key={plan.id} plan={plan} annual={annual} />
          ))}
        </div>

        <p className="mx-auto mt-8 max-w-md text-center text-xs text-muted-foreground">
          Онлайн-оплата скоро будет доступна. Пока пополнение проводится через администратора —
          напишите в поддержку из личного кабинета.
        </p>
      </div>
    </div>
  );
}

function Segmented({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-card p-1 max-sm:flex max-sm:w-full">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition max-sm:min-h-11 max-sm:flex-1 ${
              active ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function PeriodSwitch({ annual, onChange }: { annual: boolean; onChange: (v: boolean) => void }) {
  // Все три зоны кликабельны (лейбл «Ежемесячно», сам тумблер, лейбл
  // «Ежегодно»), чтобы переключение срабатывало по любому нажатию.
  // Mobile: 3-column grid (1fr | toggle | 1fr) keeps the TOGGLE dead-centre on
  // screen even though the right side carries the extra "−20%" badge. Desktop:
  // plain inline-flex.
  return (
    <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-3 text-sm sm:inline-flex sm:w-auto">
      <button
        type="button"
        onClick={() => onChange(false)}
        className={`justify-self-end whitespace-nowrap ${annual ? "text-muted-foreground transition hover:text-foreground" : "font-medium text-foreground"}`}
      >
        Ежемесячно
      </button>
      <button
        type="button"
        role="switch"
        aria-checked={annual}
        aria-label="Переключить период оплаты"
        onClick={() => onChange(!annual)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors after:absolute after:left-1/2 after:top-1/2 after:h-11 after:w-11 after:-translate-x-1/2 after:-translate-y-1/2 after:content-[''] ${
          annual ? "bg-white/30" : "bg-white/15"
        }`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
            annual ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
      <div className="flex items-center gap-2 justify-self-start whitespace-nowrap">
        <button
          type="button"
          onClick={() => onChange(true)}
          className={annual ? "font-medium text-foreground" : "text-muted-foreground transition hover:text-foreground"}
        >
          Ежегодно
        </button>
        <span className="rounded-full bg-accent-green/15 px-2 py-0.5 text-xs font-semibold text-accent-green">
          −20%
        </span>
      </div>
    </div>
  );
}

function PlanCard({ plan, annual }: { plan: Plan; annual: boolean }) {
  const popular = plan.popular;
  const custom = plan.monthly === null;
  const annualPerMonth = custom ? null : Math.round((plan.monthly as number) * 0.8);
  const current = annual ? annualPerMonth : plan.monthly;
  const savings = custom ? 0 : ((plan.monthly as number) - (annualPerMonth as number)) * 12;

  return (
    <div
      className={`relative flex h-full flex-col gap-6 rounded-2xl border p-6 transition sm:p-7 ${
        popular
          ? "border-accent-green shadow-[0_0_50px_rgba(198,255,61,0.10)] md:scale-[1.04]"
          : "border-border bg-card hover:border-white/25 hover:bg-[color:var(--bg-surface-hover)]"
      }`}
      style={
        popular
          ? {
              background:
                "linear-gradient(180deg, rgba(198,255,61,0.14) 0%, rgba(198,255,61,0.05) 20%, rgba(18,20,26,0.92) 52%, var(--bg-surface) 100%)",
            }
          : undefined
      }
    >
      {popular ? (
        <span className="absolute -top-3 left-1/2 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-accent-green px-3 py-1 text-xs font-semibold text-black">
          <Sparkles className="h-3.5 w-3.5" />
          Популярный выбор
        </span>
      ) : null}

      {/* Название + подзаголовок */}
      <div>
        <h2 className="text-xl font-semibold">{plan.name}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{plan.tagline}</p>
      </div>

      {/* Блок кредитов */}
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 shrink-0 text-accent-green" />
          <span className="text-lg font-semibold">{plan.credits}</span>
        </div>
        <ul className="mt-2 space-y-1 pl-6 text-sm text-muted-foreground">
          {plan.creditNotes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </div>

      {/* Цена — «в месяц» стоит рядом с суммой */}
      <div className="flex items-baseline gap-2">
        {annual && !custom ? (
          <span className="text-xl font-medium text-muted-foreground line-through">
            ${plan.monthly}
          </span>
        ) : null}
        <span className="text-4xl font-semibold tracking-tight tabular-nums">
          {custom ? "По запросу" : `$${current}`}
        </span>
        {!custom ? <span className="text-sm text-muted-foreground">в месяц</span> : null}
      </div>

      {/* CTA + экономия за год (только на годовой оплате) */}
      <div className="space-y-3">
        {/* TODO: подключить оплату. Пока это UI без логики списания/начисления. */}
        <button
          type="button"
          className={`w-full rounded-lg px-5 py-3 text-sm font-semibold transition max-sm:min-h-12 ${
            popular
              ? "bg-accent-green text-black hover:bg-[var(--accent-hover)]"
              : // Desktop: outline. Mobile: solid white fill + dark text — the
                // outline reads poorly on a small dark screen.
                "border border-border text-foreground hover:bg-white/5 max-sm:border-transparent max-sm:bg-white max-sm:text-black max-sm:hover:bg-white/90"
          }`}
        >
          {plan.cta ?? "Выбрать план"}
        </button>
        {!custom ? (
          // Слот экономии всегда занимает место (в помесячном режиме он
          // невидим), чтобы карточки не прыгали по высоте при переключении.
          <div
            aria-hidden={!annual}
            className={`rounded-lg bg-white/[0.03] px-3 py-2 text-center text-xs ${
              annual ? "" : "invisible"
            }`}
          >
            <span className="font-semibold text-foreground">Экономия ${savings}</span>
            <span className="text-muted-foreground"> в год</span>
          </div>
        ) : null}
      </div>

      {/* Состав тарифа */}
      <ul className="space-y-3 border-t border-border/60 pt-6">
        {plan.features.map((f) => (
          <li key={f.text} className="flex items-start gap-2.5 text-sm">
            {f.included ? (
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-foreground" strokeWidth={2.5} />
            ) : (
              <X className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2.5} />
            )}
            {/* Not-included features stay dimmer than included ones via the
                muted colour (not opacity) so the text still passes WCAG AA. */}
            <span className={f.included ? "text-foreground" : "text-muted-foreground"}>
              {f.text}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
