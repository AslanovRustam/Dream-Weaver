// Сценарий «Кран-машина». Клешня сама ездит по рельсу туда-обратно. Тап —
// клешня опускается на кучу призов, сжимается и поднимает ближайший.
// Первая попытка: на полпути к лотку приз выскальзывает и падает обратно —
// «Почти! Ещё попытка». Вторая: клешня доносит приз до лотка, он падает
// в лоток — вспышка, искры и попап.
//
// Положение клешни — в координатах автомата; движение ведёт свой tween на
// requestAnimationFrame, чтобы в любой момент знать, где клешня.
(function (P) {
  "use strict";
  var $ = P.$, T = P.T, anim = P.anim, animIn = P.animIn, sparks = P.sparks, ripple = P.ripple;
  var TRIES = 2;
  var KINDS = ["coin", "diamond", "seven", "cherry", "bell", "bar"];
  var MIN_X = 300, MAX_X = 760, REST_Y = 46, CHUTE_X = 110;
  var stage = P.stage, machine = $("machine"), claw = $("claw"), grab = $("grab"), pile = $("pile");
  var label = $("label"), tapText = $("tapText");

  // ---- куча призов: два ряда, нижний — плотнее
  var SPOTS = [
    [235, 820], [375, 830], [515, 815], [655, 830], [790, 820],
    [305, 740], [445, 745], [585, 735], [720, 745],
  ];
  var prizes = SPOTS.map(function (s, i) {
    var el = document.createElement("div");
    el.className = "prize" + (i === 2 || i === 7 ? " gold" : "");
    el.innerHTML = P.sym(KINDS[i % KINDS.length], KINDS);
    el.style.left = s[0] - 75 + "px";
    el.style.top = s[1] - 75 + "px";
    pile.appendChild(el);
    return { el: el, x: s[0], y: s[1], home: s, taken: false };
  });

  // ---- клешня
  var cx = (MIN_X + MAX_X) / 2, cy = REST_Y, dir = 1, busy = false, done = false, tries = 0;
  function place() { claw.style.transform = "translate(" + (cx - 100).toFixed(1) + "px," + cy.toFixed(1) + "px)"; }
  place();
  function tween(toX, toY, dur, ease) {
    var x0 = cx, y0 = cy;
    return new Promise(function (resolve) {
      var t0 = 0;
      function f(t) {
        if (!t0) t0 = t;
        var u = Math.min(1, (t - t0) / dur), e = ease ? ease(u) : u;
        cx = x0 + (toX - x0) * e;
        cy = y0 + (toY - y0) * e;
        place();
        if (u < 1) requestAnimationFrame(f); else resolve();
      }
      requestAnimationFrame(f);
    });
  }
  var inOut = function (u) { return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; };
  var out = function (u) { return 1 - Math.pow(1 - u, 3); };

  // Ездит сама, пока не нажали.
  (function patrol() {
    if (!busy && !done) {
      cx += dir * 4.2;
      if (cx > MAX_X) { cx = MAX_X; dir = -1; }
      if (cx < MIN_X) { cx = MIN_X; dir = 1; }
      place();
    }
    requestAnimationFrame(patrol);
  })();

  label.textContent = (T.triesLeft || "") + TRIES;

  function nearest() {
    var best = null;
    prizes.forEach(function (p) { if (!p.taken && (!best || Math.abs(p.x - cx) < Math.abs(best.x - cx))) best = p; });
    return best;
  }
  /** Перенести приз из клешни обратно в автомат — там, где он сейчас. */
  function release(p) {
    var gx = cx, gy = cy + 108 + 75;
    pile.appendChild(p.el);
    p.el.style.left = gx - 75 + "px";
    p.el.style.top = gy - 75 + "px";
    return { x: gx, y: gy };
  }

  function press() {
    if (busy || done || tries >= TRIES) return;
    busy = true;
    tries++;
    P.setIdle(false);
    label.textContent = (T.triesLeft || "") + (TRIES - tries);
    animIn(tapText, [{ transform: "scale(1.12)" }, { transform: "scale(1)" }], { duration: 300 });
    var first = tries === 1;
    var p = nearest();
    stage.classList.remove("closed");
    // Над призом, вниз, сжать, вверх.
    tween(p.x, REST_Y, 260, out)
      .then(function () { return tween(p.x, p.y - 108 - 75, 720, inOut); })
      .then(function () {
        stage.classList.add("closed");
        return P.wait(320);
      })
      .then(function () {
        p.taken = true;
        p.el.getAnimations().forEach(function (a) { a.cancel(); });
        p.el.style.transform = "";
        grab.appendChild(p.el);
        p.el.style.left = "0px";
        p.el.style.top = "0px";
        return tween(p.x, REST_Y, 760, inOut);
      })
      .then(function () {
        if (first) {
          // На полпути к лотку — выскальзывает.
          return tween((p.x + CHUTE_X) / 2 + 40, REST_Y, 620, inOut).then(function () {
            stage.classList.remove("closed");
            var at = release(p);
            var land = p.home;
            animIn(machine, [{ transform: "none" }, { transform: "translateX(-6px)" }, { transform: "translateX(5px)" }, { transform: "none" }], { duration: 260 });
            return anim(p.el, [
              { transform: "none" },
              { transform: "translate(" + (land[0] - at.x) + "px," + (land[1] - at.y) + "px) rotate(40deg)", offset: 0.75 },
              { transform: "translate(" + (land[0] - at.x) + "px," + (land[1] - at.y - 30) + "px) rotate(30deg)", offset: 0.88 },
              { transform: "translate(" + (land[0] - at.x) + "px," + (land[1] - at.y) + "px) rotate(36deg)" },
            ], { duration: 820, easing: "ease-in" }).finished.then(function () {
              // Приз снова лежит в куче — на своём месте, чуть повёрнутый.
              p.el.getAnimations().forEach(function (a) { a.cancel(); });
              p.el.style.left = land[0] - 75 + "px";
              p.el.style.top = land[1] - 75 + "px";
              p.el.style.transform = "rotate(36deg)";
              var mp = P.pos(p.el);
              sparks(mp.x, mp.y, 10, { cls: "dust", dist: 120, gravity: 60 });
              p.taken = false;
              P.setGradText(tapText, P.rich(T.tryAgain || ""));
              return tween(cx, REST_Y, 10);
            });
          });
        }
        return tween(CHUTE_X, REST_Y, 900, inOut).then(function () {
          stage.classList.remove("closed");
          var at = release(p);
          return anim(p.el, [
            { transform: "none", opacity: 1 },
            { transform: "translateY(" + (900 - at.y) + "px) scale(.8)", opacity: 0 },
          ], { duration: 620, easing: "ease-in" }).finished.then(function () { win(); });
        });
      })
      .then(function () {
        if (first) {
          busy = false;
          P.scheduleHint(1500);
        }
      });
  }

  function win() {
    done = true;
    stage.classList.add("won");
    if (T.won) label.textContent = T.won;
    P.flash(0.7);
    anim($("glowBack"), [{ opacity: 0 }, { opacity: 1 }], { duration: 700 });
    anim($("raysBack"), [{ opacity: 0 }, { opacity: 0.75 }], { duration: 900 });
    anim(tapText, [{ opacity: 1 }, { opacity: 0 }], { duration: 300 });
    var c = P.pos($("chute"), 0.5, 0.2);
    ripple(c.x, c.y, 2.4);
    sparks(c.x, c.y, 44, { angle: -Math.PI / 2, spread: 1.6, dist: 460, size: 1.5, dur: 1200, gravity: 200, stagger: 400 });
    P.wait(1500).then(P.showPopup);
  }

  P.boot({
    start: function () { P.setIdle(true); },
    press: press,
    qa: function (s) {
      if (s === "popup") { tries = TRIES - 1; press(); }
    },
  });
})(window.P);
