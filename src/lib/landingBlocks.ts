// Дополнительные блоки лендинга под механикой: джекпот, промокод, преимущества,
// VIP-уровни, турнир, приложение, экспресс дня (спорт) и финальный призыв.
//
// Живут рядом с базовыми (бонусы, игры, доверие, шаги, лента, отзывы, FAQ) в
// LandingExtras; здесь — их тексты по умолчанию, разметка, стили и скрипт.
// По умолчанию выключены: включаются галочками «Блоки лендинга» в редакторе, а
// «Применить тему» переписывает их тексты под тематику (/api/landing-blocks).
//
// Подписи (кнопка «Скопировать», «Место», «Итоговый коэффициент»…) — в данных
// блока, а не в общих строках: так их переводит кампания вместе с текстами.

import type { LandingKind, LandingLang } from "./landingKit";
import { APP_STORE_BADGE, GOOGLE_PLAY_BADGE } from "./emailStoreBadges";

export type MoreBlocks = {
  jackpot: { on: boolean; title: string; amount: number; currency: string };
  promo: { on: boolean; title: string; code: string; text: string; copy: string; copied: string };
  features: { on: boolean; title: string; items: { title: string; text: string }[] };
  vip: { on: boolean; title: string; items: { name: string; perk: string }[] };
  tournament: { on: boolean; title: string; prize: string; text: string; place: string; points: string };
  app: { on: boolean; title: string; text: string };
  express: { on: boolean; title: string; total: string; items: { match: string; pick: string; odd: string }[] };
  final: { on: boolean; title: string; text: string; button: string };
};
export type MoreBlockId = keyof MoreBlocks;
export const MORE_BLOCK_IDS: MoreBlockId[] = ["jackpot", "promo", "features", "vip", "tournament", "app", "express", "final"];

type Txt = Omit<MoreBlocks, "jackpot"> & { jackpotTitle: string };

