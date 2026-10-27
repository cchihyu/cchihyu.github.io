/* "Find the peak" games for teaching cumulative regret, used on /regret-game/. */
(function () {
  "use strict";

  // Fixed games. The seeds were chosen so that each maximum is away from the boundary
  // and each function has a tempting second peak.
  var SEEDS = { 1: [41, 1, 43, 21, 61], 2: [1, 3, 5, 7, 8] };
  var BUDGET = { 1: 10, 2: 20 };
  var Y_MAX = 10;
  var HEAT = 60; // heat-map cells per side when a 2-D function is revealed

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
    game: el("rg-game"), restart: el("rg-restart"),
    status: el("rg-status"), result: el("rg-result"), summary: el("rg-summary"),
    regret: el("rg-regret"), table: el("rg-table"), xHead: el("rg-x-head")
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

  // A sum of random Gaussian bumps; the seed fixes everything, so every student sees the same function.
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
    var bottom = 0.5 + 1.5 * rand(), top = 7 + 2.5 * rand();
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

  // ------------------------------------------------------------------ colours

  var VIRIDIS = [[68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37]];

  function colour(v) {
    var t = Math.max(0, Math.min(1, v / Y_MAX)) * (VIRIDIS.length - 1), i = Math.min(Math.floor(t), VIRIDIS.length - 2), u = t - i;
    var rgb = [0, 1, 2].map(function (k) { return Math.round(VIRIDIS[i][k] + u * (VIRIDIS[i + 1][k] - VIRIDIS[i][k])); });
    return "rgb(" + rgb.join(",") + ")";
  }

  // -------------------------------------------------------------------- state

  var game, picks, hover = null;

  function regretOf(y) {
    return Math.max(game.fStar - y, 0);
  }

  function finished() {
    return picks.length >= game.T;
  }

  function fmtPoint(p) {
    return p.length === 1 ? p[0].toFixed(3) : "(" + p[0].toFixed(3) + ", " + p[1].toFixed(3) + ")";
  }

  // ------------------------------------------------------------- render: 1-D

  function sx(x) { return PAD_L + x * PLOT_W; }
  function sy(y) { return MAIN_Y + (Y_MAX - y) / Y_MAX * MAIN_H; }

  function render1D() {
    var out = [], bottom = MAIN_Y + MAIN_H;

    for (var v = 0; v <= Y_MAX; v += 2) {
      out.push('<line class="rg-gridline" x1="' + PAD_L + '" x2="' + (W - PAD_R) + '" y1="' + sy(v) + '" y2="' + sy(v) + '"/>');
      out.push('<text x="' + (PAD_L - 7) + '" y="' + sy(v) + '" dy="0.32em" text-anchor="end">' + v + '</text>');
    }
    [0, 0.25, 0.5, 0.75, 1].forEach(function (t) {
      out.push('<text x="' + sx(t) + '" y="' + (bottom + 20) + '" text-anchor="middle">' + t + '</text>');
    });
    out.push('<line class="rg-axis" x1="' + PAD_L + '" x2="' + (W - PAD_R) + '" y1="' + bottom + '" y2="' + bottom + '"/>');
    out.push('<line class="rg-axis" x1="' + PAD_L + '" x2="' + PAD_L + '" y1="' + MAIN_Y + '" y2="' + bottom + '"/>');
    out.push('<text class="rg-title" x="' + PAD_L + '" y="' + (MAIN_Y - 10) + '">' +
      (finished() ? "The hidden function, revealed" : "Click to evaluate f(x)") + '</text>');

    if (finished()) {
      var d = "";
      game.curve.forEach(function (y, i) { d += (i ? "L" : "M") + sx(i / 500).toFixed(1) + "," + sy(y).toFixed(1); });
      out.push('<path class="rg-truth" d="' + d + '"/>');
      picks.forEach(function (p) {
        out.push('<line class="rg-gap" x1="' + sx(p.x[0]) + '" x2="' + sx(p.x[0]) + '" y1="' + sy(p.y) + '" y2="' + sy(game.fStar) + '"/>');
      });
      out.push(star(sx(game.xStar[0]), sy(game.fStar)));
      out.push('<text x="' + sx(game.xStar[0]) + '" y="' + (sy(game.fStar) - 14) + '" text-anchor="middle">best x* = ' +
        fmtPoint(game.xStar) + ', f(x*) = ' + game.fStar.toFixed(2) + '</text>');
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
      out.push('<text x="' + (W - PAD_R) + '" y="' + (MAIN_Y - 10) + '" text-anchor="end">x = ' + fmtPoint(hover) + '</text>');
    }
    return out;
  }

  // ------------------------------------------------------------- render: 2-D

  function qx(x) { return SQ_X + x * SQ; }
  function qy(y) { return SQ_Y + (1 - y) * SQ; }

  function render2D() {
    var out = [], i, j, cell = SQ / HEAT;

    out.push('<text class="rg-title" x="' + SQ_X + '" y="' + (SQ_Y - 10) + '">' +
      (finished() ? "The hidden function, revealed" : "Click to evaluate f(x₁, x₂)") + '</text>');

    if (finished()) {
      for (i = 0; i < HEAT; i++) for (j = 0; j < HEAT; j++) {
        out.push('<rect x="' + (SQ_X + j * cell).toFixed(2) + '" y="' + (SQ_Y + SQ - (i + 1) * cell).toFixed(2) +
          '" width="' + (cell + 0.6).toFixed(2) + '" height="' + (cell + 0.6).toFixed(2) + '" fill="' + colour(game.heat[i * HEAT + j]) + '"/>');
      }
    }
    out.push('<rect class="rg-frame" x="' + SQ_X + '" y="' + SQ_Y + '" width="' + SQ + '" height="' + SQ + '"/>');

    [0, 0.25, 0.5, 0.75, 1].forEach(function (t) {
      out.push('<text x="' + qx(t) + '" y="' + (SQ_Y + SQ + 20) + '" text-anchor="middle">' + t + '</text>');
      out.push('<text x="' + (SQ_X - 7) + '" y="' + qy(t) + '" dy="0.32em" text-anchor="end">' + t + '</text>');
      if (!finished() && t > 0 && t < 1) {
        out.push('<line class="rg-gridline" x1="' + qx(t) + '" x2="' + qx(t) + '" y1="' + SQ_Y + '" y2="' + (SQ_Y + SQ) + '"/>');
        out.push('<line class="rg-gridline" x1="' + SQ_X + '" x2="' + (SQ_X + SQ) + '" y1="' + qy(t) + '" y2="' + qy(t) + '"/>');
      }
    });
    out.push('<text x="' + (SQ_X + SQ) + '" y="' + (SQ_Y + SQ + 38) + '" text-anchor="end">x₁</text>');
    out.push('<text x="' + (SQ_X - 30) + '" y="' + SQ_Y + '" dy="0.32em" text-anchor="end">x₂</text>');

    // Colour bar
    out.push('<defs><linearGradient id="rg-bar" x1="0" y1="1" x2="0" y2="0">' + VIRIDIS.map(function (c, k) {
      return '<stop offset="' + k / (VIRIDIS.length - 1) + '" stop-color="rgb(' + c.join(",") + ')"/>';
    }).join("") + '</linearGradient></defs>');
    out.push('<rect x="' + BAR_X + '" y="' + SQ_Y + '" width="' + BAR_W + '" height="' + SQ + '" fill="url(#rg-bar)"/>');
    for (var v = 0; v <= Y_MAX; v += 2) {
      var by = SQ_Y + (Y_MAX - v) / Y_MAX * SQ;
      out.push('<text x="' + (BAR_X + BAR_W + 6) + '" y="' + by + '" dy="0.32em">' + v + '</text>');
    }
    out.push('<text x="' + BAR_X + '" y="' + (SQ_Y - 10) + '">f</text>');

    if (hover && !finished()) {
      out.push('<line class="rg-hover" x1="' + qx(hover[0]) + '" x2="' + qx(hover[0]) + '" y1="' + SQ_Y + '" y2="' + (SQ_Y + SQ) + '"/>');
      out.push('<line class="rg-hover" x1="' + SQ_X + '" x2="' + (SQ_X + SQ) + '" y1="' + qy(hover[1]) + '" y2="' + qy(hover[1]) + '"/>');
      out.push('<text x="' + (SQ_X + SQ) + '" y="' + (SQ_Y - 10) + '" text-anchor="end">x = ' + fmtPoint(hover) + '</text>');
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

  function star(x, y) {
    return '<path class="rg-star" d="M' + x.toFixed(1) + ',' + (y - 9).toFixed(1) +
      'l2.6,5.9 6.4,0.6-4.8,4.3 1.4,6.3-5.6-3.3-5.6,3.3 1.4-6.3-4.8-4.3 6.4-0.6z"/>';
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
    out.push('<text x="' + (W - PAD_R) + '" y="' + (bottom + 38) + '" text-anchor="end">step t</text>');
    out.push('<line class="rg-axis" x1="' + PAD_L + '" x2="' + (W - PAD_R) + '" y1="' + bottom + '" y2="' + bottom + '"/>');
    out.push('<line class="rg-axis" x1="' + PAD_L + '" x2="' + PAD_L + '" y1="' + REG_Y + '" y2="' + bottom + '"/>');
    out.push('<text class="rg-title" x="' + PAD_L + '" y="' + (REG_Y - 10) + '">Cumulative regret</text>');

    var lx = W - PAD_R - 330, ly = REG_Y - 14;
    out.push('<line class="rg-yours" x1="' + lx + '" x2="' + (lx + 24) + '" y1="' + ly + '" y2="' + ly + '"/>');
    out.push('<text x="' + (lx + 30) + '" y="' + ly + '" dy="0.32em">you</text>');
    out.push('<line class="rg-random" x1="' + (lx + 90) + '" x2="' + (lx + 114) + '" y1="' + ly + '" y2="' + ly + '"/>');
    out.push('<text x="' + (lx + 120) + '" y="' + ly + '" dy="0.32em">random guessing (average)</text>');

    out.push('<line class="rg-random" x1="' + rx(0) + '" y1="' + ry(0) + '" x2="' + rx(T) + '" y2="' + ry(randomRate * T) + '"/>');
    var d = "";
    for (i = 0; i <= T; i++) d += (i ? "L" : "M") + rx(i).toFixed(1) + "," + ry(cum[i]).toFixed(1);
    out.push('<path class="rg-yours" d="' + d + '"/>');
    for (i = 1; i <= T; i++) out.push('<circle class="rg-yours-dot" cx="' + rx(i).toFixed(1) + '" cy="' + ry(cum[i]).toFixed(1) + '" r="4"/>');

    ui.regret.innerHTML = out.join("");
    return cum;
  }

  function renderTable(cum) {
    var rows = [];
    for (var i = 0; i < game.T; i++) {
      var p = picks[i], hidden = p ? "?" : "";
      rows.push("<tr><td>" + (i + 1) + "</td><td>" + (p ? fmtPoint(p.x) : "") + "</td><td>" + (p ? p.y.toFixed(2) : "") +
        "</td><td>" + (cum ? regretOf(p.y).toFixed(2) : hidden) + "</td><td>" + (cum ? cum[i + 1].toFixed(2) : hidden) + "</td></tr>");
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
        "Your best evaluation was " + best.toFixed(2) + ", and the true maximum is f(x*) = " + game.fStar.toFixed(2) +
        " at x* = " + fmtPoint(game.xStar) + " (the star). " +
        "Choosing points at random every time would give a cumulative regret of about " + ((game.fStar - game.mean) * game.T).toFixed(2) + " on average.";
      ui.status.textContent = "Game over. The hidden function is revealed below" +
        (game.dim === 1 ? "; each dashed line is the regret of one step." : ".");
    } else {
      ui.status.textContent = game.label + ", step " + (picks.length + 1) + " of " + game.T + ": click anywhere on the plot to choose " +
        (game.dim === 1 ? "x." : "a point (x₁, x₂).");
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
    plot.setAttribute("viewBox", game.dim === 1 ? "0 0 720 340" : "0 0 720 520");
    ui.xHead.innerHTML = game.dim === 1 ? "<em>x<sub>t</sub></em>" : "<em>x<sub>t</sub></em> = (<em>x</em><sub>1</sub>, <em>x</em><sub>2</sub>)";
    render();
  }

  function plotPoint(evt) {
    var pt = plot.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    var p = pt.matrixTransform(plot.getScreenCTM().inverse());
    var r = function (v) { return Math.round(v * 1000) / 1000; };
    if (game.dim === 1) {
      var x = (p.x - PAD_L) / PLOT_W;
      return x >= 0 && x <= 1 && p.y >= MAIN_Y && p.y <= MAIN_Y + MAIN_H ? [r(x)] : null;
    }
    var x1 = (p.x - SQ_X) / SQ, x2 = 1 - (p.y - SQ_Y) / SQ;
    return x1 >= 0 && x1 <= 1 && x2 >= 0 && x2 <= 1 ? [r(x1), r(x2)] : null;
  }

  plot.addEventListener("click", function (evt) {
    var x = plotPoint(evt);
    if (!x || finished()) return;
    picks.push({ x: x, y: game.f(x) });
    render();
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
