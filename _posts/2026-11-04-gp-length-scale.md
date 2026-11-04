---
title: 'Choose the Length Scale: Gaussian Process Regression'
date: 2026-11-04
permalink: /posts/2026/11/gp-length-scale/
tags:
  - interactive
  - gaussian processes
  - bayesian optimization
---

A Gaussian process starts with two observations of a hidden function, and you have to choose its length scale. After each choice you learn how much of the function your 95% band covered, and you get one more observation, until you have ten. Can you keep the band covering the function without making it uselessly wide? Some of the functions hide surprises that only show up later in the game.

[Play the game here.](/gp-length-scale/)
