// Landing-generator model + client-side "generation".
//
// There is no landing API yet, so generation is assembled on the client: we
// build a self-contained, on-brand HTML landing page from the form inputs and
// the selected sections, then return it as an HTML string for the preview
// iframe / download. `generateLanding` is intentionally async with a short
// delay so the flow (loading → result) mirrors the Banner-generator and a real
// POST /api/landing can be dropped in later without touching the UI.

export type LandingVertical = "betting" | "gambling" | "sport";

export type LandingSectionId =
  | "hero"
  | "benefits"
  | "howto"
  | "trust"
  | "cta"
  | "footer";

/** The section catalogue shown as checkboxes. All default ON. */
export const LANDING_SECTIONS: {
  id: LandingSectionId;
  label: string;
  hint: string;
  /** Marked "рекомендуется" for gambling/betting compliance. */
  compliance?: boolean;
}[] = [
  { id: "hero", label: "Hero (главный экран с оффером)", hint: "Логотип, заголовок, оффер и кнопка" },
  { id: "benefits", label: "Преимущества / Бонусы", hint: "3 карточки с ключевыми выгодами" },
  { id: "howto", label: "Как начать", hint: "Шаги: регистрация → депозит → игра" },
  {
    id: "trust",
    label: "Отзывы / Доверие",
    hint: "Trust-badges, лицензии, отзывы",
    compliance: true,
  },
  { id: "cta", label: "CTA-блок", hint: "Повторный призыв к действию" },
  {
    id: "footer",
    label: "Футер с дисклеймером",
    hint: "18+, условия, ответственная игра",
    compliance: true,
  },
];

export type LandingTemplate = {
  id: string;
  vertical: LandingVertical;
  name: string;
  description: string;
  /** Accent colour used in the generated landing (hex). */
  accent: string;
  /** Card preview background. */
  gradient: string;
};

export type LandingTemplateCategory = {
  id: LandingVertical;
  label: string;
  templates: LandingTemplate[];
};

// Verticals mirror the Banner-generator categories. Each has a primary template
// plus one alternative style revealed by "Все" — the alternative changes the
// accent colour of the generated landing so the choice is visible.
export const LANDING_TEMPLATE_CATEGORIES: LandingTemplateCategory[] = [
  {
    id: "betting",
    label: "Betting",
    templates: [
      {
        id: "betting-classic",
        vertical: "betting",
        name: "Ставки — классик",
        description: "Спорт-беттинг: коэффициенты, экспресс, бонус на депозит",
        accent: "#38bdf8",
        gradient: "linear-gradient(135deg,#0b1220,#1d4ed8,#38bdf8)",
      },
      {
        id: "betting-express",
        vertical: "betting",
        name: "Экспресс дня",
        description: "Акцент на экспрессы и фрибет",
        accent: "#22d3ee",
        gradient: "linear-gradient(135deg,#020617,#0ea5e9,#22d3ee)",
      },
    ],
  },
  {
    id: "gambling",
    label: "Gambling",
    templates: [
      {
        id: "gambling-bonus",
        vertical: "gambling",
        name: "Казино — приветственный бонус",
        description: "Оффер на депозит, фриспины, джекпоты",
        accent: "#38bdf8",
        gradient: "linear-gradient(135deg,#0f172a,#3b82f6,#93c5fd)",
      },
      {
        id: "gambling-slot",
        vertical: "gambling",
        name: "Слот-лендинг",
        description: "Продвижение конкретного слота",
        accent: "#818cf8",
        gradient: "linear-gradient(135deg,#020617,#4338ca,#818cf8)",
      },
    ],
  },
  {
    id: "sport",
    label: "Sport",
    templates: [
      {
        id: "sport-match",
        vertical: "sport",
        name: "Матч / событие",
        description: "Ставка на конкретный матч, face-off",
        accent: "#38bdf8",
        gradient: "linear-gradient(135deg,#0b1220,#0369a1,#38bdf8)",
      },
      {
        id: "sport-tournament",
        vertical: "sport",
        name: "Турнир",
        description: "Серия матчей, призовой фонд",
        accent: "#60a5fa",
        gradient: "linear-gradient(135deg,#0b1220,#1e40af,#60a5fa)",
      },
    ],
  },
];

