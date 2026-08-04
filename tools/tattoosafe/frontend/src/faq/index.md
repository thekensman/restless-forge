## How does the AR preview work?

Upload your design, activate your camera, and the image is composited onto the
live video feed with Canvas. Drag to position, pinch to resize, and use the
rotation slider to angle it.

There is deliberately no body tracking or AI. You line the design up against
your own reflection and screenshot it. That sounds like a limitation, and in one
sense it is — but manual positioning is more precise than automatic placement
for the thing you actually care about, which is whether *this* design at *this*
size sits right on *your* arm.

## Does TattooSafe store my photos or camera feed?

No. Everything happens in your browser. The camera feed is processed frame by
frame and never recorded or transmitted. Uploaded images live in browser memory
and are discarded when you close the tab.

There is no upload endpoint to send them to — the tool has no backend for image
handling at all. You can verify this by loading the page, disconnecting from the
network, and using it normally.

## How accurate is the pricing calculator?

It is a sanity check, not a quote.

The estimates come from aggregated US market data and a documented model: area
times a per-square-inch rate for the style, adjusted by placement difficulty,
plus setup and breaks, times an hourly rate. Every constant is published on the
[pricing page](/tools/tattoosafe/pricing/).

What it cannot know is your specific artist's rate, your region, whether the
design needs custom drawing time, or whether you are covering existing ink. Use
it to tell a reasonable quote from an unreasonable one, then get a real quote at
consultation.

## Why is my quote higher than the estimate?

Usually one of three things. **Complexity** — the difference between simple line
work and photorealism is five times the time per square inch, and artists
classify more work as "detailed" than clients expect. **Cover-ups** — working
over existing ink is consistently slower than clean skin. **Shop minimum** —
small pieces cost the minimum regardless of how quick they are.

A quote well above the estimate is usually correct and worth understanding
rather than arguing with. A quote well below it is worth being cautious about.

## What body placements are supported?

Sixteen: inner and outer forearm, upper arm, shoulder, wrist, chest, upper back,
ribs, sternum, lower back, thigh, calf, ankle, back of neck, behind the ear, and
back of the hand.

Each has its own usable area, scaled to the height you enter, so the fit check
reflects your proportions rather than a generic model's.

## Does the preview wrap around my arm automatically?

No, and it is worth being clear about that. There is no limb detection.

There is an optional **curve around a limb** toggle that bends the design around
a cylinder whose curvature you set by hand. It approximates how a design sits on
a rounded surface, but you are choosing the curvature, not having it measured.

## My design has a white box around it — can I remove it?

Usually. **Remove flat background** is on by default and flood-fills a solid,
uniform backdrop to transparent, so logos, line art, and clean-cut designs land
on skin without a box under them. It also handles a matte frame around artwork,
like the white margin of a product photo.

If the backdrop was dark, the light linework left behind is inverted
automatically so it previews as ink instead of vanishing against skin.

It intentionally leaves photographic backgrounds alone — busy scenes, gradient
skies — because cleanly separating those needs AI segmentation this tool does
not include, and a too-aggressive algorithm eating part of your design is worse
than a faint edge. For best results, upload artwork on a plain solid background.

## Why does my design look like a sticker?

Because it is a flat image composited onto a lit, curved, moving body. No
overlay that is not doing full 3D surface reconstruction will read as real ink.

Judge scale and placement from the preview, not realism. That is what it is for.

## Can I show the preview to my artist?

Yes, and it is genuinely useful. Screenshot either view. The silhouette view is
the better one to bring — it carries precise centimetre dimensions your artist
can work from, rather than a photo whose scale they would have to guess at.

## Can I use it on my phone?

Yes. It works in any modern mobile browser, and touch gestures — drag,
pinch-to-zoom — are supported. Phones are arguably the better experience, since
the rear camera makes it easy to frame the body part you are considering.

## Is TattooSafe free?

Completely. No account, no subscription, no paid tier holding features back.
The site carries advertising to cover hosting, and that is the entire business
model.

Ready to try it? Open the [preview tool](/tools/tattoosafe/).
