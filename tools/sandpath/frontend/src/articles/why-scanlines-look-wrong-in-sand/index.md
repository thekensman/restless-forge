Here is the obvious way to get a photograph onto a sand table. Convert it to
greyscale. Walk across it row by row. Where a pixel is dark, wiggle the ball;
where it is light, move straight. Repeat for every row.

This is roughly how an inkjet printer works, it is straightforward to implement,
and several sand table converters do exactly it. The results are consistently
disappointing, and the reason is worth understanding — it explains what SandPath
does instead.

## Why printers get away with it

An inkjet lays down opaque dots at a few hundred per inch. Adjacent rows overlap
slightly, ink bleeds a fraction into the paper fibres, and the eye integrates
everything above a few dozen rows per inch into continuous tone. The row
structure exists but is invisible.

None of those conditions hold in sand.

## Why sand does not

**The ball is enormous.** A typical sand table ball is 10–15 mm across. On a
400 mm bed that is one row per 2.5% of the table's width — call it forty rows,
total, versus the several thousand a printer would use across the same distance.

**Rows cannot overlap.** Two adjacent grooves do not blend; the sand between
them stands up as a ridge. Where a printer gets smooth tone, sand gets
corduroy.

**Nothing lifts.** A printer's head moves without printing between rows. The
ball cannot. Every return sweep ploughs a groove of its own, so the "blank"
parts of the image are as carved as the dark parts.

**Sand has no tone.** A groove is a groove. There is no darker groove for a
darker pixel — you can only vary spacing or amplitude, and both are limited by
the ball's width.

Put together: scanlining a photograph gives you forty parallel furrows across
the table with some wiggle in them. From across a room it may resolve into
something. Up close, which is where people actually look at sand tables, it is
visibly a raster.

## What sand is actually good at

The medium's strength is the opposite of a printer's. A sand table draws one
continuous, elegant line of arbitrary length and curvature. The whole aesthetic
— the reason people buy these things — is a single unbroken path wandering
through the sand.

So the right conversion strategy is not "reproduce the image." It is **find the
lines in the image and draw those.** That is a vectorisation problem, and it has
three good answers depending on what the source material is.

## Outline: edge detection

**Outline** mode runs Sobel edge detection, convolving the image with a pair of
gradient kernels — one horizontal, one vertical — to find where brightness
changes sharply. Combining their responses gives edge strength at every pixel;
thresholding and following those edges gives contours.

The output is a sketch: the boundaries in a photograph, without any filled
areas. This is the mode for photographs and detailed artwork, and the mental
model to hold is a line drawing done by someone tracing the photo, not a
reproduction of it.

It works best when the subject is distinct from the background. Busy scenes
produce edge detections everywhere and the result reads as noise.

## Threshold: marching squares

**Threshold** mode splits the image into two regions at a brightness cutoff,
then extracts the boundary between them using marching squares — an algorithm
that examines each 2×2 cell of the binary grid and emits the contour segment
passing through it, then stitches the segments into closed loops.

Because the output is closed, well-defined outlines, this is the strongest mode
for logos, silhouettes, lettering, and high-contrast graphics. It is also the
mode most sensitive to its threshold: a photograph run through it typically
yields either a black blob or nothing, depending on which side of the cutoff the
image sits.

## Centerline: skeletonisation

**Centerline** mode iteratively erodes shapes until only a one-pixel-wide medial
line remains, then traces that.

The distinction from Outline matters most on line art. Trace a drawn stroke with
edge detection and you get two lines — one down each side — which in sand reads
as a hollow tube. Skeletonise it and you get one line down the middle, which is
what the original stroke was. For handwriting, sketches, and pen drawings this
is the mode that behaves the way you expect.

## After tracing: simplification

Whichever mode runs, the traced paths carry far more points than the ball can
express — often one per pixel. Douglas–Peucker simplification recursively
removes points lying within a tolerance of the line between their neighbours.

The effect is dramatic and nearly free: point counts commonly drop by an order
of magnitude while the visible shape is unchanged, because most of the discarded
points described detail finer than the ball's diameter. That is the Path Detail
control.

## Choosing well

The single highest-leverage decision is the trace mode, and the failure mode is
predictable: photographs run through Threshold, line art run through Outline.
If a conversion looks wrong, change the mode before touching anything else.

And accept the medium. A sand table renders an *interpretation* of a
photograph — its edges, its structure — not the photograph. Sources that survive
the trip are ones whose meaning lives in shape rather than tone.

Ready to try it? [Open the converter](/tools/sandpath/), or read
[how the conversion works](/tools/sandpath/how-it-works/).
