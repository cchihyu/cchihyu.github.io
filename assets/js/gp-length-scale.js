(function () {
  "use strict";

  var M = 401;          // grid points on [0, 1]
  var JITTER = 1e-6;    // added to the kernel diagonal for numerical stability
  var Z = 1.96;         // 95% band
  var NOISE = 0.1;      // observation noise standard deviation, fixed and not shown to players

  // Each game has a hidden function and five observation points.
  // Later games hide more between the observations.
  var GAMES = [
    { // a gentle wave
      f: function (x) { return Math.sin(2 * Math.PI * x); },
      xs: [0.1, 0.3, 0.5, 0.7, 0.9]
    },
    { // wiggles faster than five observations can show
      f: function (x) { return 0.9 * Math.sin(6 * Math.PI * x); },
      xs: [0.1, 0.3, 0.5, 0.7, 0.9]
    },
    { // a smooth trend with a narrow spike between two observations
      f: function (x) { return 0.6 * x - 0.3 + 1.8 * Math.exp(-Math.pow((x - 0.3) / 0.03, 2)); },
      xs: [0.05, 0.2, 0.45, 0.7, 0.95]
    },
    { // a jump between 0.5 and 0.75
      f: function (x) { return x < 0.62 ? -0.8 + 0.2 * x : 0.8 - 0.2 * x; },
      xs: [0.1, 0.3, 0.5, 0.75, 0.95]
    },
    { // the first four observations are all at the same height
      f: function (x) { return 1.5 * Math.sin(5 * Math.PI * x) * Math.sin(5 * Math.PI * x) - 0.5; },
      xs: [0.0, 0.2, 0.4, 0.6, 0.9]
    }
  ];

  var funcEl = document.getElementById("gp-func");
  var ellEl = document.getElementById("gp-ell");
  var ellValueEl = document.getElementById("gp-ell-value");
  var revealEl = document.getElementById("gp-reveal");
  var plotEl = document.getElementById("gp-plot");

  var game, ys, revealed;

  var grid = [];
  for (var i = 0; i < M; i++) grid.push(i / (M - 1));

  // Seeded random numbers so every player sees the same observations in a game.
  function rng(seed) {
    return function () {
      seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function normal(rand) {
    // Box-Muller transform
    var u = 1 - rand(), v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function kernel(a, b, ell) {
    var d = a - b;
    return Math.exp(-0.5 * d * d / (ell * ell));
  }

  // Cholesky factor of a small symmetric positive definite matrix.
  function cholesky(A) {
    var size = A.length, L = [];
    for (var r = 0; r < size; r++) {
      L.push([]);
      for (var c = 0; c < size; c++) L[r].push(0);
      for (var c2 = 0; c2 <= r; c2++) {
        var s = A[r][c2];
        for (var k = 0; k < c2; k++) s -= L[r][k] * L[c2][k];
        L[r][c2] = r === c2 ? Math.sqrt(Math.max(s, 1e-12)) : s / L[c2][c2];
      }
    }
    return L;
  }

  // Solve L v = b for lower triangular L.
  function forward(L, b) {
    var v = [];
    for (var r = 0; r < L.length; r++) {
      var s = b[r];
      for (var k = 0; k < r; k++) s -= L[r][k] * v[k];
      v.push(s / L[r][r]);
    }
    return v;
  }

  // Solve L^T v = b for lower triangular L.
  function backward(L, b) {
    var size = L.length, v = new Array(size);
    for (var r = size - 1; r >= 0; r--) {
      var s = b[r];
      for (var k = r + 1; k < size; k++) s -= L[k][r] * v[k];
      v[r] = s / L[r][r];
    }
    return v;
  }

  // Posterior mean and 95% band of f given the observations.
  function posterior(ell) {
    var xs = game.xs, y = ys, n = xs.length;
    var K = xs.map(function (a) {
      return xs.map(function (b) { return kernel(a, b, ell); });
    });
    for (var r = 0; r < n; r++) K[r][r] += NOISE * NOISE + JITTER;
    var L = cholesky(K);
    var alpha = backward(L, forward(L, y));
    var mean = [], lo = [], hi = [];
    grid.forEach(function (x) {
      var kx = xs.map(function (a) { return kernel(x, a, ell); });
      var mu = 0;
      for (var r2 = 0; r2 < n; r2++) mu += kx[r2] * alpha[r2];
      var v = forward(L, kx);
      var varx = 1;
      for (var r3 = 0; r3 < v.length; r3++) varx -= v[r3] * v[r3];
      var s = Math.sqrt(Math.max(varx, 0));
      mean.push(mu);
      lo.push(mu - Z * s);
      hi.push(mu + Z * s);
    });
    return { mean: mean, lo: lo, hi: hi };
  }

  // The parts of f outside the band, with gaps where f is covered.
  function misses(post) {
    var missX = [], missY = [];
    for (var j = 0; j < M; j++) {
      var t = game.f(grid[j]);
      var out = t < post.lo[j] || t > post.hi[j];
      missX.push(out ? grid[j] : null);
      missY.push(out ? t : null);
    }
    return { x: missX, y: missY };
  }

  function currentEll() {
    return Math.pow(10, parseFloat(ellEl.value));
  }

  function fmtEll(ell) {
    return ell < 0.1 ? ell.toFixed(3) : ell.toFixed(2);
  }

  function textColor() {
    var v = getComputedStyle(document.documentElement).getPropertyValue("--global-text-color").trim();
    return v || "#494e52";
  }

  function draw() {
    var ell = currentEll();
    ellValueEl.textContent = fmtEll(ell);
    var post = posterior(ell);
    var color = textColor();

    var traces = [
      { // lower edge of the band, drawn first so the upper edge can fill down to it
        x: grid, y: post.lo, mode: "lines", line: { width: 0 }, hoverinfo: "skip", showlegend: false
      },
      {
        x: grid, y: post.hi, mode: "lines", line: { width: 0 }, fill: "tonexty",
        fillcolor: "rgba(59,82,139,0.22)", name: "95% band", hoverinfo: "skip"
      },
      {
        x: grid, y: post.mean, mode: "lines", line: { color: "#3b528b", width: 2.5 },
        name: "GP mean", hovertemplate: "x = %{x:.3f}<br>mean = %{y:.3f}<extra></extra>"
      }
    ];

    if (revealed) {
      var s = misses(post);
      traces.push({
        x: grid, y: grid.map(game.f), mode: "lines", line: { color: "#e07b39", width: 2, dash: "dash" },
        name: "true f", hovertemplate: "x = %{x:.3f}<br>f = %{y:.3f}<extra></extra>"
      });
      traces.push({
        x: s.x, y: s.y, mode: "lines", line: { color: "#c0392b", width: 4 },
        name: "not covered", hoverinfo: "skip", connectgaps: false
      });
    }

    traces.push({
      x: game.xs, y: ys, mode: "markers",
      marker: { color: color, size: 10, line: { color: "#fff", width: 1.5 } },
      name: "observations", hovertemplate: "x = %{x:.2f}<br>y = %{y:.3f}<extra></extra>"
    });

    var axis = { color: color, gridcolor: "rgba(127,127,127,0.25)", zerolinecolor: "rgba(127,127,127,0.5)" };
    var layout = {
      margin: { l: 50, r: 15, t: 10, b: 45 },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      font: { color: color, family: getComputedStyle(document.body).fontFamily },
      xaxis: Object.assign({ title: { text: "x" }, range: [0, 1] }, axis),
      yaxis: Object.assign({ title: { text: "f(x)" }, range: [-2.8, 2.8] }, axis),
      legend: { orientation: "h", x: 0, y: 1.02, yanchor: "bottom" }
    };
    window.Plotly.react(plotEl, traces, layout, { responsive: true, displaylogo: false, displayModeBar: false });
  }

  function start() {
    var idx = parseInt(funcEl.value, 10);
    game = GAMES[idx];
    var rand = rng(idx + 1);
    ys = game.xs.map(function (x) { return game.f(x) + NOISE * normal(rand); });
    revealed = false;
    revealEl.textContent = "Reveal f";
    draw();
  }

  ellEl.addEventListener("input", draw);
  funcEl.addEventListener("change", start);
  revealEl.addEventListener("click", function () {
    revealed = !revealed;
    revealEl.textContent = revealed ? "Hide f" : "Reveal f";
    draw();
  });

  start();
})();
