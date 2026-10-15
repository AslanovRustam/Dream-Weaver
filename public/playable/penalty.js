// Сценарий «Пенальти». Тап или свайп — удар. Первый мяч летит в правую
// девятку, но вратарь тянется и отбивает его за ворота — «почти!». Второй
// уходит в левую девятку, вратарь прыгает не в ту сторону: сетка
// вздрагивает, искры — и попап.
//
// Полёт — цепочка квадратичных кривых в координатах сцены, как в
// «Баскетболе»: мяч уменьшается к воротам (глубина).
(function (P) {
  "use strict";
  var $ = P.$, T = P.T, anim = P.anim, animIn = P.animIn, sparks = P.sparks, ripple = P.ripple;
  var KICKS = 2;
  var stage = P.stage, ball = $("ball"), keeper = $("keeper"), label = $("label"), tapText = $("tapText");
  if (P.art("ball")) ball.innerHTML = P.aiImg(P.art("ball"));
  if (P.art("keeper")) keeper.innerHTML = P.aiImg(P.art("keeper"));

  /** Точки — из раскладки: в вертикали и горизонтали они свои. */
  function rest() { return { x: ball.offsetLeft + ball.offsetWidth / 2, y: ball.offsetTop + ball.offsetHeight / 2 }; }
  function spot(id) { var r = $(id); return { x: r.offsetLeft, y: r.offsetTop }; }

  label.textContent = (T.kicksLeft || "") + KICKS;

  var rot = 0;
  function place(S, p, s) {
    ball.style.transform = "translate(" + (p.x - S.x).toFixed(1) + "px," + (p.y - S.y).toFixed(1) + "px) scale(" + s.toFixed(3) + ") rotate(" + rot.toFixed(0) + "deg)";
  }

  /** Пролететь по кривым: seg = { to, c, dur, s0, s1 }. */
  function fly(S, from, segs) {
    return segs.reduce(function (chain, seg) {
      return chain.then(function () {
        var p0 = from;
        from = seg.to;
        return new Promise(function (resolve) {
          var t0 = 0;
          function frame(t) {
            if (!t0) t0 = t;
            var u = Math.min(1, (t - t0) / seg.dur), v = 1 - u;
            var p = {
              x: v * v * p0.x + 2 * v * u * seg.c.x + u * u * seg.to.x,
              y: v * v * p0.y + 2 * v * u * seg.c.y + u * u * seg.to.y,
            };
            rot += 12;
            place(S, p, seg.s0 + (seg.s1 - seg.s0) * u);
            if (u < 1) requestAnimationFrame(frame); else resolve();
          }
          requestAnimationFrame(frame);
        });
      });
    }, Promise.resolve());
  }

  /** Прыжок вратаря: dir = 1 — вправо, -1 — влево. */
  function dive(dir, delay) {
    return anim(keeper, [
      { transform: "none" },
      { transform: "translate(" + 40 * dir + "px,-30px) rotate(" + 18 * dir + "deg)", offset: 0.3 },
      { transform: "translate(" + 250 * dir + "px,40px) rotate(" + 78 * dir + "deg)" },
    ], { duration: 520, delay: delay || 0, easing: "cubic-bezier(.2,.8,.3,1)" });
  }
  function standUp() {
    return anim(keeper, [{ transform: getComputedStyle(keeper).transform }, { transform: "none" }], { duration: 380, easing: "ease-out" });
  }

  var kicks = 0, busy = false, done = false;

  function press() {
    if (busy || done || kicks >= KICKS) return;
    busy = true;
    kicks++;
    P.setIdle(false);
    label.textContent = (T.kicksLeft || "") + (KICKS - kicks);
    animIn(tapText, [{ transform: "scale(1.12)" }, { transform: "scale(1)" }], { duration: 300 });
    var S = rest();
    ball.classList.remove("behind");
    if (kicks === 1) saved(S); else scored(S);
  }

  function saved(S) {
    var C = spot("cornerR");
    dive(1, 80);
    fly(S, S, [{ to: C, c: { x: (S.x + C.x) / 2 + 60, y: C.y + 120 }, dur: 520, s0: 1, s1: 0.52 }])
      .then(function () {
        // Перчатка — мяч отлетает за ворота.
        sparks(C.x, C.y, 12, { cls: "dust", dist: 140, gravity: 60 });
        ripple(C.x, C.y, 1.3);
        return fly(S, C, [
          { to: { x: C.x + 260, y: C.y - 220 }, c: { x: C.x + 120, y: C.y - 220 }, dur: 360, s0: 0.52, s1: 0.6 },
          { to: { x: C.x + 520, y: S.y + 260 }, c: { x: C.x + 460, y: C.y - 200 }, dur: 620, s0: 0.6, s1: 0.9 },
        ]);
      })
      .then(function () {
        standUp();
        ball.style.transform = "";
        animIn(ball, [{ opacity: 0, transform: "scale(.6)" }, { opacity: 1, transform: "none" }], { duration: 320 });
        P.setGradText(tapText, P.rich(T.tryAgain || ""));
        busy = false;
        P.scheduleHint(1500);
      });
  }

  function scored(S) {
    var C = spot("cornerL");
    dive(1, 160); // не в ту сторону
    fly(S, S, [{ to: C, c: { x: (S.x + C.x) / 2 - 80, y: C.y + 140 }, dur: 560, s0: 1, s1: 0.5 }])
      .then(function () {
        ball.classList.add("behind"); // в сетке — за штангами
        stage.classList.add("goal");
        win(C);
        return fly(S, C, [{ to: { x: C.x + 30, y: C.y + 200 }, c: { x: C.x - 20, y: C.y + 60 }, dur: 420, s0: 0.5, s1: 0.48 }]);
      });
  }

  function win(C) {
    done = true;
    stage.classList.add("won");
    if (T.won) label.textContent = T.won;
    P.flash(0.7);
    anim($("glowBack"), [{ opacity: 0 }, { opacity: 1 }], { duration: 700 });
    anim($("raysBack"), [{ opacity: 0 }, { opacity: 0.75 }], { duration: 900 });
    anim(tapText, [{ opacity: 1 }, { opacity: 0 }], { duration: 300 });
    ripple(C.x, C.y, 2.6);
    sparks(C.x, C.y, 40, { spread: 3, dist: 420, size: 1.5, dur: 1200, gravity: 200, stagger: 400 });
    sparks(540, 760, 30, { jx: 380, jy: 260, dist: 220, size: 1.2, dur: 1100, stagger: 600, gravity: -60 });
    P.wait(1700).then(P.showPopup);
  }

  P.boot({
    start: function () { P.setIdle(true); },
    press: press,
    qa: function (s) {
      if (s === "popup") { kicks = KICKS - 1; press(); }
    },
  });
})(window.P);
