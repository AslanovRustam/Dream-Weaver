// Общее для всех лендингов-механик (колесо, слот, краш, матч): язык, юр. текст,
// трекинг и блоки под первым экраном.
//
// Экспорт механики остаётся своим, а отсюда берёт куски страницы:
//   kitParts(extras, accent, dark, ctaUrl) → { lang, head, css, legalLine, after, script, strings }
// и подставляет: lang — в <html>, head — в <head> (пиксели), css — в <style>,
// legalLine — в низ первого экрана, after — после него (блоки и подвал),
// script — перед своим скриптом (__goCta, таймер, лента), strings — тексты
// всплывающих окон на языке лендинга.
//
// Пользовательский текст везде экранируется (esc), в скрипт идёт только через
// embedJson, ссылки — через safeCtaUrl, ID пикселей — по строгим шаблонам.

import { embedJson, safeCtaUrl } from "./exportUtils";

export type LandingLang = "ru" | "uk" | "en" | "es";
export type LandingKind = "casino" | "sport";

export const LANDING_LANGS: { id: LandingLang; label: string }[] = [
  { id: "ru", label: "Русский" },
  { id: "uk", label: "Українська" },
  { id: "en", label: "English" },
  { id: "es", label: "Español" },
];

export type BonusCard = { title: string; text: string; image?: string };
export type Review = { name: string; city: string; text: string };
export type FaqItem = { q: string; a: string };

export type LandingExtras = {
  lang: LandingLang;
  /** Юр. текст: строка внизу первого экрана и подвал. */
  legal: string;
  tracking: {
    metaPixel: string;
    tiktokPixel: string;
    gtm: string;
    /** Пробрасывать параметры адреса (subid, click_id, utm…) в ссылку кнопки. */
    passParams: boolean;
  };
  bonuses: { on: boolean; title: string; items: BonusCard[] };
  trust: { on: boolean; rating: string; players: string; payout: string; license: string; payments: string };
  steps: { on: boolean; title: string; items: string[] };
  winners: { on: boolean; currency: string };
  timer: { on: boolean; minutes: number; text: string };
  reviews: { on: boolean; title: string; items: Review[] };
  faq: { on: boolean; title: string; items: FaqItem[] };
};

// ---------------------------------------------------------------- тексты

/** Тексты интерфейса механик (всплывающие окна, кнопки, счётчики). */
export type LandingStrings = {
  almost: string; almostText: string; spinAgain: string; congrats: string; youWon: string; claim: string;
  jackpot: string; threeInRow: string; attemptsLeft: string; attemptsOver: string;
  cashed: string; cashedText: string; crashedAt: string; crashedText: string; tryAgain: string; cashOut: string;
  untilMatch: string; live: string; days: string;
  // блоки
  rating: string; players: string; payout: string; winnersTitle: string; won: string; claimNow: string;
  responsible: string; stepWord: string;
  // матч-прогноз
  home: string; away: string; p1: string; draw: string; p2: string; pickHint: string; offerDefault: string;
};

const STRINGS: Record<LandingLang, LandingStrings> = {
  ru: {
    home: "Хозяева", away: "Гости", p1: "П1", draw: "Ничья", p2: "П2", pickHint: "Выберите исход — и переходите к ставке", offerDefault: "за первую ставку на этот матч",
    almost: "Почти!", almostText: "Не в этот раз — крутите ещё, приз ждёт!", spinAgain: "Крутить ещё",
    congrats: "Поздравляем!", youWon: "Ваш выигрыш:", claim: "Забрать бонус", jackpot: "Джекпот!",
    threeInRow: "Три в ряд — забирайте бонус!", attemptsLeft: "Осталось попыток: ", attemptsOver: "Попытки закончились",
    cashed: "Забрал вовремя!", cashedText: "Отличный кэшаут — забирайте бонус!", crashedAt: "Разбилось на ×",
    crashedText: "Чуть не успел — попробуйте ещё раз и заберите вовремя!", tryAgain: "Ещё раз", cashOut: "Забрать ×",
    untilMatch: "До матча: ", live: "Матч идёт · LIVE", days: "д",
    rating: "рейтинг игроков", players: "игроков", payout: "вывод выигрыша", winnersTitle: "Сейчас выигрывают",
    won: "выиграл", claimNow: "Забрать бонус", responsible: "Играйте ответственно", stepWord: "Шаг",
  },
  uk: {
    home: "Господарі", away: "Гості", p1: "П1", draw: "Нічия", p2: "П2", pickHint: "Оберіть результат — і переходьте до ставки", offerDefault: "за першу ставку на цей матч",
    almost: "Майже!", almostText: "Не цього разу — крутіть ще, приз чекає!", spinAgain: "Крутити ще",
    congrats: "Вітаємо!", youWon: "Ваш виграш:", claim: "Забрати бонус", jackpot: "Джекпот!",
    threeInRow: "Три в ряд — забирайте бонус!", attemptsLeft: "Залишилось спроб: ", attemptsOver: "Спроби закінчились",
    cashed: "Забрав вчасно!", cashedText: "Чудовий кешаут — забирайте бонус!", crashedAt: "Розбилось на ×",
    crashedText: "Трохи не встиг — спробуйте ще раз і заберіть вчасно!", tryAgain: "Ще раз", cashOut: "Забрати ×",
    untilMatch: "До матчу: ", live: "Матч триває · LIVE", days: "д",
    rating: "рейтинг гравців", players: "гравців", payout: "виведення виграшу", winnersTitle: "Зараз виграють",
    won: "виграв", claimNow: "Забрати бонус", responsible: "Грайте відповідально", stepWord: "Крок",
  },
  en: {
    home: "Home", away: "Away", p1: "1", draw: "Draw", p2: "2", pickHint: "Pick an outcome and go to your bet", offerDefault: "for your first bet on this match",
    almost: "Almost!", almostText: "Not this time — spin again, your prize is waiting!", spinAgain: "Spin again",
    congrats: "Congratulations!", youWon: "You won:", claim: "Claim bonus", jackpot: "Jackpot!",
    threeInRow: "Three in a row — claim your bonus!", attemptsLeft: "Tries left: ", attemptsOver: "No tries left",
    cashed: "Cashed out in time!", cashedText: "Great cash-out — claim your bonus!", crashedAt: "Crashed at ×",
    crashedText: "So close — try again and cash out in time!", tryAgain: "Try again", cashOut: "Cash out ×",
    untilMatch: "Kick-off in: ", live: "Match is live · LIVE", days: "d",
    rating: "player rating", players: "players", payout: "payouts", winnersTitle: "Winning right now",
    won: "won", claimNow: "Claim bonus", responsible: "Play responsibly", stepWord: "Step",
  },
  es: {
    home: "Local", away: "Visitante", p1: "1", draw: "Empate", p2: "2", pickHint: "Elige un resultado y ve a apostar", offerDefault: "por tu primera apuesta en este partido",
    almost: "¡Casi!", almostText: "Esta vez no — gira otra vez, ¡tu premio te espera!", spinAgain: "Girar otra vez",
    congrats: "¡Felicidades!", youWon: "Ganaste:", claim: "Reclamar bono", jackpot: "¡Jackpot!",
    threeInRow: "¡Tres en línea — reclama tu bono!", attemptsLeft: "Intentos: ", attemptsOver: "Sin intentos",
    cashed: "¡Cobraste a tiempo!", cashedText: "¡Gran cobro — reclama tu bono!", crashedAt: "Explotó en ×",
    crashedText: "¡Casi! Inténtalo otra vez y cobra a tiempo.", tryAgain: "Otra vez", cashOut: "Cobrar ×",
    untilMatch: "Faltan: ", live: "Partido en vivo · LIVE", days: "d",
    rating: "valoración", players: "jugadores", payout: "retiros", winnersTitle: "Ganando ahora",
    won: "ganó", claimNow: "Reclamar bono", responsible: "Juega con responsabilidad", stepWord: "Paso",
  },
};

