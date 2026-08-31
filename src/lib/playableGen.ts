// Playable-ads model + client-side "generation".
//
// A playable is a mini interactive HTML5 ad. There is no playable engine on the
// backend yet, so we assemble a self-contained, genuinely interactive HTML doc
// (real slot spin / wheel / scratch / quiz / match-3) from the form inputs and
// return it as an HTML string for the preview iframe / download. `generatePlayable`
// is async so the flow mirrors the other generators; a real POST /api/playable
// can replace the body later.
//
// The game code lives in RUNTIME as a plain string (not a typed function): it is
// injected into a <script> and executed inside the sandboxed iframe. Keeping it a
// string avoids TypeScript DOM-null friction and any template-literal `${}` clash
// with this module's own template literals. RUNTIME must contain NO backticks and
// NO `${` sequences.

export type PlayableMechanic = "slot" | "wheel" | "crash" | "scratch" | "quiz" | "match3";

export const PLAYABLE_MECHANICS: {
  id: PlayableMechanic;
  label: string;
  description: string;
}[] = [
  { id: "slot", label: "Демо слота", description: "Вращение барабанов с символами бренда" },
  { id: "wheel", label: "Колесо фортуны", description: "Крутить колесо и выиграть приз" },
  { id: "crash", label: "Crash-игра", description: "Множитель растёт — успей забрать до краха" },
  { id: "scratch", label: "Скретч-карта", description: "Стереть слой и открыть приз" },
  { id: "quiz", label: "Квиз / Викторина", description: "Вопрос с вариантами → оффер" },
  { id: "match3", label: "Мини-матч (Match-3)", description: "Собери совпадения — демо-геймплей" },
];

export const PLAYABLE_MECHANIC_BY_ID = new Map(PLAYABLE_MECHANICS.map((m) => [m.id, m]));

export const PLAYABLE_RATIOS: { id: string; label: string }[] = [
  { id: "9:16", label: "Портрет 9:16" },
  { id: "16:9", label: "Ландшафт 16:9" },
  { id: "1:1", label: "Квадрат 1:1" },
];

export const PLAYABLE_DURATIONS: { id: "short" | "medium"; label: string }[] = [
  { id: "short", label: "Короткая · 5–10 сек" },
  { id: "medium", label: "Средняя · 15–20 сек" },
];

export type PlayableInput = {
  mechanic: PlayableMechanic;
  offer: string;
  brandName: string;
  brandLogo: string;
  language: string;
  accent: string;
  alwaysWin: boolean;
  ctaText: string;
  duration: "short" | "medium";
  ratio: string;
  // mechanic-specific
  reels: number;
  slotSymbols: string[];
  wheelPrizes: string[];
  scratchPrize: string;
  quizQuestion: string;
  quizAnswers: string[];
  quizCorrect: number;
  match3Moves: number;
};

export type PlayableResult = { html: string };

type Copy = {
  spin: string;
  youWon: string;
  scratchHint: string;
  movesLabel: string;
  claim: string;
  defaultPrize: string;
  cashout: string;
  retry: string;
};

function playCopy(lang: string): Copy {
  const base = lang === "en" ? "en" : lang === "uk" ? "uk" : "ru";
  const dict: Record<"ru" | "uk" | "en", Copy> = {
    ru: {
      spin: "Крутить",
      youWon: "Вы выиграли!",
      scratchHint: "Сотрите поле пальцем",
      movesLabel: "Ходы",
      claim: "Забрать бонус",
      defaultPrize: "Ваш бонус",
      cashout: "Забрать",
      retry: "Ещё раз",
    },
    uk: {
      spin: "Крутити",
      youWon: "Ви виграли!",
      scratchHint: "Зітріть поле пальцем",
      movesLabel: "Ходи",
      claim: "Забрати бонус",
      defaultPrize: "Ваш бонус",
      cashout: "Забрати",
      retry: "Ще раз",
    },
    en: {
      spin: "Spin",
      youWon: "You won!",
      scratchHint: "Scratch the field",
      movesLabel: "Moves",
      claim: "Claim bonus",
      defaultPrize: "Your bonus",
      cashout: "Cash out",
      retry: "Play again",
    },
  };
  return dict[base];
}