const T: Record<LandingLang, { casino: Txt; sport: Txt }> = {
  ru: {
    casino: {
      jackpotTitle: "Джекпот растёт прямо сейчас",
      promo: { on: false, title: "Твой промокод", code: "WELCOME200", text: "Введи при регистрации — и получи +200% к депозиту", copy: "Скопировать", copied: "Скопировано!" },
      features: { on: false, title: "Почему играют у нас", items: [
        { title: "Быстрый вывод", text: "Выплаты от 15 минут без скрытых комиссий" },
        { title: "Поддержка 24/7", text: "Ответим в чате за пару минут" },
        { title: "Удобно с телефона", text: "Играй в браузере или в приложении" },
        { title: "Честная игра", text: "Лицензия и сертифицированные провайдеры" },
      ] },
      vip: { on: false, title: "VIP-клуб", items: [
        { name: "Bronze", perk: "Кэшбэк 5% и подарок на день рождения" },
        { name: "Silver", perk: "Кэшбэк 10% и ускоренный вывод" },
        { name: "Gold", perk: "Кэшбэк 15% и личный менеджер" },
        { name: "Platinum", perk: "Кэшбэк 20% и эксклюзивные турниры" },
      ] },
      tournament: { on: false, title: "Турнир недели", prize: "1 000 000 ₽", text: "Крути слоты, набирай очки и забирай долю призового фонда", place: "Место", points: "очков" },
      app: { on: false, title: "Играй в приложении", text: "Бонусы и выплаты всегда под рукой — скачай за минуту" },
      express: { on: false, title: "Экспресс дня", total: "Итоговый коэффициент", items: [] },
      final: { on: false, title: "Твой бонус ждёт", text: "Регистрация за минуту — +200% и 500 фриспинов сразу на счёт", button: "Забрать бонус" },
    },
    sport: {
      jackpotTitle: "Призовой фонд прогнозов",
      promo: { on: false, title: "Промокод на фрибет", code: "FREEBET100", text: "Введи при регистрации — фрибет 100 € на первую ставку", copy: "Скопировать", copied: "Скопировано!" },
      features: { on: false, title: "Почему ставят у нас", items: [
        { title: "Высокие коэффициенты", text: "Маржа ниже, чем у конкурентов" },
        { title: "Live-ставки", text: "Тысячи событий в прямом эфире" },
        { title: "Быстрый вывод", text: "Выплаты от 15 минут" },
        { title: "Кэшаут", text: "Забирай выигрыш до конца матча" },
      ] },
      vip: { on: false, title: "Клуб беттора", items: [
        { name: "Bronze", perk: "Фрибет на день рождения" },
        { name: "Silver", perk: "Кэшбэк 5% на ставки" },
        { name: "Gold", perk: "Повышенные коэффициенты" },
        { name: "Platinum", perk: "Личный менеджер и VIP-лимиты" },
      ] },
      tournament: { on: false, title: "Турнир прогнозистов", prize: "500 000 ₽", text: "Угадывай исходы матчей, набирай очки и забирай призы", place: "Место", points: "очков" },
      app: { on: false, title: "Ставки в приложении", text: "Live, кэшаут и пуш о голах — скачай за минуту" },
      express: { on: false, title: "Экспресс дня", total: "Итоговый коэффициент", items: [
        { match: "Реал — Барселона", pick: "Обе забьют", odd: "1.72" },
        { match: "Ман Сити — Арсенал", pick: "П1", odd: "1.85" },
        { match: "Бавария — Боруссия", pick: "ТБ 2.5", odd: "1.55" },
      ] },
      final: { on: false, title: "Сделай первую ставку", text: "Регистрация за минуту — фрибет 100 € сразу на счёт", button: "Получить фрибет" },
    },
  },
  uk: {
    casino: {
      jackpotTitle: "Джекпот росте просто зараз",
      promo: { on: false, title: "Твій промокод", code: "WELCOME200", text: "Введи під час реєстрації — і отримай +200% до депозиту", copy: "Скопіювати", copied: "Скопійовано!" },
      features: { on: false, title: "Чому грають у нас", items: [
        { title: "Швидке виведення", text: "Виплати від 15 хвилин без прихованих комісій" },
        { title: "Підтримка 24/7", text: "Відповімо в чаті за кілька хвилин" },
        { title: "Зручно з телефона", text: "Грай у браузері або в застосунку" },
        { title: "Чесна гра", text: "Ліцензія та сертифіковані провайдери" },
      ] },
      vip: { on: false, title: "VIP-клуб", items: [
        { name: "Bronze", perk: "Кешбек 5% і подарунок на день народження" },
        { name: "Silver", perk: "Кешбек 10% і прискорене виведення" },
        { name: "Gold", perk: "Кешбек 15% і особистий менеджер" },
        { name: "Platinum", perk: "Кешбек 20% і ексклюзивні турніри" },
      ] },
      tournament: { on: false, title: "Турнір тижня", prize: "1 000 000 ₴", text: "Крути слоти, набирай очки й забирай частку призового фонду", place: "Місце", points: "очок" },
      app: { on: false, title: "Грай у застосунку", text: "Бонуси й виплати завжди під рукою — завантаж за хвилину" },
      express: { on: false, title: "Експрес дня", total: "Підсумковий коефіцієнт", items: [] },
      final: { on: false, title: "Твій бонус чекає", text: "Реєстрація за хвилину — +200% і 500 фриспінів одразу на рахунок", button: "Забрати бонус" },
    },
    sport: {
      jackpotTitle: "Призовий фонд прогнозів",
      promo: { on: false, title: "Промокод на фрібет", code: "FREEBET100", text: "Введи під час реєстрації — фрібет 100 € на першу ставку", copy: "Скопіювати", copied: "Скопійовано!" },
      features: { on: false, title: "Чому ставлять у нас", items: [
        { title: "Високі коефіцієнти", text: "Маржа нижча, ніж у конкурентів" },
        { title: "Live-ставки", text: "Тисячі подій у прямому ефірі" },
        { title: "Швидке виведення", text: "Виплати від 15 хвилин" },
        { title: "Кешаут", text: "Забирай виграш до кінця матчу" },
      ] },
      vip: { on: false, title: "Клуб беттора", items: [
        { name: "Bronze", perk: "Фрібет на день народження" },
        { name: "Silver", perk: "Кешбек 5% на ставки" },
        { name: "Gold", perk: "Підвищені коефіцієнти" },
        { name: "Platinum", perk: "Особистий менеджер і VIP-ліміти" },
      ] },
      tournament: { on: false, title: "Турнір прогнозистів", prize: "500 000 ₴", text: "Вгадуй результати матчів, набирай очки й забирай призи", place: "Місце", points: "очок" },
      app: { on: false, title: "Ставки в застосунку", text: "Live, кешаут і пуш про голи — завантаж за хвилину" },
      express: { on: false, title: "Експрес дня", total: "Підсумковий коефіцієнт", items: [
        { match: "Реал — Барселона", pick: "Обидві заб'ють", odd: "1.72" },
        { match: "Ман Сіті — Арсенал", pick: "П1", odd: "1.85" },
        { match: "Баварія — Боруссія", pick: "ТБ 2.5", odd: "1.55" },
      ] },
      final: { on: false, title: "Зроби першу ставку", text: "Реєстрація за хвилину — фрібет 100 € одразу на рахунок", button: "Отримати фрібет" },
    },
  },
  en: {
    casino: {
      jackpotTitle: "The jackpot is growing right now",
      promo: { on: false, title: "Your promo code", code: "WELCOME200", text: "Enter it when you sign up and get a +200% deposit bonus", copy: "Copy", copied: "Copied!" },
      features: { on: false, title: "Why players choose us", items: [
        { title: "Fast payouts", text: "Withdrawals from 15 minutes, no hidden fees" },
        { title: "24/7 support", text: "We reply in live chat within minutes" },
        { title: "Mobile friendly", text: "Play in the browser or in the app" },
        { title: "Fair play", text: "Licensed, with certified providers" },
      ] },
      vip: { on: false, title: "VIP club", items: [
        { name: "Bronze", perk: "5% cashback and a birthday gift" },
        { name: "Silver", perk: "10% cashback and faster withdrawals" },
        { name: "Gold", perk: "15% cashback and a personal manager" },
        { name: "Platinum", perk: "20% cashback and exclusive tournaments" },
      ] },
      tournament: { on: false, title: "Tournament of the week", prize: "€10,000", text: "Spin the slots, earn points and grab a share of the prize pool", place: "Place", points: "pts" },
      app: { on: false, title: "Play in the app", text: "Bonuses and payouts always at hand — install in a minute" },
      express: { on: false, title: "Acca of the day", total: "Total odds", items: [] },
      final: { on: false, title: "Your bonus is waiting", text: "Sign up in a minute — +200% and 500 free spins straight to your account", button: "Claim bonus" },
    },
    sport: {
      jackpotTitle: "Predictions prize pool",
      promo: { on: false, title: "Free bet promo code", code: "FREEBET100", text: "Enter it when you sign up — €100 free bet on your first bet", copy: "Copy", copied: "Copied!" },
      features: { on: false, title: "Why bettors choose us", items: [
        { title: "Top odds", text: "Lower margins than the competition" },
        { title: "Live betting", text: "Thousands of in-play events" },
        { title: "Fast payouts", text: "Withdrawals from 15 minutes" },
        { title: "Cash out", text: "Take your win before the final whistle" },
      ] },
      vip: { on: false, title: "Bettors club", items: [
        { name: "Bronze", perk: "Birthday free bet" },
        { name: "Silver", perk: "5% betting cashback" },
        { name: "Gold", perk: "Boosted odds" },
        { name: "Platinum", perk: "Personal manager and VIP limits" },
      ] },
      tournament: { on: false, title: "Predictions tournament", prize: "€5,000", text: "Call the results, earn points and win prizes", place: "Place", points: "pts" },
      app: { on: false, title: "Bet in the app", text: "Live, cash out and goal alerts — install in a minute" },
      express: { on: false, title: "Acca of the day", total: "Total odds", items: [
        { match: "Real Madrid — Barcelona", pick: "Both teams to score", odd: "1.72" },
        { match: "Man City — Arsenal", pick: "1", odd: "1.85" },
        { match: "Bayern — Dortmund", pick: "Over 2.5", odd: "1.55" },
      ] },
      final: { on: false, title: "Place your first bet", text: "Sign up in a minute — €100 free bet straight to your account", button: "Get free bet" },
    },
  },
  es: {
    casino: {
      jackpotTitle: "El jackpot crece ahora mismo",
      promo: { on: false, title: "Tu código promocional", code: "WELCOME200", text: "Introdúcelo al registrarte y recibe +200% en tu depósito", copy: "Copiar", copied: "¡Copiado!" },
      features: { on: false, title: "Por qué juegan con nosotros", items: [
        { title: "Retiros rápidos", text: "Pagos desde 15 minutos sin comisiones ocultas" },
        { title: "Soporte 24/7", text: "Respondemos en el chat en minutos" },
        { title: "Cómodo en el móvil", text: "Juega en el navegador o en la app" },
        { title: "Juego limpio", text: "Licencia y proveedores certificados" },
      ] },
      vip: { on: false, title: "Club VIP", items: [
        { name: "Bronze", perk: "Cashback 5% y regalo de cumpleaños" },
        { name: "Silver", perk: "Cashback 10% y retiros más rápidos" },
        { name: "Gold", perk: "Cashback 15% y gestor personal" },
        { name: "Platinum", perk: "Cashback 20% y torneos exclusivos" },
      ] },
      tournament: { on: false, title: "Torneo de la semana", prize: "10 000 €", text: "Gira los slots, suma puntos y llévate parte del premio", place: "Puesto", points: "pts" },
      app: { on: false, title: "Juega en la app", text: "Bonos y pagos siempre a mano — instálala en un minuto" },
      express: { on: false, title: "Combinada del día", total: "Cuota total", items: [] },
      final: { on: false, title: "Tu bono te espera", text: "Regístrate en un minuto — +200% y 500 giros directo a tu cuenta", button: "Reclamar bono" },
    },
    sport: {
      jackpotTitle: "Bote de pronósticos",
      promo: { on: false, title: "Código de apuesta gratis", code: "FREEBET100", text: "Introdúcelo al registrarte — 100 € gratis en tu primera apuesta", copy: "Copiar", copied: "¡Copiado!" },
      features: { on: false, title: "Por qué apuestan con nosotros", items: [
        { title: "Las mejores cuotas", text: "Márgenes más bajos que la competencia" },
        { title: "Apuestas en vivo", text: "Miles de eventos en directo" },
        { title: "Retiros rápidos", text: "Pagos desde 15 minutos" },
        { title: "Cash out", text: "Cobra antes del pitido final" },
      ] },
      vip: { on: false, title: "Club del apostador", items: [
        { name: "Bronze", perk: "Apuesta gratis de cumpleaños" },
        { name: "Silver", perk: "Cashback 5% en apuestas" },
        { name: "Gold", perk: "Cuotas mejoradas" },
        { name: "Platinum", perk: "Gestor personal y límites VIP" },
      ] },
      tournament: { on: false, title: "Torneo de pronósticos", prize: "5 000 €", text: "Acierta resultados, suma puntos y gana premios", place: "Puesto", points: "pts" },
      app: { on: false, title: "Apuesta en la app", text: "En vivo, cash out y avisos de goles — instálala en un minuto" },
      express: { on: false, title: "Combinada del día", total: "Cuota total", items: [
        { match: "Real Madrid — Barcelona", pick: "Ambos marcan", odd: "1.72" },
        { match: "Man City — Arsenal", pick: "1", odd: "1.85" },
        { match: "Bayern — Dortmund", pick: "Más de 2.5", odd: "1.55" },
      ] },
      final: { on: false, title: "Haz tu primera apuesta", text: "Regístrate en un minuto — 100 € gratis directo a tu cuenta", button: "Obtener apuesta gratis" },
    },
  },
};

