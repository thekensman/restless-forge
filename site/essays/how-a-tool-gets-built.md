---
title: How a Tool Gets Built
description: A walk through the machinery that turns an idea into a live tool on this site, from scaffold script to automated deploy, and why most of the forge stays hidden.
date: 2026-07-18
author: Ken
---

# How a Tool Gets Built

Restless Forge currently hosts a handful of live tools and more than twenty in progress behind the scenes. That only works as a one-person operation because the path from idea to live-in-the-directory is the same every time. This is a walk through that machinery, for anyone curious how a small workshop keeps shipping browser-first software without drowning in maintenance.

## Everything in one repository

The landing site, every tool, the build scripts, and the server configuration all live in a single monorepo. Each tool is a self-contained folder, `tools/<name>/frontend/`, with its own dependencies and its own dev server; the tests live there too. The global pages, this essay included, are plain static HTML with no build step at all.

The property that matters most is that the platform *discovers* tools instead of being told about them. The build script, the dev proxy, and the test runner all scan `tools/*/frontend/` and pick up whatever they find, reading each tool's port and URL base from the tool's own config. Adding tool number twenty-seven doesn't mean editing five lists. The platform notices it exists.

## Born from a template

No tool starts from a blank folder. A scaffold script copies a maintained template, substitutes the new tool's name, dev port, and emoji, and installs dependencies. Thirty seconds later there is a running skeleton with the site's header and footer in place, a passing smoke test, and the metadata plumbing (favicons, social previews and so on) already wired.

The template encodes the rule that defines the whole site: client-side by default. Every tool is TypeScript compiled to static files, doing its work with browser APIs. Canvas handles the image work; a Web Worker takes over when a loop gets heavy. When a feature honestly can't be done client-side, it either doesn't ship or the tool moves to the site's one small API service and wears a "Cloud-assisted" badge that says so up front. The payoff still runs in both directions: for the browser-only majority your files never leave your device, and my operational surface stays a static file server plus one small service, which is about as calm as web operations get.

## Shared chrome

Every tool renders the same header and footer from one shared script and styles them with one shared stylesheet. Each tool then defines a handful of CSS custom properties (background, text, accent, and so on) that theme the chrome to match its own character. [HoloPath](/tools/holopath/) feels nothing like [What Is My Time Worth?](/tools/what-is-my-time-worth/), yet the layout bones are literally the same code. A fix in the shared layer lands in every tool at once, and no markup gets copy-pasted between them.

## Logic you can test without a browser

Inside each tool the code splits in two. Anything that can be pure (unit conversion, pricing math, crop geometry, path generation) lives in an engine module with no DOM dependencies, and the app file wires that engine to inputs and canvases. The engine is where the unit tests live; the repo currently runs hundreds of them, across all the tool suites, on every change. When a field test turns up a bug (field tests always turn up bugs), the fix usually lands in a pure function next to a new test that would have caught it.

## Push, verify, deploy

Work happens on branches, and every pull request runs the full build plus every tool's test suite in CI. Merging to `main` triggers the deploy: each tool compiles, everything assembles into one folder with cache-busting hashes on the shared assets, the result syncs to the server, and nginx reloads behind a validation check that rolls back automatically if the config is bad. A scheduled health check hits the live site every half hour and opens an issue when a page or a certificate looks wrong.

There is automation for content, too. Some tools carry data that changes yearly, tax brackets and mileage rates for instance, and a scheduled job refreshes that data each January and opens a pull request with its sources cited. A separate freshness check backstops the job in case it ever fails silently.

## Hidden until ready

Most of the forge is dark, and visitors never see that part. A new tool deploys to production long before it launches: reachable by direct URL for field testing on real phones, but marked `noindex` so search engines ignore it, absent from the [directory](/tools/), and left out of the sitemap. It stays that way through however many rounds of testing it takes. The camera-preview tool went through several field-test cycles before its rough edges were either fixed or honestly labeled.

Launching is the boring part, on purpose. Flip one status flag in the directory data, remove the `noindex` tags, add the pages to the sitemap and the ad units to the pages, then redeploy. A written checklist keeps it honest, the same steps in the same order every time.

## Why bother

Process is what makes free sustainable. An hour not spent nursing bespoke infrastructure is an hour spent on a tool, and a convention means a bug gets fixed once instead of twenty-six times. Keeping the machinery calm is what leaves room for the restlessness. As for why the site works this way at all, the no-backend rule and the deal with ads that funds everything, that story has its own essay: [Why I Build These Tools](/essays/why-i-build-these-tools).

* * *

### Tools mentioned in this essay

-   [What Is My Time Worth?](/tools/what-is-my-time-worth/) - real hourly wage calculator
-   [HoloPath](/tools/holopath/) - hologram GIF generator
-   [SandPath](/tools/sandpath/) - sand table pattern converter

### Related

-   [Why I Build These Tools](/essays/why-i-build-these-tools) - the philosophy behind the workshop
-   [The code on GitHub](https://github.com/thekensman/)
