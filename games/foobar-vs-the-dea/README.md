# Foobar vs. the DEA, web rebuild

Original: **Funner Software, 1996.** Written by **Richard Cross** and **Tom Kluge** with
Ingemar Ragnemalm's Sprite Animation Toolkit. Dedicated to Tom's memory.

This is a browser rebuild that uses the original artwork, sound, level maps and wave
tables from the Macintosh resource fork. Since build 22 the game rules are a port of the
original 68k code rather than a recreation from video: every enemy, the boss, the yummies,
scoring, deaths and checkpoints follow what the code does. `REVERSE_ENGINEERING.md`
documents each rule with the routine it came from. Build 23 changes three of those rules on
purpose; they are listed under House rules below, each with a switch back to the original.

## Run

    python3 serve.py            # http://localhost:8080

Use `serve.py` rather than `python3 -m http.server`. The stock server lets browsers cache
the scripts and data, and you end up testing an old build. Every asset URL is stamped with
the build number, the footer shows it, and a red bar appears if the files disagree.

## Deploy

Static drop-in. No build step, no dependencies, no server code, and no requests outside its
own folder: the fonts are served from `assets/fonts` under the SIL Open Font License. The
deploy package holds only what the server needs (`index.html`, `js/`, `data/`, `assets/`).
`RF_INTEGRATION.md` covers putting it on restless-forge.dev.

## Controls

| Action | Keys | Original |
|---|---|---|
| Fly | W A S D or arrows | W A S D by default, configurable |
| Fire missiles (aircraft) | Z or Space | Command |
| Drop bombs (ground targets) | X or Shift | Option |
| Pause | Esc or P | Esc |
| Music on or off | M | Music menu |

Command and Option are left out on purpose: in a browser Command+W closes the tab and
Alt+Left goes back a page.

On a touchscreen, TOUCH CONTROLS on the title and pause screens turns on a stick for the left
thumb and FIRE and BOMB for the right. They start on where the main pointer is a finger (phones
and tablets) and the choice is remembered. They sit beside the playfield on a phone held on
its side and under it held upright, never on it, and upright the playfield gives up a little
size on short phones so everything fits. The stick centres where the thumb lands and reads as
eight directions, so the ship moves 4 px a frame like it does on the keys, and dragged past
its rim it follows the thumb, so turning round takes a short slide. FIRE and BOMB repeat while
held, like their keys; a thumb on the + between them holds both, and so does a second finger.
A pad button skips the intro and clears a briefing as a key does. There is no auto-fire,
because missiles destroy yummies.

Leaving the page, for another tab or app or with the screen locked, pauses a game in play and
holds the sound, and the game waits on RESUME when you come back.

The pink triangle is the bomb sight. A bomb lands on the ground point under the sight and
only does damage when it gets there. Missiles destroy yummies, so fly into them.

Cheats, kept as Easter eggs: type `qqq` during play for a permanent shield (toggle) and
`eee` to finish the level. Two QA shortcuts work the same way: `bbb` skips ahead to just
before the current level's boss arena, and `fff` shows the frame rate, the logic rate and the
slowest frame of the last second in the corner of the playfield.

## Layout

    index.html          cabinet shell, overlays, HUD wiring, main loop
    js/sim.js           the original game rules, one original frame per step() (no DOM)
    js/game.js          runs sim.js on the original frame timer, draws, routes sound
    js/core.js          keys and touch controls, asset loader, SAT-style sound channels
    js/scores.js        the original's high score table rules
    data/config.json    per-level data the rules read, timing, presentation settings
    data/levels.json    4 levels x 2000 tile indices (original Levl resources)
    data/enemies.json   4 x 150 wave entries (original BadG resources)
    data/manifest.json  everything preloaded
    assets/sprites/     the 250 cicn colour icons as PNG
    assets/ui/          decoded PICTs: chassis, portraits, briefings, the four boss arenas,
                        plus share.png (link previews) and icon.png (favicon)
    assets/sounds/      decoded snd resources as WAV, named by resource id
    assets/fonts/       IBM Plex Mono, DM Serif Display and Lora as woff2, with their licences
    test/               rules harness, soak test, DOM boot test, real-browser tests
    tools/re/           disassembler and decoders that pulled all of this out of the original
    tools/validate/     scripts that check the port against captured footage

## How faithful is it

- **Timing.** One frame per tick of the original timer: 35 ms on Easy, 30 on Medium, 25 on
  Hard. Logic runs at that rate and positions are blended for display, so motion is smooth
  without changing any rule. The DVD footage ran at 20 fps because the machine that recorded
  it rounded the timer to whole 60 Hz ticks; set `timing.frameMs` to 50 for Easy to see that
  pace.
- **Bombs** drop one every 30 frames per ship. The original keeps that number in a global
  that only its startup data sets, and build 22 misread it as zero.
