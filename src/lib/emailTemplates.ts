// Каталог шаблонов писем.
//
// Шаблон — готовая отправная точка под типовой повод: тексты, состав блоков и
// гамма. Чего шаблон не трогает: бренд, лого, баннер, ссылки и список
// платёжных систем — это данные конкретного бренда, а не повода, и человек не
// должен терять их, перебирая шаблоны.
//
// Тексты — рабочие, а не «лорем ипсум»: их можно отправлять почти как есть,
// поменяв цифры. Выделения — через **двойные звёздочки**, как в форме.

import type { EmailBlocks, EmailDraft } from "./mailing";

export type EmailTemplate = {
  id: string;
  name: string;
  /** Одна строка: когда этот шаблон уместен. */
  when: string;
  accent: string;
  base: string;
  blocks: EmailBlocks;
  fields: Pick<
    EmailDraft,
    | "subject"
    | "preheader"
    | "heroTitle"
    | "heroSubtitle"
    | "body"
    | "stepsTitle"
    | "steps"
    | "ctaText"
    | "bonusCtaText"
    | "footer"
  >;
};

const ALL: EmailBlocks = {
  hero: true,
  subtitle: true,
  body: true,
  steps: true,
  cta: true,
  bonusCta: false,
  apps: true,
  payments: true,
  footer: true,
};

