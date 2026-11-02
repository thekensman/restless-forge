# Foobar vs. the DEA: what the 68k code actually does

Reverse engineered from the CODE resources of the original application (resource fork
md5 `5eddfa81315e9373bc81caf797551cb6`). This file describes the original. Build 23 departs
from it in three places on purpose (rapid fire, Foo++ and the respawn shield); README.md lists
those house rules and the config switches that turn them off. Every number below comes from the code unless it
says otherwise. Addresses are `segment_offset` as printed by `tools/re/show.py`, so any
claim can be checked by running `python3 -I tools/re/show.py f fn3_39CA` and reading along.

## How it was done

The game is THINK C with Pascal-convention callbacks, built on Ingemar Ragnemalm's Sprite
Animation Toolkit (SAT). I skipped REA and the Ghidra GUI. The Ghidra C++ decompiler was
built from source in the workspace, but the Pascal callee-pops convention made its output
noisy, and a purpose-built annotated disassembler turned out to be faster to read:

- `tools/re/mac68k.py` lays the CODE segments out the way the Segment Loader would, with the
  A5 world and a fully loaded jump table, so every `jsr d16(a5)` resolves to a real function.
  It finds 390 functions by recursive descent with zero undecodable words.
- A-line traps are named from the multiversal Toolbox definitions (`tools/re/traps.py`),
  SANE floating point opcodes are decoded, and `GetCIcon` load sites are traced so that
  every A5 global holding a sprite face is labelled with its cicn id (`tools/re/faces.py`).
- `tools/re/show.py` prints any function with all of that annotation, finds callers, finds
  every place a procedure's address is taken, and finds every reader and writer of a global.
- The globals start out holding whatever THINK C copies in from DATA 0 and ZERO 0 at launch
  (`fn1_0044`), and the disassembler rebuilds that image. Build 22's tools lacked it and read
  the bomb cooldown as zero. A sweep of every global the code reads and never writes turned
  up no other non-zero starting value.

## Random numbers

The game's `Random(lo, n)` (`fn2_19A8`) is `trunc(lo + n * rand() / 32767)` over the ANSI C
`rand()` LCG (`fn6_1562`: seed times 1103515245 plus 12345, top 15 bits). The second argument
is a span, not an upper bound, which is why some ranges below look lopsided. A "1 in N"
chance is `Random(1, N) == 1`.

## The coordinate system and the frame

- SAT's offscreen is a 640-row ring buffer. The visible 320 x 340 playfield is rows 301 to
  640 at level start and the view moves up one row per frame. Screen x is `h - 1`.
- Sprites are positioned by their top-left corner. Each has a hot rect relative to that.
- **One frame per Time Manager tick.** The tick period depends on difficulty
  (`fn3_575E`, `fn3_56E0`..`fn3_5734`): Easy 35 ms, Medium 30 ms, Hard 25 ms. Easy is the
  default when there is no preferences file (`fn5_5D7A`, resource `Diff`).
- Ken's SheepShaver captures scroll at 27 to 30 px/s, which is the 35 ms timer. The DVD
  capture scrolls at 19.8 px/s, consistent with an emulator that rounded 35 ms up to three
  60 Hz ticks. Build 21 had been tuned to the DVD.
- The level scrolls exactly 1 px per frame (`fn3_0668`) until the scroll counter reaches 6400.

## Tile banks

The main loop has one section per level, and each section loads that level's 22 tile faces,
starts its music and calls its own wave spawner:

| Level | Loader | Tiles | Music | Waves |
|---|---|---|---|---|
| 1 | `fn3_29D0` | cicn 143 to 164, desert canals | 135 | `fn3_234A` |
| 2 | `fn3_3270` | 1000 to 1013 plus 207 to 214, red industrial | 133 | `fn3_2728` |
| 3 | `fn3_2EC6` | 700 to 721, blue riveted plate | 136 | `fn3_2606` |
| 4 | `fn3_361A` | 900 to 916 plus 160 to 164, gold grid | 138 | `fn3_24E4` |

Build 21 had the level 3 and 4 banks swapped and called the blue plate "ocean".

