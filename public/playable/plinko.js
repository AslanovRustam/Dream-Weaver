// Сценарий «Плинко». Тап — шарик падает из лотка и скачет по штырькам:
// каждый штырёк вспыхивает от удара. Первый шарик садится в ×0.5 у центра
// («ещё раз!»), второй уходит к краю — в ×100: лунка мигает, монеты — попап.
//
// Путь — девять отскоков влево/вправо; сколько из них вправо, столько и
// номер лунки. Порядок отскоков случайный, итог задан заранее.
(function (P) {
  "use strict";
  var $ = P.$, T = P.T, anim = P.anim, animIn = P.animIn, sparks = P.sparks, ripple = P.ripple;
  var BOARD = { x: 60, y: 430 };
  var CX = 480, DX = 84, ROW0 = 110, DY = 68, ROWS = 9, BUCKET_Y = 776;
  var LABELS = ["x100", "x10", "x3", "x1.5", "x0.5", "x0.5", "x1.5", "x3", "x10", "x100"];
  var COLORS = ["#ff3b3b", "#ff6a2c", "#ff9a2c", "#ffc23c", "#ffe46a", "#ffe46a", "#ffc23c", "#ff9a2c", "#ff6a2c", "#ff3b3b"];
  var DROPS = [4, 9]; // в какую лунку садится каждый шарик
  var STEP = 165;

  var stage = P.stage, ball = $("ball"), label = $("label"), tapText = $("tapText");

  // ---- штырьки и лунки
  var pegs = [];
  for (var r = 0; r < ROWS; r++) {
    pegs.push([]);
    for (var j = 0; j < r + 3; j++) {
      var pg = document.createElement("div");
      pg.className = "peg";
      pg.style.left = CX + (j - (r + 2) / 2) * DX + "px";
      pg.style.top = ROW0 + r * DY + "px";
      $("pegs").appendChild(pg);
      pegs[r].push(pg);
    }
  }
  var buckets = LABELS.map(function (txt, k) {
    var b = document.createElement("div");
    b.className = "bucket";
    b.style.left = CX + (k - ROWS / 2) * DX + "px";
    b.style.background = "linear-gradient(180deg, #fff6c8, " + COLORS[k] + " 55%)";
    b.textContent = txt;
    $("buckets").appendChild(b);
    return b;
  });

  label.textContent = (T.ballsLeft || "") + DROPS.length;

  function place(x, y) { ball.style.transform = "translate(" + x.toFixed(1) + "px," + y.toFixed(1) + "px)"; }

  function hop(x0, y0, x1, y1, dur, lift) {
    return new Promise(function (resolve) {
      var t0 = 0;
      function frame(t) {
        if (!t0) t0 = t;
        var p = Math.min(1, (t - t0) / dur);
        place(x0 + (x1 - x0) * p, y0 + (y1 - y0) * p * p - lift * Math.sin(Math.PI * p));
        if (p < 1) requestAnimationFrame(frame); else resolve();
      }
      requestAnimationFrame(frame);
    });
  }

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var k = (Math.random() * (i + 1)) | 0, t = a[i]; a[i] = a[k]; a[k] = t; }
    return a;
  }

  /** Бросок в лунку k: промис — когда шарик сел. */
  function drop(k) {
    var moves = shuffle(Array.apply(null, Array(ROWS)).map(function (_, i) { return i < k ? 1 : 0; }));
    var x = CX, y = ROW0 - 32, rights = 0;
    ball.style.opacity = "1";
    place(x, 20);
    var chain = hop(x, 20, x, y, 260, 0); // из лотка на первый штырёк
    moves.forEach(function (mv, row) {
      chain = chain.then(function () {
        var peg = pegs[row][rights + 1];
        if (peg) {
          peg.classList.remove("hit");
          void peg.offsetWidth; // перезапуск анимации вспышки
          peg.classList.add("hit");
        }
        rights += mv;
        var nx = CX + (rights - (row + 1) / 2) * DX;
        var ny = row + 1 < ROWS ? ROW0 + (row + 1) * DY - 32 : BUCKET_Y - 20;
        var fx = x, fy = y;
        x = nx;
        y = ny;
        return hop(fx, fy, nx, ny, STEP, 22);
      });
    });
    return chain.then(function () {
      var b = buckets[k];
      b.classList.remove("land");
      void b.offsetWidth;
      b.classList.add("land");
      anim(ball, [{ opacity: 1 }, { opacity: 0 }], { duration: 250, delay: 120 });
      return { x: BOARD.x + x, y: BOARD.y + BUCKET_Y };
    });
  }

  // ---- игра
  var drops = 0, busy = false, done = false;

  function press() {
    if (busy || done || drops >= DROPS.length) return;
    busy = true;
    var k = DROPS[drops++];
    P.setIdle(false);
    label.textContent = (T.ballsLeft || "") + (DROPS.length - drops);
    animIn($("dropper"), [{ transform: "none" }, { transform: "translateY(14px)" }, { transform: "none" }], { duration: 260 });
    animIn(tapText, [{ transform: "scale(1.12)" }, { transform: "scale(1)" }], { duration: 300 });
    drop(k).then(function (at) {
      if (drops < DROPS.length) {
        sparks(at.x, at.y, 10, { cls: "dust", dist: 120, gravity: 60 });
        P.setGradText(tapText, P.rich(T.tryAgain || ""));
        busy = false;
        P.scheduleHint(1400);
      } else {
        win(k, at);
      }
    });
  }

  function win(k, at) {
    done = true;
    stage.classList.add("won");
    buckets[k].classList.add("jackpot");
    if (T.won) label.textContent = T.won;
    else anim($("spinPill"), [{ opacity: 1 }, { opacity: 0 }], { duration: 300 });
    P.flash(0.7);
    anim($("glowBack"), [{ opacity: 0 }, { opacity: 1 }], { duration: 700 });
    anim($("raysBack"), [{ opacity: 0 }, { opacity: 0.75 }], { duration: 900 });
    anim(tapText, [{ opacity: 1 }, { opacity: 0 }], { duration: 300 });
    ripple(at.x, at.y, 2.6);
    sparks(at.x, at.y, 40, { angle: -Math.PI / 2, spread: 1.5, dist: 560, size: 1.6, dur: 1300, gravity: 260, stagger: 450 });
    sparks(540, 860, 30, { jx: 420, jy: 380, dist: 200, size: 1.2, dur: 1100, stagger: 600, gravity: -60 });
    P.wait(1700).then(P.showPopup);
  }

  P.boot({
    start: function () { P.setIdle(true); },
    press: press,
    qa: function (s) {
      if (s === "popup") { drops = DROPS.length - 1; press(); }
    },
  });
})(window.P);
