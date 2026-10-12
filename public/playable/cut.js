// Сценарий «Разрез». Снизу подлетают монеты, семёрки, бриллианты — палец
// режет их: светящийся след, предмет распадается на две половинки поперёк
// разреза, брызги золота, «+1». Бомбу резать нельзя: вспышка, «−1».
// Восемь разрезов — выигрыш. Тап по предмету тоже режет — для тех, кто не
// догадался провести пальцем.
(function (P) {
  "use strict";
  var $ = P.$, T = P.T, anim = P.anim, animIn = P.animIn, sparks = P.sparks, ripple = P.ripple, SYM = P.SYM;
  var GOAL = 8, G = 1700, HIT_R = 82, WAVE = 1050;
  var KINDS = ["coin", "seven", "diamond", "cherry", "star", "bell"];
  var BOMB =
    '<svg viewBox="0 0 200 200"><defs><radialGradient id="cuBomb" cx=".36" cy=".32" r=".8"><stop offset="0" stop-color="#6a6a78"/><stop offset=".5" stop-color="#26262e"/><stop offset="1" stop-color="#08080c"/></radialGradient></defs>' +
    '<rect x="88" y="26" width="30" height="30" rx="6" fill="#3a3a44" transform="rotate(20 103 41)"/>' +
    '<path d="M110 30 Q130 6 150 18" stroke="#c9a06a" stroke-width="7" fill="none" stroke-linecap="round"/>' +
    '<circle cx="152" cy="18" r="14" fill="#ff5a2c"/><circle cx="152" cy="18" r="7" fill="#fff"/>' +
    '<circle cx="100" cy="118" r="72" fill="url(#cuBomb)" stroke="#000" stroke-width="5"/>' +
    '<ellipse cx="76" cy="92" rx="18" ry="10" fill="#fff" opacity=".35" transform="rotate(-35 76 92)"/></svg>';

  var stage = P.stage, field = $("field"), box = $("objs"), canvas = $("trail"), ctx = canvas.getContext("2d");
  var label = $("label"), tapText = $("tapText");

  var W = 0, H = 0;
  function measure() {
    W = field.offsetWidth;
    H = field.offsetHeight;
    canvas.width = W;
    canvas.height = H;
  }
  P.onLayout(function () { requestAnimationFrame(measure); });

  var count = 0;
  function setCount() { label.textContent = (T.cutCount || "") + count + "/" + GOAL; }
  setCount();

  function toField(e) {
    var p = P.toStage(e.clientX, e.clientY), f = P.pos(field, 0, 0);
    return { x: p.x - f.x, y: p.y - f.y, t: performance.now() };
  }
  function toStagePt(x, y) { var f = P.pos(field, 0, 0); return { x: f.x + x, y: f.y + y }; }

  // ---- предметы и половинки
  var objs = [], halves = [], done = false, nextWave = 0;

  function toss() {
    var n = 1 + (Math.random() < 0.55 ? 1 : 0) + (Math.random() < 0.2 ? 1 : 0);
    for (var i = 0; i < n; i++) {
      var bomb = count >= 2 && Math.random() < 0.16;
      var x0 = 160 + Math.random() * (W - 320), y0 = H + 90;
      var apex = H * (0.12 + Math.random() * 0.28);
      var el = document.createElement("div");
      el.className = "obj";
      var kind = KINDS[(Math.random() * KINDS.length) | 0];
      el.innerHTML = bomb ? BOMB : SYM[kind];
      box.appendChild(el);
      objs.push({
        el: el, bomb: bomb, kind: kind, x: x0, y: y0,
        vx: (W / 2 - x0) * 0.45 + (Math.random() - 0.5) * 140,
        vy: -Math.sqrt(2 * G * (y0 - apex)),
        r: Math.random() * 360, vr: (Math.random() - 0.5) * 300,
      });
    }
  }

  function place(el, x, y, r) { el.style.transform = "translate(" + x.toFixed(1) + "px," + y.toFixed(1) + "px) rotate(" + r.toFixed(0) + "deg)"; }

  function slice(o, ang) {
    o.dead = true;
    o.el.remove();
    var s = toStagePt(o.x, o.y);
    if (o.bomb) {
      count = Math.max(0, count - 1);
      P.flash(0.35);
      sparks(s.x, s.y, 22, { cls: "dust", dist: 260, gravity: 40 });
      animIn(field, [{ transform: "none" }, { transform: "translate(-12px, 6px)" }, { transform: "translate(10px, -4px)" }, { transform: "none" }], { duration: 300 });
      floatText(s, "−1", true);
    } else {
      count++;
      sparks(s.x, s.y, 16, { dist: 200, size: 1.1, dur: 650 });
      ripple(s.x, s.y, 1.2);
      floatText(s, "+1");
      // Две половинки, разлетаются поперёк разреза.
      var deg = ang * 180 / Math.PI, nx = -Math.sin(ang), ny = Math.cos(ang);
      ["a", "b"].forEach(function (side, k) {
        var h = document.createElement("div");
        h.className = "half " + side;
        h.innerHTML = '<div class="clip" style="transform:rotate(' + deg.toFixed(0) + 'deg)"><div style="transform:rotate(' + (o.r - deg).toFixed(0) + 'deg)">' + SYM[o.kind] + "</div></div>";
        box.appendChild(h);
        var dir = k ? 1 : -1;
        halves.push({ el: h, x: o.x, y: o.y, vx: o.vx * 0.4 + nx * 300 * dir, vy: Math.min(o.vy, 0) * 0.3 + ny * 300 * dir - 150, r: 0, vr: dir * 240, born: performance.now() });
      });
    }
    setCount();
    animIn(label, [{ transform: "scale(1.25)" }, { transform: "scale(1)" }], { duration: 260 });
    if (count >= GOAL && !done) win();
  }

  function floatText(s, txt, bad) {
    var t = document.createElement("div");
    t.className = "plus" + (bad ? " bad" : "");
    t.textContent = txt;
    t.style.cssText = "position:absolute;left:" + s.x + "px;top:" + (s.y - 40) + "px;width:200px;margin-left:-100px;text-align:center;font-weight:900;font-size:64px;" +
      (bad ? "color:#ff6a5c;text-shadow:0 4px 0 #3a0a06" : "color:#ffe08a;text-shadow:0 4px 0 #5a2a06,0 0 20px rgba(255,200,80,.8)");
    $("fx").appendChild(t);
    var a = t.animate([{ transform: "translateY(0)", opacity: 1 }, { transform: "translateY(-150px)", opacity: 0 }], { duration: 800, easing: "ease-out" });
    a.onfinish = t.remove.bind(t);
  }

  // ---- след пальца и попадания
  var pressing = false, trail = [];

  function segHit(a, b, o) {
    var dx = b.x - a.x, dy = b.y - a.y, len = dx * dx + dy * dy;
    var t = len ? Math.max(0, Math.min(1, ((o.x - a.x) * dx + (o.y - a.y) * dy) / len)) : 0;
    var px = a.x + dx * t - o.x, py = a.y + dy * t - o.y;
    return px * px + py * py < HIT_R * HIT_R;
  }

  function addPoint(p) {
    var prev = trail[trail.length - 1];
    trail.push(p);
    if (!prev) return;
    var ang = Math.atan2(p.y - prev.y, p.x - prev.x);
    objs.forEach(function (o) { if (!o.dead && segHit(prev, p, o)) slice(o, ang); });
  }

  stage.addEventListener("pointermove", function (e) { if (pressing) addPoint(toField(e)); });
  window.addEventListener("pointerup", function () { pressing = false; });

  function drawTrail(now) {
    ctx.clearRect(0, 0, W, H);
    trail = trail.filter(function (p) { return now - p.t < 160; });
    if (trail.length < 2) return;
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (var i = 1; i < trail.length; i++) {
      var k = i / trail.length;
      ctx.beginPath();
      ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
      ctx.lineTo(trail[i].x, trail[i].y);
      ctx.strokeStyle = "rgba(255,240,190," + (0.25 + 0.75 * k).toFixed(2) + ")";
      ctx.shadowColor = "rgba(255,200,80,.9)"; ctx.shadowBlur = 24;
      ctx.lineWidth = 4 + 20 * k;
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
  }

  // ---- цикл
  var last = 0, running = false;
  function frame(t) {
    if (!running) return;
    var dt = last ? Math.min(0.05, (t - last) / 1000) : 0;
    last = t;
    if (!done && t >= nextWave) { toss(); nextWave = t + WAVE; }
    objs = objs.filter(function (o) {
      if (o.dead) return false;
      o.vy += G * dt; o.x += o.vx * dt; o.y += o.vy * dt; o.r += o.vr * dt;
      if (o.vy > 0 && o.y > H + 160) { o.el.remove(); return false; }
      place(o.el, o.x, o.y, o.r);
      return true;
    });
    halves = halves.filter(function (h) {
      h.vy += G * dt; h.x += h.vx * dt; h.y += h.vy * dt; h.r += h.vr * dt;
      var age = t - h.born;
      if (age > 1100 || h.y > H + 200) { h.el.remove(); return false; }
      place(h.el, h.x, h.y, h.r);
      h.el.style.opacity = age > 600 ? String(1 - (age - 600) / 500) : "1";
      return true;
    });
    drawTrail(performance.now());
    requestAnimationFrame(frame);
  }

  function press(e) {
    if (done || !e || e.clientX == null) return;
    pressing = true;
    P.setIdle(false);
    var p = toField(e);
    trail = [p];
    // Тап прямо по предмету тоже режет — горизонтально.
    objs.forEach(function (o) {
      if (!o.dead && (o.x - p.x) * (o.x - p.x) + (o.y - p.y) * (o.y - p.y) < HIT_R * HIT_R) slice(o, 0);
    });
    if (!started) {
      started = true;
      P.setGradText(tapText, P.rich(T.go || ""));
    }
  }
  var started = false;

  function win() {
    done = true;
    stage.classList.add("won");
    if (T.won) label.textContent = T.won;
    var c = P.pos(field);
    P.flash(0.65);
    anim($("glowBack"), [{ opacity: 0 }, { opacity: 1 }], { duration: 700 });
    anim($("raysBack"), [{ opacity: 0 }, { opacity: 0.75 }], { duration: 900 });
    anim(tapText, [{ opacity: 1 }, { opacity: 0 }], { duration: 300 });
    sparks(c.x, c.y, 44, { jx: 380, jy: 360, dist: 240, size: 1.4, dur: 1100, stagger: 600, gravity: -60 });
    P.wait(1700).then(function () { running = false; P.showPopup(); });
  }

  P.boot({
    start: function () {
      measure();
      running = true;
      requestAnimationFrame(frame);
      P.scheduleHint(600);
    },
    press: press,
    qa: function (s) {
      if (s === "popup") { count = GOAL; setCount(); win(); }
    },
  });
})(window.P);
