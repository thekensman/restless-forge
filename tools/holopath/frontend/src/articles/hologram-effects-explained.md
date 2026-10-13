---
date: 2026-03-15
updated: 2026-10-13
author: Kenneth Cross
---
# Holographic Effects Explained: What Each HoloPath Setting Does to a Pixel

Every frame HoloPath renders passes through the same thirteen steps, in the same
order, inside your browser. The sliders are not independent switches. Each one
changes a number that a later step builds on, which is why two settings can
seem to fight each other, and why the same slider value looks different on
different images. This is the pipeline as the code runs it, with the numbers
behind each control.

## First, colour is thrown away

Early in the pipeline the frame is reduced to brightness alone, using the
standard television weighting: 29.9% of the red channel, 58.7% of the green and
11.4% of the blue. Everything after that works on this single brightness value,
and the hue you pick paints it back in.

So the colours in your source never reach the output. A red apple and a green
apple of the same brightness come out identical, and a pure blue subject, which
carries only 11% of the weight, comes out dark.

The same step is why the background has to be black. The output colour is
brightness multiplied by the hue, so black stays black and anything lighter
becomes coloured light. A white background turns into a solid block of cyan.

## Float / Wobble

Before anything else, the whole frame drifts by a few pixels: up to 3 sideways
and about 3.5 up and down, on a path that repeats every loop. This is the
reason a still photo comes out moving. The edge the frame drifts away from
fills with black.

## Edge Detect

Edge Detect compares each pixel's brightness with the pixel to its left and the
one above it, and adds up the differences. At 0% the image is untouched. At
100% only the outlines remain, which suits flat, evenly lit subjects that would
otherwise become a uniform blob of colour. In between, the slider blends the
outline into the original brightness.

## Hue

Cyan Hologram, Green Matrix, Magenta Neon and Blue Phantom are each one fixed
colour. Rainbow Cycle turns the whole frame through the colour wheel once per
loop: at any moment every pixel shares one hue, and the hue changes over time.
Rainbow is the setting that strains a GIF's palette most, for the reasons in
[why hologram GIFs band](/tools/holopath/articles/why-hologram-gifs-band).

## Flicker

Flicker dims the entire frame on a cycle that runs four times per loop, with a
little randomness in its timing. At 100% the dimmest moment is 30% darker than
the brightest. It only ever dims.

## Color Shift

Color Shift nudges red, green and blue by different amounts on a cycle that
repeats once per loop, so the tint breathes. Red and green rise while blue
falls, then the reverse. It is a slow drift of the whole frame, and even at
100% the change is modest.

## Glow Intensity

Glow is the most misunderstood control. It does not blur anything. It takes
every pixel brighter than half brightness and pushes it further toward the
full hue colour, where it sits. On a dark subject it does almost nothing. On a
bright one it flattens the highlights into solid colour, because those pixels
reach the most the output can show.

With the Classic preset's glow and brightness, roughly the top 30% of the
brightness range comes out as flat, pure colour. If your subject's highlights
lose their detail, turn Glow or Brightness down before touching anything else.

## Glitch

Glitch decides, row by row, whether to slide that row sideways. At 100% about
15% of the rows in a frame move, each by up to 15% of the image width, and
whatever slides off one edge reappears at the other. The choice looks random
but is fixed for each frame, so the same settings always produce the same
glitches.

## Scan Lines

Scan lines are single rows of darker pixels at a regular spacing, and the
slider sets the spacing and the darkness together:

| Slider | Every | Darkened by |
|---|---|---|
| 10% | 6th row | 6% |
| 60% | 4th row | 36% |
| 100% | 2nd row | 60% |

They scroll down by half the image height over each loop. Higher values mean
more lines and darker lines, never thicker ones.

## Noise / Static

Noise adds a random amount to every pixel, the same amount to red, green and
blue, so it reads as grey grain. At 25% the grain moves a pixel by up to 10
levels out of 255; at 100%, by up to 40. It changes every frame, and it is
expensive: random grain is the one thing GIF compression cannot shrink. On a
test subject, taking the Classic preset's Noise from 25% to 0 shrank the
default pyramid GIF from 8.3 MB to 3.7 MB.

## Chromatic Aberration

This is a checkbox, and its strength comes from the Glitch slider. Each pixel
takes 40% of its red from a few pixels to one side and 40% of its blue from the
same distance on the other side, which fringes every edge with colour. The
distance is 2 pixels with Glitch at zero and rises to 6 at full Glitch.

## Grid Overlay

A faint grid, one line every 20 pixels, drawn in the hue colour at 6%
strength. The horizontal lines scroll with the loop; the vertical ones stay
put.

## Scan beam and vignette

Two finishing steps have no controls of their own. A soft band of light about
60 pixels tall sweeps down the frame, its strength tied to Glow. Then a
vignette darkens the corners: brightness starts to fall 40% of the way from the
centre to a corner, and everything beyond 70% of that distance is at half
brightness. A subject kept near the middle of the frame never meets it.

## Brightness comes last

Brightness multiplies everything at the very end, after every other step. Its
neutral point is not the middle of the slider: 33% leaves the image as it is,
0% halves it and 100% doubles it. Because it comes last, it is the fastest way
to push highlights into flat colour, and the fastest way to rescue a dim
source.

## The presets are starting values

The five presets only set these controls; anything you change afterwards
overrides them.

| Preset | Hue | What sets it apart |
|---|---|---|
| Classic | Cyan | Moderate everything; grid, aberration and wobble on |
| Cyberpunk | Magenta | The strongest scan lines (80%), glow (90%) and glitch (70%) |
| Ghost | Blue | Edge Detect at 40% and heavy flicker (70%); no grid, no aberration |
| Glitch | Rainbow | Glitch at 95% and Color Shift at 90%; no wobble |
| Matrix | Green | Dense scan lines (70%) and little flicker; no aberration, no wobble |

For how to put these together on a real subject, see
[making a hologram step by step](/tools/holopath/articles/creating-hologram-art).

<p class="article__cta"><a href="/tools/holopath/" class="btn--holo">Try HoloPath Free →</a></p>
