TattooSafe answers two questions people have before they get tattooed and
usually cannot answer well: **how big will this actually be on me**, and **what
should it cost**. It does both in your browser, with your camera, without an
account and without sending anything anywhere.

## The sizing problem

Tattoo designs are almost always viewed on a screen — a phone, a shop's iPad, a
printed flash sheet. None of those tell you how the piece relates to your
forearm. A design that looks balanced at 900 pixels wide can arrive as a
palm-sized piece that swallows your wrist, or a delicate thing that disappears
on a thigh.

The traditional fix is a paper stencil at the shop, which works but happens
late — after you have chosen the design, booked the slot, and paid a deposit.
TattooSafe moves that check to before the decision.

Two views handle it. The **camera preview** composites your design onto a live
video feed so you can move it around your actual body; calibrate it against a
bank card held on your skin and the design is drawn at its real size. Turn on
**Full AR** and the preview tracks your body instead, keeping the design on your
forearm, thigh or chest as you move. The **silhouette view** draws the design's
footprint on a body outline at its true share of the placement for your height,
with real centimetre dimensions: useful when you want measurements rather than
a vibe, and shareable with your artist.

## How the silhouette is built

The body outline is a fixed figure, drawn as inline SVG. What scales is each
placement: its usable area is a set fraction of the height you enter. A design
8 cm long covers about a third of a 155 cm person's inner forearm and about a
quarter of a 195 cm person's, and the silhouette draws it at that proportion.

Sixteen placements are modelled, each with its own usable area: inner and outer
forearm, upper arm, shoulder, wrist, chest, upper and lower back, ribs,
sternum, thigh, calf, ankle, back of neck, behind the ear, and back of the hand.
When you enter a design's dimensions, TattooSafe checks them against the
placement's maximum and tells you whether it fits, rather than letting you find
out at the shop.

## Background removal

Reference images usually arrive with a white or near-white box around the
artwork, which looks wrong composited onto skin. TattooSafe flood-fills inward
from the image edges, removing connected regions close to the border's colour.
A matte frame and the backdrop behind it come off in separate passes.

This is deliberately conservative. It clears flat backgrounds and leaves
anything textured alone, because the failure mode of an aggressive algorithm —
eating part of the design — is much worse than leaving a faint edge. Designs on
busy or photographic backgrounds will need manual cutting out first.

## The pricing side

The estimator converts dimensions into area, applies a time-per-square-inch rate
for the style, adjusts for how difficult the placement is to work on, adds setup
and breaks, and multiplies by an hourly rate. Every constant it uses is
documented on the [pricing page](/tools/tattoosafe/pricing/) so you can check
the reasoning rather than trust the output.

It is a sanity check, not a quote. A real quote comes from a real artist looking
at a real design.

## Body tracking

Full AR is optional and off until you ask for it, because it is heavy. It runs
MediaPipe, Google's open-source body-tracking library, in your browser: a pose
model finds your shoulders, elbows, hips and knees in each frame, and a second
model sorts the picture into skin, clothes and background. TattooSafe anchors
the design between the joints of the placement you chose, turns and shortens it
with the limb, curves it to the limb's measured width, and hides it where
clothing covers the skin.

Three things come with that. It downloads about 30 MB from this site the first
time. It finds you by your face, so the camera has to see your face and the
body part together, which means propping the phone up or using a mirror. And it
follows eight placements: inner and outer forearm, upper arm, shoulder, chest,
sternum, thigh and calf. Its size comes from the height you entered and typical
body proportions, so for an exact size the card calibration is still the way.

## Your data

Nothing you enter or upload is sent to a server. The camera feed is processed
frame by frame in the browser and never recorded. Images stay on your device.
There is no account, no upload endpoint, and nothing to delete later. Full AR
downloads its tracking models from this site and runs them in your browser, so
the frames it reads stay on your device too.

This is a property of how the tool is built, not a policy that could quietly
change. Full details in the [privacy policy](/privacy) and
[terms of use](/terms).

## Honest limitations

**It is a preview, not a simulation.** The standard overlay does not track your
arm or respond to how skin moves, and its curve setting bends the design around
a cylinder whose curvature you choose. Full AR follows the limb and measures its
width, but only from far enough away to see your face, and its size is an
estimate from your height. Treat placement and scale as a good approximation,
not a rendering.

**Lighting affects the illusion.** Compositing a flat image onto a lit body
always reads slightly as a sticker. Judge the size and position, not the
realism.

**It cannot tell you if a design is good.** It tells you whether it fits and
roughly what it costs. Whether it is right for you is between you and your
artist.

## Part of Restless Forge

TattooSafe is one of several tools at [Restless Forge](/), a one-person workshop
building free, browser-first utilities. Source is on
[GitHub](https://github.com/thekensman/restless-forge) — bug reports, placement
corrections, and feature requests are all welcome via the
[contact page](/contact).

Ready to try it? Open the [preview tool](/tools/tattoosafe/).
