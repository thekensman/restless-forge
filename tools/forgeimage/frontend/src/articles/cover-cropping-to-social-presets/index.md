Every platform wants a different shape. Instagram wants a square, or a 9:16
story. X wants a 3:1 header. LinkedIn wants 4:1. YouTube wants 16:9. Your photo
is 4:3, or 3:2, or whatever your phone produces.

Something has to give, and there are only three things that can: the aspect
ratio, the pixels, or the framing.

## Three ways to fit a rectangle into a different rectangle

**Stretch.** Scale width and height independently. Nothing is lost and
everything is wrong — faces widen, circles become ellipses. Never the right
answer, and mercifully rare now.

**Contain (letterbox).** Scale until the whole image fits, then pad the gaps.
The entire image survives, but for a 3:1 header from a 4:3 photo you get a
narrow strip of picture between two large bars. On platforms that render on a
white background, the padding is conspicuous.

**Cover (crop).** Scale until the target is completely filled, then discard what
overflows. The output is entirely image, correctly proportioned. You lose the
parts outside the frame.

For social presets, cover is essentially always right. Platforms display these
images edge to edge; letterboxing looks like a mistake and stretching looks
worse.

## What cover-cropping computes

Given a source and a target aspect ratio, the crop is the largest rectangle of
the target's shape that fits inside the source.

Compare the two aspect ratios. If the source is **wider** than the target, the
full height is usable and width gets trimmed from the sides. If the source is
**taller**, the full width is usable and height gets trimmed from top and
bottom. Then the rectangle is centred and scaled to the preset's pixel
dimensions.

Concretely: a 4000 × 3000 photo (4:3) into a 1080 × 1080 square. The source is
wider, so height is fully used and the crop is 3000 × 3000 — a square taken from
the middle, discarding 500 pixels from each side. That square then scales down
to 1080 × 1080.

The presets ForgeImage ships are the ones people actually need: Instagram post
and story, X header, Facebook cover, LinkedIn banner, YouTube thumbnail, and OG
image at 1200 × 630.

## Why centred is the wrong default, and still the right default

Centred cropping is what the tool does automatically, and it is wrong more often
than it is right.

Photographs are usually not centre-weighted. Portraits put the face in the upper
third. Landscapes put the horizon on a third line. Group shots have their
subject wherever the moment put them. Crop a 4:3 portrait to a 3:1 header from
the centre and you will very often behead someone — the extreme aspect ratios
are the dangerous ones, because they discard most of the image.

It remains the right default because it is predictable and correct often enough
to be a useful starting point. The fix is not a smarter default; it is dragging
the crop, which is why the crop rectangle is adjustable rather than fixed.

The rule of thumb: the further the target aspect is from the source aspect, the
more likely you need to move the crop. Square-to-square rarely needs attention;
4:3 to 4:1 almost always does.

## Where the crop can go

The crop rectangle is clamped to the image bounds, which sounds obvious and
prevents a specific class of bug — dragging a crop partly off the edge and
getting transparent or black filler in the output where there was no image data
to draw.

Handles resize from a corner while keeping the rectangle inside the image;
dragging the middle moves it without changing its size. The aspect ratio is
locked to the preset throughout, because a crop that no longer matches the
target aspect would have to be stretched or padded to fit, which puts you back
at the start.

## Hitting a file-size limit

Some destinations impose a maximum file size. Finding the best quality that fits
under it by hand means exporting, checking, adjusting, and repeating.

ForgeImage binary-searches it. Quality is bounded between 0.05 and 0.95; it
encodes at the midpoint, and depending on whether the result fits, moves the low
or high bound. Seven iterations narrow the range to under one percent of the
quality scale — enough precision that another step would not change the visible
result.

If even quality 0.05 exceeds the limit, it says so rather than shipping
something that does not fit. Usually that means the pixel dimensions need to
come down, not the quality.

## Practical order

1. Pick the preset for where the image is going.
2. Look at the crop before exporting. Centred is a guess.
3. Drag it so the subject is where you want it — not necessarily centred; the
   thirds are usually better.
4. Set a size target only if the destination requires one.

Ready to try it? [Open ForgeImage](/tools/forgeimage/).