export const landingStrings = (lang: LandingLang): LandingStrings => STRINGS[lang] ?? STRINGS.ru;

const LEGAL: Record<LandingLang, string> = {
  ru: "18+. Азартные игры могут вызывать зависимость. Играйте ответственно. Бонус для новых игроков, условия на сайте.",
  uk: "18+. Азартні ігри можуть викликати залежність. Грайте відповідально. Бонус для нових гравців, умови на сайті.",
  en: "18+. Gambling can be addictive. Play responsibly. New players only, T&Cs apply.",
  es: "18+. El juego puede crear adicción. Juega con responsabilidad. Solo nuevos jugadores, aplican T&C.",
};

type Pack = Omit<LandingExtras, "lang" | "legal" | "tracking">;

function pack(lang: LandingLang, kind: LandingKind): Pack {
  const casino = kind === "casino";
  const P: Record<LandingLang, Pack> = {
    ru: {
      bonuses: {
        on: true, title: casino ? "Бонусы для новых игроков" : "Бонусы для новых игроков",
        items: casino
          ? [
              { title: "+200% к депозиту", text: "Приветственный бонус на первое пополнение" },
              { title: "500 фриспинов", text: "В самых популярных слотах" },
              { title: "Кэшбэк до 30%", text: "Возвращаем часть проигрыша каждую неделю" },
              { title: "Ежедневный бонус", text: "Заходи каждый день и забирай подарок" },
            ]
          : [
              { title: "Фрибет 100 €", text: "За первую ставку от 10 €" },
              { title: "+100% к депозиту", text: "До 500 € на первое пополнение" },
              { title: "Экспресс-бустер", text: "До +50% к выигрышу экспресса" },
              { title: "Кэшбэк на ставки", text: "10% каждую неделю" },
            ],
      },
      trust: { on: true, rating: "4.8", players: "250 000+", payout: "от 15 минут", license: "Лицензия Curaçao", payments: "Visa, Mastercard, Apple Pay, USDT" },
      steps: { on: true, title: "Как забрать бонус", items: casino ? ["Зарегистрируйся за 1 минуту", "Пополни счёт от 10 €", "Бонус и фриспины зачислятся сами"] : ["Зарегистрируйся за 1 минуту", "Сделай первую ставку", "Фрибет придёт на счёт"] },
      winners: { on: true, currency: "€" },
      timer: { on: true, minutes: 15, text: "Бонус сгорит через" },
      reviews: {
        on: true, title: "Отзывы игроков",
        items: [
          { name: "Алексей", city: "Москва", text: casino ? "Забрал фриспины, вывод пришёл за 20 минут." : "Фрибет зашёл с первого экспресса, вывод без проблем." },
          { name: "Марина", city: "Алматы", text: "Удобное приложение, бонус зачислился сразу." },
          { name: "Дмитрий", city: "Минск", text: "Поддержка ответила за пару минут, всё честно." },
        ],
      },
      faq: {
        on: true, title: "Частые вопросы",
        items: [
          { q: "Как получить бонус?", a: "Зарегистрируйтесь и пополните счёт — бонус начислится автоматически." },
          { q: "Как быстро выводятся деньги?", a: "Обычно от 15 минут до суток, в зависимости от способа." },
          { q: "Это безопасно?", a: "Сайт работает по лицензии, платежи защищены." },
        ],
      },
    },
    uk: {
      bonuses: {
        on: true, title: "Бонуси для нових гравців",
        items: casino
          ? [
              { title: "+200% до депозиту", text: "Вітальний бонус на перше поповнення" },
              { title: "500 фриспінів", text: "У найпопулярніших слотах" },
              { title: "Кешбек до 30%", text: "Повертаємо частину програшу щотижня" },
              { title: "Щоденний бонус", text: "Заходь щодня та забирай подарунок" },
            ]
          : [
              { title: "Фрібет 100 €", text: "За першу ставку від 10 €" },
              { title: "+100% до депозиту", text: "До 500 € на перше поповнення" },
              { title: "Експрес-бустер", text: "До +50% до виграшу експресу" },
              { title: "Кешбек на ставки", text: "10% щотижня" },
            ],
      },
      trust: { on: true, rating: "4.8", players: "250 000+", payout: "від 15 хвилин", license: "Ліцензія Curaçao", payments: "Visa, Mastercard, Apple Pay, USDT" },
      steps: { on: true, title: "Як забрати бонус", items: casino ? ["Зареєструйся за 1 хвилину", "Поповни рахунок від 10 €", "Бонус і фриспіни нарахуються самі"] : ["Зареєструйся за 1 хвилину", "Зроби першу ставку", "Фрібет прийде на рахунок"] },
      winners: { on: true, currency: "€" },
      timer: { on: true, minutes: 15, text: "Бонус згорить через" },
      reviews: {
        on: true, title: "Відгуки гравців",
        items: [
          { name: "Олексій", city: "Київ", text: casino ? "Забрав фриспіни, виведення прийшло за 20 хвилин." : "Фрібет зайшов з першого експресу, виведення без проблем." },
          { name: "Марина", city: "Львів", text: "Зручний застосунок, бонус нарахувався одразу." },
          { name: "Дмитро", city: "Одеса", text: "Підтримка відповіла за кілька хвилин, все чесно." },
        ],
      },
      faq: {
        on: true, title: "Часті питання",
        items: [
          { q: "Як отримати бонус?", a: "Зареєструйтесь і поповніть рахунок — бонус нарахується автоматично." },
          { q: "Як швидко виводяться гроші?", a: "Зазвичай від 15 хвилин до доби, залежно від способу." },
          { q: "Це безпечно?", a: "Сайт працює за ліцензією, платежі захищені." },
        ],
      },
    },
    en: {
      bonuses: {
        on: true, title: "Bonuses for new players",
        items: casino
          ? [
              { title: "+200% deposit bonus", text: "Welcome bonus on your first deposit" },
              { title: "500 free spins", text: "On the most popular slots" },
              { title: "Up to 30% cashback", text: "Part of your losses back every week" },
              { title: "Daily bonus", text: "Come back every day for a gift" },
            ]
          : [
              { title: "€100 free bet", text: "For your first bet of €10+" },
              { title: "+100% deposit bonus", text: "Up to €500 on your first deposit" },
              { title: "Acca boost", text: "Up to +50% on accumulator wins" },
              { title: "Betting cashback", text: "10% every week" },
            ],
      },
      trust: { on: true, rating: "4.8", players: "250,000+", payout: "from 15 min", license: "Curaçao licence", payments: "Visa, Mastercard, Apple Pay, USDT" },
      steps: { on: true, title: "How to claim your bonus", items: casino ? ["Sign up in 1 minute", "Deposit from €10", "Bonus and spins land automatically"] : ["Sign up in 1 minute", "Place your first bet", "Get your free bet"] },
      winners: { on: true, currency: "€" },
      timer: { on: true, minutes: 15, text: "Bonus expires in" },
      reviews: {
        on: true, title: "Player reviews",
        items: [
          { name: "Alex", city: "London", text: casino ? "Got my free spins, withdrawal came in 20 minutes." : "Free bet landed on my first acca, payout was smooth." },
          { name: "Maria", city: "Dublin", text: "Great app, bonus was credited instantly." },
          { name: "James", city: "Toronto", text: "Support replied in minutes, all fair and square." },
        ],
      },
      faq: {
        on: true, title: "FAQ",
        items: [
          { q: "How do I get the bonus?", a: "Sign up and make a deposit — the bonus is credited automatically." },
          { q: "How fast are withdrawals?", a: "Usually from 15 minutes to 24 hours depending on the method." },
          { q: "Is it safe?", a: "The site is licensed and payments are protected." },
        ],
      },
    },
    es: {
      bonuses: {
        on: true, title: "Bonos para nuevos jugadores",
        items: casino
          ? [
              { title: "+200% de depósito", text: "Bono de bienvenida en tu primer depósito" },
              { title: "500 giros gratis", text: "En los slots más populares" },
              { title: "Cashback hasta 30%", text: "Te devolvemos parte de lo perdido cada semana" },
              { title: "Bono diario", text: "Entra cada día y recibe un regalo" },
            ]
          : [
              { title: "Apuesta gratis 100 €", text: "Por tu primera apuesta desde 10 €" },
              { title: "+100% de depósito", text: "Hasta 500 € en tu primer depósito" },
              { title: "Combinada potenciada", text: "Hasta +50% en ganancias de combinadas" },
              { title: "Cashback en apuestas", text: "10% cada semana" },
            ],
      },
      trust: { on: true, rating: "4.8", players: "250 000+", payout: "desde 15 min", license: "Licencia Curaçao", payments: "Visa, Mastercard, Apple Pay, USDT" },
      steps: { on: true, title: "Cómo reclamar tu bono", items: casino ? ["Regístrate en 1 minuto", "Deposita desde 10 €", "El bono y los giros llegan solos"] : ["Regístrate en 1 minuto", "Haz tu primera apuesta", "Recibe tu apuesta gratis"] },
      winners: { on: true, currency: "€" },
      timer: { on: true, minutes: 15, text: "El bono expira en" },
      reviews: {
        on: true, title: "Opiniones de jugadores",
        items: [
          { name: "Carlos", city: "Madrid", text: casino ? "Recibí mis giros, el retiro llegó en 20 minutos." : "La apuesta gratis entró en mi primera combinada." },
          { name: "Lucía", city: "CDMX", text: "La app es cómoda y el bono llegó al instante." },
          { name: "Diego", city: "Lima", text: "Soporte respondió en minutos, todo transparente." },
        ],
      },
      faq: {
        on: true, title: "Preguntas frecuentes",
        items: [
          { q: "¿Cómo obtengo el bono?", a: "Regístrate y deposita — el bono se acredita automáticamente." },
          { q: "¿Qué tan rápidos son los retiros?", a: "Normalmente de 15 minutos a 24 horas según el método." },
          { q: "¿Es seguro?", a: "El sitio tiene licencia y los pagos están protegidos." },
        ],
      },
    },
  };
  return P[lang];
}

