/* "Bake the best cake" games for teaching cumulative regret, used on /regret-game/. */
(function () {
  "use strict";

  // Fixed games. The seeds were chosen so that each maximum is away from the boundary
  // and each function has a tempting second peak.
  var SEEDS = { 1: [41, 1, 43, 21, 61], 2: [1, 3, 5, 7, 8] };
  var BUDGET = { 1: 10, 2: 20 };
  var TASTE_MAX = 5;
  var SUGAR = [0, 200];    // grams
  var OVEN = [150, 230];   // degrees Celsius
  var HEAT = 60;           // heat-map cells per side when a 2-D game is revealed
  var BURNT = 1, NICE = 4.5; // taste thresholds for the cake pictures

  // SVG layout (viewBox units)
  var W = 720, PAD_L = 40, PAD_R = 14, PLOT_W = W - PAD_L - PAD_R;
  var MAIN_Y = 28, MAIN_H = 272;                // 1-D plot
  var SQ_X = 140, SQ_Y = 28, SQ = 440;          // 2-D plot (square)
  var BAR_X = SQ_X + SQ + 24, BAR_W = 16;       // colour bar next to the square
  var REG_Y = 28, REG_H = 160;                  // cumulative regret chart

  var el = function (id) { return document.getElementById(id); };
  var plot = el("rg-plot");
  if (!plot) return;
  var ui = {
    game: el("rg-game"), restart: el("rg-restart"), toast: el("rg-toast"),
    status: el("rg-status"), result: el("rg-result"), summary: el("rg-summary"),
    regret: el("rg-regret"), thead: el("rg-thead"), table: el("rg-table")
  };

  // ----------------------------------------------------------- hidden functions

  function mulberry32(seed) {
    return function () {
      seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // A sum of random Gaussian bumps on [0, 1]^dim; the seed fixes everything, so every
  // student sees the same function. Inputs are rescaled to grams and degrees only for display.
  function makeGame(id) {
    var dim = Number(id.charAt(0)), seed = SEEDS[dim][Number(id.slice(3)) - 1];
    var rand = mulberry32(seed * 7919 + 13 + (dim === 2 ? 500009 : 0));
    var k = dim === 1 ? 4 + Math.floor(rand() * 3) : 6 + Math.floor(rand() * 4), bumps = [], i, j, d;
    for (j = 0; j < k; j++) {
      var c = [];
      for (d = 0; d < dim; d++) c.push(0.04 + 0.92 * rand());
      bumps.push({ a: 0.3 + 0.7 * rand(), c: c, w: dim === 1 ? 0.03 + 0.09 * rand() : 0.06 + 0.1 * rand() });
    }
    var raw = function (p) {
      var s = 0;
      for (var b = 0; b < bumps.length; b++) {
        var q = 0;
        for (var dd = 0; dd < dim; dd++) {
          var z = (p[dd] - bumps[b].c[dd]) / bumps[b].w;
          q += z * z;
        }
        s += bumps[b].a * Math.exp(-0.5 * q);
      }
      return s;
    };

    var n = dim === 1 ? 1001 : 201, pts = [];
    for (i = 0; i < n; i++) {
      if (dim === 1) pts.push([i / (n - 1)]);
      else for (j = 0; j < n; j++) pts.push([i / (n - 1), j / (n - 1)]);
    }
    var rMin = Infinity, rMax = -Infinity, rMean = 0, best = 0;
    for (i = 0; i < pts.length; i++) {
      var v = raw(pts[i]);
      if (v < rMin) rMin = v;
      if (v > rMax) { rMax = v; best = i; }
      rMean += v / pts.length;
    }
    // The best cake always scores above NICE, so finding the peak earns the nice-cake picture.
    var bottom = 0.25 + 0.75 * rand(), top = 4.6 + 0.3 * rand();
    var scale = function (r) { return bottom + (r - rMin) / (rMax - rMin) * (top - bottom); };
    var game = {
      id: id, dim: dim, T: BUDGET[dim],
      label: dim + "-D game " + id.slice(3),
      f: function (p) { return scale(raw(p)); },
      xStar: pts[best], fStar: top, mean: scale(rMean)
    };

    if (dim === 1) {
      game.curve = [];
      for (i = 0; i <= 500; i++) game.curve.push(game.f([i / 500]));
    } else {
      game.heat = [];
      for (i = 0; i < HEAT; i++) for (j = 0; j < HEAT; j++) game.heat.push(game.f([(j + 0.5) / HEAT, (i + 0.5) / HEAT]));
    }
    return game;
  }

  // ------------------------------------------------------------ recipe units

  function sugar(u) { return SUGAR[0] + u * (SUGAR[1] - SUGAR[0]); }
  function oven(u) { return OVEN[0] + u * (OVEN[1] - OVEN[0]); }

  // Snap a click to whole grams and whole degrees, so the recipe shown is exactly the one baked.
  function snap(p) {
    var s = [Math.round(sugar(p[0])) / (SUGAR[1] - SUGAR[0])];
    if (p.length === 2) s.push((Math.round(oven(p[1])) - OVEN[0]) / (OVEN[1] - OVEN[0]));
    return s;
  }

  function recipe(p) {
    var text = Math.round(sugar(p[0])) + " g sugar";
    return p.length === 1 ? text : text + ", " + Math.round(oven(p[1])) + " °C";
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

  function regretOf(y) {
    return Math.max(game.fStar - y, 0);
  }

  function finished() {
    return picks.length >= game.T;
  }

  function star(x, y) {
    return '<path class="rg-star" d="M' + x.toFixed(1) + ',' + (y - 9).toFixed(1) +
      'l2.6,5.9 6.4,0.6-4.8,4.3 1.4,6.3-5.6-3.3-5.6,3.3 1.4-6.3-4.8-4.3 6.4-0.6z"/>';
  }

  // ------------------------------------------------------------- render: 1-D

  function sx(x) { return PAD_L + x * PLOT_W; }
  function sy(y) { return MAIN_Y + (TASTE_MAX - y) / TASTE_MAX * MAIN_H; }

  function render1D() {
    var out = [], bottom = MAIN_Y + MAIN_H;

    for (var v = 0; v <= TASTE_MAX; v++) {
      out.push('<line class="rg-gridline" x1="' + PAD_L + '" x2="' + (W - PAD_R) + '" y1="' + sy(v) + '" y2="' + sy(v) + '"/>');
      out.push('<text x="' + (PAD_L - 7) + '" y="' + sy(v) + '" dy="0.32em" text-anchor="end">' + v + '</text>');
    }
    [0, 0.25, 0.5, 0.75, 1].forEach(function (t) {
      out.push('<text x="' + sx(t) + '" y="' + (bottom + 20) + '" text-anchor="middle">' + sugar(t) + '</text>');
    });
    out.push('<text x="' + (W - PAD_R) + '" y="' + (bottom + 40) + '" text-anchor="end">sugar (g)</text>');
    out.push('<line class="rg-axis" x1="' + PAD_L + '" x2="' + (W - PAD_R) + '" y1="' + bottom + '" y2="' + bottom + '"/>');
    out.push('<line class="rg-axis" x1="' + PAD_L + '" x2="' + PAD_L + '" y1="' + MAIN_Y + '" y2="' + bottom + '"/>');
    out.push('<text class="rg-title" x="' + PAD_L + '" y="' + (MAIN_Y - 10) + '">' +
      (finished() ? "Taste (out of 5): the true taste curve, revealed" : "Taste (out of 5): click to bake a cake") + '</text>');

    if (finished()) {
      var d = "";
      game.curve.forEach(function (y, i) { d += (i ? "L" : "M") + sx(i / 500).toFixed(1) + "," + sy(y).toFixed(1); });
      out.push('<path class="rg-truth" d="' + d + '"/>');
      picks.forEach(function (p) {
        out.push('<line class="rg-gap" x1="' + sx(p.x[0]) + '" x2="' + sx(p.x[0]) + '" y1="' + sy(p.y) + '" y2="' + sy(game.fStar) + '"/>');
      });
      out.push(star(sx(game.xStar[0]), sy(game.fStar)));
      out.push('<text x="' + sx(game.xStar[0]) + '" y="' + (sy(game.fStar) - 14) + '" text-anchor="middle">best cake: ' +
        recipe(game.xStar) + ', taste ' + game.fStar.toFixed(1) + '/5</text>');
    }

    picks.forEach(function (p, idx) {
      var cx = sx(p.x[0]).toFixed(1), cy = sy(p.y).toFixed(1);
      out.push('<circle class="rg-pt" cx="' + cx + '" cy="' + cy + '" r="5"/>');
      if (idx === picks.length - 1 && !finished()) out.push('<circle class="rg-pt-latest" cx="' + cx + '" cy="' + cy + '" r="8"/>');
      out.push('<text class="rg-pt-label" x="' + cx + '" y="' + (cy - 11) + '">' + p.y.toFixed(1) + '</text>');
    });

    if (hover && !finished()) {
      var hx = sx(hover[0]).toFixed(1);
      out.push('<line class="rg-hover" x1="' + hx + '" x2="' + hx + '" y1="' + MAIN_Y + '" y2="' + bottom + '"/>');
      out.push('<text x="' + (W - PAD_R) + '" y="' + (MAIN_Y - 10) + '" text-anchor="end">' + recipe(hover) + '</text>');
    }
    return out;
  }

  // ------------------------------------------------------------- render: 2-D

  function qx(x) { return SQ_X + x * SQ; }
  function qy(y) { return SQ_Y + (1 - y) * SQ; }

  function render2D() {
    var out = [], i, j, cell = SQ / HEAT;

    out.push('<text class="rg-title" x="' + SQ_X + '" y="' + (SQ_Y - 10) + '">' +
      (finished() ? "The true taste, revealed" : "Click to bake a cake") + '</text>');

    if (finished()) {
      for (i = 0; i < HEAT; i++) for (j = 0; j < HEAT; j++) {
        out.push('<rect x="' + (SQ_X + j * cell).toFixed(2) + '" y="' + (SQ_Y + SQ - (i + 1) * cell).toFixed(2) +
          '" width="' + (cell + 0.6).toFixed(2) + '" height="' + (cell + 0.6).toFixed(2) + '" fill="' + colour(game.heat[i * HEAT + j]) + '"/>');
      }
    }
    out.push('<rect class="rg-frame" x="' + SQ_X + '" y="' + SQ_Y + '" width="' + SQ + '" height="' + SQ + '"/>');

    [0, 0.25, 0.5, 0.75, 1].forEach(function (t) {
      out.push('<text x="' + qx(t) + '" y="' + (SQ_Y + SQ + 20) + '" text-anchor="middle">' + sugar(t) + '</text>');
      out.push('<text x="' + (SQ_X - 7) + '" y="' + qy(t) + '" dy="0.32em" text-anchor="end">' + oven(t) + '</text>');
      if (!finished() && t > 0 && t < 1) {
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
      var by = SQ_Y + (TASTE_MAX - v) / TASTE_MAX * SQ;
      out.push('<text x="' + (BAR_X + BAR_W + 6) + '" y="' + by + '" dy="0.32em">' + v + '</text>');
    }
    out.push('<text x="' + BAR_X + '" y="' + (SQ_Y - 10) + '">taste</text>');

    if (hover && !finished()) {
      out.push('<line class="rg-hover" x1="' + qx(hover[0]) + '" x2="' + qx(hover[0]) + '" y1="' + SQ_Y + '" y2="' + (SQ_Y + SQ) + '"/>');
      out.push('<line class="rg-hover" x1="' + SQ_X + '" x2="' + (SQ_X + SQ) + '" y1="' + qy(hover[1]) + '" y2="' + qy(hover[1]) + '"/>');
      out.push('<text x="' + (SQ_X + SQ) + '" y="' + (SQ_Y - 10) + '" text-anchor="end">' + recipe(hover) + '</text>');
    }

    var halo = finished() ? "rg-halo rg-on-map" : "rg-halo";
    picks.forEach(function (p, idx) {
      var cx = qx(p.x[0]).toFixed(1), cy = qy(p.x[1]).toFixed(1);
      out.push('<circle class="rg-pt2" cx="' + cx + '" cy="' + cy + '" r="6" fill="' + (finished() ? "#fff" : colour(p.y)) + '"/>');
      if (idx === picks.length - 1 && !finished()) out.push('<circle class="rg-pt-latest" cx="' + cx + '" cy="' + cy + '" r="9"/>');
      out.push('<text class="rg-pt-label ' + halo + '" x="' + cx + '" y="' + (cy - 11) + '">' + p.y.toFixed(1) + '</text>');
    });

    if (finished()) out.push(star(qx(game.xStar[0]), qy(game.xStar[1])));
    return out;
  }

  // --------------------------------------------------------- render: results

  function renderRegret() {
    var T = game.T, cum = [0], i;
    for (i = 0; i < picks.length; i++) cum.push(cum[i] + regretOf(picks[i].y));
    var randomRate = game.fStar - game.mean;
    var yTop = Math.max(cum[T], randomRate * T) * 1.1 || 1;
    var rx = function (t) { return PAD_L + t / T * PLOT_W; };
    var ry = function (v) { return REG_Y + (yTop - v) / yTop * REG_H; };
    var bottom = REG_Y + REG_H, out = [];

    var raw = yTop / 4, step = Math.pow(10, Math.floor(Math.log10(raw)));
    if (raw / step >= 5) step *= 5;
    else if (raw / step >= 2) step *= 2;
    for (var v = 0; v <= yTop; v += step) {
      out.push('<line class="rg-gridline" x1="' + PAD_L + '" x2="' + (W - PAD_R) + '" y1="' + ry(v) + '" y2="' + ry(v) + '"/>');
      out.push('<text x="' + (PAD_L - 7) + '" y="' + ry(v) + '" dy="0.32em" text-anchor="end">' + (+v.toFixed(2)) + '</text>');
    }
    for (i = 0; i <= T; i += T > 10 ? 2 : 1) out.push('<text x="' + rx(i) + '" y="' + (bottom + 20) + '" text-anchor="middle">' + i + '</text>');
    out.push('<text x="' + (W - PAD_R) + '" y="' + (bottom + 38) + '" text-anchor="end">cakes baked</text>');
    out.push('<line class="rg-axis" x1="' + PAD_L + '" x2="' + (W - PAD_R) + '" y1="' + bottom + '" y2="' + bottom + '"/>');
    out.push('<line class="rg-axis" x1="' + PAD_L + '" x2="' + PAD_L + '" y1="' + REG_Y + '" y2="' + bottom + '"/>');
    out.push('<text class="rg-title" x="' + PAD_L + '" y="' + (REG_Y - 10) + '">Cumulative regret (total taste lost)</text>');

    var lx = W - PAD_R - 320, ly = REG_Y - 14;
    out.push('<line class="rg-yours" x1="' + lx + '" x2="' + (lx + 24) + '" y1="' + ly + '" y2="' + ly + '"/>');
    out.push('<text x="' + (lx + 30) + '" y="' + ly + '" dy="0.32em">you</text>');
    out.push('<line class="rg-random" x1="' + (lx + 90) + '" x2="' + (lx + 114) + '" y1="' + ly + '" y2="' + ly + '"/>');
    out.push('<text x="' + (lx + 120) + '" y="' + ly + '" dy="0.32em">random recipes (average)</text>');

    out.push('<line class="rg-random" x1="' + rx(0) + '" y1="' + ry(0) + '" x2="' + rx(T) + '" y2="' + ry(randomRate * T) + '"/>');
    var d = "";
    for (i = 0; i <= T; i++) d += (i ? "L" : "M") + rx(i).toFixed(1) + "," + ry(cum[i]).toFixed(1);
    out.push('<path class="rg-yours" d="' + d + '"/>');
    for (i = 1; i <= T; i++) out.push('<circle class="rg-yours-dot" cx="' + rx(i).toFixed(1) + '" cy="' + ry(cum[i]).toFixed(1) + '" r="4"/>');

    ui.regret.innerHTML = out.join("");
    return cum;
  }

  function renderTable(cum) {
    var two = game.dim === 2;
    ui.thead.innerHTML = "<tr><th>Cake</th><th>Sugar (g)</th>" + (two ? "<th>Oven (&deg;C)</th>" : "") +
      "<th>Taste (/5)</th><th>Taste lost</th><th>Total taste lost</th></tr>";
    var rows = [];
    for (var i = 0; i < game.T; i++) {
      var p = picks[i], hidden = p ? "?" : "";
      rows.push("<tr><td>" + (i + 1) + "</td><td>" + (p ? Math.round(sugar(p.x[0])) : "") + "</td>" +
        (two ? "<td>" + (p ? Math.round(oven(p.x[1])) : "") + "</td>" : "") +
        "<td>" + (p ? p.y.toFixed(2) + cakeMark(p.y) : "") + "</td><td>" + (cum ? regretOf(p.y).toFixed(2) : hidden) +
        "</td><td>" + (cum ? cum[i + 1].toFixed(2) : hidden) + "</td></tr>");
    }
    ui.table.innerHTML = rows.join("");
  }

  function renderPlot() {
    plot.innerHTML = (game.dim === 1 ? render1D() : render2D()).join("");
    plot.style.cursor = finished() ? "default" : "crosshair";
  }

  function render() {
    renderPlot();
    var cum = null;
    if (finished()) {
      cum = renderRegret();
      var best = Math.max.apply(null, picks.map(function (p) { return p.y; }));
      ui.summary.innerHTML = "<strong>" + game.label + ": your cumulative regret is " + cum[game.T].toFixed(2) + "</strong> (lower is better). " +
        "Your best cake scored " + best.toFixed(2) + "/5. The best possible cake (" + recipe(game.xStar) + ", marked with a star) scores " +
        game.fStar.toFixed(2) + "/5. Baking random recipes would lose about " + ((game.fStar - game.mean) * game.T).toFixed(2) + " in total, on average.";
      ui.status.textContent = "All cakes are baked. The true taste is revealed below" +
        (game.dim === 1 ? "; each dashed line shows how much taste one cake lost." : ".");
    } else {
      ui.status.textContent = game.label + ", cake " + (picks.length + 1) + " of " + game.T + ": click on the plot to choose " +
        (game.dim === 1 ? "how much sugar to use." : "the sugar and the oven temperature.");
    }
    ui.result.classList.toggle("rg-hidden", !finished());
    renderTable(cum);
  }

  // ------------------------------------------------------------- interaction

  function start(id) {
    if (!/^[12]d-[1-5]$/.test(id)) id = "1d-1";
    ui.game.value = id;
    game = makeGame(id);
    picks = [];
    hover = null;
    ui.toast.classList.remove("rg-show");
    plot.setAttribute("viewBox", game.dim === 1 ? "0 0 720 345" : "0 0 720 520");
    render();
  }

  function plotPoint(evt) {
    var pt = plot.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    var p = pt.matrixTransform(plot.getScreenCTM().inverse());
    if (game.dim === 1) {
      var x = (p.x - PAD_L) / PLOT_W;
      return x >= 0 && x <= 1 && p.y >= MAIN_Y && p.y <= MAIN_Y + MAIN_H ? snap([x]) : null;
    }
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

  // A link such as /regret-game/?game=2d-3 opens that game directly.
  start(new URLSearchParams(window.location.search).get("game") || ui.game.value);
})();