const CURRENCY: Record<LandingLang, string> = { ru: "₽", uk: "₴", en: "€", es: "€" };

export function defaultMoreBlocks(lang: LandingLang, kind: LandingKind): MoreBlocks {
  const t = T[lang][kind];
  const { jackpotTitle, ...rest } = t;
  return {
    jackpot: { on: false, title: jackpotTitle, amount: kind === "sport" ? 2_450_000 : 12_874_390, currency: CURRENCY[lang] },
    ...structuredClone(rest),
  };
}

/** Черновик без новых блоков или с частью полей — дополняем умолчаниями. */
export function normalizeMoreBlocks(raw: Partial<Record<MoreBlockId, unknown>>, lang: LandingLang, kind: LandingKind): MoreBlocks {
  const d = defaultMoreBlocks(lang, kind);
  const out = { ...d } as Record<MoreBlockId, unknown>;
  for (const id of MORE_BLOCK_IDS) {
    const r = raw[id];
    if (r && typeof r === "object") out[id] = { ...(d[id] as object), ...(r as object) };
  }
  return out as MoreBlocks;
}

/** Новый язык: тексты — новые, включённость, промокод, сумма и матчи экспресса — прежние. */
export function relocalizeMoreBlocks(x: MoreBlocks, lang: LandingLang, kind: LandingKind): MoreBlocks {
  const d = defaultMoreBlocks(lang, kind);
  const out = { ...d } as Record<MoreBlockId, { on: boolean }>;
  for (const id of MORE_BLOCK_IDS) out[id] = { ...(d[id] as { on: boolean }), on: x[id].on };
  const r = out as unknown as MoreBlocks;
  r.promo.code = x.promo.code;
  r.jackpot.amount = x.jackpot.amount;
  if (x.express.items.length) r.express.items = x.express.items;
  return r;
}

