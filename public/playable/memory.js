// Сценарий «Мемори». Восемь карт рубашкой вверх; на старте все на миг
// открываются («Запомни!») и переворачиваются обратно. Тап открывает карту;
// две одинаковые — светятся и остаются открытыми, разные — встряхиваются и
// закрываются. Четыре пары — выигрыш и попап.
(function (P) {
  "use strict";
  var $ = P.$, T = P.T, anim = P.anim, animIn = P.animIn, sparks = P.sparks, ripple = P.ripple, SYM = P.SYM;
  var KINDS = ["seven", "cherry", "diamond", "coin"];
  var COLS = 4, CW = 210, CH = 290, GAP = 24;
  var PEEK = 1500;

  var stage = P.stage, label = $("label"), tapText = $("tapText");

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var k = (Math.random() * (i + 1)) | 0, t = a[i]; a[i] = a[k]; a[k] = t; }
    return a;
  }

  var deck = shuffle(KINDS.concat(KINDS));
  var cards = deck.map(function (kind, i) {
    var c = document.createElement("div");
    c.className = "card";
    c.style.left = (i % COLS) * (CW + GAP) + "px";
    c.style.top = Math.floor(i / COLS) * (CH + GAP) + "px";
    c.setAttribute("data-i", i);
    c.innerHTML =
      '<div class="flip"><div class="face back">' + SYM.star + '</div><div class="face front">' + (SYM[kind] || SYM.bell) + "</div></div>";
    $("grid").appendChild(c);
    return { el: c, kind: kind, open: false, matched: false };
  });

  var total = KINDS.length, found = 0, ready = false, busy = false, done = false, first = null;
  function count() { label.textContent = (T.pairs || "") + found + "/" + total; }
  count();

  function flip(card, on) {
    card.open = on;
    card.el.classList.toggle("open", on);
  }

  function press(e) {
    if (!ready || busy || done) return;
    var el = e && e.target && e.target.closest ? e.target.closest(".card") : null;
    if (!el) return;
    var card = cards[+el.getAttribute("data-i")];
    if (card.open || card.matched) return;
    P.setIdle(false);
    flip(card, true);
    if (!first) { first = card; return; }

    var a = first, b = card;
    first = null;
    busy = true;
    setTimeout(function () {
      if (a.kind === b.kind) match(a, b);
      else miss(a, b);
    }, 420);
  }

  function match(a, b) {
    a.matched = b.matched = true;
    a.el.classList.add("matched");
    b.el.classList.add("matched");
    found++;
    count();
    animIn(label, [{ transform: "scale(1.3)", color: "#fff3c4" }, { transform: "scale(1)", color: "#ffbb58" }], { duration: 380 });
    [a, b].forEach(function (c) {
      var p = P.pos(c.el);
      ripple(p.x, p.y, 1.6);
      sparks(p.x, p.y, 14, { dist: 200, size: 1.1, dur: 700 });
    });
    busy = false;
    if (found === total) return win();
    P.scheduleHint(2600);
  }

  function miss(a, b) {
    [a, b].forEach(function (c) {
      animIn(c.el, [
        { transform: "none" }, { transform: "translateX(-12px) rotate(-2deg)" }, { transform: "translateX(10px) rotate(2deg)" },
        { transform: "translateX(-5px)" }, { transform: "none" },
      ], { duration: 380, easing: "ease-out" });
    });
    setTimeout(function () {
      flip(a, false);
      flip(b, false);
      busy = false;
      P.scheduleHint(2600);
    }, 520);
  }

  function win() {
    done = true;
    stage.classList.add("won");
    if (T.won) label.textContent = T.won;
    P.flash(0.65);
    anim($("glowBack"), [{ opacity: 0 }, { opacity: 1 }], { duration: 700 });
    anim($("raysBack"), [{ opacity: 0 }, { opacity: 0.75 }], { duration: 900 });
    anim(tapText, [{ opacity: 1 }, { opacity: 0 }], { duration: 300 });
    // Волна по картам слева направо.
    cards.forEach(function (c, i) {
      animIn(c.el, [{ transform: "none" }, { transform: "translateY(-30px) scale(1.06)", offset: 0.4 }, { transform: "none" }], {
        duration: 520, delay: (i % COLS) * 90 + Math.floor(i / COLS) * 60, easing: "ease-out",
      });
    });
    var g = P.pos($("grid"));
    sparks(g.x, g.y, 40, { jx: 440, jy: 300, dist: 220, size: 1.3, dur: 1100, stagger: 600, gravity: -60 });
    P.wait(1600).then(P.showPopup);
  }

  P.boot({
    start: function () {
      // Подсмотреть: все карты открываются — запомни — и закрываются.
      P.setGradText(tapText, P.rich(T.memo || ""));
      setTimeout(function () { cards.forEach(function (c) { flip(c, true); }); }, 350);
      setTimeout(function () {
        cards.forEach(function (c) { flip(c, false); });
        P.setGradText(tapText, P.rich(T.tap || ""));
        animIn(tapText, [{ transform: "scale(1.12)" }, { transform: "scale(1)" }], { duration: 300 });
        ready = true;
        P.scheduleHint(1200);
      }, 350 + PEEK);
    },
    press: press,
    qa: function (s) {
      if (s === "popup") {
        ready = true;
        cards.forEach(function (c) { c.matched = true; c.el.classList.add("matched"); });
        found = total;
        count();
        win();
      }
    },
  });
})(window.P);