## Per-frame order (main loop `fn3_39CA`, level 1 section at `3D54`)

1. Music restart if its timer expired (see Sounds).
2. Yummy scheduler `fn3_5932`.
3. Wave spawner (`fn3_234A` L1, `fn3_2728` L2, `fn3_2606` L3, `fn3_24E4` L4).
4. Random rocket spawner (`fn3_5882` for level 1 before scroll 3200, `fn3_57D6` otherwise).
5. `RunSAT`: every sprite's task in list order, then a sort by layer, then collisions,
   then the scroll hook, then disposal of sprites whose task was cleared.
6. Boss arena triggers `fn3_285A`.
7. Protection, freeze and smart bomb countdowns.
8. Escape pauses. The loop runs until scroll 6400, death, or quit.

The boss phase is a different loop (`3E76`) that only spawns air units and runs SAT. The
yummy, wave and rocket spawners do not run during it, and neither do the protection and
freeze countdowns, so a shield picked up just before the arena lasts the whole fight.

## Drawing order

At launch the game configures SAT (`fn3_09F8` calls `fn5_31F8`) to sort sprites by layer.
Each frame `fn5_48E0` makes one bubble pass that moves a sprite ahead of its neighbour when
its layer is lower, and `RunSAT` draws from the head of the list, so higher layers end up on
top. A sprite whose face is empty is not drawn at all.

| Layer | Sprites |
|---|---|
| 1, 2 | ground units, boss |
| 6 | missiles, rockets, yummies |
| 8 | debris |
| 10 | barricade machines |
| 11 | enemy shots and flames |
| 12, 13 | hit text and craters, air units |
| 15 | bombs and bomb sights |
| 20 | the ships |

## Collisions (SAT, `fn5_435A`)

Every sprite with kind > 0 is tested against every sprite with kind < 0 using hot rects.
On overlap the friend's hit proc runs as `hit(friend, enemy)`, then the enemy's as
`hit(enemy, friend)`. Sprites killed earlier in the same frame still collide until disposal.
Ground units, the boss, the barricade machines and the player ship have no hit proc of their
own, so every outcome is decided by whatever hits them.

| Friend side (kind > 0) | Enemy side (kind < 0) |
|---|---|
| ship (code 666), missile, bomb (code 100) | air unit (20), ground unit (30), boss (40), machine (41), yummy (297), rocket (303), orb and flame shots (0) |

## Player

| Item | Value | Where |
|---|---|---|
| Lives at start | 5 | `fn3_39CA 3A0A` |
| Ship faces | 170 straight, 172 when left is held, 171 when right is held | `fn2_3576`, `fn2_365E` |
| Shielded faces | 246 straight, 248 left, 247 right | same |
| Hot rect | (3,3)-(33,33) on the 36 x 36 face | `fn2_35CE` |
| Speed | 4 px per frame on each axis, diagonals not normalised | `fn2_365E` |
| Screen limits | x 0 to 291 (32 to 291 while a clone exists), y 0 to 314 | same |
| Start | x 119, y 349 (below the playfield), flies up 6 px per frame until it reaches about y 181 | `fn3_29D0 2CC2`, `fn2_365E 383A` |
| Fire | Command key. Every 10 frames, 5 with rapid fire | `fn2_365E 38D4` |
| Missile | spawns at (x+9, y), moves up 16 px per frame, hot rect (4,0)-(12,16) | `fn2_2778`, `fn2_27BA` |
| Bomb | Option key. One bomb every 30 frames per ship: the ship's bomb timer is loaded from gm9890 at creation and after each drop, and gm9890 starts at 30 and never changes | `fn2_35CE 3650`, `fn2_365E 3916` |
| Bomb flight | spawns at (x+13, y) and flies up 5 px per frame to the ground point that was 120 px above the ship when it was dropped | `fn2_3D3A`, `fn2_3E16` |
| Bomb damage | only on the frame it arrives (within 4 px of the target row), using its 8 x 16 rect | `fn2_3F4C` |
| Bomb sight | face 182 at (x+13, y-120), always shown | `fn2_3C00`, `fn2_3C88` |
| Pause | Escape | `fn3_39CA 3E1E` |

