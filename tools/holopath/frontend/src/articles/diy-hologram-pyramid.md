---
date: 2026-03-15
updated: 2026-10-13
author: Kenneth Cross
---
# DIY Hologram Pyramid: Cut One to Fit Your Screen

A hologram pyramid is four panels of clear plastic taped into an upside-down,
flat-topped pyramid that stands on a phone or tablet. HoloPath exists because
of one: it was built for a STEM project that turned Magna-Tiles into a hologram
projector, written up on [Substack](https://restlessforge.substack.com/p/hologram-stem).
This guide gives you the measurements for your own screen, worked out so the
pyramid matches the layout HoloPath produces.

## What you need

- Clear plastic sheet: overhead-projector film, a clear plastic folder, or the
  lid of a CD case. Thin film flexes but gives the cleanest single image; a CD
  lid is stiff but thicker, so it shows a faint double image.
- A ruler, a fine marker and a craft knife or sharp scissors.
- Clear tape.

Skip glass: it is hard to cut accurately and dangerous to handle as small
panels. Skip frosted or tinted plastic, which kills the reflection.

## The shape of each panel

Each of the four panels is a trapezoid: a long bottom edge, a short top edge
and two slanted sides. In use the pyramid stands on its short end, and the
faces lean out at 45°. Three measurements define it:

- **Base (B)**, the long edge.
- **Top (T)**, the short edge, which becomes the square opening that sits on
  the screen.
- **Panel height (H)**, measured straight up the middle of the panel.

For the faces to sit at exactly 45°, the panel height and the slanted sides
follow from the other two:

<div class="formula">H = 0.707 × (B − T)<br>slanted side = 0.866 × (B − T)</div>

The well-known template of a 60 mm base, 10 mm top and 35 mm height is this
rule at work: 0.707 × 50 = 35.4.

## Sizing it to HoloPath's layout

HoloPath's four-sided layout leaves 3% of the screen empty at each edge, then
draws each copy almost to the centre, stopping about 5.6% of the screen's width
short of it. A pixel's distance from the centre becomes its height in the
floating image, so the pyramid has to cover that whole band:

- make the **base about 95%** of your screen's short side, no less than 94%;
- make the **top about 11%** of it, no more than 11.3%.

A smaller base cuts off the top of the hologram; a wider top opening cuts off
its feet. Measure the screen's short side across the lit area only, not the
bezel, because a square GIF played full screen fills exactly that width.

| Screen's short side | Base | Top | Panel height | Slanted side |
|---|---|---|---|---|
| 65 mm (typical phone) | 62 mm | 7 mm | 38.9 mm | 47.6 mm |
| 150 mm (small tablet) | 143 mm | 16 mm | 89.8 mm | 110.0 mm |

The phone pyramid makes a hologram about 27 mm tall; the tablet one, about
62 mm.

## Cutting and assembly

1. Draw one trapezoid on paper first and check it against the formula: if the
   slanted sides come out shorter or longer than 0.866 × (B − T), the faces
   will not sit at 45°.
2. Trace four copies onto the plastic. Score film or a CD lid with a knife
   along a ruler and snap it, or cut film with scissors in one smooth stroke.
   Matching panels matter more than perfect edges.
3. Tape the slanted sides together on the outside only. Tape on the inside
   faces shows up in the reflection.
4. Check that the top opening is square and the pyramid stands without rocking.

## Using it

Make the hologram in HoloPath with the **Pyramid 360°** layout, which places
four mirrored copies with their bases pointing at the centre. Play it full
screen at maximum brightness, with auto-brightness off, in a dark room. Stand
the pyramid on its small end in the middle of the screen, with its sides
parallel to the screen edges, and look straight in at the height of its middle.

## When it does not look right

- **A faint second image beside the first.** Both surfaces of the plastic
  reflect. Use thinner sheet.
- **One pair of opposite faces is much dimmer.** Your screen's light is
  polarised, and a face reflects one polarisation ten times better than the
  other. Turn the phone through 90° to swap the dim pair; the [optics
  article](/tools/holopath/articles/how-hologram-pyramids-work) explains why.
- **The image tilts or sits too high or too low.** The faces are not at 45°.
  Re-check the panel height against the formula.
- **The feet or the top of the hologram are missing.** The opening is too wide
  or the base too small for the layout; see the sizing rules above.
- **Text reads backwards.** The file was made with a layout that is not
  mirrored, such as Single Image. Use Pyramid 360°.

<p class="article__cta"><a href="/tools/holopath/" class="btn--holo">Try HoloPath Free →</a></p>
