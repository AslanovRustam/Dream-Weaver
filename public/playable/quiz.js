// Сценарий «Викторина». Карточка с вопросом, под ней три ответа (верный —
// a1 из настроек, на экране порядок перемешан). Полоска времени утекает —
// просто для азарта: когда кончится, рука подскажет верный ответ. Неверный
// ответ краснеет и встряхивается — «попробуй ещё». Верный — зеленеет,
// конфетти, попап.
(function (P) {
  "use strict";
  var $ = P.$, T = P.T, anim = P.anim, animIn = P.animIn, sparks = P.sparks, ripple = P.ripple;
  var TIME = 8000;
  var stage = P.stage, box = $("answers"), tapText = $("tapText"), hand = $("hand");

  var list = [
    { text: T.a1 || "", right: true },
    { text: T.a2 || "", right: false },
    { text: T.a3 || "", right: false },
  ].filter(function (a) { return a.text.trim(); });
  for (var i = list.length - 1; i > 0; i--) { var k = (Math.random() * (i + 1)) | 0, t = list[i]; list[i] = list[k]; list[k] = t; }

  var rows = list.map(function (a, i) {
    var el = document.createElement("div");
    el.className = "ans";
    el.innerHTML = '<span class="k">' + "ABC".charAt(i) + '</span><span class="t"></span>';
    el.querySelector(".t").textContent = a.text;
    box.appendChild(el);
    a.el = el;
    return a;
  });
  var right = rows.filter(function (a) { return a.right; })[0];

  /** Рука — у верного ответа: конверсия важнее честной викторины. */
  function pointHand() {
    if (!right) return;
    var p = P.pos(right.el, 0.86, 0.45);
    hand.style.left = p.x - 40 + "px";
    hand.style.top = p.y - 10 + "px";
  }
  P.onLayout(function () { requestAnimationFrame(pointHand); });

  var done = false, busy = false;

  function press(e) {
    if (done || busy) return;
    var el = e && e.target && e.target.closest ? e.target.closest(".ans") : null;
    if (!el) return;
    var a = rows.filter(function (r) { return r.el === el; })[0];
    if (!a || a.el.classList.contains("wrong")) return;
    P.setIdle(false);
    animIn(a.el, [{ transform: "scale(1)" }, { transform: "scale(.96)" }, { transform: "scale(1)" }], { duration: 160 });
    if (a.right) return win(a);
    busy = true;
    a.el.classList.add("wrong");
    animIn(a.el, [
      { transform: "none" }, { transform: "translateX(-16px)" }, { transform: "translateX(14px)" },
      { transform: "translateX(-8px)" }, { transform: "none" },
    ], { duration: 420, easing: "ease-out" });
    var p = P.pos(a.el, 0.1, 0.5);
    sparks(p.x, p.y, 10, { cls: "dust", dist: 140, gravity: 80 });
    P.setGradText(tapText, P.rich(T.tryAgain || ""));
    animIn(tapText, [{ transform: "scale(1.12)" }, { transform: "scale(1)" }], { duration: 300 });
    setTimeout(function () { a.el.classList.add("dim"); busy = false; P.scheduleHint(900); }, 450);
  }

  function confetti() {
    var colors = ["#ff3b5c", "#ffd23c", "#6dff9a", "#2fd4ff", "#b48cff", "#ff8a3c"];
    var W = P.isLand() ? 1920 : 1080;
    for (var i = 0; i < 70; i++) {
      var c = document.createElement("div");
      c.className = "confetti";
      c.style.background = colors[i % colors.length];
      c.style.left = Math.random() * W + "px";
      c.style.top = "-60px";
      $("fx").appendChild(c);
      var dx = (Math.random() - 0.5) * 300, rot = (Math.random() - 0.5) * 1440, fall = 1100 + Math.random() * 900;
      var a = c.animate([
        { transform: "translate(0,0) rotate(0)", opacity: 1 },
        { transform: "translate(" + dx + "px," + fall + "px) rotate(" + rot + "deg)", opacity: 0.9 },
      ], { duration: 1600 + Math.random() * 1200, delay: Math.random() * 500, easing: "cubic-bezier(.2,.6,.4,1)", fill: "backwards" });
      a.onfinish = c.remove.bind(c);
    }
  }

  function win(a) {
    done = true;
    stage.classList.add("won");
    a.el.classList.add("right");
    rows.forEach(function (r) { if (r !== a) r.el.classList.add("dim"); });
    timer.cancel();
    var p = P.pos(a.el);
    P.flash(0.55);
    anim($("glowBack"), [{ opacity: 0 }, { opacity: 1 }], { duration: 700 });
    anim($("raysBack"), [{ opacity: 0 }, { opacity: 0.7 }], { duration: 900 });
    anim(tapText, [{ opacity: 1 }, { opacity: 0 }], { duration: 300 });
    animIn(a.el, [{ transform: "scale(1)" }, { transform: "scale(1.08)", offset: 0.4 }, { transform: "scale(1)" }], { duration: 500, easing: "ease-out" });
    ripple(p.x, p.y, 3);
    sparks(p.x, p.y, 30, { jx: 300, dist: 240, size: 1.3, dur: 1000 });
    confetti();
    P.wait(1700).then(P.showPopup);
  }

  var timer = { cancel: function () {} };
  P.boot({
    start: function () {
      pointHand();
      timer = anim($("timerBar"), [{ transform: "scaleX(1)" }, { transform: "scaleX(0)" }], { duration: TIME, easing: "linear" });
      timer.onfinish = function () { if (!done) { pointHand(); P.setIdle(true); } };
      P.scheduleHint(2600);
    },
    press: press,
    qa: function (s) { if (s === "popup" && right) win(right); },
  });
})(window.P);
