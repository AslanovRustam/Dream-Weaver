// Сценарий «Слот». Первый спин: две семёрки на линии, третий барабан
// подсвечивается, тянет — и семёрка застревает на ряд выше линии («почти!»).
// Второй спин: 7·7·7, линия мигает, корпус пульсирует, монеты — и попап.
//
// Барабан — лента символов. Под каждый спин лента собирается заново:
// видимые сейчас три символа + наполнитель + итоговые три, и едет вверх до
// итоговых. Так исход задан заранее, а вращение выглядит честным.
(function (P) {
  "use strict";
  var $ = P.$, T = P.T, anim = P.anim, animIn = P.animIn, sparks = P.sparks, ripple = P.ripple, flash = P.flash;
  var SYM = P.SYM;
  var SPINS = 2, H = 200;
  var WIN = "seven";
  // ИИ-набор символов идёт в этом порядке: [0] — джекпот (семёрка).
  var ORDER = ["seven", "cherry", "bell", "bar", "diamond", "star"];
  var FILL = ["cherry", "bell", "bar", "diamond", "star", "cherry", "bell", "bar", "diamond", "star"];
  /** Точка на линии выигрыша барабана i (row: 0 — верхний ряд, 1 — линия). */
  function on(i, row) { return P.pos($("reel" + i), 0.5, row == null ? 0.5 : (row + 0.5) / 3); }

  var stage = P.stage, label = $("label"), tapText = $("tapText");
  var reels = [0, 1, 2].map(function (i) { return $("reel" + i); });
  var strips = reels.map(function (r) { return r.querySelector(".strip"); });

  // ---- огни по верху
  (function () {
    var box = $("slBulbs");
    for (var i = 0; i < 14; i++) {
      var b = document.createElement("i");
      b.style.left = 30 + i * (720 / 13) + "px";
      box.appendChild(b);
    }
  })();

  function cell(name) {
    var d = document.createElement("div");
    d.className = "sym";
    d.innerHTML = P.sym(name, ORDER);
    return d;
  }
  function pick() { return FILL[(Math.random() * FILL.length) | 0]; }

  // Что видно сейчас: верх, линия, низ по каждому барабану.
  var shown = [["bell", "cherry", "bar"], ["diamond", "bell", "star"], ["star", "bar", "cherry"]];
  shown.forEach(function (col, i) { col.forEach(function (n) { strips[i].appendChild(cell(n)); }); });

  label.textContent = (T.spinsLeft || "") + SPINS;

  function ease(p) { return 1 - Math.pow(1 - p, 3); }

  /** Прокрутить барабан к итоговым трём символам; промис — когда встал. */
  function spinReel(i, finals, fill, dur) {
    var strip = strips[i], reel = reels[i];
    strip.innerHTML = "";
    var names = shown[i].concat(Array.apply(null, Array(fill)).map(pick), finals);
    var cells = names.map(function (n) { var c = cell(n); strip.appendChild(c); return c; });
    var dist = (names.length - 3) * H;
    reel.classList.add("blur");
    return new Promise(function (resolve) {
      var t0 = 0;
      function frame(t) {
        if (!t0) t0 = t;
        var p = Math.min(1, (t - t0) / dur);
        strip.style.transform = "translateY(" + (-dist * ease(p)).toFixed(1) + "px)";
        if (p > 0.82) reel.classList.remove("blur");
        if (p < 1) return requestAnimationFrame(frame);
        // Отскок: лента проскакивает на чуть-чуть и возвращается.
        strip.animate([
          { transform: "translateY(" + (-dist + 26) + "px)" },
          { transform: "translateY(" + (-dist - 8) + "px)" },
          { transform: "translateY(" + -dist + "px)" },
        ], { duration: 260, easing: "ease-out" });
        shown[i] = finals.slice();
        resolve(cells.slice(-3));
      }
      requestAnimationFrame(frame);
    });
  }

  function pullLever() {
    animIn($("leverArm"), [
      { transform: "scaleY(1)" }, { transform: "scaleY(-0.55)", offset: 0.4 }, { transform: "scaleY(1)" },
    ], { duration: 700, easing: "ease-in-out" });
  }

  // ---- игра
  var spins = 0, busy = false, done = false;

  function press() {
    if (busy || done || spins >= SPINS) return;
    busy = true;
    spins++;
    P.setIdle(false);
    stage.classList.add("spinning");
    pullLever();
    animIn(tapText, [{ transform: "scale(1.12)" }, { transform: "scale(1)" }], { duration: 300 });
    label.textContent = (T.spinsLeft || "") + (SPINS - spins);

    var near = spins === 1;
    var finals = near
      ? [["cherry", WIN, "bell"], ["bar", WIN, "diamond"], [WIN, "star", "cherry"]] // третья семёрка — на ряд выше линии
      : [["bell", WIN, "bar"], ["diamond", WIN, "cherry"], ["star", WIN, "bell"]];

    var r0 = spinReel(0, finals[0], 14, 1300);
    var r1 = spinReel(1, finals[1], 20, 1800);
    // Третий барабан ждёт, пока встанут первые два, и докручивает с подсветкой.
    var r2 = spinReel(2, finals[2], 34, 3200);
    r1.then(function () {
      reels[2].classList.add("tease");
      sparks(on(1).x, on(1).y, 8, { dist: 120, size: 0.8 });
    });
    r0.then(function () { sparks(on(0).x, on(0).y, 8, { dist: 120, size: 0.8 }); });

    Promise.all([r0, r1, r2]).then(function (cells) {
      reels[2].classList.remove("tease");
      stage.classList.remove("spinning");
      if (near) {
        animIn($("machine"), [
          { transform: "none" }, { transform: "translateX(-10px)" }, { transform: "translateX(8px)" },
          { transform: "translateX(-4px)" }, { transform: "none" },
        ], { duration: 380, easing: "ease-out" });
        sparks(on(2, 0).x, on(2, 0).y, 12, { cls: "dust", dist: 140, gravity: 90 });
        P.setGradText(tapText, P.rich(T.tryAgain || ""));
        busy = false;
        P.scheduleHint(1600);
      } else {
        win(cells.map(function (c) { return c[1]; }));
      }
    });
  }

  function win(lineCells) {
    done = true;
    stage.classList.add("won");
    lineCells.forEach(function (c) { c.classList.add("win"); });
    if (T.won) label.textContent = T.won;
    else anim($("spinPill"), [{ opacity: 1 }, { opacity: 0 }], { duration: 300 });
    flash(0.7);
    anim($("glowBack"), [{ opacity: 0 }, { opacity: 1 }], { duration: 700 });
    anim($("raysBack"), [{ opacity: 0 }, { opacity: 0.75 }], { duration: 900 });
    anim(tapText, [{ opacity: 1 }, { opacity: 0 }], { duration: 300 });
    [0, 1, 2].forEach(function (k) {
      setTimeout(function () {
        var p = on(k);
        ripple(p.x, p.y, 2);
        sparks(p.x, p.y, 18, { dist: 260, size: 1.3, dur: 900 });
      }, 160 * k);
    });
    var mc = P.pos($("machine"));
    sparks(mc.x, mc.y, 36, { jx: 420, jy: 380, dist: 200, size: 1.2, dur: 1100, stagger: 600, gravity: -60 });
    P.wait(1700).then(P.showPopup);
  }

  P.boot({
    start: function () { P.setIdle(true); },
    press: press,
    qa: function (s) {
      if (s === "popup") {
        spins = SPINS - 1;
        press();
      }
    },
  });
})(window.P);
