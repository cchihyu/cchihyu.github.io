---
title: "Collaborative Contextual Bayesian Optimization"
collection: publications
category: manuscripts
permalink: /publication/federated-offline-contextual-bayesian-optimization
excerpt:
date: 2026-04-20
venue: "arXiv preprint"
authors: "**C.-Y. Chang**, Q. Chen, T. Gao, C. Okwudire, D. Fenning, N. Dasgupta, W. Lu and R. A. Kontar"
status: "arXiv preprint, 2026"
paperurl: "https://arxiv.org/abs/2604.18912"
codeurl: "https://github.com/cchihyu/Collaborative-Contextual-Bayesian-Optimization"
presentationurl:
posterurl:
citation: "C.-Y. Chang, Q. Chen, T. Gao, C. Okwudire, D. Fenning, N. Dasgupta, W. Lu and R. A. Kontar. &quot;Collaborative Contextual Bayesian Optimization.&quot; <i>arXiv preprint</i>, 2026."
---

Discovering optimal designs through sequential data collection is essential in many real-world applications. While Bayesian Optimization (BO) has achieved remarkable success in this setting, growing attention has recently turned to context-specific optimal design, formalized as Contextual Bayesian Optimization (CBO). Unlike BO, CBO is inherently more challenging as it must approximate an entire mapping from the context space to its corresponding optimal design, requiring simultaneous exploration across contexts and exploitation within each. In many modern applications, such tasks arise across multiple potentially heterogeneous but related clients, where collaboration can significantly improve learning efficiency. We propose CCBO, Collaborative Contextual Bayesian Optimization, a unified framework enabling multiple clients to jointly perform CBO with controllable contexts, supporting both online collaboration and offline initialization from peers' historical beliefs, with an optional privacy-preserving communication mechanism. We establish sublinear regret guarantees and demonstrate, through extensive simulations and a real-world hot rolling application, that CCBO achieves substantial improvements over existing approaches even under client heterogeneity. The code to reproduce the results can be found at this https URL
