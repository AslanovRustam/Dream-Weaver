"use client";

import { favouritePick, formatOdds, SPORT_BY_ID, type MatchPick, type MatchSport, type OddsFormat } from "@/lib/matchLogic";

// Presentational match card for the builder preview: crests, names, odds.
// Every odds button calls onPick — on the real landing that is the click-
// through to the sportsbook. Mirrors the markup inside matchExport.ts.
export function MatchCard({
  accent = "#38bdf8",
  sport,
  eventName,
  teamHome,
  teamAway,
  crestHome,
  crestAway,
  odds,
  oddsFormat,
  highlightFavourite,
  onPick,
}: {
  accent?: string;
  sport: MatchSport;
  eventName?: string;
  teamHome: string;
  teamAway: string;
  crestHome?: string;
  crestAway?: string;
  odds: { home: number; draw: number; away: number };
  oddsFormat: OddsFormat;
  highlightFavourite: boolean;
  onPick?: (pick: MatchPick) => void;
}) {
  const sp = SPORT_BY_ID.get(sport) ?? SPORT_BY_ID.get("football")!;
  const fav = highlightFavourite ? favouritePick(odds, sp.hasDraw) : null;

  const crest = (src: string | undefined, name: string) =>
    src ? (
      <img src={src} alt="" className="h-14 w-14 object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,.5)] sm:h-16 sm:w-16" />
    ) : (
      <div
        className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-white/35 text-lg font-black text-white sm:h-16 sm:w-16"
        style={{ background: `linear-gradient(180deg, ${accent}, ${accent}88)` }}
      >
        {(name || "?").trim().slice(0, 2).toUpperCase()}
      </div>
    );

  const oddBtn = (k: MatchPick, label: string) => (
    <button
      key={k}
      type="button"
      onClick={() => onPick?.(k)}
      className="flex flex-col items-center gap-0.5 rounded-xl border-2 px-1.5 py-2 text-white transition hover:shadow-[0_0_14px_var(--match-accent)] active:scale-95"
      style={
        fav === k
          ? { borderColor: accent, background: `${accent}33`, boxShadow: `0 0 14px ${accent}66` }
          : { borderColor: "rgba(255,255,255,.25)", background: "rgba(255,255,255,.06)" }
      }
    >
      <span className="text-[10px] font-bold uppercase tracking-wider text-white/70">{label}</span>
      <b className="text-base font-black tabular-nums sm:text-lg">{formatOdds(odds[k], oddsFormat)}</b>
    </button>
  );

  return (
    <div
      className="w-full max-w-[420px] rounded-2xl border-2 p-3 pb-3 backdrop-blur-sm"
      style={{
        ["--match-accent" as string]: `${accent}66`,
        borderColor: `${accent}66`,
        background: "linear-gradient(180deg, rgba(6,12,28,.92), rgba(6,12,28,.78))",
        boxShadow: `0 0 26px ${accent}44, 0 14px 30px rgba(0,0,0,.5)`,
      }}
    >
      {eventName ? (
        <p className="mb-2.5 text-center text-[11px] font-bold uppercase tracking-[.12em] text-white/70">{eventName}</p>
      ) : null}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="flex min-w-0 flex-col items-center gap-1.5">
          {crest(crestHome, teamHome)}
          <span className="max-w-full truncate text-center text-xs font-extrabold leading-tight text-white">{teamHome || "Хозяева"}</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-2xl leading-none sm:text-3xl">{sp.emoji}</span>
          <b className="text-xl font-black" style={{ color: accent, textShadow: `0 0 12px ${accent}88` }}>
            VS
          </b>
        </div>
        <div className="flex min-w-0 flex-col items-center gap-1.5">
          {crest(crestAway, teamAway)}
          <span className="max-w-full truncate text-center text-xs font-extrabold leading-tight text-white">{teamAway || "Гости"}</span>
        </div>
      </div>
      <div className={`mt-3 grid gap-2 ${sp.hasDraw ? "grid-cols-3" : "grid-cols-2"}`}>
        {oddBtn("home", "П1")}
        {sp.hasDraw ? oddBtn("draw", "Ничья") : null}
        {oddBtn("away", "П2")}
      </div>
      <p className="mt-2.5 text-center text-xs text-white/75">Выберите исход — и переходите к ставке</p>
    </div>
  );
}