export function defaultExtras(lang: LandingLang = "ru", kind: LandingKind = "casino"): LandingExtras {
  return {
    lang,
    legal: LEGAL[lang],
    tracking: { metaPixel: "", tiktokPixel: "", gtm: "", passParams: true },
    ...pack(lang, kind),
  };
}

/** Тексты под новый язык; трекинг, картинки бонусов и включённость блоков — прежние. */
export function relocalizeExtras(x: LandingExtras, lang: LandingLang, kind: LandingKind): LandingExtras {
  const d = defaultExtras(lang, kind);
  return {
    ...d,
    tracking: x.tracking,
    bonuses: { ...d.bonuses, on: x.bonuses.on, items: d.bonuses.items.map((it, i) => ({ ...it, image: x.bonuses.items[i]?.image })) },
    trust: { ...d.trust, on: x.trust.on, rating: x.trust.rating, payments: x.trust.payments },
    steps: { ...d.steps, on: x.steps.on },
    winners: { ...d.winners, on: x.winners.on, currency: x.winners.currency },
    timer: { ...d.timer, on: x.timer.on, minutes: x.timer.minutes },
    reviews: { ...d.reviews, on: x.reviews.on },
    faq: { ...d.faq, on: x.faq.on },
  };
}

/** Черновик старой версии (без блоков) или частичный — дополняем умолчаниями. */
export function normalizeExtras(raw: unknown, kind: LandingKind): LandingExtras {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<LandingExtras>;
  const lang = LANDING_LANGS.some((l) => l.id === r.lang) ? (r.lang as LandingLang) : "ru";
  const d = defaultExtras(lang, kind);
  return {
    ...d,
    ...r,
    lang,
    tracking: { ...d.tracking, ...(r.tracking ?? {}) },
    bonuses: { ...d.bonuses, ...(r.bonuses ?? {}) },
    trust: { ...d.trust, ...(r.trust ?? {}) },
    steps: { ...d.steps, ...(r.steps ?? {}) },
    winners: { ...d.winners, ...(r.winners ?? {}) },
    timer: { ...d.timer, ...(r.timer ?? {}) },
    reviews: { ...d.reviews, ...(r.reviews ?? {}) },
    faq: { ...d.faq, ...(r.faq ?? {}) },
  };
}

// ---------------------------------------------------------------- сборка

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const META_RE = /^\d{6,20}$/;
const TIKTOK_RE = /^[A-Z0-9]{10,30}$/;
const GTM_RE = /^GTM-[A-Z0-9]{4,12}$/;

function trackingHead(t: LandingExtras["tracking"]): string {
  const meta = META_RE.test(t.metaPixel.trim()) ? t.metaPixel.trim() : "";
  const tt = TIKTOK_RE.test(t.tiktokPixel.trim().toUpperCase()) ? t.tiktokPixel.trim().toUpperCase() : "";
  const gtm = GTM_RE.test(t.gtm.trim().toUpperCase()) ? t.gtm.trim().toUpperCase() : "";
  let out = "";
  if (gtm) {
    out += `<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${gtm}');</script>`;
  }
  if (meta) {
    out += `<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${meta}');fbq('track','PageView');</script>`;
  }
  if (tt) {
    out += `<script>!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.load=function(e){var i="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=i;ttq._t=ttq._t||{};ttq._t[e]=+new Date;var o=d.createElement("script");o.type="text/javascript";o.async=!0;o.src=i+"?sdkid="+e+"&lib="+t;var a=d.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};ttq.load('${tt}');ttq.page();}(window,document,'ttq');</script>`;
  }
  return out;
}

type Tone = { bg: string; text: string; muted: string; card: string; chip: string; line: string; gold: string; hi: string; glow2: string; dot: string };

