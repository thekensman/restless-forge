---
date: 2026-03-15
updated: 2026-10-13
author: Kenneth Cross
---
# Hologram GIFs vs Video: Which Format Is Right for You?

HoloPath can save the same hologram two ways: as an animated GIF, which its own
encoder writes, or as a video, which your browser records. They are not two
wrappers around the same file. On a test subject at default settings (Classic
preset, four-sided pyramid layout, 24 frames), the GIF came out at 8.3 MB and
the video at 0.12 MB, roughly seventy times smaller. Where that difference
comes from decides which one your display should get.

## What the GIF encoder does

- **One palette for the whole animation.** GIF allows 256 colours. HoloPath
  builds a single palette by sampling every frame in turn, so all frames share
  the same 256 colours. A single-hue hologram suits this well; the
  [banding article](/tools/holopath/articles/why-hologram-gifs-band) covers the
  cases that do not.
- **No dithering.** Each pixel is mapped to the nearest palette colour.
  Gradients that run out of shades show steps rather than a pattern of dots.
- **Every frame stored whole.** The encoder compresses each frame on its own
  and never stores just the part that changed, so file size grows in step with
  frame count: 24 frames made 8.3 MB, and 48 frames made 16.7 MB.
- **Timing in hundredths of a second.** GIF stores delays in units of 10 ms,
  with a minimum of 20 ms in HoloPath. The default 80 ms per frame is stored as
  8, which gives a loop of just under two seconds at 24 frames.
- **It loops by itself.** The file is marked to repeat forever, so any browser,
  gallery app or messaging app plays it on a loop without being told.

Noise is the setting that hurts a GIF most. Random grain cannot be compressed,
and dropping Noise from 25% to 0 took the same test from 8.3 MB to 3.7 MB.

## What the video export does

The video option hands the finished frames to your browser's built-in
recorder. HoloPath asks for MP4 with H.264 first and falls back to WebM, so
Chrome, Edge and Safari normally give you an MP4, and Firefox gives you WebM.
The recorder runs at 2 megabits per second and keeps far more than 256 colours.
Video codecs also store mostly the changes between frames, and a hologram is
mostly black that never changes, which is why the file is so small.

Two things behave differently from a GIF:

- **It records in real time.** The animation plays once into the recorder, so
  a two-second loop takes about two seconds to encode. Keep the tab in front
  while it runs: browsers slow down background tabs, which can stretch the
  timing.
- **It does not loop on its own.** A video file plays once unless the player is
  set to repeat. On a phone under a pyramid, that means turning on repeat in
  your player before you walk away.

## Which to use where

| Where it will play | Better choice | Why |
|---|---|---|
| Phone under a pyramid | Either; video if your player can repeat | Video is smaller and keeps smooth gradients; a GIF loops with no setup |
| LED hologram fan | Whatever the fan's app accepts | Fans convert files in their own software; check its manual |
| Tablet in a Pepper's Ghost box | Video | Smooth colour on a large screen, with the player set to repeat |
| Messaging apps | Video | Size limits; many apps convert GIFs to video anyway |
| Email | GIF | Most email clients play GIFs inline and do not play video |
| A web page | Either | A GIF needs no player; a looping, muted video is far lighter |

The format menu names the video format your browser will produce before you
generate anything. If your browser has no recorder HoloPath can use, the video
option is disabled and says so. GIF always works.

<p class="article__cta"><a href="/tools/holopath/" class="btn--holo">Try HoloPath Free →</a></p>
