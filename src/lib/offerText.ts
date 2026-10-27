// Оффер из ТЗ — по-человечески: «222fs+50.000rub» → «222 фриспина + 50 000 ₽».
//
// В ТЗ пишут сокращениями: fs/фс — фриспины, rub/руб — рубли, 50.000 — пятьдесят
// тысяч. В креатив это должно попасть как читает игрок: знак валюты, слово
// «фриспины» с правильным окончанием на языке креативов, тысячи через пробел.
// Делается детерминированно (модели тоже просим, но не полагаемся).

/** Коды и сокращения валют → знак. */
const CURRENCY: [RegExp, string][] = [
  [/(?:rub|rur|руб(?:лей|ля|ль)?\.?|р\.)/i, "₽"],
  [/(?:uah|грн\.?|гривен|гривень)/i, "₴"],
  [/(?:eur|euro|евро)/i, "€"],
  [/(?:usd|dollars?|долл(?:аров|ара)?\.?)/i, "$"],
  [/(?:kzt|тенге|тг)/i, "₸"],
  [/(?:try|tl|лир)/i, "₺"],
  [/(?:pln|zl|zł)/i, "zł"],
  [/(?:byn|бел\.?\s?руб\.?)/i, "Br"],
  [/(?:azn|манат)/i, "₼"],
  [/(?:uzs|сум)/i, "сум"],
];

/** «фриспин» с окончанием по числу — для языков, где это важно. */
function spins(n: number, lang: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  const one = m10 === 1 && m100 !== 11;
  const few = m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14);
  switch (lang) {
    case "ru":
      return one ? "фриспин" : few ? "фриспина" : "фриспинов";
    case "uk":
      return one ? "фриспін" : few ? "фриспіни" : "фриспінів";
    case "en":
      return n === 1 ? "free spin" : "free spins";
    case "es":
      return n === 1 ? "giro gratis" : "giros gratis";
    case "de":
      return "Freispiele";
    case "pt":
      return "rodadas grátis";
    case "it":
      return "giri gratis";
    case "fr":
      return "tours gratuits";
    case "pl":
      return "darmowych spinów";
    case "tr":
      return "bedava dönüş";
    default:
      return "FS";
  }
}

/** Тысячи через неразрывный пробел: 50.000 / 50,000 / 50000 → 50 000 (дроби вроде 1.85 не трогаем). */
function thousands(s: string): string {
  return s
    .replace(/(?<![\d.,])(\d{1,3})(?:[.,\s ](\d{3}))+(?![\d.,]\d)/g, (m) => m.replace(/[.,\s ]/g, ""))
    .replace(/(?<![\d.,])(\d{5,})(?![\d.,]\d)/g, (m) => m.replace(/\B(?=(\d{3})+(?!\d))/g, " "));
}

export function humanizeOffer(text: string, lang = "ru"): string {
  if (!text) return text;
  let s = text;
  // Число и валюта/фриспины слитно или через пробел: 222fs, 50.000rub, 100 FS.
  s = thousands(s);
  s = s.replace(/(\d[\d ]*)\s*(fs|фс|free\s?spins?|фриспин(?:ов|а)?)(?![a-zа-яё])/gi, (_m, n: string) => {
    const num = Number(n.replace(/ /g, ""));
    return `${n} ${spins(num, lang)}`;
  });
  for (const [re, sign] of CURRENCY) {
    s = s.replace(new RegExp(`(\\d[\\d\\u00a0]*)\\s*${re.source}(?![a-zа-яё])`, "gi"), `$1 ${sign}`);
  }
  // «+» слитно между частями оффера («фриспина+50 000») — с пробелами; «+200%», «до +50%» не трогаем.
  s = s.replace(/([^\s+])\+(?=[^\s%])/g, "$1 + ");
  return s.replace(/[ \t]{2,}/g, " ").trim();
}

/** Единица выигрыша в плейбле: fs → FS, rub → ₽ и т. п.; остальное как есть. */
export function humanizeUnit(unit: string): string {
  const u = unit.trim();
  if (/^(fs|фс|free\s?spins?|фриспин(?:ов|а)?)$/i.test(u)) return "FS";
  for (const [re, sign] of CURRENCY) if (new RegExp(`^${re.source}$`, "i").test(u)) return sign;
  return u;
}

/** Правило для подсказок моделям — пишут сразу как надо. */
export const OFFER_RULE =
  "Expand brief shorthand the way a player reads it: fs/фс = free spins (write the word in the creative's language, e.g. «фриспинов»), rub/руб = ₽, uah/грн = ₴, eur = €, usd = $, kzt = ₸; thousands with a space (50.000 → 50 000); spaces around + between offer parts.";
