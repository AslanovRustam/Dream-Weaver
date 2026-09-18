import { cssUrl, embedJson, safeCtaUrl } from "./exportUtils";
import {
  favouritePick,
  formatOdds,
  PRIZE_LABEL,
  SPORT_BY_ID,
  type CountdownMode,
  type MatchSport,
  type OddsFormat,
  type PrizeType,
} from "./matchLogic";
// Build a self-contained HTML page for a «Матч-прогноз» betting landing: a
// match card with two crests and odds, an optional kick-off countdown and an
// offer strip. The landing is presentational — the odds buttons and the CTA
// all lead to the sportsbook (ctaUrl); nothing is played on the page.

export type MatchExportConfig = {
  brand: string;
  brandLogo?: string;
  headline: string;
  accent: string;
  ctaText: string;
  /** Where every button leads: URL or tracker macro (e.g. {clickurl}). */
  ctaUrl?: string;
  bgImage: string;
  charLeft: string;
  charRight: string;
  // ── match ──
  sport: MatchSport;
  /** Competition / stage line above the card ("Финал кубка", "1/4 финала"). */
  eventName: string;
  teamHome: string;
  teamAway: string;
  crestHome?: string;
  crestAway?: string;
  /** Decimal odds. */
  odds: { home: number; draw: number; away: number };
  oddsFormat: OddsFormat;
  /** Highlight the favourite (lowest odds) on the card. */
  highlightFavourite: boolean;
  // ── offer strip ──
  showOffer: boolean;
  prizeType: PrizeType;
  prizeAmount: string;
  prizeCurrency: string;
  offerText: string;
  // ── countdown ──
  countdownMode: CountdownMode;
  countdownMinutes: number;
  countdownDate: string;
};

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildMatchHtml(cfg: MatchExportConfig): string {
  const accent = /^#[0-9a-fA-F]{6}$/.test(cfg.accent) ? cfg.accent : "#38bdf8";
  const sport = SPORT_BY_ID.get(cfg.sport) ?? SPORT_BY_ID.get("football")!;
  const fav = cfg.highlightFavourite ? favouritePick(cfg.odds, sport.hasDraw) : null;
  const bg = cfg.bgImage
    ? `background:#0b0d12 url('${cssUrl(cfg.bgImage)}') center/cover no-repeat;`
    : `background:radial-gradient(80% 70% at 50% 30%, ${accent}55, transparent), #071022;`;
  const charImg = (src: string, side: "left" | "right") =>
    src ? `<img class="char ${side}" src="${esc(src)}" alt=""/>` : "";
  const crest = (src: string | undefined, name: string) =>
    src
      ? `<img class="crest" src="${esc(src)}" alt=""/>`
      : `<div class="crest ph">${esc((name || "?").trim().slice(0, 2).toUpperCase())}</div>`;
  const odd = (k: "home" | "draw" | "away", label: string) =>
    `<button class="odd${fav === k ? " fav" : ""}" type="button" data-pick="${k}"><small>${label}</small><b>${esc(formatOdds(cfg.odds[k], cfg.oddsFormat))}</b></button>`;
  const prizeTitle = `${PRIZE_LABEL[cfg.prizeType] ?? "Бонус"} ${cfg.prizeAmount} ${cfg.prizeCurrency}`.trim();

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(cfg.brand || "Match")}</title>
<style>
  :root{--accent:${accent};}
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{height:100%}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;color:#fff;overflow:hidden}
  .stage{position:relative;width:100vw;height:100dvh;overflow:hidden;${bg}}
  .stage::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.25),transparent 40%,rgba(0,0,0,.5));pointer-events:none}
  .char{position:absolute;bottom:0;z-index:2;height:74%;max-width:42%;object-fit:contain;object-position:bottom;filter:drop-shadow(0 10px 22px rgba(0,0,0,.55));pointer-events:none}
  .char.left{left:-2%}.char.right{right:-2%}
  .col{position:relative;z-index:3;display:flex;flex-direction:column;align-items:center;height:100%;padding:22px 16px}
  .top{width:100%;display:flex;align-items:center;justify-content:space-between;font-weight:800}
  h1{margin-top:6px;text-align:center;font-size:clamp(24px,6.5vw,42px);font-weight:900;text-transform:uppercase;letter-spacing:-.01em;line-height:1;text-shadow:0 2px 0 var(--accent),0 4px 12px rgba(0,0,0,.5)}
  .cd{margin-top:8px;display:none;align-items:center;gap:8px;padding:6px 12px;border-radius:999px;background:rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.18);font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
  .cd.show{display:inline-flex}
  .cd .dot{width:8px;height:8px;border-radius:50%;background:${accent};box-shadow:0 0 10px ${accent}}
  .cd.live .dot{background:#ef4444;box-shadow:0 0 10px #ef4444;animation:blink 1s infinite}
  @keyframes blink{50%{opacity:.3}}
  .mid{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;gap:12px}
  .card{width:min(92vw,420px);border-radius:20px;border:2px solid ${accent}66;background:linear-gradient(180deg,rgba(6,12,28,.92),rgba(6,12,28,.78));box-shadow:0 0 26px ${accent}44,0 14px 30px rgba(0,0,0,.5);padding:12px 14px 12px;backdrop-filter:blur(6px)}
  .event{text-align:center;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.7);margin-bottom:10px}
  .teams{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:8px}
  .team{display:flex;flex-direction:column;align-items:center;gap:6px;min-width:0}
  .team .name{font-size:13px;font-weight:800;text-align:center;line-height:1.15;max-width:100%;overflow:hidden;text-overflow:ellipsis}
  .crest{width:64px;height:64px;object-fit:contain;filter:drop-shadow(0 4px 10px rgba(0,0,0,.5))}
  .crest.ph{display:flex;align-items:center;justify-content:center;border-radius:50%;background:linear-gradient(180deg,${accent},${accent}88);font-weight:900;font-size:20px;color:#fff;border:2px solid rgba(255,255,255,.35)}
  .vs{display:flex;flex-direction:column;align-items:center;gap:4px}
  .vs .ico{font-size:28px;line-height:1}
  .vs b{font-size:22px;font-weight:900;color:${accent};text-shadow:0 0 12px ${accent}88}
  .odds{display:grid;grid-template-columns:repeat(${sport.hasDraw ? 3 : 2},1fr);gap:8px;margin-top:12px}
  .odd{border:2px solid rgba(255,255,255,.25);border-radius:14px;padding:9px 6px;background:rgba(255,255,255,.06);color:#fff;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;transition:transform .1s,box-shadow .2s}
  .odd small{font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.7)}
  .odd b{font-size:18px;font-weight:900;font-variant-numeric:tabular-nums}
  .odd:hover{box-shadow:0 0 14px ${accent}66;border-color:${accent}}
  .odd:active{transform:scale(.96)}
  .odd.fav{border-color:${accent};background:${accent}33;box-shadow:0 0 14px ${accent}66}
  .hint{margin-top:10px;text-align:center;font-size:12px;color:rgba(255,255,255,.75)}
  .offer{display:${cfg.showOffer ? "flex" : "none"};align-items:center;gap:10px;width:min(92vw,420px);border-radius:14px;padding:10px 14px;background:linear-gradient(90deg,${accent}33,rgba(255,255,255,.06));border:1px solid ${accent}66}
  .offer .amt{font-size:20px;font-weight:900;white-space:nowrap;color:${accent};text-shadow:0 0 10px ${accent}66}
  .offer .txt{font-size:12px;line-height:1.25;color:rgba(255,255,255,.85)}
  .cta{position:relative;z-index:3;margin:6px 0 4px;width:82%;max-width:380px;border:0;border-radius:999px;padding:15px;font-size:18px;font-weight:900;text-transform:uppercase;letter-spacing:.03em;color:#fff;cursor:pointer;background:linear-gradient(180deg,${accent},${accent}cc);box-shadow:0 8px 20px rgba(0,0,0,.35)}
  .cta:active{transform:scale(.97)}
</style>
</head>
<body>
  <div class="stage">
    ${charImg(cfg.charLeft, "left")}
    ${charImg(cfg.charRight, "right")}
    <div class="col">
      <div class="top">${
        cfg.brandLogo
          ? `<img src="${esc(cfg.brandLogo)}" alt="" style="height:26px;width:auto;max-width:45%;object-fit:contain;filter:drop-shadow(0 1px 2px rgba(0,0,0,.4))"/>`
          : `<span>${esc(cfg.brand || "LOGO")}</span>`
      }</div>
      <h1>${esc(cfg.headline || "СТАВЬ НА МАТЧ ДНЯ")}</h1>
      <div class="cd" id="cd"><span class="dot"></span><span id="cdText"></span></div>
      <div class="mid">
        <div class="card">
          ${cfg.eventName ? `<div class="event">${esc(cfg.eventName)}</div>` : ""}
          <div class="teams">
            <div class="team">${crest(cfg.crestHome, cfg.teamHome)}<div class="name">${esc(cfg.teamHome || "Хозяева")}</div></div>
            <div class="vs"><div class="ico">${sport.emoji}</div><b>VS</b></div>
            <div class="team">${crest(cfg.crestAway, cfg.teamAway)}<div class="name">${esc(cfg.teamAway || "Гости")}</div></div>
          </div>
          <div class="odds">
            ${odd("home", "П1")}
            ${sport.hasDraw ? odd("draw", "Ничья") : ""}
            ${odd("away", "П2")}
          </div>
          <div class="hint">Выберите исход — и переходите к ставке</div>
        </div>
        <div class="offer"><span class="amt">${esc(prizeTitle)}</span><span class="txt">${esc(cfg.offerText || "за первую ставку на этот матч")}</span></div>
      </div>
      <button class="cta" id="cta" type="button">${esc(cfg.ctaText || "СДЕЛАТЬ СТАВКУ")}</button>
    </div>
  </div>
<script>
(function(){
  var URL_=${embedJson(safeCtaUrl(cfg.ctaUrl))};
  var CD_MODE=${embedJson(cfg.countdownMode)}, CD_MIN=${embedJson(cfg.countdownMinutes || 15)}, CD_DATE=${embedJson(cfg.countdownDate || "")};
  function go(pick){
    if(!URL_) return;
    var u=URL_;
    // Pass the chosen outcome along when the target is a real URL (not a
    // bare tracker macro) so the sportsbook / tracker can pre-select it.
    if(pick && /^https?:/i.test(u)){ u += (u.indexOf('?')>-1?'&':'?') + 'pick=' + pick; }
    (window.top||window).location.href=u;
  }
  [].slice.call(document.querySelectorAll('.odd')).forEach(function(b){ b.addEventListener('click', function(){ go(b.getAttribute('data-pick')); }); });
  document.getElementById('cta').addEventListener('click', function(){ go(''); });
  // Countdown (urgency): to a fixed date, or N minutes from page open;
  // flips to LIVE at zero.
  (function(){
    var cd=document.getElementById('cd'), txt=document.getElementById('cdText');
    if(CD_MODE==='off') return;
    var target = CD_MODE==='date' ? Date.parse(CD_DATE) : Date.now()+CD_MIN*60000;
    if(!isFinite(target)) return;
    cd.classList.add('show');
    function tick(){ var d=target-Date.now(); if(d<=0){ cd.classList.add('live'); txt.textContent='Матч идёт · LIVE'; return; }
      var s=Math.floor(d/1000), dd=Math.floor(s/86400), hh=Math.floor(s%86400/3600), mm=Math.floor(s%3600/60), ss=s%60;
      txt.textContent='До матча: '+(dd>0?dd+'д ':'')+(hh<10?'0':'')+hh+':'+(mm<10?'0':'')+mm+':'+(ss<10?'0':'')+ss; setTimeout(tick,1000); }
    tick();
  })();
})();
</script>
</body>
</html>`;
}
