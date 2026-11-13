// Лендинг из баннера по слоям: первый экран — тот же баннер, но живой. Фон (чистая
// копия мастера) медленно «дышит», надписи, оффер, кнопка, декор и лого — отдельные
// прозрачные слои: влетают по очереди, качаются в параллаксе за мышью / наклоном
// телефона, поверх — эффекты (лучи, искры, монеты, неон). Ниже — блоки landingKit.
//
// Кнопка баннера — настоящая кнопка (data-excta): переход на оффер со всеми пикселями
// и параметрами адреса, как у остальных кнопок страницы.

import type { BannerSprites } from "./bannerLayers";
import { kitParts, type LandingExtras, type LandingKind } from "./landingKit";

export type HeroEntrance = "drop" | "zoom" | "rise" | "slide";
export type HeroEffect = "casino" | "coins" | "neon" | "calm";

export const HERO_ENTRANCES: { id: HeroEntrance; label: string }[] = [
  { id: "drop", label: "Падение с отскоком" },
  { id: "zoom", label: "Наезд из размытия" },
  { id: "rise", label: "Всплытие" },
  { id: "slide", label: "С боков" },
];
export const HERO_EFFECTS: { id: HeroEffect; label: string }[] = [
  { id: "casino", label: "Лучи и искры" },
  { id: "coins", label: "Дождь монет" },
  { id: "neon", label: "Неон" },
  { id: "calm", label: "Спокойно" },
];

export type LayeredHeroOpts = {
  sprites: BannerSprites;
  entrance: HeroEntrance;
  effect: HeroEffect;
  accent: string;
  extras: LandingExtras;
  ctaUrl: string;
  kind: LandingKind;
  title: string;
};

const esc = (s: string) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const pct = (v: number) => `${(v * 100).toFixed(3)}%`;

/** Глубина параллакса: фон почти стоит, надписи ближе, кнопка и декор — ближе всего. */
const DEPTH: Record<string, number> = { hero: 0.5, logo: 0.6, text: 1, badge: 0.4, decor: 1.5, button: 1.2 };