// ---------------------------------------------------------------- разметка

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const FEATURE_ICONS = ["⚡", "💬", "📱", "🛡️", "🎁", "💎"];
const VIP_TONES = ["#cd7f32,#7a4419", "#e5e7eb,#8b95a5", "#ffd34d,#b7791f", "#b9f2ff,#6b7bd6"];
const MEDALS = ["🥇", "🥈", "🥉"];

/** Куски страницы по местам: после бонусов, после доверия, перед отзывами, после отзывов, в конце. */
export function moreBlocksHtml(m: MoreBlocks, kind: LandingKind, names: string[]) {
  const sec = (title: string, body: string, cls = "") => `<section${cls ? ` class="${cls}"` : ""}>${title ? `<h2>${esc(title)}</h2>` : ""}${body}</section>`;
  const parts = { afterBonuses: "", afterTrust: "", beforeReviews: "", afterReviews: "", end: "" };

  if (m.jackpot.on) {
    const amt = Math.max(0, Math.round(m.jackpot.amount) || 0);
    parts.afterBonuses += `<div class="xjp"><span class="shine"></span><div class="xjpT">💰 ${esc(m.jackpot.title)}</div><b data-exjackpot="${amt}">${amt.toLocaleString("ru-RU")}</b><span class="xjpC">${esc(m.jackpot.currency)}</span></div>`;
  }
  if (m.express.on && kind === "sport" && m.express.items.some((r) => r.match.trim())) {
    const rows = m.express.items.filter((r) => r.match.trim()).slice(0, 6);
    const total = rows.reduce((p, r) => p * (parseFloat(r.odd.replace(",", ".")) || 1), 1);
    const list = rows.map((r) => `<div class="xexR" data-excta role="link" tabindex="0"><div><b>${esc(r.match)}</b><span>${esc(r.pick)}</span></div><em>${esc(r.odd)}</em></div>`).join("");
    parts.afterBonuses += sec(m.express.title, `<div class="xex">${list}<div class="xexT"><span>${esc(m.express.total)}</span><b>${total.toFixed(2)}</b></div></div>`);
  }
  if (m.promo.on && m.promo.code.trim()) {
    parts.afterBonuses += `<div class="xpr"><div class="xprL"><div class="xprT">🎟️ ${esc(m.promo.title)}</div><div class="xprD">${esc(m.promo.text)}</div></div><button type="button" class="xprC" data-excopy="${esc(m.promo.code.trim())}" data-copied="${esc(m.promo.copied)}"><b>${esc(m.promo.code.trim())}</b><span>${esc(m.promo.copy)}</span></button></div>`;
  }
  if (m.features.on && m.features.items.some((f) => f.title.trim())) {
    const it = m.features.items.filter((f) => f.title.trim()).slice(0, 6).map((f, i) => `<div class="xft"><i>${FEATURE_ICONS[i % FEATURE_ICONS.length]}</i><b>${esc(f.title)}</b><span>${esc(f.text)}</span></div>`).join("");
    parts.afterTrust += sec(m.features.title, `<div class="xfts">${it}</div>`);
  }
  if (m.tournament.on) {
    const rows = names.slice(0, 5).map((n, i) => {
      const pts = 48_600 - i * 6_350 - ((i * 977) % 1_300);
      return `<div class="xtrR"><i>${MEDALS[i] ?? i + 1}</i><b>${esc(n)}</b><span>${pts.toLocaleString("ru-RU")} ${esc(m.tournament.points)}</span></div>`;
    }).join("");
    parts.beforeReviews += sec(
      m.tournament.title,
      `<div class="xtr"><div class="xtrP"><span>🏆</span><b>${esc(m.tournament.prize)}</b><p>${esc(m.tournament.text)}</p></div>${rows}</div>`,
    );
  }
  if (m.vip.on && m.vip.items.some((v) => v.name.trim())) {
    const it = m.vip.items.filter((v) => v.name.trim()).slice(0, 5).map((v, i) => `<div class="xvp" style="--t:linear-gradient(150deg,${VIP_TONES[i % VIP_TONES.length]})"><i>${["★", "★★", "★★★", "♛", "♛"][i] ?? "★"}</i><b>${esc(v.name)}</b><span>${esc(v.perk)}</span></div>`).join("");
    parts.beforeReviews += sec(m.vip.title, `<div class="xvps">${it}</div>`);
  }
  if (m.app.on) {
    parts.afterReviews += `<div class="xap"><div class="xapPh" aria-hidden="true"><span></span></div><div class="xapB"><b>${esc(m.app.title)}</b><p>${esc(m.app.text)}</p><div class="xapS"><img src="${APP_STORE_BADGE}" alt="App Store" data-excta role="link" tabindex="0"/><img src="${GOOGLE_PLAY_BADGE}" alt="Google Play" data-excta role="link" tabindex="0"/></div></div></div>`;
  }
  if (m.final.on) {
    parts.end += `<div class="xfn"><span class="shine"></span><b>${esc(m.final.title)}</b><p>${esc(m.final.text)}</p><button type="button" class="cta" data-excta><span class="shine"></span><span>${esc(m.final.button)}</span></button></div>`;
  }
  return parts;
}

