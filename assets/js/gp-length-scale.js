(function () {
  "use strict";

  var M = 401;          // grid points on [0, 1]
  var JITTER = 1e-6;    // added to the kernel diagonal for numerical stability
  var Z = 1.96;         // 95% band

  // Each function comes with its own training inputs. Later ones hide more between the points.
  var FUNCS = [
    { // a gentle wave
      f: function (x) { return Math.sin(2 * Math.PI * x); },
      xs: [0.1, 0.45, 0.85]
    },
    { // wiggles faster than three points can show
      f: function (x) { return 0.9 * Math.sin(6 * Math.PI * x); },
      xs: [0.1, 0.5, 0.9]
    },
    { // a smooth trend with a narrow spike between the first two points
      f: function (x) { return 0.6 * x - 0.3 + 1.8 * Math.exp(-Math.pow((x - 0.3) / 0.03, 2)); },
      xs: [0.1, 0.5, 0.9]
    },
    { // a jump between the second and third points
      f: function (x) { return x < 0.62 ? -0.8 + 0.2 * x : 0.8 - 0.2 * x; },
      xs: [0.15, 0.45, 0.85]
    },
    { // flat at every training point, but not in between
      f: function (x) { return 1.5 * Math.sin(5 * Math.PI * x) * Math.sin(5 * Math.PI * x) - 0.5; },
      xs: [0.0, 0.4, 0.8]
    }
  ];

  var funcEl = document.getElementById("gp-func");
  var ellEl = document.getElementById("gp-ell");
  var ellValueEl = document.getElementById("gp-ell-value");
  var revealEl = document.getElementById("gp-reveal");
  var noiseEl = document.getElementById("gp-noise");
  var redrawEl = document.getElementById("gp-redraw");
  var statusEl = document.getElementById("gp-status");
  var plotEl = document.getElementById("gp-plot");

  var revealed = false;
  var eps = [];         // standard normal draws, one per training point, scaled by the noise level

  // Seeded random numbers so each function starts with the same noise for everyone.
  function rng(seed) {
    return function () {
      seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function drawNoise(rand) {
    var n = FUNCS[parseInt(funcEl.value, 10)].xs.length;
    eps = [];
    for (var i = 0; i < n; i++) {
      // Box-Muller transform
      var u = 1 - rand(), v = rand();
      eps.push(Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v));
    }
  }

  var grid = [];
  for (var i = 0; i < M; i++) grid.push(i / (M - 1));

  function kernel(a, b, ell) {
    var d = a - b;
    return Math.exp(-0.5 * d * d / (ell * ell));
  }

  // Cholesky factor of a small symmetric positive definite matrix.
  function cholesky(A) {
    var n = A.length, L = [];
    for (var r = 0; r < n; r++) {
      L.push(new Array(n).fill(0));
      for (var c = 0; c <= r; c++) {
        var s = A[r][c];
        for (var k = 0; k < c; k++) s -= L[r][k] * L[c][k];
        L[r][c] = r === c ? Math.sqrt(Math.max(s, 1e-12)) : s / L[c][c];
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
    var n = L.length, v = new Array(n);
    for (var r = n - 1; r >= 0; r--) {
      var s = b[r];
      for (var k = r + 1; k < n; k++) s -= L[k][r] * v[k];
      v[r] = s / L[r][r];
    }
    return v;
  }

  function posterior(xs, ys, ell, noise) {
    var K = xs.map(function (a) {
      return xs.map(function (b) { return kernel(a, b, ell); });
    });
    for (var r = 0; r < xs.length; r++) K[r][r] += noise * noise + JITTER;
    var L = cholesky(K);
    var alpha = backward(L, forward(L, ys));
    var mean = [], lo = [], hi = [], sd = [];
    grid.forEach(function (x) {
      var kx = xs.map(function (a) { return kernel(x, a, ell); });
      var mu = 0;
      for (var r = 0; r < xs.length; r++) mu += kx[r] * alpha[r];
      var v = forward(L, kx);
      var varx = 1;
      for (var r2 = 0; r2 < v.length; r2++) varx -= v[r2] * v[r2];
      var s = Math.sqrt(Math.max(varx, 0));
      mean.push(mu);
      sd.push(s);
      lo.push(mu - Z * s);
      hi.push(mu + Z * s);
    });
    return { mean: mean, lo: lo, hi: hi, sd: sd };
  }

  function textColor() {
    var v = getComputedStyle(document.documentElement).getPropertyValue("--global-text-color").trim();
    return v || "#494e52";
  }

  function draw() {
    var F = FUNCS[parseInt(funcEl.value, 10)];
    var ell = Math.pow(10, parseFloat(ellEl.value));
    ellValueEl.textContent = ell < 0.1 ? ell.toFixed(3) : ell.toFixed(2);

    var noise = parseFloat(noiseEl.value);
    var ys = F.xs.map(function (x, i) { return F.f(x) + noise * eps[i]; });
    var post = posterior(F.xs, ys, ell, noise);
    var truth = grid.map(F.f);

    var width = 0;
    for (var i = 0; i < M; i++) width += post.hi[i] - post.lo[i];
    width /= M;

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
      var covered = 0, missX = [], missY = [];
      for (var j = 0; j < M; j++) {
        if (truth[j] >= post.lo[j] && truth[j] <= post.hi[j]) {
          covered++;
          missX.push(null);
          missY.push(null);
        } else {
          missX.push(grid[j]);
          missY.push(truth[j]);
        }
      }
      var pct = (100 * covered) / M;
      traces.push({
        x: grid, y: truth, mode: "lines", line: { color: "#e07b39", width: 2, dash: "dash" },
        name: "true f", hovertemplate: "x = %{x:.3f}<br>f = %{y:.3f}<extra></extra>"
      });
      traces.push({
        x: missX, y: missY, mode: "lines", line: { color: "#c0392b", width: 4 },
        name: "not covered", hoverinfo: "skip", connectgaps: false
      });
      statusEl.innerHTML = "The band covers <strong>" + pct.toFixed(1) + "%</strong> of f on [0, 1], with average width " + width.toFixed(2) + "." +
        (pct >= 99.95 ? " Full coverage! Can you keep it while making the band narrower?" : " Try a different length scale to cover the red parts.");
    } else {
      statusEl.textContent = "Average band width: " + width.toFixed(2) + ". Choose a length scale, then reveal f.";
    }

    traces.push({
      x: F.xs, y: ys, mode: "markers", marker: { color: color, size: 10, line: { color: "#fff", width: 1.5 } },
      name: "training points", hovertemplate: "x = %{x:.2f}<br>y = %{y:.3f}<extra></extra>"
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

  ellEl.addEventListener("input", draw);
  noiseEl.addEventListener("change", draw);
  redrawEl.addEventListener("click", function () {
    drawNoise(Math.random);
    draw();
  });
  funcEl.addEventListener("change", function () {
    revealed = false;
    revealEl.textContent = "Reveal f";
    drawNoise(rng(parseInt(funcEl.value, 10) + 1));
    draw();
  });
  revealEl.addEventListener("click", function () {
    revealed = !revealed;
    revealEl.textContent = revealed ? "Hide f" : "Reveal f";
    draw();
  });

  drawNoise(rng(parseInt(funcEl.value, 10) + 1));
  draw();
})();
