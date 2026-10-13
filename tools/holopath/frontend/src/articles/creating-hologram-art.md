---
date: 2026-03-15
updated: 2026-10-13
author: Kenneth Cross
---
# Making a Hologram with HoloPath, Step by Step

This is the whole process, from picking a source to a file playing under a
pyramid, with the decisions that matter at each step and the numbers behind
them. Everything runs in your browser; nothing is uploaded.

## 1. Pick and prepare a source

HoloPath accepts JPG, PNG, WebP and BMP images, animated GIFs, and MP4, WebM,
MOV, M4V or OGG video, up to 15 MB. Only the brightness of your source survives
the conversion, so the best subjects are bright, shaded and sitting on pure
black: a side-lit face, a skull, a rendered object, a logo.

Cut the subject out and fill the background with black before uploading. A
background that is merely dark becomes a haze of coloured light.
[Which images work, and why](/tools/holopath/articles/best-images-for-holograms)
goes deeper.

## 2. Start from a preset

The five presets set every effect at once:

- **Classic**: cyan, moderate everything. The safest start.
- **Matrix**: green, dense scan lines, steady.
- **Ghost**: blue, outlines and heavy flicker. Good for faces and flat subjects.
- **Cyberpunk**: magenta, with the strongest scan lines, glow and glitch.
- **Glitch**: rainbow, with heavy row displacement. The hardest to keep smooth
  in a GIF, because its colours change through the loop.

The preview starts animating as soon as the file loads, and every change shows
immediately.

## 3. Adjust the settings that matter most

Most of the sliders are seasoning. These decide whether the result works:

**Glow and Brightness** together decide how much of your subject turns into
flat colour. Glow pushes everything above half brightness toward pure colour,
and Brightness, applied last, multiplies the lot. If highlights lose their
detail, lower one of them. Brightness is neutral at 33%, not 50%.

**Noise** decides the file size more than anything else. It adds grain that GIF
compression cannot shrink: on a test subject, the default pyramid GIF was 8.3 MB
with the Classic preset's 25% noise and 3.7 MB with none.

**Edge Detect** rescues subjects that come out as a blob of colour by redrawing
the image from its outlines.

[What each setting does to a pixel](/tools/holopath/articles/hologram-effects-explained)
has the numbers for all of them.

## 4. Choose the layout for your hardware

| Display | Layout | What HoloPath does |
|---|---|---|
| Plastic pyramid on a phone or tablet | Pyramid 360° | Four mirrored copies, each pointing at an edge of the screen |
| Three-sided showcase | Pyramid 270° | Three mirrored copies, 120° apart |
| LED hologram fan | Hologram Fan | Subject centred, everything outside a circle blacked out |
| Glass at 45° over a screen | Pepper's Ghost | One mirrored copy, low in a 16:9 frame |
| Anything else | Single Image | The effects alone, no layout |

The reflective layouts are mirrored on purpose. A reflection swaps left and
right, so the screen has to show the mirror image for text and logos to read
correctly in the glass. How each display works:
[pyramids](/tools/holopath/articles/how-hologram-pyramids-work),
[LED fans](/tools/holopath/articles/led-hologram-fans) and
[Pepper's Ghost](/tools/holopath/articles/peppers-ghost-illusion).

## 5. Set resolution, frames and speed

**Resolution** caps the width your source is processed at; it never enlarges a
source. The layouts then draw on a canvas twice that width, up to 800 pixels.
For a pyramid, 400 is enough: each copy can be at most 331 pixels wide on the
800-pixel canvas, so higher settings only take longer. For the fan, whose
subject can reach 600 pixels, 640 or 800 does show. Choosing 256 halves the
canvas to 512 pixels and cut the test file from 8.3 MB to 3.5 MB.

**Frames** is how many frames the effects animate over: 8 to 120, default 24.
A still image moves only because the effects cycle once per loop, so more
frames means smoother motion and, in a GIF, a proportionally larger file: 48
frames made 16.7 MB. Animated GIFs and videos use all of their own frames
unless you switch to a custom count.

**Speed** sets the pace, from 20 to 200 ms per frame, default 80. Twenty-four
frames at 80 ms is a loop of about two seconds. Animated GIFs and videos can
keep their original timing with "Use source timing".

## 6. Generate and save

Generate renders every frame and encodes the file; the result replaces the
preview, with its size shown. A GIF plays anywhere and loops on its own. A
video is far smaller, 0.12 MB for the same test, but needs a player set to
repeat. [GIF or video](/tools/holopath/articles/gif-vs-video-hologram) compares
the two.

## 7. Play it on the display

For a pyramid on a phone, open the file full screen with the screen at maximum
brightness, turn off auto-brightness and darken the room. The pyramid's small
end goes on the centre of the screen. Each copy's base points at the centre,
so the floating image stands upright inside the pyramid. If you are building
the pyramid yourself, [this guide](/tools/holopath/articles/diy-hologram-pyramid)
sizes it to HoloPath's layout.

<p class="article__cta"><a href="/tools/holopath/" class="btn--holo">Try HoloPath Free →</a></p>
