---
date: 2026-10-13
author: Kenneth Cross
---
# Why Hologram GIFs Band, and What HoloPath Does About It

A smooth glow in the preview can turn into visible steps in the saved GIF: rings
of flat colour where the light used to fade evenly. That is banding, and in a
GIF it comes from one hard limit, 256 colours, and from how those 256 get
chosen. This is how HoloPath's encoder makes that choice, the flaw it used to
have, and the settings that still cause banding.

## One palette for the whole animation

A GIF can hold at most 256 colours per palette. HoloPath writes one palette for
the entire animation, so every frame shares the same 256 colours. To choose
them, it builds a sample that takes each pixel position from a different frame
in turn, so every frame is represented, and then reduces that sample to 256
colours.

The reduction is a classic method called median cut. Put every sampled colour
in one box. Find the colour channel, red, green or blue, with the widest spread
in that box, and split the box in two at the median along it. Keep splitting
until there are 256 boxes, then take the average colour of each box as a
palette entry. Every pixel of every frame is then drawn in its nearest palette
colour.

## The flaw: black ate the palette

The question that decides the outcome is which box to split next. HoloPath used
to split whichever box held the most pixels. A hologram frame is mostly black,
so the black background was always the biggest box, and it kept being split.
A box of identical black pixels splits into two boxes of identical black, so the
palette filled up with copies of black while the subject's glow went short.

Measured in a browser on a test subject (a glowing sphere and a letter, Classic
preset, four-sided pyramid layout, 24 frames), 209 of the 256 entries were
near-black and 138 were exact duplicates. Only 118 distinct colours were left,
which is why the glow showed rings. The Pepper's Ghost layout, whose frame is
almost all black, kept just 36.

The encoder now picks the box with the most pixels multiplied by the widest
colour spread, and never splits a box that holds a single colour. On the same
test:

| Layout | Distinct colours before | After |
|---|---|---|
| Pyramid 360° | 118 | 235 |
| Hologram Fan | 106 | 229 |
| Pepper's Ghost | 36 | 196 |
| Single Image | 173 | 251 |

Files changed size by between a tenth smaller and two fifths larger: more
colours give compression slightly less to work with.

## Why there is no dithering

Many GIF encoders hide banding with dithering: scattering pixels of two nearby
palette colours so that, from a distance, they average to a shade in between.
HoloPath does not dither. It maps each pixel to its nearest colour. In a still
image, dithering trades steps for fine grain. In an animation the grain is
recalculated every frame and crawls, and grain is also the hardest thing for GIF
compression to shrink, the same reason the Noise slider can more than double a
file's size.

## What still causes banding

With the palette spent sensibly, banding now comes from asking 256 colours to
cover too much:

- **Rainbow Cycle.** The whole frame turns through the colour wheel over the
  loop, and every hue shares the one palette, so each gets only a slice of it.
  A single-hue preset is close to ideal for GIF: every pixel lies on one line
  from black to the hue colour, which 256 entries can cover almost shade for
  shade.
- **Noise.** Each grain shade near black is a colour the palette has to hold.
- **Chromatic Aberration.** Its fringes add red and blue variations of every
  edge.
- **A small subject in a big frame.** The fewer pixels the subject covers, the
  fewer boxes its colours win.

If you still see bands, try a single-hue preset, lower Noise, or give the
subject more of the frame. Where your display can play it, a
[video export](/tools/holopath/articles/gif-vs-video-hologram) sidesteps the
problem: video keeps millions of colours and is far smaller.

<p class="article__cta"><a href="/tools/holopath/" class="btn--holo">Try HoloPath Free →</a></p>
