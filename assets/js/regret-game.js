/* "Bake the best cake" game for teaching sequential decision making, used on /regret-game/. */
(function () {
  "use strict";

  // Fixed games. The seeds were chosen so that each maximum is away from the boundary
  // and each taste function has a tempting second peak.
  var SEEDS = [1, 3, 5, 7, 8];
  var BUDGET = 20;
  var TASTE_MAX = 5;
  var SUGAR = [0, 200];    // grams
  var OVEN = [150, 230];   // degrees Celsius
  var HEAT = 60;           // heat-map cells per side when the taste is revealed
  var BURNT = 1, NICE = 4.5; // taste thresholds for the cake pictures

  // SVG layout (viewBox units)
  var SQ_X = 140, SQ_Y = 28, SQ = 440;          // the recipe square
  var BAR_X = SQ_X + SQ + 24, BAR_W = 16;       // colour bar next to it

  var el = function (id) { return document.getElementById(id); };
  var plot = el("rg-plot");
  if (!plot) return;
  var ui = {
    game: el("rg-game"), restart: el("rg-restart"), toast: el("rg-toast"),
    status: el("rg-status"), summary: el("rg-summary"), table: el("rg-table")
  };

  // ------------------------------------------------------------ hidden taste

  function mulberry32(seed) {
    return function () {
      seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // A sum of random Gaussian bumps on [0, 1]^2; the seed fixes everything, so every
  // student sees the same function. Inputs are rescaled to grams and degrees only for display.
  function makeGame(number) {
    var rand = mulberry32(SEEDS[number - 1] * 7919 + 13 + 500009);
    var k = 6 + Math.floor(rand() * 4), bumps = [], i, j;
    for (j = 0; j < k; j++) {
      var c = [0.04 + 0.92 * rand(), 0.04 + 0.92 * rand()]; // drawn before a and w; the seeds depend on this order
      bumps.push({ a: 0.3 + 0.7 * rand(), c: c, w: 0.06 + 0.1 * rand() });
    }
    var raw = function (p) {
      var s = 0;
      for (var b = 0; b < bumps.length; b++) {
        var z1 = (p[0] - bumps[b].c[0]) / bumps[b].w, z2 = (p[1] - bumps[b].c[1]) / bumps[b].w;
        s += bumps[b].a * Math.exp(-0.5 * (z1 * z1 + z2 * z2));
      }
      return s;
    };

    var n = 201, rMin = Infinity, rMax = -Infinity, best = null;
    for (i = 0; i < n; i++) for (j = 0; j < n; j++) {
      var p = [i / (n - 1), j / (n - 1)], v = raw(p);
      if (v < rMin) rMin = v;
      if (v > rMax) { rMax = v; best = p; }
    }
    // The best cake always scores above NICE, so finding the peak earns the nice-cake picture.
    var bottom = 0.25 + 0.75 * rand(), top = 4.6 + 0.3 * rand();
    var f = function (p) { return bottom + (raw(p) - rMin) / (rMax - rMin) * (top - bottom); };

    var heat = [];
    for (i = 0; i < HEAT; i++) for (j = 0; j < HEAT; j++) heat.push(f([(j + 0.5) / HEAT, (i + 0.5) / HEAT]));
    return { number: number, f: f, xStar: best, fStar: top, heat: heat };
  }

  // ------------------------------------------------------------ recipe units

  function sugar(u) { return SUGAR[0] + u * (SUGAR[1] - SUGAR[0]); }
  function oven(u) { return OVEN[0] + u * (OVEN[1] - OVEN[0]); }

  // Snap a click to whole grams and whole degrees, so the recipe shown is exactly the one baked.
  function snap(p) {
    return [Math.round(sugar(p[0])) / (SUGAR[1] - SUGAR[0]), (Math.round(oven(p[1])) - OVEN[0]) / (OVEN[1] - OVEN[0])];
  }

  function recipe(p) {
    return Math.round(sugar(p[0])) + " g sugar, " + Math.round(oven(p[1])) + " °C";
  }

  // ------------------------------------------------------------------ colours

  var VIRIDIS = [[68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37]];

  function colour(v) {
    var t = Math.max(0, Math.min(1, v / TASTE_MAX)) * (VIRIDIS.length - 1), i = Math.min(Math.floor(t), VIRIDIS.length - 2), u = t - i;
    var rgb = [0, 1, 2].map(function (k) { return Math.round(VIRIDIS[i][k] + u * (VIRIDIS[i + 1][k] - VIRIDIS[i][k])); });
    return "rgb(" + rgb.join(",") + ")";
  }

  // ------------------------------------------------------------ cake pictures

  var NICE_CAKE =
    '<svg viewBox="0 0 120 100" aria-hidden="true">' +
    '<ellipse cx="60" cy="90" rx="52" ry="7" fill="#dfe3e6"/>' +
    '<rect x="16" y="54" width="88" height="34" rx="6" fill="#f3d19c"/>' +
    '<path d="M16 60q0-8 8-8h72q8 0 8 8v4q-4 6-8 0-4 8-9 0-5 7-10 0-5 9-10 0-5 6-10 0-5 8-10 0-5 6-10 0-5 7-9 0-4 6-8 0z" fill="#f48fb1"/>' +
    '<rect x="32" y="28" width="56" height="27" rx="5" fill="#f3d19c"/>' +
    '<path d="M32 33q0-6 6-6h44q6 0 6 6v3q-4 6-8 0-4 7-9 0-5 8-10 0-5 6-10 0-4 7-9 0-4 6-8 0z" fill="#fce4ec"/>' +
    '<path d="M60 14q4-8 12-9" stroke="#3a7d44" stroke-width="2" fill="none"/>' +
    '<circle cx="60" cy="20" r="7" fill="#d62839"/><circle cx="57.5" cy="17.5" r="2" fill="#fff" opacity=".6"/>' +
    '<g stroke-width="2.5" stroke-linecap="round"><path d="M28 76l4-2" stroke="#4fc3f7"/><path d="M48 80l3 2" stroke="#ffd54f"/>' +
    '<path d="M70 75l4 1" stroke="#81c784"/><path d="M88 79l3-3" stroke="#ba68c8"/><path d="M44 45l3 1" stroke="#4fc3f7"/><path d="M72 46l3-2" stroke="#ffd54f"/></g>' +
    '<g fill="#f6b93b"><path d="M14 22l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/><path d="M104 30l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5z"/><path d="M96 8l1 3 3 1-3 1-1 3-1-3-3-1 3-1z"/></g>' +
    '</svg>';

  var BURNT_CAKE =
    '<svg viewBox="0 0 120 100" aria-hidden="true">' +
    '<ellipse cx="60" cy="90" rx="52" ry="7" fill="#dfe3e6"/>' +
    '<path d="M14 86q-2-18 10-22 10-2 18 6 8 5 18 4 9-1 16-8 10-8 22-2 10 6 8 22z" fill="#4a2a17"/>' +
    '<path d="M22 70q10-4 20 4M66 72q12-10 28-6" stroke="#2a170c" stroke-width="2.5" fill="none" stroke-linecap="round"/>' +
    '<path d="M38 82l6-7 5 5 6-8M74 84l4-6 6 4" stroke="#1e1008" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<g stroke="#9aa1a6" stroke-width="3" fill="none" stroke-linecap="round" opacity=".75">' +
    '<path d="M40 56q-6-7 0-13t0-14"/><path d="M60 54q-6-8 0-15t0-16"/><path d="M80 56q-6-7 0-13t0-14"/></g>' +
    '</svg>';

  var toastTimer = null;

  // Shown on the side of the plot away from the cake just baked, so it does not cover it.
  function showCake(n, y, x) {
    var nice = y > NICE;
    ui.toast.classList.toggle("rg-left", x > 0.5);
    if (!nice && y >= BURNT) {
      ui.toast.classList.remove("rg-show");
      return;
    }
    ui.toast.innerHTML = (nice ? NICE_CAKE : BURNT_CAKE) + "<div><strong>Cake " + n + ": " + y.toFixed(1) + "/5</strong><br>" +
      (nice ? "A masterpiece! Your customers love it." : "Oh no, burnt and flat. Nobody wants this one.") + "</div>";
    ui.toast.classList.add("rg-show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { ui.toast.classList.remove("rg-show"); }, 2500);
  }

  function cakeMark(y) {
    return y > NICE ? " 🎂" : y < BURNT ? " 🔥" : "";
  }

  // -------------------------------------------------------------------- state

  var game, picks, hover = null;

  function finished() {
    return picks.length >= BUDGET;
  }

  function bestIndex() {
    var b = -1;
    picks.forEach(function (p, i) { if (b < 0 || p.y > picks[b].y) b = i; });
    return b;
  }

  // ------------------------------------------------------------------ render

  function qx(x) { return SQ_X + x * SQ; }
  function qy(y) { return SQ_Y + (1 - y) * SQ; }

  function star(x, y) {
    return '<path class="rg-star" d="M' + x.toFixed(1) + ',' + (y - 9).toFixed(1) +
      'l2.6,5.9 6.4,0.6-4.8,4.3 1.4,6.3-5.6-3.3-5.6,3.3 1.4-6.3-4.8-4.3 6.4-0.6z"/>';
  }

  function renderPlot() {
    var out = [], i, j, cell = SQ / HEAT, done = finished();

    out.push('<text class="rg-title" x="' + SQ_X + '" y="' + (SQ_Y - 10) + '">' +
      (done ? "The true taste, revealed" : "Click to bake a cake") + '</text>');

    if (done) {
      for (i = 0; i < HEAT; i++) for (j = 0; j < HEAT; j++) {
        out.push('<rect x="' + (SQ_X + j * cell).toFixed(2) + '" y="' + (SQ_Y + SQ - (i + 1) * cell).toFixed(2) +
          '" width="' + (cell + 0.6).toFixed(2) + '" height="' + (cell + 0.6).toFixed(2) + '" fill="' + colour(game.heat[i * HEAT + j]) + '"/>');
      }
    }
    out.push('<rect class="rg-frame" x="' + SQ_X + '" y="' + SQ_Y + '" width="' + SQ + '" height="' + SQ + '"/>');

    [0, 0.25, 0.5, 0.75, 1].forEach(function (t) {
      out.push('<text x="' + qx(t) + '" y="' + (SQ_Y + SQ + 20) + '" text-anchor="middle">' + sugar(t) + '</text>');
      out.push('<text x="' + (SQ_X - 7) + '" y="' + qy(t) + '" dy="0.32em" text-anchor="end">' + oven(t) + '</text>');
      if (!done && t > 0 && t < 1) {
        out.push('<line class="rg-gridline" x1="' + qx(t) + '" x2="' + qx(t) + '" y1="' + SQ_Y + '" y2="' + (SQ_Y + SQ) + '"/>');
        out.push('<line class="rg-gridline" x1="' + SQ_X + '" x2="' + (SQ_X + SQ) + '" y1="' + qy(t) + '" y2="' + qy(t) + '"/>');
      }
    });
    out.push('<text x="' + (SQ_X + SQ / 2) + '" y="' + (SQ_Y + SQ + 42) + '" text-anchor="middle">sugar (g)</text>');
    out.push('<text transform="translate(' + (SQ_X - 52) + ',' + (SQ_Y + SQ / 2) + ') rotate(-90)" text-anchor="middle">oven temperature (°C)</text>');

    // Colour bar
    out.push('<defs><linearGradient id="rg-bar" x1="0" y1="1" x2="0" y2="0">' + VIRIDIS.map(function (c, k) {
      return '<stop offset="' + k / (VIRIDIS.length - 1) + '" stop-color="rgb(' + c.join(",") + ')"/>';
    }).join("") + '</linearGradient></defs>');
    out.push('<rect x="' + BAR_X + '" y="' + SQ_Y + '" width="' + BAR_W + '" height="' + SQ + '" fill="url(#rg-bar)"/>');
    for (var v = 0; v <= TASTE_MAX; v++) {
      out.push('<text x="' + (BAR_X + BAR_W + 6) + '" y="' + (SQ_Y + (TASTE_MAX - v) / TASTE_MAX * SQ) + '" dy="0.32em">' + v + '</text>');
    }
    out.push('<text x="' + BAR_X + '" y="' + (SQ_Y - 10) + '">taste</text>');

    if (hover && !done) {
      out.push('<line class="rg-hover" x1="' + qx(hover[0]) + '" x2="' + qx(hover[0]) + '" y1="' + SQ_Y + '" y2="' + (SQ_Y + SQ) + '"/>');
      out.push('<line class="rg-hover" x1="' + SQ_X + '" x2="' + (SQ_X + SQ) + '" y1="' + qy(hover[1]) + '" y2="' + qy(hover[1]) + '"/>');
      out.push('<text x="' + (SQ_X + SQ) + '" y="' + (SQ_Y - 10) + '" text-anchor="end">' + recipe(hover) + '</text>');
    }

    var halo = done ? "rg-halo rg-on-map" : "rg-halo", best = bestIndex();
    picks.forEach(function (p, idx) {
      var cx = qx(p.x[0]).toFixed(1), cy = qy(p.x[1]).toFixed(1);
      if (idx === best) out.push('<circle class="rg-pt-best" cx="' + cx + '" cy="' + cy + '" r="10"/>');
      out.push('<circle class="rg-pt" cx="' + cx + '" cy="' + cy + '" r="6" fill="' + (done ? "#fff" : colour(p.y)) + '"/>');
      if (idx === picks.length - 1 && !done && idx !== best) out.push('<circle class="rg-pt-latest" cx="' + cx + '" cy="' + cy + '" r="9"/>');
      out.push('<text class="rg-pt-label ' + halo + '" x="' + cx + '" y="' + (cy - 12) + '">' + p.y.toFixed(1) + '</text>');
    });

    if (done) out.push(star(qx(game.xStar[0]), qy(game.xStar[1])));

    plot.innerHTML = out.join("");
    plot.style.cursor = done ? "default" : "crosshair";
  }

  function renderTable() {
    var best = bestIndex(), rows = [];
    for (var i = 0; i < BUDGET; i++) {
      var p = picks[i];
      rows.push("<tr" + (i === best ? ' class="rg-best-row"' : "") + "><td>" + (i + 1) + "</td><td>" + (p ? Math.round(sugar(p.x[0])) : "") +
        "</td><td>" + (p ? Math.round(oven(p.x[1])) : "") + "</td><td>" + (p ? p.y.toFixed(2) + cakeMark(p.y) : "") + "</td></tr>");
    }
    ui.table.innerHTML = rows.join("");
  }

  function render() {
    renderPlot();
    renderTable();
    var best = bestIndex(), bestText = best < 0 ? "" : " Best so far: " + picks[best].y.toFixed(2) + "/5.";
    if (finished()) {
      ui.status.textContent = "All 20 cakes are baked. The true taste of every recipe is revealed below.";
      ui.summary.innerHTML = "<strong>Game " + game.number + ": your score is " + picks[best].y.toFixed(2) + "/5</strong> (" +
        recipe(picks[best].x) + ", circled). The best possible cake (" + recipe(game.xStar) + ", marked with a star) scores " +
        game.fStar.toFixed(2) + "/5.";
    } else {
      ui.status.textContent = "Game " + game.number + ", cake " + (picks.length + 1) + " of " + BUDGET +
        ": click on the plot to choose the sugar and the oven temperature." + bestText;
    }
    ui.summary.classList.toggle("rg-hidden", !finished());
  }

  // ------------------------------------------------------------- interaction

  function start(number) {
    number = String(number).replace(/^2d-/, "");
    if (!/^[1-5]$/.test(number)) number = "1";
    ui.game.value = number;
    game = makeGame(Number(number));
    picks = [];
    hover = null;
    ui.toast.classList.remove("rg-show");
    render();
  }

  function plotPoint(evt) {
    var pt = plot.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    var p = pt.matrixTransform(plot.getScreenCTM().inverse());
    var x1 = (p.x - SQ_X) / SQ, x2 = 1 - (p.y - SQ_Y) / SQ;
    return x1 >= 0 && x1 <= 1 && x2 >= 0 && x2 <= 1 ? snap([x1, x2]) : null;
  }

  plot.addEventListener("click", function (evt) {
    var x = plotPoint(evt);
    if (!x || finished()) return;
    picks.push({ x: x, y: game.f(x) });
    render();
    showCake(picks.length, picks[picks.length - 1].y, x[0]);
  });

  plot.addEventListener("mousemove", function (evt) {
    var x = plotPoint(evt);
    if (String(x) !== String(hover)) {
      hover = x;
      renderPlot();
    }
  });

  plot.addEventListener("mouseleave", function () {
    hover = null;
    renderPlot();
  });

  ui.game.addEventListener("change", function () { start(ui.game.value); });
  ui.restart.addEventListener("click", function () { start(ui.game.value); });

  // A link such as /regret-game/?game=3 opens that game directly.
  start(new URLSearchParams(window.location.search).get("game") || ui.game.value);
})();