A bomb sight also flashes at the impact point for 50 ticks each time a bomb is dropped
(`fn2_3C22`). Holding the bomb key drops a bomb every 30 frames, which is longer than a bomb
takes to land, so only one is ever in the air per ship.

## Waves (BadG)

Each level has 150 entries of `type, x, y, param`. The spawner fires an entry on the exact
frame the scroll counter equals its `y`, one entry per frame, in order. Every level's list is
strictly increasing, so nothing ever stalls. Filler entries with `y = 1` sit at the end.

- **Type 1 is the level's ground unit.** It spawns at x = `x`, 50 px above the top of the
  screen on level 1 and 40 px above on the other levels. `param` is its initial direction.
- **Type 2 is the level's air unit.** It spawns 100 px above the top at x = `x` plus a random
  offset from -50 to +49.
- A running counter numbers the ground units. Level 1 deletes submarines 3 to 7, 17, 19, 20
  and 25 to 27 the moment they spawn, and also deletes number 1 on Easy. Level 2 deletes
  its second walker.

| Level | Ground unit (type 1) | Air unit (type 2) |
|---|---|---|
| 1 | periscope submarine (600 to 605, 204) | red helicopter, rotor frames 133 to 138 |
| 2 | walking TV, frames 192 to 195, flames 222 to 224 | helmet face 235 |
| 3 | jack-in-the-box 183 to 188 | horned red ball 203 |
| 4 | fan drone 10000 to 10003 | blue jet 202 |

### Air units (`fn2_1BE8`, `fn2_1CC6`, hit `fn2_2142`)

- Fall 1 px per frame relative to the map (2 px per frame on screen). During the boss
  fight they fall 4 px per frame.
- Move sideways by the level number in px per frame (1 on level 1, 4 on level 4), clamped to
  x -1 to 289. The direction flips with a per-frame chance of 1 in 30, 25, 20 and 15 for
  levels 1 to 4.
- Fire every `(4 - difficulty) * 15 - 5` frames: 40 on Easy, 25 on Medium, 10 on Hard.
  Levels 1 and 2 drop a purple orb straight down at 6 px per frame. Levels 3 and 4 aim the
  orb at the player at 6 px per frame.
- Hot rects: L1 (0,0)-(32,32), L2 (2,2)-(38,45), L3 (3,3)-(37,28), L4 (5,3)-(51,46).
- Ramming the ship kills both unless the ship is shielded.

### Level 1 submarines (`fn2_2FC2`, `fn2_3042`)

Each moves 1 px per frame down the map and 1 px per frame sideways (40 and 20 px/s on screen
at 20 fps, matching the old measurements), so they follow the 45 degree canals. They turn
at fixed map positions from a table keyed by their number. The periscope face changes every
50 frames and shows 204 on each turn. They shoot a straight orb on the same timer as air
units. Bombs and the smart bomb kill them. Missiles pass over them.

Turn table (submarine number: map offsets where it turns):
1, 2, 4: 160 · 5: 290 · 6, 7: 920 · 8, 9: 1090 · 10: 1320 · 11: 1470, 1410 · 13: 2435 ·
14: 2560, 2530 · 16, 17: 3340 · 18, 19: 3940 · 20: 4220 · 22: 4280 · 24: 4600 ·
25: 4670, 4600 · 26, 27: 5520, 5490, 5460, 5430, 5400 · 28, 29: 5600, 5550, 5520, 5490, 5460 ·
30: 5710.

### Other ground units

- **Walking TV (L2, `fn2_4652`)** walks down the map for 150 frames, then stops and its
  antenna catches fire. Aimed shots every 40 frames on Easy, every 5 frames once it has
  walked 140 frames. Hot rect (15,16)-(51,40).
- **Jack-in-the-box (L3, `fn2_43CE`)** sits still on an 80-frame cycle: opens over frames
  1 to 5, stays open until 30, closes by 33. Fires once as it opens (aimed on Hard).
  A bomb only kills it while it is open, and it then stays on the map as the dead face 188.
  Bombing it closed still scores 50. Hot rect is the right half, (32,0)-(64,32).
