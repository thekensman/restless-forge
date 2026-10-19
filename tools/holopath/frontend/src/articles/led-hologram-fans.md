---
date: 2026-03-15
updated: 2026-10-13
author: Kenneth Cross
---
# LED Hologram Fans: How a Spinning Blade Draws an Image

An LED hologram fan is a blade, or several, lined with LEDs and spun fast enough
to disappear. As it turns, a controller switches each LED on and off at exactly
the right moment, and your eye merges the sweeps into a picture that seems to
hang in the air. Unlike a pyramid, a fan reflects nothing: it draws the image
directly, one ring of light at a time, and that shapes what works on one.

## Persistence of vision, in practice

Your eye cannot follow the blade. What it registers is the light each LED
leaves along its path, blended over many turns. Once the blade completes a turn
faster than your eye can separate, the trails fuse into a steady image and the
dark blade between the lit points vanishes. A faster blade, or more blades,
makes the picture steadier; more LEDs along each blade make it sharper.

## The picture is drawn in rings and spokes

A rectangular image has to be redrawn in the fan's own geometry. Each LED sits
at a fixed distance from the hub and can only ever draw one ring. The
controller divides each turn into a fixed number of steps and decides, at every
step, which LEDs to light. The fan's pixels sit where those rings cross those
spokes.

That makes detail uneven across the disc. Near the hub the steps crowd
together, and at the rim they spread apart. On a hypothetical fan that switches
its LEDs 360 times per turn, the gap between steps is under 1 mm at 5 cm from
the hub and about 4.4 mm at the rim of a 50 cm disc. Fine detail belongs near
the centre; the edge suits bold shapes.

## Black is the trick

An LED that is off is invisible, and through the gaps in the spinning blade you
see the wall behind. That is what makes a fan image float: every black pixel in
your file is a hole in the picture. It is also why the background must be pure
black. Anything else, even a faint grey, lights LEDs across the whole disc and
turns the floating object into a glowing plate.

HoloPath helps twice here. Its output colour is the source's brightness times
the hue, so black in your source stays black, and its fan layout forces
everything outside a circle to black.

## What HoloPath's fan layout does

The Hologram Fan layout draws on a square canvas, 800 by 800 pixels at the
default resolution setting:

- the subject is scaled to fit 75% of the width, up to 600 pixels, and centred;
- everything outside a circle 90% of the width is set to black, leaving a
  margin inside the disc;
- the image is not mirrored, because you look at a fan directly rather than in
  a reflection.

The vignette that darkens the corners of every HoloPath frame suits a fan well,
since the circle would have cut those corners off anyway.

## Sending a file to a fan

Fans differ more than any other hologram display, so check the manual for three
things:

- **Which formats it takes.** Some fans read GIFs or videos from a memory card;
  others only accept files through their own app, which converts what you give
  it.
- **Its resolution.** Fans are far coarser than an 800-pixel canvas, and their
  software scales your file down. If the fan's app limits file size, the
  Resolution setting of 256 gives a 512-pixel canvas at about half the size.
- **How it handles timing.** A converter may re-time frames to the fan's own
  rate, so a loop can run faster or slower than it did in HoloPath.

At default settings, a 24-frame fan GIF measured 6.9 MB on a test subject. If
that is too big for your fan's transfer, cut Noise first, because random grain
compresses worst of all. Fewer frames or a lower resolution come next.

## Mounting and viewing

A fan is a fast-spinning blade, so mount it on a wall or stand out of reach,
with its guard on if it came with one. View it from straight in front: from the
side the disc flattens into an ellipse and the image with it. Like every
hologram display, it looks best in dim light.

<p class="article__cta"><a href="/tools/holopath/" class="btn--holo">Try HoloPath Free →</a></p>