export const LANDING_TEMPLATE_BY_ID = new Map(
  LANDING_TEMPLATE_CATEGORIES.flatMap((c) => c.templates).map((t) => [t.id, t]),
);

/** Map a Banner-generator preset id to a landing vertical (for the handoff). */
export function bannerPresetToVertical(preset: string): LandingVertical {
  if (preset === "preset4") return "sport";
  if (preset === "preset3") return "betting";
  return "gambling"; // preset1 (wide-angle) / preset2 (slot) / default
}

/** The primary (first) template accent for a vertical — used when the vertical
 *  is inherited from a banner and no template was picked. */
export function accentForVertical(vertical: LandingVertical): string {
  const cat = LANDING_TEMPLATE_CATEGORIES.find((c) => c.id === vertical);
  return cat?.templates[0]?.accent ?? "#38bdf8";
}

export type LandingInput = {
  vertical: LandingVertical;
  accent: string;
  brandName: string;
  brandLogo: string;
  language: string;
  subject: string;
  occasion: string;
  sections: Record<LandingSectionId, boolean>;
  ctaText: string;
  offerDetails: string;
  /** When set, the banner image is used as the Hero visual (from-banner flow). */
  heroImage?: string;
};

export type LandingResult = {
  html: string;
  generatedSections: LandingSectionId[];
};

// ---- editor: language versions + editable text fields ----------------------

/** Languages the landing copy is actually translated into (drive the editor's
 *  language switcher / "add language"). Other creative languages fall back. */
export const LANDING_LANGS: { code: string; short: string; label: string }[] = [
  { code: "ru", short: "RU", label: "Русский" },
  { code: "uk", short: "UA", label: "Українська" },
  { code: "en", short: "EN", label: "English" },
];

export function normalizeLandingLang(lang: string): string {
  return lang === "en" ? "en" : lang === "uk" ? "uk" : "ru";
}

/** Text slots the editor exposes for inline (side-panel) editing. */
export type LandingTextField =
  | "heroHeadline"
  | "lead"
  | "cta"
  | "offer"
  | "benefitsTitle"
  | "howtoTitle"
  | "trustTitle"
  | "ctaTitle";

export const LANDING_TEXT_FIELDS: {
  key: LandingTextField;
  label: string;
  multiline?: boolean;
}[] = [
  { key: "heroHeadline", label: "Заголовок Hero" },
  { key: "lead", label: "Подзаголовок Hero", multiline: true },
  { key: "cta", label: "Текст CTA-кнопки" },
  { key: "offer", label: "Детали оффера", multiline: true },
  { key: "benefitsTitle", label: "Заголовок «Преимущества»" },
  { key: "howtoTitle", label: "Заголовок «Как начать»" },
  { key: "trustTitle", label: "Заголовок «Доверие»" },
  { key: "ctaTitle", label: "Заголовок CTA-блока" },
];

export type LandingTextOverrides = Partial<Record<LandingTextField, string>>;

/** Default (unedited) value of an editable field for a given input/language. */
export function defaultTextFor(input: LandingInput, field: LandingTextField): string {
  const c = copyFor(input.vertical, input.language);
  switch (field) {
    case "heroHeadline":
      return c.heroHeadline;
    case "lead":
      return input.subject.trim();
    case "cta":
      return input.ctaText.trim() || c.bonusLabel;
    case "offer":
      return input.offerDetails.trim();
    case "benefitsTitle":
      return c.benefitsTitle;
    case "howtoTitle":
      return c.howtoTitle;
    case "trustTitle":
      return c.trustTitle;
    case "ctaTitle":
      return c.ctaTitle;
  }
}

// Per-field typography. Shared, reusable across every text block.
export type TextStyle = { fontFamily?: string; fontSize?: number; fontWeight?: number };
export type LandingTextStyles = Partial<Record<LandingTextField, TextStyle>>;

/** Web-safe font stacks (self-contained HTML — no external font loading). */
export const LANDING_FONTS: { label: string; value: string }[] = [
  { label: "По умолчанию", value: "" },
  { label: "Sans (Arial)", value: "Arial, Helvetica, sans-serif" },
  { label: "Grotesk (Verdana)", value: "Verdana, Geneva, sans-serif" },
  { label: "Serif (Georgia)", value: "Georgia, 'Times New Roman', serif" },
  { label: "Slab (Rockwell)", value: "Rockwell, Georgia, serif" },
  { label: "Mono", value: "'Courier New', ui-monospace, monospace" },
];

