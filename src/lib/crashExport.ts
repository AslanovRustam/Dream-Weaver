// Build a self-contained HTML page for a crash-game landing: background,
// flanking characters, a rising multiplier with a rocket, a CASH OUT button and
// a win / crash modal — all inline, no external assets.

export type CrashExportConfig = {
  brand: string;
  headline: string;
  accent: string;
  dark: boolean;
  ctaText: string;
  bgImage: string;
  charLeft: string;
  charRight: string;
};

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildCrashHtml(cfg: CrashExportConfig): string {
  const accent = /^#[0-9a-fA-F]{6}$/.test(cfg.accent) ? cfg.accent : "#ef4444";
  const bg = cfg.bgImage
    ? `background:#0b0d12 url('${cfg.bgImage}') center/cover no-repeat;`
    : `background:radial-gradient(80% 70% at 50% 30%, ${accent}55, transparent), ${cfg.dark ? "#160d29" : "#ffe9a8"};`;
  const charImg = (src: string, side: "left" | "right") =>
    src ? `<img class="char ${side}" src="${src}" alt=""/>` : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(cfg.brand || "Crash")}</title>
<style>
  :root{--accent:${accent};}
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{height:100%}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;color:#fff;overflow:hidden}
  .stage{position:relative;width:100vw;height:100dvh;overflow:hidden;${bg}}
  .stage::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.25),transparent 40%,rgba(0,0,0,.45));pointer-events:none}
  .char{position:absolute;bottom:0;z-index:2;height:74%;max-width:42%;object-fit:contain;object-position:bottom;filter:drop-shadow(0 10px 22px rgba(0,0,0,.55));pointer-events:none}
  .char.left{left:-2%}.char.right{right:-2%}
  .col{position:relative;z-index:3;display:flex;flex-direction:column;align-items:center;height:100%;padding:22px 16px}
  .top{width:100%;display:flex;align-items:center;justify-content:space-between;font-weight:800}
  .top .lang{background:rgba(0,0,0,.3);border-radius:999px;padding:2px 10px;font-size:11px;color:rgba(255,255,255,.85)}
  h1{margin-top:6px;text-align:center;font-size:clamp(26px,7vw,44px);font-weight:900;text-transform:uppercase;letter-spacing:-.01em;line-height:1;text-shadow:0 2px 0 var(--accent),0 4px 12px rgba(0,0,0,.5)}
  .mid{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;gap:14px}
  .graph{position:relative;width:min(86vw,360px);aspect-ratio:10/9;border-radius:18px;border:2px solid ${accent}66;overflow:hidden;background:radial-gradient(130% 120% at 0% 100%, ${accent}22, transparent 62%),#0c0718;box-shadow:0 0 26px ${accent}44,0 14px 30px rgba(0,0,0,.5)}
  .trail{position:absolute;bottom:0;left:0;transform-origin:bottom left;width:150%;height:3px;background:linear-gradient(90deg,transparent,${accent});opacity:.85}
  .rocket{position:absolute;left:8%;bottom:8%;font-size:34px;transition:transform .06s linear}
  .mult{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:clamp(30px,9vw,52px);font-weight:900;color:${accent};text-shadow:0 2px 14px rgba(0,0,0,.55)}
  .cash{width:min(70vw,260px);height:52px;border:2px solid rgba(255,255,255,.6);border-radius:999px;color:#fff;font-size:16px;font-weight:900;text-transform:uppercase;letter-spacing:.03em;cursor:pointer;box-shadow:0 0 16px ${accent}88,inset 0 2px 6px rgba(255,255,255,.35),0 6px 14px rgba(0,0,0,.5);text-shadow:0 1px 2px rgba(0,0,0,.5)}
  .cash.live{background:radial-gradient(circle at 30% 25%,#fff6,transparent 45%),linear-gradient(180deg,${accent},${accent}bb)}
  .cash.dead{background:linear-gradient(180deg,#3a4150,#2a303c)}
  .cash:active{transform:scale(.96)}
  .cta{position:relative;z-index:3;margin:6px 0 4px;width:82%;max-width:380px;border:0;border-radius:999px;padding:15px;font-size:18px;font-weight:900;text-transform:uppercase;letter-spacing:.03em;color:#fff;cursor:pointer;background:linear-gradient(180deg,${accent},${accent}cc);box-shadow:0 8px 20px rgba(0,0,0,.35)}
  .cta:active{transform:scale(.97)}
  .modal{position:absolute;inset:0;z-index:9;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.6);padding:24px}
  .modal.show{display:flex}
  .card{width:100%;max-width:320px;background:#fff;color:#0f172a;border-radius:18px;padding:26px;text-align:center;box-shadow:0 20px 50px rgba(0,0,0,.4);position:relative}
  .card h2{font-size:19px;margin-bottom:6px}.card p{color:#475569;font-size:14px}
  .card .big{font-size:34px;font-weight:900;margin:4px 0}
  .card .claim{margin-top:16px;width:100%;border:0;border-radius:10px;padding:12px;font-weight:800;color:#fff;cursor:pointer;background:${accent}}
  .card .x{position:absolute;right:14px;top:12px;border:0;background:none;font-size:20px;color:#94a3b8;cursor:pointer;line-height:1}
</style>
</head>
<body>
  <div class="stage">
    ${charImg(cfg.charLeft, "left")}
    ${charImg(cfg.charRight, "right")}
    <div class="col">
      <div class="top"><span>${esc(cfg.brand || "BRAND")}</span><span class="lang">EN</span></div>
      <h1>${esc(cfg.headline || "УСПЕЙ ЗАБРАТЬ!")}</h1>
      <div class="mid">
        <div class="graph" id="graph">
          <div class="trail" id="trail"></div>
          <div class="rocket" id="rocket">🚀</div>
          <div class="mult" id="mult">1.00x</div>
        </div>
        <button class="cash live" id="cash" type="button">ЗАБРАТЬ ×1.00</button>
      </div>
      <button class="cta" id="cta" type="button">${esc(cfg.ctaText || "СТАРТ")}</button>
    </div>
    <div class="modal" id="modal"><div class="card" id="card"></div></div>
  </div>
<script>
(function(){
  var ACCENT=${JSON.stringify(accent)};
  var mult=document.getElementById('mult'), rocket=document.getElementById('rocket'), trail=document.getElementById('trail');
  var btn=document.getElementById('cash'), cta=document.getElementById('cta');
  var modal=document.getElementById('modal'), card=document.getElementById('card');
  var raf=0, phase='idle', crashAt=0, t0=0, m=1;
  function fmt(x){ return x.toFixed(2); }
  function draw(){ var p=Math.min(1,(m-1)/9); mult.textContent=fmt(m)+'x'; mult.style.color=ACCENT; rocket.style.transform='translate('+(p*62)+'%,'+(-p*150)+'%) rotate(12deg)'; rocket.style.opacity='1'; trail.style.transform='rotate('+(-(18+p*30))+'deg)'; btn.textContent='ЗАБРАТЬ ×'+fmt(m); }
  // setInterval (not rAF) so the multiplier climbs even in a background tab.
  function start(){ clearInterval(raf); crashAt=2+Math.random()*8; t0=Date.now(); phase='running'; m=1; btn.className='cash live'; hide(); draw();
    raf=setInterval(function(){ if(phase!=='running') return; var dt=(Date.now()-t0)/1000; m=Math.pow(1.0718,dt*10); if(m>=crashAt){ m=crashAt; boom(); return; } draw(); }, 45); }
  function cashOut(){ if(phase!=='running') return; clearInterval(raf); phase='cashed'; mult.style.color='#4ade80'; show(true, fmt(m)); }
  function boom(){ clearInterval(raf); phase='crashed'; mult.textContent='\\uD83D\\uDCA5 '+fmt(m)+'x'; mult.style.color='#f87171'; rocket.style.opacity='0'; btn.className='cash dead'; btn.textContent='Ещё раз'; show(false, fmt(m)); }
  function show(win, val){
    if(win){ card.innerHTML='<button class="x" id="cx">&times;</button><h2>🚀 Забрал вовремя!</h2><div class="big" style="color:'+ACCENT+'">×'+val+'</div><p>Отличный кэшаут — забирайте бонус!</p><button class="claim" id="claim">Забрать бонус</button>'; }
    else{ card.innerHTML='<button class="x" id="cx">&times;</button><h2>💥 Разбилось на ×'+val+'</h2><p>Чуть не успел — попробуйте ещё раз и заберите вовремя!</p><button class="claim" id="claim">Ещё раз</button>'; }
    modal.classList.add('show');
    var cx=document.getElementById('cx'); if(cx) cx.onclick=hide;
    var claim=document.getElementById('claim'); if(claim) claim.onclick=function(){ hide(); if(!win) start(); };
  }
  function hide(){ modal.classList.remove('show'); }
  btn.addEventListener('click', function(){ if(phase==='running') cashOut(); else start(); });
  cta.addEventListener('click', start);
  modal.addEventListener('click', function(e){ if(e.target===modal) hide(); });
  start();
})();
</script>
</body>
</html>`;
}
