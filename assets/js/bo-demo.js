/* Interactive 1-D Bayesian optimization demo used on /bo-demo/. */
(function () {
  "use strict";

  var GRID = 241;
  var MAX_EVALS = 30;
  var XI = 0.01; // improvement margin for EI and PI

  // SVG layout (viewBox units)
  var W = 720, PAD_L = 46, PAD_R = 12;
  var TOP_Y = 24, TOP_H = 266;
  var BOT_Y = 322, BOT_H = 96;
  var PLOT_W = W - PAD_L - PAD_R;

  var xs = [];
  for (var g = 0; g < GRID; g++) xs.push(g / (GRID - 1));

  // ---------------------------------------------------------------- helpers

  function randn() {
    var u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  // Abramowitz & Stegun 7.1.26
  function normCdf(z) {
    var t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
    var erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z / 2);
    return z >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
  }

  function normPdf(z) {
    return Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI);
  }

  function argmax(a) {
    var best = 0;
    for (var i = 1; i < a.length; i++) if (a[i] > a[best]) best = i;
    return best;
  }

  function fmt(v) {
    return (Math.abs(v) < 5e-4 ? 0 : v).toFixed(3);
  }

  // ------------------------------------------------------------- objectives

  function gauss(x, c, w) {
    var d = x - c;
    return Math.exp(-d * d / w);
  }

  function randomFunction() {
    // Random Fourier features: an approximate draw from a GP with length scale 0.09
    var m = 60, ls = 0.09, w = [], b = [], a = [];
    for (var j = 0; j < m; j++) {
      w.push(randn() / ls);
      b.push(2 * Math.PI * Math.random());
      a.push(randn());
    }
    var scale = Math.sqrt(2 / m);
    return function (x) {
      var s = 0;
      for (var j = 0; j < m; j++) s += a[j] * Math.cos(w[j] * x + b[j]);
      return s * scale;
    };
  }

  var OBJECTIVES = {
    bumps: function () {
      return function (x) {
        return 0.9 * gauss(x, 0.22, 0.006) + 1.2 * gauss(x, 0.72, 0.012) + 0.25 * Math.sin(14 * x);
      };
    },
    forrester: function () {
      return function (x) {
        var a = 6 * x - 2;
        return -a * a * Math.sin(12 * x - 4) / 8;
      };
    },
    needle: function () {
      return function (x) {
        return 0.35 * Math.sin(9 * x) + 1.4 * gauss(x, 0.62, 0.0005);
      };
    },
    random: randomFunction
  };

  // ---------------------------------------------------------- linear algebra

  // Lower Cholesky factor; tolerates positive semi-definite input by zeroing degenerate columns.
  function cholesky(A, n) {
    var L = [], i, j, k;
    for (i = 0; i < n; i++) L.push(new Float64Array(n));
    for (j = 0; j < n; j++) {
      var Lj = L[j], s = A[j][j];
      for (k = 0; k < j; k++) s -= Lj[k] * Lj[k];
      if (s <= 1e-12) continue;
      var d = Math.sqrt(s);
      Lj[j] = d;
      for (i = j + 1; i < n; i++) {
        var Li = L[i], t = A[i][j];
        for (k = 0; k < j; k++) t -= Li[k] * Lj[k];
        Li[j] = t / d;
      }
    }
    return L;
  }

  function forwardSolve(L, b, n) {
    var x = new Float64Array(n);
    for (var i = 0; i < n; i++) {
      var s = b[i];
      for (var k = 0; k < i; k++) s -= L[i][k] * x[k];
      x[i] = L[i][i] ? s / L[i][i] : 0;
    }
    return x;
  }

  function backSolve(L, b, n) {
    var x = new Float64Array(n);
    for (var i = n - 1; i >= 0; i--) {
      var s = b[i];
      for (var k = i + 1; k < n; k++) s -= L[k][i] * x[k];
      x[i] = L[i][i] ? s / L[i][i] : 0;
    }
    return x;
  }

  // ------------------------------------------------------- Gaussian process

  function kern(a, b, ell) {
    var d = (a - b) / ell;
    return Math.exp(-0.5 * d * d);
  }

  function gpFit(X, y, ell, noiseVar) {
    var n = X.length, K = [], i, j;
    for (i = 0; i < n; i++) {
      var row = new Float64Array(n);
      for (j = 0; j < n; j++) row[j] = kern(X[i], X[j], ell) + (i === j ? noiseVar : 0);
      K.push(row);
    }
    var L = cholesky(K, n);
    var alpha = backSolve(L, forwardSolve(L, y, n), n);
    var quad = 0, logDet = 0;
    for (i = 0; i < n; i++) {
      quad += y[i] * alpha[i];
      logDet += Math.log(L[i][i]);
    }
    return {
      X: X, n: n, ell: ell, L: L, alpha: alpha,
      lml: -0.5 * quad - logDet - 0.5 * n * Math.log(2 * Math.PI)
    };
  }

  function gpPredict(model) {
    var n = model.n, mean = new Float64Array(GRID), sd = new Float64Array(GRID), V = [];
    for (var gi = 0; gi < GRID; gi++) {
      var ks = new Float64Array(n), m = 0, vv = 0, i;
      for (i = 0; i < n; i++) {
        ks[i] = kern(xs[gi], model.X[i], model.ell);
        m += ks[i] * model.alpha[i];
      }
      var v = forwardSolve(model.L, ks, n);
      for (i = 0; i < n; i++) vv += v[i] * v[i];
      mean[gi] = m;
      sd[gi] = Math.sqrt(Math.max(1 - vv, 1e-12));
      V.push(v);
    }
    return { mean: mean, sd: sd, V: V };
  }

  // One joint draw from the posterior over the grid.
  function gpSample(model, post) {
    var n = model.n, C = [], a, b, i;
    for (a = 0; a < GRID; a++) {
      var row = new Float64Array(GRID), Va = post.V[a];
      for (b = 0; b <= a; b++) {
        var Vb = post.V[b], c = kern(xs[a], xs[b], model.ell);
        for (i = 0; i < n; i++) c -= Va[i] * Vb[i];
        row[b] = c;
      }
      row[a] += 1e-8;
      C.push(row);
    }
    for (a = 0; a < GRID; a++) for (b = a + 1; b < GRID; b++) C[a][b] = C[b][a];
    var L = cholesky(C, GRID), z = [], out = new Float64Array(GRID);
    for (i = 0; i < GRID; i++) z.push(randn());
    for (a = 0; a < GRID; a++) {
      var s = post.mean[a];
      for (b = 0; b <= a; b++) s += L[a][b] * z[b];
      out[a] = s;
    }
    return out;
  }

  // ------------------------------------------------------------------- state

  var el = function (id) { return document.getElementById(id); };
  var svg = el("bo-plot");
  if (!svg) return;

  var ui = {
    objective: el("bo-objective"), acq: el("bo-acq"),
    kappa: el("bo-kappa"), kappaVal: el("bo-kappa-val"), kappaWrap: el("bo-kappa-wrap"),
    ell: el("bo-ell"), ellVal: el("bo-ell-val"), autofit: el("bo-autofit"),
    noise: el("bo-noise"), noiseVal: el("bo-noise-val"),
    step: el("bo-step"), play: el("bo-play"), reset: el("bo-reset"), truth: el("bo-truth"),
    stats: el("bo-stats"), message: el("bo-message")
  };

  var f, trueY, yLo, yHi, trueMaxIdx;
  var X = [], Y = [];
  var view = null; // everything render() needs, recomputed by update()
  var hoverX = null;
  var timer = null;

  function noiseStd() {
    return (Number(ui.noise.value) / 100) * (trueY ? Math.max.apply(null, trueY) - Math.min.apply(null, trueY) : 1);
  }

  function evaluate(x) {
    X.push(x);
    Y.push(f(x) + noiseStd() * randn());
  }

  function newProblem() {
    f = OBJECTIVES[ui.objective.value]();
    trueY = xs.map(f);
    var lo = Math.min.apply(null, trueY), hi = Math.max.apply(null, trueY), pad = 0.25 * (hi - lo);
    yLo = lo - pad;
    yHi = hi + pad;
    trueMaxIdx = argmax(trueY);
    X = [];
    Y = [];
    evaluate(0.05 + 0.9 * Math.random());
    evaluate(0.05 + 0.9 * Math.random());
    ui.message.textContent = "";
  }

  function update() {
    var n = X.length, i;
    var mu0 = 0, s = 0;
    for (i = 0; i < n; i++) mu0 += Y[i] / n;
    for (i = 0; i < n; i++) s += (Y[i] - mu0) * (Y[i] - mu0) / n;
    s = Math.max(Math.sqrt(s), 0.1);
    var ys = Y.map(function (y) { return (y - mu0) / s; });
    var nv = Math.pow(noiseStd() / s, 2) + 1e-6;

    var model;
    if (ui.autofit.checked) {
      for (var t = 0; t <= 40; t++) {
        var cand = gpFit(X, ys, Math.pow(10, -1.6 + 1.3 * t / 40), nv);
        if (!model || cand.lml > model.lml) model = cand;
      }
      ui.ell.value = Math.log10(model.ell);
    } else {
      model = gpFit(X, ys, Math.pow(10, Number(ui.ell.value)), nv);
    }

    var post = gpPredict(model);
    var best = Math.max.apply(null, ys);
    var kind = ui.acq.value, kappa = Number(ui.kappa.value);
    var acq = new Float64Array(GRID), sample = null;

    if (kind === "ts") {
      sample = gpSample(model, post);
      acq = sample;
    } else {
      for (var gi = 0; gi < GRID; gi++) {
        var m = post.mean[gi], sd = post.sd[gi], imp = m - best - XI, z = imp / sd;
        if (kind === "ei") acq[gi] = sd < 1e-9 ? Math.max(imp, 0) : imp * normCdf(z) + sd * normPdf(z);
        else if (kind === "pi") acq[gi] = normCdf(z);
        else acq[gi] = m + kappa * sd;
      }
    }

    var toRaw = function (v) { return v * s + mu0; };
    view = {
      ell: model.ell,
      mean: Array.prototype.map.call(post.mean, toRaw),
      sd: Array.prototype.map.call(post.sd, function (v) { return v * s; }),
      sample: sample ? Array.prototype.map.call(sample, toRaw) : null,
      acq: acq,
      next: argmax(acq)
    };
    syncLabels();
    render();
  }

  // ------------------------------------------------------------------ render

  function sx(x) { return PAD_L + x * PLOT_W; }
  function syTop(y) { return TOP_Y + (yHi - y) / (yHi - yLo) * TOP_H; }

  function pathFrom(values, yMap) {
    var d = "";
    for (var i = 0; i < GRID; i++) d += (i ? "L" : "M") + sx(xs[i]).toFixed(1) + "," + yMap(values[i]).toFixed(1);
    return d;
  }

  function niceTicks(lo, hi, count) {
    var raw = (hi - lo) / count, step = Math.pow(10, Math.floor(Math.log10(raw))), r = raw / step;
    if (r >= 7.5) step *= 10;
    else if (r >= 3.5) step *= 5;
    else if (r >= 1.5) step *= 2;
    var ticks = [];
    for (var v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) ticks.push(Math.round(v / step) * step);
    return ticks;
  }

  var ACQ_TITLES = {
    ei: "Expected improvement",
    ucb: "Upper confidence bound",
    pi: "Probability of improvement",
    ts: "Thompson sample"
  };

  function render() {
    var out = [], i;
    var bottom = TOP_Y + TOP_H, botBottom = BOT_Y + BOT_H;

    out.push('<defs><clipPath id="bo-clip-top"><rect x="' + PAD_L + '" y="' + TOP_Y + '" width="' + PLOT_W + '" height="' + TOP_H + '"/></clipPath></defs>');

    // Axes, grid and ticks
    niceTicks(yLo, yHi, 5).forEach(function (t) {
      var y = syTop(t).toFixed(1);
      out.push('<line class="bo-gridline" x1="' + PAD_L + '" x2="' + (W - PAD_R) + '" y1="' + y + '" y2="' + y + '"/>');
      out.push('<text x="' + (PAD_L - 6) + '" y="' + y + '" dy="0.32em" text-anchor="end">' + (+t.toFixed(2)) + '</text>');
    });
    [0, 0.25, 0.5, 0.75, 1].forEach(function (t) {
      out.push('<text x="' + sx(t) + '" y="' + (botBottom + 18) + '" text-anchor="middle">' + t + '</text>');
    });
    out.push('<line class="bo-axis" x1="' + PAD_L + '" x2="' + (W - PAD_R) + '" y1="' + bottom + '" y2="' + bottom + '"/>');
    out.push('<line class="bo-axis" x1="' + PAD_L + '" x2="' + PAD_L + '" y1="' + TOP_Y + '" y2="' + bottom + '"/>');
    out.push('<line class="bo-axis" x1="' + PAD_L + '" x2="' + (W - PAD_R) + '" y1="' + botBottom + '" y2="' + botBottom + '"/>');
    out.push('<line class="bo-axis" x1="' + PAD_L + '" x2="' + PAD_L + '" y1="' + BOT_Y + '" y2="' + botBottom + '"/>');

    // Top panel: band, truth, sample, mean
    out.push('<g clip-path="url(#bo-clip-top)">');
    var upper = "", lower = "";
    for (i = 0; i < GRID; i++) upper += (i ? "L" : "M") + sx(xs[i]).toFixed(1) + "," + syTop(view.mean[i] + 1.96 * view.sd[i]).toFixed(1);
    for (i = GRID - 1; i >= 0; i--) lower += "L" + sx(xs[i]).toFixed(1) + "," + syTop(view.mean[i] - 1.96 * view.sd[i]).toFixed(1);
    out.push('<path class="bo-band" d="' + upper + lower + 'Z"/>');
    if (ui.truth.checked) out.push('<path class="bo-truth" d="' + pathFrom(trueY, syTop) + '"/>');
    if (view.sample) out.push('<path class="bo-sample" d="' + pathFrom(view.sample, syTop) + '"/>');
    out.push('<path class="bo-mean" d="' + pathFrom(view.mean, syTop) + '"/>');
    out.push('</g>');

    // Next query line across both panels
    var nx = sx(xs[view.next]).toFixed(1);
    out.push('<line class="bo-next" x1="' + nx + '" x2="' + nx + '" y1="' + TOP_Y + '" y2="' + botBottom + '"/>');

    // Observations: best one ringed, latest one outlined
    var bestIdx = argmax(Y);
    for (i = 0; i < X.length; i++) {
      var cx = sx(X[i]).toFixed(1), cy = syTop(Math.max(yLo, Math.min(yHi, Y[i]))).toFixed(1);
      if (i === bestIdx) out.push('<circle class="bo-best" cx="' + cx + '" cy="' + cy + '" r="9"/>');
      out.push('<circle class="bo-obs" cx="' + cx + '" cy="' + cy + '" r="4.5"/>');
      if (i === X.length - 1 && X.length > 2) out.push('<circle class="bo-obs-latest" cx="' + cx + '" cy="' + cy + '" r="6.5"/>');
    }

    // Bottom panel: acquisition scaled to the panel
    var aMin = Math.min.apply(null, view.acq), aMax = Math.max.apply(null, view.acq), span = aMax - aMin || 1;
    var syBot = function (a) { return BOT_Y + BOT_H - 6 - (a - aMin) / span * (BOT_H - 12); };
    var acqPath = pathFrom(view.acq, syBot);
    out.push('<path class="bo-acq-area" d="' + acqPath + 'L' + sx(1) + ',' + botBottom + 'L' + sx(0) + ',' + botBottom + 'Z"/>');
    out.push('<path class="bo-acq-line" d="' + acqPath + '"/>');
    var my = syBot(view.acq[view.next]);
    out.push('<path class="bo-next-marker" d="M' + nx + ',' + (my - 1).toFixed(1) + 'l-5,-9h10z"/>');

    // Titles
    out.push('<text class="bo-panel-title" x="' + PAD_L + '" y="' + (TOP_Y - 8) + '">Objective and GP surrogate</text>');
    out.push('<text class="bo-panel-title" x="' + PAD_L + '" y="' + (BOT_Y - 8) + '">' + ACQ_TITLES[ui.acq.value] + '</text>');

    // Hover guide
    if (hoverX !== null) {
      var hx = sx(hoverX).toFixed(1);
      out.push('<line class="bo-hover" x1="' + hx + '" x2="' + hx + '" y1="' + TOP_Y + '" y2="' + bottom + '"/>');
    }

    svg.innerHTML = out.join("");
    renderStats(bestIdx);
  }

  function renderStats(bestIdx) {
    var parts = [
      "<span><b>Evaluations:</b> " + X.length + " / " + MAX_EVALS + "</span>",
      "<span><b>Best found:</b> " + fmt(Y[bestIdx]) + " at x = " + fmt(X[bestIdx]) + "</span>"
    ];
    if (ui.truth.checked) {
      var regret = trueY[trueMaxIdx] - f(X[bestIdx]);
      parts.push("<span><b>True max:</b> " + fmt(trueY[trueMaxIdx]) + " at x = " + fmt(xs[trueMaxIdx]) + "</span>");
      parts.push("<span><b>Regret:</b> " + fmt(Math.max(regret, 0)) + "</span>");
    }
    ui.stats.innerHTML = parts.join("");
  }

  function syncLabels() {
    ui.kappaVal.textContent = Number(ui.kappa.value).toFixed(1);
    ui.kappaWrap.classList.toggle("bo-hidden", ui.acq.value !== "ucb");
    ui.ellVal.textContent = (view ? view.ell : Math.pow(10, Number(ui.ell.value))).toFixed(3);
    ui.ell.disabled = ui.autofit.checked;
    ui.noiseVal.textContent = ui.noise.value === "0" ? "none" : ui.noise.value + "% of range";
    var full = X.length >= MAX_EVALS;
    ui.step.disabled = full;
    if (full) ui.message.textContent = "Reached " + MAX_EVALS + " evaluations. Press Reset to start again.";
  }

  // ------------------------------------------------------------- interaction

  function step() {
    if (X.length >= MAX_EVALS) return stop();
    evaluate(xs[view.next]);
    update();
    if (X.length >= MAX_EVALS) stop();
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    ui.play.textContent = "Play";
  }

  function plotCoords(evt) {
    var pt = svg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    var p = pt.matrixTransform(svg.getScreenCTM().inverse());
    return { x: (p.x - PAD_L) / PLOT_W, y: p.y };
  }

  function inPlot(c) {
    return c.x >= 0 && c.x <= 1 && c.y >= TOP_Y && c.y <= BOT_Y + BOT_H;
  }

  svg.addEventListener("click", function (evt) {
    var c = plotCoords(evt);
    if (!inPlot(c) || X.length >= MAX_EVALS) return;
    stop();
    evaluate(c.x);
    update();
  });

  svg.addEventListener("mousemove", function (evt) {
    var c = plotCoords(evt);
    var next = inPlot(c) ? c.x : null;
    svg.style.cursor = next === null ? "default" : "crosshair";
    if (next !== hoverX) {
      hoverX = next;
      render();
    }
  });

  svg.addEventListener("mouseleave", function () {
    hoverX = null;
    render();
  });

  ui.step.addEventListener("click", function () {
    stop();
    step();
  });

  ui.play.addEventListener("click", function () {
    if (timer) return stop();
    if (X.length >= MAX_EVALS) return;
    ui.play.textContent = "Pause";
    step();
    timer = setInterval(step, 700);
  });

  ui.reset.addEventListener("click", function () {
    stop();
    newProblem();
    update();
  });

  ui.objective.addEventListener("change", function () {
    stop();
    newProblem();
    update();
  });

  [ui.kappa, ui.ell, ui.noise].forEach(function (slider) {
    slider.addEventListener("input", update);
  });
  ui.acq.addEventListener("change", update);
  ui.autofit.addEventListener("change", update);
  ui.truth.addEventListener("change", render);

  newProblem();
  update();
})();
