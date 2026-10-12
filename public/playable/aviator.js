// Сценарий «Авиатор». Тап — самолёт взлетает: кривая ползёт вверх, множитель
// растёт, кнопка «Забрать» зеленеет и пульсирует. Тап ещё раз (не раньше чем
// через секунду полёта, чтобы взлёт успели увидеть) — забрал: множитель
// зеленеет, самолёт уходит за край, монеты — и попап. Не нажал до ×10 —
// забираем сами: плейбл не должен заканчиваться проигрышем.
(function (P) {
  "use strict";
  var $ = P.$, T = P.T, anim = P.anim, animIn = P.animIn, sparks = P.sparks, ripple = P.ripple;
  var SKY = { x: 60, y: 440, w: 960, h: 820 };
  var ORIGIN = { x: 70, y: 740 };         // точка взлёта в координатах неба
  var SPAN = { w: 780, h: 600 };          // куда может дотянуться кривая
  var MIN_FLIGHT = 1000, AUTO_AT = 10;

  var stage = P.stage, canvas = $("graph"), ctx = canvas.getContext("2d");
  var plane = $("plane"), mult = $("mult"), btn = $("cashBtn"), btnLbl = btn.querySelector(".lbl"), tapText = $("tapText");

  btnLbl.textContent = T.cashout || "";

  function m(t) { return Math.exp(0.28 * t); } // t в секундах

  /** Точка кривой в момент s при текущем «окне» (tView, mView). */
  function pt(s, tView, mView) {
    return {
      x: ORIGIN.x + (s / tView) * SPAN.w,
      y: ORIGIN.y - ((m(s) - 1) / (mView - 1)) * SPAN.h,
    };
  }

  function draw(t) {
    ctx.clearRect(0, 0, SKY.w, SKY.h);
    // Окно растёт вместе с полётом: кривая всегда во всё поле, самолёт — у края.
    var tView = Math.max(4, t), mView = Math.max(1.6, m(t) * 1.08);
    var N = 60, pts = [];
    for (var i = 0; i <= N; i++) pts.push(pt((t * i) / N, tView, mView));
    var end = pts[N];

    var fill = ctx.createLinearGradient(0, ORIGIN.y - SPAN.h, 0, ORIGIN.y);
    fill.addColorStop(0, "rgba(232,20,60,.55)");
    fill.addColorStop(1, "rgba(232,20,60,.05)");
    ctx.beginPath();
    ctx.moveTo(ORIGIN.x, ORIGIN.y);
    pts.forEach(function (p) { ctx.lineTo(p.x, p.y); });
    ctx.lineTo(end.x, ORIGIN.y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();

    ctx.beginPath();
    pts.forEach(function (p, k) { if (k) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
    ctx.lineWidth = 12; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = "#ff2e5f";
    ctx.shadowColor = "rgba(255,46,95,.8)"; ctx.shadowBlur = 24;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Самолёт — на конце кривой, нос по касательной.
    var prev = pts[N - 2] || pts[0];
    var ang = Math.atan2(end.y - prev.y, end.x - prev.x) * 180 / Math.PI;
    if (!t) ang = -12;
    var bob = Math.sin(t * 6) * 4;
    plane.style.transform = "translate(" + end.x.toFixed(1) + "px," + (end.y + bob).toFixed(1) + "px) rotate(" + Math.max(-40, ang).toFixed(1) + "deg)";
    plane.style.left = plane.style.top = "0";
  }

  function setMult(v) { mult.textContent = v.toFixed(2) + "x"; }

  // ---- игра
  var flying = false, done = false, t0 = 0, now = 0;

  function frame(ts) {
    if (!flying) return;
    if (!t0) t0 = ts;
    now = (ts - t0) / 1000;
    var v = m(now);
    draw(now);
    setMult(v);
    btnLbl.textContent = (T.cashout || "") + " " + v.toFixed(2) + "x";
    if (v >= AUTO_AT) return cashOut();
    requestAnimationFrame(frame);
  }

  function press() {
    if (done) return;
    if (!flying) {
      flying = true;
      stage.classList.add("flying");
      P.setIdle(false);
      P.setGradText(tapText, P.rich(T.cashoutHint || ""));
      animIn(tapText, [{ transform: "scale(1.12)" }, { transform: "scale(1)" }], { duration: 300 });
      sparks(SKY.x + ORIGIN.x, SKY.y + ORIGIN.y, 14, { cls: "dust", dist: 120, angle: Math.PI, spread: 1.2, gravity: -20 });
      requestAnimationFrame(frame);
      // Рука показывает на кнопку, когда уже есть что забрать.
      setTimeout(function () { if (!done) P.setIdle(true); }, 1600);
      return;
    }
    if (now * 1000 < MIN_FLIGHT) return;
    cashOut();
  }

  function cashOut() {
    if (done) return;
    done = true;
    flying = false;
    var v = m(now);
    setMult(v);
    stage.classList.remove("flying");
    stage.classList.add("won");
    P.setIdle(false);
    btnLbl.textContent = (T.won || "") + " " + v.toFixed(2) + "x";
    animIn(btn, [{ transform: "scale(1)" }, { transform: "scale(.92)" }, { transform: "scale(1.06)" }, { transform: "scale(1)" }], { duration: 420 });
    animIn(mult, [{ transform: "scale(1)" }, { transform: "scale(1.25)", offset: 0.4 }, { transform: "scale(1)" }], { duration: 600, easing: "ease-out" });
    // Самолёт уходит за правый верхний край.
    var cur = plane.style.transform;
    anim(plane, [{ transform: cur }, { transform: "translate(1100px,-200px) rotate(-30deg)" }], { duration: 900, easing: "ease-in" });
    P.flash(0.6);
    anim($("glowBack"), [{ opacity: 0 }, { opacity: 1 }], { duration: 700 });
    anim($("raysBack"), [{ opacity: 0 }, { opacity: 0.7 }], { duration: 900 });
    anim(tapText, [{ opacity: 1 }, { opacity: 0 }], { duration: 300 });
    ripple(540, 1400, 2.6);
    sparks(540, 1400, 36, { angle: -Math.PI / 2, spread: 1.6, dist: 520, size: 1.5, dur: 1200, gravity: 240, stagger: 400 });
    sparks(540, 760, 24, { jx: 360, jy: 260, dist: 200, size: 1.2, dur: 1000, stagger: 500, gravity: -60 });
    P.wait(1700).then(P.showPopup);
  }

  P.boot({
    start: function () {
      draw(0);
      setMult(1);
      P.setIdle(true);
    },
    press: press,
    qa: function (s) {
      if (s === "popup") { press(); setTimeout(cashOut, 2400); }
    },
  });
})(window.P);
