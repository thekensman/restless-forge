---
title: Why I Build These Tools
description: Notes on why these tools are free and browser-only, and how the site pays for itself without collecting anything from you.
date: 2026-07-18
author: Ken
---

# Why I Build These Tools

## Where this started

Restless Forge didn't begin as a plan. It began as three unrelated problems that each bugged me enough to write code. The first was a question: what is an hour of my time actually worth, once taxes and the commute are counted? The second was a craft project. I wanted to make those hologram-pyramid GIFs without uploading my photos to a stranger's server. The third was a sand table that needed paths to draw, while everything I had was pixels. Each problem turned into a small tool, and each tool ended up on its own little domain with its own hosting bill and its own certificate to babysit.

At some point the obvious question arrived: why was I running three tiny websites when what I actually had was one workshop? So everything moved under one roof at **restless-forge.dev**, and the workshop got a name that fits how it operates. Restless, because there is always another half-formed tool on the bench. Forge, because the work here is hammered out by hand and shaped by use.

## Your files stay on your device

Every tool on this site runs entirely in your browser. There are no backends. When you drop an image into [SandPath](/tools/sandpath/) or type a salary into [What Is My Time Worth?](/tools/what-is-my-time-worth/), the processing happens on your device and the data never leaves it. There is no server waiting on the other end. I never built one.

This rule costs me features. Some things genuinely want heavy computation or a trained model, and when a feature can't be done honestly in the browser I would rather ship a manual control with a plain label than fake the capability by sending your data somewhere behind the scenes. What the rule buys is worth more than the features it costs: you don't have to trust me. The code is on [GitHub](https://github.com/thekensman/), and your browser's network tab tells the same story.

## How the ads work

Free tools still cost money. A server has to hand out the static files, domains and certificates renew, and the building itself eats evenings and weekends. Ads cover those bills, along with voluntary support through Ko-fi, Buy Me a Coffee, and the Substack.

The deal, stated as plainly as I can manage. The tools are free, with no accounts and no premium tier; nothing is held hostage to an email address. The ads are served by Google AdSense, which may set its own cookies, and the [Privacy Policy](/privacy) says so out loud instead of burying it. Your files and inputs never reach a server, so there is nothing of yours for me to hand an advertiser even if I wanted to. And the ads keep out of the work itself: they don't imitate download buttons, and they don't wedge themselves into the middle of a running conversion. If one ever does, that's a bug. [Tell me](/contact) and I'll fix it.

I think of it like a workshop with a small sign out front. The sign pays the rent. If the sign ever blocks the doorway, the workshop has failed at its job.

## Small and finished

Every tool here starts with a problem I personally have. Not a market analysis, a Tuesday-evening annoyance. The wage calculator exists because "what is your time worth" turns out to be a slippery question once taxes and commutes get involved. SandPath exists because my sand table wanted paths and my images were pixels. I'm always the first user, and I have no patience for my own bad UX.

I would rather ship something small that does one job well than something sprawling that does ten jobs badly. A small tool can genuinely be finished. And when a tool can't do something, it should say so. The camera preview in one of the newer tools doesn't pretend to track your body with AI it doesn't have; it gives you a manual slider and a label that says exactly what it is. I count that label as a feature.

As for the restless half: more than twenty tools sit behind the scenes in various states of completion, each waiting until it's actually good before it earns a spot in the [directory](/tools/). Some will make it; others will get melted down for parts. A workshop where nothing is being made is just a museum.

## What you can hold me to

The tools stay free and never ask for an account. Whatever you put into them is processed on your device, and the code is public, so you can verify that claim instead of trusting it. The privacy policy describes what actually happens, and the label on each tool admits what it can't do. If the site ever drifts from any of that, the [contact page](/contact) works, and I read it.

If you're curious how an idea actually becomes a directory entry here, the scaffolding and conventions and pipeline, I wrote that up separately: [How a Tool Gets Built](/essays/how-a-tool-gets-built).

* * *

### Tools mentioned in this essay

-   [What Is My Time Worth?](/tools/what-is-my-time-worth/) - real hourly wage calculator
-   [HoloPath](/tools/holopath/) - hologram GIF generator
-   [SandPath](/tools/sandpath/) - sand table pattern converter

### Related

-   [How a Tool Gets Built](/essays/how-a-tool-gets-built) - the technical pipeline behind every Restless Forge tool
-   [About Restless Forge](/about)
