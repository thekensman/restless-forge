---
date: 2026-03-15
updated: 2026-10-13
author: Kenneth Cross
---
# How Hologram Pyramids Work: The Optics Behind a Phone Projector

A clear plastic pyramid stood on a phone screen makes a glowing figure appear
to float inside it, visible from all four sides. It is not a hologram in the
physicist's sense, because nothing records or rebuilds a light wave. It is a
reflection, the same trick as the Victorian stage illusion
[Pepper's Ghost](/tools/holopath/articles/peppers-ghost-illusion), run four
times at once. Working through the optics explains every rule for making
content for one.

## A window that is also a faint mirror

Every clear surface reflects a little of the light that reaches it and lets the
rest through. How much depends on the material and the angle. At the 45° of a
pyramid face, acrylic reflects about 4.9% of the light at its front surface,
and PET film, the material of overhead transparencies, about 7%. The rest
passes straight through.

That is why the effect needs the dark. The reflected image is roughly a
twentieth as bright as the screen, and the face itself is nearly invisible
because almost all light goes through it. Your eye picks out the faint
reflection only when nothing brighter competes with it.

A sheet has two surfaces, and both reflect. That is the faint second image,
slightly offset, that thick plastic produces. A thinner sheet brings the two
images closer together until they merge.

## Why 45°, and where the image appears

Light leaves the screen travelling straight up. A face tilted at 45° turns it
through a right angle, so it travels horizontally, toward a viewer whose eyes
are level with the pyramid.

Treat the face as a mirror and the floating image's position follows. A pixel
on the screen appears above the centre of the pyramid, at a height that grows
one for one with its distance from the centre: a pixel 1 cm further out floats
1 cm higher. The flat picture on the screen is, in effect, stood on its end in
the middle of the pyramid.

Two layout rules come straight from this:

- **The top of each copy points at the edge of the screen.** The further from
  the centre, the higher it floats, so the edge end of the picture becomes the
  top of the hologram. HoloPath's pyramid layouts draw every copy this way.
- **Each copy must be mirrored.** A reflection swaps left and right, which is
  why teleprompters display their text backwards. HoloPath mirrors every copy
  in its pyramid layouts, so text and logos read correctly in the plastic.

## Why four copies

Each face reflects only the part of the screen beneath it, toward the viewer on
its side. Four faces need four copies, one under each, turned so its top points
outward. Walk around the pyramid and each face hands over to the next; from a
corner you see parts of two copies at once.

The copies are identical, so this is one flat image seen from four directions,
not an object with four sides. The back of your subject never appears.

## Why the background must be pure black

Everything lit on the screen reflects, not only the subject. A dark grey
background reflects as a dim grey sheet in every face, and because the
subject's reflection is so faint, even a dim sheet washes it out. HoloPath
colours each pixel by its brightness, so anything short of true black in your
source becomes coloured light on the screen.

The screen type matters as well. An OLED screen switches black pixels off
entirely. An LCD shines its backlight through them, so even pure black leaks a
little light, which shows as a faint glow behind the image. On an LCD phone,
the darker the room the better.

## Why one pair of faces can look dimmer

Screens send out polarised light: LCDs always, and many OLEDs through the
polarising layer that keeps their blacks deep. A face reflects polarised light
very unevenly. For acrylic at 45°, light polarised along the face's surface
reflects about 9%, and light polarised across it under 1%.

So on some phones two opposite faces look far dimmer than the other two, and
turning the phone through 90° swaps the dim pair. Phones whose light is
polarised diagonally, or circularly, light all four faces evenly, which is why
many never show the effect.

## How big the image can be

With 45° faces, the floating image can be up to half the difference between the
pyramid's base and its top. A pyramid with a 60 mm base and a 10 mm top shows an
image up to 25 mm tall. The base can be no wider than the screen's short side,
which is why phone pyramids make small holograms and tablet pyramids larger
ones. The [DIY guide](/tools/holopath/articles/diy-hologram-pyramid) turns this
into cutting dimensions sized to HoloPath's layout.

## Viewing

Look straight in at the height of the pyramid's middle, from a little way
back, in a dark room with the screen at full brightness. Looking down from
above shows you the screen through the plastic instead of the reflection.

<p class="article__cta"><a href="/tools/holopath/" class="btn--holo">Try HoloPath Free →</a></p>