// The interactive game runtime. Plain JS string — NO backticks, NO `${`.
const RUNTIME =
  "function run(DATA){\n" +
  "  function $(id){ return document.getElementById(id); }\n" +
  "  function el(tag, cls){ var e=document.createElement(tag); if(cls) e.className=cls; return e; }\n" +
  "  var stage=$('stage');\n" +
  "  var I=DATA.i;\n" +
  "  var brand=$('brand');\n" +
  "  if(DATA.logo){ var im=el('img'); im.src=DATA.logo; im.alt=''; brand.appendChild(im); }\n" +
  "  else if(DATA.brand){ brand.textContent=DATA.brand; }\n" +
  "  function showEnd(prize){ $('endTitle').textContent=I.youWon; $('endPrize').textContent=prize||DATA.offer; $('ctaBtn').textContent=DATA.cta; $('end').removeAttribute('hidden'); }\n" +
  "  $('ctaBtn').addEventListener('click', function(){ $('ctaBtn').textContent='\\u2197 '+DATA.cta; });\n" +
  "  function setSym(node, s){ if(/^data:|^https?:/.test(s)){ node.innerHTML=''; var i2=el('img'); i2.src=s; node.appendChild(i2); } else { node.textContent=s; } }\n" +
  "  function slot(){\n" +
  "    var wrap=el('div','slot'); var reels=el('div','reels'); wrap.appendChild(reels);\n" +
  "    var n=DATA.reels||3; var syms=(DATA.symbols&&DATA.symbols.length)?DATA.symbols:['\\uD83C\\uDF52','\\u2B50','7\\uFE0F\\u20E3','\\uD83D\\uDD14','\\uD83C\\uDF4B','\\uD83D\\uDC8E'];\n" +
  "    var cells=[]; for(var i=0;i<n;i++){ var r=el('div','reel'); var s=el('div','sym'); setSym(s, syms[i%syms.length]); r.appendChild(s); reels.appendChild(r); cells.push(s); }\n" +
  "    var btn=el('button','play'); btn.textContent=I.spin; wrap.appendChild(btn); stage.appendChild(wrap);\n" +
  "    var spinning=false;\n" +
  "    btn.addEventListener('click', function(){ if(spinning) return; spinning=true; btn.disabled=true; var basems=DATA.duration==='medium'?1500:900;\n" +
  "      for(var j=0;j<n;j++){ (function(idx, cell){ var iv=setInterval(function(){ setSym(cell, syms[Math.floor(Math.random()*syms.length)]); }, 80);\n" +
  "        setTimeout(function(){ clearInterval(iv); var fin=DATA.alwaysWin?syms[0]:syms[Math.floor(Math.random()*syms.length)]; setSym(cell, fin); cell.className='sym pop';\n" +
  "          if(idx===n-1){ setTimeout(function(){ showEnd(DATA.offer); }, 450); } }, basems+idx*260); })(j, cells[j]); } });\n" +
  "  }\n" +
  "  function wheel(){\n" +
  "    var prizes=(DATA.prizes&&DATA.prizes.length)?DATA.prizes:['+50 FS','x2','+100%','\\uD83C\\uDF81','+20 FS','JACKPOT'];\n" +
  "    var n=prizes.length, seg=360/n; var wrap=el('div','wheel-wrap'); var ptr=el('div','pointer'); wrap.appendChild(ptr); var w=el('div','wheel');\n" +
  "    var stops=[]; for(var i=0;i<n;i++){ stops.push((i%2?'#20271a':'#2f3a20')+' '+(i*seg)+'deg '+((i+1)*seg)+'deg'); }\n" +
  "    w.style.background='conic-gradient('+stops.join(',')+')';\n" +
  "    for(var k=0;k<n;k++){ var lab=el('div','wlabel'); lab.style.transform='rotate('+(k*seg+seg/2)+'deg)'; var sp=el('span'); sp.textContent=prizes[k]; lab.appendChild(sp); w.appendChild(lab); }\n" +
  "    wrap.appendChild(w); var btn=el('button','play'); btn.textContent=I.spin; wrap.appendChild(btn); stage.appendChild(wrap);\n" +
  "    var spun=false; var secs=DATA.duration==='medium'?4:3.2;\n" +
  "    btn.addEventListener('click', function(){ if(spun) return; spun=true; btn.disabled=true; var win=DATA.alwaysWin?0:Math.floor(Math.random()*n); var rot=360*5+(360-(win*seg+seg/2));\n" +
  "      w.style.transition='transform '+secs+'s cubic-bezier(.15,.7,.25,1)'; w.style.transform='rotate('+rot+'deg)'; setTimeout(function(){ showEnd(prizes[win]); }, secs*1000+300); });\n" +
  "  }\n" +
  "  function scratch(){\n" +
  "    var wrap=el('div','scratch'); var prize=el('div','prizeText'); prize.textContent=DATA.scratchPrize||DATA.offer; wrap.appendChild(prize);\n" +
  "    var cv=el('canvas'); wrap.appendChild(cv); var hint=el('p','hint'); hint.textContent=I.scratchHint; wrap.appendChild(hint); stage.appendChild(wrap);\n" +
  "    var ctx=cv.getContext('2d'); var done=false, drawing=false;\n" +
  "    function cover(){ var r=wrap.getBoundingClientRect(); cv.width=r.width; cv.height=Math.max(140, r.height); ctx.globalCompositeOperation='source-over'; ctx.fillStyle='#3a4230'; ctx.fillRect(0,0,cv.width,cv.height); ctx.fillStyle='#aeb6a2'; ctx.font='bold 15px sans-serif'; ctx.textAlign='center'; ctx.fillText(I.scratchHint, cv.width/2, cv.height/2); }\n" +
  "    cover();\n" +
  "    function pos(e){ var r=cv.getBoundingClientRect(); var t=(e.touches&&e.touches[0])?e.touches[0]:e; return {x:t.clientX-r.left, y:t.clientY-r.top}; }\n" +
  "    function pct(){ var d=ctx.getImageData(0,0,cv.width,cv.height).data; var c=0, tot=d.length/4; for(var i=3;i<d.length;i+=4){ if(d[i]===0) c++; } return c/tot; }\n" +
  "    function move(e){ if(!drawing||done) return; if(e.cancelable) e.preventDefault(); var p=pos(e); ctx.globalCompositeOperation='destination-out'; ctx.beginPath(); ctx.arc(p.x,p.y,24,0,7); ctx.fill(); if(pct()>0.5){ done=true; ctx.clearRect(0,0,cv.width,cv.height); setTimeout(function(){ showEnd(DATA.scratchPrize||DATA.offer); }, 350); } }\n" +
  "    cv.addEventListener('mousedown', function(){ drawing=true; }); window.addEventListener('mouseup', function(){ drawing=false; });\n" +
  "    cv.addEventListener('mousemove', move); cv.addEventListener('touchstart', function(e){ drawing=true; move(e); }); cv.addEventListener('touchmove', move); cv.addEventListener('touchend', function(){ drawing=false; });\n" +
  "  }\n" +
  "  function quiz(){\n" +
  "    var wrap=el('div','quiz'); var q=el('h3','q'); q.textContent=DATA.question||DATA.offer; wrap.appendChild(q); var opts=el('div','opts');\n" +
  "    var answers=(DATA.answers&&DATA.answers.length)?DATA.answers:['\\u0414\\u0430!','\\u041F\\u043E\\u0437\\u0436\\u0435','\\u041D\\u0435\\u0442']; var answered=false;\n" +
  "    for(var i=0;i<answers.length;i++){ (function(idx){ var b=el('button','opt'); b.textContent=answers[idx];\n" +
  "      b.addEventListener('click', function(){ if(answered) return; answered=true; var corr=DATA.alwaysWin?idx:((typeof DATA.correct==='number')?DATA.correct:0); var bs=opts.querySelectorAll('.opt');\n" +
  "        for(var j=0;j<bs.length;j++){ bs[j].disabled=true; } if(bs[corr]) bs[corr].className='opt right'; if(idx!==corr) b.className='opt wrong'; setTimeout(function(){ showEnd(DATA.offer); }, 800); });\n" +
  "      opts.appendChild(b); })(i); }\n" +
  "    wrap.appendChild(opts); stage.appendChild(wrap);\n" +
  "  }\n" +
  "  function match3(){\n" +
  "    var pal=['\\uD83C\\uDF52','\\u2B50','\\uD83D\\uDC8E','\\uD83D\\uDD14','\\uD83C\\uDF4B']; var cols=5, rows=5, moves=DATA.moves||8;\n" +
  "    var wrap=el('div','m3'); var hud=el('div','hud'); var ml=el('span'); ml.textContent=I.movesLabel+': '+moves; hud.appendChild(ml); wrap.appendChild(hud);\n" +
  "    var grid=el('div','grid'); grid.style.gridTemplateColumns='repeat('+cols+',1fr)'; var data=[]; function rnd(){ return pal[Math.floor(Math.random()*pal.length)]; }\n" +
  "    for(var i=0;i<cols*rows;i++){ data.push(rnd()); }\n" +
  "    function neighbors(idx){ var r=Math.floor(idx/cols), c=idx%cols, out=[]; if(c>0)out.push(idx-1); if(c<cols-1)out.push(idx+1); if(r>0)out.push(idx-cols); if(r<rows-1)out.push(idx+cols); return out; }\n" +
  "    function render(){ grid.innerHTML=''; for(var i=0;i<data.length;i++){ (function(idx){ var t=el('button','tile'); t.textContent=data[idx]; t.addEventListener('click', function(){ pop(idx); }); grid.appendChild(t); })(i); } }\n" +
  "    function pop(idx){ if(moves<=0) return; var sym=data[idx]; var seen={}, stack=[idx], group=[]; while(stack.length){ var cur=stack.pop(); if(seen[cur]) continue; seen[cur]=1; if(data[cur]===sym){ group.push(cur); var nb=neighbors(cur); for(var k=0;k<nb.length;k++){ if(!seen[nb[k]]) stack.push(nb[k]); } } }\n" +
  "      for(var g=0;g<group.length;g++){ data[group[g]]=rnd(); } moves--; ml.textContent=I.movesLabel+': '+moves; render(); if(moves<=0){ setTimeout(function(){ showEnd(DATA.offer); }, 400); } }\n" +
  "    render(); wrap.appendChild(grid); stage.appendChild(wrap);\n" +
  "  }\n" +
  "  function crash(){\n" +
  "    var wrap=el('div','crash'); var graph=el('div','crashGraph'); var rocket=el('div','rocket'); rocket.textContent='\\uD83D\\uDE80';\n" +
  "    var mult=el('div','mult'); mult.textContent='1.00x'; mult.setAttribute('data-m','1.00'); graph.appendChild(rocket); graph.appendChild(mult); wrap.appendChild(graph);\n" +
  "    var btn=el('button','play cashout'); btn.textContent=I.cashout; wrap.appendChild(btn); stage.appendChild(wrap);\n" +
  "    var raf=0, done=false, crashed=false;\n" +
  "    var crashAt=DATA.alwaysWin?(3+Math.random()*7):(1.4+Math.random()*4.6);\n" +
  "    var t0=Date.now();\n" +
  "    function tick(){ if(done) return; var dt=(Date.now()-t0)/1000; var m=Math.pow(1.0718, dt*10);\n" +
  "      if(m>=crashAt){ boom(); return; } mult.textContent=m.toFixed(2)+'x'; mult.setAttribute('data-m', m.toFixed(2));\n" +
  "      var p=Math.min(1,(m-1)/9); rocket.style.transform='translate('+(p*150)+'px,'+(-p*150)+'px) rotate(8deg)';\n" +
  "      raf=requestAnimationFrame(tick); }\n" +
  "    function cashOut(){ if(done||crashed) return; done=true; if(raf) cancelAnimationFrame(raf); btn.disabled=true; mult.className='mult win';\n" +
  "      var cur=mult.getAttribute('data-m')||'1.00'; setTimeout(function(){ showEnd(cur+'x \\u2014 '+DATA.offer); }, 550); }\n" +
  "    function boom(){ crashed=true; if(raf) cancelAnimationFrame(raf); mult.textContent='\\uD83D\\uDCA5 '+crashAt.toFixed(2)+'x'; mult.className='mult bust'; rocket.style.opacity='0';\n" +
  "      btn.disabled=false; btn.className='play retry'; btn.textContent=I.retry; btn.onclick=function(){ wrap.remove(); crash(); }; }\n" +
  "    btn.addEventListener('click', function(){ if(!crashed) cashOut(); });\n" +
  "    raf=requestAnimationFrame(tick);\n" +
  "  }\n" +
  "  var games={ slot:slot, wheel:wheel, crash:crash, scratch:scratch, quiz:quiz, match3:match3 };\n" +
  "  (games[DATA.mechanic]||slot)();\n" +
  "}\n";

