## How does the camera preview work?

Upload your design, start the camera, and the image is composited onto the live
video feed with Canvas. Drag to position, pinch to resize, and use the rotation
slider to angle it.

The standard preview stays where you put it. You line the design up against
your arm and screenshot it, which is the most precise way to judge whether
*this* design at *this* size sits right on *your* arm. For a version that
follows you as you move, turn on Full AR (below).

## How do I see the tattoo at its real size?

Calibrate the camera with a card. A camera cannot tell how far away your arm
is, so until you calibrate, the size on screen is an estimate, and the hint
under the preview says so.

1. Start the camera and tap **Calibrate size**.
2. Hold a bank card, driving licence or ID card flat against your skin, next to
   where the tattoo will go. All of these are the same size: 85.6 × 54 mm.
3. Drag the dashed outline onto the card and resize it (pinch, scroll, or the
   slider) until its edges line up with the card's, then tap **Done**.

From then on the design is drawn at its real size, and pinching it changes the
tattoo's size and the price estimate together. The calibration only holds at
that distance: calibrate again if you move the phone closer or further away.
Rotating the phone or restarting the camera drops it, and the hint tells you
when that happens.

Calibration belongs to the standard preview. Full AR takes its scale from your
height instead, because at the distance Full AR needs, a card is too small on
screen to match.

## What is Full AR?

An optional mode that tracks your body. Tap **Full AR (body tracking)** and the
design stays on the placement you picked as you move. It turns with the limb,
shortens when the limb points toward the camera, curves to the limb's measured
width when **Curve around a limb** is on, and disappears under clothing that
covers the skin when **Hide under clothing** is on.

It runs MediaPipe, Google's open-source body-tracking library, inside your
browser. The first time, that means a download of about 30 MB from this site;
your browser keeps it, so later visits start faster. Tracking works the
processor hard, so older phones may slow down or get warm. The standard preview
stays the default, and **Standard preview** switches back at any time.

## Why does Full AR need to see my face?

The body tracker finds a person by their face first and works out the rest of
the body from there. A close-up of one arm or leg, with no face in view, never
locks on.

So frame yourself the way a mirror would. Prop your phone against something, or
hold it facing a mirror, and step back until your face and the body part are
both in view. For a thigh or calf that means most of your body, so the design
takes up a small part of the screen. That is the trade-off for having it
follow you. If tracking loses you, the hint under the preview says what it
needs to see.

Full AR starts with the front camera and mirrors the picture. **Flip camera**
switches to the rear camera when someone else is holding the phone.

## Which placements does Full AR follow?

Eight: inner and outer forearm, upper arm, shoulder, chest, sternum, thigh, and
calf. Choose a side with the **Side** menu, or leave it on **Either** to follow
whichever side is more visible.

The other eight stay where you drag them, even in Full AR. The wrist, the back
of the hand and the spot behind the ear are too small for a body tracker to
place a design on reliably, and nobody can film their own upper back, lower
back or back of the neck.

## How accurate is the size in Full AR?

It is an estimate. Full AR works out the scale from the height you entered and
the usual proportions of a body: a forearm is about 15% of a person's height, a
thigh about 25%. Your own proportions can differ from those averages by a few
percent, and the tracker's idea of where your joints are can be off by a few
percent more. It leans on the limbs that look longest, because a limb pointing
at the camera looks shorter than it is.

For an exact size, use the standard preview and calibrate it with a card.

## Does TattooSafe store my photos or camera feed?

No. Everything happens in your browser. The camera feed is processed frame by
frame and never recorded or transmitted. Uploaded images live in browser memory
and are discarded when you close the tab.

There is no upload endpoint to send them to — the tool has no backend for image
handling at all. You can verify this by loading the page, disconnecting from the
network, and using it normally.

Full AR changes none of that. Its tracking model downloads from this site and
then runs in your browser, on frames that never leave your device. It needs a
connection the first time, for that download.

## How accurate is the pricing calculator?

It is a sanity check, not a quote.

The estimate comes from a documented model: area times a per-square-inch rate
for the style, adjusted by placement difficulty, plus setup and breaks, times an
hourly rate. The hourly bands are typical ranges for US shops, and the minutes
per square inch are planning assumptions. Every constant is published on the
[pricing page](/tools/tattoosafe/pricing/) so you can check it.

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

In Full AR, yes. With **Curve around a limb** on, it measures the limb's width in
the camera picture and curves the design to match.

In the standard preview, the same toggle bends the design around a cylinder
whose curvature you set by hand with the **Curvature** slider. That approximates
how a design sits on a rounded surface, but you are choosing the curvature
rather than having it measured.

## My design has a white box around it — can I remove it?

Usually. **Remove flat background** is on by default and flood-fills a solid,
uniform backdrop to transparent, so logos, line art, and clean-cut designs land
on skin without a box under them. It also handles a matte frame around artwork,
like the white margin of a product photo.

If the backdrop was dark, the light linework left behind is inverted
automatically so it previews as ink instead of vanishing against skin.

It intentionally leaves photographic backgrounds alone — busy scenes, gradient
skies — because cleanly separating those needs a segmentation model trained on
artwork, which this tool does not include, and a too-aggressive algorithm eating
part of your design is worse than a faint edge. For best results, upload artwork on a plain solid background.

## Why does my design look like a sticker?

Because it is a flat image composited onto a lit, curved, moving body. No
overlay that is not doing full 3D surface reconstruction will read as real ink.
Full AR gets closer, since the design curves with the limb and tucks under
clothing, but it is still a flat image.

Use the preview to judge placement, and to judge size once you have calibrated
it with a card. That is what it is for.

## Can I show the preview to my artist?

Yes, and it is genuinely useful. Screenshot either view. The silhouette view is
the better one to bring — it carries precise centimetre dimensions your artist
can work from, rather than a photo whose scale they would have to guess at.

## Can I use it on my phone?

Yes. It works in any modern mobile browser, and touch gestures (drag, pinch to
resize) are supported. Phones are arguably the better experience, since the rear
camera makes it easy to frame the body part you are considering. Full AR runs on
phones too, but it is the heaviest part of the tool, and older phones may
struggle with it.

## Is TattooSafe free?

Completely. No account, no subscription, no paid tier holding features back.
The site carries advertising to cover hosting, and that is the entire business
model.

Ready to try it? Open the [preview tool](/tools/tattoosafe/).
