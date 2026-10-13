---
date: 2026-03-15
updated: 2026-10-13
author: Kenneth Cross
---
# Pepper's Ghost: The Victorian Illusion Behind Modern Holograms

In December 1862, audiences at the Royal Polytechnic Institution in London
watched a translucent ghost walk across the stage beside a living actor, in a
staging of Charles Dickens's *The Haunted Man*. The method had been devised by
the engineer Henry Dircks, whose version needed a purpose-built theatre. John
Henry Pepper, a lecturer at the Polytechnic, found a way to fit it into an
ordinary stage, and the effect has carried his name ever since.

The same idea later filled the ballroom of Disneyland's Haunted Mansion in
1969, put a life-size Tupac Shakur on the Coachella stage in 2012, and sits
inside every plastic hologram pyramid on a phone. It is one of the few stage
illusions you can build on a kitchen table in an evening.

## How it works

A sheet of clear glass or plastic reflects a few percent of the light that
reaches it and lets the rest through. Put a brightly lit object to one side of
the sheet, angle the sheet at 45°, and a faint reflection of the object appears
behind the glass, superimposed on whatever is really there. The reflection
seems to sit as far behind the glass as the object is in front of it.

The illusion holds when two conditions are met. The object has to be much
brighter than the scene behind the glass, because the reflection carries only
a few percent of its light. And the object itself must be hidden from the
audience, so the reflection seems to have no source. Pepper's actor stood
brightly lit in a pit below the stage, out of the audience's sight; a modern
version swaps the actor for a screen.

## Building a tabletop version

The simplest version uses a tablet lying face up and a sheet of clear acrylic:

1. Lay the tablet flat, screen up.
2. Stand the acrylic over it at 45°, with its lower edge along the far edge of
   the screen and its upper edge leaning toward you.
3. Put something black behind and around the glass, such as a box lined with
   black card, so nothing bright shows through it.
4. Darken the room, turn the screen to full brightness, and look straight
   through the glass at the height of its middle.

The sheet needs to be at least as wide as the subject and about one and a half
times as long as the subject is tall, since it crosses the screen on the
diagonal.

## Why HoloPath's layout looks the way it does

HoloPath's Pepper's Ghost layout follows from the geometry. A point on the
screen appears in the glass at a height equal to its distance from the glass's
lower edge, so whatever is near the far edge of the screen appears low, and
whatever is near you appears high. The layout therefore:

- uses a wide 16:9 frame, 800 by 450 pixels at the default resolution setting,
  to suit a tablet or monitor turned sideways;
- scales the subject to 55% of the frame's height, about 248 pixels, and sets
  it near the bottom edge with a small margin;
- mirrors it, because a single reflection swaps left and right.

Place the tablet so the bottom of the picture lies along the far edge, under
the glass's lower edge. From where you sit the picture on the screen looks
upside down; that is correct. In the glass, the subject then stands on the
floor of the box, upright and the right way round. On a tablet about 22 cm
wide, it is about 7 cm tall.

## Getting a clean picture

Most of a Pepper's Ghost frame is black, which used to cost GIFs dearly: on a
test subject, the encoder's 256-colour palette held only 36 distinct colours,
nearly all of them near-black, until a palette fix in October 2026 raised that
to 196. That fix, and the
remaining causes of banding, are covered in
[why hologram GIFs band](/tools/holopath/articles/why-hologram-gifs-band). On a
tablet, a [video export](/tools/holopath/articles/gif-vs-video-hologram) with
the player set to repeat avoids the question entirely.

A faint double outline means the reflection is coming from both surfaces of a
thick sheet; thinner acrylic brings the two images together. If the subject
looks tilted, the sheet is not at 45°.

<p class="article__cta"><a href="/tools/holopath/" class="btn--holo">Try HoloPath Free →</a></p>