export const LANDING_WEIGHTS: { label: string; value: number }[] = [
  { label: "Regular", value: 400 },
  { label: "Semi Bold", value: 600 },
  { label: "Bold", value: 700 },
];

export const LANDING_FONT_SIZE = { min: 12, max: 72, step: 1 };

/** CSS rules that apply per-field typography to the `data-f`-tagged elements. */
export function landingStylesCss(styles: LandingTextStyles): string {
  return LANDING_TEXT_FIELDS.map((f) => {
    const s = styles[f.key];
    if (!s) return "";
    const decl: string[] = [];
    if (s.fontFamily) decl.push(`font-family:${s.fontFamily}`);
    if (s.fontSize) decl.push(`font-size:${s.fontSize}px`);
    if (s.fontWeight) decl.push(`font-weight:${s.fontWeight}`);
    return decl.length ? `[data-f="${f.key}"]{${decl.join(";")} !important}` : "";
  }).join("");
}

// ---- copy dictionaries ------------------------------------------------------

type Copy = {
  heroHeadline: string;
  benefitsTitle: string;
  benefits: [string, string][]; // [title, text]
  howtoTitle: string;
  steps: [string, string][];
  trustTitle: string;
  badges: string[];
  reviews: [string, string][]; // [name, text]
  ctaTitle: string;
  ctaSub: string;
  age: string;
  disclaimer: string;
  bonusLabel: string;
};