function tone(dark: boolean): Tone {
  return dark
    ? { bg: "#0b0815", text: "#f6f2ff", muted: "rgba(246,242,255,.62)", card: "rgba(255,255,255,.055)", chip: "rgba(255,255,255,.07)", line: "rgba(255,255,255,.10)", gold: "#ffcf4a", hi: "#ffffff", glow2: "rgba(124,58,237,.24)", dot: "rgba(255,255,255,.07)" }
    : { bg: "#fff8ef", text: "#1d1408", muted: "rgba(29,20,8,.62)", card: "rgba(255,255,255,.9)", chip: "#ffffff", line: "rgba(29,20,8,.10)", gold: "#c27c0e", hi: "#1d1408", glow2: "rgba(255,170,60,.22)", dot: "rgba(29,20,8,.07)" };
}

function kitCss(accent: string, dark: boolean): string {
  const c = tone(dark);
  const clip = "-webkit-background-clip:text;background-clip:text;color:transparent";
  const coin = "radial-gradient(circle at 34% 30%,#fff7cf 0,#ffd34d 32%,#e09b12 68%,#9a5f00 100%)";
  const goldPill = "color:#1a1000;background:linear-gradient(180deg,#ffe58a,#f5b324)";
  return `
  body{overflow-x:hidden;overflow-y:auto}
  .modal{position:fixed!important}
  .exLegalLine{position:absolute;left:0;right:0;bottom:6px;z-index:6;padding:0 14px;text-align:center;font-size:10px;line-height:1.3;color:rgba(255,255,255,.72);text-shadow:0 1px 2px rgba(0,0,0,.7);pointer-events:none}
  .ex{position:relative;overflow:hidden;color:${c.text};padding:46px 16px 34px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;background:radial-gradient(900px 420px at 50% -140px,${accent}48,transparent 70%),radial-gradient(560px 560px at -12% 36%,${c.glow2},transparent 70%),radial-gradient(560px 560px at 112% 70%,${accent}2a,transparent 70%),${c.bg}}
  .ex::before{content:"";position:absolute;inset:0;background-image:radial-gradient(${c.dot} 1px,transparent 1.5px);background-size:22px 22px;-webkit-mask-image:linear-gradient(180deg,#000,transparent 60%);mask-image:linear-gradient(180deg,#000,transparent 60%);pointer-events:none}
  .ex::after{content:"";position:absolute;left:0;right:0;top:0;height:2px;background:linear-gradient(90deg,transparent,${accent},${c.gold},${accent},transparent)}
  .ex *{box-sizing:border-box}
  .ex .w{position:relative;z-index:1;max-width:980px;margin:0 auto;display:flex;flex-direction:column;gap:42px}
  .ex .fx{position:absolute;inset:0;pointer-events:none;overflow:hidden}
  .ex .fx i{position:absolute;border-radius:50%;background:${coin};box-shadow:inset 0 -3px 0 rgba(0,0,0,.25),0 8px 16px rgba(0,0,0,.35);animation:exFloat 7s ease-in-out infinite}
  .ex .fx i::after{content:"";position:absolute;inset:22%;border-radius:50%;border:2px solid rgba(154,95,0,.5)}
  .ex .fx b{position:absolute;color:${c.gold};font-size:18px;animation:exTw 3s ease-in-out infinite}
  @keyframes exFloat{50%{transform:translateY(-16px) rotate(18deg)}}
  @keyframes exTw{50%{opacity:.15;transform:scale(.55)}}
  @keyframes exBob{50%{transform:translateY(-7px) rotate(-3deg)}}
  @keyframes exShine{0%,55%{left:-70%}100%{left:140%}}
  @keyframes exPulse{50%{transform:scale(1.04)}}
  @keyframes exBlink{50%{opacity:.25}}
  @keyframes exFlick{to{transform:scale(1.18) rotate(-8deg)}}
  @keyframes exStripe{to{background-position:28px 0}}
  @keyframes exTick{to{transform:translateX(-50%)}}
  @keyframes exLive{70%{box-shadow:0 0 0 10px rgba(255,59,92,0)}100%{box-shadow:0 0 0 0 rgba(255,59,92,0)}}
  .ex h2{font-size:clamp(25px,5.8vw,36px);font-weight:900;text-align:center;letter-spacing:-.02em;line-height:1.08;margin:0 0 20px;background:linear-gradient(180deg,${c.hi} 35%,${c.gold});${clip}}
  .ex h2::after{content:"";display:block;width:64px;height:4px;border-radius:4px;margin:12px auto 0;background:linear-gradient(90deg,${accent},${c.gold})}
  .ex .shine{position:absolute;top:0;bottom:0;left:-70%;width:45%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.4),transparent);transform:skewX(-20deg);animation:exShine 4.5s ease-in-out infinite;pointer-events:none}

  .ex .cta{position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;gap:10px;width:100%;max-width:400px;margin:0 auto;border:0;border-radius:999px;padding:18px 22px;font-size:19px;font-weight:900;letter-spacing:.02em;text-transform:uppercase;color:#fff;cursor:pointer;background:linear-gradient(180deg,${accent},${accent}d0 55%,${accent}a8);box-shadow:0 0 0 4px ${accent}30,0 16px 36px ${accent}66,inset 0 2px 0 rgba(255,255,255,.35),inset 0 -3px 0 rgba(0,0,0,.22);text-shadow:0 2px 0 rgba(0,0,0,.22);animation:exPulse 1.8s ease-in-out infinite}
  .ex .cta svg{width:22px;height:22px;flex:none}
  .ex .cta .shine{animation-duration:2.8s}

  .ex .timer{position:relative;overflow:hidden;display:flex;flex-direction:column;align-items:center;gap:12px;padding:22px 16px 18px;border-radius:24px;background:linear-gradient(135deg,${accent}33,${c.card} 60%);border:1px solid ${accent}66;box-shadow:0 0 0 4px ${accent}14,0 18px 40px rgba(0,0,0,.3)}
  .ex .timer::before{content:"";position:absolute;left:0;right:0;top:0;height:6px;background:repeating-linear-gradient(-45deg,${accent} 0 10px,transparent 10px 20px);background-size:28px 6px;opacity:.6;animation:exStripe 1s linear infinite}
  .ex .timer .tt{display:flex;gap:8px;align-items:center;font-weight:900;font-size:14px;letter-spacing:.07em;text-transform:uppercase;text-align:center}
  .ex .timer .fire{display:inline-block;font-size:20px;animation:exFlick .8s ease-in-out infinite alternate}
  .ex .digits{display:flex;gap:6px;align-items:center;font-variant-numeric:tabular-nums}
  .ex .digits i{position:relative;font-style:normal;width:48px;height:62px;display:flex;align-items:center;justify-content:center;font-size:36px;font-weight:900;border-radius:12px;color:#fff;background:linear-gradient(180deg,#2c2344 0,#1a1430 50%,#120d20 50%,#0d0918);box-shadow:inset 0 1px 0 rgba(255,255,255,.14),0 8px 16px rgba(0,0,0,.4)}
  .ex .digits em{font-style:normal;font-size:32px;font-weight:900;color:${accent};animation:exBlink 1s steps(1) infinite;padding:0 2px}
  .ex .bar{width:100%;max-width:330px;height:7px;border-radius:7px;background:${c.line};overflow:hidden}
  .ex .bar span{display:block;height:100%;width:100%;border-radius:7px;background:linear-gradient(90deg,${c.gold},${accent});box-shadow:0 0 12px ${accent};transition:width 1s linear}

  .ex .bento{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
  .ex .bc{position:relative;overflow:hidden;isolation:isolate;border-radius:22px;padding:16px;min-height:178px;display:flex;flex-direction:column;justify-content:flex-end;gap:6px;background:linear-gradient(165deg,${accent}3d,${c.card} 60%),${c.bg};border:1px solid ${c.line};box-shadow:0 14px 30px rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.08)}
  .ex .bc::before{content:"";position:absolute;inset:0;border-radius:inherit;padding:1.5px;background:linear-gradient(150deg,${c.gold},transparent 38%,transparent 62%,${accent});-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;pointer-events:none;opacity:.8}
  .ex .bc .glow{position:absolute;right:-22%;top:-22%;width:75%;aspect-ratio:1;border-radius:50%;background:radial-gradient(circle,${accent}70,transparent 65%);z-index:-2}
  .ex .bc .ic{position:absolute;right:6px;top:10px;width:48%;max-width:124px;aspect-ratio:1;z-index:-1;filter:drop-shadow(0 10px 14px rgba(0,0,0,.45))}
  .ex .bc .ic>*{display:block;width:100%;height:100%;object-fit:contain;animation:exBob 4s ease-in-out infinite}
  .ex .bc:nth-child(2) .ic>*{animation-delay:-1s}.ex .bc:nth-child(3) .ic>*{animation-delay:-2s}.ex .bc:nth-child(4) .ic>*{animation-delay:-3s}
  .ex .bc .tag{position:absolute;left:12px;top:12px;padding:4px 9px;border-radius:999px;font-size:10px;font-weight:900;letter-spacing:.09em;${goldPill};box-shadow:0 4px 12px rgba(245,179,36,.45)}
  .ex .bc b{font-size:19px;line-height:1.05;font-weight:900}
  .ex .bc .d{font-size:13px;color:${c.muted};line-height:1.3}
  .ex .bc:nth-child(2) .shine{animation-delay:1.1s}.ex .bc:nth-child(3) .shine{animation-delay:2.2s}.ex .bc:nth-child(4) .shine{animation-delay:3.3s}
  .ex .bc:first-child{grid-column:span 2;min-height:236px;padding:20px}
  .ex .bc:first-child b{font-size:clamp(30px,8vw,46px);max-width:62%;background:linear-gradient(180deg,${c.hi} 30%,${c.gold});${clip}}
  .ex .bc:first-child .d{font-size:14.5px;max-width:58%}
  .ex .bc:first-child .ic{width:50%;max-width:230px;top:50%;right:2%;transform:translateY(-50%)}
  .ex .bc:first-child .tag{font-size:11px;padding:5px 11px}
  @media(max-width:759px){.ex .bc:last-child:nth-child(even){grid-column:span 2}.ex .bc:last-child:nth-child(even) .ic{width:34%}.ex .bc:last-child:nth-child(even) b,.ex .bc:last-child:nth-child(even) .d{max-width:62%}}
  @media(min-width:760px){.ex .bento{grid-template-columns:repeat(4,1fr);grid-auto-rows:minmax(190px,auto)}.ex .bc:first-child{grid-row:span 2}.ex .bc:nth-child(2){grid-column:span 2}}

  .ex .trust{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;text-align:center}
  .ex .trust>div{display:flex;flex-direction:column;align-items:center;gap:7px;padding:18px 6px 14px;border-radius:20px;background:${c.card};border:1px solid ${c.line}}
  .ex .trust .ti{width:42px;height:42px;border-radius:14px;display:flex;align-items:center;justify-content:center;background:linear-gradient(150deg,${c.gold},${accent});box-shadow:0 8px 18px ${accent}55,inset 0 2px 0 rgba(255,255,255,.35)}
  .ex .trust .ti svg{width:22px;height:22px}
  .ex .trust b{font-size:clamp(17px,4.8vw,28px);font-weight:900;line-height:1.05;background:linear-gradient(180deg,${c.hi} 30%,${c.gold});${clip}}
  .ex .trust .l{font-size:11px;color:${c.muted};text-transform:uppercase;letter-spacing:.05em;font-weight:800}
  .ex .chips{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin-top:12px}
  .ex .chips span{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:12px;background:${c.chip};border:1px solid ${c.line};font-size:12.5px;font-weight:800}
  .ex .chips span:first-child{border-color:#22c55e66;color:#22c55e}
  .ex .chips svg{width:14px;height:14px}

  .ex .steps{display:grid;gap:16px}
  .ex .steps>div{position:relative;display:flex;gap:14px;align-items:center;padding:16px;border-radius:20px;background:${c.card};border:1px solid ${c.line};font-weight:800;font-size:15px;line-height:1.3}
  .ex .steps i{flex:none;width:50px;height:50px;border-radius:16px;display:flex;align-items:center;justify-content:center;font-style:normal;font-size:24px;font-weight:900;color:#fff;background:linear-gradient(150deg,${c.gold},${accent});box-shadow:0 10px 22px ${accent}55,inset 0 2px 0 rgba(255,255,255,.4);transform:rotate(-6deg);text-shadow:0 2px 0 rgba(0,0,0,.2)}
  .ex .steps>div:not(:last-child)::after{content:"";position:absolute;left:40px;bottom:-17px;width:3px;height:18px;border-radius:3px;background:linear-gradient(${accent},${c.gold})}
  @media(min-width:760px){.ex .steps{grid-template-columns:repeat(3,1fr)}.ex .steps>div{flex-direction:column;text-align:center;padding:24px 16px}.ex .steps>div:not(:last-child)::after{left:auto;right:-17px;top:50%;bottom:auto;width:18px;height:3px}}

  .ex .dot{display:inline-block;width:12px;height:12px;margin:0 10px 4px 0;border-radius:50%;background:#ff3b5c;vertical-align:middle;box-shadow:0 0 0 0 rgba(255,59,92,.6);animation:exLive 1.4s infinite}
  .ex .tick{overflow:hidden;padding:2px 0;-webkit-mask-image:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent);mask-image:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent)}
  .ex .tick .row{display:flex;gap:10px;width:max-content;animation:exTick 55s linear infinite}
  .ex .tick .row+.row{margin-top:10px;animation-direction:reverse;animation-duration:65s}
  .ex .tw{display:inline-flex;align-items:center;gap:8px;padding:7px 14px 7px 7px;border-radius:999px;background:${c.card};border:1px solid ${c.line};white-space:nowrap;font-size:13.5px}
  .ex .tw i{width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-style:normal;font-weight:900;color:#fff;font-size:13px;box-shadow:inset 0 -2px 0 rgba(0,0,0,.2)}
  .ex .tw b{padding:3px 9px;border-radius:999px;font-weight:900;${goldPill}}
  .ex .tw small{color:${c.muted};font-size:12px}

  .ex .rev{display:grid;gap:12px}
  .ex .rv{position:relative;overflow:hidden;padding:18px;border-radius:20px;background:${c.card};border:1px solid ${c.line};font-size:14.5px;line-height:1.45}
  .ex .rv::before{content:"“";position:absolute;right:12px;top:-14px;font:900 96px/1 Georgia,serif;color:${accent};opacity:.32}
  .ex .rv .st{color:#fbbf24;letter-spacing:3px;font-size:17px;margin-bottom:8px;text-shadow:0 0 12px rgba(251,191,36,.55)}
  .ex .rv .who{display:flex;align-items:center;gap:10px;margin-top:14px}
  .ex .rv .av{position:relative;flex:none;width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:900;color:#fff}
  .ex .rv .av::after{content:"✓";position:absolute;right:-3px;bottom:-3px;width:17px;height:17px;border-radius:50%;background:#22c55e;color:#fff;font-size:10px;display:flex;align-items:center;justify-content:center;border:2px solid ${c.bg}}
  .ex .rv .nm{font-weight:800;font-size:14px}
  .ex .rv .ct{font-size:12px;color:${c.muted}}
  @media(min-width:760px){.ex .rev{grid-template-columns:repeat(3,1fr)}.ex .rv:nth-child(2){transform:translateY(16px)}}

  .ex details{border-radius:16px;background:${c.card};border:1px solid ${c.line};margin-bottom:10px;transition:border-color .2s,box-shadow .2s}
  .ex details[open]{border-color:${accent}99;box-shadow:0 0 0 3px ${accent}22}
  .ex summary{position:relative;list-style:none;cursor:pointer;font-weight:800;font-size:15px;padding:17px 56px 17px 18px}
  .ex summary::-webkit-details-marker{display:none}
  .ex summary::after{content:"+";position:absolute;right:14px;top:50%;width:28px;height:28px;margin-top:-14px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:linear-gradient(150deg,${c.gold},${accent});color:#fff;font-size:20px;font-weight:900;transition:transform .25s}
  .ex details[open] summary::after{transform:rotate(45deg)}
  .ex details p{padding:0 18px 17px;color:${c.muted};font-size:14px;line-height:1.5}

  .ex footer{text-align:center;font-size:12px;line-height:1.55;color:${c.muted};border-top:1px solid ${c.line};padding-top:22px}
  .ex footer .bdg{display:flex;justify-content:center;align-items:center;gap:10px;margin-bottom:12px}
  .ex footer .age{display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:50%;border:2px solid #ef4444;color:#ef4444;font-weight:900}
  .ex footer .ssl{display:inline-flex;align-items:center;gap:6px;padding:8px 12px;border-radius:999px;border:1px solid ${c.line};font-weight:800}
  .ex footer .ssl svg{width:13px;height:13px}
  @media (prefers-reduced-motion:reduce){.ex *,.ex *::before,.ex *::after{animation:none!important}}
  `;
}