type Tone = { text: string; muted: string; card: string; line: string; gold: string; hi: string; bg: string };

export function moreBlocksCss(accent: string, c: Tone): string {
  const clip = "-webkit-background-clip:text;background-clip:text;color:transparent";
  const box = `border-radius:22px;background:linear-gradient(165deg,${accent}2a,${c.card} 60%),${c.bg};border:1px solid ${c.line};box-shadow:0 14px 30px rgba(0,0,0,.25)`;
  return `
  .ex .xjp{position:relative;overflow:hidden;text-align:center;padding:22px 16px;${box};border-color:${c.gold}66}
  .ex .xjpT{font-weight:900;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:${c.muted}}
  .ex .xjp b{display:block;margin-top:8px;font-size:clamp(34px,10vw,64px);font-weight:900;font-variant-numeric:tabular-nums;letter-spacing:-.02em;line-height:1;background:linear-gradient(180deg,#fff7cf,${c.gold} 55%,#b7791f);${clip};filter:drop-shadow(0 4px 14px ${accent}55)}
  .ex .xjpC{display:block;margin-top:4px;font-size:18px;font-weight:900;color:${c.gold}}

  .ex .xex{${box};padding:8px}
  .ex .xexR{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px;border-radius:14px;cursor:pointer}
  .ex .xexR+.xexR{border-top:1px solid ${c.line}}
  .ex .xexR b{display:block;font-size:15px;font-weight:800}
  .ex .xexR span{display:block;margin-top:2px;font-size:12.5px;color:${c.muted}}
  .ex .xexR em{font-style:normal;font-weight:900;font-size:17px;padding:8px 12px;border-radius:12px;background:${accent}33;border:1px solid ${accent}88;font-variant-numeric:tabular-nums}
  .ex .xexT{display:flex;align-items:center;justify-content:space-between;margin-top:6px;padding:14px 12px;border-radius:14px;background:linear-gradient(90deg,${accent}55,${accent}22);font-weight:800}
  .ex .xexT b{font-size:24px;font-weight:900;color:${c.hi}}

  .ex .xpr{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:14px;padding:18px;${box};border-style:dashed;border-color:${c.gold}88}
  .ex .xprL{flex:1 1 220px;min-width:0}
  .ex .xprT{font-weight:900;font-size:18px}
  .ex .xprD{margin-top:4px;font-size:13.5px;color:${c.muted}}
  .ex .xprC{display:flex;flex-direction:column;align-items:center;gap:2px;padding:10px 18px;border-radius:14px;border:2px dashed ${c.gold};background:${c.gold}1f;color:${c.hi};cursor:pointer;font:inherit}
  .ex .xprC b{font-size:20px;font-weight:900;letter-spacing:.08em}
  .ex .xprC span{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:${c.gold}}

  .ex .xfts{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
  @media(min-width:760px){.ex .xfts{grid-template-columns:repeat(4,1fr)}}
  .ex .xft{display:flex;flex-direction:column;gap:6px;padding:16px;${box}}
  .ex .xft i{font-style:normal;width:46px;height:46px;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:24px;background:linear-gradient(150deg,${accent},${accent}66);box-shadow:0 8px 18px ${accent}55}
  .ex .xft b{margin-top:4px;font-size:16px;font-weight:900}
  .ex .xft span{font-size:13px;line-height:1.35;color:${c.muted}}

  .ex .xtr{${box};padding:10px}
  .ex .xtrP{text-align:center;padding:10px 8px 14px}
  .ex .xtrP span{font-size:34px}
  .ex .xtrP b{display:block;font-size:clamp(28px,8vw,42px);font-weight:900;background:linear-gradient(180deg,#fff7cf,${c.gold});${clip}}
  .ex .xtrP p{margin-top:4px;font-size:13.5px;color:${c.muted}}
  .ex .xtrR{display:grid;grid-template-columns:40px 1fr auto;align-items:center;gap:10px;padding:10px 12px;border-radius:12px}
  .ex .xtrR:nth-child(odd){background:${c.card}}
  .ex .xtrR i{font-style:normal;font-size:20px;font-weight:900;text-align:center}
  .ex .xtrR b{font-weight:800}
  .ex .xtrR span{font-weight:800;color:${c.gold};font-variant-numeric:tabular-nums}

  .ex .xvps{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
  @media(min-width:760px){.ex .xvps{grid-template-columns:repeat(4,1fr)}}
  .ex .xvp{position:relative;display:flex;flex-direction:column;gap:6px;padding:16px;${box}}
  .ex .xvp::before{content:"";position:absolute;left:0;right:0;top:0;height:4px;border-radius:22px 22px 0 0;background:var(--t)}
  .ex .xvp i{font-style:normal;font-size:16px;letter-spacing:2px;background:var(--t);${clip}}
  .ex .xvp b{font-size:19px;font-weight:900;background:var(--t);${clip}}
  .ex .xvp span{font-size:13px;line-height:1.35;color:${c.muted}}

  .ex .xap{display:flex;align-items:center;gap:18px;padding:18px;${box}}
  .ex .xapPh{flex:none;width:74px;height:132px;border-radius:16px;border:3px solid ${c.line};background:linear-gradient(170deg,${accent},${accent}44);position:relative;box-shadow:0 12px 26px ${accent}44}
  .ex .xapPh span{position:absolute;left:50%;top:6px;width:24px;height:4px;border-radius:4px;background:rgba(0,0,0,.35);transform:translateX(-50%)}
  .ex .xapB{min-width:0}
  .ex .xapB b{font-size:19px;font-weight:900}
  .ex .xapB p{margin-top:4px;font-size:13.5px;color:${c.muted}}
  .ex .xapS{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
  .ex .xapS img{height:38px;width:auto;cursor:pointer}

  .ex .xfn{position:relative;overflow:hidden;display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center;padding:30px 18px;border-radius:26px;background:radial-gradient(120% 90% at 50% 0%,${accent}66,transparent 70%),${c.card};border:1px solid ${accent}88;box-shadow:0 0 0 4px ${accent}1f,0 22px 44px rgba(0,0,0,.35)}
  .ex .xfn b{font-size:clamp(26px,7vw,40px);font-weight:900;line-height:1.05;background:linear-gradient(180deg,${c.hi} 35%,${c.gold});${clip}}
  .ex .xfn p{max-width:520px;font-size:14.5px;color:${c.muted}}
  .ex .xfn .cta{margin-top:8px}
  `;
}

/** Джекпот растёт, промокод копируется. Подключается в общий скрипт kit. */
export const MORE_BLOCKS_SCRIPT = `
  (function(){
    var jp=document.querySelector('[data-exjackpot]');
    if(jp){ var v=+jp.getAttribute('data-exjackpot')||0;
      (function up(){ v+=Math.floor(7+Math.random()*90); jp.textContent=v.toLocaleString('ru-RU'); setTimeout(up,140+Math.random()*260); })(); }
    [].slice.call(document.querySelectorAll('[data-excopy]')).forEach(function(b){
      b.addEventListener('click',function(e){ e.stopPropagation(); var code=b.getAttribute('data-excopy'), lab=b.querySelector('span'), was=lab?lab.textContent:'';
        function ok(){ if(lab){ lab.textContent=b.getAttribute('data-copied')||was; setTimeout(function(){ lab.textContent=was; },1800); } }
        try{ navigator.clipboard.writeText(code).then(ok,ok); }catch(err){ ok(); } });
    });
  })();
`;