function copyFor(vertical: LandingVertical, lang: string): Copy {
  // Latin-script languages fall back to EN; uk keeps Ukrainian; everything
  // else (ru, auto, es/de/fr/pl handled above) → ru.
  const base = lang === "en" ? "en" : lang === "uk" ? "uk" : "ru";
  const dict: Record<"ru" | "uk" | "en", Record<LandingVertical, Copy>> = {
    ru: {
      gambling: {
        heroHeadline: "Приветственный бонус для новых игроков",
        benefitsTitle: "Почему выбирают нас",
        benefits: [
          ["Щедрые бонусы", "Бонус на первый депозит и фриспины каждую неделю"],
          ["Быстрые выплаты", "Вывод средств за считанные минуты, без скрытых комиссий"],
          ["Сотни игр", "Слоты, live-казино и джекпоты от топовых провайдеров"],
        ],
        howtoTitle: "Как начать играть",
        steps: [
          ["Регистрация", "Создайте аккаунт за минуту"],
          ["Депозит", "Пополните счёт удобным способом"],
          ["Игра", "Активируйте бонус и играйте"],
        ],
        trustTitle: "Нам доверяют",
        badges: ["Лицензия Curaçao", "SSL-шифрование", "18+", "Поддержка 24/7"],
        reviews: [
          ["Алексей", "Вывел выигрыш за 10 минут, всё честно."],
          ["Марина", "Классные бонусы и огромный выбор слотов."],
        ],
        ctaTitle: "Готовы забрать свой бонус?",
        ctaSub: "Регистрация занимает меньше минуты",
        age: "18+ Играйте ответственно",
        disclaimer:
          "Азартные игры могут вызывать зависимость. Играйте ответственно. Услуги доступны только лицам старше 18 лет.",
        bonusLabel: "Забрать бонус",
      },
      betting: {
        heroHeadline: "Делай ставки и выигрывай больше",
        benefitsTitle: "Наши преимущества",
        benefits: [
          ["Высокие коэффициенты", "Лучшие кэфы на топовые события и лиги"],
          ["Бонус на депозит", "Фрибет для новых игроков и кэшбэк на экспрессы"],
          ["Live-ставки", "Ставки в реальном времени с быстрым расчётом"],
        ],
        howtoTitle: "Как сделать ставку",
        steps: [
          ["Регистрация", "Создайте аккаунт за минуту"],
          ["Депозит", "Пополните счёт и получите фрибет"],
          ["Ставка", "Выберите событие и сделайте ставку"],
        ],
        trustTitle: "Нам доверяют",
        badges: ["Лицензия", "SSL-шифрование", "18+", "Поддержка 24/7"],
        reviews: [
          ["Дмитрий", "Быстрый вывод и отличные коэффициенты."],
          ["Игорь", "Удобный live и щедрый фрибет на старт."],
        ],
        ctaTitle: "Готовы сделать первую ставку?",
        ctaSub: "Фрибет начисляется сразу после депозита",
        age: "18+ Делайте ставки ответственно",
        disclaimer:
          "Ставки могут вызывать зависимость. Делайте ставки ответственно. Услуги доступны только лицам старше 18 лет.",
        bonusLabel: "Сделать ставку",
      },
      sport: {
        heroHeadline: "Успей поставить на главный матч",
        benefitsTitle: "Почему стоит поставить у нас",
        benefits: [
          ["Топовые события", "Все ключевые матчи и турниры в одном месте"],
          ["Экспресс-бонус", "До +15% к выигрышу с экспрессом"],
          ["Быстрый расчёт", "Мгновенный расчёт ставок после матча"],
        ],
        howtoTitle: "Как поставить на матч",
        steps: [
          ["Регистрация", "Создайте аккаунт за минуту"],
          ["Депозит", "Пополните счёт удобным способом"],
          ["Ставка", "Выберите матч и подтвердите ставку"],
        ],
        trustTitle: "Нам доверяют",
        badges: ["Лицензия", "SSL-шифрование", "18+", "Поддержка 24/7"],
        reviews: [
          ["Сергей", "Поставил на дерби — вывод пришёл сразу."],
          ["Павел", "Отличная линия и живой эфир матчей."],
        ],
        ctaTitle: "Не пропусти матч — сделай ставку",
        ctaSub: "Коэффициенты меняются перед стартом",
        age: "18+ Делайте ставки ответственно",
        disclaimer:
          "Ставки могут вызывать зависимость. Делайте ставки ответственно. Услуги доступны только лицам старше 18 лет.",
        bonusLabel: "Поставить на матч",
      },
    },
    uk: {
      gambling: {
        heroHeadline: "Вітальний бонус для нових гравців",
        benefitsTitle: "Чому обирають нас",
        benefits: [
          ["Щедрі бонуси", "Бонус на перший депозит і фриспіни щотижня"],
          ["Швидкі виплати", "Виведення коштів за лічені хвилини, без комісій"],
          ["Сотні ігор", "Слоти, live-казино та джекпоти від топових провайдерів"],
        ],
        howtoTitle: "Як почати грати",
        steps: [
          ["Реєстрація", "Створіть акаунт за хвилину"],
          ["Депозит", "Поповніть рахунок зручним способом"],
          ["Гра", "Активуйте бонус і грайте"],
        ],
        trustTitle: "Нам довіряють",
        badges: ["Ліцензія Curaçao", "SSL-шифрування", "18+", "Підтримка 24/7"],
        reviews: [
          ["Олексій", "Вивів виграш за 10 хвилин, усе чесно."],
          ["Марина", "Класні бонуси та величезний вибір слотів."],
        ],
        ctaTitle: "Готові забрати свій бонус?",
        ctaSub: "Реєстрація займає менше хвилини",
        age: "18+ Грайте відповідально",
        disclaimer:
          "Азартні ігри можуть викликати залежність. Грайте відповідально. Послуги доступні лише особам, старшим за 18 років.",
        bonusLabel: "Забрати бонус",
      },
      betting: {
        heroHeadline: "Роби ставки та вигравай більше",
        benefitsTitle: "Наші переваги",
        benefits: [
          ["Високі коефіцієнти", "Найкращі кефи на топові події та ліги"],
          ["Бонус на депозит", "Фрибет для нових гравців і кешбек на експреси"],
          ["Live-ставки", "Ставки в реальному часі зі швидким розрахунком"],
        ],
        howtoTitle: "Як зробити ставку",
        steps: [
          ["Реєстрація", "Створіть акаунт за хвилину"],
          ["Депозит", "Поповніть рахунок і отримайте фрибет"],
          ["Ставка", "Оберіть подію та зробіть ставку"],
        ],
        trustTitle: "Нам довіряють",
        badges: ["Ліцензія", "SSL-шифрування", "18+", "Підтримка 24/7"],
        reviews: [
          ["Дмитро", "Швидке виведення та чудові коефіцієнти."],
          ["Ігор", "Зручний live і щедрий фрибет на старт."],
        ],
        ctaTitle: "Готові зробити першу ставку?",
        ctaSub: "Фрибет нараховується одразу після депозиту",
        age: "18+ Робіть ставки відповідально",
        disclaimer:
          "Ставки можуть викликати залежність. Робіть ставки відповідально. Послуги доступні лише особам, старшим за 18 років.",
        bonusLabel: "Зробити ставку",
      },
      sport: {
        heroHeadline: "Встигни поставити на головний матч",
        benefitsTitle: "Чому варто поставити в нас",
        benefits: [
          ["Топові події", "Усі ключові матчі та турніри в одному місці"],
          ["Експрес-бонус", "До +15% до виграшу з експресом"],
          ["Швидкий розрахунок", "Миттєвий розрахунок ставок після матчу"],
        ],
        howtoTitle: "Як поставити на матч",
        steps: [
          ["Реєстрація", "Створіть акаунт за хвилину"],
          ["Депозит", "Поповніть рахунок зручним способом"],
          ["Ставка", "Оберіть матч і підтвердіть ставку"],
        ],
        trustTitle: "Нам довіряють",
        badges: ["Ліцензія", "SSL-шифрування", "18+", "Підтримка 24/7"],
        reviews: [
          ["Сергій", "Поставив на дербі — виведення прийшло одразу."],
          ["Павло", "Чудова лінія та живий ефір матчів."],
        ],
        ctaTitle: "Не пропусти матч — зроби ставку",
        ctaSub: "Коефіцієнти змінюються перед стартом",
        age: "18+ Робіть ставки відповідально",
        disclaimer:
          "Ставки можуть викликати залежність. Робіть ставки відповідально. Послуги доступні лише особам, старшим за 18 років.",
        bonusLabel: "Поставити на матч",
      },
    },
    en: {
      gambling: {
        heroHeadline: "Welcome bonus for new players",
        benefitsTitle: "Why players choose us",
        benefits: [
          ["Generous bonuses", "First deposit bonus and weekly free spins"],
          ["Fast payouts", "Withdraw your winnings in minutes, no hidden fees"],
          ["Hundreds of games", "Slots, live casino and jackpots from top providers"],
        ],
        howtoTitle: "How to start playing",
        steps: [
          ["Sign up", "Create an account in a minute"],
          ["Deposit", "Top up with your preferred method"],
          ["Play", "Activate your bonus and play"],
        ],
        trustTitle: "Trusted by players",
        badges: ["Curaçao license", "SSL encryption", "18+", "24/7 support"],
        reviews: [
          ["Alex", "Withdrew my winnings in 10 minutes, all fair."],
          ["Marina", "Great bonuses and a huge selection of slots."],
        ],
        ctaTitle: "Ready to claim your bonus?",
        ctaSub: "Sign-up takes less than a minute",
        age: "18+ Play responsibly",
        disclaimer:
          "Gambling can be addictive. Play responsibly. Services are available to persons over 18 only.",
        bonusLabel: "Claim bonus",
      },
      betting: {
        heroHeadline: "Bet and win more",
        benefitsTitle: "Our advantages",
        benefits: [
          ["High odds", "The best odds on top events and leagues"],
          ["Deposit bonus", "Free bet for new players and accumulator cashback"],
          ["Live betting", "Real-time bets with instant settlement"],
        ],
        howtoTitle: "How to place a bet",
        steps: [
          ["Sign up", "Create an account in a minute"],
          ["Deposit", "Top up and get your free bet"],
          ["Bet", "Pick an event and place your bet"],
        ],
        trustTitle: "Trusted by players",
        badges: ["Licensed", "SSL encryption", "18+", "24/7 support"],
        reviews: [
          ["Dmitry", "Fast payouts and excellent odds."],
          ["Igor", "Convenient live and a generous starting free bet."],
        ],
        ctaTitle: "Ready to place your first bet?",
        ctaSub: "Free bet credited right after your deposit",
        age: "18+ Bet responsibly",
        disclaimer:
          "Betting can be addictive. Bet responsibly. Services are available to persons over 18 only.",
        bonusLabel: "Place a bet",
      },
      sport: {
        heroHeadline: "Bet on the big match in time",
        benefitsTitle: "Why bet with us",
        benefits: [
          ["Top events", "All the key matches and tournaments in one place"],
          ["Accumulator bonus", "Up to +15% to your winnings with an accumulator"],
          ["Fast settlement", "Instant bet settlement after the match"],
        ],
        howtoTitle: "How to bet on a match",
        steps: [
          ["Sign up", "Create an account in a minute"],
          ["Deposit", "Top up with your preferred method"],
          ["Bet", "Pick a match and confirm your bet"],
        ],
        trustTitle: "Trusted by players",
        badges: ["Licensed", "SSL encryption", "18+", "24/7 support"],
        reviews: [
          ["Sergey", "Bet on the derby — payout came instantly."],
          ["Pavel", "Great line-up and live match streaming."],
        ],
        ctaTitle: "Don't miss the match — place your bet",
        ctaSub: "Odds change right before kick-off",
        age: "18+ Bet responsibly",
        disclaimer:
          "Betting can be addictive. Bet responsibly. Services are available to persons over 18 only.",
        bonusLabel: "Bet on the match",
      },
    },
  };
  return dict[base][vertical];
}

