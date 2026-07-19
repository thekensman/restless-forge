---
title: Why I Build These Tools
description: The philosophy behind Restless Forge: why the tools are free and browser-only, why your files never leave your device, and how ads keep it that way without compromising it.
date: 2026-07-18
author: Ken
---

# Why I Build These Tools

## Where this started

Restless Forge didn't begin as a grand plan. It began as three separate itches. I wanted to know what my time was actually worth after taxes, commuting, and all the invisible costs of working — so I built a calculator. I wanted to make those mesmerizing hologram-pyramid GIFs without uploading my photos to a stranger's server — so I built a generator. I wanted to turn images into paths my sand table could actually draw — so I built a converter.

Each tool lived on its own little domain, with its own hosting and its own certificate to babysit. At some point the obvious question arrived: why am I running three tiny websites when what I actually have is one workshop? So everything moved under one roof — **restless-forge.dev** — and the workshop got a name that fits how it operates. Restless, because there's always another tool half-formed on the bench. Forge, because everything here is hammered out by hand, in public, and shaped by use.

## The rule that shapes everything: your files stay yours

Every tool on this site runs entirely in your browser. That's not a marketing line — it's an architectural rule that has never been broken. There are no backends. When you feed a photo into [HoloPath](/tools/holopath/), drop an image into [SandPath](/tools/sandpath/), or type your salary into [What Is My Time Worth?](/tools/what-is-my-time-worth/), that data is processed on your device by code running in your browser, and it never leaves. There is no server to send it to, because I never built one.

This constraint costs me features. Some things genuinely need heavy computation or machine learning, and when a feature can't be done honestly in the browser, I'd rather ship a manual control with an honest label than fake a capability by quietly shipping your data somewhere else. But the constraint buys something better than features: you don't have to trust me. You can read the code — it's on [GitHub](https://github.com/thekensman/) — or just watch your network tab. The tool works the same either way.

## The ad philosophy: an honest deal, stated plainly

Free tools still cost money to run — a server to serve the static files, domains, certificates, and a large amount of evening and weekend time. I fund that with two things: ads and voluntary support (Ko-fi, Buy Me a Coffee, and the Substack). Here's the deal as plainly as I can state it:

-   **The tools are free, without accounts or paywalls.** Nothing is locked. There is no "premium" tier, and no feature held hostage to an email address.
-   **Ads pay the bills, but they don't get your data from me.** Your files and inputs are processed locally and never touch a server, so there is nothing of yours for me to hand to an advertiser. The ads are served by Google AdSense, which may use its own cookies — that's disclosed in the [Privacy Policy](/privacy), not hidden in it.
-   **Ads never sit inside the work.** They don't interrupt a conversion, disguise themselves as download buttons, or push the tool below the fold. If an ad ever gets between you and the thing you came to do, that's a bug — [tell me](/contact).

I think about it like a workshop with a small sign out front. The sign pays the rent. The moment the sign starts blocking the doorway, the workshop has failed at its actual job.

## The maker philosophy: small, finished, and honest

Every tool here starts the same way: with a real problem I actually have. Not a market analysis — a Tuesday-evening annoyance. The wage calculator exists because "what's your time worth?" turns out to have a surprisingly slippery answer once taxes and commutes get involved. SandPath exists because my sand table wanted paths and my images were pixels. That origin keeps the tools honest: I am always the first user, and I have no patience for my own bad UX.

I'd rather ship something small that does its one job well than something sprawling that does ten jobs badly. Small tools can be finished — genuinely finished, tested, fast, and understandable. And when a tool can't do something, it says so. The camera preview in one of the newer tools doesn't pretend to track your body with AI it doesn't have; it gives you a manual slider and tells you exactly what it is. I consider that label a feature.

"Restless" is the other half. The forge currently has more than twenty tools in various states of completion behind the scenes, each waiting until it's actually good before it gets a place in the [directory](/tools/). Some will graduate. Some will be melted down for parts. That churn is the point — a workshop where nothing is being made isn't a workshop, it's a museum.

## What you can hold me to

Free, without accounts. Processed on your device, never on mine. Open source, so you can check. Ads that stay out of the way and a privacy policy that says what actually happens. Tools that do what their labels say — and labels that admit what the tools can't do. If the site ever drifts from any of that, the [contact page](/contact) works, and I read it.

If you're curious how a tool actually goes from idea to the directory — the scaffolding, the conventions, the pipeline — I wrote that up too: [How a Tool Gets Built](/essays/how-a-tool-gets-built).

* * *

### Tools mentioned in this essay

-   [What Is My Time Worth?](/tools/what-is-my-time-worth/) — Real hourly wage calculator
-   [HoloPath](/tools/holopath/) — Hologram GIF generator
-   [SandPath](/tools/sandpath/) — Sand table pattern converter

### Related

-   [How a Tool Gets Built](/essays/how-a-tool-gets-built) — the technical pipeline behind every Restless Forge tool
-   [About Restless Forge](/about)