- **Fan drone (L4, `fn2_4872`)** sits still with a 4-frame fan animation and fires aimed
  shots every 40 frames on Easy. Hot rect (0,0)-(40,32). Its setup (`fn2_4818`) gives it no
  face: the task picks 10000 to 10003 from the fan frame, and the fan frame doesn't advance
  while frozen. SAT skips any sprite without a face (`fn5_49E0` at `4B6A`), so in the
  original a drone that spawns during a freeze is invisible until the freeze ends. Build 24
  changes that as a house rule.

## Rockets (`fn3_57D6`, `fn2_6332`, `fn2_6436`, hit `fn2_65CA`)

Not part of BadG. Every frame there is a 1 in 60 chance on Easy (50 Medium, 40 Hard) of a
rocket, halved on level 1 until scroll 3200. Half come from the left at x -61, half from the
right at x 351, at a random height from y -10 to 300. A spawn is skipped when
`(scroll - r + 448) mod 640 < 128`, an artifact of the ring buffer. They fly 4 px per frame,
alternate two faces every two frames, and do not spawn while frozen. Faces by level:
red 15000/15008 and 15001/15009 on level 1, then 15004/15012, 15006/15014, 15002/15010 for
right-moving rockets on levels 2 to 4 (the odd ids are the left-moving versions).
Hot rect (0,10)-(32,22).

## Enemy shots

| Shot | Face | Motion | Source |
|---|---|---|---|
| straight orb | 401 | 6 px per frame down | `fn2_10C8` |
| aimed orb | 401 | 6 px per frame toward the ship, each axis truncated | `fn2_001E`, `fn2_041C`, `fn2_081A` |
| machine flame | 215 | 10 px per frame down | `fn2_0C10`, `fn2_0D60` |

All use the hit proc `fn2_0DCE`: they kill an unshielded ship, die on contact with anything
friendly except bombs, and leave an explosion. A missile that destroys a shot keeps flying.

## Yummies (`fn3_5932`, `fn2_4BA6` and the six hit procs)

Yummies are scheduled, not dropped. One appears whenever `(scroll - 200) mod 1280 == 0`,
which is scroll 200, 1480, 2760, 4040 and 5320, at a random x from 49 to 299, 50 px above
the top of the screen. It drifts down 2 px per frame on screen. The kind is picked by
rolling 1 to 9 until a roll is allowed:

| Roll | Yummy | Allowed when |
|---|---|---|
| 1, 8, 9 | Extra man (6667) | that roll's slot has not been used this life |
| 2, 3 | Rapid fire (249) | rapid fire is not already active |
| 4 | Clone FOO++ (253) | not used this life and no clone is active |
| 5 | Protection (250) | not used this life |
| 6 | Freeze (251) | not used this life |
| 7 | Smart bomb 666 (252) | not used this life |

The once-only flags reset at the start of each level and after each death.

| Yummy | Effect |
|---|---|
| Extra man | +1 life |
| Rapid fire | fire every 5 frames instead of 10 for **the rest of the game**, across deaths |
| Clone | a second ship 33 px to the left with the same controls, its own sight, fire and bombs. If either ship is hit only that ship is lost and no life is taken. A surviving clone carries over into the next level. Only one clone can exist, because the clone yummy never appears while one is active |
| Protection | 640 frames of invulnerability with the green-outlined faces, system beep on pickup. In the last 100 frames it switches off for 9 of every 20 frames, then beeps when it ends |
| Freeze | 600 frames. Enemies and shots stop, rockets stop spawning, system beep on pickup |
| Smart bomb | on the next frame every enemy and enemy shot in play destroys itself and scores, including ones still above the screen. The boss and machines are immune |

Any ship (including the clone) collects a yummy by touching it. A missile destroys it.

## Boss and arena (`fn3_285A`, `fn2_3A4E`, `fn2_3AE8`, `fn2_6192`, `fn2_61E2`)

The arena is four 320 x 85 PICTs that scroll in above the end of the tile map, so the whole
screen is arena when the scroll stops at 6400. Each arena is drawn in the colours of the next
level's floor: red, then blue, then gold, then grey. The boss and machines spawn at scroll 6200,
already in place in the arena, and scroll into view with it.

