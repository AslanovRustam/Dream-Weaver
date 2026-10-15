// Сценарий «Рулетка». Ставка на красное. Тап — запуск: колесо крутится по
// часовой, шарик бежит навстречу по бортику, теряет скорость и по спирали
// садится в ячейку. Первый раз — в зеро («почти!»), второй — в красную
// семёрку: ячейка светится, вспышка, искры — и попап.
//
// Колесо и шарик ведёт один цикл requestAnimationFrame: угол колеса и угол
// шарика сходятся так, чтобы к концу шарик оказался ровно над нужной ячейкой.
(function (P) {
  "use strict";
  var $ = P.$, T = P.T, anim = P.anim, animIn = P.animIn, sparks = P.sparks, ripple = P.ripple;
  var SPINS = 2;
  var ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
  var RED = { 1: 1, 3: 1, 5: 1, 7: 1, 9: 1, 12: 1, 14: 1, 16: 1, 18: 1, 19: 1, 21: 1, 23: 1, 25: 1, 27: 1, 30: 1, 32: 1, 34: 1, 36: 1 };
  var STEP = 360 / ORDER.length;
  var stage = P.stage, wheel = $("rWheel"), disc = $("rDisc"), ball = $("rBall"), label = $("label"), tapText = $("tapText");

  // ---- колесо: ячейки, номера, внутренний конус
  var NS = "http://www.w3.org/2000/svg";
  function rad(a) { return (a - 90) * Math.PI / 180; }
  function pt(r, a) { return (r * Math.cos(rad(a))).toFixed(1) + " " + (r * Math.sin(rad(a))).toFixed(1); }
  var html = '<defs><radialGradient id="rlCone" r=".6"><stop offset="0" stop-color="#f6d27a"/><stop offset=".55" stop-color="#9a5b17"/><stop offset="1" stop-color="#3a1c06"/></radialGradient></defs>';
  html += '<circle r="392" fill="#2a1406"/>';
  for (var i = 0; i < ORDER.length; i++) {
    var a0 = i * STEP - STEP / 2, a1 = a0 + STEP, n = ORDER[i];
    var fill = n === 0 ? "#0f8a3c" : RED[n] ? "#c3121c" : "#14161c";
    html += '<path id="pk' + n + '" d="M' + pt(250, a0) + " L" + pt(385, a0) + " A385 385 0 0 1 " + pt(385, a1) + " L" + pt(250, a1) + " A250 250 0 0 0 " + pt(250, a0) + 'Z" fill="' + fill + '" stroke="#e7c070" stroke-width="2"/>';
    var tp = pt(352, i * STEP).split(" ");
    html += '<text x="' + tp[0] + '" y="' + tp[1] + '" transform="rotate(' + (i * STEP).toFixed(2) + " " + tp[0] + " " + tp[1] + ')" text-anchor="middle" dominant-baseline="middle" font-family="PInter,Arial" font-weight="800" font-size="30" fill="#fff">' + n + "</text>";
  }
  html += '<circle r="250" fill="url(#rlCone)" stroke="#e7c070" stroke-width="4"/>';
  for (var d = 0; d < 8; d++) html += '<path d="M' + pt(150, d * 45) + " L" + pt(222, d * 45 + 5) + " L" + pt(150, d * 45 + 10) + " L" + pt(78, d * 45 + 5) + 'Z" fill="#ffe7a3" opacity=".85"/>';
  html += '<circle r="64" fill="#e7c070" stroke="#7a4510" stroke-width="6"/><circle r="22" fill="#fff4cf"/>';
  disc.innerHTML = html;

  label.textContent = (T.spinsLeft || "") + SPINS;
  $("betText").textContent = T.bet || "";

  /** Центр колеса и масштаб ячеек — из раскладки (вертикаль и горизонталь разные). */
  function center() { return { x: wheel.offsetLeft + wheel.offsetWidth / 2, y: wheel.offsetTop + wheel.offsetHeight / 2, k: wheel.offsetWidth / 840 }; }
  function placeBall(c, ang, r) {
    var x = c.x + r * c.k * Math.cos(rad(ang)), y = c.y + r * c.k * Math.sin(rad(ang));
    ball.style.transform = "translate(" + (x - (ball.offsetLeft + ball.offsetWidth / 2)).toFixed(1) + "px," + (y - (ball.offsetTop + ball.offsetHeight / 2)).toFixed(1) + "px)";
  }
  var wAng = 0;
  // Шарик в покое — на бортике сверху.
  placeBall(center(), 0, 398);

  var spins = 0, busy = false, done = false;

  function spin(target) {
    return new Promise(function (resolve) {
      var c = center();
      // Колесо замирает в CSS-петле ожидания — забираем его текущий угол.
      var m = getComputedStyle(wheel).transform;
      if (m && m !== "none") { var v = m.split("(")[1].split(")")[0].split(","); wAng = Math.atan2(+v[1], +v[0]) * 180 / Math.PI; }
      stage.classList.remove("rFresh");
      var w0 = wAng, wTotal = 540 + Math.random() * 90, wEnd = w0 + wTotal;
      var pocket = ORDER.indexOf(target) * STEP;
      var bEndAbs = wEnd + pocket;
      var b0 = -30, bTotal = b0 - bEndAbs;
      while (bTotal < 1260) bTotal += 360;
      var D = 4600, t0 = 0;
      function frame(t) {
        if (!t0) t0 = t;
        var u = Math.min(1, (t - t0) / D), e = 1 - Math.pow(1 - u, 3);
        wAng = w0 + wTotal * e;
        wheel.style.transform = "rotate(" + wAng.toFixed(2) + "deg)";
        var bAng = b0 - bTotal * (1 - Math.pow(1 - u, 2.4));
        // Последняя треть: шарик спускается с бортика в ячейку с подскоком.
        var r = u < 0.66 ? 398 : 398 - (398 - 318) * Math.min(1, (u - 0.66) / 0.24) + (u > 0.8 && u < 0.92 ? Math.sin((u - 0.8) / 0.12 * Math.PI) * 22 : 0);
        if (u > 0.9) bAng = bEndAbs + (bAng - bEndAbs) * Math.max(0, (1 - u) / 0.1);
        placeBall(c, u >= 1 ? bEndAbs : bAng, r);
        if (u < 1) requestAnimationFrame(frame); else resolve(c);
      }
      requestAnimationFrame(frame);
    });
  }

  function press() {
    if (busy || done || spins >= SPINS) return;
    busy = true;
    spins++;
    P.setIdle(false);
    label.textContent = (T.spinsLeft || "") + (SPINS - spins);
    animIn(tapText, [{ transform: "scale(1.12)" }, { transform: "scale(1)" }], { duration: 300 });
    var target = spins === 1 ? 0 : 7;
    spin(target).then(function (c) {
      var bx = c.x + 318 * c.k * Math.cos(rad(wAng + ORDER.indexOf(target) * STEP));
      var by = c.y + 318 * c.k * Math.sin(rad(wAng + ORDER.indexOf(target) * STEP));
      ripple(bx, by, 1.2);
      if (target === 0) {
        sparks(bx, by, 10, { cls: "dust", dist: 100, gravity: 40 });
        P.setGradText(tapText, P.rich(T.tryAgain || ""));
        busy = false;
        P.scheduleHint(1500);
      } else win(bx, by, target);
    });
  }

  function win(x, y, n) {
    done = true;
    stage.classList.add("won");
    var pk = document.getElementById("pk" + n);
    if (pk) pk.classList.add("pocketWin");
    if (T.won) label.textContent = T.won;
    P.flash(0.7);
    anim($("glowBack"), [{ opacity: 0 }, { opacity: 1 }], { duration: 700 });
    anim($("raysBack"), [{ opacity: 0 }, { opacity: 0.75 }], { duration: 900 });
    anim(tapText, [{ opacity: 1 }, { opacity: 0 }], { duration: 300 });
    ripple(x, y, 2.6);
    sparks(x, y, 40, { spread: 3, dist: 420, size: 1.5, dur: 1200, gravity: 200, stagger: 400 });
    P.wait(1700).then(P.showPopup);
  }

  P.onLayout(function () { if (!busy && !done) placeBall(center(), 0, 398); });
  P.boot({
    start: function () { stage.classList.add("rFresh"); P.setIdle(true); },
    press: press,
    qa: function (s) {
      if (s === "popup") { spins = SPINS - 1; press(); }
    },
  });
})(window.P);
