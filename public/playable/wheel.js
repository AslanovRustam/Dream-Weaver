// Сценарий «Колесо». Первое вращение проскакивает джекпот на пару градусов —
// «почти!», второе останавливается ровно на нём. Указатель щёлкает на каждой
// границе сектора; лампочки бегут в покое, мчатся при вращении и мигают
// разом при выигрыше.
(function (P) {
  "use strict";
  var $ = P.$, T = P.T, CFG = P.CFG, anim = P.anim, animIn = P.animIn, sparks = P.sparks, ripple = P.ripple;
  var NS = "http://www.w3.org/2000/svg";
  var SPINS = 2;
  var CENTER = { x: 540, y: 890 };
  var POINTER = { x: 540, y: 560 };

  var prizes = (CFG.prizes && CFG.prizes.length >= 2 ? CFG.prizes : ["100", "x2", "50", "500", "200%", "25", "x3", "JACKPOT"]).slice(0, 12);
  var N = prizes.length, SEG = 360 / N;
  var WIN = Math.min(Math.max(0, CFG.winIndex | 0), N - 1);

  var stage = P.stage, rot = $("wheelRot"), pointer = $("pointer"), label = $("label"), tapText = $("tapText");

  // ---- сектора, подписи и лампочки
  function arc(r, a0, a1) {
    var p = function (a) { var t = (a - 90) * Math.PI / 180; return (Math.cos(t) * r).toFixed(2) + " " + (Math.sin(t) * r).toFixed(2); };
    return "M0 0 L" + p(a0) + " A" + r + " " + r + " 0 0 1 " + p(a1) + " Z";
  }
  (function () {
    var segs = $("whSegs"), labels = $("whLabels"), glow = $("whWinGlow"), bulbs = $("whBulbs");
    for (var i = 0; i < N; i++) {
      var a0 = i * SEG, a1 = a0 + SEG;
      var path = document.createElementNS(NS, "path");
      path.setAttribute("d", arc(376, a0, a1));
      path.setAttribute("fill", i === WIN ? "url(#whSegWin)" : i % 2 ? "url(#whSegB)" : "url(#whSegA)");
      path.setAttribute("stroke", "#f2c26a"); path.setAttribute("stroke-width", "4");
      segs.appendChild(path);

      var mid = a0 + SEG / 2, txt = String(prizes[i]);
      var t = document.createElementNS(NS, "text");
      // Подпись вдоль радиуса: длинная — мельче, чтобы влезла в сектор.
      var size = txt.length <= 4 ? 64 : txt.length <= 6 ? 50 : txt.length <= 9 ? 38 : 30;
      t.setAttribute("font-size", size);
      t.setAttribute("transform", "rotate(" + mid + ") translate(0 -248) rotate(90)");
      t.setAttribute("fill", i === WIN ? "#5a2406" : "#fff");
      t.setAttribute("stroke", i === WIN ? "#fff3c0" : "#3a0a14"); t.setAttribute("stroke-width", "6"); t.setAttribute("paint-order", "stroke");
      t.textContent = txt;
      labels.appendChild(t);
    }
    var g = document.createElementNS(NS, "path");
    g.setAttribute("d", arc(376, WIN * SEG, WIN * SEG + SEG));
    g.setAttribute("fill", "#fff"); g.setAttribute("opacity", ".55");
    glow.appendChild(g);
    for (var b = 0; b < 20; b++) {
      var ang = (b / 20) * Math.PI * 2, c = document.createElementNS(NS, "circle");
      c.setAttribute("cx", (Math.sin(ang) * 392).toFixed(1)); c.setAttribute("cy", (-Math.cos(ang) * 392).toFixed(1));
      c.setAttribute("r", "12"); c.setAttribute("class", "bulb " + (b % 2 ? "b2" : "b1"));
      bulbs.appendChild(c);
    }
  })();

  label.textContent = (T.spinsLeft || "") + SPINS;

  // ---- вращение. Угол считаем сами в rAF: так видно каждую границу сектора.
  var angle = 0, spins = 0, busy = false, done = false;
  function setAngle(a) { angle = a; rot.setAttribute("transform", "rotate(" + a.toFixed(2) + ")"); }

  /** Под указателем сверху оказывается точка колеса с углом (-R mod 360). */
  function targetFor(pointAngle, minTurns) {
    var base = ((-pointAngle % 360) + 360) % 360;
    var t = base;
    while (t < angle + minTurns * 360) t += 360;
    return t;
  }

  function spinTo(target, dur) {
    return new Promise(function (resolve) {
      var from = angle, t0 = 0, lastSeg = Math.floor(from / SEG);
      function ease(p) { return 1 - Math.pow(1 - p, 4); }
      function frame(t) {
        if (!t0) t0 = t;
        var p = Math.min(1, (t - t0) / dur);
        setAngle(from + (target - from) * ease(p));
        var seg = Math.floor(angle / SEG);
        if (seg !== lastSeg) { // щелчок указателя на границе
          lastSeg = seg;
          pointer.animate([{ transform: "rotate(0)" }, { transform: "rotate(-22deg)" }, { transform: "rotate(0)" }], { duration: 120, easing: "ease-out" });
        }
        if (p < 1) requestAnimationFrame(frame); else resolve();
      }
      requestAnimationFrame(frame);
    });
  }

  function press() {
    if (busy || done || spins >= SPINS) return;
    busy = true;
    spins++;
    P.setIdle(false);
    stage.classList.add("spinning");
    animIn(tapText, [{ transform: "scale(1.12)" }, { transform: "scale(1)" }], { duration: 300 });
    var left = SPINS - spins;
    label.textContent = (T.spinsLeft || "") + left;

    if (spins === 1) {
      // Почти: останавливаемся в соседнем секторе, в паре градусов за джекпотом.
      spinTo(targetFor(WIN * SEG - 4, 4), 3200).then(function () {
        stage.classList.remove("spinning");
        animIn($("wheelBox"), [
          { transform: "none" }, { transform: "translateX(-10px)" }, { transform: "translateX(8px)" },
          { transform: "translateX(-4px)" }, { transform: "none" },
        ], { duration: 380, easing: "ease-out" });
        sparks(POINTER.x, POINTER.y, 10, { cls: "dust", dist: 140, gravity: 90 });
        P.setGradText(tapText, P.rich(T.tryAgain || ""));
        busy = false;
        P.scheduleHint(1600);
      });
    } else {
      spinTo(targetFor(WIN * SEG + SEG / 2, 4), 3800).then(win);
    }
  }

  function win() {
    done = true;
    stage.classList.remove("spinning");
    stage.classList.add("won");
    if (T.won) label.textContent = T.won;
    else anim($("spinPill"), [{ opacity: 1 }, { opacity: 0 }], { duration: 300 });
    P.flash(0.7);
    anim($("whWinGlow"), [{ opacity: 0 }, { opacity: 1 }, { opacity: 0.2 }, { opacity: 1 }, { opacity: 0.6 }], { duration: 1100 });
    anim($("glowBack"), [{ opacity: 0 }, { opacity: 1 }], { duration: 700 });
    anim($("raysBack"), [{ opacity: 0 }, { opacity: 0.75 }], { duration: 900 });
    anim(tapText, [{ opacity: 1 }, { opacity: 0 }], { duration: 300 });
    animIn($("wheelBox"), [{ transform: "scale(1)" }, { transform: "scale(1.05)", offset: 0.3 }, { transform: "scale(1)" }], { duration: 650, easing: "ease-out" });
    ripple(POINTER.x, POINTER.y, 2.4);
    sparks(POINTER.x, POINTER.y, 30, { dist: 380, size: 1.5, dur: 1000 });
    sparks(CENTER.x, CENTER.y, 36, { jx: 380, jy: 380, dist: 200, size: 1.2, dur: 1100, stagger: 500, gravity: -60 });
    P.wait(1400).then(P.showPopup);
  }

  P.boot({
    start: function () { P.setIdle(true); },
    press: press,
    qa: function (s) {
      if (s === "popup") { setAngle(targetFor(WIN * SEG + SEG / 2, 0)); win(); }
    },
  });
})(window.P);
