// Сценарий «Сейф». Три нажатия на замок: первое всегда «ломает» диск
// (иллюзия выбора, «попробуй ещё раз»), второе и третье удачные, на третьем
// сломанная монета чинится. Потом сейф трясётся, дверь распахивается со
// вспышкой — и попап с бонусом.
(function (P) {
  "use strict";
  var $ = P.$, T = P.T, anim = P.anim, animIn = P.animIn, sparks = P.sparks, ripple = P.ripple;
  var TAPS = 3;
  var DIAL = { x: 540, y: 790 }; // центр диска в координатах сцены
  var PANEL = { x: 140, y: 1300 };
  var SLOT_X = [150, 400, 650], SLOT_Y = 168;
  var BAR_W = [0, 0, 250, 500]; // заполнение дорожки после каждого нажатия
  var DIAL_ANGLE = [0, 0, 360, 720]; // полные обороты — свет на шкале остаётся на месте
  var EASE_OUT = "cubic-bezier(.22,.8,.3,1)", EASE_BACK = "cubic-bezier(.3,1.45,.5,1)";

  var stage = P.stage, safe = $("safe"), door = $("door"), dialSpr = $("dialSpr"), dialHub = $("dialHub");
  var label = $("label"), bar = $("bar"), tapText = $("tapText"), broken = $("broken");
  var coins = stage.querySelectorAll(".coin:not(.broken)"), checks = stage.querySelectorAll(".check");

  // ---- шкала диска: риски, цифры и спицы рисуем кодом, а не руками
  (function () {
    var NS = "http://www.w3.org/2000/svg";
    var ticks = $("dlTicks"), nums = $("dlNums"), spokes = $("dlSpokes");
    for (var i = 0; i < 60; i++) {
      var a = (i / 60) * Math.PI * 2, long = i % 5 === 0;
      var r1 = long ? 128 : 142, r2 = 160;
      var l = document.createElementNS(NS, "line");
      l.setAttribute("x1", (Math.sin(a) * r1).toFixed(1)); l.setAttribute("y1", (-Math.cos(a) * r1).toFixed(1));
      l.setAttribute("x2", (Math.sin(a) * r2).toFixed(1)); l.setAttribute("y2", (-Math.cos(a) * r2).toFixed(1));
      l.setAttribute("stroke-width", long ? 6 : 3);
      ticks.appendChild(l);
    }
    for (var n = 0; n < 10; n++) {
      var b = (n / 10) * Math.PI * 2, t = document.createElementNS(NS, "text");
      t.setAttribute("x", (Math.sin(b) * 104).toFixed(1)); t.setAttribute("y", (-Math.cos(b) * 104).toFixed(1));
      t.textContent = String(n * 10);
      nums.appendChild(t);
    }
    [-90, 30, 150].forEach(function (deg) {
      var g = document.createElementNS(NS, "g");
      g.setAttribute("transform", "rotate(" + deg + ")");
      g.innerHTML = '<rect x="38" y="-13" width="118" height="26" rx="13" fill="url(#dlSpoke)"/><circle cx="160" r="22" fill="url(#dlKnob)"/>';
      spokes.appendChild(g);
    });
  })();

  label.textContent = (T.tapsLeft || "") + TAPS;

  // ---- игра
  var taps = 0, busy = false, queued = 0, tryTimer = 0, done = false;

  function press() {
    if (done || taps + queued >= TAPS) return;
    if (busy) { queued++; return; }
    doTap();
  }

  function doTap() {
    busy = true;
    taps++;
    var k = taps;
    P.setIdle(false);
    P.scheduleHint();

    animIn(dialHub, [{ transform: "scale(1)" }, { transform: "scale(0.92)" }, { transform: "scale(1)" }], { duration: 220 });
    animIn(tapText, [{ transform: "scale(1.12)" }, { transform: "scale(1)" }], { duration: 300, easing: EASE_OUT });
    var left = TAPS - k;
    label.textContent = left > 0 ? (T.tapsLeft || "") + left : T.open || "";
    anim(bar, [{ width: BAR_W[k - 1] + "px" }, { width: BAR_W[k] + "px" }], { duration: 420, easing: EASE_OUT });

    if (k === 1) failTap(); else okTap(k);

    setTimeout(function () {
      busy = false;
      if (taps === TAPS) { openSafe(); return; }
      if (queued) { queued--; doTap(); }
    }, k === TAPS ? 850 : k === 1 ? 750 : 600);
  }

  // Замок заедает, первая монета трескается.
  function failTap() {
    anim(dialSpr, [
      { transform: "rotate(0deg)", easing: "ease-out" },
      { transform: "rotate(70deg)", offset: 0.35, easing: "ease-in" },
      { transform: "rotate(52deg)", offset: 0.5 },
      { transform: "rotate(62deg)", offset: 0.6, easing: "ease-in-out" },
      { transform: "rotate(-8deg)", offset: 0.85 },
      { transform: "rotate(0deg)" },
    ], { duration: 750 });
    animIn(safe, [
      { transform: "none" },
      { transform: "translateX(-10px)" }, { transform: "translateX(9px)" },
      { transform: "translateX(-6px)" }, { transform: "translateX(4px)" },
      { transform: "none" },
    ], { duration: 420, delay: 220, easing: "ease-out" });
    sparks(DIAL.x, DIAL.y, 10, { dist: 160, cls: "dust", delay: 220, dur: 700, gravity: 90 });

    animIn(label, [
      { transform: "translateX(0)", color: "#ff7a5c" },
      { transform: "translateX(-12px)", color: "#ff7a5c" }, { transform: "translateX(10px)" },
      { transform: "translateX(-6px)" }, { transform: "translateX(0)", color: "#ffbb58" },
    ], { duration: 450, easing: "ease-out" });
    anim(broken, [
      { opacity: 0, transform: "scale(0.2) rotate(-90deg)" },
      { opacity: 1, transform: "scale(1.15) rotate(8deg)", offset: 0.5 },
      { opacity: 1, transform: "scale(1) rotate(-6deg)", offset: 0.7 },
      { opacity: 1, transform: "scale(1) rotate(4deg)", offset: 0.85 },
      { opacity: 1, transform: "scale(1) rotate(0deg)" },
    ], { duration: 600, delay: 120, easing: "ease-out" });
    sparks(PANEL.x + SLOT_X[0], PANEL.y + SLOT_Y, 12, { dist: 130, cls: "dust", delay: 380, dur: 650, gravity: 80 });

    P.setGradText(tapText, P.rich(T.tryAgain || ""));
    clearTimeout(tryTimer);
    tryTimer = setTimeout(function () { P.setGradText(tapText, P.rich(T.tap || "")); }, 1600);
  }

  function okTap(k) {
    clearTimeout(tryTimer);
    P.setGradText(tapText, P.rich(T.tap || ""));
    anim(dialSpr, [
      { transform: "rotate(" + DIAL_ANGLE[k - 1] + "deg)" },
      { transform: "rotate(" + DIAL_ANGLE[k] + "deg)" },
    ], { duration: k === TAPS ? 900 : 650, easing: EASE_BACK });
    animIn(safe, [
      { transform: "none" },
      { transform: "translate(-6px,2px) rotate(-0.5deg)" },
      { transform: "translate(5px,-2px) rotate(0.4deg)" },
      { transform: "translate(-2px,1px) rotate(-0.2deg)" },
      { transform: "none" },
    ], { duration: 320, easing: "ease-out" });
    ripple(DIAL.x, DIAL.y, 2.6);
    sparks(DIAL.x, DIAL.y, 14, { dist: 230, size: 1.2, dur: 650 });
    animIn(label, [{ transform: "scale(1.3)", color: "#fff3c4" }, { transform: "scale(1)", color: "#ffbb58" }], { duration: 380, easing: EASE_OUT });

    fillSlot(k - 1, 160);
    if (k === TAPS) {
      // треснувшая монета чинится: вспышка — и на её месте целая
      anim(broken, [
        { opacity: 1, transform: "scale(1)", filter: "brightness(1)" },
        { opacity: 1, transform: "scale(1.15)", filter: "brightness(2.2)", offset: 0.5 },
        { opacity: 0, transform: "scale(1.3)", filter: "brightness(3)" },
      ], { duration: 420, delay: 260, easing: "ease-out" });
      fillSlot(0, 440);
    }
  }

  function fillSlot(i, delay) {
    anim(coins[i], [
      { opacity: 0, transform: "scale(0.2) rotate(-90deg)" },
      { opacity: 1, transform: "scale(1.22) rotate(10deg)", offset: 0.6 },
      { opacity: 1, transform: "scale(1) rotate(0deg)" },
    ], { duration: 460, delay: delay, easing: "ease-out" });
    anim(checks[i], [
      { opacity: 0, transform: "scale(2.2) rotate(-14deg)" },
      { opacity: 1, transform: "scale(0.9) rotate(0deg)", offset: 0.7 },
      { opacity: 1, transform: "scale(1)" },
    ], { duration: 320, delay: delay + 360, easing: "ease-in" });
    var sx = PANEL.x + SLOT_X[i], sy = PANEL.y + SLOT_Y;
    sparks(sx, sy, 12, { dist: 150, delay: delay + 140, dur: 600 });
    setTimeout(function () { ripple(sx, sy, 1.6); }, delay);
  }

  function openSafe() {
    done = true;
    P.setIdle(false);
    // тряска — и дверь распахивается с золотым светом изнутри
    anim(safe, [
      { transform: "none" },
      { transform: "translate(-8px,0) rotate(-0.8deg)" },
      { transform: "translate(8px,0) rotate(0.8deg)" },
      { transform: "translate(-6px,0) rotate(-0.5deg)" },
      { transform: "translate(6px,0) rotate(0.5deg)" },
      { transform: "none" },
    ], { duration: 420, easing: "ease-in-out" });

    P.wait(380).then(function () {
      stage.classList.add("open");
      anim(door, [
        { transform: "rotateY(0deg)" },
        { transform: "rotateY(-84deg)", offset: 0.75 },
        { transform: "rotateY(-78deg)" },
      ], { duration: 900, easing: "cubic-bezier(.2,.7,.3,1)" });
      anim($("sfInterior"), [{ opacity: 0 }, { opacity: 1 }], { duration: 300 });
      P.flash(0.85);
      anim($("glowBack"), [{ opacity: 0 }, { opacity: 1 }], { duration: 700 });
      anim($("raysBack"), [{ opacity: 0 }, { opacity: 0.75 }], { duration: 900 });
      anim(tapText, [{ opacity: 1 }, { opacity: 0 }], { duration: 300 });
      // свет из проёма и вспышка у замка
      sparks(540, 860, 40, { jx: 300, jy: 320, dist: 280, size: 1.3, dur: 1100, stagger: 500, gravity: -80 });
      sparks(DIAL.x, DIAL.y, 26, { dist: 420, size: 1.6, dur: 1000 });
      return P.wait(1250);
    }).then(P.showPopup);
  }

  P.boot({
    start: function () { P.setIdle(true); },
    press: press,
    // ?state=1..3 — прокрутить нажатия; ?state=popup — сразу к попапу
    qa: function (s) {
      var n = s === "popup" ? TAPS : parseInt(s, 10) || 0;
      (function next() { if (taps < n) { if (!busy) doTap(); setTimeout(next, 120); } })();
    },
  });
})(window.P);