// ---- HTML builder -----------------------------------------------------------

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Assemble the full self-contained landing HTML from the input. */
export function buildLandingHtml(
  input: LandingInput,
  overrides: LandingTextOverrides = {},
  styles: LandingTextStyles = {},
): string {
  const c = copyFor(input.vertical, input.language);
  const on = input.sections;
  const accent = /^#[0-9a-fA-F]{3,8}$/.test(input.accent) ? input.accent : "#38bdf8";
  // Resolve editable text slots: an override (incl. empty string) wins over the
  // generated/default value.
  const ov = (field: LandingTextField, fallback: string) =>
    overrides[field] !== undefined ? (overrides[field] as string) : fallback;
  const heroHeadline = ov("heroHeadline", c.heroHeadline);
  const lead = ov("lead", input.subject.trim());
  const offer = ov("offer", input.offerDetails.trim());
  const benefitsTitle = ov("benefitsTitle", c.benefitsTitle);
  const howtoTitle = ov("howtoTitle", c.howtoTitle);
  const trustTitle = ov("trustTitle", c.trustTitle);
  const ctaTitle = ov("ctaTitle", c.ctaTitle);
  const cta = ov("cta", input.ctaText.trim() || c.bonusLabel);
  const brand = input.brandName.trim() || "Your Brand";
  const eyebrow = input.occasion.trim() || (input.brandName.trim() ? "" : benefitsTitle);
  const year = new Date().getFullYear();

  const logo = input.brandLogo
    ? `<img src="${input.brandLogo}" alt="${esc(brand)}" class="logo-img" />`
    : `<span class="logo-text">${esc(brand)}</span>`;

  const heroBtn = `<a href="#cta" class="btn" data-f="cta">${esc(cta)}</a>`;
  const heroImg = input.heroImage && input.heroImage.trim() ? input.heroImage.trim() : "";
  const heroText = `
        ${eyebrow ? `<div class="eyebrow">${esc(eyebrow)}</div>` : ""}
        <h1 data-f="heroHeadline">${esc(heroHeadline)}</h1>
        ${lead ? `<p class="lead" data-f="lead">${esc(lead)}</p>` : ""}
        ${heroBtn}
        ${offer ? `<p class="fine" data-f="offer">${esc(offer)}</p>` : ""}`;

  const hero = on.hero
    ? `
    <header class="hero${heroImg ? " hero--split" : ""}">
      <nav class="nav">${logo}<a href="#cta" class="btn btn-sm">${esc(cta)}</a></nav>
      <div class="hero-body">
        <div class="hero-text">${heroText}</div>
        ${heroImg ? `<div class="hero-media"><img src="${esc(heroImg)}" alt="${esc(brand)}" /></div>` : ""}
      </div>
    </header>`
    : "";

  const benefits = on.benefits
    ? `
    <section class="section">
      <h2 data-f="benefitsTitle">${esc(benefitsTitle)}</h2>
      <div class="grid grid-3">
        ${c.benefits
          .map(
            ([t, d]) => `<div class="card"><div class="dot"></div><h3>${esc(t)}</h3><p>${esc(d)}</p></div>`,
          )
          .join("")}
      </div>
    </section>`
    : "";

  const howto = on.howto
    ? `
    <section class="section">
      <h2 data-f="howtoTitle">${esc(howtoTitle)}</h2>
      <div class="grid grid-3 steps">
        ${c.steps
          .map(
            ([t, d], i) =>
              `<div class="card step"><div class="num">${i + 1}</div><h3>${esc(t)}</h3><p>${esc(d)}</p></div>`,
          )
          .join("")}
      </div>
    </section>`
    : "";

  const trust = on.trust
    ? `
    <section class="section trust">
      <h2 data-f="trustTitle">${esc(trustTitle)}</h2>
      <div class="badges">
        ${c.badges.map((b) => `<span class="badge">${esc(b)}</span>`).join("")}
      </div>
      <div class="grid grid-2 reviews">
        ${c.reviews
          .map(
            ([n, t]) =>
              `<figure class="card review"><blockquote>“${esc(t)}”</blockquote><figcaption>— ${esc(n)}</figcaption></figure>`,
          )
          .join("")}
      </div>
    </section>`
    : "";

  const ctaBlock = on.cta
    ? `
    <section class="section cta-block" id="cta">
      <h2 data-f="ctaTitle">${esc(ctaTitle)}</h2>
      <p class="lead">${esc(c.ctaSub)}</p>
      <a href="#" class="btn btn-lg" data-f="cta">${esc(cta)}</a>
    </section>`
    : "";

  const footer = on.footer
    ? `
    <footer class="footer">
      <div class="age">${esc(c.age)}</div>
      <p class="disclaimer">${esc(c.disclaimer)}</p>
      <p class="legal">© ${year} ${esc(brand)}. ${esc(
        input.language === "en"
          ? "All rights reserved. Terms & Conditions · Privacy Policy · Responsible Gaming"
          : input.language === "uk"
            ? "Усі права захищені. Умови · Політика конфіденційності · Відповідальна гра"
            : "Все права защищены. Условия · Политика конфиденциальности · Ответственная игра",
      )}</p>
    </footer>`
    : "";

  const lang = input.language === "en" ? "en" : input.language === "uk" ? "uk" : "ru";

  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(brand)}</title>