function css(accent: string): string {
  return (
    ":root{--accent:" +
    accent +
    "}*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}" +
    "html,body{height:100%}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:radial-gradient(120% 80% at 50% 0,#151a10,#0a0d0a);color:#f5f7f2;overflow:hidden}" +
    ".ad{position:relative;height:100vh;display:flex;flex-direction:column;align-items:center}" +
    ".brandbar{width:100%;padding:12px 16px;display:flex;align-items:center;gap:8px;font-weight:800;min-height:26px}" +
    ".brandbar img{height:26px;max-width:130px;object-fit:contain;background:#fff;border-radius:6px;padding:3px 6px}" +
    ".stage{flex:1;width:100%;display:flex;align-items:center;justify-content:center;padding:14px}" +
    ".play{margin-top:22px;background:var(--accent);color:#0a0d0a;font-weight:800;border:0;border-radius:12px;padding:14px 30px;font-size:16px;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.4)}.play:disabled{opacity:.55;cursor:default}" +
    ".slot{display:flex;flex-direction:column;align-items:center}.reels{display:flex;gap:10px}.reel{width:72px;height:72px;background:#12160f;border:2px solid #2c3424;border-radius:12px;display:flex;align-items:center;justify-content:center;overflow:hidden}.sym{font-size:40px;line-height:1}.sym img{width:46px;height:46px;object-fit:contain}.sym.pop{animation:pop .4s}@keyframes pop{0%{transform:scale(.6)}60%{transform:scale(1.2)}100%{transform:scale(1)}}" +
    ".wheel-wrap{position:relative;display:flex;flex-direction:column;align-items:center}.pointer{position:absolute;top:-4px;left:50%;transform:translateX(-50%);border-left:11px solid transparent;border-right:11px solid transparent;border-top:20px solid var(--accent);z-index:3}.wheel{width:228px;height:228px;border-radius:50%;border:6px solid #2c3424;position:relative;transform:rotate(0)}.wlabel{position:absolute;inset:0;display:flex;justify-content:center;padding-top:14px}.wlabel span{color:#fff;font-size:11px;font-weight:700}" +
    ".scratch{position:relative;width:260px;height:170px;border-radius:16px;overflow:hidden;border:2px solid #2c3424}.prizeText{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800;color:var(--accent);text-align:center;padding:12px}.scratch canvas{position:absolute;inset:0;touch-action:none;cursor:grab}.scratch .hint{position:absolute;bottom:8px;width:100%;text-align:center;font-size:12px;color:#0a0d0a;font-weight:600;pointer-events:none}" +
    ".quiz{width:100%;max-width:320px;padding:12px}.quiz .q{font-size:18px;margin-bottom:16px;text-align:center}.opts{display:flex;flex-direction:column;gap:10px}.opt{background:#12160f;border:1px solid #2c3424;color:#f5f7f2;border-radius:12px;padding:14px;font-size:15px;cursor:pointer;text-align:left}.opt.right{border-color:var(--accent);background:rgba(212,255,61,.14);color:var(--accent)}.opt.wrong{border-color:#7f1d1d;opacity:.6}" +
    ".m3{display:flex;flex-direction:column;align-items:center;gap:12px}.hud{font-weight:700;color:var(--accent)}.grid{display:grid;gap:6px}.tile{width:44px;height:44px;font-size:24px;background:#12160f;border:1px solid #2c3424;border-radius:10px;cursor:pointer;display:flex;align-items:center;justify-content:center}.tile:active{transform:scale(.92)}" +
    ".crash{display:flex;flex-direction:column;align-items:center;width:100%;max-width:320px}.crashGraph{position:relative;width:100%;height:210px;border:2px solid #2c3424;border-radius:16px;overflow:hidden;background:radial-gradient(130% 110% at 0% 100%, rgba(212,255,61,.14), transparent 60%),#0e1209;display:flex;align-items:center;justify-content:center}.rocket{position:absolute;left:14px;bottom:12px;font-size:34px;transition:transform .06s linear}.mult{font-size:46px;font-weight:900;color:var(--accent);text-shadow:0 2px 12px rgba(0,0,0,.55)}.mult.win{color:#4ade80}.mult.bust{color:#f87171}.cashout{animation:pulse 1.1s infinite}@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}" +
    ".end{position:absolute;inset:0;background:rgba(8,10,7,.88);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:22px;z-index:5}.end[hidden]{display:none}.end-card{text-align:center;max-width:300px;animation:rise .4s}@keyframes rise{from{transform:translateY(16px);opacity:0}to{transform:translateY(0);opacity:1}}.win-badge{font-size:44px}.end-card h2{font-size:26px;margin:8px 0}.end-card #endPrize{color:var(--accent);font-size:18px;font-weight:700;margin-bottom:20px}.end .cta{background:var(--accent);color:#0a0d0a;font-weight:800;border:0;border-radius:12px;padding:15px 32px;font-size:16px;cursor:pointer;width:100%}"
  );
}

