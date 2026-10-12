// Сценарий «Ловец». Первое касание запускает дождь: монеты и изредка бомбы.
// Котёл едет за пальцем (мышью — и без нажатия). Монета в котле — «+1»,
// бомба — котёл вспыхивает красным, «−1». Десять монет — выигрыш и попап.
//
// Чтобы выиграть мог любой, большая часть монет падает недалеко от котла,
// а бомбы — никогда прямо над ним.
(function (P) {
  "use strict";
  var $ = P.$, T = P.T, anim = P.anim, animIn = P.animIn, sparks = P.sparks, ripple = P.ripple, SYM = P.SYM;
  var GOAL = 10, SPAWN = 620, CATCH_R = 125;
  var BOMB =
    '<svg viewBox="0 0 200 200"><defs><radialGradient id="ctBomb" cx=".36" cy=".32" r=".8"><stop offset="0" stop-color="#6a6a78"/><stop offset=".5" stop-color="#26262e"/><stop offset="1" stop-color="#08080c"/></radialGradient></defs>' +
    '<rect x="88" y="26" width="30" height="30" rx="6" fill="#3a3a44" transform="rotate(20 103 41)"/>' +
    '<path d="M110 30 Q130 6 150 18" stroke="#c9a06a" stroke-width="7" fill="none" stroke-linecap="round"/>' +
    '<circle cx="152" cy="18" r="14" fill="#ffd23c"/><circle cx="152" cy="18" r="7" fill="#fff"/>' +
    '<circle cx="100" cy="118" r="72" fill="url(#ctBomb)" stroke="#000" stroke-width="5"/>' +
    '<ellipse cx="76" cy="92" rx="18" ry="10" fill="#fff" opacity=".35" transform="rotate(-35 76 92)"/></svg>';

  var stage = P.stage, field = $("field"), itemsBox = $("items"), pot = $("pot"), label = $("label"), tapText = $("tapText");

  if (P.art("pot")) { pot.innerHTML = P.aiImg(P.art("pot")); pot.classList.add("art"); }
  var W = 0, H = 0, potX = 0, targetX = 0, potY = 0;
  function measure() {
    W = field.offsetWidth;
    H = field.offsetHeight;
    potY = H - 190;
    if (!potX) potX = targetX = W / 2;
    potX = Math.min(Math.max(potX, 130), W - 130);
    targetX = Math.min(Math.max(targetX, 130), W - 130);
    placePot();
  }
  function placePot() { pot.style.transform = "translate(" + potX.toFixed(1) + "px," + potY + "px)"; }
  P.onLayout(function () { requestAnimationFrame(measure); });

  var count = 0;
  function setCount() { label.textContent = (T.caught || "") + count + "/" + GOAL; }
  setCount();

  // ---- ведение котла
  var dragging = false;
  function follow(e) {
    var p = P.toStage(e.clientX, e.clientY), f = P.pos(field, 0, 0);
    targetX = Math.min(Math.max(p.x - f.x, 130), W - 130);
  }
  stage.addEventListener("pointermove", function (e) { if (dragging || e.pointerType === "mouse") follow(e); });
  window.addEventListener("pointerup", function () { dragging = false; });

  // ---- падение
  var items = [], running = false, done = false, last = 0, nextSpawn = 0;

  function spawn() {
    var bomb = Math.random() < 0.22 && count > 1;
    var x;
    if (bomb) {
      do { x = 90 + Math.random() * (W - 180); } while (Math.abs(x - potX) < 230);
    } else if (Math.random() < 0.6) {
      x = Math.min(Math.max(potX + (Math.random() - 0.5) * 440, 90), W - 90);
    } else {
      x = 90 + Math.random() * (W - 180);
    }
    var el = document.createElement("div");
    el.className = "item" + (bomb ? " bomb" : "");
    el.innerHTML = bomb ? (P.art("bomb") ? P.aiImg(P.art("bomb")) : BOMB) : P.art("coin") ? P.aiImg(P.art("coin")) : SYM.coin;
    itemsBox.appendChild(el);
    items.push({ el: el, x: x, y: -80, v: 520 + count * 28 + Math.random() * 80, spin: (Math.random() - 0.5) * 360, a: 0, bomb: bomb });
  }

  function floatText(txt, bad) {
    var f = P.pos(field, 0, 0);
    var t = document.createElement("div");
    t.className = "plus" + (bad ? " bad" : "");
    t.textContent = txt;
    t.style.left = f.x + potX + "px";
    t.style.top = f.y + potY - 40 + "px";
    $("fx").appendChild(t);
    var a = t.animate([{ transform: "translateY(0)", opacity: 1 }, { transform: "translateY(-160px)", opacity: 0 }], { duration: 800, easing: "ease-out" });
    a.onfinish = t.remove.bind(t);
  }

  function caught(it) {
    var f = P.pos(field, 0, 0), x = f.x + potX, y = f.y + potY + 40;
    if (it.bomb) {
      count = Math.max(0, count - 1);
      pot.classList.remove("hurt");
      void pot.offsetWidth;
      pot.classList.add("hurt");
      sparks(x, y, 16, { cls: "dust", dist: 200, gravity: 60 });
      floatText("−1", true);
      animIn(field, [{ transform: "none" }, { transform: "translateX(-14px)" }, { transform: "translateX(12px)" }, { transform: "none" }], { duration: 300 });
    } else {
      count++;
      sparks(x, y, 12, { dist: 160, size: 1, dur: 600, angle: -Math.PI / 2, spread: 1.6 });
      floatText("+1");
      animIn(pot, [
        { transform: pot.style.transform + " scale(1)" }, { transform: pot.style.transform + " scale(1.12, .9)" }, { transform: pot.style.transform + " scale(1)" },
      ], { duration: 220 });
      stage.classList.toggle("full", count >= GOAL / 2);
    }
    setCount();
    animIn(label, [{ transform: "scale(1.25)" }, { transform: "scale(1)" }], { duration: 260 });
    if (count >= GOAL) win();
  }

  function frame(t) {
    if (!running) return;
    var dt = last ? Math.min(0.05, (t - last) / 1000) : 0;
    last = t;
    potX += (targetX - potX) * Math.min(1, dt * 14);
    placePot();
    if (!done && t >= nextSpawn) {
      spawn();
      nextSpawn = t + SPAWN * (0.8 + Math.random() * 0.4);
    }
    var mouth = potY + 40;
    items = items.filter(function (it) {
      var prev = it.y;
      it.y += it.v * dt;
      it.a += it.spin * dt;
      if (!done && prev < mouth && it.y >= mouth && Math.abs(it.x - potX) < CATCH_R) {
        it.el.remove();
        caught(it);
        return false;
      }
      if (it.y > H + 120) { it.el.remove(); return false; }
      it.el.style.transform = "translate(" + it.x.toFixed(1) + "px," + it.y.toFixed(1) + "px) rotate(" + it.a.toFixed(0) + "deg)";
      return true;
    });
    requestAnimationFrame(frame);
  }

  function press(e) {
    if (done) return;
    dragging = true;
    if (e && e.clientX != null) follow(e);
    if (!running) {
      running = true;
      P.setIdle(false);
      P.setGradText(tapText, P.rich(T.go || ""));
      animIn(tapText, [{ transform: "scale(1.12)" }, { transform: "scale(1)" }], { duration: 300 });
      requestAnimationFrame(frame);
    }
  }

  function win() {
    done = true;
    stage.classList.add("won", "full");
    items.forEach(function (it) { anim(it.el, [{ opacity: 1 }, { opacity: 0 }], { duration: 300 }); });
    if (T.won) label.textContent = T.won;
    var f = P.pos(field, 0, 0), x = f.x + potX, y = f.y + potY + 40;
    P.flash(0.65);
    anim($("glowBack"), [{ opacity: 0 }, { opacity: 1 }], { duration: 700 });
    anim($("raysBack"), [{ opacity: 0 }, { opacity: 0.75 }], { duration: 900 });
    anim(tapText, [{ opacity: 1 }, { opacity: 0 }], { duration: 300 });
    ripple(x, y, 2.6);
    sparks(x, y, 40, { angle: -Math.PI / 2, spread: 1.4, dist: 560, size: 1.6, dur: 1300, gravity: 260, stagger: 450 });
    P.wait(1600).then(function () { running = false; P.showPopup(); });
  }

  P.boot({
    start: function () {
      measure();
      P.setIdle(true);
    },
    press: press,
    qa: function (s) {
      if (s === "popup") { running = true; requestAnimationFrame(frame); count = GOAL; setCount(); win(); }
    },
  });
})(window.P);
