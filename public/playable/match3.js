// Сценарий «Три в ряд». Поле 7×7 из пяти видов самоцветов, на старте без
// готовых рядов, но с ходами. Свайп по камню или два тапа по соседям —
// обмен. Получился ряд от трёх — камни лопаются, «+N», сверху сыплются
// новые, бывают каскады. Не получился — камни возвращаются на место.
// 21 камень — выигрыш. Рука показывает рабочий ход и сама его «делает».
(function (P) {
  "use strict";
  var $ = P.$, T = P.T, anim = P.anim, animIn = P.animIn, sparks = P.sparks, ripple = P.ripple;
  var N = 7, S = 132, COLORS = 5, GOAL = 21, SWIPE = 45;
  var stage = P.stage, box = $("tiles"), label = $("label"), tapText = $("tapText"), hand = $("hand");
  function rnd(n) { return (Math.random() * n) | 0; }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // ---- поле: без готовых рядов, но с ходами
  function cols() {
    var m;
    do {
      m = [];
      for (var r = 0; r < N; r++) {
        m.push([]);
        for (var c = 0; c < N; c++) {
          var k;
          do { k = rnd(COLORS); } while (
            (c >= 2 && m[r][c - 1] === k && m[r][c - 2] === k) || (r >= 2 && m[r - 1][c] === k && m[r - 2][c] === k)
          );
          m[r].push(k);
        }
      }
    } while (movesIn(m).length < 3);
    return m;
  }
  function lineAt(m, r, c) {
    var k = m[r][c], h = 1, v = 1, i;
    for (i = c - 1; i >= 0 && m[r][i] === k; i--) h++;
    for (i = c + 1; i < N && m[r][i] === k; i++) h++;
    for (i = r - 1; i >= 0 && m[i][c] === k; i--) v++;
    for (i = r + 1; i < N && m[i][c] === k; i++) v++;
    return h >= 3 || v >= 3;
  }
  function movesIn(m) {
    var out = [];
    for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) {
      [[0, 1], [1, 0]].forEach(function (d) {
        var r2 = r + d[0], c2 = c + d[1];
        if (r2 >= N || c2 >= N) return;
        var t = m[r][c]; m[r][c] = m[r2][c2]; m[r2][c2] = t;
        if (lineAt(m, r, c) || lineAt(m, r2, c2)) out.push([r, c, r2, c2]);
        t = m[r][c]; m[r][c] = m[r2][c2]; m[r2][c2] = t;
      });
    }
    return out;
  }

  var grid = [];
  // Самоцветы от ИИ — если набор полный; иначе CSS-камни.
  var GEMS = ["g0", "g1", "g2", "g3", "g4"];
  var ART_GEMS = (P.CFG.symbols || []).length >= 5;
  function paint(el, color) {
    el.className = "tile c" + color + (ART_GEMS ? " art" : "");
    el.innerHTML = ART_GEMS ? P.sym(GEMS[color], GEMS) : "";
  }
  function makeTile(color, r, c, fromRow) {
    var el = document.createElement("div");
    paint(el, color);
    el.style.left = c * S + "px";
    el.style.top = (fromRow == null ? r : fromRow) * S + "px";
    box.appendChild(el);
    var t = { el: el, color: color, r: r, c: c };
    el._t = t;
    return t;
  }
  var start = cols();
  for (var r0 = 0; r0 < N; r0++) { grid.push([]); for (var c0 = 0; c0 < N; c0++) grid[r0].push(makeTile(start[r0][c0], r0, c0)); }
  function matrix() { return grid.map(function (row) { return row.map(function (t) { return t.color; }); }); }
  function put(t, r, c) { grid[r][c] = t; t.r = r; t.c = c; t.el.style.left = c * S + "px"; t.el.style.top = r * S + "px"; }

  var count = 0, busy = false, done = false, started = false;
  function setCount() { label.textContent = (T.collected || "") + Math.min(count, GOAL) + "/" + GOAL; }
  setCount();

  /** Рука — над камнем рабочего хода и тянет его к соседу. */
  function pointHand() {
    var mv = movesIn(matrix())[0];
    if (!mv) return;
    var a = P.pos(grid[mv[0]][mv[1]].el), b = P.pos(grid[mv[2]][mv[3]].el);
    hand.style.left = a.x - 40 + "px";
    hand.style.top = a.y - 10 + "px";
    hand.style.setProperty("--dx", b.x - a.x + "px");
    hand.style.setProperty("--dy", b.y - a.y + "px");
  }
  P.onLayout(function () { requestAnimationFrame(pointHand); });

  function matches() {
    var hit = [], m = matrix();
    for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) if (lineAt(m, r, c)) hit.push(grid[r][c]);
    return hit;
  }

  function floatText(x, y, txt) {
    var t = document.createElement("div");
    t.textContent = txt;
    t.style.cssText = "position:absolute;left:" + x + "px;top:" + (y - 40) + "px;width:240px;margin-left:-120px;text-align:center;font-weight:900;font-size:72px;color:#ffe08a;text-shadow:0 4px 0 #5a2a06,0 0 20px rgba(255,200,80,.8);pointer-events:none";
    $("fx").appendChild(t);
    var a = t.animate([{ transform: "translateY(0) scale(.6)", opacity: 1 }, { transform: "translateY(-40px) scale(1.15)", opacity: 1, offset: 0.3 }, { transform: "translateY(-170px)", opacity: 0 }], { duration: 900, easing: "ease-out" });
    a.onfinish = t.remove.bind(t);
  }

  function collapse() {
    for (var c = 0; c < N; c++) {
      var col = [];
      for (var r = N - 1; r >= 0; r--) if (grid[r][c]) col.push(grid[r][c]);
      var row = N - 1;
      col.forEach(function (t) { put(t, row--, c); });
      var fresh = [];
      for (var k = 0; row >= 0; row--, k++) {
        var t = makeTile(rnd(COLORS), row, c, -1 - k);
        grid[row][c] = t;
        fresh.push(t);
      }
      if (fresh.length) {
        void box.offsetWidth;
        fresh.forEach(function (t) { t.el.style.top = t.r * S + "px"; });
      }
    }
  }

  /** Лопнуть все ряды, осыпать, повторять, пока есть каскады. */
  function resolve(chain) {
    var hit = matches();
    if (!hit.length) return Promise.resolve();
    count += hit.length;
    setCount();
    animIn(label, [{ transform: "scale(1.25)" }, { transform: "scale(1)" }], { duration: 260 });
    var cx = 0, cy = 0;
    hit.forEach(function (t) {
      var p = P.pos(t.el);
      cx += p.x; cy += p.y;
      sparks(p.x, p.y, 5, { dist: 150, size: 0.9, dur: 550 });
      t.el.classList.add("pop");
      grid[t.r][t.c] = null;
    });
    cx /= hit.length; cy /= hit.length;
    floatText(cx, cy, (chain ? "×" + (chain + 1) + " " : "") + "+" + hit.length);
    if (chain) { ripple(cx, cy, 2); P.flash(0.25); }
    return wait(200).then(function () {
      hit.forEach(function (t) { t.el.remove(); });
      collapse();
      return wait(430);
    }).then(function () { return resolve(chain + 1); });
  }

  function trySwap(a, b) {
    if (busy || done) return;
    busy = true;
    P.setIdle(false);
    if (!started) { started = true; P.setGradText(tapText, P.rich(T.go || "")); }
    var ar = a.r, ac = a.c, br = b.r, bc = b.c;
    put(a, br, bc);
    put(b, ar, ac);
    wait(240).then(function () {
      if (!matches().length) {
        put(a, ar, ac);
        put(b, br, bc);
        [a, b].forEach(function (t) {
          animIn(t.el, [{ transform: "none" }, { transform: "rotate(-8deg)" }, { transform: "rotate(6deg)" }, { transform: "none" }], { duration: 320, delay: 200 });
        });
        return wait(450);
      }
      return resolve(0);
    }).then(function () {
      if (count >= GOAL) return win();
      if (!movesIn(matrix()).length) reshuffle();
      busy = false;
      pointHand();
      P.scheduleHint(1800);
    });
  }

  /** Ходов не осталось — новое поле (редко, но бывает). */
  function reshuffle() {
    var m = cols();
    for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) {
      var t = grid[r][c];
      t.color = m[r][c];
      paint(t.el, t.color);
    }
  }

  // ---- ввод: свайп по камню или два тапа по соседям
  var down = null, downPt = null, selected = null;
  function press(e) {
    if (busy || done) return;
    var el = e && e.target && e.target.closest ? e.target.closest(".tile") : null;
    if (!el || !el._t) return;
    down = el._t;
    downPt = P.toStage(e.clientX, e.clientY);
  }
  stage.addEventListener("pointermove", function (e) {
    if (!down) return;
    var p = P.toStage(e.clientX, e.clientY), dx = p.x - downPt.x, dy = p.y - downPt.y;
    if (Math.abs(dx) < SWIPE && Math.abs(dy) < SWIPE) return;
    var r = down.r + (Math.abs(dy) > Math.abs(dx) ? (dy > 0 ? 1 : -1) : 0);
    var c = down.c + (Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 1 : -1) : 0);
    var a = down;
    down = null;
    if (selected) { selected.el.classList.remove("sel"); selected = null; }
    if (grid[r] && grid[r][c]) trySwap(a, grid[r][c]);
  });
  window.addEventListener("pointerup", function () {
    if (!down) return;
    var t = down;
    down = null;
    if (selected && selected !== t && Math.abs(selected.r - t.r) + Math.abs(selected.c - t.c) === 1) {
      var a = selected;
      a.el.classList.remove("sel");
      selected = null;
      trySwap(a, t);
      return;
    }
    if (selected) selected.el.classList.remove("sel");
    selected = selected === t ? null : t;
    if (selected) { selected.el.classList.add("sel"); P.setIdle(false); }
  });

  function win() {
    done = true;
    stage.classList.add("won");
    if (T.won) label.textContent = T.won;
    P.flash(0.65);
    anim($("glowBack"), [{ opacity: 0 }, { opacity: 1 }], { duration: 700 });
    anim($("raysBack"), [{ opacity: 0 }, { opacity: 0.75 }], { duration: 900 });
    anim(tapText, [{ opacity: 1 }, { opacity: 0 }], { duration: 300 });
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