export function buildLayeredHeroLanding(o: LayeredHeroOpts): string {
  const accent = /^#[0-9a-fA-F]{6}$/.test(o.accent) ? o.accent : "#ffcc33";
  const extras: LandingExtras = { ...o.extras, look: { ...o.extras.look, intro: false, lines: "off", floaters: false } };
  const k = kitParts(extras, accent, true, o.ctaUrl, o.kind);
  const { w, h, bg, items } = o.sprites;
  // Порядок появления — сверху вниз; кнопка последней, декор вместе с соседями.
  const order = items
    .map((it, i) => ({ it, i }))
    .sort((a, b) => (a.it.kind === "button" ? 1 : 0) - (b.it.kind === "button" ? 1 : 0) || a.it.box.y - b.it.box.y);
  let side = 0;
  const layers = order
    .map(({ it }, n) => {
      const b = it.box;
      const cls = `lh-l k-${it.kind}${it.accent ? " lh-acc" : ""}${o.entrance === "slide" ? (side++ % 2 ? " fromR" : " fromL") : ""}`;
      const style = `left:${pct(b.x)};top:${pct(b.y)};width:${pct(b.w)};height:${pct(b.h)};--d:${(0.25 + n * 0.16).toFixed(2)}s;--z:${DEPTH[it.kind] ?? 1}`;
      const img = `<img src="${it.src}" alt="" draggable="false"/>`;
      if (it.kind === "button")
        return `<button type="button" class="${cls}" style="${style}" data-excta aria-label="CTA">${img}<i class="lh-shine"></i></button>`;
      return `<div class="${cls}" style="${style}">${img}${it.accent ? `<i class="lh-shine"></i>` : ""}</div>`;
    })
    .join("\n      ");
  const last = 0.25 + order.length * 0.16;

  return `<!doctype html>
<html lang="${k.lang}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
<title>${esc(o.title)}</title>
${k.head}
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:#0b0815;color:#fff}
.lh{position:relative;min-height:100svh;display:flex;align-items:center;justify-content:center;overflow:hidden;padding:clamp(12px,3vw,40px)}
.lh-bg{position:absolute;inset:-40px;background:url('${bg}') center/cover;filter:blur(28px) brightness(.45) saturate(1.25);transform:scale(1.1)}
.lh-vig{position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 35%,rgba(11,8,21,.85) 100%)}
.lh-fx{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:3}
.lh-stage{position:relative;z-index:2;width:min(100%,calc((100svh - 2*clamp(12px,3vw,40px)) * ${(w / h).toFixed(4)}));aspect-ratio:${w}/${h};border-radius:clamp(10px,1.6vw,22px);overflow:hidden;box-shadow:0 30px 90px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.08);transform-style:preserve-3d}
.lh-plate{position:absolute;inset:-3%;width:106%;height:106%;object-fit:cover;animation:kb 18s ease-in-out infinite alternate;transform:translate3d(calc(var(--px,0)*-6px),calc(var(--py,0)*-6px),0)}
@keyframes kb{from{scale:1}to{scale:1.07}}
.lh-l{position:absolute;display:block;border:0;background:none;padding:0;transform:translate3d(calc(var(--px,0)*var(--z)*10px),calc(var(--py,0)*var(--z)*10px),0)}
.lh-l img{display:block;width:100%;height:100%;pointer-events:none;user-select:none}
.lh-l>img{opacity:0;animation:var(--in) .8s cubic-bezier(.2,.9,.25,1.2) var(--d) both}
button.lh-l{cursor:pointer;border-radius:999px;overflow:hidden}
button.lh-l>img{animation:var(--in) .8s cubic-bezier(.2,.9,.25,1.2) var(--d) both,pulse 1.8s ease-in-out calc(var(--d) + 1s) infinite}
button.lh-l:hover>img{filter:brightness(1.15)}
@keyframes pulse{0%,100%{scale:1}50%{scale:1.06}}
.lh-acc>img{animation:var(--in) .8s cubic-bezier(.2,.9,.25,1.2) var(--d) both,beat 2.4s ease-in-out calc(var(--d) + 1.2s) infinite}
@keyframes beat{0%,70%,100%{scale:1}78%{scale:1.1}86%{scale:.98}}
.k-decor>img{animation:var(--in) .8s ease var(--d) both,bob 4s ease-in-out calc(var(--d) + .8s) infinite}
@keyframes bob{0%,100%{translate:0 0;rotate:0deg}50%{translate:0 -4%;rotate:2deg}}
.lh-shine{position:absolute;inset:0;overflow:hidden;pointer-events:none;-webkit-mask:var(--m) center/100% 100%;mask:var(--m) center/100% 100%}
.lh-shine::after{content:"";position:absolute;top:-20%;bottom:-20%;width:35%;left:-60%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.75),transparent);animation:sh 3.2s ease-in-out calc(var(--d) + 1.4s) infinite}
@keyframes sh{0%{left:-60%}35%,100%{left:130%}}
/* Появления */
.e-drop{--in:inDrop}.e-zoom{--in:inZoom}.e-rise{--in:inRise}.e-slide{--in:inSlideL}
.e-slide .fromR{--in:inSlideR}
@keyframes inDrop{0%{opacity:0;translate:0 -120%}60%{opacity:1;translate:0 6%}80%{translate:0 -2%}100%{opacity:1;translate:0 0}}
@keyframes inZoom{0%{opacity:0;scale:1.8;filter:blur(14px)}100%{opacity:1;scale:1;filter:blur(0)}}
@keyframes inRise{0%{opacity:0;translate:0 40%}100%{opacity:1;translate:0 0}}
@keyframes inSlideL{0%{opacity:0;translate:-60% 0}100%{opacity:1;translate:0 0}}
@keyframes inSlideR{0%{opacity:0;translate:60% 0}100%{opacity:1;translate:0 0}}
/* Эффекты */
.lh-rays{position:absolute;left:50%;top:50%;width:160vmax;height:160vmax;margin:-80vmax 0 0 -80vmax;z-index:1;opacity:.35;background:repeating-conic-gradient(from 0deg,${accent}55 0 6deg,transparent 6deg 18deg);-webkit-mask:radial-gradient(circle,#000 0,transparent 55%);mask:radial-gradient(circle,#000 0,transparent 55%);animation:spin 40s linear infinite}
@keyframes spin{to{rotate:360deg}}
.fx-neon .lh-stage{box-shadow:0 0 0 2px ${accent},0 0 40px ${accent}aa,0 0 120px ${accent}55;animation:flick 5s infinite}
.fx-neon .k-text>img{filter:drop-shadow(0 0 6px ${accent}) drop-shadow(0 0 18px ${accent}88)}
@keyframes flick{0%,92%,96%,100%{opacity:1}94%{opacity:.75}}
.lh-flash{position:absolute;inset:0;z-index:4;background:#fff;opacity:0;pointer-events:none;animation:fl .7s ease-out ${(last + 0.1).toFixed(2)}s}
@keyframes fl{0%{opacity:0}15%{opacity:.35}100%{opacity:0}}
.lh-legal{position:absolute;left:0;right:0;bottom:8px;z-index:5;text-align:center;font:500 11px/1.3 system-ui,sans-serif;color:rgba(255,255,255,.6)}
@media (prefers-reduced-motion:reduce){*,*::after{animation-duration:.01s!important;animation-iteration-count:1!important}.lh-fx{display:none}}
${k.css}
</style>
</head>
<body>
  <section class="lh fx-${o.effect}">
    <div class="lh-bg"></div>
    ${o.effect === "casino" || o.effect === "coins" ? `<div class="lh-rays"></div>` : ""}
    <div class="lh-vig"></div>
    <div class="lh-stage e-${o.entrance}">
      <img class="lh-plate" src="${bg}" alt=""/>
      ${layers}
      <div class="lh-flash"></div>
    </div>
    ${o.effect === "calm" ? "" : `<canvas class="lh-fx"></canvas>`}
    ${extras.legal.trim() ? `<p class="lh-legal">${esc(extras.legal)}</p>` : ""}
  </section>
  ${k.after}
  ${k.script}
<script>
(function(){
  // Блик по форме слоя: маска — сама картинка.
  document.querySelectorAll('.lh-shine').forEach(function(s){var i=s.parentNode.querySelector("img");if(i)s.style.setProperty('--m','url("'+i.src+'")');});
  // Параллакс: мышь или наклон телефона.
  var st=document.querySelector('.lh-stage');
  function set(x,y){st.style.setProperty('--px',x.toFixed(3));st.style.setProperty('--py',y.toFixed(3));}
  addEventListener('pointermove',function(e){set(e.clientX/innerWidth*2-1,e.clientY/innerHeight*2-1);});
  addEventListener('deviceorientation',function(e){if(e.gamma!=null)set(Math.max(-1,Math.min(1,e.gamma/30)),Math.max(-1,Math.min(1,(e.beta-40)/30)));});
  document.querySelectorAll('.lh-l').forEach(function(l){l.style.transition='transform .25s ease-out';});
  // Частицы.
  var cv=document.querySelector('.lh-fx'); if(!cv||matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var mode=${JSON.stringify(o.effect)}, g=cv.getContext('2d'), W,H,P=[],acc=${JSON.stringify(accent)};
  function rs(){W=cv.width=cv.offsetWidth*devicePixelRatio;H=cv.height=cv.offsetHeight*devicePixelRatio;}
  rs(); addEventListener('resize',rs);
  var N=mode==='coins'?38:mode==='neon'?50:60;
  function mk(top){return {x:Math.random()*W,y:top?-40*devicePixelRatio:Math.random()*H,r:(mode==='coins'?10+Math.random()*12:1+Math.random()*2.6)*devicePixelRatio,v:(mode==='coins'?2+Math.random()*3:.3+Math.random()*.9)*devicePixelRatio,a:Math.random()*6.28,s:.02+Math.random()*.05,c:mode==='neon'?(Math.random()<.5?acc:'#5ef2ff'):(Math.random()<.6?'#ffd76a':'#fff')};}
  for(var i=0;i<N;i++)P.push(mk(false));
  function coin(p){var sx=Math.abs(Math.cos(p.a));g.save();g.translate(p.x,p.y);g.scale(Math.max(.15,sx),1);var gr=g.createRadialGradient(-p.r*.3,-p.r*.3,1,0,0,p.r);gr.addColorStop(0,'#fff6c2');gr.addColorStop(.5,'#ffcc33');gr.addColorStop(1,'#b8860b');g.fillStyle=gr;g.beginPath();g.arc(0,0,p.r,0,6.283);g.fill();g.strokeStyle='#8a6408';g.lineWidth=p.r*.12;g.stroke();g.restore();}
  function star(p){var tw=.5+.5*Math.sin(p.a);g.globalAlpha=tw;g.fillStyle=p.c;g.shadowColor=p.c;g.shadowBlur=p.r*6;g.beginPath();g.arc(p.x,p.y,p.r,0,6.283);g.fill();if(tw>.85){g.fillRect(p.x-p.r*4,p.y-p.r*.2,p.r*8,p.r*.4);g.fillRect(p.x-p.r*.2,p.y-p.r*4,p.r*.4,p.r*8);}g.globalAlpha=1;g.shadowBlur=0;}
  (function tick(){g.clearRect(0,0,W,H);for(var i=0;i<P.length;i++){var p=P[i];p.a+=p.s*(mode==='coins'?3:1);if(mode==='coins'){p.y+=p.v;p.x+=Math.sin(p.a*.3)*.6;if(p.y>H+40)P[i]=mk(true);coin(p);}else{p.y-=p.v;if(p.y<-10){P[i]=mk(false);P[i].y=H+10;}star(p);}}requestAnimationFrame(tick);})();
})();
</script>
</body>
</html>`;
}
