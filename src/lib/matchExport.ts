import { cssUrl, embedJson, safeCtaUrl } from "./exportUtils";
import {
  formatOdds,
  PRIZE_LABEL,
  SPORT_BY_ID,
  type CountdownMode,
  type MatchSport,
  type OddsFormat,
  type OutcomeMode,
  type PrizeType,
} from "./matchLogic";
// Build a self-contained HTML page for a "Матч-прогноз" betting landing: a
// match card with two crests and odds buttons, a short live simulation with a
// running clock and score, a win / miss modal and an optional countdown — all
// inline, no external assets. The game logic mirrors src/lib/matchLogic.ts +
// MatchGame.tsx exactly; change both together.

export type MatchExportConfig = {
  brand: string;
  brandLogo?: string;
  headline: string;
  accent: string;
  ctaText: string;
  /** CTA click-through: URL or tracker macro (e.g. {clickurl}); empty = close. */
  ctaUrl?: string;
  maxAttempts?: number;
  bgImage: string;
  charLeft: string;
  charRight: string;
  // ── match ──
  sport: MatchSport;
  teamHome: string;
  teamAway: string;
  crestHome?: string;
  crestAway?: string;
  /** Decimal odds. */
  odds: { home: number; draw: number; away: number };
  oddsFormat: OddsFormat;
  outcomeMode: OutcomeMode;
  /** 0–100, only for outcomeMode="chance". */
  winChance: number;
  /** Live simulation length in seconds. */
  matchSeconds: number;
  /** Base final score "2:1" — bent to match the round's outcome. */
  finalScore: string;
  prizeType: PrizeType;
  prizeAmount: string;
  prizeCurrency: string;
  winText: string;
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
  const bg = cfg.bgImage
    ? `background:#0b0d12 url('${cssUrl(cfg.bgImage)}') center/cover no-repeat;`
    : `background:radial-gradient(80% 70% at 50% 30%, ${accent}55, transparent), #071022;`;
  const charImg = (src: string, side: "left" | "right") =>
    src ? `<img class="char ${side}" src="${esc(src)}" alt=""/>` : "";
  const crest = (src: string | undefined, name: string) =>
    src
      ? `<img class="crest" src="${esc(src)}" alt=""/>`
      : `<div class="crest ph">${esc((name || "?").trim().slice(0, 2).toUpperCase())}</div>`;
  const oddsLabel = (k: "home" | "draw" | "away") => esc(formatOdds(cfg.odds[k], cfg.oddsFormat));
  const prizeTitle = `${PRIZE_LABEL[cfg.prizeType] ?? "Бонус"} ${esc(cfg.prizeAmount)} ${esc(cfg.prizeCurrency)}`.trim();

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
  .card{width:min(92vw,420px);border-radius:20px;border:2px solid ${accent}66;background:linear-gradient(180deg,rgba(6,12,28,.92),rgba(6,12,28,.78));box-shadow:0 0 26px ${accent}44,0 14px 30px rgba(0,0,0,.5);padding:14px 14px 12px;backdrop-filter:blur(6px)}
  .teams{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:8px}
  .team{display:flex;flex-direction:column;align-items:center;gap:6px;min-width:0}
  .team .name{font-size:13px;font-weight:800;text-align:center;line-height:1.15;max-width:100%;overflow:hidden;text-overflow:ellipsis}
  .crest{width:64px;height:64px;object-fit:contain;filter:drop-shadow(0 4px 10px rgba(0,0,0,.5))}
  .crest.ph{display:flex;align-items:center;justify-content:center;border-radius:50%;background:linear-gradient(180deg,${accent},${accent}88);font-weight:900;font-size:20px;color:#fff;border:2px solid rgba(255,255,255,.35)}
  .vs{display:flex;flex-direction:column;align-items:center;gap:4px}
  .vs b{font-size:22px;font-weight:900;color:${accent};text-shadow:0 0 12px ${accent}88}
  .score{font-size:30px;font-weight:900;letter-spacing:.04em;font-variant-numeric:tabular-nums;line-height:1}
  .score.flash{animation:pop .5s ease}
  @keyframes pop{0%{transform:scale(1)}40%{transform:scale(1.35);color:${accent}}100%{transform:scale(1)}}
  .clock{font-size:12px;font-weight:700;color:rgba(255,255,255,.75);font-variant-numeric:tabular-nums}
  .odds{display:grid;grid-template-columns:repeat(${sport.hasDraw ? 3 : 2},1fr);gap:8px;margin-top:12px}
  .odd{border:2px solid rgba(255,255,255,.25);border-radius:14px;padding:9px 6px;background:rgba(255,255,255,.06);color:#fff;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;transition:transform .1s}
  .odd small{font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.7)}
  .odd b{font-size:18px;font-weight:900;font-variant-numeric:tabular-nums}
  .odd:active{transform:scale(.96)}
  .odd.sel{border-color:${accent};background:${accent}33;box-shadow:0 0 14px ${accent}66}
  .odd:disabled{cursor:not-allowed;opacity:.55}
  .hint{margin-top:10px;text-align:center;font-size:12px;color:rgba(255,255,255,.75);min-height:16px}
  .cta{position:relative;z-index:3;margin:6px 0 4px;width:82%;max-width:380px;border:0;border-radius:999px;padding:15px;font-size:18px;font-weight:900;text-transform:uppercase;letter-spacing:.03em;color:#fff;cursor:pointer;background:linear-gradient(180deg,${accent},${accent}cc);box-shadow:0 8px 20px rgba(0,0,0,.35)}
  .cta:active{transform:scale(.97)}
  .cta:disabled{cursor:not-allowed;opacity:.6}
  .attemptsInfo{position:relative;z-index:3;margin-top:-2px;font-size:12px;color:rgba(255,255,255,.7);text-shadow:0 1px 2px rgba(0,0,0,.5)}
  .modal{position:absolute;inset:0;z-index:9;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.6);padding:24px}
  .modal.show{display:flex}
  .mcard{width:100%;max-width:320px;background:#fff;color:#0f172a;border-radius:18px;padding:26px;text-align:center;box-shadow:0 20px 50px rgba(0,0,0,.4);position:relative}
  .mcard h2{font-size:19px;margin-bottom:6px}.mcard p{color:#475569;font-size:14px}
  .mcard .big{font-size:26px;font-weight:900;margin:4px 0;color:${accent}}
  .mcard .claim{margin-top:16px;width:100%;border:0;border-radius:10px;padding:12px;font-weight:800;color:#fff;cursor:pointer;background:${accent}}
  .mcard .claim:disabled{cursor:not-allowed;opacity:.6}
  .mcard .x{position:absolute;right:14px;top:12px;border:0;background:none;font-size:20px;color:#94a3b8;cursor:pointer;line-height:1}
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
      <h1>${esc(cfg.headline || "УГАДАЙ ИСХОД — ЗАБЕРИ ФРИБЕТ")}</h1>
      <div class="cd" id="cd"><span class="dot"></span><span id="cdText"></span></div>
      <div class="mid">
        <div class="card">
          <div class="teams">
            <div class="team">${crest(cfg.crestHome, cfg.teamHome)}<div class="name">${esc(cfg.teamHome || "Хозяева")}</div></div>
            <div class="vs"><div class="score" id="score">${sport.emoji}</div><div class="clock" id="clock">${esc(sport.clock)}</div><b id="vs">VS</b></div>
            <div class="team">${crest(cfg.crestAway, cfg.teamAway)}<div class="name">${esc(cfg.teamAway || "Гости")}</div></div>
          </div>
          <div class="odds">
            <button class="odd" type="button" data-pick="home"><small>П1</small><b>${oddsLabel("home")}</b></button>
            ${sport.hasDraw ? `<button class="odd" type="button" data-pick="draw"><small>Ничья</small><b>${oddsLabel("draw")}</b></button>` : ""}
            <button class="odd" type="button" data-pick="away"><small>П2</small><b>${oddsLabel("away")}</b></button>
          </div>
          <div class="hint" id="hint">Выберите исход — матч начнётся сразу</div>
        </div>
      </div>
      <button class="cta" id="cta" type="button">${esc(cfg.ctaText || "СДЕЛАТЬ ПРОГНОЗ")}</button>
      <p class="attemptsInfo" id="attemptsInfo" hidden></p>
    </div>
    <div class="modal" id="modal"><div class="mcard" id="mcard"></div></div>
  </div>
<script>
(function(){
  var ACCENT=${embedJson(accent)};
  var HAS_DRAW=${embedJson(sport.hasDraw)}, UNIT=${embedJson(sport.unit)}, EMOJI=${embedJson(sport.emoji)}, CLOCK=${embedJson(sport.clock)};
  var ODDS=${embedJson({ home: cfg.odds.home, draw: cfg.odds.draw, away: cfg.odds.away })};
  var MODE=${embedJson(cfg.outcomeMode)}, CHANCE=${embedJson(cfg.winChance)};
  var SECS=${embedJson(Math.max(2, cfg.matchSeconds || 8))}, BASE=${embedJson(cfg.finalScore || "2:1")};
  var PRIZE=${embedJson(prizeTitle)}, WINTEXT=${embedJson(cfg.winText || "Прогноз сыграл! Забирайте бонус.")};
  var CD_MODE=${embedJson(cfg.countdownMode)}, CD_MIN=${embedJson(cfg.countdownMinutes || 15)}, CD_DATE=${embedJson(cfg.countdownDate || "")};
  var maxAttempts=${embedJson(cfg.maxAttempts || 0)}, attemptsUsed=0;
  var TEAM={home:${embedJson(cfg.teamHome || "Хозяева")},away:${embedJson(cfg.teamAway || "Гости")}};
  var score=document.getElementById('score'), clock=document.getElementById('clock'), vs=document.getElementById('vs'), hint=document.getElementById('hint');
  var cta=document.getElementById('cta'), attemptsInfo=document.getElementById('attemptsInfo');
  var modal=document.getElementById('modal'), mcard=document.getElementById('mcard');
  var odds=[].slice.call(document.querySelectorAll('.odd'));
  var phase='idle', timer=0;
  function exhausted(){ return maxAttempts>0 && attemptsUsed>=maxAttempts; }
  function updateAttemptsUi(){
    if(maxAttempts<=0){ attemptsInfo.hidden=true; return; }
    attemptsInfo.hidden=false; attemptsInfo.textContent='Осталось попыток: '+Math.max(0,maxAttempts-attemptsUsed);
    if(exhausted()){ cta.disabled=true; cta.textContent='Попытки закончились'; odds.forEach(function(b){b.disabled=true;}); }
  }
  function fav(){ var c=[['home',ODDS.home],['away',ODDS.away]]; if(HAS_DRAW) c.push(['draw',ODDS.draw]); c.sort(function(a,b){return a[1]-b[1];}); return c[0][0]; }
  function decide(pick){ if(MODE==='always') return true; if(MODE==='favorite') return pick===fav(); return Math.random()*100<Math.min(100,Math.max(0,CHANCE)); }
  function outcome(pick,win){ if(win) return pick; var o=['home','draw','away'].filter(function(x){return x!==pick&&(HAS_DRAW||x!=='draw');}); return o[Math.floor(Math.random()*o.length)]||'home'; }
  function scoreFor(out){ var m=/^\\s*(\\d{1,2})\\s*[:\\-–]\\s*(\\d{1,2})\\s*$/.exec(BASE); var h=m?+m[1]:2, a=m?+m[2]:1; var hi=Math.max(h,a), lo=Math.min(h,a);
    if(out==='home'){ h=hi===lo?hi+1:hi; a=lo; } else if(out==='away'){ a=hi===lo?hi+1:hi; h=lo; } else { h=a=lo; } return [h,a]; }
  function timeline(h,a){ var ev=[]; for(var i=0;i<h;i++) ev.push({at:.1+Math.random()*.85,side:'home'}); for(var j=0;j<a;j++) ev.push({at:.1+Math.random()*.85,side:'away'}); return ev.sort(function(x,y){return x.at-y.at;}); }
  function setSel(pick){ odds.forEach(function(b){ b.classList.toggle('sel', b.getAttribute('data-pick')===pick); }); }
  function label(p){ return p==='home'?'П1 · '+TEAM.home : p==='away'?'П2 · '+TEAM.away : 'Ничья'; }
  function start(pick){
    if(phase==='running'||exhausted()) return;
    attemptsUsed+=1; updateAttemptsUi(); hide();
    phase='running'; setSel(pick); odds.forEach(function(b){b.disabled=true;});
    var win=decide(pick), out=outcome(pick,win), fs=scoreFor(out), ev=timeline(fs[0],fs[1]);
    var h=0,a=0, t0=Date.now(), idx=0;
    vs.textContent='LIVE'; vs.style.color='#ef4444'; score.textContent='0 : 0'; hint.textContent='Ваш прогноз: '+label(pick);
    clearInterval(timer);
    timer=setInterval(function(){
      var p=Math.min(1,(Date.now()-t0)/(SECS*1000));
      clock.textContent=Math.floor(p*90)+'′';
      while(idx<ev.length && ev[idx].at<=p){ if(ev[idx].side==='home') h++; else a++; idx++; score.textContent=h+' : '+a; score.classList.remove('flash'); void score.offsetWidth; score.classList.add('flash'); }
      if(p>=1){ clearInterval(timer); h=fs[0]; a=fs[1]; score.textContent=h+' : '+a; clock.textContent='FT'; vs.textContent='VS'; vs.style.color=ACCENT; phase=win?'won':'lost'; show(win, h+' : '+a, pick); }
    },60);
  }
  function reset(){ phase='idle'; score.textContent=EMOJI; clock.textContent=CLOCK; vs.textContent='VS'; vs.style.color=ACCENT; setSel(''); hint.textContent='Выберите исход — матч начнётся сразу'; if(!exhausted()) odds.forEach(function(b){b.disabled=false;}); }
  function show(win, sc, pick){
    if(win){ mcard.innerHTML='<button class="x" id="cx">&times;</button><h2>✅ Прогноз сыграл!</h2><p>'+esc(label(pick))+' · счёт '+sc+'</p><div class="big">'+esc(PRIZE)+'</div><p>'+esc(WINTEXT)+'</p><button class="claim" id="claim">Забрать бонус</button>'; }
    else{ var canRetry=!exhausted(); mcard.innerHTML='<button class="x" id="cx">&times;</button><h2>😬 Не зашло</h2><p>Счёт '+sc+'. Попробуйте другой исход!</p><button class="claim" id="claim"'+(canRetry?'':' disabled')+'>'+(canRetry?'Ещё прогноз':'Попытки закончились')+'</button>'; }
    modal.classList.add('show');
    var cx=document.getElementById('cx'); if(cx) cx.onclick=function(){ hide(); reset(); };
    var claim=document.getElementById('claim'); if(claim) claim.onclick=function(){ if(win){ var u=${embedJson(safeCtaUrl(cfg.ctaUrl))}; if(u){ (window.top||window).location.href=u; return; } hide(); reset(); } else { if(exhausted()) return; hide(); reset(); } };
  }
  function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function hide(){ modal.classList.remove('show'); }
  odds.forEach(function(b){ b.addEventListener('click', function(){ start(b.getAttribute('data-pick')); }); });
  cta.addEventListener('click', function(){ if(phase==='idle'){ if(exhausted()) return; odds.forEach(function(b){ b.style.transition='box-shadow .3s'; b.style.boxShadow='0 0 18px '+ACCENT; setTimeout(function(){ b.style.boxShadow=''; },600); }); } else if(phase!=='running'){ hide(); reset(); } });
  modal.addEventListener('click', function(e){ if(e.target===modal){ hide(); reset(); } });
  // Countdown (decorative urgency): counts to a fixed date, or N minutes from
  // page open; flips to LIVE at zero. Never blocks picking.
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
  updateAttemptsUi();
})();
</script>
</body>
</html>`;
}