const NAMES: Record<LandingLang, string[]> = {
  ru: ["Алексей", "Марина", "Дмитрий", "Ольга", "Игорь", "Анна", "Сергей", "Екатерина", "Максим", "Юлия"],
  uk: ["Олексій", "Марина", "Дмитро", "Ольга", "Ігор", "Анна", "Сергій", "Катерина", "Максим", "Юлія"],
  en: ["Alex", "Maria", "James", "Emma", "Liam", "Olivia", "Noah", "Sophia", "Jack", "Mia"],
  es: ["Carlos", "Lucía", "Diego", "Sofía", "Mateo", "Valentina", "Javier", "Camila", "Andrés", "Paula"],
};

/** Цвета аватаров — по кругу. */
const AVATAR = ["#f43f5e,#be123c", "#3b82f6,#1d4ed8", "#22c55e,#15803d", "#f59e0b,#b45309", "#a855f7,#7e22ce", "#06b6d4,#0e7490"];

type ArtName = "gift" | "coins" | "spins" | "cashback" | "crown" | "ticket" | "rocket";

/** Иллюстрация карточки бонуса по смыслу заголовка — пока нет своей картинки. */
function pickArt(title: string, i: number): ArtName {
  const t = title.toLowerCase();
  if (/фрисп|фріспі|фриспі|spin|giro/.test(t)) return "spins";
  if (/кэшб|кешб|cashback/.test(t)) return "cashback";
  if (/фрибет|фрібет|free bet|gratis/.test(t)) return "ticket";
  if (/буст|boost|potenci/.test(t)) return "rocket";
  if (/ежеднев|щоденн|daily|diario|vip/.test(t)) return "crown";
  if (/%|депоз|deposit|depósit/.test(t)) return "coins";
  return (["gift", "coins", "crown", "rocket"] as ArtName[])[i % 4];
}