export function buildPlayableHtml(input: PlayableInput): string {
  const c = playCopy(input.language);
  const accent = /^#[0-9a-fA-F]{3,8}$/.test(input.accent) ? input.accent : "#d4ff3d";
  const data = {
    mechanic: input.mechanic,
    brand: input.brandName || "",
    logo: input.brandLogo || "",
    offer: input.offer.trim() || c.defaultPrize,
    cta: input.ctaText.trim() || c.claim,
    accent,
    alwaysWin: input.alwaysWin,
    duration: input.duration,
    reels: input.reels,
    symbols: input.slotSymbols.filter(Boolean),
    prizes: input.wheelPrizes.map((p) => p.trim()).filter(Boolean),
    scratchPrize: input.scratchPrize.trim(),
    question: input.quizQuestion.trim(),
    answers: input.quizAnswers.map((a) => a.trim()).filter(Boolean),
    correct: input.quizCorrect,
    moves: input.match3Moves,
    i: c,
  };
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  const lang = input.language === "en" ? "en" : input.language === "uk" ? "uk" : "ru";
  return (
    "<!doctype html><html lang=\"" +
    lang +
    "\"><head><meta charset=\"utf-8\"/><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"/><style>" +
    css(accent) +
    "</style></head><body><div class=\"ad\">" +
    "<div class=\"brandbar\"><span id=\"brand\"></span></div>" +
    "<div class=\"stage\" id=\"stage\"></div>" +
    "<div class=\"end\" id=\"end\" hidden><div class=\"end-card\"><div class=\"win-badge\" id=\"winBadge\">🎉</div><h2 id=\"endTitle\"></h2><p id=\"endPrize\"></p><button class=\"cta\" id=\"ctaBtn\"></button></div></div>" +
    "</div><script>(" +
    RUNTIME +
    ")(" +
    json +
    ");</script></body></html>"
  );
}

export function generatePlayable(input: PlayableInput): Promise<PlayableResult> {
  return new Promise((resolve) => {
    const html = buildPlayableHtml(input);
    setTimeout(() => resolve({ html }), 900);
  });
}
