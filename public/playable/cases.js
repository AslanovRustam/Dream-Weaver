// Сценарий «Кейс». Тап — кейс вздрагивает, крышка открывается, лента
// предметов срывается с места и долго тормозит под маркером. Первый раз
// встаёт на фиолетовом предмете, а легендарка (золото) замирает в
// соседней ячейке — «почти!». Второй раз лента останавливается ровно на
// легендарке: ячейка светится, вспышка, искры — и попап.
//
// Ленту каждый раз собираем заново: что будет под маркером, решает
// сценарий, а не случай.
(function (P) {
  "use strict";
  var $ = P.$, T = P.T, anim = P.anim, animIn = P.animIn, sparks = P.sparks, ripple = P.ripple;
  var OPENS = 2, CARD = 200, GAP = 20, STEP = CARD + GAP, COUNT = 64, STOP = 52;
  var KINDS = ["coin", "cherry", "bell", "bar", "seven", "diamond"];
  var stage = P.stage, reel = $("reel"), label = $("label"), tapText = $("tapText");

  /** Обычные предметы: редкость и символ — вразнобой, но без золота. */
  function common() {
    var r = Math.random();
    return { rar: r < 0.5 ? 1 : r < 0.8 ? 2 : r < 0.94 ? 3 : 4, kind: KINDS[(Math.random() * 5) | 0] };
  }
  var LEGEND = { rar: 5, kind: "diamond" };

  function build(plan) {
    var html = "";
    for (var i = 0; i < COUNT; i++) {
      var it = plan[i] || common();
      html += '<div class="item r' + it.rar + '" style="left:' + i * STEP + 'px" data-i="' + i + '">' + P.sym(it.kind, KINDS) + "</div>";
    }
    reel.innerHTML = html;
    // Лента в покое: первая ячейка — под маркером.
    reel.style.transform = "translateX(" + (centerX() - CARD / 2) + "px)";
  }
  function centerX() { var m = $("marker"); return m.offsetLeft + m.offsetWidth / 2 - $("strip").offsetLeft; }

  label.textContent = (T.opensLeft || "") + OPENS;
  var opens = 0, busy = false, done = false;

  function plan1() {
    var p = {};
    p[STOP] = { rar: 2, kind: "seven" };
    p[STOP + 1] = LEGEND; // проедет рядом
    p[STOP - 9] = LEGEND; // и мелькнёт по пути — дразнит
    return p;
  }
  function plan2() {
    var p = {};
    p[STOP] = LEGEND;
    p[STOP - 1] = { rar: 4, kind: "bar" };
    p[STOP + 1] = { rar: 3, kind: "bell" };
    return p;
  }

  function openCrate() {
    animIn($("crate"), [
      { transform: "none" }, { transform: "rotate(-4deg) scale(1.04)" }, { transform: "rotate(4deg) scale(1.04)" },
      { transform: "rotate(-2deg)" }, { transform: "none" },
    ], { duration: 420 });
    anim($("crateLid"), [{ transform: "none" }, { transform: "translateY(-14px) rotate(-12deg)" }], { duration: 420, delay: 300, easing: "cubic-bezier(.3,1.4,.5,1)" });
    anim($("crateGlow"), [{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: 380 });
  }
  function closeCrate() {
    $("crateLid").getAnimations().forEach(function (a) { a.cancel(); });
    $("crateGlow").getAnimations().forEach(function (a) { a.cancel(); });
  }

  function roll(near) {
    var x0 = centerX() - CARD / 2;
    // Под маркером — центр STOP-й ячейки; на «почти» — у самого её края.
    var jitter = near ? CARD * 0.36 : (Math.random() - 0.5) * CARD * 0.3;
    var x1 = centerX() - CARD / 2 - STOP * STEP - jitter;
    return reel.animate(
      [{ transform: "translateX(" + x0 + "px)" }, { transform: "translateX(" + x1 + "px)" }],
      { duration: 5200, easing: "cubic-bezier(.08,.62,.12,1)", fill: "forwards" },
    ).finished;
  }

  function press() {
    if (busy || done || opens >= OPENS) return;
    busy = true;
    opens++;
    P.setIdle(false);
    label.textContent = (T.opensLeft || "") + (OPENS - opens);
    animIn(tapText, [{ transform: "scale(1.12)" }, { transform: "scale(1)" }], { duration: 300 });
    var first = opens === 1;
    reel.getAnimations().forEach(function (a) { a.cancel(); });
    build(first ? plan1() : plan2());
    openCrate();
    P.wait(600).then(function () { return roll(first); }).then(function () {
      var hit = reel.querySelector('[data-i="' + STOP + '"]');
      var p = P.pos(hit);
      if (first) {
        hit.classList.add("near");
        var gold = reel.querySelector('[data-i="' + (STOP + 1) + '"]');
        if (gold) animIn(gold, [{ transform: "none" }, { transform: "translateY(-12px)" }, { transform: "none" }], { duration: 500 });
        ripple(p.x, p.y, 1.2);
        P.setGradText(tapText, P.rich(T.tryAgain || ""));
        P.wait(900).then(function () {
          closeCrate();
          busy = false;
          P.scheduleHint(1500);
        });
      } else {
        hit.classList.add("win");
        win(p);
      }
    });
  }

  function win(p) {
    done = true;
    stage.classList.add("won");
    if (T.won) label.textContent = T.won;
    P.flash(0.7);
    anim($("glowBack"), [{ opacity: 0 }, { opacity: 1 }], { duration: 700 });
    anim($("raysBack"), [{ opacity: 0 }, { opacity: 0.75 }], { duration: 900 });
    anim(tapText, [{ opacity: 1 }, { opacity: 0 }], { duration: 300 });
    ripple(p.x, p.y, 2.6);
    sparks(p.x, p.y, 44, { spread: 3, dist: 420, size: 1.5, dur: 1200, gravity: 200, stagger: 400 });
    P.wait(1700).then(P.showPopup);
  }

  build({});
  P.onLayout(function () { if (!busy && !done) build({}); });
  P.boot({
    start: function () { P.setIdle(true); },
    press: press,
    qa: function (s) {
      if (s === "popup") { opens = OPENS - 1; press(); }
    },
  });
})(window.P);