- **Waves.** BadG type 1 is the level's ground unit and type 2 its air unit, spawned on the
  exact scroll row. Level 1 submarines follow the turn table hard-coded in the original, and
  the same submarines the original deletes at spawn are deleted here.
- **Yummies** are scheduled at five fixed points per level, with the original's weighting
  and once-per-life rules.
- **Bosses** use the per-level dome sprites, HP and fire pattern. Levels 2 to 4 have the
  "DEA" barricade machines in front of the boss.
- **Deaths** run the 50-frame aftermath and restart at the checkpoint the original picks.
- **Briefings.** The side panel switches to the boss and number of the level being briefed,
  as the original does before it waits for a key.
- **Sound** uses the original resources on SAT-style channels, including the level 2 music
  and the effects that earlier builds could not decode. Music restarts on the original's
  period instead of looping the sample.
- **High scores** follow the original's top ten: a score has to beat 10th place, the Mac
  beeps, the name dialog with the POW! icon comes up, and the table shows the new row in red.
  The table is kept in browser storage instead of the preferences file. HIGH SCORES on the
  title screen stands in for the High Scores menu, and its Erase button wants a second click.

## House rules

A few things in the original play like bugs, so the rebuild changes them on purpose. Each
is a setting under `houseRules` in `data/config.json`. Put the original value back and the
original rule returns; the test harness checks the game both ways.

| Setting | Rebuild | Original value and rule |
|---|---|---|
| `rapidFireFrames` | 640: rapid fire runs out after about 22 s on Easy, and a lost life ends it | 0: it lasts the rest of the game |
| `maxClones` | 2: a second Foo++ adds a third plane on the right | 1: one clone on the left, and at most one Foo++ per life on each level |
| `respawnShieldFrames` | 180: after a lost life the new ship flies in shielded, blinking for the last 100 frames | 0: no shield |
| `dronesVisibleInFreeze` | true: level 4 drones that arrive during a freeze show up | false: they stay invisible until the freeze ends |

The rapid fire timer pauses during the boss fight, the same way protection does. With two
clones the lead stops 33 px from either edge so both wing ships stay on screen.

## Other deliberate differences

- The page chrome is HTML rather than the Mac window.
- When the lead ship is lost, a surviving clone takes over as the lead. The original lets the
  clone fly on alone and can trip over a freed sprite record when another Foo++ arrives.
- Every briefing waits for a fresh key press. The original ends a briefing the moment any key
  is down, so holding fire through a boss kill skipped the next briefing almost at once.
  That's why level 2's briefing looked missing in a capture of the original.
- The original shows its order form behind the high score dialog. That page carries an old
  mailing address, so a GAME OVER panel sits there instead.
- The score is an ordinary number, where the original's 16-bit counter would have wrapped
  past 32,767.
- This page's footer leaves out the site's donation link. Restored games carry none.

## Performance

The rules and the drawing take well under a millisecond a frame. What cost more was the side
panel: every score change rewrote it and relaid out the whole cabinet, several times a second
in a busy fight. Since build 24 the panel only touches values that changed, each readout
keeps its layout to itself, and the boss meter moves without layout. If the game still
stutters, type `fff` during play and note the three numbers it shows.

## Tests

    node test/harness.mjs .                         # 288 checks: original rules, house rules, touch, the page
    node test/soak.mjs .                            # 48 games of random play, checked every frame
    node test/boot_e2e.mjs .                        # boots index.html in a DOM shim, plays 25 s
    python3 serve.py 8122 & python3 test/browser_e2e.py http://localhost:8122/ shots/
    python3 test/touch_e2e.py http://localhost:8122/ shots/      # with serve.py still running

The browser test needs Playwright and Chromium. It plays real key events, jumps to the boss,
skips to level 2 with the cheat and checks the briefing's side panel, flies three planes
with rapid fire while counting how often the side panels change, loses on purpose to walk
through the high score dialog and table, and fails on any console error, any failed request
and any request outside the page's own origin.

The touch test drives the page on a phone-sized screen, upright and on its side, with real
multi-touch (CDP touch events, which Chromium turns into the pointer events a phone sends):
the stick's eight directions, dead zone and follow, the ship moving under it, FIRE and BOMB
alone, together through the gap and with two fingers, the toggle and its memory, and the game
pausing with its sound held when the page is hidden. Headless Chromium never hides a tab, so
that last part dispatches the visibilitychange a real browser would send.

## Credits

Original game by Richard Cross and Tom Kluge, Funner Software. Sprite Animation Toolkit by
Ingemar Ragnemalm. The music loops are short samples of commercial records, kept because
this is a non-commercial memorial with no ads. They will be removed on request, through the
contact page on restless-forge.dev.

The page fonts are IBM Plex Mono (IBM Corp.), DM Serif Display (Google LLC, built on Adobe's
Source Serif) and Lora (The Lora Project Authors), each under the SIL Open Font License 1.1.
The licence texts sit beside the font files.
