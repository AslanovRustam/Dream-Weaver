// Сценарий «Кости». Цель — дубль шестёрок. Тап — стакан трясётся и
// опрокидывается, два 3D-кубика вылетают на сукно по дуге с отскоком,
// кувыркаются и ложатся нужной гранью вверх. Первый бросок — 6 и 5
// («Почти! Ещё бросок»), второй — 6 и 6: кубики светятся, вспышка, искры —
// попап. Грани — CSS 3D, итоговый поворот считается от выпавшего числа.
(function (P) {
  "use strict";
  var $ = P.$, T = P.T, anim = P.anim, animIn = P.animIn, sparks = P.sparks, ripple = P.ripple;
  var ROLLS = 2;
  var stage = P.stage, cup = $("cup"), label = $("label"), tapText = $("tapText");
  var dice = [$("dieA"), $("dieB")];

  // Точки на гранях: ячейки сетки 3×3 (1…9), где стоит точка.
  var PIPS = { 1: [5], 2: [3, 7], 3: [3, 5, 7], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
  function face(n) {
    var h = "";
    for (var c = 1; c <= 9; c++) h += PIPS[n].indexOf(c) >= 0 ? '<i style="grid-area:' + (Math.ceil(c / 3)) + " / " + (((c - 1) % 3) + 1) + '"></i>' : "";
    return '<div class="face f' + n + '">' + h + "</div>";
  }
  dice.forEach(function (d) { d.firstElementChild.innerHTML = face(1) + face(2) + face(3) + face(4) + face(5) + face(6); });

  /** Поворот куба, при котором грань n смотрит на нас; плюс лёгкий наклон «на столе». */
  var SHOW = { 1: [0, 0], 2: [0, -90], 3: [-90, 0], 4: [90, 0], 5: [0, 90], 6: [0, 180] };
  var TILT = "rotateX(-24deg) rotateY(28deg)";

  label.textContent = (T.goal || "") + "6 + 6";
  var rolls = 0, busy = false, done = false;

  function roll(d, value, i, from) {
    var cube = d.firstElementChild;
    var s = SHOW[value], spinX = s[0] + 720 + i * 360, spinY = s[1] + 1080 - i * 360;
    var dx = from.x - (d.offsetLeft + d.offsetWidth / 2), dy = from.y - (d.offsetTop + d.offsetHeight / 2);
    // Вылет из стакана по дуге с двумя отскоками.
    var path = anim(d, [
      { transform: "translate(" + dx + "px," + dy + "px) scale(.4)", opacity: 0 },
      { transform: "translate(" + dx * 0.5 + "px," + (dy * 0.5 - 220) + "px) scale(.85)", opacity: 1, offset: 0.35 },
      { transform: "translate(0px,0px) scale(1)", opacity: 1, offset: 0.62 },
      { transform: "translate(" + (i ? 18 : -18) + "px,-70px) scale(1)", opacity: 1, offset: 0.78 },
      { transform: "translate(0px,0px) scale(1)", opacity: 1, offset: 0.9 },
      { transform: "translate(0px,-14px)", opacity: 1, offset: 0.95 },
      { transform: "none", opacity: 1 },
    ], { duration: 1500, easing: "ease-out" });
    var tumble = anim(cube, [
      { transform: TILT + " rotateX(0deg) rotateY(0deg)" },
      { transform: TILT + " rotateX(" + spinX + "deg) rotateY(" + spinY + "deg)" },
    ], { duration: 1500, easing: "cubic-bezier(.2,.7,.3,1)" });
    return Promise.all([path.finished, tumble.finished]);
  }

  function press() {
    if (busy || done || rolls >= ROLLS) return;
    busy = true;
    rolls++;
    P.setIdle(false);
    animIn(tapText, [{ transform: "scale(1.12)" }, { transform: "scale(1)" }], { duration: 300 });
    var first = rolls === 1;
    var values = first ? [6, 5] : [6, 6];
    dice.forEach(function (d) { d.classList.remove("hot"); });
    // Трясём и опрокидываем стакан.
    animIn(cup, [
      { transform: "none" }, { transform: "rotate(-14deg) translateY(-20px)" }, { transform: "rotate(12deg) translateY(-20px)" },
      { transform: "rotate(-10deg) translateY(-20px)" }, { transform: "rotate(8deg)" }, { transform: "rotate(-100deg) translate(40px,40px)" }, { transform: "none" },
    ], { duration: 1500, easing: "ease-in-out" });
    var mouth = P.pos(cup, 0.5, 0.85);
    P.wait(620)
      .then(function () {
        return Promise.all(dice.map(function (d, i) { return roll(d, values[i], i, mouth); }));
      })
      .then(function () {
        label.textContent = (T.sum || "") + (values[0] + values[1]);
        animIn(label, [{ transform: "scale(1.3)" }, { transform: "scale(1)" }], { duration: 380 });
        dice.forEach(function (d) {
          var p = P.pos(d);
          ripple(p.x, p.y, 1.2);
        });
        if (first) {
          dice[0].classList.add("hot");
          P.setGradText(tapText, P.rich(T.tryAgain || ""));
          busy = false;
          P.scheduleHint(1500);
        } else {
          dice.forEach(function (d) { d.classList.add("hot"); });
          win();
        }
      });
  }

  function win() {
    done = true;
    stage.classList.add("won");
    P.flash(0.7);
    anim($("glowBack"), [{ opacity: 0 }, { opacity: 1 }], { duration: 700 });
    anim($("raysBack"), [{ opacity: 0 }, { opacity: 0.75 }], { duration: 900 });
    anim(tapText, [{ opacity: 1 }, { opacity: 0 }], { duration: 300 });
    dice.forEach(function (d) {
      var p = P.pos(d);
      sparks(p.x, p.y, 28, { spread: 3, dist: 380, size: 1.4, dur: 1200, gravity: 200, stagger: 400 });
    });
    P.wait(1700).then(P.showPopup);
  }

  P.boot({
    start: function () { P.setIdle(true); },
    press: press,
    qa: function (s) {
      if (s === "popup") { rolls = ROLLS - 1; press(); }
    },
  });
})(window.P);
