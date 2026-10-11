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
  var W = 1080, H = 1920;
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

  function fit() {
    var vw = w.innerWidth, vh = w.innerHeight;
    var s = Math.min(vw / W, vh / H);
    stage.style.transform = "translate(" + (vw - W * s) / 2 + "px," + (vh - H * s) / 2 + "px) scale(" + s + ")";
  }
  w.addEventListener("resize", fit);
  w.addEventListener("orientationchange", function () { setTimeout(fit, 120); });
  fit();

  /** Градиентный текст = слой обводки + слой заливки. html — уже безопасный. */
  function setGradText(el, html) {
    el.innerHTML = '<span class="s">' + html + '</span><span class="f">' + html + "</span>";
    fitText(el);
  }
  /** Длинный (переведённый) текст ужимается до data-max, а не вылезает за край. */
  function fitText(el) {
    var max = parseFloat(el.getAttribute("data-max"));
    var f = el.querySelector(".f");
    if (!max || !f) return;
    el.style.fontSize = "";
    var width = f.offsetWidth;
    if (width > max) el.style.fontSize = parseFloat(getComputedStyle(el).fontSize) * max / width + "px";
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

  // ------------------------------------------------------------ общее оформление
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
  if ($("popBtn")) $("popBtn").querySelector(".lbl").innerHTML = rich(T.cta || "");

  // ------------------------------------------------------------ подсказка
  var hintTimer = 0, ended = false;
  function setIdle(on) {
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
    sparks(540, 730, 24, { dist: 320, size: 1.4, delay: 640, dur: 900 });

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

  // ------------------------------------------------------------ запуск
  w.P = {
    CFG: CFG, T: T, AD: AD, W: W, H: H, stage: stage,
    $: $, rich: rich, setGradText: setGradText, fitText: fitText,
    anim: anim, animIn: animIn, wait: wait, rnd: rnd, sparks: sparks, ripple: ripple, flash: flash,
    setIdle: setIdle, scheduleHint: scheduleHint, showPopup: showPopup,
    isEnded: function () { return ended; },
    boot: function (scene) {
      var started = false;
      // Сумму в попапе меряет сам попап — по итоговой цифре, не по счётчику.
      function refit() { Array.prototype.forEach.call(stage.querySelectorAll(".gt:not(#popText)"), fitText); }
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
