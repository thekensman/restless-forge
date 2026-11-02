# Footage that would still help

Since build 22 the rules come from the 68k code, so most of the old wishlist is answered: tile
banks per level, the arenas, yummy rules, death and checkpoints, and the high score table
all come straight from the disassembly, and the level 1 parts match the DVD.

What is left is the stuff that only the code has seen. Footage would confirm the port reads
it right. Record from SheepShaver at full frame rate. The `qqq` and `eee` cheats exist only in
the rebuild, so in the original the way to reach a late level twice is File > Save once you
get there and Open Game afterwards.

## 1. A boss fight on level 2, 3 or 4

The code says each boss is a dome with 6, 7 or 9 HP that sits still and fires two aimed orbs
every 30 frames, and that 1 to 3 "DEA" barricade machines with 10 HP each sit just below it,
firing pairs of flames. On level 2 the single machine covers the lower half of the dome.
Wanted: the dome sprites changing as it takes damage, the machines firing, and how many hits
each one takes. Let go of every key when the previous boss dies, or the original skips the
next briefing the instant it sees a key held down.

## 2. Medium and Hard on SheepShaver

Easy should scroll at about 28.6 px/s (one row per 35 ms tick). Medium should be about
33 px/s and Hard 40 px/s. Thirty seconds of each would confirm the timer is honoured, which
pins the DVD's 20 px/s on the machine that recorded it.

## 3. The clone, freeze, smart bomb and protection pickups

Clone: a second ship 33 px to the left that fires and bombs with you. Freeze: everything
stops for 600 frames. Smart bomb: every enemy and shot in play blows up on the next frame,
including the ones still above the screen. Protection: the green outline, flickering for the
last 100 frames, then a beep.

## 4. The ending

Everything between the level 4 boss dying and the Foobar and Ned picture (PICT 166), and
whether the high score dialog follows it the way it follows a game over.

## Small things, if convenient

- Holding Option in the original. Build 23 says one bomb every 30 frames, about one a second
  on Easy, with a crater line spaced to match. Build 22 had a bomb every frame. A few seconds
  of holding it settles that.
- What the Time Zone menu (Current, New York, Moscow, Ulan Bator) changes. The code that
  handles it has not been read yet.
- Whether the Volume menu (0 to 7) changes the music and the effects together.
