// Сценарий «Бласт». Поле 7×7 самоцветов четырёх цветов. Тап по группе из
// двух и больше одинаковых соседей — группа вспыхивает и лопается, искры,
// «+N»; камни сверху осыпаются с отскоком, новые падают из-за края.
// Одиночный камень только вздрагивает. 30 камней — выигрыш.
//
// Поле генерируется кучками одного цвета, а новые камни чаще повторяют
// цвет соседа снизу — так крупные группы есть всегда. Рука показывает на
// самую крупную.
(function (P) {
  "use strict";
  var $ = P.$, T = P.T, anim = P.anim, animIn = P.animIn, sparks = P.sparks, ripple = P.ripple;
  var N = 7, S = 132, COLORS = 4, GOAL = 30;
  var stage = P.stage, box = $("tiles"), label = $("label"), tapText = $("tapText"), hand = $("hand");

  var grid = [];
  function rnd(n) { return (Math.random() * n) | 0; }

  // ---- поле кучками: есть за что зацепиться (группа от 3), но и не всё
  // в одну кучу (больше 7 — партия кончится одним тапом).
  function largest(cols) {
    var seen = {}, best = 0;
    for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) {
      if (seen[r + ":" + c]) continue;
      var n = 0, stack = [[r, c]], col = cols[r][c];
      while (stack.length) {
        var p = stack.pop(), k = p[0] + ":" + p[1];
        if (seen[k] || !cols[p[0]] || cols[p[0]][p[1]] !== col) continue;
        seen[k] = true;
        n++;
        stack.push([p[0] - 1, p[1]], [p[0] + 1, p[1]], [p[0], p[1] - 1], [p[0], p[1] + 1]);
      }
      if (n > best) best = n;
    }
    return best;
  }
  var colors, tries = 0, big;
  do {
    colors = [];
    for (var r = 0; r < N; r++) { colors.push([]); for (var c = 0; c < N; c++) colors[r].push(rnd(COLORS)); }
    for (r = 0; r < N; r++) for (c = 0; c < N; c++) {
      if (Math.random() < 0.4) {
        var nb = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].filter(function (p) { return p[0] >= 0 && p[0] < N && p[1] >= 0 && p[1] < N; });
        var p = nb[rnd(nb.length)];
        colors[r][c] = colors[p[0]][p[1]];
      }
    }
    big = largest(colors);
  } while ((big < 3 || big > 7) && ++tries < 60);

  // Самоцветы от ИИ — если набор полный; иначе CSS-камни.
  var GEMS = ["g0", "g1", "g2", "g3", "g4"];
  var ART_GEMS = (P.CFG.symbols || []).length >= 4;
  function paint(el, color) {
    el.className = "tile c" + color + (ART_GEMS ? " art" : "");
    el.innerHTML = ART_GEMS ? P.sym(GEMS[color], GEMS) : "";
  }
  function makeTile(color, row, col, fromRow) {
    var el = document.createElement("div");
    paint(el, color);
    el.style.left = col * S + "px";
    el.style.top = (fromRow == null ? row : fromRow) * S + "px";
    box.appendChild(el);
    var t = { el: el, color: color, r: row, c: col };
    el._t = t;
    return t;
  }
  for (r = 0; r < N; r++) { grid.push([]); for (c = 0; c < N; c++) grid[r].push(makeTile(colors[r][c], r, c)); }

  var count = 0, busy = false, done = false;
  function setCount() { label.textContent = (T.blasted || "") + Math.min(count, GOAL) + "/" + GOAL; }
  setCount();

  function group(t) {
    var seen = {}, out = [], stack = [t];
    while (stack.length) {
      var x = stack.pop(), key = x.r + ":" + x.c;
      if (seen[key]) continue;
      seen[key] = true;
      out.push(x);
      [[x.r - 1, x.c], [x.r + 1, x.c], [x.r, x.c - 1], [x.r, x.c + 1]].forEach(function (p) {
        var y = grid[p[0]] && grid[p[0]][p[1]];
        if (y && y.color === t.color && !seen[p[0] + ":" + p[1]]) stack.push(y);
      });
    }
    return out;
  }

  /** Рука — над самой крупной группой. */
  function pointHand() {
    var best = null, size = 0, seen = {};
    for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) {
      var t = grid[r][c];
      if (!t || seen[r + ":" + c]) continue;
      var g = group(t);
      g.forEach(function (x) { seen[x.r + ":" + x.c] = true; });
      if (g.length > size) { size = g.length; best = g[(g.length / 2) | 0]; }
    }
    if (!best) return;
    var p = P.pos(best.el);
    hand.style.left = p.x - 40 + "px";
    hand.style.top = p.y - 10 + "px";
  }
  P.onLayout(function () { requestAnimationFrame(pointHand); });

  function floatText(x, y, txt) {
    var t = document.createElement("div");
    t.textContent = txt;
    t.style.cssText = "position:absolute;left:" + x + "px;top:" + (y - 40) + "px;width:240px;margin-left:-120px;text-align:center;font-weight:900;font-size:72px;color:#ffe08a;text-shadow:0 4px 0 #5a2a06,0 0 20px rgba(255,200,80,.8);pointer-events:none";
    $("fx").appendChild(t);
    var a = t.animate([{ transform: "translateY(0) scale(.6)", opacity: 1 }, { transform: "translateY(-40px) scale(1.15)", opacity: 1, offset: 0.3 }, { transform: "translateY(-170px)", opacity: 0 }], { duration: 900, easing: "ease-out" });
    a.onfinish = t.remove.bind(t);
  }

  function press(e) {
    if (busy || done) return;
    var el = e && e.target && e.target.closest ? e.target.closest(".tile") : null;
    if (!el || !el._t) return;
    P.setIdle(false);
    var g = group(el._t);
    if (g.length < 2) {
      el.classList.remove("nudge");
      void el.offsetWidth;
      el.classList.add("nudge");
      P.scheduleHint(1500);
      return;
    }
    busy = true;
    count += g.length;
    setCount();
    animIn(label, [{ transform: "scale(1.25)" }, { transform: "scale(1)" }], { duration: 260 });
    var cx = 0, cy = 0;
    g.forEach(function (t) {
      var p = P.pos(t.el);
      cx += p.x; cy += p.y;
      sparks(p.x, p.y, 5, { dist: 150, size: 0.9, dur: 550 });
      t.el.classList.add("pop");
      grid[t.r][t.c] = null;
    });
    cx /= g.length; cy /= g.length;
    floatText(cx, cy, "+" + g.length);
    if (g.length >= 6) { ripple(cx, cy, 2.2); P.flash(0.3); }
    if (!started) { started = true; P.setGradText(tapText, P.rich(T.go || "")); }

    setTimeout(function () {
      g.forEach(function (t) { t.el.remove(); });
      collapse();
      setTimeout(function () {
        busy = false;
        if (count >= GOAL) return win();
        pointHand();
        P.scheduleHint(1600);
      }, 420);
    }, 200);
  }
  var started = false;

  /** Камни осыпаются вниз, пустоты сверху заполняются новыми. */
  function collapse() {
    for (var c = 0; c < N; c++) {
      var col = [];
      for (var r = N - 1; r >= 0; r--) if (grid[r][c]) col.push(grid[r][c]);
      var row = N - 1;
      col.forEach(function (t) {
        grid[row][c] = t;
        t.r = row;
        t.el.style.top = row * S + "px";
        row--;
      });
      var fresh = [];
      for (var k = 0; row >= 0; row--, k++) {
        var below = grid[row + 1] && grid[row + 1][c];
        var color = below && Math.random() < 0.4 ? below.color : rnd(COLORS);
        var t = makeTile(color, row, c, -1 - k);
        grid[row][c] = t;
        fresh.push(t);
      }
      if (fresh.length) {
        void box.offsetWidth; // старт из-за края, потом — на место
        fresh.forEach(function (t) { t.el.style.top = t.r * S + "px"; });
      }
    }
  }

  function win() {
    done = true;
    stage.classList.add("won");
    if (T.won) label.textContent = T.won;
    P.flash(0.65);
    anim($("glowBack"), [{ opacity: 0 }, { opacity: 1 }], { duration: 700 });
    anim($("raysBack"), [{ opacity: 0 }, { opacity: 0.75 }], { duration: 900 });
    anim(tapText, [{ opacity: 1 }, { opacity: 0 }], { duration: 300 });
    // Всё поле вспыхивает волной.
    for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) {
      var t = grid[r][c];
      if (t) animIn(t.el, [{ transform: "none" }, { transform: "scale(1.15)", filter: "brightness(1.8)", offset: 0.4 }, { transform: "none" }], { duration: 500, delay: (r + c) * 45 });
    }
    var b = P.pos($("board"));
    sparks(b.x, b.y, 44, { jx: 420, jy: 420, dist: 240, size: 1.4, dur: 1100, stagger: 600, gravity: -60 });
    P.wait(1700).then(P.showPopup);
  }

  P.boot({
    start: function () { pointHand(); P.setIdle(true); },
    press: press,
    qa: function (s) { if (s === "popup") { count = GOAL; setCount(); win(); } },
  });
})(window.P);
