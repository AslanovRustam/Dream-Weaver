// Простой режим «Матч-прогноза»: вид спорта и приз из текста ТЗ — детерминированно,
// на любом из частых языков ТЗ (модель тоже спрашиваем, но не полагаемся).
import type { MatchSport, PrizeType } from "@/lib/matchLogic";

const SPORT_RE: [MatchSport, RegExp][] = [
  ["esports", /кибер|e-?sport|cs2|cs:?go|dota|valorant|league of legends/i],
  ["mma", /\bmma\b|ufc|бокс|boxing|boxeo|единоборств|\bfight\b|поедин/i],
  ["tennis", /теннис|tennis|tenis|\batp\b|\bwta\b|wimbledon|уимблдон|ролан гаррос|roland garros/i],
  ["basketball", /баскет|basket|\bnba\b|нба|euroleague|евролиг/i],
  ["hockey", /хоккей|hockey|\bnhl\b|нхл|кхл|\bkhl\b/i],
  ["football", /футбол|football|soccer|fútbol|futbol|fußball|calcio|лиг[аиуе] чемпионов|champions league|premier league|\bапл\b|la liga|serie a|бундеслиг|bundesliga/i],
];

/** Вид спорта по тексту (ответ модели + суть ТЗ); не нашли — как было. */
export function matchSport(text: string, fallback: MatchSport): MatchSport {
  for (const [id, re] of SPORT_RE) if (re.test(text)) return id;
  return fallback;
}

const CURRENCY: [string, string][] = [
  ["₽|руб\\.?|rub", "₽"],
  ["€|eur|евро", "€"],
  ["\\$|usd|долл", "$"],
  ["£|gbp", "£"],
  ["₴|грн|uah", "₴"],
  ["₸|тенге|kzt", "₸"],
  ["so['‘’]?m|сум|uzs", "сум"],
  ["₺|try\\b", "₺"],
  ["zł|pln", "zł"],
  ["₼|azn|манат", "₼"],
  ["byn|br\\b", "Br"],
];

/** Приз из оффера: тип (фрибет / депозит / кэшбек), сумма и валюта. */
export function matchPrize(offer: string): { type: PrizeType; amount: string; currency: string } | null {
  const o = offer.trim();
  if (!o) return null;
  const type: PrizeType = /кэшб|кешб|cash ?back/i.test(o)
    ? "cashback"
    : /фрибет|free ?bet|безрисков|risk-?free|apuesta gratis/i.test(o)
      ? "freebet"
      : /депозит|deposit|depósito|бонус|bonus|%/i.test(o)
        ? "deposit"
        : "freebet";
  for (const [src, sign] of CURRENCY) {
    const m = o.match(new RegExp(`(\\d[\\d\\s.,]*)\\s*(?:${src})`, "i")) || o.match(new RegExp(`(?:${src})\\s*(\\d[\\d\\s.,]*)`, "i"));
    if (m) return { type, amount: m[1].trim().replace(/[.,]$/, ""), currency: sign };
  }
  const pct = o.match(/\d+\s*%/);
  if (pct) return { type, amount: pct[0].replace(/\s/g, ""), currency: "" };
  return { type, amount: o.slice(0, 40), currency: "" };
}
