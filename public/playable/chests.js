// Сценарий «Сундуки». Три сундука покачиваются и блестят. Первый выбранный
// всегда пустой: крышка со скрипом приоткрывается, пыль, «Пусто». Потом
// сундук захлопывается и сундуки перемешиваются, как напёрстки, — игрок
// выбирает заново. Второй выбор всегда выигрышный: крышку срывает, бьёт
// свет, фонтан монет — и попап. Тап мимо сундуков засчитывается ближайшему.
(function (P) {
  "use strict";
  var $ = P.$, T = P.T, anim = P.anim, animIn = P.animIn, sparks = P.sparks, ripple = P.ripple;
  var TRIES = 2, W = 320;
  var LEFT = [30, 380, 730]; // левый край сундуков на сцене
  var stage = P.stage, label = $("label"), tapText = $("tapText"), hand = $("hand");

  var BODY =
    '<svg viewBox="0 0 320 190" aria-hidden="true">' +
    '<rect x="14" y="0" width="292" height="44" rx="10" fill="url(#chInside)"/>' +
    '<g class="loot">' +
    '<ellipse cx="160" cy="18" rx="150" ry="60" fill="url(#chGlow)"/>' +
    '<ellipse cx="110" cy="26" rx="34" ry="12" fill="url(#chCoin)"/><ellipse cx="160" cy="16" rx="36" ry="13" fill="url(#chCoin)"/>' +
    '<ellipse cx="210" cy="26" rx="34" ry="12" fill="url(#chCoin)"/><ellipse cx="135" cy="6" rx="30" ry="11" fill="url(#chCoin)"/>' +
    '<ellipse cx="188" cy="4" rx="30" ry="11" fill="url(#chCoin)"/><ellipse cx="160" cy="-8" rx="28" ry="10" fill="url(#chCoin)"/>' +
    "</g>" +
    '<rect x="6" y="20" width="308" height="166" rx="14" fill="url(#chWood)" stroke="#2a1004" stroke-width="4"/>' +
    '<path d="M10 72H310M10 124H310" stroke="#3e1a06" stroke-width="4" opacity=".7"/>' +
    '<rect x="6" y="20" width="308" height="16" rx="6" fill="url(#chGold)"/>' +
    '<rect x="6" y="170" width="308" height="16" rx="6" fill="url(#chGold)"/>' +
    '<rect x="38" y="20" width="28" height="166" fill="url(#chGold)"/><rect x="254" y="20" width="28" height="166" fill="url(#chGold)"/>' +
    '<rect x="126" y="30" width="68" height="84" rx="12" fill="url(#chGold)" stroke="#6a3008" stroke-width="4"/>' +
    '<circle cx="160" cy="62" r="11" fill="#2a1004"/><path d="M154 66h12l4 28h-20z" fill="#2a1004"/>' +
    '<circle cx="52" cy="40" r="5" fill="#fff6c8"/><circle cx="268" cy="40" r="5" fill="#fff6c8"/>' +
    '<circle cx="52" cy="160" r="5" fill="#fff6c8"/><circle cx="268" cy="160" r="5" fill="#fff6c8"/>' +
    "</svg>";
  var LID =
    '<svg viewBox="0 0 320 150" aria-hidden="true">' +
    '<path d="M6 150V84C6 26 80 8 160 8S314 26 314 84V150Z" fill="url(#chWood)" stroke="#2a1004" stroke-width="4"/>' +
    '<path d="M24 100C40 52 96 36 160 36S280 52 296 100" fill="none" stroke="#3e1a06" stroke-width="4" opacity=".6"/>' +
    '<path d="M38 150V64C40 50 50 38 66 30V150Z" fill="url(#chGold)"/><path d="M282 150V64C280 50 270 38 254 30V150Z" fill="url(#chGold)"/>' +
    '<rect x="6" y="132" width="308" height="18" rx="6" fill="url(#chGold)"/>' +
    '<rect x="134" y="104" width="52" height="46" rx="8" fill="url(#chGold)" stroke="#6a3008" stroke-width="4"/>' +
    '<path d="M60 40C110 14 210 14 260 40" stroke="#fff" stroke-width="6" fill="none" opacity=".25" stroke-linecap="round"/>' +
    "</svg>";

  var chests = LEFT.map(function (x, i) {
    var c = document.createElement("div");
    c.className = "chest";
    c.style.left = x + "px";
    c.setAttribute("data-i", i);
    c.innerHTML =
      '<div class="shadow"></div><div class="bob"><div class="beam"></div><div class="body">' + BODY +
      '</div><div class="lid">' + LID + '</div><div class="gleam"></div></div><div class="tag gt white"></div>';
    $("chests").appendChild(c);
    return c;
  });

  label.textContent = (T.triesLeft || "") + TRIES;

  var ART_CHEST = P.art("chest");
  if (ART_CHEST) {
    chests.forEach(function (c) {
      var bob = c.querySelector(".bob");
      bob.querySelector(".body").style.display = "none";
      bob.querySelector(".lid").style.display = "none";
      c.classList.add("aiArt");
      bob.querySelector(".beam").insertAdjacentHTML("afterend", '<div class="aiChest">' + P.aiImg(ART_CHEST, "shut") + (P.art("chestOpen") ? P.aiImg(P.art("chestOpen"), "open") : "") + (P.art("chestEmpty") ? P.aiImg(P.art("chestEmpty"), "empty") : "") + "</div>");
    });
  }

  /** Рука — над следующим закрытым сундуком (после первого выбора). */
  function moveHand() {
    if (!picks || done) return;
    // ближайший к середине сцены сундук — туда и показываем
    var mid = P.pos($("chests"), 0.5, 0.5).x, next = 0, best = 1e9;
    chests.forEach(function (ch, i) { var d = Math.abs(P.pos(ch, 0.5, 0.5).x - mid); if (d < best) { best = d; next = i; } });
    var c = centerOf(next);
    hand.style.left = c.x - 40 + "px";
    hand.style.top = c.y - 10 + "px";
  }
  P.onLayout(function () { requestAnimationFrame(moveHand); });

  var picks = 0, busy = false, done = false, opened = [false, false, false];

  function centerOf(i) { return P.pos(chests[i], 0.5, 0.47); }

  /** Какой сундук выбран: тот, что под пальцем, иначе ближайший закрытый. */
  function chosen(e) {
    var el = e && e.target && e.target.closest ? e.target.closest(".chest") : null;
    if (el && !opened[+el.getAttribute("data-i")]) return +el.getAttribute("data-i");
    var x = P.pos($("chests"), 0.5, 0.5).x;
    if (e && e.clientX != null) x = P.toStage(e.clientX, e.clientY).x;
    var best = -1, dist = 1e9;
    opened.forEach(function (o, i) {
      var d = Math.abs(centerOf(i).x - x);
      if (!o && d < dist) { dist = d; best = i; }
    });
    return best;
  }

  function shake(el, strength, dur) {
    return animIn(el.querySelector(".bob"), [
      { transform: "rotate(0)" }, { transform: "rotate(-" + strength + "deg)" }, { transform: "rotate(" + strength + "deg)" },
      { transform: "rotate(-" + strength / 2 + "deg)" }, { transform: "rotate(0)" },
    ], { duration: dur, easing: "ease-in-out" }).finished;
  }

  function press(e) {
    if (busy || done || picks >= TRIES) return;
    var i = chosen(e);
    if (i < 0) return;
    busy = true;
    picks++;
    opened[i] = true;
    P.setIdle(false);
    label.textContent = (T.triesLeft || "") + (TRIES - picks);
    var c = chests[i];
    c.classList.add("picked");
    if (picks === 1) openEmpty(c, i); else openWin(c, i);
  }

  function openEmpty(c, i) {
    var pt = centerOf(i);
    var lid = c.querySelector(".lid"), tag = c.querySelector(".tag");
    var empty = c.querySelector(".aiChest .empty"), shut = c.querySelector(".aiChest .shut");
    shake(c, 4, 420).then(function () {
      anim(lid, [
        { transform: "rotateX(0)" }, { transform: "rotateX(48deg)", offset: 0.6 }, { transform: "rotateX(40deg)" },
      ], { duration: 700, easing: "ease-out" });
      // Сундук от ИИ: открытый пустой — отдельной картинкой.
      if (empty) {
        anim(shut, [{ opacity: 1 }, { opacity: 0 }], { duration: 200 });
        anim(empty, [{ opacity: 0, transform: "scale(.94)" }, { opacity: 1, transform: "none" }], { duration: 320 });
      }
      sparks(pt.x, pt.y - 40, 14, { cls: "dust", dist: 160, gravity: -40, dur: 900 });
      P.setGradText(tag, P.rich(T.empty || ""));
      anim(tag, [{ opacity: 0, transform: "translateY(30px)" }, { opacity: 1, transform: "none" }], { duration: 400, delay: 300 });
      return P.wait(1300);
    }).then(function () {
      // Захлопнуть: крышка падает, картинка — обратно в закрытую, сундук снова яркий.
      anim(lid, [{ transform: "rotateX(40deg)" }, { transform: "rotateX(0)" }], { duration: 260, easing: "cubic-bezier(.5,0,.8,.4)" });
      if (empty) {
        anim(empty, [{ opacity: 1 }, { opacity: 0 }], { duration: 200 });
        anim(shut, [{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
      }
      anim(tag, [{ opacity: 1 }, { opacity: 0 }], { duration: 250 });
      c.classList.remove("picked");
      opened[i] = false;
      animIn(c.querySelector(".bob"), [{ transform: "translateY(0)" }, { transform: "translateY(10px) scaleY(.94)" }, { transform: "none" }], { duration: 260, delay: 220 });
      return P.wait(520);
    }).then(shuffle).then(function () {
      P.setGradText(tapText, P.rich(T.tryAgain || ""));
      animIn(tapText, [{ transform: "scale(1.12)" }, { transform: "scale(1)" }], { duration: 300 });
      stage.classList.remove("shuffling");
      moveHand();
      busy = false;
      P.scheduleHint(1400);
    });
  }

  /**
   * Напёрстки: несколько обменов местами, каждый — по дуге (один сундук
   * поверху, другой понизу). Позиции — в style.left, анимация — transform.
   */
  function swap(a, b, dur) {
    var ca = chests[a], cb = chests[b];
    var la = parseFloat(ca.style.left), lb = parseFloat(cb.style.left), dx = lb - la;
    var ease = "cubic-bezier(.45,0,.55,1)";
    var fa = anim(ca, [{ transform: "none" }, { transform: "translate(" + dx / 2 + "px,-70px) scale(1.06)" }, { transform: "translate(" + dx + "px,0)" }], { duration: dur, easing: ease });
    anim(cb, [{ transform: "none" }, { transform: "translate(" + -dx / 2 + "px,50px) scale(.94)" }, { transform: "translate(" + -dx + "px,0)" }], { duration: dur, easing: ease });
    ca.style.zIndex = 2;
    cb.style.zIndex = 1;
    return fa.finished.then(function () {
      ca.getAnimations().forEach(function (x) { x.cancel(); });
      cb.getAnimations().forEach(function (x) { x.cancel(); });
      ca.style.left = lb + "px";
      cb.style.left = la + "px";
      ca.style.zIndex = cb.style.zIndex = "";
    });
  }
  function shuffle() {
    stage.classList.add("shuffling");
    P.setGradText(tapText, P.rich(T.shuffle || ""));
    animIn(tapText, [{ transform: "scale(1.12)" }, { transform: "scale(1)" }], { duration: 300 });
    var plan = [[0, 1, 420], [1, 2, 380], [0, 2, 460], [1, 2, 360], [0, 1, 400]];
    return plan.reduce(function (p, s) {
      return p.then(function () { return swap(s[0], s[1], s[2]); });
    }, Promise.resolve());
  }

  /** Ореол и лучи — из открытого сундука, а не из центра сцены (выигрышным может оказаться крайний). */
  var winAt = -1;
  function aimFx() {
    if (winAt < 0) return;
    var p = centerOf(winAt);
    ["glowBack", "raysBack"].forEach(function (id) {
      var el = $(id);
      el.style.left = p.x - el.offsetWidth / 2 + "px";
      el.style.top = p.y - el.offsetHeight / 2 + "px";
    });
  }
  P.onLayout(function () { requestAnimationFrame(aimFx); });

  function openWin(c, i) {
    var pt = centerOf(i);
    done = true;
    winAt = i;
    aimFx();
    c.classList.add("winner");
    c.classList.remove("picked");
    shake(c, 7, 650).then(function () {
      stage.classList.add("won");
      P.flash(0.75);
      anim(c.querySelector(".lid"), [
        { transform: "none" },
        { transform: "translateY(-60px) rotateX(40deg)", offset: 0.3 },
        { transform: "translate(-40px, -330px) rotate(-28deg) rotateX(65deg)" },
      ], { duration: 700, easing: "cubic-bezier(.2,.8,.3,1)" });
      anim(c.querySelector(".loot"), [{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 150 });
      var open = c.querySelector(".aiChest .open"), shut = c.querySelector(".aiChest .shut");
      if (open) {
        anim(shut, [{ opacity: 1 }, { opacity: 0 }], { duration: 200, delay: 60 });
        anim(open, [{ opacity: 0, transform: "scale(.9)" }, { opacity: 1, transform: "scale(1.08)", offset: 0.6 }, { opacity: 1, transform: "none" }], { duration: 420, delay: 60 });
      }
      anim(c.querySelector(".beam"), [{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: 150 });
      anim($("glowBack"), [{ opacity: 0 }, { opacity: 1 }], { duration: 700 });
      anim($("raysBack"), [{ opacity: 0 }, { opacity: 0.75 }], { duration: 900 });
      anim(tapText, [{ opacity: 1 }, { opacity: 0 }], { duration: 300 });
      if (T.won) label.textContent = T.won;
      else anim($("spinPill"), [{ opacity: 1 }, { opacity: 0 }], { duration: 300 });
      ripple(pt.x, pt.y - 60, 2.6);
      // Фонтан монет из сундука.
      sparks(pt.x, pt.y - 60, 40, { angle: -Math.PI / 2, spread: 1.4, dist: 520, size: 1.6, dur: 1300, gravity: 260, stagger: 500 });
      var cc = P.pos($("chests"), 0.5, 0.47);
      sparks(cc.x, cc.y, 30, { jx: 420, jy: 360, dist: 200, size: 1.2, dur: 1100, stagger: 600, gravity: -60 });
      P.wait(1800).then(P.showPopup);
    });
  }

  P.boot({
    start: function () { P.setIdle(true); },
    press: press,
    qa: function (s) {
      if (s === "popup") { picks = 1; opened[0] = true; busy = false; press(null); }
    },
  });
})(window.P);