const FOOTER = "18+. Играйте ответственно. Это автоматическое письмо — отвечать на него не нужно.";

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: "welcome",
    name: "Приветственный бонус",
    when: "Первое письмо после регистрации",
    accent: "#22c55e",
    base: "#060a16",
    blocks: { ...ALL },
    fields: {
      subject: "Ваш бонус 100% + 50 фриспинов уже ждёт",
      preheader: "Активируйте приветственный пакет за пару минут",
      heroTitle: "ДОБРО ПОЖАЛОВАТЬ! **БОНУС 100%** + 50 ФРИСПИНОВ",
      heroSubtitle: "Приветственный пакет для новых игроков",
      body: "Спасибо, что выбрали нас! Пополните счёт впервые — и мы **удвоим депозит** до 500 EUR, а сверху добавим **50 фриспинов** в популярном слоте.",
      stepsTitle: "Как получить бонус:",
      steps: [
        "Пополните счёт на сумму от **20 EUR**",
        "Бонус и фриспины начислятся автоматически",
        "Отыграйте бонус с вейджером **x35** за 7 дней",
      ],
      ctaText: "ЗАБРАТЬ БОНУС",
      bonusCtaText: "",
      footer: FOOTER,
    },
  },
  {
    id: "freespins",
    name: "Фриспины в слоте",
    when: "Промо конкретного слота или провайдера",
    accent: "#FFC53D",
    base: "#1B1038",
    blocks: { ...ALL, steps: false, bonusCta: true, payments: false },
    fields: {
      subject: "100 фриспинов в новом слоте — только эти выходные",
      preheader: "Без депозита, без вейджера на выигрыш",
      heroTitle: "**100 ФРИСПИНОВ** В НОВОМ СЛОТЕ",
      heroSubtitle: "Только с пятницы по воскресенье",
      body: "Новый слот уже в лобби — и мы дарим **100 фриспинов**, чтобы вы оценили его первыми. Спины действуют до конца воскресенья.",
      stepsTitle: "",
      steps: ["", "", ""],
      ctaText: "ИГРАТЬ СЕЙЧАС",
      bonusCtaText: "ЗАБРАТЬ ФРИСПИНЫ",
      footer: FOOTER,
    },
  },
  {
    id: "reactivation",
    name: "Мы скучали",
    when: "Реактивация игроков, не заходивших 30+ дней",
    accent: "#FF3B5C",
    base: "#190A10",
    blocks: { ...ALL, steps: false, apps: false },
    fields: {
      subject: "Давно не виделись — держите 30 фриспинов",
      preheader: "Подарок за возвращение, действует 3 дня",
      heroTitle: "МЫ СКУЧАЛИ! **30 ФРИСПИНОВ** ЗА ВОЗВРАЩЕНИЕ",
      heroSubtitle: "Подарок действует 3 дня",
      body: "Пока вас не было, в лобби появились новые слоты и турниры. Возвращайтесь — **30 фриспинов** уже начислены на ваш аккаунт.",
      stepsTitle: "",
      steps: ["", "", ""],
      ctaText: "ВЕРНУТЬСЯ В ИГРУ",
      bonusCtaText: "",
      footer: FOOTER,
    },
  },
  {
    id: "tournament",
    name: "Турнир",
    when: "Анонс турнира с призовым фондом",
    accent: "#35D0FF",
    base: "#061826",
    blocks: { ...ALL, payments: false },
    fields: {
      subject: "Турнир на 50 000 EUR стартует в понедельник",
      preheader: "Играйте в любимые слоты и поднимайтесь в таблице",
      heroTitle: "ТУРНИР С ФОНДОМ **50 000 EUR**",
      heroSubtitle: "С понедельника по воскресенье",
      body: "Каждая ставка в слотах-участниках приносит очки. **Топ-100** игроков делят призовой фонд, а первое место получает **10 000 EUR**.",
      stepsTitle: "Как участвовать:",
      steps: [
        "Нажмите «Участвовать» на странице турнира",
        "Играйте в слоты-участники от **0.5 EUR** за спин",
        "Следите за таблицей лидеров — призы в понедельник",
      ],
      ctaText: "УЧАСТВОВАТЬ",
      bonusCtaText: "",
      footer: FOOTER,
    },
  },
  {
    id: "cashback",
    name: "Кэшбэк недели",
    when: "Еженедельный возврат части проигрыша",
    accent: "#B7F14A",
    base: "#0A1A12",
    blocks: { ...ALL, subtitle: false, steps: false, apps: false },
    fields: {
      subject: "Ваш кэшбэк за неделю начислен",
      preheader: "Возвращаем 10% — без вейджера",
      heroTitle: "**10% КЭШБЭК** УЖЕ НА СЧЁТЕ",
      heroSubtitle: "",
      body: "Неделя была непростой? Мы вернули **10% проигрыша** на ваш счёт — без вейджера, можно сразу играть или вывести.",
      stepsTitle: "",
      steps: ["", "", ""],
      ctaText: "ПОСМОТРЕТЬ БАЛАНС",
      bonusCtaText: "",
      footer: FOOTER,
    },
  },
  {
    id: "match",
    name: "Ставка на матч",
    when: "Беттинг: главный матч дня и повышенный коэффициент",
    accent: "#f97316",
    base: "#111317",
    blocks: { ...ALL, steps: false, apps: true, payments: false },
    fields: {
      subject: "Матч дня: повышенный коэффициент 2.50",
      preheader: "Ставка принимается до стартового свистка",
      heroTitle: "МАТЧ ДНЯ: **КОЭФ 2.50** НА ПОБЕДУ",
      heroSubtitle: "Сегодня в 21:00",
      body: "Только на этот матч — **повышенный коэффициент 2.50** на победу хозяев. Ставка до **100 EUR** по повышенному коэффициенту, принимается до начала игры.",
      stepsTitle: "",
      steps: ["", "", ""],
      ctaText: "СДЕЛАТЬ СТАВКУ",
      bonusCtaText: "",
      footer: FOOTER,
    },
  },
  {
    id: "reload",
    name: "Бонус на депозит",
    when: "Reload-бонус для действующих игроков",
    accent: "#7B5CFF",
    base: "#0d0b1f",
    blocks: { ...ALL, subtitle: false },
    fields: {
      subject: "Пополните сегодня — получите +50%",
      preheader: "Reload-бонус действует 24 часа",
      heroTitle: "**+50%** К ДЕПОЗИТУ ТОЛЬКО СЕГОДНЯ",
      heroSubtitle: "",
      body: "Пополните счёт в течение **24 часов** — и мы добавим **50%** к сумме депозита, до 200 EUR.",
      stepsTitle: "Как получить бонус:",
      steps: [
        "Выберите бонус в кассе при пополнении",
        "Сделайте депозит от **20 EUR**",
        "Бонус начислится сразу, вейджер **x30**",
      ],
      ctaText: "ПОПОЛНИТЬ СЧЁТ",
      bonusCtaText: "",
      footer: FOOTER,
    },
  },
  {
    id: "minimal",
    name: "Минимал",
    when: "Короткое сообщение без промо-обвеса",
    accent: "#7B5CFF",
    base: "#EDF0F5",
    blocks: {
      hero: false,
      subtitle: false,
      body: true,
      steps: false,
      cta: true,
      bonusCta: false,
      apps: false,
      payments: false,
      footer: true,
    },
    fields: {
      subject: "Важное обновление вашего аккаунта",
      preheader: "Пара слов о том, что изменилось",
      heroTitle: "ОБНОВЛЕНИЕ АККАУНТА",
      heroSubtitle: "",
      body: "Мы обновили правила бонусной программы. Коротко: вейджер на фриспины снижен до **x25**, а срок отыгрыша увеличен до **10 дней**.",
      stepsTitle: "",
      steps: ["", "", ""],
      ctaText: "ПОДРОБНЕЕ",
      bonusCtaText: "",
      footer: FOOTER,
    },
  },
];

/** Применить шаблон: тексты, состав и гамма — из шаблона, данные бренда — свои. */
export function applyTemplate(draft: EmailDraft, t: EmailTemplate): EmailDraft {
  return {
    ...draft,
    ...t.fields,
    steps: [...t.fields.steps],
    blocks: { ...t.blocks },
    accent: t.accent,
    base: t.base,
  };
}
