// Сценарий «Дартс». Мишень с секторами-призами медленно вращается, прицел
// ходит по ней. Тап или свайп вверх — бросок: дротик летит по дуге,
// уменьшаясь к мишени, и втыкается, мишень вздрагивает. Первый — в кольцо
// у самого яблочка («Почти!»), второй — в яблочко-джекпот: оно светится,
// вспышка, искры — попап. Воткнутые дротики вращаются вместе с мишенью.
(function (P) {
  "use strict";
  var $ = P.$, T = P.T, anim = P.anim, animIn = P.animIn, sparks = P.sparks, ripple = P.ripple;
  var THROWS = 2, N = 10, STEP = 360 / N;
  var stage = P.stage, board = $("board"), svg = $("boardSvg"), dart = $("dart"), aim = $("aim"), label = $("label"), tapText = $("tapText");
  // Дротик по теме; воткнутые — его копии (stick копирует innerHTML).
  if (P.art("dart")) dart.innerHTML = P.aiImg(P.art("dart"), "dartArt");

  // ---- мишень: 10 секторов с призами, кольца, яблочко
  function rad(a) { return (a - 90) * Math.PI / 180; }
  function pt(r, a) { return (r * Math.cos(rad(a))).toFixed(1) + " " + (r * Math.sin(rad(a))).toFixed(1); }
  var prizes = (T.sectors || "×2,50 FS,×5,100 FS,×3,20 FS,×10,200 FS,×2,75 FS").split(",");
  var h = '<circle r="410" fill="#14100c"/><circle r="404" fill="none" stroke="#c9a46a" stroke-width="8"/>';
  for (var i = 0; i < N; i++) {
    var a0 = i * STEP - STEP / 2, a1 = a0 + STEP;
    var col = i % 2 ? "#1d1a16" : "#efe2c4", ring = i % 2 ? "#0f8a3c" : "#c3121c";
    h += '<path d="M0 0 L' + pt(370, a0) + " A370 370 0 0 1 " + pt(370, a1) + 'Z" fill="' + col + '"/>';
    h += '<path d="M' + pt(330, a0) + " L" + pt(370, a0) + " A370 370 0 0 1 " + pt(370, a1) + " L" + pt(330, a1) + " A330 330 0 0 0 " + pt(330, a0) + 'Z" fill="' + ring + '"/>';
    h += '<path d="M' + pt(170, a0) + " L" + pt(200, a0) + " A200 200 0 0 1 " + pt(200, a1) + " L" + pt(170, a1) + " A170 170 0 0 0 " + pt(170, a0) + 'Z" fill="' + ring + '"/>';
    var tp = pt(265, i * STEP).split(" ");
    h += '<text x="' + tp[0] + '" y="' + tp[1] + '" transform="rotate(' + (i * STEP).toFixed(1) + " " + tp[0] + " " + tp[1] + ')" text-anchor="middle" dominant-baseline="middle" font-family="PInter,Arial" font-weight="900" font-size="40" fill="' + (i % 2 ? "#ffd34d" : "#7a1a06") + '">' + (prizes[i % prizes.length] || "").trim() + "</text>";
  }
  h += '<circle r="70" fill="#0f8a3c" stroke="#c9a46a" stroke-width="5"/><circle id="bull" r="36" fill="#ffd34d" stroke="#7a4510" stroke-width="5"/>';
  h += '<text y="4" text-anchor="middle" dominant-baseline="middle" font-family="PInter,Arial" font-weight="900" font-size="20" fill="#7a1a06">JACKPOT</text>';
  svg.innerHTML = h;

  label.textContent = (T.throwsLeft || "") + THROWS;

  // ---- вращение мишени и прицел
  var ang = 0, aimX = 0, aimDir = 1, throws = 0, busy = false, done = false;
  function centre() { return { x: board.offsetLeft + board.offsetWidth / 2, y: board.offsetTop + board.offsetHeight / 2, k: board.offsetWidth / 840 }; }
  (function spin() {
    ang += done ? 0.15 : 0.35;
    board.style.transform = "rotate(" + ang.toFixed(2) + "deg)";
    if (!busy && !done) {
      var c = centre();
      aimX += aimDir * 3.2;
      if (aimX > 220 * c.k) aimDir = -1;
      if (aimX < -220 * c.k) aimDir = 1;
      aim.style.transform = "translateX(" + aimX.toFixed(1) + "px)";
    }
    requestAnimationFrame(spin);
  })();

  /** Воткнуть дротик в мишень: точка в координатах мишени — с поправкой на текущий поворот. */
  function stick(c, p) {
    var dx = (p.x - c.x) / c.k, dy = (p.y - c.y) / c.k;
    var r = -ang * Math.PI / 180;
    var lx = dx * Math.cos(r) - dy * Math.sin(r), ly = dx * Math.sin(r) + dy * Math.cos(r);
    var s = document.createElement("div");
    s.className = "stuckDart";
    s.innerHTML = dart.innerHTML;
    s.style.left = (420 + lx) * c.k - 22 + "px";
    s.style.top = (420 + ly) * c.k + "px";
    s.style.transform = "rotate(" + (-ang + 8).toFixed(1) + "deg)";
    $("stuck").appendChild(s);
  }

  function press() {
    if (busy || done || throws >= THROWS) return;
    busy = true;
    throws++;
    P.setIdle(false);
    stage.classList.add("flying");
    label.textContent = (T.throwsLeft || "") + (THROWS - throws);
    animIn(tapText, [{ transform: "scale(1.12)" }, { transform: "scale(1)" }], { duration: 300 });
    var c = centre(), first = throws === 1;
    // Куда воткнётся: первый — в кольцо у яблочка, второй — в само яблочко.
    var target = first ? { x: c.x + aimX * 0.4 + 92 * c.k, y: c.y - 58 * c.k } : { x: c.x, y: c.y };
    var from = { x: dart.offsetLeft + dart.offsetWidth / 2, y: dart.offsetTop };
    var dx = target.x - from.x, dy = target.y - from.y;
    anim(dart, [
      { transform: "none" },
      { transform: "translate(" + dx * 0.5 + "px," + (dy * 0.5 - 120) + "px) scale(.75) rotate(4deg)", offset: 0.5 },
      { transform: "translate(" + dx + "px," + dy + "px) scale(.55) rotate(8deg)" },
    ], { duration: 520, easing: "cubic-bezier(.3,.6,.4,1)" }).finished.then(function () {
      dart.getAnimations().forEach(function (a) { a.cancel(); });
      stick(c, target);
      animIn(board, [{ transform: "rotate(" + ang + "deg)" }, { transform: "rotate(" + ang + "deg) scale(.97)" }, { transform: "rotate(" + ang + "deg)" }], { duration: 240 });
      ripple(target.x, target.y, first ? 1.3 : 2.6);
      if (first) {
        sparks(target.x, target.y, 12, { cls: "dust", dist: 120, gravity: 60 });
        P.setGradText(tapText, P.rich(T.tryAgain || ""));
        // Новый дротик — снизу.
        animIn(dart, [{ opacity: 0, transform: "translateY(80px)" }, { opacity: 1, transform: "none" }], { duration: 320 });
        stage.classList.remove("flying");
        busy = false;
        P.scheduleHint(1500);
      } else {
        dart.style.opacity = "0";
        win(target);
      }
    });
  }

  function win(p) {
    done = true;
    stage.classList.add("won");
    var bull = document.getElementById("bull");
    if (bull) bull.classList.add("bullWin");
    if (T.won) label.textContent = T.won;
    P.flash(0.7);
    anim($("glowBack"), [{ opacity: 0 }, { opacity: 1 }], { duration: 700 });
    anim($("raysBack"), [{ opacity: 0 }, { opacity: 0.75 }], { duration: 900 });
    anim(tapText, [{ opacity: 1 }, { opacity: 0 }], { duration: 300 });
    sparks(p.x, p.y, 46, { spread: 3, dist: 440, size: 1.5, dur: 1200, gravity: 200, stagger: 400 });
    P.wait(1600).then(P.showPopup);
  }

  P.boot({
    start: function () { P.setIdle(true); },
    press: press,
    qa: function (s) {
      if (s === "popup") { throws = THROWS - 1; press(); }
    },
  });
})(window.P);
