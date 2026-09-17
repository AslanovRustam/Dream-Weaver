"use client";

import { useEffect, useRef, useState } from "react";

import {
  decideWin,
  favouritePick,
  formatOdds,
  resolveOutcome,
  scoreForOutcome,
  scoreTimeline,
  SPORT_BY_ID,
  type MatchPick,
  type MatchSport,
  type OddsFormat,
  type OutcomeMode,
} from "@/lib/matchLogic";

// Interactive "pick the winner" match card for the builder preview: two crests,
// odds buttons, a short live simulation (clock + score) and a result. Mirrors
// the vanilla-JS game inside matchExport.ts — keep both in sync.
export function MatchGame({
  accent = "#38bdf8",
  sport,
  teamHome,
  teamAway,
  crestHome,
  crestAway,
  odds,
  oddsFormat,
  outcomeMode,
  winChance,
  matchSeconds,
  finalScore,
  maxAttempts,
  resetSignal = 0,
  onResult,
  onAttemptsChange,
}: {
  accent?: string;
  sport: MatchSport;
  teamHome: string;
  teamAway: string;
  crestHome?: string;
  crestAway?: string;
  odds: { home: number; draw: number; away: number };
  oddsFormat: OddsFormat;
  outcomeMode: OutcomeMode;
  winChance: number;
  matchSeconds: number;
  finalScore: string;
  maxAttempts?: number;
  /** Bump to return the card to idle (after the parent closes its modal). */
  resetSignal?: number;
  onResult?: (win: boolean, pick: MatchPick, score: string) => void;
  onAttemptsChange?: (used: number, left: number | null) => void;
}) {
  const sp = SPORT_BY_ID.get(sport) ?? SPORT_BY_ID.get("football")!;
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");
  const [pick, setPick] = useState<MatchPick | null>(null);
  const [score, setScore] = useState<[number, number] | null>(null);
  const [minute, setMinute] = useState(0);
  const [flash, setFlash] = useState(0);
  const [attemptsUsed, setAttemptsUsed] = useState(0);
  const timer = useRef(0);
  const exhausted = !!maxAttempts && attemptsUsed >= maxAttempts;

  useEffect(() => {
    onAttemptsChange?.(attemptsUsed, maxAttempts ? Math.max(0, maxAttempts - attemptsUsed) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptsUsed, maxAttempts]);

  const lastReset = useRef(resetSignal);
  useEffect(() => {
    if (resetSignal !== lastReset.current) {
      lastReset.current = resetSignal;
      window.clearInterval(timer.current);
      setPhase("idle");
      setPick(null);
      setScore(null);
      setMinute(0);
    }
  }, [resetSignal]);

  useEffect(() => () => window.clearInterval(timer.current), []);

  const start = (p: MatchPick) => {
    if (phase === "running" || exhausted) return;
    setAttemptsUsed((n) => n + 1);
    setPick(p);
    setPhase("running");
    const fav = favouritePick(odds, sp.hasDraw);
    const win = decideWin(p, outcomeMode, winChance, fav);
    const out = resolveOutcome(p, win, sp.hasDraw);
    const fs = scoreForOutcome(finalScore, out);
    const ev = scoreTimeline(fs[0], fs[1]);
    let h = 0;
    let a = 0;
    let idx = 0;
    const t0 = Date.now();
    const secs = Math.max(2, matchSeconds || 8);
    setScore([0, 0]);
    setMinute(0);
    window.clearInterval(timer.current);
    timer.current = window.setInterval(() => {
      const prog = Math.min(1, (Date.now() - t0) / (secs * 1000));
      setMinute(Math.floor(prog * 90));
      while (idx < ev.length && ev[idx].at <= prog) {
        if (ev[idx].side === "home") h++;
        else a++;
        idx++;
        setScore([h, a]);
        setFlash((f) => f + 1);
      }
      if (prog >= 1) {
        window.clearInterval(timer.current);
        setScore(fs);
        setMinute(90);
        setPhase("done");
        onResult?.(win, p, `${fs[0]} : ${fs[1]}`);
      }
    }, 60);
  };

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
      onClick={() => start(k)}
      disabled={phase === "running" || exhausted}
      className="flex flex-col items-center gap-0.5 rounded-xl border-2 px-1.5 py-2 text-white transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
      style={
        pick === k
          ? { borderColor: accent, background: `${accent}33`, boxShadow: `0 0 14px ${accent}66` }
          : { borderColor: "rgba(255,255,255,.25)", background: "rgba(255,255,255,.06)" }
      }
    >
      <span className="text-[10px] font-bold uppercase tracking-wider text-white/70">{label}</span>
      <b className="text-base font-black tabular-nums sm:text-lg">{formatOdds(odds[k], oddsFormat)}</b>
    </button>
  );

  const running = phase === "running";
  const clockText = phase === "idle" ? sp.clock : phase === "done" ? "FT" : `${minute}′`;

  return (
    <div
      className="w-full max-w-[420px] rounded-2xl border-2 p-3.5 pb-3 backdrop-blur-sm"
      style={{
        borderColor: `${accent}66`,
        background: "linear-gradient(180deg, rgba(6,12,28,.92), rgba(6,12,28,.78))",
        boxShadow: `0 0 26px ${accent}44, 0 14px 30px rgba(0,0,0,.5)`,
      }}
    >
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="flex min-w-0 flex-col items-center gap-1.5">
          {crest(crestHome, teamHome)}
          <span className="max-w-full truncate text-center text-xs font-extrabold leading-tight text-white">
            {teamHome || "Хозяева"}
          </span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <style>{`@keyframes matchpop{0%{transform:scale(1)}40%{transform:scale(1.35);color:${accent}}100%{transform:scale(1)}}`}</style>
          <div
            key={flash}
            className="text-2xl font-black leading-none tabular-nums text-white sm:text-3xl"
            style={flash ? { animation: "matchpop .5s ease" } : undefined}
          >
            {score ? `${score[0]} : ${score[1]}` : sp.emoji}
          </div>
          <span className="text-[11px] font-bold tabular-nums text-white/75">{clockText}</span>
          <b className="text-xl font-black" style={{ color: running ? "#ef4444" : accent, textShadow: `0 0 12px ${accent}88` }}>
            {running ? "LIVE" : "VS"}
          </b>
        </div>
        <div className="flex min-w-0 flex-col items-center gap-1.5">
          {crest(crestAway, teamAway)}
          <span className="max-w-full truncate text-center text-xs font-extrabold leading-tight text-white">
            {teamAway || "Гости"}
          </span>
        </div>
      </div>
      <div className={`mt-3 grid gap-2 ${sp.hasDraw ? "grid-cols-3" : "grid-cols-2"}`}>
        {oddBtn("home", "П1")}
        {sp.hasDraw ? oddBtn("draw", "Ничья") : null}
        {oddBtn("away", "П2")}
      </div>
      <p className="mt-2.5 min-h-4 text-center text-xs text-white/75">
        {pick
          ? `Ваш прогноз: ${pick === "home" ? `П1 · ${teamHome || "Хозяева"}` : pick === "away" ? `П2 · ${teamAway || "Гости"}` : "Ничья"}`
          : "Выберите исход — матч начнётся сразу"}
      </p>
    </div>
  );
}
