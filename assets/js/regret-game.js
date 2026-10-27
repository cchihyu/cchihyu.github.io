/* "Find the peak" game for teaching cumulative regret, used on /regret-game/. */
(function () {
  "use strict";

  var T = 10;
  var GRID = 1001;
  var Y_MAX = 10;

  // SVG layout (viewBox units)
  var W = 720, PAD_L = 40, PAD_R = 14, PLOT_W = W - PAD_L - PAD_R;
  var MAIN_Y = 28, MAIN_H = 272;
  var REG_Y = 28, REG_H = 160;

  var el = function (id) { return document.getElementById(id); };
  var plot = el("rg-plot");
  if (!plot) return;
  var ui = {
    game: el("rg-game"), start: el("rg-start"), random: el("rg-random"),
    status: el("rg-status"), result: el("rg-result"), summary: el("rg-summary"),
    regret: el("rg-regret"), table: el("rg-table")
  };

  // Small seeded generator so every student with the same game number gets the same function.
  function mulberry32(seed) {
    return function () {
      seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // A sum of random bumps, rescaled so the minimum and maximum are themselves random.
  function makeGame(number) {
    var rand = mulberry32(number * 7919 + 13);
    var bumps = [], k = 4 + Math.floor(rand() * 3), j;
    for (j = 0; j < k; j++) {
      bumps.push({ a: 0.3 + 0.7 * rand(), c: 0.04 + 0.92 * rand(), w: 0.03 + 0.09 * rand() });
    }
    var raw = function (x) {
      var s = 0;
      for (var i = 0; i < bumps.length; i++) {
        var d = (x - bumps[i].c) / bumps[i].w;
        s += bumps[i].a * Math.exp(-0.5 * d * d);
      }
      return s;
    };
    var xs = [], rs = [];
    for (j = 0; j < GRID; j++) {
      xs.push(j / (GRID - 1));
      rs.push(raw(xs[j]));
    }
    var rMin = Math.min.apply(null, rs), rMax = Math.max.apply(null, rs);
    var bottom = 0.5 + 1.5 * rand(), top = 7 + 2.5 * rand();
    var f = function (x) { return bottom + (raw(x) - rMin) / (rMax - rMin) * (top - bottom); };
    var ys = xs.map(f), best = 0, mean = 0;
    for (j = 0; j < GRID; j++) {
      if (ys[j] > ys[best]) best = j;
      mean += ys[j] / GRID;
    }
    return { number: number, f: f, xs: xs, ys: ys, xStar: xs[best], fStar: ys[best], mean: mean };
  }

  var game, picks, hoverX = null;

  function regretOf(y) {
    return Math.max(game.fStar - y, 0);
  }

  function finished() {
    return picks.length >= T;
  }

  // ------------------------------------------------------------------ render

  function sx(x) { return PAD_L + x * PLOT_W; }
  function sy(y) { return MAIN_Y + (Y_MAX - y) / Y_MAX * MAIN_H; }

  function renderPlot() {
    var out = [], i, bottom = MAIN_Y + MAIN_H;

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
      for (i = 0; i < GRID; i += 2) d += (i ? "L" : "M") + sx(game.xs[i]).toFixed(1) + "," + sy(game.ys[i]).toFixed(1);
      out.push('<path class="rg-truth" d="' + d + '"/>');
      picks.forEach(function (p) {
        out.push('<line class="rg-gap" x1="' + sx(p.x) + '" x2="' + sx(p.x) + '" y1="' + sy(p.y) + '" y2="' + sy(game.fStar) + '"/>');
      });
      var px = sx(game.xStar), py = sy(game.fStar);
      out.push('<path class="rg-star" d="M' + px + ',' + (py - 9) + 'l2.6,5.9 6.4,0.6-4.8,4.3 1.4,6.3-5.6-3.3-5.6,3.3 1.4-6.3-4.8-4.3 6.4-0.6z"/>');
      out.push('<text x="' + px + '" y="' + (py - 14) + '" text-anchor="middle">best x* = ' + game.xStar.toFixed(3) + ', f(x*) = ' + game.fStar.toFixed(2) + '</text>');
    }

    picks.forEach(function (p, idx) {
      var cx = sx(p.x).toFixed(1), cy = sy(p.y).toFixed(1);
      out.push('<circle class="rg-pt" cx="' + cx + '" cy="' + cy + '" r="5"/>');
      if (idx === picks.length - 1 && !finished()) out.push('<circle class="rg-pt-latest" cx="' + cx + '" cy="' + cy + '" r="8"/>');
      out.push('<text class="rg-pt-label" x="' + cx + '" y="' + (cy - 11) + '">' + p.y.toFixed(1) + '</text>');
    });

    if (hoverX !== null && !finished()) {
      var hx = sx(hoverX).toFixed(1);
      out.push('<line class="rg-hover" x1="' + hx + '" x2="' + hx + '" y1="' + MAIN_Y + '" y2="' + bottom + '"/>');
      out.push('<text x="' + (W - PAD_R) + '" y="' + (MAIN_Y - 10) + '" text-anchor="end">x = ' + hoverX.toFixed(3) + '</text>');
    }

    plot.innerHTML = out.join("");
    plot.style.cursor = finished() ? "default" : "crosshair";
  }

  function renderRegret() {
    var cum = [0], i;
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
    for (i = 0; i <= T; i++) out.push('<text x="' + rx(i) + '" y="' + (bottom + 20) + '" text-anchor="middle">' + i + '</text>');
    out.push('<text x="' + (W - PAD_R) + '" y="' + (bottom + 38) + '" text-anchor="end">step t</text>');
    out.push('<line class="rg-axis" x1="' + PAD_L + '" x2="' + (W - PAD_R) + '" y1="' + bottom + '" y2="' + bottom + '"/>');
    out.push('<line class="rg-axis" x1="' + PAD_L + '" x2="' + PAD_L + '" y1="' + REG_Y + '" y2="' + bottom + '"/>');
    out.push('<text class="rg-title" x="' + PAD_L + '" y="' + (REG_Y - 10) + '">Cumulative regret</text>');

    // Legend
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
    for (var i = 0; i < T; i++) {
      var p = picks[i], hidden = p ? "?" : "";
      rows.push("<tr><td>" + (i + 1) + "</td><td>" + (p ? p.x.toFixed(3) : "") + "</td><td>" + (p ? p.y.toFixed(2) : "") +
        "</td><td>" + (cum ? regretOf(p.y).toFixed(2) : hidden) + "</td><td>" + (cum ? cum[i + 1].toFixed(2) : hidden) + "</td></tr>");
    }
    ui.table.innerHTML = rows.join("");
  }

  function render() {
    renderPlot();
    var cum = null;
    if (finished()) {
      cum = renderRegret();
      var best = Math.max.apply(null, picks.map(function (p) { return p.y; }));
      ui.summary.innerHTML = "<strong>Game " + game.number + ": your cumulative regret is " + cum[T].toFixed(2) + "</strong> (lower is better). " +
        "Your best evaluation was " + best.toFixed(2) + ", and the true maximum is " + game.fStar.toFixed(2) + ". " +
        "Choosing x at random every time would give a cumulative regret of about " + ((game.fStar - game.mean) * T).toFixed(2) + " on average.";
      ui.status.textContent = "Game over. The hidden function is revealed below; each dashed line is the regret of one step.";
    } else {
      ui.status.textContent = "Game " + game.number + ", step " + (picks.length + 1) + " of " + T + ": click anywhere on the plot to choose x.";
    }
    ui.result.classList.toggle("rg-hidden", !finished());
    renderTable(cum);
  }

  // ------------------------------------------------------------- interaction

  function start(number) {
    number = Math.max(1, Math.min(99999, Math.floor(Number(number)) || 1));
    ui.game.value = number;
    game = makeGame(number);
    picks = [];
    hoverX = null;
    render();
  }

  function plotX(evt) {
    var pt = plot.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    var p = pt.matrixTransform(plot.getScreenCTM().inverse());
    var x = (p.x - PAD_L) / PLOT_W;
    return x >= 0 && x <= 1 && p.y >= MAIN_Y && p.y <= MAIN_Y + MAIN_H ? Math.round(x * 1000) / 1000 : null;
  }

  plot.addEventListener("click", function (evt) {
    var x = plotX(evt);
    if (x === null || finished()) return;
    picks.push({ x: x, y: game.f(x) });
    render();
  });

  plot.addEventListener("mousemove", function (evt) {
    var x = plotX(evt);
    if (x !== hoverX) {
      hoverX = x;
      renderPlot();
    }
  });

  plot.addEventListener("mouseleave", function () {
    hoverX = null;
    renderPlot();
  });

  ui.start.addEventListener("click", function () { start(ui.game.value); });
  ui.random.addEventListener("click", function () { start(1 + Math.floor(Math.random() * 99999)); });
  ui.game.addEventListener("keydown", function (evt) {
    if (evt.key === "Enter") start(ui.game.value);
  });

  // A link such as /regret-game/?game=7 opens that game directly.
  start(new URLSearchParams(window.location.search).get("game") || ui.game.value);
})();
