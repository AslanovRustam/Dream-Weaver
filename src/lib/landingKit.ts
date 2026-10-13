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

function kitCss(accent: string, dark: boolean): string {
  const c = dark
    ? { bg: "#0d0a17", text: "#f4f1ff", muted: "rgba(244,241,255,.62)", card: "rgba(255,255,255,.06)", line: "rgba(255,255,255,.10)" }
    : { bg: "#fff8ea", text: "#1d1408", muted: "rgba(29,20,8,.62)", card: "#ffffff", line: "rgba(29,20,8,.10)" };
  return `
  body{overflow-x:hidden;overflow-y:auto}
  .modal{position:fixed!important}
  .exLegalLine{position:absolute;left:0;right:0;bottom:6px;z-index:6;padding:0 14px;text-align:center;font-size:10px;line-height:1.3;color:rgba(255,255,255,.72);text-shadow:0 1px 2px rgba(0,0,0,.7);pointer-events:none}
  .ex{background:${c.bg};color:${c.text};padding:28px 16px 40px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif}
  .ex *{box-sizing:border-box}
  .ex .w{max-width:960px;margin:0 auto;display:flex;flex-direction:column;gap:30px}
  .ex h2{font-size:clamp(22px,5vw,30px);font-weight:900;text-align:center;letter-spacing:-.01em}
  .ex .cta{display:block;width:100%;max-width:380px;margin:0 auto;border:0;border-radius:999px;padding:16px;font-size:18px;font-weight:900;text-transform:uppercase;text-align:center;text-decoration:none;color:#fff;cursor:pointer;background:linear-gradient(180deg,${accent},${accent}cc);box-shadow:0 10px 24px ${accent}55;animation:exPulse 1.6s ease-in-out infinite}
  @keyframes exPulse{50%{transform:scale(1.04)}}
  .ex .timer{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:10px;padding:14px;border-radius:16px;background:${c.card};border:1px solid ${c.line};font-weight:700}
  .ex .timer b{font-variant-numeric:tabular-nums;font-size:24px;color:${accent}}
  .ex .bento{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
  @media(min-width:760px){.ex .bento{grid-template-columns:repeat(4,1fr)}}
  .ex .bc{position:relative;overflow:hidden;border-radius:18px;padding:16px;min-height:150px;background:linear-gradient(160deg,${accent}33,${c.card} 60%);border:1px solid ${c.line};display:flex;flex-direction:column;justify-content:flex-end;gap:4px}
  .ex .bc img{position:absolute;right:-6px;top:-6px;width:58%;max-height:62%;object-fit:contain;filter:drop-shadow(0 8px 12px rgba(0,0,0,.35))}
  .ex .bc b{position:relative;font-size:18px;line-height:1.1}
  .ex .bc span{position:relative;font-size:13px;color:${c.muted}}
  .ex .trust{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;text-align:center}
  .ex .trust div{padding:14px 8px;border-radius:16px;background:${c.card};border:1px solid ${c.line}}
  .ex .trust b{display:block;font-size:22px;color:${accent}}
  .ex .trust span{font-size:12px;color:${c.muted}}
  .ex .chips{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin-top:10px}
  .ex .chips span{padding:6px 12px;border-radius:999px;background:${c.card};border:1px solid ${c.line};font-size:12px;font-weight:700}
  .ex .steps{display:grid;gap:10px}
  @media(min-width:760px){.ex .steps{grid-template-columns:repeat(3,1fr)}}
  .ex .steps div{display:flex;gap:12px;align-items:center;padding:14px;border-radius:16px;background:${c.card};border:1px solid ${c.line};font-weight:700}
  .ex .steps i{flex:none;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-style:normal;font-weight:900;color:#fff;background:${accent}}
  .ex .tick{overflow:hidden;border-radius:16px;background:${c.card};border:1px solid ${c.line};padding:10px 0}
  .ex .tick .row{display:flex;gap:28px;width:max-content;animation:exTick 40s linear infinite;white-space:nowrap;font-size:14px}
  .ex .tick b{color:${accent}}
  @keyframes exTick{to{transform:translateX(-50%)}}
  .ex .rev{display:grid;gap:10px}
  @media(min-width:760px){.ex .rev{grid-template-columns:repeat(3,1fr)}}
  .ex .rev div{padding:16px;border-radius:16px;background:${c.card};border:1px solid ${c.line};font-size:14px}
  .ex .rev .st{color:#fbbf24;letter-spacing:2px}
  .ex .rev .who{margin-top:8px;font-weight:800;font-size:13px;color:${c.muted}}
  .ex details{padding:14px 16px;border-radius:14px;background:${c.card};border:1px solid ${c.line};margin-bottom:8px}
  .ex summary{cursor:pointer;font-weight:800}
  .ex details p{margin-top:8px;color:${c.muted};font-size:14px}
  .ex footer{text-align:center;font-size:12px;line-height:1.5;color:${c.muted};border-top:1px solid ${c.line};padding-top:18px}
  .ex footer .age{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:50%;border:2px solid ${c.muted};font-weight:900;margin-bottom:8px}
  `;
}