| Level | Arena PICTs (top to bottom) | Boss portrait | Boss faces (healthy, hurt, critical) | HP | Machines |
|---|---|---|---|---|---|
| 1 | 142, 143, 144, 145 (red) | 141 Marlboro Man | 173, 216, 217 | 5 | none |
| 2 | 131, 132, 133, 134 (blue) | 151 Telehead | 189, 218, 219 | 6 | x 127 |
| 3 | 147, 148, 149, 150 (gold) | 146 Czar Bot | 191, 220, 221 | 7 | x 95, 159 |
| 4 | 159, 160, 162, 163 (grey) | 161 NOSEY | 254, 255, 256 | 9 | x 63, 127, 191 |

- One routine runs the boss on every level. `fn2_3A4E` only picks the face set and the HP
  by level, and `fn2_3AE8` picks the hurt and critical faces the same way. Every face is
  64 x 64 and loaded in one place (`fn2_397C`), so there is no per-level behaviour to miss.
- The boss sits at (127, 1). `fn3_285A` creates it at ring position (128, 302), which is
  screen y 1 once the scroll stops. Only the top 20 px of the dome is hittable: hot rect
  (0,0)-(64,20). It never moves.
- Face: healthy at HP 4 and up, hurt at 2 or 3, critical below 2.
- Every 30 frames it fires two aimed orbs from (147, 56) and (167, 56). It keeps firing
  during a freeze, but its orbs hang in the air until the freeze ends.
- Missile 1 damage, armed bomb 1 damage. The smart bomb does nothing to it.
- Each **machine** (face 205, the "DEA" box, 64 x 51) sits at y 29, directly below the boss,
  with 10 HP and a 64 x 64 hot rect. It is layer 10 and the boss layer 2, so on level 2 the
  middle machine covers the lower half of the dome, which is the "boss hidden behind a
  barricade" from the instructions screen. Missiles stop on it, bombs fly over it. It fires
  two flames every 30 frames from its red lights, holding fire while frozen. Level 1 has no
  barricade.
- During the fight an air unit spawns with a 1 in 50 chance per frame at x 49 to 319,
  21 px above the screen. No rockets, waves or yummies spawn.
- Killing the boss ends the level: 100 more frames run, then the ship flies off the top.

## Between levels (`fn3_39CA` at `3FE2` for level 2, and the same for 3 and 4)

- The level number is set first, then the briefing PICT (173 to 176) is drawn, then
  `fn3_4FFE` redraws the whole window around it, including the boss portrait for the new
  level (PICT 141, 151, 146 or 161) and the level number. So the side panel already shows
  the boss of the level being briefed.
- The briefing waits while running SAT, and ends the moment any key or the mouse button is
  down (`fn2_60EC` checks the whole keymap). Holding fire through the boss kill therefore
  skips the next briefing almost instantly, which is why level 2's briefing seemed to be
  missing in a capture. The rebuild waits for a fresh key press instead.

## Death, lives and checkpoints

- A hit sets the death flag. The frame finishes, a life is taken straight away (`3F58`), and
  50 more frames run with the screen still scrolling.
- The level restarts from the last checkpoint passed, read from the scroll counter after
  those 50 frames: 0, 1280, 3200 or 5120 (tile rows 0, 40, 100 and 160). Every sprite is
  cleared, the background is redrawn (craters vanish), and the ship flies in from below.
- There is no invulnerability after respawning. The fly-in is the grace period.
- Game over at 0 lives. After level 4 the ending picture (PICT 166) is shown.

## High scores (`fn2_5CB8`, `fn2_5D9E`, `fn2_5ECE`, `fn2_5FFE`)

The DVD capture ends on this. Earlier rebuilds left it out.

- The table lives in the "Foobar1 Preferences" file as resource `Bäst` 0, "High scores"
  (the type is Swedish, like SAT). It holds eleven long scores and eleven 16-byte Pascal
  names. Slot 0 is never used; slots 1 to 10 are the table. A new file is filled with
  "Nobody" and 0.
