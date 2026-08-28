// Build a self-contained HTML page for a fortune-wheel landing: background,
// flanking characters, spinning SVG wheel, SPIN button and a win / try-again
// modal — all inline (images as data URLs), no external assets. Mirrors the
// look of the in-app preview so the downloaded file is the deliverable.

export type WheelExportConfig = {
  brand: string;
  headline: string;
  accent: string;
  dark: boolean;
  ctaText: string;
  bgImage: string;
  prizes: { label: string; sub?: string }[];
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
function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}
function sectorPath(cx: number, cy: number, r: number, start: number, end: number): string {
  const [x1, y1] = polar(cx, cy, r, start);
  const [x2, y2] = polar(cx, cy, r, end);
  const large = end - start > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
}
function darken(hex: string, amt: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = Math.round(((n >> 16) & 255) * (1 - amt));
  const g = Math.round(((n >> 8) & 255) * (1 - amt));
  const b = Math.round((n & 255) * (1 - amt));
  return `rgb(${r},${g},${b})`;
}

export function buildWheelHtml(cfg: WheelExportConfig): string {
  const accent = /^#[0-9a-fA-F]{6}$/.test(cfg.accent) ? cfg.accent : "#f97316";
  const prizes = cfg.prizes.length >= 2 ? cfg.prizes : [{ label: "BONUS" }, { label: "TRY AGAIN" }];
  const n = prizes.length;
  const ang = 360 / n;
  const size = 400,
    cx = 200,
    cy = 200,
    r = 194;

  const sectors = prizes
    .map((_, i) => {
      const fill = i % 2 === 0 ? accent : darken(accent, 0.42);
      return `<path d="${sectorPath(cx, cy, r - 12, i * ang, (i + 1) * ang)}" fill="${fill}" stroke="rgba(255,255,255,.28)" stroke-width="1.5"/>`;
    })
    .join("");
  const labels = prizes
    .map((s, i) => {
      const mid = i * ang + ang / 2;
      const [tx, ty] = polar(cx, cy, r * 0.6, mid);
      const sub = s.sub
        ? `<text x="${tx.toFixed(1)}" y="${(ty + 16).toFixed(1)}" text-anchor="middle" fill="rgba(255,255,255,.9)" font-size="10" font-weight="600">${esc(s.sub)}</text>`
        : "";
      return `<g transform="rotate(${mid.toFixed(2)} ${tx.toFixed(1)} ${ty.toFixed(1)})"><text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" fill="#fff" font-size="${n > 8 ? 13 : 16}" font-weight="800" style="text-shadow:0 1px 2px rgba(0,0,0,.6)">${esc(s.label)}</text>${sub}</g>`;
    })
    .join("");
  const dots = Array.from({ length: n })
    .map((_, i) => {
      const [dx, dy] = polar(cx, cy, r - 4, i * ang);
      return `<circle cx="${dx.toFixed(1)}" cy="${dy.toFixed(1)}" r="4" fill="#fef08a" stroke="#b45309" stroke-width="1"/>`;
    })
    .join("");

  const bg = cfg.bgImage
    ? `background:#0b0d12 url('${cfg.bgImage}') center/cover no-repeat;`
    : `background:radial-gradient(80% 70% at 50% 30%, ${accent}55, transparent), ${cfg.dark ? "#160d29" : "#ffe9a8"};`;
  const charImg = (src: string, side: "left" | "right") =>
    src
      ? `<img class="char ${side}" src="${src}" alt=""/>`
      : "";

  const prizesJson = JSON.stringify(prizes);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(cfg.brand || "Spin & Win")}</title>
