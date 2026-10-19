---
date: 2026-03-15
updated: 2026-10-13
author: Kenneth Cross
---
# Best Images and Videos for Hologram Conversion

HoloPath keeps exactly one thing from your source: how bright each pixel is.
Everything else, including every colour, is discarded and repainted in the hue
you choose. Once you know what the conversion throws away, it is easy to tell
in advance which images will make good holograms and which will not.

## Judge a source in black and white

The conversion weighs each pixel's channels the way television engineers did:
58.7% green, 29.9% red, 11.4% blue. The quickest test of a source is to imagine
it in black and white, or to desaturate it in any editor. If the black-and-white
version reads clearly, the hologram will.

That weighting has consequences people do not expect:

- **Blue subjects go dark.** A saturated blue object keeps only about 11% of its
  brightness, so a blue car on a black background barely registers.
- **Colour contrast disappears.** A red flower against green leaves of the same
  brightness becomes one flat shape, because the difference between them was
  colour and colour does not survive.
- **Greens and yellows come out bright.** They carry the most weight.

## The background has to be black, not dark

The output colour is the pixel's brightness multiplied by the hue. A background
at 20% brightness therefore becomes a 20% haze of cyan across the whole frame.
On a pyramid that haze reflects as a lit sheet behind your subject; on an LED
fan it lights LEDs that should be dark. Only true black, RGB 0, 0, 0, stays
invisible.

So the most valuable preparation is to cut the subject out and fill everything
else with pure black. Any editor's background-removal tool will do it, and a
levels adjustment that pushes the darkest tones all the way to black catches
what the cut-out misses. Product shots and 3D renders that already sit on black
need no preparation at all.

## Give the glow something to work with

Glow pushes every pixel above half brightness toward the full hue colour. A
subject that is bright all over, such as a white logo, ends up as one flat
slab of colour with no inner detail. Subjects with a range of mid-tones keep
their shape: a face lit from the side, a skull, a rendered object with real
shading. For flat or evenly lit subjects, the Edge Detect slider rebuilds the
detail from outlines.

## Keep the subject in the middle

Three things crop or dim the edges of the frame:

- a vignette that halves the brightness of anything beyond 70% of the way from
  the centre to a corner;
- the fan layout, which blacks out everything outside a circle;
- the pyramid layouts, which shrink each copy to fit a quarter of the screen.

Subjects roughly as tall as they are wide use the space best. In the four-sided
pyramid layout at default settings, each copy can be at most 331 pixels wide,
so a 2:1 landscape image is drawn 331 by 165 pixels and floats in the upper
half of the pyramid, while a square one fills it.

## How much resolution is enough

The source is scaled down to the Resolution setting's width, 512 pixels by
default, and never scaled up. The layouts then draw onto a canvas twice that
size, capped at 800 pixels. For a pyramid that makes 331 pixels the most any
copy can show, and a source more than about 400 pixels wide adds nothing. On a
test image 512 pixels wide, the 512, 640 and 800 settings produced
byte-for-byte identical pyramid GIFs.

The fan layout is the exception: its subject fills 75% of the canvas, up to 600
pixels, so a sharp source of 640 pixels or more does show. In the other
direction, a source smaller than the space its layout gives it is enlarged,
and enlargement shows as softness that the scan lines then emphasise. That
space is 331 pixels for a pyramid copy and 600 for the fan.

## Video sources

HoloPath reads video by sampling 10 frames per second, up to 900 frames.
Clips up to 90 seconds keep their real speed. A longer clip has its 900 frames
spread across the whole video, so it plays back faster. Files must be under
15 MB, so trim and compress before uploading.

Each sampled frame becomes a full frame of output, and that adds up quickly.
At default settings a pyramid GIF frame takes about 350 KB, so a 30-second clip,
300 frames, would make a GIF on the order of 100 MB. For anything longer than a
few seconds, set a custom frame count or export video instead (see
[GIF or video](/tools/holopath/articles/gif-vs-video-hologram)).

What converts best is short, slow motion against black: an object turning on a
turntable, smoke, a dancer on a dark stage. Ten samples a second makes fast
motion look choppy.

## Animated GIF sources

An animated GIF is decoded frame by frame with its own timing. With "Use source
timing" on, each frame keeps its original delay; with it off, the Speed slider
sets one delay for every frame. Either way, the source's own colours are gone
after the first step, so a GIF with a heavily dithered or noisy background
needs cleaning first: those speckles survive as speckles of light.

<p class="article__cta"><a href="/tools/holopath/" class="btn--holo">Try HoloPath Free →</a></p>
