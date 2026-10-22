// Сценарий «Баскетбол». Тап или свайп вверх — бросок. Первый мяч бьётся о
// переднюю дужку («клац», кольцо дрожит) и отлетает за край — «почти!».
// Второй взлетает над кольцом и падает точно в сетку: сетка вздрагивает,
// искры — и попап.
//
// Полёт — цепочка квадратичных кривых в координатах сцены. Мяч уменьшается
// к кольцу (глубина), а после вершины уходит за переднюю дужку и сетку.
(function (P) {
  "use strict";
  var $ = P.$, T = P.T, anim = P.anim, animIn = P.animIn, sparks = P.sparks, ripple = P.ripple;
  var SHOTS = 2;
  var stage = P.stage, ball = $("ball"), label = $("label"), tapText = $("tapText");
  if (P.art("ball")) ball.innerHTML = P.aiImg(P.art("ball"));
  // Щит по теме — за кольцом; дуги и сетка остаются векторными: мяч пролетает между ними.
  if (P.art("board")) {
    $("hoopBack").querySelectorAll(".bkBoard").forEach(function (r) { r.style.display = "none"; });
    $("hoopBack").insertAdjacentHTML("afterbegin", P.aiImg(P.art("board"), "boardArt"));
  }

  /** Точки — из раскладки: в вертикали и горизонтали они свои. */
  function rest() { return { x: ball.offsetLeft + ball.offsetWidth / 2, y: ball.offsetTop + ball.offsetHeight / 2 }; }
  function rim() { var r = $("rimSpot"); return { x: r.offsetLeft, y: r.offsetTop }; }

  label.textContent = (T.shotsLeft || "") + SHOTS;

  var rot = 0;
  function place(S, p, s) {
    ball.style.transform = "translate(" + (p.x - S.x).toFixed(1) + "px," + (p.y - S.y).toFixed(1) + "px) scale(" + s.toFixed(3) + ") rotate(" + rot.toFixed(0) + "deg)";
  }

  /** Пролететь по кривым: seg = { to, c, dur, s0, s1, tick? }. */
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
            rot += 9;
            place(S, p, seg.s0 + (seg.s1 - seg.s0) * u);
            if (seg.tick) seg.tick(p);
            if (u < 1) requestAnimationFrame(frame); else resolve();
          }
          requestAnimationFrame(frame);
        });
      });
    }, Promise.resolve());
  }

  var shots = 0, busy = false, done = false;

  function press() {
    if (busy || done || shots >= SHOTS) return;
    busy = true;
    shots++;
    P.setIdle(false);
    label.textContent = (T.shotsLeft || "") + (SHOTS - shots);
    animIn(tapText, [{ transform: "scale(1.12)" }, { transform: "scale(1)" }], { duration: 300 });
    var S = rest(), R = rim();
    ball.classList.remove("behind");
    if (shots === 1) miss(S, R); else score(S, R);
  }

  function miss(S, R) {
    var A = { x: R.x - 40, y: R.y - 300 };
    var hit = { x: R.x - 104, y: R.y - 26 };
    fly(S, S, [
      { to: A, c: { x: (S.x + A.x) / 2, y: A.y - 240 }, dur: 620, s0: 1, s1: 0.62 },
      { to: hit, c: { x: R.x - 70, y: R.y - 330 }, dur: 300, s0: 0.62, s1: 0.58 },
    ]).then(function () {
      // Клац о дужку.
      stage.classList.remove("rimhit");
      void stage.offsetWidth;
      stage.classList.add("rimhit");
      sparks(hit.x, hit.y, 10, { cls: "dust", dist: 120, gravity: 60 });
      ripple(hit.x, hit.y, 1.2);
      var B = { x: R.x + 170, y: R.y - 170 };
      return fly(S, hit, [
        { to: B, c: { x: R.x + 10, y: R.y - 270 }, dur: 380, s0: 0.58, s1: 0.62 },
        { to: { x: R.x + 420, y: S.y + 380 }, c: { x: R.x + 340, y: R.y - 230 }, dur: 640, s0: 0.62, s1: 0.9 },
      ]);
    }).then(function () {
      // Новый мяч на месте.
      ball.style.transform = "";
      animIn(ball, [{ opacity: 0, transform: "scale(.6)" }, { opacity: 1, transform: "none" }], { duration: 320 });
      P.setGradText(tapText, P.rich(T.tryAgain || ""));
      busy = false;
      P.scheduleHint(1500);
    });
  }

  function score(S, R) {
    var A = { x: R.x, y: R.y - 320 };
    var swished = false;
    fly(S, S, [
      { to: A, c: { x: (S.x + A.x) / 2, y: A.y - 260 }, dur: 660, s0: 1, s1: 0.6 },
    ]).then(function () {
      ball.classList.add("behind"); // дальше — за дужкой и сеткой
      return fly(S, A, [
        {
          to: { x: R.x, y: R.y + 230 }, c: { x: R.x, y: A.y + 20 }, dur: 460, s0: 0.6, s1: 0.55,
          tick: function (p) {
            if (!swished && p.y > R.y - 10) {
              swished = true;
              stage.classList.add("swish");
              win(R);
            }
          },
        },
      ]);
    }).then(function () {
      anim(ball, [{ opacity: 1 }, { opacity: 0 }], { duration: 250 });
    });
  }

  function win(R) {
    done = true;
    stage.classList.add("won");
    if (T.won) label.textContent = T.won;
    P.flash(0.7);
    anim($("glowBack"), [{ opacity: 0 }, { opacity: 1 }], { duration: 700 });
    anim($("raysBack"), [{ opacity: 0 }, { opacity: 0.75 }], { duration: 900 });
    anim(tapText, [{ opacity: 1 }, { opacity: 0 }], { duration: 300 });
    ripple(R.x, R.y, 2.6);
    sparks(R.x, R.y + 60, 40, { angle: Math.PI / 2, spread: 1.6, dist: 420, size: 1.5, dur: 1200, gravity: 200, stagger: 400 });
    sparks(R.x, R.y - 100, 30, { jx: 380, jy: 260, dist: 220, size: 1.2, dur: 1100, stagger: 600, gravity: -60 });
    P.wait(1700).then(P.showPopup);
  }

  P.boot({
    start: function () { P.setIdle(true); },
    press: press,
    qa: function (s) {
      if (s === "popup") { shots = SHOTS - 1; press(); }
    },
  });
})(window.P);
