// Сценарий «Пенальти». Тап или свайп — удар туда, куда показал игрок:
// свайп — по его направлению до линии ворот, тап — в точку касания (в
// пределах створа). Первый мяч вратарь достаёт и отбивает — «почти!».
// Второй уходит в ту же точку, а вратарь прыгает не в ту сторону: сетка
// вздрагивает, искры — и попап.
//
// Полёт — цепочка квадратичных кривых в координатах сцены, как в
// «Баскетболе»: мяч уменьшается к воротам (глубина).
(function (P) {
  "use strict";
  var $ = P.$, T = P.T, anim = P.anim, animIn = P.animIn, sparks = P.sparks, ripple = P.ripple;
  var KICKS = 2;
  var stage = P.stage, ball = $("ball"), keeper = $("keeper"), label = $("label"), tapText = $("tapText");
  if (P.art("ball")) ball.innerHTML = P.aiImg(P.art("ball"));
  if (P.art("keeper")) keeper.innerHTML = P.aiImg(P.art("keeper"));

  /** Точки — из раскладки: в вертикали и горизонтали они свои. */
  function rest() { return { x: ball.offsetLeft + ball.offsetWidth / 2, y: ball.offsetTop + ball.offsetHeight / 2 }; }

  label.textContent = (T.kicksLeft || "") + KICKS;

  /** Створ ворот в координатах сцены (без штанг и сетки по краям). */
  function mouth() {
    var g = $("goal");
    return { l: g.offsetLeft + 110, r: g.offsetLeft + g.offsetWidth - 110, t: g.offsetTop + 90, b: g.offsetTop + g.offsetHeight - 70 };
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  /**
   * Куда бить. Свайп (палец ушёл дальше 30 px) — продолжаем его направление до
   * линии ворот; тап выше мяча — в саму точку; тап по мячу или
   * без координат — в верхний угол со стороны тапа. Всё зажимаем в створ.
   */
  function aimFrom(S, a, b) {
    var M = mouth(), x, y;
    if (a && b && Math.hypot(b.x - a.x, b.y - a.y) > 30 && b.y < a.y) {
      var gy = (M.t + M.b) / 2;
      x = S.x + (b.x - a.x) * (S.y - gy) / (a.y - b.y);
      // палец дошёл до ворот — бьём прямо туда; нет — в верхнюю треть створа
      y = b.y < M.b && b.y > M.t ? b.y : M.t + (M.b - M.t) * 0.3;
    } else if (a && a.y < S.y - 120) {
      x = a.x; y = a.y;
    } else {
      var side = a ? (a.x < S.x ? -1 : 1) : 1;
      x = side < 0 ? M.l + 40 : M.r - 40; y = M.t + 40;
    }
    return { x: clamp(x, M.l, M.r), y: clamp(y, M.t, M.b) };
  }
  function pt(e) {
    var t = e && (e.changedTouches && e.changedTouches[0] || e.touches && e.touches[0]) || e;
    return t && t.clientX != null ? P.toStage(t.clientX, t.clientY) : null;
  }
  /** Дождаться, куда уведут палец: отпустили, ушли далеко или прошло 450 мс. */
  function gesture(e) {
    var a = pt(e);
    return new Promise(function (resolve) {
      if (!a) { resolve([null, null]); return; }
      var last = a, finished = false;
      function end() {
        if (finished) return;
        finished = true;
        ["pointermove", "touchmove", "mousemove"].forEach(function (n) { window.removeEventListener(n, move); });
        ["pointerup", "touchend", "mouseup", "pointercancel"].forEach(function (n) { window.removeEventListener(n, up); });
        resolve([a, last]);
      }
      function move(ev) { var p = pt(ev); if (p) last = p; if (Math.hypot(last.x - a.x, last.y - a.y) > 160) end(); }
      function up(ev) { var p = pt(ev); if (p) last = p; end(); }
      ["pointermove", "touchmove", "mousemove"].forEach(function (n) { window.addEventListener(n, move); });
      ["pointerup", "touchend", "mouseup", "pointercancel"].forEach(function (n) { window.addEventListener(n, up); });
      setTimeout(end, 450);
    });
  }

  var rot = 0;
  function place(S, p, s) {
    ball.style.transform = "translate(" + (p.x - S.x).toFixed(1) + "px," + (p.y - S.y).toFixed(1) + "px) scale(" + s.toFixed(3) + ") rotate(" + rot.toFixed(0) + "deg)";
  }

  /** Пролететь по кривым: seg = { to, c, dur, s0, s1 }. */
  function fly(S, from, segs) {
    return segs.reduce(function (chain, seg) {
      return chain.then(function () {
        var p0 = from;
        from = seg.to;
        return new Promise(function (resolve) {
          var t0 = 0;
          function frame(t) {
            if (!t0) t0 = t;
            var u = Math.min(1, (t - t0) / seg.dur), v = 1 - u;
            var p = {
              x: v * v * p0.x + 2 * v * u * seg.c.x + u * u * seg.to.x,
              y: v * v * p0.y + 2 * v * u * seg.c.y + u * u * seg.to.y,
            };
            rot += 12;
            place(S, p, seg.s0 + (seg.s1 - seg.s0) * u);
            if (u < 1) requestAnimationFrame(frame); else resolve();
          }
          requestAnimationFrame(frame);
        });
      });
    }, Promise.resolve());
  }

  /** Снять прежние прыжки: их fill держал бы позу и глушил CSS-покачивание. */
  function settle() { if (keeper.getAnimations) keeper.getAnimations().forEach(function (a) { a.cancel(); }); }
  function keeperX() { return keeper.offsetLeft + keeper.offsetWidth / 2; }
  /**
   * Прыжок вратаря на dx по горизонтали. Мяч почти по центру — прыгает вверх
   * на месте; иначе — в сторону, лёжа (чем дальше, тем ниже и горизонтальнее).
   */
  /**
   * Геометрия прыжка — от ворот и роста вратаря: поворот вокруг центра тела,
   * лёжа он занимает ±половину роста по горизонтали, поэтому сдвиг ограничен
   * так, чтобы и голова, и ноги остались в створе. tipX — куда тянется перчатка.
   */
  function reach(tipX) {
    var g = $("goal"), half = keeper.offsetHeight / 2, cx = keeperX();
    var lo = g.offsetLeft + 30 + half - cx, hi = g.offsetLeft + g.offsetWidth - 30 - half - cx;
    var dir = tipX < cx ? -1 : 1;
    return clamp(tipX - cx - dir * half * 0.9, lo, hi);
  }
  /** Высота центра лёжа: низкий мяч — бок на земле (линия ворот), высокий — на высоте мяча. */
  function liftTo(y) {
    var g = $("goal"), ground = g.offsetTop + g.offsetHeight - keeper.offsetWidth * 0.45;
    var cy = keeper.offsetTop + keeper.offsetHeight / 2;
    return Math.min(ground, Math.max(g.offsetTop + 120, y)) - cy;
  }
  function dive(dx, delay, high, y) {
    settle();
    var dir = dx < 0 ? -1 : 1, far = Math.min(1, Math.abs(dx) / 200);
    var dy = y == null ? liftTo(1e9) : liftTo(y);
    var end = Math.abs(dx) < 60
      ? "translate(" + dx.toFixed(0) + "px," + (high ? -110 : -40) + "px) scale(1.04)"
      : "translate(" + dx.toFixed(0) + "px," + dy.toFixed(0) + "px) rotate(" + (dir * (55 + 30 * far)).toFixed(0) + "deg)";
    return anim(keeper, [
      { transform: "none" },
      { transform: "translate(" + (dx * 0.16).toFixed(0) + "px,-30px) rotate(" + (dir * 18 * far).toFixed(0) + "deg)", offset: 0.3 },
      { transform: end },
    ], { duration: 520, delay: delay || 0, easing: "cubic-bezier(.2,.8,.3,1)" });
  }
  function standUp() {
    var from = getComputedStyle(keeper).transform;
    settle();
    anim(keeper, [{ transform: from }, { transform: "none" }], { duration: 380, easing: "ease-out" }).onfinish = settle;
  }

  var kicks = 0, busy = false, done = false;

  function press(e) {
    if (busy || done || kicks >= KICKS) return;
    busy = true;
    gesture(e).then(function (g) {
      kicks++;
      P.setIdle(false);
      label.textContent = (T.kicksLeft || "") + (KICKS - kicks);
      animIn(tapText, [{ transform: "scale(1.12)" }, { transform: "scale(1)" }], { duration: 300 });
      var S = rest(), A = aimFrom(S, g[0], g[1]);
      ball.classList.remove("behind");
      if (kicks === 1) saved(S, A); else scored(S, A);
    });
  }

  /** Изгиб полёта: мяч закручивается в сторону удара. */
  function ctrl(S, C) { return { x: (S.x + C.x) / 2 + (C.x - S.x) * 0.15, y: C.y + 130 }; }

  function saved(S, C) {
    var M = mouth(), mid = (M.t + M.b) / 2;
    // вратарь достаёт ровно туда, куда бьют; перчатка — у мяча
    // центр — прыжок вверх на месте; иначе — рыбкой к мячу, перчаткой к точке удара
    var near = Math.abs(C.x - keeperX()) < 120;
    dive(near ? clamp(C.x - keeperX(), -50, 50) : reach(C.x), 80, C.y < mid, C.y);
    var side = C.x < (M.l + M.r) / 2 ? -1 : 1;
    fly(S, S, [{ to: C, c: ctrl(S, C), dur: 520, s0: 1, s1: 0.52 }])
      .then(function () {
        // Перчатка — мяч отлетает за ворота, в сторону удара (по центру — над перекладиной).
        sparks(C.x, C.y, 12, { cls: "dust", dist: 140, gravity: 60 });
        ripple(C.x, C.y, 1.3);
        return fly(S, C, [
          { to: { x: C.x + 260 * side, y: C.y - 220 }, c: { x: C.x + 120 * side, y: C.y - 220 }, dur: 360, s0: 0.52, s1: 0.6 },
          { to: { x: C.x + 520 * side, y: S.y + 260 }, c: { x: C.x + 460 * side, y: C.y - 200 }, dur: 620, s0: 0.6, s1: 0.9 },
        ]);
      })
      .then(function () {
        standUp();
        ball.style.transform = "";
        animIn(ball, [{ opacity: 0, transform: "scale(.6)" }, { opacity: 1, transform: "none" }], { duration: 320 });
        P.setGradText(tapText, P.rich(T.tryAgain || ""));
        busy = false;
        P.scheduleHint(1500);
      });
  }

  function scored(S, C) {
    var M = mouth();
    // Мимо вратаря: удар по центру — уводим мяч от него в ближний угол по высоте;
    // вратарь прыгает в противоположную сторону.
    var kx = keeperX();
    if (Math.abs(C.x - kx) < 150) C = { x: C.x < kx ? Math.max(M.l, kx - 230) : Math.min(M.r, kx + 230), y: C.y };
    // не в ту сторону — до упора в створе, на землю
    dive(C.x < kx ? reach(1e9) : reach(-1e9), 160, false);
    fly(S, S, [{ to: C, c: ctrl(S, C), dur: 560, s0: 1, s1: 0.5 }])
      .then(function () {
        ball.classList.add("behind"); // в сетке — за штангами
        stage.classList.add("goal");
        win(C);
        return fly(S, C, [{ to: { x: C.x + 20, y: Math.min(C.y + 200, M.b + 40) }, c: { x: C.x - 10, y: C.y + 60 }, dur: 420, s0: 0.5, s1: 0.48 }]);
      });
  }

  function win(C) {
    done = true;
    stage.classList.add("won");
    if (T.won) label.textContent = T.won;
    P.flash(0.7);
    anim($("glowBack"), [{ opacity: 0 }, { opacity: 1 }], { duration: 700 });
    anim($("raysBack"), [{ opacity: 0 }, { opacity: 0.75 }], { duration: 900 });
    anim(tapText, [{ opacity: 1 }, { opacity: 0 }], { duration: 300 });
    ripple(C.x, C.y, 2.6);
    sparks(C.x, C.y, 40, { spread: 3, dist: 420, size: 1.5, dur: 1200, gravity: 200, stagger: 400 });
    sparks(540, 760, 30, { jx: 380, jy: 260, dist: 220, size: 1.2, dur: 1100, stagger: 600, gravity: -60 });
    P.wait(1700).then(P.showPopup);
  }

  P.boot({
    start: function () { P.setIdle(true); },
    press: press,
    qa: function (s) {
      if (s === "popup") { kicks = KICKS - 1; press(); }
    },
  });
})(window.P);