function art(name: ArtName, u: string, accent: string): string {
  const ac = /^#[0-9a-f]{3,8}$/i.test(accent) ? accent : "#f59e0b";
  const G = `url(#g${u})`;
  const A = `url(#a${u})`;
  const ink = `stroke="#a86500" stroke-width="2.5" stroke-linejoin="round"`;
  const defs = `<defs><linearGradient id="g${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3b8"/><stop offset=".45" stop-color="#ffc93c"/><stop offset="1" stop-color="#d98a00"/></linearGradient><linearGradient id="a${u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${ac}"/><stop offset="1" stop-color="${ac}" stop-opacity=".6"/></linearGradient></defs>`;
  const coin = (y: number) => `<path d="M20 ${y}v10c0 5.5 13.4 10 30 10s30-4.5 30-10v-10z" fill="#c98200" ${ink}/><ellipse cx="50" cy="${y}" rx="30" ry="10" fill="${G}" ${ink}/>`;
  const seven = (x: number) => `<rect x="${x}" y="33" width="20" height="38" rx="4" fill="#fff"/><text x="${x + 10}" y="62" text-anchor="middle" font-family="Arial Black,Arial" font-weight="900" font-size="28" fill="#e11d48">7</text>`;
  const body: Record<ArtName, string> = {
    gift: `<rect x="15" y="44" width="70" height="46" rx="8" fill="${A}" stroke="rgba(0,0,0,.25)" stroke-width="2"/><rect x="9" y="31" width="82" height="17" rx="6" fill="${G}" ${ink}/><rect x="44" y="31" width="12" height="59" fill="${G}" ${ink}/><path d="M50 31C42 12 20 13 27 29zM50 31C58 12 80 13 73 29z" fill="${G}" ${ink}/><rect x="15" y="48" width="70" height="5" fill="rgba(0,0,0,.18)"/>`,
    coins: `${coin(74)}${coin(60)}${coin(46)}${coin(32)}<text x="50" y="38" text-anchor="middle" font-family="Arial Black,Arial" font-weight="900" font-size="15" fill="#a86500">$</text>`,
    spins: `<rect x="8" y="22" width="80" height="60" rx="12" fill="${A}" stroke="${G}" stroke-width="5"/>${seven(16)}${seven(38)}${seven(60)}<rect x="89" y="36" width="5" height="26" rx="2" fill="${G}"/><circle cx="91.5" cy="32" r="6" fill="#e11d48" stroke="#fff" stroke-width="1.5"/>`,
    cashback: `<path d="M50 12A38 38 0 1 1 13 42" fill="none" stroke="${A}" stroke-width="8" stroke-linecap="round"/><path d="M3 40l11-14 12 15z" fill="${ac}"/><circle cx="50" cy="52" r="25" fill="${G}" ${ink}/><circle cx="50" cy="52" r="18" fill="none" stroke="#a86500" stroke-width="2" opacity=".5"/><text x="50" y="62" text-anchor="middle" font-family="Arial Black,Arial" font-weight="900" font-size="26" fill="#a86500">%</text>`,
    crown: `<path d="M14 72L8 30l24 18 18-30 18 30 24-18-6 42z" fill="${G}" ${ink}/><rect x="13" y="71" width="74" height="13" rx="4" fill="${A}"/><circle cx="50" cy="56" r="7" fill="${ac}" stroke="#fff" stroke-width="2"/><circle cx="29" cy="61" r="4" fill="#fff"/><circle cx="71" cy="61" r="4" fill="#fff"/><circle cx="8" cy="30" r="4" fill="${G}"/><circle cx="50" cy="18" r="4" fill="${G}"/><circle cx="92" cy="30" r="4" fill="${G}"/>`,
    ticket: `<g transform="rotate(-12 50 50)"><path d="M8 30h84v13a7 7 0 0 0 0 14v13H8V57a7 7 0 0 0 0-14z" fill="${G}" ${ink}/><path d="M66 32v36" stroke="#a86500" stroke-width="2" stroke-dasharray="4 4"/><text x="37" y="59" text-anchor="middle" font-family="Arial Black,Arial" font-weight="900" font-size="22" fill="${ac}">FREE</text><path d="M79 42l2.5 5 5.5.8-4 3.9 1 5.4-5-2.6-5 2.6 1-5.4-4-3.9 5.5-.8z" fill="${ac}"/></g>`,
    rocket: `<path d="M41 74q9 26 18 0z" fill="#ff7a1a"/><path d="M45 74q5 14 10 0z" fill="#ffe14d"/><path d="M34 56L18 76l18-5zM66 56l16 20-18-5z" fill="${A}"/><path d="M50 6c18 14 22 40 16 68H34C28 46 32 20 50 6z" fill="#f4f1ff" stroke="rgba(0,0,0,.2)" stroke-width="2"/><path d="M50 6c7 5 11 11 14 18H36c3-7 7-13 14-18z" fill="${A}"/><circle cx="50" cy="42" r="9" fill="${A}" stroke="${G}" stroke-width="4"/>`,
  };
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${defs}${body[name]}</svg>`;
}

const ICON = {
  star: `<svg viewBox="0 0 24 24"><path d="M12 2l3 6.5 7 .8-5.2 4.8 1.4 7L12 17.6 5.8 21l1.4-7L2 9.3l7-.8z" fill="#fff"/></svg>`,
  users: `<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="4" fill="#fff"/><path d="M1 21c0-4.4 3.6-7 8-7s8 2.6 8 7z" fill="#fff"/><circle cx="17.5" cy="8.5" r="3" fill="#fff" opacity=".7"/><path d="M15.5 14.2c4 .3 7.5 2.2 7.5 6.8h-4.5" fill="#fff" opacity=".7"/></svg>`,
  bolt: `<svg viewBox="0 0 24 24"><path d="M13.5 2L4 14h7l-1.5 8L19 10h-7z" fill="#fff"/></svg>`,
  shield: `<svg viewBox="0 0 24 24"><path d="M12 2l8 3v6c0 5-3.4 9.4-8 11-4.6-1.6-8-6-8-11V5z" fill="currentColor"/><path d="M8 12l3 3 5-6" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  lock: `<svg viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="12" rx="3" fill="currentColor"/><path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2.4"/></svg>`,
  arrow: `<svg viewBox="0 0 24 24"><path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};

const FX =
  `<div class="fx" aria-hidden="true">` +
  `<i style="left:3%;top:7%;width:30px;height:30px"></i><i style="right:5%;top:22%;width:22px;height:22px;animation-delay:-2s"></i>` +
  `<i style="left:6%;top:48%;width:18px;height:18px;animation-delay:-4s"></i><i style="right:3%;top:63%;width:34px;height:34px;animation-delay:-1s"></i>` +
  `<i style="left:46%;top:86%;width:20px;height:20px;animation-delay:-3s"></i>` +
  `<b style="left:14%;top:16%">✦</b><b style="right:16%;top:9%;animation-delay:-1s">✦</b><b style="left:10%;top:70%;animation-delay:-2s">✦</b><b style="right:12%;top:44%;font-size:13px;animation-delay:-.5s">✦</b>` +
  `</div>`;

function sectionsHtml(x: LandingExtras, s: LandingStrings, accent: string): string {
  const parts: string[] = [];
  const cta = `<button type="button" class="cta" data-excta><span class="shine"></span><span>🎁</span><span>${esc(s.claimNow)}</span>${ICON.arrow}</button>`;
  if (x.timer.on) {
    const mm = String(Math.max(1, Math.min(180, x.timer.minutes | 0))).padStart(2, "0");
    const digits = `${mm}:00`.split("").map((ch) => (ch === ":" ? "<em>:</em>" : `<i>${ch}</i>`)).join("");
    parts.push(`<div class="timer"><div class="tt"><span class="fire">🔥</span><span>${esc(x.timer.text)}</span></div><b class="digits" data-extimer>${digits}</b><div class="bar"><span data-exbar></span></div></div>`);
  }
  if (x.bonuses.on && x.bonuses.items.length) {
    const tags = ["HOT", "TOP", "NEW", "VIP"];
    const cards = x.bonuses.items
      .filter((b) => b.title.trim())
      .map((b, i) => {
        const pic = b.image && /^data:image\//.test(b.image) ? `<img src="${esc(b.image)}" alt=""/>` : art(pickArt(b.title, i), `b${i}`, accent);
        return `<div class="bc"><span class="glow"></span><span class="shine"></span><span class="ic">${pic}</span><span class="tag">${tags[i % tags.length]}</span><b>${esc(b.title)}</b><span class="d">${esc(b.text)}</span></div>`;
      })
      .join("");
    parts.push(`<section><h2>${esc(x.bonuses.title)}</h2><div class="bento">${cards}</div></section>`);
  }
  if (x.trust.on) {
    const pays = x.trust.payments.split(",").map((p) => p.trim()).filter(Boolean).slice(0, 10).map((p) => `<span>${esc(p)}</span>`).join("");
    parts.push(
      `<section><div class="trust"><div><span class="ti">${ICON.star}</span><b>${esc(x.trust.rating)}</b><span class="l">${esc(s.rating)}</span></div><div><span class="ti">${ICON.users}</span><b>${esc(x.trust.players)}</b><span class="l">${esc(s.players)}</span></div><div><span class="ti">${ICON.bolt}</span><b>${esc(x.trust.payout)}</b><span class="l">${esc(s.payout)}</span></div></div>` +
        `<div class="chips">${x.trust.license.trim() ? `<span>${ICON.shield}${esc(x.trust.license)}</span>` : ""}${pays}</div></section>`,
    );
  }
  if (x.steps.on && x.steps.items.length) {
    const st = x.steps.items.filter((t) => t.trim()).map((t, i) => `<div><i>${i + 1}</i><span>${esc(t)}</span></div>`).join("");
    parts.push(`<section><h2>${esc(x.steps.title)}</h2><div class="steps">${st}</div></section>`);
  }
  if (x.bonuses.on || x.steps.on) parts.push(cta);
  if (x.winners.on) parts.push(`<section><h2><span class="dot"></span>${esc(s.winnersTitle)}</h2><div class="tick"><div class="row" data-exticker></div><div class="row" data-exticker2></div></div></section>`);
  if (x.reviews.on && x.reviews.items.length) {
    const rv = x.reviews.items
      .filter((r) => r.text.trim())
      .map((r, i) => {
        const initial = esc(Array.from(r.name.trim())[0]?.toUpperCase() ?? "★");
        return `<div class="rv"><div class="st">★★★★★</div><p>${esc(r.text)}</p><div class="who"><span class="av" style="background:linear-gradient(150deg,${AVATAR[i % AVATAR.length]})">${initial}</span><div><div class="nm">${esc(r.name)}</div>${r.city.trim() ? `<div class="ct">${esc(r.city)}</div>` : ""}</div></div></div>`;
      })
      .join("");
    parts.push(`<section><h2>${esc(x.reviews.title)}</h2><div class="rev">${rv}</div></section>`);
  }
  if (x.faq.on && x.faq.items.length) {
    const fq = x.faq.items.filter((f) => f.q.trim()).map((f, i) => `<details${i === 0 ? " open" : ""}><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("");
    parts.push(`<section><h2>${esc(x.faq.title)}</h2><div>${fq}</div></section>`);
  }
  if (parts.length && !(x.bonuses.on || x.steps.on)) parts.push(cta);
  parts.push(`<footer><div class="bdg"><div class="age">18+</div><span class="ssl">${ICON.lock}SSL</span></div><div>${esc(x.legal)}</div><div style="margin-top:6px;font-weight:700">${esc(s.responsible)}</div></footer>`);
  return `<main class="ex">${FX}<div class="w">${parts.join("")}</div></main>`;
}

