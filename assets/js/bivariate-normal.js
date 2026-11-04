(function () {
  "use strict";

  var N = 61;          // grid points per axis
  var SPAN = 3.5;      // plot range in standard deviations of the wider axis

  var inputs = {
    s11: document.getElementById("bn-s11"),
    s12: document.getElementById("bn-s12"),
    s21: document.getElementById("bn-s21"),
    s22: document.getElementById("bn-s22")
  };
  var statusEl = document.getElementById("bn-status");
  var plotEl = document.getElementById("bn-plot");
  var m1El = document.getElementById("bn-m1");
  var m2El = document.getElementById("bn-m2");

  function fmt(x) {
    return Number(x.toFixed(3)).toString();
  }

  function readSigma() {
    var s11 = parseFloat(inputs.s11.value);
    var s12 = parseFloat(inputs.s12.value);
    var s22 = parseFloat(inputs.s22.value);
    if (!isFinite(s11) || !isFinite(s12) || !isFinite(s22)) {
      return { error: "Please enter a number in every entry." };
    }
    if (s11 <= 0 || s22 <= 0) {
      return { error: "Both variances (diagonal entries) must be positive." };
    }
    var det = s11 * s22 - s12 * s12;
    if (det <= 0) {
      return { error: "This matrix is not positive definite: σ₁²σ₂² − σ₁₂² = " + fmt(det) + " must be positive, so |σ₁₂| must be less than " + fmt(Math.sqrt(s11 * s22)) + "." };
    }
    return { s11: s11, s12: s12, s22: s22, det: det };
  }

  function density(S) {
    var L = SPAN * Math.sqrt(Math.max(S.s11, S.s22));
    var inv11 = S.s22 / S.det, inv12 = -S.s12 / S.det, inv22 = S.s11 / S.det;
    var c = 1 / (2 * Math.PI * Math.sqrt(S.det));
    var xs = [], z = [];
    for (var i = 0; i < N; i++) xs.push(-L + (2 * L * i) / (N - 1));
    for (var j = 0; j < N; j++) {
      var row = [], x2 = xs[j];
      for (var k = 0; k < N; k++) {
        var x1 = xs[k];
        var q = inv11 * x1 * x1 + 2 * inv12 * x1 * x2 + inv22 * x2 * x2;
        row.push(c * Math.exp(-0.5 * q));
      }
      z.push(row);
    }
    return { x: xs, y: xs, z: z, peak: c, L: L };
  }

  function drawMarginal(el, L, variance, name, color, axis) {
    var xs = [], ys = [], M = 201;
    var c = 1 / Math.sqrt(2 * Math.PI * variance);
    for (var i = 0; i < M; i++) {
      var x = -L + (2 * L * i) / (M - 1);
      xs.push(x);
      ys.push(c * Math.exp(-0.5 * x * x / variance));
    }
    var trace = {
      type: "scatter",
      mode: "lines",
      x: xs,
      y: ys,
      fill: "tozeroy",
      line: { color: "#3b528b", width: 2.5 },
      fillcolor: "rgba(59,82,139,0.2)",
      hovertemplate: name + " = %{x:.2f}<br>f = %{y:.4f}<extra></extra>"
    };
    var layout = {
      title: { text: name + " ~ N(0, " + fmt(variance) + ")", font: { size: 14 } },
      margin: { l: 50, r: 15, t: 40, b: 45 },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      font: { color: color, family: getComputedStyle(document.body).fontFamily },
      xaxis: Object.assign({ title: { text: name }, range: [-L, L] }, axis),
      yaxis: Object.assign({ title: { text: "density" }, rangemode: "tozero" }, axis),
      showlegend: false
    };
    window.Plotly.react(el, [trace], layout, { responsive: true, displaylogo: false, displayModeBar: false });
  }

  function textColor() {
    var v = getComputedStyle(document.documentElement).getPropertyValue("--global-text-color").trim();
    return v || "#494e52";
  }

  function draw() {
    var S = readSigma();
    if (S.error) {
      statusEl.innerHTML = '<span class="bn-error">' + S.error + "</span>";
      return;
    }
    var d = density(S);
    var rho = S.s12 / Math.sqrt(S.s11 * S.s22);
    statusEl.textContent = "Correlation ρ = " + fmt(rho) + ",  det Σ = " + fmt(S.det) + ",  peak density = " + fmt(d.peak) + ".";
    var color = textColor();
    var axis = { color: color, gridcolor: "rgba(127,127,127,0.25)", zerolinecolor: "rgba(127,127,127,0.5)" };
    var trace = {
      type: "surface",
      x: d.x,
      y: d.y,
      z: d.z,
      colorscale: "Viridis",
      showscale: false,
      contours: {
        z: { show: true, usecolormap: true, project: { z: true } }
      },
      hovertemplate: "x₁ = %{x:.2f}<br>x₂ = %{y:.2f}<br>f = %{z:.4f}<extra></extra>"
    };
    var layout = {
      uirevision: "keep-camera",
      margin: { l: 0, r: 0, t: 10, b: 0 },
      paper_bgcolor: "rgba(0,0,0,0)",
      font: { color: color, family: getComputedStyle(document.body).fontFamily },
      scene: {
        xaxis: Object.assign({ title: { text: "x₁" } }, axis),
        yaxis: Object.assign({ title: { text: "x₂" } }, axis),
        zaxis: Object.assign({ title: { text: "density" } }, axis),
        aspectmode: "manual",
        aspectratio: { x: 1, y: 1, z: 0.7 },
        camera: { eye: { x: 1.5, y: -1.5, z: 1.1 } }
      }
    };
    window.Plotly.react(plotEl, [trace], layout, { responsive: true, displaylogo: false });

    drawMarginal(m1El, d.L, S.s11, "x₁", color, axis);
    drawMarginal(m2El, d.L, S.s22, "x₂", color, axis);
  }

  // Keep the matrix symmetric: editing either off-diagonal entry updates the other.
  inputs.s12.addEventListener("input", function () { inputs.s21.value = inputs.s12.value; draw(); });
  inputs.s21.addEventListener("input", function () { inputs.s12.value = inputs.s21.value; draw(); });
  inputs.s11.addEventListener("input", draw);
  inputs.s22.addEventListener("input", draw);

  Array.prototype.forEach.call(document.querySelectorAll(".bn-presets [data-s]"), function (btn) {
    btn.addEventListener("click", function () {
      var v = btn.getAttribute("data-s").split(",");
      inputs.s11.value = v[0];
      inputs.s12.value = v[1];
      inputs.s21.value = v[1];
      inputs.s22.value = v[2];
      draw();
    });
  });

  draw();
})();