<style>
  :root{--accent:${accent};}
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{height:100%}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;color:#fff;overflow:hidden}
  .stage{position:relative;width:100vw;height:100dvh;overflow:hidden;${bg}}
  .stage::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.25),transparent 40%,rgba(0,0,0,.45));pointer-events:none}
  .char{position:absolute;bottom:0;z-index:2;height:78%;max-width:42%;object-fit:contain;object-position:bottom;filter:drop-shadow(0 10px 22px rgba(0,0,0,.55));pointer-events:none}
  .char.left{left:-2%}.char.right{right:-2%}
  .col{position:relative;z-index:3;display:flex;flex-direction:column;align-items:center;height:100%;padding:22px 16px}
  .top{width:100%;display:flex;align-items:center;justify-content:space-between;font-weight:800}
  .top .lang{background:rgba(0,0,0,.3);border-radius:999px;padding:2px 10px;font-size:11px;color:rgba(255,255,255,.85)}
  h1{margin-top:6px;text-align:center;font-size:clamp(26px,7vw,44px);font-weight:900;text-transform:uppercase;letter-spacing:-.01em;line-height:1;text-shadow:0 2px 0 var(--accent),0 4px 12px rgba(0,0,0,.5)}
  .wheelWrap{flex:1;display:flex;align-items:center;justify-content:center;width:100%}
  .wheel{position:relative;width:min(84vw,360px);aspect-ratio:1}
  .pointer{position:absolute;left:50%;top:-8px;transform:translateX(-50%);z-index:4;width:0;height:0;border-left:17px solid transparent;border-right:17px solid transparent;border-top:30px solid #ef4444;filter:drop-shadow(0 3px 4px rgba(0,0,0,.5))}
  .disc{width:100%;height:100%;border-radius:50%;filter:drop-shadow(0 0 26px ${accent}66) drop-shadow(0 14px 30px rgba(0,0,0,.55));transition:none}
  .spinning{transition:transform 4.2s cubic-bezier(.15,.85,.25,1)}
  .hub{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:5;width:70px;height:70px;border-radius:50%;border:4px solid #fff;color:#fff;font-weight:900;font-size:15px;cursor:pointer;background:radial-gradient(circle at 35% 30%,#fff,${accent} 42%,${darken(accent, 0.5)});box-shadow:0 0 18px ${accent}aa,inset 0 2px 6px rgba(255,255,255,.5),0 6px 14px rgba(0,0,0,.5);text-shadow:0 1px 2px rgba(0,0,0,.5)}
  .hub:active{transform:translate(-50%,-50%) scale(.95)}
  .cta{position:relative;z-index:3;margin:10px 0 4px;width:100%;max-width:300px;border:0;border-radius:999px;padding:15px;font-size:18px;font-weight:900;text-transform:uppercase;letter-spacing:.03em;color:#fff;cursor:pointer;background:linear-gradient(180deg,${accent},${accent}cc);box-shadow:0 8px 20px rgba(0,0,0,.35)}
  .cta:active{transform:scale(.97)}
  .modal{position:absolute;inset:0;z-index:9;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.6);padding:24px}
  .modal.show{display:flex}
  .card{width:100%;max-width:320px;background:#fff;color:#0f172a;border-radius:18px;padding:26px;text-align:center;box-shadow:0 20px 50px rgba(0,0,0,.4);position:relative}
  .card h2{font-size:20px;margin-bottom:6px}
  .card p{color:#475569;font-size:14px}
  .card .prize{font-weight:800}
  .card button{margin-top:16px;width:100%;border:0;border-radius:10px;padding:12px;font-weight:800;color:#fff;cursor:pointer;background:${accent}}
  .card .x{position:absolute;right:14px;top:12px;border:0;background:none;font-size:20px;color:#94a3b8;cursor:pointer;line-height:1}
</style>
</head>
<body>
  <div class="stage">
    ${charImg(cfg.charLeft, "left")}
    ${charImg(cfg.charRight, "right")}
    <div class="col">
      <div class="top"><span>${esc(cfg.brand || "BRAND")}</span><span class="lang">EN</span></div>
      <h1>${esc(cfg.headline || "TRY YOUR LUCK!")}</h1>
      <div class="wheelWrap">
        <div class="wheel">
          <div class="pointer"></div>
          <div class="disc" id="disc">
            <svg viewBox="0 0 ${size} ${size}" width="100%" height="100%">
              <defs>
                <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fef3c7"/><stop offset="45%" stop-color="#f59e0b"/><stop offset="100%" stop-color="#92400e"/></linearGradient>
                <radialGradient id="sheen" cx="42%" cy="30%" r="75%"><stop offset="0%" stop-color="rgba(255,255,255,.30)"/><stop offset="45%" stop-color="rgba(255,255,255,.05)"/><stop offset="100%" stop-color="rgba(0,0,0,.28)"/></radialGradient>
              </defs>
              <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#rim)"/>
              <circle cx="${cx}" cy="${cy}" r="${r - 8}" fill="${darken(accent, 0.62)}"/>
              ${sectors}
              <circle cx="${cx}" cy="${cy}" r="${r - 12}" fill="url(#sheen)" pointer-events="none"/>
              ${labels}
              ${dots}
            </svg>
          </div>
          <button class="hub" id="hub" type="button" aria-label="Spin">SPIN</button>
        </div>
      </div>
      <button class="cta" id="cta" type="button">${esc(cfg.ctaText || "SPIN")}</button>
    </div>
    <div class="modal" id="modal">
      <div class="card" id="card"></div>
    </div>
  </div>
<script>
(function(){
  var prizes=${prizesJson};
  var n=prizes.length, ang=360/n, rotation=0, spinning=false;
  var disc=document.getElementById('disc'), modal=document.getElementById('modal'), card=document.getElementById('card');
  var loseRe=/try\\s*again|снова|ещё раз|заново|again|empty|пусто/i;
  function spin(){
    if(spinning)return; spinning=true;
    var target=Math.floor(Math.random()*n);
    var base=rotation-(rotation%360);
    var segCenter=(target+0.5)*ang;
    var need=(360-segCenter)%360;
    var jitter=(Math.random()-0.5)*ang*0.5;
    rotation=base+360*5+need+jitter;
    disc.classList.add('spinning');
    disc.style.transform='rotate('+rotation+'deg)';
    setTimeout(function(){ spinning=false; show(target); },4200);
  }
  function show(i){
    var seg=prizes[i]||{label:''};
    var lose=!seg.label||loseRe.test(seg.label);
    if(lose){
      card.innerHTML='<button class="x" id="cx">&times;</button><h2>😅 Almost!</h2><p>Not this time — spin again, your prize is waiting!</p><button id="again">Spin again</button>';
    }else{
      card.innerHTML='<button class="x" id="cx">&times;</button><h2>🎉 Congratulations!</h2><p>You won <span class="prize" style="color:${accent}">'+ (seg.label+(seg.sub?' '+seg.sub:'')) +'</span></p><button id="claim">Claim bonus</button>';
    }
    modal.classList.add('show');
    var cx=document.getElementById('cx'); if(cx)cx.onclick=close;
    var again=document.getElementById('again'); if(again)again.onclick=function(){close();spin();};
    var claim=document.getElementById('claim'); if(claim)claim.onclick=close;
  }
  function close(){ modal.classList.remove('show'); }
  document.getElementById('hub').onclick=spin;
  document.getElementById('cta').onclick=spin;
  modal.onclick=function(e){ if(e.target===modal)close(); };
})();
</script>
</body>
</html>`;
}
