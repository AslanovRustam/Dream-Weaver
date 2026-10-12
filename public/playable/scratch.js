// Сценарий «Скретч-карта». Палец стирает фольгу; под ней шесть ячеек, три из
// них — монеты. Когда стёрто больше половины, фольга сходит сама, монеты
// подсвечиваются и выезжает попап. Тап без движения тоже стирает — пятном.
(function (P) {
  "use strict";
  var $ = P.$, T = P.T, anim = P.anim, animIn = P.animIn, sparks = P.sparks, ripple = P.ripple, rnd = P.rnd;
  var stage = P.stage, foil = $("foil"), ctx = foil.getContext("2d"), tapText = $("tapText");

  var FW = 760, FH = 686; // фольга в пикселях сцены
  var ORIGIN = { x: 120 + 40, y: 540 + 40 }; // левый верхний угол фольги на сцене
  var CW = 236, CH = 330, GAP = 26;
  var REVEAL_AT = 0.55;

  var SYM = P.SYM;
  // Монеты стоят «уголком», чтобы их надо было искать по всей карте.
  var LAYOUT = ["coin", "seven", "coin", "cherry", "diamond", "coin"];
  var WIN = [0, 2, 5];

  var cells = [];
  (function () {
    var box = $("cells");
    for (var i = 0; i < 6; i++) {
      var c = document.createElement("div");
      c.className = "cell";
      c.style.left = (i % 3) * (CW + GAP) + "px";
      c.style.top = Math.floor(i / 3) * (CH + GAP) + "px";
      c.innerHTML = SYM[LAYOUT[i]] || SYM.bell;
      box.appendChild(c);
      cells.push(c);
    }
  })();

  // ---- фольга
  function drawFoil() {
    ctx.globalCompositeOperation = "source-over";
    var g = ctx.createLinearGradient(0, 0, FW, FH);
    g.addColorStop(0, "#e9edf2"); g.addColorStop(0.35, "#9aa3ad"); g.addColorStop(0.55, "#f4f6f8");
    g.addColorStop(0.8, "#8c949e"); g.addColorStop(1, "#d6dbe1");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, FW, FH);
    // мелкая штриховка — фольга, а не просто серый прямоугольник
    ctx.strokeStyle = "rgba(255,255,255,.18)"; ctx.lineWidth = 2;
    for (var x = -FH; x < FW; x += 14) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + FH, FH); ctx.stroke(); }
    for (var i = 0; i < 6; i++) {
      var cx = (i % 3) * (CW + GAP) + CW / 2, cy = Math.floor(i / 3) * (CH + GAP) + CH / 2;
      ctx.fillStyle = "rgba(90,98,110,.35)";
      ctx.beginPath(); ctx.arc(cx, cy, 78, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.85)";
      ctx.font = "900 110px PInter, Arial, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("?", cx, cy + 6);
    }
  }

  // ---- стирание
  var scratching = false, last = null, moves = 0, revealed = false, cleared = 0, warmed = false;
  function toFoil(e) {
    var r = stage.getBoundingClientRect(), s = r.width / P.W;
    return { x: (e.clientX - r.left) / s - ORIGIN.x, y: (e.clientY - r.top) / s - ORIGIN.y };
  }
  function brush(a, b, rad) {
    ctx.globalCompositeOperation = "destination-out";
    ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = rad * 2;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x + 0.01, b.y); ctx.stroke();
  }
  function onFoil(p) { return p.x > -60 && p.y > -60 && p.x < FW + 60 && p.y < FH + 60; }

  /** Доля стёртого — по прореженной сетке, чтобы не читать все пиксели. */
  function measure() {
    var data = ctx.getImageData(0, 0, FW, FH).data, clear = 0, total = 0;
    for (var y = 4; y < FH; y += 12) for (var x = 4; x < FW; x += 12) {
      total++;
      if (data[(y * FW + x) * 4 + 3] < 40) clear++;
    }
    return clear / total;
  }

  function dust(p) {
    if (Math.random() < 0.35) sparks(ORIGIN.x + p.x, ORIGIN.y + p.y, 2, { cls: "dust", dist: 70, gravity: 120, dur: 500 });
  }

  function press(e) {
    if (revealed) return;
    var p = toFoil(e);
    if (!onFoil(p)) return;
    scratching = true; last = p;
    P.setIdle(false);
    if (!warmed) { warmed = true; anim(tapText, [{ opacity: 1 }, { opacity: 0.35 }], { duration: 400 }); }
    brush(p, p, 70); // тап без движения — тоже пятно
    dust(p);
    check();
  }
  function move(e) {
    if (!scratching || revealed) return;
    var p = toFoil(e);
    brush(last, p, 58);
    last = p;
    dust(p);
    if (++moves % 6 === 0) check();
  }
  function up() {
    if (!scratching) return;
    scratching = false;
    check();
    if (!revealed) P.scheduleHint(2600);
  }
  function check() {
    cleared = measure();
    if (cleared >= REVEAL_AT) reveal();
  }
  stage.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", up);

  // ---- открытие и выигрыш
  function reveal() {
    if (revealed) return;
    revealed = true; scratching = false;
    P.setIdle(false);
    anim(foil, [{ opacity: 1 }, { opacity: 0 }], { duration: 500, easing: "ease-out" });
    P.wait(450).then(win);
  }

  function win() {
    stage.classList.add("won");
    P.flash(0.55);
    anim($("glowBack"), [{ opacity: 0 }, { opacity: 1 }], { duration: 700 });
    anim($("raysBack"), [{ opacity: 0 }, { opacity: 0.7 }], { duration: 900 });
    WIN.forEach(function (i, k) {
      var c = cells[i];
      setTimeout(function () {
        c.classList.add("win");
        animIn(c, [{ transform: "scale(1)" }, { transform: "scale(1.14)", offset: 0.4 }, { transform: "scale(1)" }], { duration: 450, easing: "ease-out" });
        var x = ORIGIN.x + parseFloat(c.style.left) + CW / 2, y = ORIGIN.y + parseFloat(c.style.top) + CH / 2;
        ripple(x, y, 2);
        sparks(x, y, 16, { dist: 220, size: 1.2, dur: 800 });
      }, 220 * k);
    });
    if (T.won) { P.setGradText(tapText, P.rich(T.won)); anim(tapText, [{ opacity: 0.35 }, { opacity: 1 }], { duration: 300 }); }
    else anim(tapText, [{ opacity: 0.35 }, { opacity: 0 }], { duration: 300 });
    sparks(540, 920, 30, { jx: 380, jy: 360, dist: 200, size: 1.2, dur: 1100, stagger: 600, gravity: -60 });
    P.wait(1700).then(P.showPopup);
  }

  P.boot({
    start: function () {
      drawFoil();
      P.scheduleHint(900);
    },
    press: press,
    qa: function (s) {
      if (s === "popup") reveal();
    },
  });
})(window.P);
