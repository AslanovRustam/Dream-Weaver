// Build a self-contained HTML page for a slot-machine landing: background,
// flanking characters, three spinning reels, SPIN button and a win / try-again
// modal — all inline, no external assets.

export type SlotExportConfig = {
  brand: string;
  headline: string;
  accent: string;
  dark: boolean;
  ctaText: string;
  bgImage: string;
  symbols: string[];
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
function darken(hex: string, amt: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = Math.round(((n >> 16) & 255) * (1 - amt));
  const g = Math.round(((n >> 8) & 255) * (1 - amt));
  const b = Math.round((n & 255) * (1 - amt));
  return `rgb(${r},${g},${b})`;
}

export function buildSlotHtml(cfg: SlotExportConfig): string {
  const accent = /^#[0-9a-fA-F]{6}$/.test(cfg.accent) ? cfg.accent : "#818cf8";
  const symbols = cfg.symbols.length >= 3 ? cfg.symbols : ["🍒", "💎", "7️⃣"];
  const bg = cfg.bgImage
    ? `background:#0b0d12 url('${cfg.bgImage}') center/cover no-repeat;`
    : `background:radial-gradient(80% 70% at 50% 30%, ${accent}55, transparent), ${cfg.dark ? "#160d29" : "#ffe9a8"};`;
  const charImg = (src: string, side: "left" | "right") =>
    src ? `<img class="char ${side}" src="${src}" alt=""/>` : "";
  const symbolsJson = JSON.stringify(symbols);

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
  .char{position:absolute;bottom:0;z-index:2;height:74%;max-width:42%;object-fit:contain;object-position:bottom;filter:drop-shadow(0 10px 22px rgba(0,0,0,.55));pointer-events:none}
  .char.left{left:-2%}.char.right{right:-2%}
  .col{position:relative;z-index:3;display:flex;flex-direction:column;align-items:center;height:100%;padding:22px 16px}
  .top{width:100%;display:flex;align-items:center;justify-content:space-between;font-weight:800}
  .top .lang{background:rgba(0,0,0,.3);border-radius:999px;padding:2px 10px;font-size:11px;color:rgba(255,255,255,.85)}
  h1{margin-top:6px;text-align:center;font-size:clamp(26px,7vw,44px);font-weight:900;text-transform:uppercase;letter-spacing:-.01em;line-height:1;text-shadow:0 2px 0 var(--accent),0 4px 12px rgba(0,0,0,.5)}
  .mid{flex:1;display:flex;align-items:center;justify-content:center;width:100%}
  .cab{width:min(90vw,360px);border-radius:20px;padding:3px;background:linear-gradient(180deg,#fde68a,${accent} 45%,#78350f);filter:drop-shadow(0 0 22px ${accent}66) drop-shadow(0 14px 30px rgba(0,0,0,.55))}
  .cabIn{border-radius:18px;padding:12px;background:linear-gradient(180deg,#1b1030,#0c0718)}
  .bulbs{display:flex;justify-content:center;gap:6px;margin-bottom:8px}
  .bulbs i{width:6px;height:6px;border-radius:50%;background:${accent};box-shadow:0 0 6px ${accent}}
  .window{position:relative;overflow:hidden;border-radius:12px;border:1px solid rgba(255,255,255,.08);background:linear-gradient(180deg,#050308,#140a24 50%,#050308)}
  .reels{display:flex;justify-content:center;height:100%}
  .reel{overflow:hidden}
  .reel .strip{will-change:transform}
  .cell{display:flex;align-items:center;justify-content:center;line-height:1}
  .payline{position:absolute;left:4px;right:4px;z-index:2;border:2px solid ${accent};border-radius:8px;box-shadow:0 0 14px ${accent}aa,inset 0 0 12px ${accent}55;pointer-events:none}
  .cta{position:relative;z-index:3;margin:12px 0 4px;width:100%;max-width:300px;border:0;border-radius:999px;padding:15px;font-size:18px;font-weight:900;text-transform:uppercase;letter-spacing:.03em;color:#fff;cursor:pointer;background:linear-gradient(180deg,${accent},${accent}cc);box-shadow:0 8px 20px rgba(0,0,0,.35)}
  .cta:active{transform:scale(.97)}
  .modal{position:absolute;inset:0;z-index:9;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.6);padding:24px}
  .modal.show{display:flex}
  .card{width:100%;max-width:320px;background:#fff;color:#0f172a;border-radius:18px;padding:26px;text-align:center;box-shadow:0 20px 50px rgba(0,0,0,.4);position:relative}
  .card h2{font-size:20px;margin-bottom:6px}.card p{color:#475569;font-size:14px}
  .card .big{font-size:30px;margin:6px 0}
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
      <h1>${esc(cfg.headline || "SPIN TO WIN!")}</h1>
      <div class="mid">
        <div class="cab"><div class="cabIn">
          <div class="bulbs"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
          <div class="window" id="window">
            <div class="reels" id="reels"></div>
            <div class="payline" id="payline"></div>
          </div>
        </div></div>
      </div>
      <button class="cta" id="cta" type="button">${esc(cfg.ctaText || "SPIN")}</button>
    </div>
    <div class="modal" id="modal"><div class="card" id="card"></div></div>
  </div>
<script>
(function(){
  var syms=${symbolsJson};
  var len=syms.length, REELS=3, VISIBLE=3, BASE=24, REP=60;
  var DUR=[2.4,2.9,3.4];
  var reelsEl=document.getElementById('reels'), win=document.getElementById('window'), payline=document.getElementById('payline');
  var modal=document.getElementById('modal'), card=document.getElementById('card');
  var pos=[], strips=[], cell=76, spinning=false;
  function mod(a,n){return ((a%n)+n)%n;}
  function build(){
    var w=win.clientWidth||300; cell=Math.floor((w-24-2*8)/REELS); if(cell<20)cell=20;
    var wh=VISIBLE*cell;
    win.style.height=wh+'px';
    reelsEl.style.gap='8px';
    reelsEl.innerHTML='';
    strips=[]; pos=[];
    for(var ri=0;ri<REELS;ri++){
      var reel=document.createElement('div'); reel.className='reel'; reel.style.width=cell+'px'; reel.style.height=wh+'px';
      var strip=document.createElement('div'); strip.className='strip';
      for(var j=0;j<REP*len;j++){ var c=document.createElement('div'); c.className='cell'; c.style.height=cell+'px'; c.style.fontSize=(cell*0.56)+'px'; c.textContent=syms[j%len]; strip.appendChild(c); }
      reel.appendChild(strip); reelsEl.appendChild(reel); strips.push(strip);
      var p=BASE*len+ri; pos.push(p); strip.style.transition='none'; strip.style.transform='translateY('+((1-p)*cell)+'px)';
    }
    payline.style.top=cell+'px'; payline.style.height=cell+'px';
  }
  function spin(){
    if(spinning)return; spinning=true;
    var winFlag=Math.random()<0.45; var winK=Math.floor(Math.random()*len);
    var targets=[]; for(var i=0;i<REELS;i++)targets.push(winFlag?winK:Math.floor(Math.random()*len));
    if(!winFlag&&targets[0]===targets[1]&&targets[1]===targets[2])targets[2]=(targets[2]+1)%len;
    for(var i=0;i<REELS;i++){
      var p=pos[i]; var spins=(4+i)*len; var delta=mod(targets[i]-mod(p,len),len); var np=p+spins+delta;
      (function(ri,npv){ strips[ri].style.transition='transform '+DUR[ri]+'s cubic-bezier(.12,.7,.2,1)'; strips[ri].style.transform='translateY('+((1-npv)*cell)+'px)'; pos[ri]=npv; })(i,np);
    }
    setTimeout(function(){
      for(var i=0;i<REELS;i++){ var np=BASE*len+mod(pos[i],len); strips[i].style.transition='none'; strips[i].style.transform='translateY('+((1-np)*cell)+'px)'; pos[i]=np; }
      spinning=false; show(winFlag, syms[winFlag?winK:targets[0]]);
    }, DUR[REELS-1]*1000+250);
  }
  function show(w, sym){
    if(w){ card.innerHTML='<button class="x" id="cx">&times;</button><h2>🎉 Jackpot!</h2><div class="big">'+sym+' '+sym+' '+sym+'</div><p>Three in a row — claim your bonus!</p><button id="claim">Claim bonus</button>'; }
    else{ card.innerHTML='<button class="x" id="cx">&times;</button><h2>😅 Almost!</h2><p>No match this time — spin again, the jackpot is waiting!</p><button id="again">Spin again</button>'; }
    modal.classList.add('show');
    var cx=document.getElementById('cx'); if(cx)cx.onclick=close;
    var again=document.getElementById('again'); if(again)again.onclick=function(){close();spin();};
    var claim=document.getElementById('claim'); if(claim)claim.onclick=close;
  }
  function close(){ modal.classList.remove('show'); }
  document.getElementById('cta').onclick=spin;
  modal.onclick=function(e){ if(e.target===modal)close(); };
  build(); window.addEventListener('resize',function(){ if(!spinning)build(); });
})();
</script>
</body>
</html>`;
}