function kitScript(x: LandingExtras, ctaUrl: string, kind: LandingKind): string {
  const cfg = {
    url: safeCtaUrl(ctaUrl),
    pass: !!x.tracking.passParams,
    timer: x.timer.on ? Math.max(1, Math.min(180, x.timer.minutes | 0)) : 0,
    winners: x.winners.on,
    sport: kind === "sport",
    names: NAMES[x.lang],
    cur: x.winners.currency.slice(0, 6),
    won: landingStrings(x.lang).won,
    pixels: !!(x.tracking.metaPixel || x.tracking.tiktokPixel || x.tracking.gtm),
  };
  // __goCta — единственный путь со страницы на оффер: события пикселей,
  // проброс параметров адреса, переход в верхнее окно (лендинг бывает в iframe).
  return `<script>
(function(){
  var C=${embedJson(cfg)};
  window.__goCta=function(u){
    u=u||C.url;
    try{ if(window.fbq) fbq('track','Lead'); }catch(e){}
    try{ if(window.ttq) ttq.track('ClickButton'); }catch(e){}
    try{ (window.dataLayer=window.dataLayer||[]).push({event:'cta_click'}); }catch(e){}
    if(!u) return false;
    var dest=u;
    if(C.pass && /^https?:/i.test(u)){
      try{ var t=new URL(u), src=new URLSearchParams(location.search); src.forEach(function(v,k){ if(!t.searchParams.has(k)) t.searchParams.set(k,v); }); dest=t.toString(); }catch(e){}
    }
    setTimeout(function(){ (window.top||window).location.href=dest; }, C.pixels?180:0);
    return true;
  };
  var btns=document.querySelectorAll('[data-excta]');
  for(var i=0;i<btns.length;i++) btns[i].onclick=function(){ window.__goCta(); };
  function esc(v){ return String(v).replace(/[&<>"]/g,function(ch){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]; }); }
  var tEl=document.querySelector('[data-extimer]'), bar=document.querySelector('[data-exbar]');
  if(tEl && C.timer){
    var total=C.timer*60000, end=Date.now()+total;
    (function tick(){ var d=Math.max(0,end-Date.now()); if(d===0) end=Date.now()+total;
      var m=Math.floor(d/60000), s=Math.floor(d%60000/1000), t=(m<10?'0':'')+m+':'+(s<10?'0':'')+s, h='';
      for(var j=0;j<t.length;j++){ var ch=t.charAt(j); h+=ch===':'?'<em>:</em>':'<i>'+ch+'</i>'; }
      tEl.innerHTML=h; if(bar) bar.style.width=(d/total*100).toFixed(2)+'%'; setTimeout(tick,1000); })();
  }
  var rows=[document.querySelector('[data-exticker]'),document.querySelector('[data-exticker2]')];
  if(rows[0] && C.winners){
    var games=C.sport?['Real Madrid – Barcelona','Arsenal – Chelsea','PSG – Bayern','Inter – Milan','Liverpool – Man City','Juventus – Napoli']:['Sweet Bonanza','Gates of Olympus','Book of Dead','Aviator','Big Bass','Wild West Gold'];
    var av=${embedJson(AVATAR)};
    for(var r=0;r<rows.length;r++){ if(!rows[r]) continue; var html='';
      for(var k=0;k<12;k++){ var idx=k+r*5, n=C.names[idx%C.names.length], a=Math.round((50+Math.random()*4950)/10)*10;
        html+='<span class="tw"><i style="background:linear-gradient(150deg,'+av[idx%av.length]+')">'+esc(n.charAt(0))+'</i>'+esc(n)+' '+esc(C.won)+' <b>'+a.toLocaleString()+' '+esc(C.cur)+'</b><small>'+esc(games[idx%games.length])+'</small></span>'; }
      rows[r].innerHTML=html+html; }
  }
})();
</script>`;
}

