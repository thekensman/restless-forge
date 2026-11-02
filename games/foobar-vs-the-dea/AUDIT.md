# Audit, build 25

Since build 22 the game rules are ported from the 68k code. This file records how the port
was checked, first against the code and then against the DVD capture.

## What build 25 checked

Build 25 changes no rule. It is the deploy build, so the checks were about the page on a
server:

- The deploy package (`index.html`, `js/`, `data/`, `assets/`) was served from a
  `/games/foobar/` subfolder and played through the browser test there. Every request
  stayed on the page's own origin and none failed. `/games/foobar` without the slash has
  to redirect to `/games/foobar/`, because every path in the page is relative.
- The fonts load from `assets/fonts`. The harness checks that every `url()` in the page's
  `@font-face` rules points at a file that exists and that the licence texts ship with them.
- The share image is 1200 x 630, and the canonical, Open Graph and Twitter URLs all start
  with the same canonical address.

## What build 24 checked

**Lag.** In Chromium the rules and the drawing cost about 0.1 to 0.2 ms a frame, even with
rapid fire and three planes, and the frame rate holds at 60. The cost was in the page around
the canvas: every HUD update rewrote all the readouts, and each write made the browser lay out
and repaint the whole cabinet. With the CPU slowed tenfold to stand in for a weaker machine,
rapid fire with three planes measured:

| Per second of play | Build 23 | Build 24 |
|---|---|---|
| side panel changes | 13.6 | 1.6 |
| layout | 15.7 ms | 1.4 to 2.8 ms |
| paint | 22.9 ms | 1.0 to 1.6 ms |
| frames over 33 ms | 0.83 | 0 |

Build 24 writes a readout only when its value changes, gives each readout a fixed box that
contains its own layout, and moves the boss meter with a transform. What remains each frame
is the canvas itself.

**Bosses on levels 2 to 4.** Re-read end to end: the arena trigger (`fn3_285A`), the boss
setup and task (`fn2_3A4E`, `fn2_3AE8`), the machine setup and task (`fn2_6192`,
`fn2_61E2`), the face loads (`fn2_397C`), the arena picture loads in each level's loader, and
the bomb and missile hit procs. One routine runs every boss; only the faces and HP change by
level. Positions, fire timing, HP, scoring and layering all match build 23, so nothing
changed. The face sets are in `REVERSE_ENGINEERING.md`.

**Briefings.** The original sets the new level and redraws the side panel before its
briefing waits for a key. Build 23 kept the finished level's boss on the panel; build 24
switches it first.

**Level 4 drones under a freeze.** The original gives a drone no face until its fan turns,
and a freeze stops the fan, so drones that arrive during a freeze are invisible until it ends.
That is the original's behaviour, now changed by a house rule.

## What build 23 caught

Build 22 dropped a bomb every frame the key was held. The ship routines do reload a bomb
timer after each drop, from global gm9890, and nothing in the code ever writes gm9890, so
build 22 took it for zero. THINK C copies the program's initialised data into the globals
at launch (`fn1_0044` unpacks DATA 0 and ZERO 0), and that data sets gm9890 to 30.
The global right next to it, the missile cooldown gm9892, starts at 10, which is also the
value the code assigns at the start of every game, so the unpacking checks out against the
code. The string literals it recovers sit at exactly the addresses the high score routines
push, which is a second check.

The disassembler now rebuilds those initial values. A sweep over every global the code reads
and never writes found gm9890 to be the only one with a non-zero start, so no other rule
rests on the same mistake.

## Against the code

`node test/harness.mjs .` runs 269 checks on `js/sim.js`, `js/scores.js` and the page. Every section
names the routines its expectations were read from. The expectations come from the
disassembly rather than from the implementation, so a later change that drifts from the
original fails here. Those sections run with the house rules switched off; a last section
checks the house rules themselves.