- When a game ends by game over or by the ending (`fn7_09DA` at `0C7E`, and the same code in
  `fn7_1004` and `fn8_0000`), the score is checked. A game abandoned from the menus is not.
  The score has to beat 10th place outright. The Mac beeps and opens DLOG 129: "New high
  score! Please enter your name!" with "Your name here" selected and the POW! icon (cicn 181).
  Cancel or an empty name stores nothing. The name is cut to 15 characters.
- The new entry slides up past every lower score and stops under an equal one. The old 10th
  place drops off.
- `fn2_5ECE` then opens a 300 x 190 box in the middle of the screen: rank at x 10, name at
  x 50, score at x 200, one row every 15 px, the new row in red, and "Click mouse or hit any
  key to continue..." at the bottom. It also opens after Cancel. A score that does not make
  the table shows nothing.
- The High Scores menu had Show High Scores (the same box, no check) and Erase High Scores
  (every slot back to "Nobody" and 0, no confirmation).
- The score itself is a signed 16-bit word, so the original would wrap past 32,767 and the
  table check uses its absolute value. The rebuild keeps an ordinary number.

## Scoring (multiplied by the difficulty, 1 to 3)

| Event | Points on Easy |
|---|---|
| Air unit destroyed (missile, ramming, smart bomb) | 10 |
| Rocket destroyed (missile, shielded ramming, smart bomb) | 5 |
| Ground unit bombed or smart-bombed | 50 |
| Machine destroyed by a bomb | 100 (nothing if destroyed by missiles) |
| Boss destroyed | 200 |

## Sounds and music

The seven "undecodable" snd resources were format 2 (HyperCard style) 8-bit PCM at
22254.5 Hz. Only `toff` (128) is MACE compressed.

| Use | snd | Name | Channel |
|---|---|---|---|
| Player missile | 130 | Foo Shot | 1 |
| Enemy shot | 129 | (unnamed) | 1 |
| Explosion, bomb impact | 132 | atomic bomb | 3 |
| Bomb drop | 137 | buzz bomb | 4 |
| Title and intro loop | 134 | consolidated hip o crits | 2, restarted every 280 ticks |
| Level 1 music | 135 | bikini 1 | 2, restarted every 510 ticks |
| Level 2 music | 133 | Sonic Yoof | 2, every 355 ticks |
| Level 3 music | 136 | Bikini Kill 2 | 2, every 340 ticks |
| Level 4 music | 138 | Screwicidal | 2, every 300 ticks |

Protection and freeze pickups play the system beep. snd 131, 999, 1000, 1001, 1002 and
14818 are never loaded by the code. The captured intro music in v21 correlates at 0.97
with snd 134, so it is that loop.

## Corrections to build 23

| v23 | Original |
|---|---|
| The side panel kept the finished level's boss and number during the next briefing | the panel switches to the new level before its briefing |

## Corrections to build 22

| v22 | Original |
|---|---|
| One bomb per frame while the key is held | one bomb every 30 frames (gm9890 starts at 30) |

## Corrections to build 21

| v21 | Original |
|---|---|
| Level 3 used the bunker bank and level 4 the one v21 called ocean | level 3 uses cicn 700 to 721 (blue riveted plate, not water), level 4 the gold grid bank 900 to 916 plus 160 to 164 |
| BadG type 1 air, type 2 ground | type 1 ground unit, type 2 air unit |
| Subs scheduled from canal geometry | fixed spawns from BadG with a turn table |
| Yummies 30% drop from kills, timed rapid fire | five scheduled yummies per level, rapid fire permanent |
| 6 lives | 5 lives |
| Reticle 56 px ahead | 120 px ahead |
| Generic boss with 12 HP, fan of orbs | per-level dome, HP 5/6/7/9, two aimed orbs every 30 frames |
| Brick barricade on level 1 | no barricade on level 1, 1 to 3 machines with 10 HP on levels 2 to 4 |
| Level 2 music Bikini Kill 2, level 3 Xray Spex | level 2 Sonic Yoof (133), level 3 Bikini Kill 2 (136) |
| 20 fps pacing from the DVD | 35 ms frames on Easy, 30 Medium, 25 Hard |
| No high scores | top ten table with the name dialog, kept between games |
