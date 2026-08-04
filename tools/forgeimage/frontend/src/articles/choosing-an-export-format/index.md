Most format advice is a matrix of features nobody consults at the moment they
are actually exporting something. In practice one question decides it, and a
second one covers the exceptions.

## The question that decides it

**Does this image have large areas of flat, identical colour, or does it not?**

Photographs do not. Every region of a photograph is subtly varied — noise,
gradient, texture. Screenshots, logos, diagrams, and charts do. Whole blocks of
identical pixels.

That difference is the whole thing, because it is exactly what the two families
of compression are built for.

**Lossy** formats (JPEG, lossy WebP) discard information the eye is bad at
noticing — mostly fine colour detail. On photographs this is nearly free: a
JPEG at reasonable quality is a fraction of the size with no visible difference.
On a screenshot it is a disaster, producing coloured smears around text and
halos at every hard edge, because sharp high-contrast boundaries are precisely
what the discarding step handles worst.

**Lossless** formats (PNG, lossless WebP) keep every pixel exactly and compress
by describing repetition. On a screenshot with a flat background this is
enormously effective. On a photograph there is almost no repetition to exploit,
and the file stays large.

So: **photograph → lossy. Screenshot, logo, diagram, text → lossless.**

## The second question: transparency

If any part of the image needs to be see-through, JPEG is out. It has no alpha
channel at all, and exporting a transparent image to JPEG silently fills the
transparent regions — usually with black, which is rarely what anyone wanted.

PNG and WebP both support alpha.

## Where WebP fits

WebP does both — it has a lossy mode and a lossless mode — and is meaningfully
smaller than the older format in each case. Roughly 25–35% smaller than JPEG at
comparable quality, and often better than PNG for lossless.

The catch is not browser support any more; that argument is over and WebP won.
It is everything that is not a browser. Some desktop applications, older
operating system previews, print workflows, and plenty of upload forms still do
not accept it.

The practical division:

- **Web use you control** — WebP. Smaller, and it displays everywhere it needs
  to.
- **Anything you hand to another person or system** — JPEG or PNG. They work
  everywhere without a conversation.

## Re-encoding is a one-way door

This is the one genuine trap, and it is invisible.

Every time a lossy image is decoded and re-encoded, it loses a little more. Open
a JPEG, crop it, export as JPEG, and you have applied lossy compression twice.
Do it a few more times and artifacts accumulate into something visible — the
"deep fried" look of an image that has been through many hands.

Two consequences worth internalising:

**Keep an original.** Edit from the highest-quality source you have, not from
last week's export. ForgeImage does not modify your file, but the file you feed
it might already be a fourth-generation copy.

**Do all your edits in one pass.** Crop, resize, and export once rather than
exporting between each step. One re-encode instead of three.

Converting a lossy image to a lossless format does not undo any of this. A JPEG
saved as PNG is a lossless copy of an image that already lost information — same
artifacts, larger file.

## On quality settings

For JPEG and lossy WebP, quality is roughly:

- **0.9–0.95** — visually indistinguishable from the original for nearly all
  photographs. Use when the image matters.
- **0.75–0.85** — the sensible default. Small artifacts exist and you will not
  notice them at normal viewing size.
- **0.6–0.75** — visible on close inspection, fine for thumbnails.
- **Below 0.6** — visible, and only worth it under a hard size constraint.

Going above 0.95 is close to pointless: file size climbs steeply while the
visible difference does not.

## The short version

- Photograph → JPEG, or WebP if it is for your own site.
- Screenshot, logo, diagram, anything with text → PNG.
- Needs transparency → PNG or WebP, never JPEG.
- Handing it to someone else → the boring format.
- Edit from originals, and export once.

Ready to try it? [Open ForgeImage](/tools/forgeimage/).