const NAMES: Record<LandingLang, string[]> = {
  ru: ["Алексей", "Марина", "Дмитрий", "Ольга", "Игорь", "Анна", "Сергей", "Екатерина", "Максим", "Юлия"],
  uk: ["Олексій", "Марина", "Дмитро", "Ольга", "Ігор", "Анна", "Сергій", "Катерина", "Максим", "Юлія"],
  en: ["Alex", "Maria", "James", "Emma", "Liam", "Olivia", "Noah", "Sophia", "Jack", "Mia"],
  es: ["Carlos", "Lucía", "Diego", "Sofía", "Mateo", "Valentina", "Javier", "Camila", "Andrés", "Paula"],
};

function sectionsHtml(x: LandingExtras, s: LandingStrings): string {
  const parts: string[] = [];
  const cta = `<button type="button" class="cta" data-excta>${esc(s.claimNow)}</button>`;
  if (x.timer.on) parts.push(`<div class="timer"><span>⏳ ${esc(x.timer.text)}</span><b data-extimer>${String(Math.max(1, x.timer.minutes | 0)).padStart(2, "0")}:00</b></div>`);
  if (x.bonuses.on && x.bonuses.items.length) {
    const cards = x.bonuses.items
      .filter((b) => b.title.trim())
      .map((b) => `<div class="bc">${b.image && /^data:image\//.test(b.image) ? `<img src="${esc(b.image)}" alt=""/>` : ""}<b>${esc(b.title)}</b><span>${esc(b.text)}</span></div>`)
      .join("");
    parts.push(`<section><h2>${esc(x.bonuses.title)}</h2><div class="bento" style="margin-top:14px">${cards}</div></section>`);
  }
  if (x.trust.on) {
    const pays = x.trust.payments.split(",").map((p) => p.trim()).filter(Boolean).slice(0, 10).map((p) => `<span>${esc(p)}</span>`).join("");
    parts.push(
      `<section><div class="trust"><div><b>★ ${esc(x.trust.rating)}</b><span>${esc(s.rating)}</span></div><div><b>${esc(x.trust.players)}</b><span>${esc(s.players)}</span></div><div><b>${esc(x.trust.payout)}</b><span>${esc(s.payout)}</span></div></div>` +
        `<div class="chips">${x.trust.license.trim() ? `<span>🛡 ${esc(x.trust.license)}</span>` : ""}${pays}</div></section>`,
    );
  }
  if (x.steps.on && x.steps.items.length) {
    const st = x.steps.items.filter((t) => t.trim()).map((t, i) => `<div><i>${i + 1}</i><span>${esc(t)}</span></div>`).join("");
    parts.push(`<section><h2>${esc(x.steps.title)}</h2><div class="steps" style="margin-top:14px">${st}</div></section>`);
  }
  if (x.bonuses.on || x.steps.on) parts.push(cta);
  if (x.winners.on) parts.push(`<section><h2>${esc(s.winnersTitle)}</h2><div class="tick" style="margin-top:14px"><div class="row" data-exticker></div></div></section>`);
  if (x.reviews.on && x.reviews.items.length) {
    const rv = x.reviews.items
      .filter((r) => r.text.trim())
      .map((r) => `<div><div class="st">★★★★★</div><p>${esc(r.text)}</p><div class="who">${esc(r.name)}${r.city.trim() ? ", " + esc(r.city) : ""}</div></div>`)
      .join("");
    parts.push(`<section><h2>${esc(x.reviews.title)}</h2><div class="rev" style="margin-top:14px">${rv}</div></section>`);
  }
  if (x.faq.on && x.faq.items.length) {
    const fq = x.faq.items.filter((f) => f.q.trim()).map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("");
    parts.push(`<section><h2>${esc(x.faq.title)}</h2><div style="margin-top:14px">${fq}</div></section>`);
  }
  if (parts.length && !(x.bonuses.on || x.steps.on)) parts.push(cta);
  parts.push(`<footer><div class="age">18+</div><div>${esc(x.legal)}</div><div style="margin-top:6px;font-weight:700">${esc(s.responsible)}</div></footer>`);
  return `<main class="ex"><div class="w">${parts.join("")}</div></main>`;
}

function kitScript(x: LandingExtras, ctaUrl: string): string {
  const cfg = {
    url: safeCtaUrl(ctaUrl),
    pass: !!x.tracking.passParams,
    timer: x.timer.on ? Math.max(1, Math.min(180, x.timer.minutes | 0)) : 0,
    winners: x.winners.on,
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
  var tEl=document.querySelector('[data-extimer]');
  if(tEl && C.timer){
    var end=Date.now()+C.timer*60000;
    (function tick(){ var d=Math.max(0,end-Date.now()); if(d===0) end=Date.now()+C.timer*60000;
      var m=Math.floor(d/60000), s=Math.floor(d%60000/1000); tEl.textContent=(m<10?'0':'')+m+':'+(s<10?'0':'')+s; setTimeout(tick,1000); })();
  }
  var row=document.querySelector('[data-exticker]');
  if(row && C.winners){
    var games=['Sweet Bonanza','Gates of Olympus','Book of Dead','Aviator','Big Bass','Wild West Gold'], html='';
    for(var k=0;k<12;k++){ var n=C.names[k%C.names.length], a=Math.round((50+Math.random()*4950)/10)*10;
      html+='<span>🏆 '+n+' '+C.won+' <b>'+a.toLocaleString()+' '+C.cur+'</b> · '+games[k%games.length]+'</span>'; }
    row.innerHTML=html+html;
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
    after: sectionsHtml(x, strings),
    script: kitScript(x, ctaUrl),
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