| Section | Routines |
|---|---|
| Levels, tile banks, arenas, music | main loop `fn3_39CA`, loaders `fn3_29D0`, `fn3_3270`, `fn3_2EC6`, `fn3_361A` |
| RNG | `fn6_1562`, `fn2_19A8` |
| Player movement, limits, fire rate | `fn2_35CE`, `fn2_365E` |
| Bomb flight, arming, craters | `fn2_3D3A`, `fn2_3E16`, `fn2_3F4C` |
| Waves, submarine deletions, turn table | `fn3_234A`, `fn3_2728`, `fn3_2606`, `fn3_24E4` |
| Air units | `fn2_1BE8`, `fn2_1CC6` |
| Rockets | `fn3_57D6`, `fn2_6436` |
| Collisions and who hits whom | `fn5_435A` and the hit procs |
| Yummy schedule, roll and effects | `fn3_5932` and the six pickup procs |
| Clone | `fn2_6C9A`, `fn2_6D2A` |
| Boss and barricade machines | `fn3_285A`, `fn2_3A4E`, `fn2_3AE8`, `fn2_6192` |
| Death and checkpoints | `fn3_39CA` at `3BDC` and `3F52` |
| High score table | `fn2_5CB8`, `fn2_5D9E`, `fn2_5ECE`, `fn2_5FFE` |
| Fan drones under a freeze | `fn2_4818`, `fn2_4872` |

The level maps and wave tables are the original Levl and BadG resources unchanged. The tools
in `tools/re` regenerate every shipped sprite pixel for pixel and every WAV byte for byte
from the resource fork.

## Against the DVD

The DVD capture runs about five minutes, all of it level 1, and ends on the high score
table. The playfield was cut out at 4 frames a second and each frame matched against the
rendered level 1 terrain (`tools/validate`).

**Alignment.** 1143 of 1202 frames lock onto a scroll position. The other 59 are the title,
the briefing and the moments around each death.

**Deaths and checkpoints.** The footage has six restarts. Four jump back to the start of the
map, from scroll 344, 823, 868 and 1010. Two jump back to 1280, from 1307 and 2327. That is
the checkpoint rule exactly, including its odd edge: the checkpoint is read after the
50-frame aftermath, so the death that shows 1307 happened just before row 1280 and still
restarted there.

**Submarines.** A template match finds 263 periscopes in 224 frames. 220 of them are within
6 px of where `js/sim.js` puts a submarine at the same scroll value, median error 2.2 px.
The prediction comes from the BadG spawn rows, the deletion list and the turn table, with no
tuning. The 43 that miss are a single submarine that sits still at x 82 from scroll 1576 to
1759 while the prediction walks it down its canal. In the code a submarine only stops under
the freeze yummy, which lasts 600 frames, and a yummy appeared at scroll 1480, so this is
almost certainly a freeze.

**Yummies.** The first yummy appears at scroll 200 and is on screen at y 114 at scroll 282,
which is where the schedule puts it.

**End of game.** After the last death the capture goes straight to the name dialog ("New
high score! Please enter your name!", POW! icon, "Your name here" selected) and then the
table with 410 in red at the top and nine "Nobody" rows. Earlier builds had no high scores at
all. Build 22 ports them from the code. The table sits where the original draws it. The
dialog is centred on the playfield, where on the original's 640 x 480 screen it hung off the
playfield's left edge.

## Speed

The DVD scrolls at 19.8 px/s. The code advances one frame per Time Manager tick of 35 ms on
Easy, which is 28.6 px/s, and Ken's SheepShaver captures run at 27 to 30 px/s. The machine
that made the DVD most likely rounded 35 ms up to three 60 Hz ticks, which gives 20 px/s.
The rebuild runs at the code's speed. Set `timing.frameMs` to 50 for Easy in
`data/config.json` to play at the DVD's pace.

## Not yet seen on video

Bosses and arenas for levels 2 to 4, the barricade machines, and the clone, protection,
freeze and smart bomb pickups are taken from the code alone. `CAPTURE_WISHLIST.md` lists
what footage would confirm them.

## Other tests

    node test/soak.mjs .                        # 48 games of random play, invariants every frame
    node test/boot_e2e.mjs .                    # boots index.html in a DOM shim, plays 1500 frames
    python3 test/browser_e2e.py URL shots/      # Chromium: real keys, boss, level 2, three planes, high scores

The soak test plays half its games under the original rules and half under the house rules,
hands out clone, rapid fire and protection yummies, and skips some levels so formations,
deaths, promotions, level changes and endings all happen. It checks every frame that the
clone count matches the formation, every ship has its own sight, the wing stays on screen
and the fire rate matches the rapid fire state. Build 24 runs about 85,000 frames with no
problems.
