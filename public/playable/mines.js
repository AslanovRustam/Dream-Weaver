// Сценарий «Мины» — как «оригинальные» игры крипто-казино. Поле 5×5,
// каждая открытая клетка с алмазом поднимает множитель. Первый раунд: два
// алмаза — и бомба («Бум! Ещё раунд»), бомбы показываются, поле
// закрывается. Второй раунд: четыре алмаза подряд — множитель ×10, поле
// раскрывается — и попап.
//
// Под клеткой нет заранее зашитого содержимого: что откроется, решает
// сценарий в момент нажатия — поэтому раунды всегда идут по плану.
(function (P) {
  "use strict";
  var $ = P.$, T = P.T, anim = P.anim, animIn = P.animIn, sparks = P.sparks, ripple = P.ripple;
  var N = 5, SIZE = 150, GAP = 18, PAD = 20;
  var MULTS = [1.3, 1.8, 2.6, 4.2, 10];
  var BOMBS = 3;
  var stage = P.stage, field = $("field"), label = $("label"), tapText = $("tapText");

  var BOMB =
    '<svg viewBox="0 0 200 200"><defs><radialGradient id="mnB" cx=".36" cy=".32" r=".8"><stop offset="0" stop-color="#6b6f7a"/><stop offset=".6" stop-color="#22252c"/><stop offset="1" stop-color="#08090c"/></radialGradient></defs>' +
    '<circle cx="96" cy="112" r="70" fill="url(#mnB)" stroke="#000" stroke-width="5"/>' +
    '<rect x="112" y="34" width="34" height="26" rx="6" transform="rotate(35 129 47)" fill="#5a5e68" stroke="#000" stroke-width="5"/>' +
    '<path d="M140 36 Q156 14 176 22" fill="none" stroke="#c9a46a" stroke-width="7" stroke-linecap="round"/>' +
    '<circle cx="178" cy="20" r="12" fill="#ffd34d"/><circle cx="178" cy="20" r="6" fill="#fff"/>' +
    '<ellipse cx="70" cy="86" rx="20" ry="12" fill="#fff" opacity=".35" transform="rotate(-35 70 86)"/></svg>';
  var GEM = P.art("gem") ? P.aiImg(P.art("gem"), "ai") : P.SYM.diamond;
  var BOMB_ART = P.art("bomb") ? P.aiImg(P.art("bomb"), "ai") : BOMB;

  // Закрытая клетка по теме (плита с руной, крышка ящика…); при открытии её заменит алмаз или бомба.
  var COVER = P.art("tile") ? P.aiImg(P.art("tile"), "ai cover") : "";
  var tiles = [];
  for (var i = 0; i < N * N; i++) {
    var t = document.createElement("div");
    t.className = "tile";
    t.style.left = PAD + (i % N) * (SIZE + GAP) + "px";
    t.style.top = PAD + Math.floor(i / N) * (SIZE + GAP) + "px";
    t.setAttribute("data-i", i);
    if (COVER) { t.classList.add("aiCover"); t.innerHTML = COVER; }
    field.appendChild(t);
    tiles.push({ el: t, open: false });
  }
  tiles[12].el.classList.add("hintTile");

  var round = 1, gems = 0, busy = false, done = false;
  function show(mult) { label.textContent = (T.mult || "×") + mult.toFixed(2); }
  show(1);

  function reveal(tile, kind) {
    tile.open = true;
    tile.el.innerHTML = kind === "gem" ? GEM : BOMB_ART;
    tile.el.classList.add("open", kind === "gem" ? "gem" : "boom");
  }
  function closedOnes() { return tiles.filter(function (x) { return !x.open; }); }
  function pickRandom(list, n) {
    var a = list.slice(), out = [];
    while (out.length < n && a.length) out.push(a.splice((Math.random() * a.length) | 0, 1)[0]);
    return out;
  }

  function press(e) {
    if (busy || done) return;
    var el = e && e.target && e.target.closest ? e.target.closest(".tile") : null;
    if (!el) return;
    var tile = tiles[+el.getAttribute("data-i")];
    if (tile.open) return;
    P.setIdle(false);
    tiles[12].el.classList.remove("hintTile");
    var p = P.pos(tile.el);
    if (round === 1 && gems === 2) return boom(tile, p);
    reveal(tile, "gem");
    gems++;
    show(MULTS[gems - 1]);
    animIn(label, [{ transform: "scale(1.25)", color: "#ffffff" }, { transform: "scale(1)", color: "#9ff1ff" }], { duration: 360 });
    ripple(p.x, p.y, 1.2);
    sparks(p.x, p.y, 12, { dist: 160, size: 1, dur: 650 });
    if (round === 2 && gems === 4) return win();
    P.scheduleHint(2400);
  }

  function boom(tile, p) {
    busy = true;
    reveal(tile, "bomb");
    P.flash(0.5);
    ripple(p.x, p.y, 2);
    sparks(p.x, p.y, 26, { cls: "dust", dist: 260, gravity: 120 });
    animIn(field, [
      { transform: "none" }, { transform: "translate(-14px,6px)" }, { transform: "translate(12px,-8px)" },
      { transform: "translate(-6px,4px)" }, { transform: "none" },
    ], { duration: 420 });
    // Остальные бомбы — показать, что было рядом.
    pickRandom(closedOnes(), BOMBS - 1).forEach(function (x, k) {
      setTimeout(function () { reveal(x, "bomb"); x.el.classList.add("ghost"); }, 260 + k * 140);
    });
    P.setGradText(tapText, P.rich(T.tryAgain || ""));
    setTimeout(function () {
      tiles.forEach(function (x, k) {
        setTimeout(function () {
          x.open = false;
          x.el.className = "tile";
          x.el.innerHTML = "";
        }, k * 18);
      });
      round = 2;
      gems = 0;
      show(1);
      busy = false;
      P.scheduleHint(1500);
    }, 1700);
  }

  function win() {
    done = true;
    stage.classList.add("won");
    if (T.won) label.textContent = T.won;
    P.flash(0.7);
    anim($("glowBack"), [{ opacity: 0 }, { opacity: 1 }], { duration: 700 });
    anim($("raysBack"), [{ opacity: 0 }, { opacity: 0.75 }], { duration: 900 });
    anim(tapText, [{ opacity: 1 }, { opacity: 0 }], { duration: 300 });
    // Поле раскрывается: бомбы — тусклые, остальное — алмазы.
    var rest = closedOnes(), bombs = pickRandom(rest, BOMBS);
    rest.forEach(function (x, k) {
      setTimeout(function () {
        reveal(x, bombs.indexOf(x) >= 0 ? "bomb" : "gem");
        x.el.classList.add("ghost");
      }, 200 + k * 35);
    });
    var f = P.pos(field);
    sparks(f.x, f.y, 44, { jx: 420, jy: 420, dist: 240, size: 1.4, dur: 1200, stagger: 600, gravity: -60 });
    P.wait(1900).then(P.showPopup);
  }

  P.boot({
    start: function () { P.setIdle(true); },
    press: press,
    qa: function (s) {
      if (s === "popup") {
        round = 2;
        gems = 3;
        press({ target: tiles[0].el });
      }
    },
  });
})(window.P);
