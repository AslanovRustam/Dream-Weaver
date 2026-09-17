// Shared vocabulary + pure helpers for the "Матч-прогноз" (pick-the-winner)
// betting landing. Used by the React preview (MatchGame.tsx) and mirrored in
// plain JS inside the exported page (matchExport.ts) — keep both in sync.

export type MatchSport = "football" | "basketball" | "hockey" | "tennis" | "mma" | "esports";
export type MatchPick = "home" | "draw" | "away";
export type OddsFormat = "decimal" | "american" | "fractional";
export type OutcomeMode = "always" | "favorite" | "chance";
export type PrizeType = "freebet" | "deposit" | "cashback";
export type CountdownMode = "off" | "minutes" | "date";

export const SPORTS: { id: MatchSport; label: string; unit: string; clock: string; hasDraw: boolean; emoji: string }[] = [
  { id: "football", label: "Футбол", unit: "гол", clock: "90′", hasDraw: true, emoji: "⚽" },
  { id: "basketball", label: "Баскетбол", unit: "очко", clock: "4Q", hasDraw: false, emoji: "🏀" },
  { id: "hockey", label: "Хоккей", unit: "шайба", clock: "60′", hasDraw: true, emoji: "🏒" },
  { id: "tennis", label: "Теннис", unit: "сет", clock: "3 сета", hasDraw: false, emoji: "🎾" },
  { id: "mma", label: "ММА / бокс", unit: "раунд", clock: "5R", hasDraw: false, emoji: "🥊" },
  { id: "esports", label: "Киберспорт", unit: "карта", clock: "BO3", hasDraw: false, emoji: "🎮" },
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

/** Lowest decimal odds = the favourite. Ties → home. */
export function favouritePick(odds: { home: number; draw: number; away: number }, hasDraw: boolean): MatchPick {
  const cands: [MatchPick, number][] = [["home", odds.home], ["away", odds.away]];
  if (hasDraw) cands.push(["draw", odds.draw]);
  cands.sort((a, b) => a[1] - b[1]);
  return cands[0][0];
}

/** Decide whether the visitor's pick "wins" this round. */
export function decideWin(
  pick: MatchPick,
  mode: OutcomeMode,
  winChance: number,
  favourite: MatchPick,
  rnd: () => number = Math.random,
): boolean {
  if (mode === "always") return true;
  if (mode === "favorite") return pick === favourite;
  return rnd() * 100 < Math.min(100, Math.max(0, winChance));
}

/** Pick the actual match outcome given the pick and whether it should win. */
export function resolveOutcome(pick: MatchPick, win: boolean, hasDraw: boolean, rnd: () => number = Math.random): MatchPick {
  if (win) return pick;
  const others = (["home", "draw", "away"] as MatchPick[]).filter((o) => o !== pick && (hasDraw || o !== "draw"));
  return others[Math.floor(rnd() * others.length)] ?? "home";
}

/** Bend the configured final score ("2:1") so it matches the outcome. */
export function scoreForOutcome(base: string, outcome: MatchPick): [number, number] {
  const m = /^\s*(\d{1,2})\s*[:\-–]\s*(\d{1,2})\s*$/.exec(base || "");
  let h = m ? Number(m[1]) : 2;
  let a = m ? Number(m[2]) : 1;
  const hi = Math.max(h, a);
  const lo = Math.min(h, a);
  if (outcome === "home") {
    h = hi === lo ? hi + 1 : hi;
    a = lo;
  } else if (outcome === "away") {
    a = hi === lo ? hi + 1 : hi;
    h = lo;
  } else {
    h = a = lo;
  }
  return [h, a];
}

/** Spread the goals/points over the match as (time fraction, side) events. */
export function scoreTimeline(h: number, a: number, rnd: () => number = Math.random): { at: number; side: "home" | "away" }[] {
  const ev: { at: number; side: "home" | "away" }[] = [];
  for (let i = 0; i < h; i++) ev.push({ at: 0.1 + rnd() * 0.85, side: "home" });
  for (let i = 0; i < a; i++) ev.push({ at: 0.1 + rnd() * 0.85, side: "away" });
  return ev.sort((x, y) => x.at - y.at);
}

export function clampInt(v: unknown, min: number, max: number, dflt: number): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, n));
}
