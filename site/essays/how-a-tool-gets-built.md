---
title: How a Tool Gets Built
description: The technical pipeline behind every Restless Forge tool: one monorepo, a scaffold script, shared conventions, tests, automated deploys, and a hidden-until-ready launch process.
date: 2026-07-18
author: Ken
---

# How a Tool Gets Built

Restless Forge currently hosts a handful of live tools and more than twenty in progress behind the scenes. That only works as a one-person operation because the path from "idea" to "live in the directory" is the same every time. This essay walks through that pipeline — the repository, the scaffold, the conventions, and the automation — for anyone curious how a small workshop ships browser-only software repeatedly without drowning in maintenance.

## One repository, many tools

Everything lives in a single monorepo: the landing site, every tool, the build scripts, and the server configuration. Each tool is a self-contained folder — `tools/<name>/frontend/` — with its own `package.json`, its own tests, and its own dev server. The global pages (this essay included) are plain static HTML in a `site/` folder with no build step at all.

The important property is that the platform *discovers* tools instead of being told about them. The build script, the dev proxy, and the test runner all scan `tools/*/frontend/` and pick up whatever they find, reading each tool's port and URL base from its own config. Adding tool number twenty-seven doesn't mean editing five lists — the platform notices it exists.

## Born from a template

No tool starts from a blank folder. A scaffold script (`scripts/new-tool.sh`) copies a maintained template, substitutes the tool's name, accent prefix, dev port, and emoji, and installs dependencies. Thirty seconds later there's a running skeleton with the site header and footer, a themed page, a test suite with a passing smoke test, and all the metadata plumbing (favicons, social preview images, structured data) already wired.

The template encodes the architecture rule that defines the whole site: **no backends**. Every tool is TypeScript compiled to static files, doing its work with browser APIs — Canvas for image processing, Web Workers for heavy loops, `getUserMedia` for camera features. If a feature can't be done client-side, it doesn't ship. The payoff is that your files never leave your device, and my operational surface is "serve static files," which is about as calm as web operations get.

## Shared chrome, personal character

Every tool renders the same header and footer from one shared script, and styles them with one shared stylesheet — but each tool defines a small set of CSS custom properties (background, text, accent, border, font) that theme that chrome to match its own personality. [HoloPath](/tools/holopath/) feels different from [What Is My Time Worth?](/tools/what-is-my-time-worth/), yet the navigation, the support links, and the layout bones are literally the same code. One fix in the shared layer fixes every tool at once; no markup is copy-pasted between tools.

## Logic you can test without a browser

Inside each tool, the code splits in two. Everything that can be pure — unit conversion, pricing math, crop geometry, path generation — lives in an `engine` module with no DOM dependencies, and the app file just wires that engine to inputs and canvases. The engine is where the unit tests live: the repo currently runs hundreds of tests across all tool suites on every change. When a field test turns up a bug (and field tests always turn up bugs), the fix usually lands in a pure function next to a new test that would have caught it.

## The pipeline: push, verify, deploy

Work happens on branches; every pull request runs the full build and every tool's test suite in CI. Merging to `main` triggers the deploy workflow: it compiles each tool, assembles everything into one `dist/` folder with cache-busting hashes on the shared assets, syncs it to the server, and reloads nginx with a validation check and automatic rollback if the config is bad. A scheduled health check hits the live site every half hour and opens an issue if anything — pages, certificates, cache headers — looks wrong.

There's even automation for the content itself: some tools carry data that changes yearly (tax brackets, mileage rates, price indexes), and a scheduled job refreshes the whole matrix each January and opens a pull request with sources cited, with a separate freshness check as a backstop in case that job ever fails silently.

## Hidden until ready

Here's the part visitors never see: most of the forge is dark. A new tool deploys to production long before it launches — reachable by direct URL for field testing on real phones, but marked `noindex` so search engines ignore it, absent from the [directory](/tools/), and excluded from the sitemap. It stays that way through however many rounds of testing it takes; the camera-preview tool went through several field-test cycles before its rough edges were honestly labeled or fixed.

Launching, when it finally happens, is deliberately boring: flip one status flag in the directory data (the single source of truth that renders the homepage and directory cards), remove the `noindex` tags, add the pages to the sitemap, add the ad units, and redeploy. A written checklist keeps that honest — the same steps in the same order, every time.

## Why bother with all this for free tools?

Because process is what makes "free" sustainable. Every hour not spent on bespoke infrastructure is an hour spent on the tools themselves, and every convention means a bug fixed once instead of twenty-six times. The forge stays restless precisely because the machinery around it is calm. The "why" behind that — the philosophy, and the honest deal with ads that funds it — gets its own essay: [Why I Build These Tools](/essays/why-i-build-these-tools).

* * *

### Tools mentioned in this essay

-   [What Is My Time Worth?](/tools/what-is-my-time-worth/) — Real hourly wage calculator
-   [HoloPath](/tools/holopath/) — Hologram GIF generator
-   [SandPath](/tools/sandpath/) — Sand table pattern converter

### Related

-   [Why I Build These Tools](/essays/why-i-build-these-tools) — the philosophy behind the workshop
-   [The code on GitHub](https://github.com/thekensman/)
