---
title: "Accumulated Aggregated D-Optimal Designs for Estimating Main Effects in Black-Box Models"
collection: publications
category: manuscripts
permalink: /publication/accelerated-aggregated-d-optimal-designs
excerpt:
date: 2026-04-22
venue: "arXiv preprint"
authors: "**C.-Y. Chang** and M.-C. Chang"
status: "arXiv preprint, 2026"
paperurl: "https://arxiv.org/abs/2510.08465"
codeurl: "https://github.com/cchihyu/A2D2E"
presentationurl:
posterurl:
citation: "C.-Y. Chang and M.-C. Chang. &quot;Accelerated Aggregated D-Optimal Designs for Estimating Main Effects in Black-Box Models.&quot; <i>arXiv preprint</i>, 2026."
---

Estimating how individual input variables affect the output of a black-box model is a central task in explainable machine learning. However, existing methods suffer from two key limitations: sensitivity to out-of-distribution (OOD) evaluations, which arises when query points are placed far from the data manifold, and instability under feature correlation, which can lead to unreliable effect estimates in practice. We introduce a unified view of main effect estimation as a design problem, which reveals that all existing methods differ only in their choice of evaluation locations. Building on this formulation, we propose A2D2E, an Estimator based on Accumulated Aggregated D-Optimal Designs, which replaces evaluations with a D-optimal hypercube design to minimize the variance of main effect estimation. A2D2E is model-agnostic, requires no differentiability of the predictor, and admits a closed-form estimator with complexity comparable to existing approaches. We establish that A2D2E is consistent to the same population target as ALE, and extend this result to the realistic setting where only a surrogate model is available. Through extensive simulations across multiple predictive models and dependence settings, we demonstrate that A2D2E outperforms ALE-based methods, with the largest gains under high feature correlation.
