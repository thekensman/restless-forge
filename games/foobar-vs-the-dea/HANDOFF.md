# Foobar vs. the DEA: handoff, build 26

Status as of November 2026. For a fresh chat that picks this up.

## What this is

A browser rebuild of *Foobar vs. the DEA*, a Classic Mac OS vertical shooter by Richard
Cross (Ken's brother) and Tom Cruse of Funner Software, 1996/97, written with Ingemar
Ragnemalm's Sprite Animation Toolkit (SAT). Tom died while moving to California and the game
is dedicated to him. The rebuild is a non-commercial memorial on restless-forge.dev at
`/games/foobar-vs-the-dea/`, and its source lives in the restless-forge repo at
`games/foobar-vs-the-dea/`. All paths are relative, so the trailing slash matters: nginx
redirects the slashless URL and RF's `check-urls` tests that it does. `RF_INTEGRATION.md`
covers the move, and `docs/games.md` in the RF repo covers how restored games work there.

Since build 22 the game rules are ported from the original 68k code. Earlier builds were
recreations tuned against video. Build 23 fixed one misread rule (the bomb cooldown) and
added house rules Ken asked for, each switchable back to the original. Build 24 cut the side
panel's layout churn behind the lag Ken saw, made the panel show the briefed level's boss,
added a fourth house rule for level 4 drones under a freeze, and re-checked the bosses.
Build 25 is the first deploy: Richard approved it, the fonts are self-hosted, and the page
has a share image and link preview tags.

## Files outside the repo

The source is in the restless-forge repo now, so the v25 zips (`foobar_vs_dea_v25.zip` and
`foobar_vs_dea_v25_deploy.zip`) are only the original hand-off. These stay outside it:

| File | What it is |
|---|---|
| `foobar_zip.zip` | the original `.hqx` distribution. Never commit it: it carries the old mailing address |
| `foobar-vs-the-dea_dvd.mp4` | 7.7 min DVD capture, level 1, ends on the high score table |
| `Screencast from 2026-08-25 21-06-43.mp4` | SheepShaver, level 1 boss for about a second, then level 2 |
| `Screencast from 2026-09-03 10-42-33.mp4` | SheepShaver, a 42 s level 1 boss fight |

## Where the knowledge lives

- `REVERSE_ENGINEERING.md` is the reference. Every rule cites the routine it came from as
  `fn<segment>_<offset>`.
- `AUDIT.md` says how the port was checked, against the code and the DVD.
- `tools/README.md` explains the decode chain, the disassembler and the validation scripts.
- `CAPTURE_WISHLIST.md` lists footage that would confirm the parts only the code has shown.

## Getting at the code

    unar foobar-versus-the-dea.hqx
    python3 -I tools/re/rsrc.py "Foobar Versus the DEA.rsrc" resource_fork.bin   # md5 5eddfa81...
    git clone https://github.com/autc04/multiversal                              # trap names
    python3 -I tools/re/show.py fc fn3_39CA                                       # the main loop

`tools/re/mac68k.py` lays out the CODE segments with the A5 world and a loaded jump table,
rebuilds the THINK C globals from DATA 0 and ZERO 0, and disassembles 390 functions with
capstone. `show.py` annotates traps, SANE calls, sprite faces held in globals and string
literals, and finds callers, address-of references and every use of a global. Ghidra was
built and tried; the Pascal callee-pops convention made its output noisier than this.

Conventions worth knowing before reading any routine:

- THINK C functions pop their own arguments only when declared `pascal`. SAT callbacks
  (task and hit procs) are Pascal; most game code is C with caller cleanup.
- `Random(lo, n)` is `trunc(lo + n * rand() / 32767)` and `n` is a span.
- Sprite record: kind at 0 (positive is friendly), v at 2, h at 4, hot rect at 6, face at
  `$16`, task at `$1a`, hit proc at `$1e`, layer at `$4c`, then game fields from `$52`.
  `$60` is the object code: ship 666, air 20, ground 30, boss 40, machine 41, bomb 100,
  yummy 297, rocket 303.
- Screen x is `h - 1`. The level scrolls 1 px per frame for 6400 frames.
- A global the code never writes is not zero. THINK C fills the globals from DATA 0 and
  ZERO 0 at launch. `show.py` shows the string literals that come from there, and
  `tools/re/globals.py` lists the read-only globals that start non-zero. Missing this gave
  build 22 a bomb every frame.

## The build

    index.html        page, overlays, HUD, high score dialog and table
    js/sim.js         the original rules, one frame per step(), no DOM
    js/game.js        timing, drawing, sound routing, cheats
    js/core.js        keys and touch controls (TouchPad), assets, SAT-style sound channels
    js/scores.js      the high score rules
    data/*.json       config, Levl maps, BadG waves, preload manifest
    assets/           sprites, decoded PICTs, WAVs, self-hosted fonts, share image, favicon
    test/             harness (288 checks), soak test, DOM boot test, two Playwright tests
    tools/            re/ and validate/

The deploy package is `index.html`, `js/`, `data/` and `assets/`. Nothing else goes on the
server. RF's build copies exactly those (the `files` list in `games/games.json`) to
`dist/games/foobar-vs-the-dea/`, and `npm run check-links` fails if the copy differs from
this folder by a byte. `npm test` at the repo root runs the harness, soak and boot tests.

Run with `python3 serve.py`. The stock `http.server` caches and has burned us twice. The
footer shows the build number and a red bar appears for any uncaught error. F2 dumps state.

## Decisions Ken has made

- The music samples stay. It is a memorial with no ads and no monetisation, and they come
  out if anyone asks.
- The old mailing address stays off the site. The intro art is cropped below it, PICT 136
  is not shipped, and the order form the original shows behind the high score dialog is
  replaced by the GAME OVER panel.
- Every level shows its briefing, and Ken has flagged a missing one as a bug once already.
  The original ends a briefing the moment any key is down, so holding fire through a boss
  kill skips the next one; the rebuild waits for a fresh key press.
- `qqq` (permashield toggle) and `eee` (next level) stay as Easter eggs and must never use a
  gameplay key.
- Static files only. No server, no API.
- Original behaviour that plays like a bug gets changed, as a house rule with a config switch
  back to the original. So far: rapid fire, the clone limit, respawning and frozen drones.
- Restored games carry no monetisation. This page has its own footer with no donation links.
  On `/games/` the site footer drops Ko-fi, Buy Me a Coffee and Amazon through a page-level
  override (`rf-monetisation`, off by default for the whole section); every other page keeps
  them.
- The route is `/games/foobar-vs-the-dea/`. Ken chose the long slug because Foobar sequels
  exist and may be restored too.
- The page keeps its own footer and gets no RF header or nav (option A in
  `RF_INTEGRATION.md`). The footer links back to the site.
- The memorial (the photo from the original's resources that was `PICT_137`, and the
  dedication) is shared by every Foobar game. It lives in `games/memorials/tom-cruse/` in the
  RF repo, and `npm run sync` writes it into the title screen and copies the photo to
  `assets/memorial/`. Edit it there, not in this page.
- The game, music included, is public in the RF repo. If a takedown ever needs a file gone
  from GitHub as well, rewriting history is acceptable.
- Richard approved the rebuild for release.
- Takedown requests for the music go through the contact page on restless-forge.dev, which
  carries an email address. The game page itself needs no contact line.
- Cheating is fine. Nobody minds if players use the cheats or edit browser storage.
- The QA shortcuts `bbb` and `fff` can stay in the live build.
- Touch controls are a stick and FIRE / BOMB buttons that a toggle turns on and off (Ken's
  scheme, build 26). Tilt was his first idea and was dropped: turning the phone fights the
  screen rotation, and iOS asks for permission to read motion.

## Still open

- Lag: build 24 removed the page work that grew with rapid fire, but nobody has seen it on
  Ken's machine yet. If it still stutters, `fff` shows the frame rate, the logic rate and the
  slowest frame, and his browser and OS would narrow it down.
- Bosses on levels 2 to 4, the barricade machines and the rarer yummies come from the code
  alone. Nobody has filmed them.
- The Time Zone and Volume menus have not been read.
- Touch controls (build 26) have only been played through emulated touch in Chromium
  (`test/touch_e2e.py`). They need real thumbs on an iPhone and an Android phone: the stick's
  size, its 8 px dead zone and how it follows the thumb, the 26 px gap that holds FIRE and BOMB
  together, and whether the smaller upright playfield on a short phone (about 270 px wide on
  an iPhone SE) is acceptable. Upright, the boss name gives way to the controls. Pausing in
  the background was checked with a simulated visibilitychange, since headless Chromium never
  hides a tab, so lock a real phone mid-game and come back. The `/games/` card no longer says
  the game needs a keyboard.
- Screen fit (done on RF, still build 25): the page has three layouts. A tall desktop gets
  the cabinet at its 2x size. A short, wide screen (under 820 px tall and at least 4:3: a
  laptop at 1366 x 768, a phone on its side) gets the fit layout, where the playfield takes
  the screen's height and the panels sit either side; under 450 px tall the left panel pairs
  up in two columns. A narrow, tall screen gets the stacked layout. Overlays scroll instead
  of clipping in the small layouts. Before this, a 1366 x 768 laptop lost the top 60 px of
  the playfield, and the desktop canvas always lost its right and bottom 3 game pixels to
  the stage border.
- When the lead ship is lost, a surviving clone becomes the lead. The original lets the clone
  fly on alone and later builds a new clone off a freed record; the rebuild does not copy
  that.

## Lessons

- Anchor every scripted edit with an assertion that the old text exists. Silent no-op
  replacements broke builds 8, 16 and 18.
- Keep an end-to-end test with real input. 197 unit tests once passed through a black
  screen because they all used a stub.
- When the code and the footage disagree, find out why before tuning. The DVD's 20 fps was
  the recording machine, and tuning to it made build 21 slow.
- When a rule looks like a bug, check the reading before calling it original. Of the four
  behaviours flagged after build 22, three were the original and one was a misread global.
- Measure before optimising. The lag in build 23 was never the game loop, which costs a
  fraction of a millisecond; it was the HTML around the canvas.
- Ken treats every build as raw material to stress-test. Expect detailed QA rounds.