export type KitParts = {
  lang: LandingLang;
  head: string;
  css: string;
  legalLine: string;
  after: string;
  script: string;
  strings: LandingStrings;
  /** Тексты для рантайма механики — вставлять как var T=…; */
  stringsJson: string;
};

/** Куски страницы для экспорта механики. extras не задан — умолчания (ru). */
export function kitParts(extras: LandingExtras | undefined, accent: string, dark: boolean, ctaUrl: string, kind: LandingKind): KitParts {
  const x = extras ? normalizeExtras(extras, kind) : defaultExtras("ru", kind);
  const strings = landingStrings(x.lang);
  return {
    lang: x.lang,
    head: trackingHead(x.tracking),
    css: kitCss(accent, dark),
    legalLine: x.legal.trim() ? `<div class="exLegalLine">${esc(x.legal)}</div>` : "",
    after: sectionsHtml(x, strings, accent),
    script: kitScript(x, ctaUrl, kind),
    strings,
    stringsJson: embedJson(strings),
  };
}

/** Превью только блоков под механикой — для редактора. */
export function buildExtrasPreviewHtml(extras: LandingExtras, accent: string, dark: boolean, kind: LandingKind): string {
  const k = kitParts(extras, accent, dark, "", kind);
  return `<!doctype html><html lang="${k.lang}"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><style>*{margin:0;padding:0}${k.css}</style></head><body>${k.after}${k.script}</body></html>`;
}


/** Без картинок карточек — для черновика, если не влезает в хранилище браузера. */
export function stripExtrasImages(x: LandingExtras): LandingExtras {
  return { ...x, bonuses: { ...x.bonuses, items: x.bonuses.items.map(({ title, text }) => ({ title, text })) } };
}
