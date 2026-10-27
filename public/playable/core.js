// Ядро сценарных плейблов. Подключается перед сценарием; сценарий в конце
// вызывает P.boot({ start, press, qa }).
//
// Конфиг кампании — window.PLAYABLE_CONFIG (тексты, сумма, ссылка, юр. текст,
// лого, картинки). Тексты — пользовательский ввод, поэтому вставляются
// экранированными; перевод строки становится <br>.
(function () {
  "use strict";

  var CFG = window.PLAYABLE_CONFIG || {};
  var T = CFG.text || {};
  // Сцена 1080×1920 на вертикальном экране и 1920×1080 на горизонтальном:
  // в горизонтали объект встаёт слева, тексты — колонкой справа (класс .land).
  var W = 1080, H = 1920, land = false;
  var w = window;

  // ------------------------------------------------------------ сети
  // Что подложила сеть, тем и пользуемся; иначе — обычный браузер (превью,
  // свой сайт). Порядок проверок важен: Meta и Google не дают mraid, а
  // Mintegral и ironSource подкладывают свои объекты рядом с ним.
  var AD = {
    onReady: function (cb) {
      var done = false;
      function go() { if (!done) { done = true; cb(); } }
      try {
        if (w.mraid) {
          if (w.mraid.getState() === "loading") w.mraid.addEventListener("ready", go);
          else go();
          return;
        }
        if (w.dapi) { // ironSource
          if (w.dapi.isReady()) go(); else w.dapi.addEventListener("ready", go);
          return;
        }
      } catch (e) { /* дальше — как в браузере */ }
      go();
    },
    gameReady: function () { try { if (w.gameReady) w.gameReady(); } catch (e) {} }, // Mintegral
    gameEnd: function () { try { if (w.gameEnd) w.gameEnd(); } catch (e) {} }, // Mintegral
    click: function (url) {
      try {
        if (w.FbPlayableAd) return w.FbPlayableAd.onCTAClick(); // Meta
        if (w.ExitApi) return w.ExitApi.exit(); // Google Ads
        if (w.install) return w.install(); // Mintegral
        if (w.dapi && w.dapi.openStoreUrl) return w.dapi.openStoreUrl(); // ironSource
        if (w.mraid && w.mraid.open) return w.mraid.open(url); // AppLovin, Unity, Liftoff…
      } catch (e) { /* дальше — обычная вкладка */ }
      // Сцена — первый экран лендинга (iframe srcdoc того же источника): переход
      // делает страница — с событиями пикселей и параметрами её адреса (subid).
      try {
        if (w.parent !== w && typeof w.parent.__goCta === "function" && w.parent.__goCta(url)) return;
      } catch (e) { /* чужой источник — как обычно */ }
      if (url) w.open(url, "_blank");
    },
  };

  // ------------------------------------------------------------ помощники
  function $(id) { return document.getElementById(id); }
  var stage = $("stage"), fx = $("fx");

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  /** Пользовательский текст → безопасный HTML: экранируем, \n → <br>. */
  function rich(s) { return esc(s).replace(/\r?\n/g, "<br>"); }

  var onLayout = []; // сцены подписываются, если что-то ставят кодом
  function fit() {
    var vw = w.innerWidth, vh = w.innerHeight;
    var wasLand = land;
    land = vw > vh * 1.05;
    W = land ? 1920 : 1080;
    H = land ? 1080 : 1920;
    stage.classList.toggle("land", land);
    var s = Math.min(vw / W, vh / H);
    stage.style.transform = "translate(" + (vw - W * s) / 2 + "px," + (vh - H * s) / 2 + "px) scale(" + s + ")";
    if (wasLand !== land) {
      Array.prototype.forEach.call(stage.querySelectorAll(".gt:not(#popText)"), fitText);
      onLayout.forEach(function (cb) { cb(land); });
    }
  }
  w.addEventListener("resize", fit);
  w.addEventListener("orientationchange", function () { setTimeout(fit, 120); });
  fit();

  /** Точка элемента в координатах сцены (fx, fy — доли ширины и высоты; по умолчанию центр). */
  function pos(el, fx, fy) {
    var sr = stage.getBoundingClientRect(), s = sr.width / W, r = el.getBoundingClientRect();
    return {
      x: (r.left - sr.left + r.width * (fx == null ? 0.5 : fx)) / s,
      y: (r.top - sr.top + r.height * (fy == null ? 0.5 : fy)) / s,
    };
  }
  /** Точка экрана (clientX/Y) в координатах сцены. */
  function toStage(cx, cy) {
    var sr = stage.getBoundingClientRect(), s = sr.width / W;
    return { x: (cx - sr.left) / s, y: (cy - sr.top) / s };
  }

  /** Градиентный текст = слой обводки + слой заливки. html — уже безопасный. */
  function setGradText(el, html) {
    el.innerHTML = '<span class="s">' + html + '</span><span class="f">' + html + "</span>";
    fitText(el);
  }
  /** Длинный (переведённый) текст ужимается до data-max, а не вылезает за край. */
  function fitText(el) {
    var max = parseFloat(el.getAttribute("data-max"));
    if (max && el.clientWidth) max = Math.min(max, el.clientWidth * 0.94);
    var f = el.querySelector(".f");
    if (!max || !f) return;
    el.style.fontSize = "";
    var width = f.offsetWidth;
    if (width > max) el.style.fontSize = parseFloat(getComputedStyle(el).fontSize) * max / width + "px";
  }

  /**
   * Кнопка под текст. Переведённый CTA («RO'YXATDAN O'TISH») шире кнопки:
   * сначала кнопка растёт (по центру, не шире плашки попапа), потом шрифт
   * мельчает — не меньше 72% (читаемо), и лишь потом — перенос на вторую строку.
   */
  function fitButton(btn, box) {
    var lbl = btn && btn.querySelector(".lbl");
    if (!lbl || !btn.offsetWidth) return;
    btn.style.width = btn.style.left = btn.style.fontSize = "";
    lbl.style.whiteSpace = lbl.style.lineHeight = lbl.style.maxWidth = lbl.style.textAlign = "";
    var pad = 110;
    var w0 = btn.offsetWidth, center = btn.offsetLeft + w0 / 2;
    var maxW = Math.max(w0, box && box.offsetWidth ? box.offsetWidth - 80 : w0);
    var need = lbl.offsetWidth + pad;
    if (need <= w0) return;
    var w = Math.min(need, maxW);
    btn.style.width = w + "px";
    btn.style.left = center - w / 2 + "px";
    if (need <= w) return;
    var base = parseFloat(getComputedStyle(btn).fontSize);
    var size = Math.max(base * 0.72, base * (w - pad) / lbl.offsetWidth);
    btn.style.fontSize = size + "px";
    if (lbl.offsetWidth + pad > w) {
      lbl.style.whiteSpace = "normal";
      lbl.style.lineHeight = "1.05";
      lbl.style.maxWidth = w - pad + "px";
      lbl.style.textAlign = "center";
    }
  }

  function anim(el, frames, opt) {
    var o = { fill: "forwards" };
    for (var k in opt) o[k] = opt[k];
    return el.animate(frames, o);
  }
  /** Вход, который заканчивается на CSS-состоянии: после — снимаем, чтобы шли CSS-петли. */
  function animIn(el, frames, opt) {
    var o = { fill: "both" };
    for (var k in opt) o[k] = opt[k];
    var a = el.animate(frames, o);
    a.onfinish = function () { a.cancel(); };
    return a;
  }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function rnd(a, b) { return a + Math.random() * (b - a); }

  function sparks(x, y, n, o) {
    o = o || {};
    for (var i = 0; i < n; i++) {
      var s = document.createElement("div");
      s.className = "spark" + (o.cls ? " " + o.cls : "");
      s.style.left = x + (o.jx ? rnd(-o.jx, o.jx) : 0) + "px";
      s.style.top = y + (o.jy ? rnd(-o.jy, o.jy) : 0) + "px";
      var ang = (o.angle || 0) + rnd(-0.5, 0.5) * (o.spread != null ? o.spread : Math.PI * 2);
      var d = (o.dist || 170) * rnd(0.45, 1.15);
      var sc = (o.size || 1) * rnd(0.6, 1.5);
      var dx = Math.cos(ang) * d, dy = Math.sin(ang) * d + (o.gravity || 40);
      fx.appendChild(s);
      var a = s.animate([
        { transform: "translate(0,0) scale(" + sc + ")", opacity: 1 },
        { transform: "translate(" + dx + "px," + dy + "px) scale(0)", opacity: 0.3 },
      ], { duration: (o.dur || 700) * rnd(0.7, 1.3), delay: (o.delay || 0) + rnd(0, o.stagger || 0), easing: "cubic-bezier(.15,.7,.3,1)", fill: "backwards" });
      a.onfinish = s.remove.bind(s);
    }
  }

  function ripple(x, y, scale) {
    var r = document.createElement("div");
    r.className = "ripple";
    r.style.left = x + "px";
    r.style.top = y + "px";
    fx.appendChild(r);
    var a = r.animate([
      { transform: "scale(0.3)", opacity: 1 },
      { transform: "scale(" + (scale || 2.2) + ")", opacity: 0 },
    ], { duration: 550, easing: "ease-out" });
    a.onfinish = r.remove.bind(r);
  }

  function flash(peak) {
    return anim($("flash"), [{ opacity: 0 }, { opacity: peak || 0.85, offset: 0.2 }, { opacity: 0 }], { duration: 1000, easing: "ease-out" });
  }

  // ------------------------------------------------------------ стиль и ИИ-графика
  // Палитра интерфейса из выбранного стиля — через CSS-переменные.
  (function () {
    var ui = CFG.ui;
    if (!ui) return;
    var map = { g1: "--gold-1", g2: "--gold-2", g3: "--gold-3", g4: "--gold-4", ink: "--ink", accent: "--accent", rim: "--rim", plate1: "--plate-1", plate2: "--plate-2" };
    for (var k in map) if (ui[k]) stage.style.setProperty(map[k], ui[k]);
    // Гамма с картинки или пипетки (у неё есть плашки) — панели сцен тоже перекрашиваются;
    // без неё у каждой сцены свои фирменные цвета: неон автомата, красный авиатора.
    if (ui.plate1) {
      stage.classList.add("themed");
      var m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(ui.accent || "");
      if (m) stage.style.setProperty("--glow-rgb", parseInt(m[1], 16) + ", " + parseInt(m[2], 16) + ", " + parseInt(m[3], 16));
    }
  })();

  var ART = CFG.art || {}, SYMS = CFG.symbols || [];
  function aiImg(src, cls) {
    return '<img class="ai' + (cls ? " " + cls : "") + '" src="' + esc(src) + '" alt="" draggable="false">';
  }
  /** Спрайт от ИИ по ключу (door, chest, plane…) или "" — тогда сцена рисует свой вектор. */
  function art(key) { return typeof ART[key] === "string" ? ART[key] : ""; }
  /**
   * Символ: картинка из набора ИИ, если он есть, иначе вектор. order — список
   * видов символов сцены: вид с индексом i берёт i-ю картинку набора.
   */
  function sym(kind, order) {
    var i = order ? order.indexOf(kind) : -1;
    if (i >= 0 && SYMS[i]) return aiImg(SYMS[i], "aisym");
    return SYM[kind] || SYM.star;
  }

  // ------------------------------------------------------------ общее оформление
  // Встроена в промо-лендинг: лого, заголовок и юр. строку показывает страница.
  if (CFG.embed) document.documentElement.className += " embed";
  // Лого: картинка бренда или его название градиентом.
  (function () {
    var box = $("logo");
    if (!box) return;
    if (CFG.logo) {
      var im = document.createElement("img");
      im.src = CFG.logo; im.alt = "";
      box.appendChild(im);
    } else if (CFG.brandName) {
      var t = document.createElement("div");
      t.className = "gt";
      box.appendChild(t);
      setGradText(t, rich(CFG.brandName));
    }
  })();
  if ($("legal")) $("legal").innerHTML = rich(CFG.legal || "");

  // Все .gt с data-key берут текст из конфига.
  var gts = stage.querySelectorAll(".gt[data-key]");
  Array.prototype.forEach.call(gts, function (el) { setGradText(el, rich(T[el.getAttribute("data-key")] || "")); });

  // Награда в попапе: картинка от ИИ, если есть; иначе — векторное золото сценария.
  if (CFG.reward && $("popReward")) {
    $("popReward").innerHTML = "";
    var im = document.createElement("img");
    im.src = CFG.reward; im.alt = "";
    $("popReward").appendChild(im);
  }
  if ($("popBtn")) {
    $("popBtn").querySelector(".lbl").innerHTML = rich(T.cta || "");
    fitButton($("popBtn"), $("popBox"));
  }

  // ------------------------------------------------------------ подсказка
  var hintTimer = 0, ended = false;
  function setIdle(on) {
    // Игрок что-то сделал — отложенная подсказка больше не нужна: иначе она
    // включится посреди анимации (и покачивание объекта её перебьёт).
    if (!on) clearTimeout(hintTimer);
    stage.classList.toggle("idle", on);
    var hand = $("hand");
    if (hand) hand.className = "abs hand " + (on ? "on" : "");
  }
  function scheduleHint(ms) {
    clearTimeout(hintTimer);
    hintTimer = setTimeout(function () { if (!ended) setIdle(true); }, ms || 2500);
  }

  // ------------------------------------------------------------ попап
  function showPopup() {
    ended = true;
    clearTimeout(hintTimer);
    setIdle(false);
    var popup = $("popup");
    popup.classList.add("show");
    AD.gameEnd();

    animIn($("popBox"), [
      { opacity: 0, transform: "scale(0.6)" },
      { opacity: 1, transform: "scale(1.03)", offset: 0.7 },
      { opacity: 1, transform: "scale(1)" },
    ], { duration: 480, easing: "ease-out" });
    $("popBox").style.opacity = 1;
    anim($("popRays"), [{ opacity: 0 }, { opacity: 0.8 }], { duration: 700, delay: 350 });
    anim($("popReward"), [
      { opacity: 0, transform: "translateY(-260px) scale(0.6)" },
      { opacity: 1, transform: "translateY(18px) scale(1.06)", offset: 0.65 },
      { opacity: 1, transform: "none" },
    ], { duration: 650, delay: 220, easing: "ease-out" });
    var rw = pos($("popReward"));
    sparks(rw.x, rw.y, 24, { dist: 320, size: 1.4, delay: 640, dur: 900 });

    var pt = $("popText");
    var amount = Number(CFG.amount) || 0;
    var fmt = function (v) {
      try { return Math.round(v).toLocaleString(CFG.locale || "ru-RU"); } catch (e) { return String(Math.round(v)); }
    };
    var html = rich(T.bonus || "") + "<br><span class='amount'>" + fmt(amount) + "</span> " + rich(CFG.unit || "");
    setGradText(pt, html); // размер считаем по итоговой сумме…
    var amounts = pt.querySelectorAll(".amount");
    for (var i = 0; i < amounts.length; i++) amounts[i].textContent = fmt(0); // …и считаем от нуля
    anim(pt, [
      { opacity: 0, transform: "scale(0.5)" },
      { opacity: 1, transform: "scale(1.1)", offset: 0.7 },
      { opacity: 1, transform: "scale(1)" },
    ], { duration: 450, delay: 420, easing: "ease-out" });
    anim($("popBtn"), [
      { opacity: 0, transform: "translateY(90px) scale(0.8)" },
      { opacity: 1, transform: "none" },
    ], { duration: 480, delay: 800, easing: "cubic-bezier(.3,1.45,.5,1)" });

    var t0 = 0, DUR = 1000;
    function step(t) {
      if (!t0) t0 = t;
      var p = Math.min(1, (t - t0) / DUR), e = 1 - Math.pow(1 - p, 3);
      for (var j = 0; j < amounts.length; j++) amounts[j].textContent = fmt(amount * e);
      if (p < 1) requestAnimationFrame(step);
    }
    setTimeout(function () { requestAnimationFrame(step); }, 550);
    setTimeout(function () {
      popup.classList.add("cta");
      $("popHand").className = "abs hand on";
    }, 1400);
  }

  function onCta(e) {
    if (e) e.stopPropagation();
    AD.click(CFG.clickUrl);
  }
  if ($("popup")) $("popup").addEventListener("click", onCta);

  // ------------------------------------------------------------ символы
  // Общие векторные символы сцен (скретч, слот): работают без картинок.
  var SYM = {
    coin:
      '<svg viewBox="0 0 200 200"><defs><radialGradient id="scC" cx=".38" cy=".32" r=".8"><stop offset="0" stop-color="#fff6c8"/><stop offset=".4" stop-color="#ffd35a"/><stop offset="1" stop-color="#a6561a"/></radialGradient></defs>' +
      '<circle cx="100" cy="100" r="88" fill="#7a3e10"/><circle cx="100" cy="96" r="86" fill="url(#scC)"/>' +
      '<circle cx="100" cy="96" r="64" fill="none" stroke="#b9661c" stroke-width="7" opacity=".7"/>' +
      '<polygon points="100,52 113,84 148,85 121,106 131,140 100,120 69,140 79,106 52,85 87,84" fill="#b9661c"/>' +
      '<ellipse cx="72" cy="58" rx="22" ry="12" fill="#fff" opacity=".55" transform="rotate(-30 72 58)"/></svg>',
    seven:
      '<svg viewBox="0 0 200 200"><path d="M42 34h120v26L104 176H66l54-112H42z" fill="#ff3b5c" stroke="#6a0a1e" stroke-width="10" stroke-linejoin="round"/>' +
      '<path d="M54 44h92" stroke="#fff" stroke-width="8" stroke-linecap="round" opacity=".55"/></svg>',
    cherry:
      '<svg viewBox="0 0 200 200"><path d="M70 130C80 80 110 50 150 30M130 132C128 90 136 60 150 30" stroke="#2f7a1e" stroke-width="10" fill="none" stroke-linecap="round"/>' +
      '<path d="M150 30c-30-6-52 6-60 26 24 4 46-6 60-26z" fill="#4caf2e"/>' +
      '<circle cx="66" cy="140" r="40" fill="#d81b3c" stroke="#6a0a1e" stroke-width="7"/><circle cx="134" cy="142" r="40" fill="#e8264a" stroke="#6a0a1e" stroke-width="7"/>' +
      '<circle cx="52" cy="124" r="10" fill="#fff" opacity=".6"/><circle cx="120" cy="126" r="10" fill="#fff" opacity=".6"/></svg>',
    diamond:
      '<svg viewBox="0 0 200 200"><polygon points="50,40 150,40 186,84 100,176 14,84" fill="#2aa8ff" stroke="#0a3a6a" stroke-width="8" stroke-linejoin="round"/>' +
      '<polygon points="50,40 76,84 14,84" fill="#8fd6ff"/><polygon points="150,40 124,84 186,84" fill="#1a7fd0"/>' +
      '<polygon points="76,84 124,84 100,176" fill="#5cc4ff"/><polygon points="50,40 150,40 124,84 76,84" fill="#bfe8ff"/></svg>',
    bell:
      '<svg viewBox="0 0 200 200"><defs><linearGradient id="scB" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff2b0"/><stop offset=".5" stop-color="#f0b03a"/><stop offset="1" stop-color="#9a4d10"/></linearGradient></defs>' +
      '<path d="M100 24c-40 0-56 34-56 70 0 30-16 44-24 54h160c-8-10-24-24-24-54 0-36-16-70-56-70z" fill="url(#scB)" stroke="#6a3008" stroke-width="8" stroke-linejoin="round"/>' +
      '<circle cx="100" cy="166" r="18" fill="#c9781e" stroke="#6a3008" stroke-width="7"/><circle cx="100" cy="20" r="10" fill="#c9781e"/></svg>',
    bar:
      '<svg viewBox="0 0 200 200"><defs><linearGradient id="scBar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a3a46"/><stop offset="1" stop-color="#0c0c12"/></linearGradient></defs>' +
      '<rect x="18" y="62" width="164" height="76" rx="14" fill="url(#scBar)" stroke="#f2c26a" stroke-width="8"/>' +
      '<rect x="34" y="78" width="132" height="44" rx="8" fill="none" stroke="#f2c26a" stroke-width="4" opacity=".6"/>' +
      '<text x="100" y="114" text-anchor="middle" font-family="PInter, Arial, sans-serif" font-weight="900" font-size="46" fill="#ffd45c">BAR</text></svg>',
    star:
      '<svg viewBox="0 0 200 200"><defs><radialGradient id="scS" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="#fffbe0"/><stop offset=".45" stop-color="#ffd23c"/><stop offset="1" stop-color="#c46a10"/></radialGradient></defs>' +
      '<polygon points="100,14 124,72 188,76 138,116 154,180 100,144 46,180 62,116 12,76 76,72" fill="url(#scS)" stroke="#7a3a08" stroke-width="8" stroke-linejoin="round"/>' +
      '<polygon points="100,40 112,76 84,76" fill="#fff" opacity=".55"/></svg>',
  };

  // ------------------------------------------------------------ запуск
  w.P = {
    CFG: CFG, T: T, AD: AD, stage: stage, pos: pos, toStage: toStage,
    isLand: function () { return land; },
    /** Сцена ставит что-то кодом по координатам — перестроить при повороте экрана. */
    onLayout: function (cb) { onLayout.push(cb); },
    $: $, rich: rich, setGradText: setGradText, fitText: fitText, fitButton: fitButton,
    anim: anim, animIn: animIn, wait: wait, rnd: rnd, sparks: sparks, ripple: ripple, flash: flash,
    setIdle: setIdle, scheduleHint: scheduleHint, showPopup: showPopup, SYM: SYM,
    art: art, sym: sym, aiImg: aiImg,
    isEnded: function () { return ended; },
    boot: function (scene) {
      var started = false;
      // Сумму в попапе меряет сам попап — по итоговой цифре, не по счётчику.
      // Шрифт догрузился или сменилась ориентация — тексты и кнопка попапа меряются заново.
      function refit() { Array.prototype.forEach.call(stage.querySelectorAll(".gt:not(#popText)"), fitText); fitButton($("popBtn"), $("popBox")); }
      function start() {
        if (started) return;
        started = true;
        fit();
        refit();
        // В песочнице (превью без allow-same-origin) шрифт применяется позже,
        // чем о нём сообщает браузер, — перемеряем ещё пару раз.
        setTimeout(refit, 400); setTimeout(refit, 1200); setTimeout(refit, 3000);
        stage.classList.remove("loading");
        scene.start();
        AD.gameReady();
        // QA: ?state=N прокручивает сценарий до нужного шага.
        var m = /[?&]state=(\w+)/.exec(location.search);
        if (m && scene.qa) setTimeout(function () { scene.qa(m[1]); }, 400);
      }
      function onPress(e) {
        if (!started || ended) return;
        if (e && e.cancelable) e.preventDefault();
        if (scene.press) scene.press(e);
      }
      if (w.PointerEvent) stage.addEventListener("pointerdown", onPress);
      else {
        stage.addEventListener("touchstart", onPress, { passive: false });
        stage.addEventListener("mousedown", onPress);
      }
      AD.onReady(function () {
        // fonts.ready может разрешиться раньше, чем браузер вообще запросит
        // шрифт, — тогда текст замерится по запасному Arial и потом вылезет.
        // Грузим оба набора явно и перемеряем, когда шрифт всё-таки догрузится.
        var fonts = Promise.resolve();
        if (document.fonts && document.fonts.load) {
          fonts = Promise.all([
            document.fonts.load('900 80px "PInter"', "Aa"),
            document.fonts.load('900 80px "PInter"', "Яя"),
          ]).then(function () { return document.fonts.ready; });
          if (document.fonts.addEventListener) document.fonts.addEventListener("loadingdone", refit);
        }
        var loaded = document.readyState === "complete" ? Promise.resolve() : new Promise(function (r) { w.addEventListener("load", r); });
        Promise.all([fonts, loaded]).then(start, start);
        setTimeout(start, 2500); // медленный шрифт не должен оставить экран пустым
      });
    },
  };
})();
