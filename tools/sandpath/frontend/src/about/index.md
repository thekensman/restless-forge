SandPath converts images and SVG files into patterns that kinetic sand tables
can draw. It runs entirely in your browser, costs nothing, and asks for nothing
— no account, no email address, no upload.

## Why it exists

Kinetic sand tables are lovely objects with a frustrating gap in their
ecosystem. The hardware is excellent. The pattern libraries are decent. But the
moment you want to draw *your own* thing — a logo, a sketch, a photograph of
someone — the options thin out fast.

What existed mostly fell into two camps. Some tools converted images by
scanlining them, which produces that corduroy texture where you can see every
row and the picture only works from across the room. Others were desktop
applications with an install step, or web services that wanted your file on
their server and your email in their list.

SandPath was built to skip both problems: proper vector conversion so the ball
draws continuous strokes, and a browser-only implementation so nothing has to be
uploaded to anyone.

## How it works, briefly

SVGs are parsed for their actual path data — curves, arcs, subpaths — rather
than being rasterised and re-traced. Raster images go through edge detection,
thresholding, or skeletonisation depending on what suits the source. Everything
is then simplified, reordered to minimise travel moves, and emitted as theta-rho
or G-code depending on your table's shape.

The longer version is on [how it works](/tools/sandpath/how-it-works/).

## The privacy position

There is no server to send files to. Conversion happens in your browser using
JavaScript, and your images stay on your device from the moment you drop them in
to the moment you download the result.

This is not a policy promise that could quietly change — it is a consequence of
how the tool is built. There is no upload endpoint to repurpose later.

## What it will not do

**It will not make detail appear that the ball cannot carve.** A steel ball
10–15 mm across sets a hard floor on resolution. No amount of conversion
cleverness gets under it.

**It will not render tone.** Sand tables draw lines. A photograph becomes an
interpretation of its edges, not a greyscale reproduction, and images that
depend on shading rather than shape will not survive the trip.

**It will not eliminate travel lines entirely.** The ball cannot lift, so moving
between shapes always leaves a mark. Path ordering minimises them; nothing
removes them.

Being clear about these up front seems better than letting you discover them
after a forty-minute draw.

## Part of Restless Forge

SandPath is one of several tools at [Restless Forge](/), a one-person workshop
building free, browser-first utilities. The other tools cover different ground —
real hourly wage calculation, hologram generation, tattoo sizing — but share the
same shape: useful, honest about limits, and private by construction.

The site carries advertising to cover hosting. That is the whole business model.

## Feedback

Bug reports, table profiles that are wrong, and tables that should be supported
but are not are all genuinely welcome — get in touch via the
[contact page](/contact).

Ready to convert something? Open the [converter](/tools/sandpath/).