<style>
  /* Preview mockup uses a distinct sky-blue / slate palette so it reads as
     generated content, not the product's own (lime) UI. */
  :root { --accent: ${accent}; --ink: #0b1017; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #0b1017; color: #eef2f8; line-height: 1.5; }
  /* Custom scrollbar — same thin pill shape as the app, but tinted to this
     preview's own (blue) palette so it stays coherent with the mockup. */
  @supports not selector(::-webkit-scrollbar) { * { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.28) transparent; } }
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(255,255,255,.28); border-radius: 9999px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--accent); }
  ::-webkit-scrollbar-button { display: none; width: 0; height: 0; }
  ::-webkit-scrollbar-corner { background: transparent; }
  a { text-decoration: none; }
  h1 { font-size: clamp(30px, 6vw, 60px); line-height: 1.05; letter-spacing: -0.02em; font-weight: 800; max-width: 14ch; }
  h2 { font-size: clamp(22px, 3.6vw, 34px); letter-spacing: -0.01em; margin-bottom: 24px; font-weight: 700; }
  h3 { font-size: 18px; margin-bottom: 6px; font-weight: 700; }
  p { color: #a7b0c2; }
  .btn { display: inline-block; background: var(--accent); color: var(--ink); font-weight: 800; padding: 15px 30px; border-radius: 12px; font-size: 16px; transition: filter .15s; }
  .btn:hover { filter: brightness(1.08); }
  .btn-sm { padding: 9px 16px; font-size: 14px; border-radius: 10px; }
  .btn-lg { padding: 18px 40px; font-size: 18px; }
  .eyebrow { display: inline-block; text-transform: uppercase; letter-spacing: .14em; font-size: 12px; font-weight: 700; color: var(--accent); background: color-mix(in srgb, var(--accent) 16%, transparent); padding: 6px 12px; border-radius: 999px; margin-bottom: 20px; }
  .hero { background: radial-gradient(120% 90% at 80% -10%, color-mix(in srgb, var(--accent) 24%, transparent), transparent 60%), linear-gradient(180deg, #0f1621, #0b1017); padding: 0 24px 72px; }
  .nav { display: flex; align-items: center; justify-content: space-between; max-width: 1080px; margin: 0 auto; padding: 22px 0; }
  .logo-img { height: 34px; width: auto; max-width: 160px; object-fit: contain; background: #fff; border-radius: 8px; padding: 4px 8px; }
  .logo-text { font-weight: 800; font-size: 20px; letter-spacing: -0.01em; }
  .hero-body { max-width: 1080px; margin: 0 auto; padding-top: 40px; }
  .hero--split .hero-body { display: grid; grid-template-columns: 1.05fr 0.95fr; gap: 44px; align-items: center; }
  .hero-media img { width: 100%; height: auto; border-radius: 18px; border: 1px solid #26324a; box-shadow: 0 24px 60px rgba(0,0,0,.45); display: block; }
  .lead { font-size: clamp(16px, 2.2vw, 20px); color: #c2ccdc; max-width: 46ch; margin: 18px 0 30px; }
  .hero .fine { font-size: 13px; color: #828da3; margin-top: 18px; max-width: 52ch; }
  .section { max-width: 1080px; margin: 0 auto; padding: 64px 24px; }
  .grid { display: grid; gap: 18px; }
  .grid-2 { grid-template-columns: repeat(2, 1fr); }
  .grid-3 { grid-template-columns: repeat(3, 1fr); }
  .card { background: #101725; border: 1px solid #233149; border-radius: 16px; padding: 24px; }
  .card .dot { width: 40px; height: 40px; border-radius: 10px; background: color-mix(in srgb, var(--accent) 18%, transparent); margin-bottom: 16px; }
  .step .num { width: 40px; height: 40px; border-radius: 999px; background: var(--accent); color: var(--ink); font-weight: 800; display: flex; align-items: center; justify-content: center; margin-bottom: 16px; }
  .trust { text-align: center; }
  .badges { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; margin-bottom: 36px; }
  .badge { border: 1px solid #26324a; border-radius: 999px; padding: 9px 16px; font-size: 13px; font-weight: 600; color: #c2ccdc; background: #101725; }
  .reviews { text-align: left; }
  .review blockquote { font-size: 16px; color: #e4e9f2; margin-bottom: 12px; }
  .review figcaption { font-size: 14px; color: var(--accent); font-weight: 700; }
  .cta-block { text-align: center; background: linear-gradient(180deg, #101725, #0b1017); border-top: 1px solid #1e2940; border-bottom: 1px solid #1e2940; }
  .cta-block .lead { margin: 14px auto 28px; }
  .footer { max-width: 1080px; margin: 0 auto; padding: 48px 24px; text-align: center; border-top: 1px solid #1e2940; }
  .footer .age { display: inline-block; border: 1px solid var(--accent); color: var(--accent); font-weight: 800; border-radius: 999px; padding: 8px 18px; font-size: 14px; margin-bottom: 18px; }
  .footer .disclaimer { font-size: 13px; max-width: 60ch; margin: 0 auto 14px; color: #909bb0; }
  .footer .legal { font-size: 12px; color: #6b768c; }
  @media (max-width: 720px) {
    .grid-3, .grid-2 { grid-template-columns: 1fr; }
    .hero--split .hero-body { grid-template-columns: 1fr; gap: 28px; }
    .hero-media { order: -1; }
    .nav .btn-sm { display: none; }
    .section { padding: 44px 20px; }
  }
</style>
<style>${landingStylesCss(styles)}</style>
</head>
<body>
${hero}
<main>
${benefits}
${howto}
${trust}
${ctaBlock}
</main>
${footer}
</body>
</html>`;
}

/**
 * "Generate" a landing. Client-side assembly today; swap the body for a
 * POST /api/landing later without changing the caller. The short delay keeps
 * the loading→result transition realistic.
 */
export function generateLanding(
  input: LandingInput,
  overrides: LandingTextOverrides = {},
): Promise<LandingResult> {
  return new Promise((resolve) => {
    const html = buildLandingHtml(input, overrides);
    const generatedSections = (Object.keys(input.sections) as LandingSectionId[]).filter(
      (k) => input.sections[k],
    );
    setTimeout(() => resolve({ html, generatedSections }), 1100);
  });
}
