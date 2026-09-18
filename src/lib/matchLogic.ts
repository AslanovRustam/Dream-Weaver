// Shared vocabulary + pure helpers for the «Матч-прогноз» betting landing.
// The landing is presentational: it advertises ONE match (teams, crests, odds,
// kick-off countdown, bonus offer); every button leads to the sportsbook
// (ctaUrl). Used by the React preview (MatchCard.tsx) and the export.

export type MatchSport = "football" | "basketball" | "hockey" | "tennis" | "mma" | "esports";
export type MatchPick = "home" | "draw" | "away";
export type OddsFormat = "decimal" | "american" | "fractional";
export type PrizeType = "freebet" | "deposit" | "cashback";
export type CountdownMode = "off" | "minutes" | "date";

export const SPORTS: { id: MatchSport; label: string; hasDraw: boolean; emoji: string; eventLabel: string }[] = [
  { id: "football", label: "Футбол", hasDraw: true, emoji: "⚽", eventLabel: "Матч" },
  { id: "basketball", label: "Баскетбол", hasDraw: false, emoji: "🏀", eventLabel: "Игра" },
  { id: "hockey", label: "Хоккей", hasDraw: true, emoji: "🏒", eventLabel: "Матч" },
  { id: "tennis", label: "Теннис", hasDraw: false, emoji: "🎾", eventLabel: "Матч" },
  { id: "mma", label: "ММА / бокс", hasDraw: false, emoji: "🥊", eventLabel: "Бой" },
  { id: "esports", label: "Киберспорт", hasDraw: false, emoji: "🎮", eventLabel: "Матч" },
];

export const SPORT_BY_ID = new Map(SPORTS.map((s) => [s.id, s]));

export const PRIZE_LABEL: Record<PrizeType, string> = {
  freebet: "Фрибет",
  deposit: "Бонус на депозит",
  cashback: "Кэшбек",
};

/** Decimal odds → display string in the chosen format. */
export function formatOdds(decimal: number, fmt: OddsFormat): string {
  const d = Number.isFinite(decimal) && decimal > 1 ? decimal : 1.01;
  if (fmt === "american") {
    return d >= 2 ? `+${Math.round((d - 1) * 100)}` : `-${Math.round(100 / (d - 1))}`;
  }
  if (fmt === "fractional") {
    const x = d - 1;
    let best = [1, 1];
    let bestErr = Infinity;
    for (let den = 1; den <= 20; den++) {
      const num = Math.round(x * den);
      if (num < 1) continue;
      const err = Math.abs(num / den - x);
      if (err < bestErr - 1e-9) {
        bestErr = err;
        best = [num, den];
      }
    }
    return `${best[0]}/${best[1]}`;
  }
  return d.toFixed(2);
}

/** Lowest decimal odds = the favourite (highlighted on the card). Ties → home. */
export function favouritePick(odds: { home: number; draw: number; away: number }, hasDraw: boolean): MatchPick {
  const cands: [MatchPick, number][] = [["home", odds.home], ["away", odds.away]];
  if (hasDraw) cands.push(["draw", odds.draw]);
  cands.sort((a, b) => a[1] - b[1]);
  return cands[0][0];
}

export function clampInt(v: unknown, min: number, max: number, dflt: number): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, n));
}
