# Foobar vs. the DEA on restless-forge.dev

Integration notes for Claude Code, written against build 25 (November 2026). Read this before
touching the RF monorepo for the game. Items marked **Ask Ken** are his call.

## The short version

1. Put the `foobar/` folder from `foobar_vs_dea_v25_deploy.zip` at `/games/foobar/` as static
   files, byte for byte. No build step should touch it.
2. Make `/games/foobar` (no slash) redirect to `/games/foobar/`.
3. Keep ads, donation links and affiliate links off the game page, and off `/games/` while that
   section only holds restored games. The global footer keeps them everywhere else.
4. Add a small `/games/` index page and a way to reach it from the rest of the site.
5. Run the checklist at the end of this file against the live site.

## What this is

*Foobar vs. the DEA* is a Classic Mac OS shooter that Ken's brother Richard Cross wrote with
his friend Tom Kluge in 1996 and 1997, as Funner Software. Tom died while moving to California
and the game is dedicated to him. The rebuild runs in the browser from the original artwork,
sound, level maps and wave tables, and since build 22 its rules are a port of the original
68k code. Richard has approved it for release. On RF it is a memorial, and it may be the first
of a few restored games.

The game is plain HTML, CSS and ES modules. It has no build step, no dependencies and no server
code, and it makes no request outside its own folder. In the source zip, `README.md` and
`HANDOFF.md` cover the game itself. `REVERSE_ENGINEERING.md` only matters if you touch the
rules, and you shouldn't need to.

## Decisions already made

These are Ken's and they're settled. Don't reopen them, and don't let a site default undo them.

- **No monetisation on restored games.** No ads, no AdSense script, no Ko-fi or other donation
  links, no affiliate links. The global footer logic keeps its donation links. Restored game
  pages override it. Ken wants an override, not a change to the global logic.
- **The music stays.** The loops are short samples of commercial records, kept because this is
  a non-commercial memorial with no ads. If anyone asks for one to come down, it comes down
  (see Removing a music track). Requests reach Ken through the email on RF's contact page, so
  the game page needs no contact line of its own.
- **The original's old mailing address never goes online.** The intro art ships cropped above
  it and `PICT_136` isn't shipped. Don't add art from the original archive without checking it
  for the address and phone numbers.
- **Every level shows its briefing.** The original drops a briefing the moment any key is
  down, so players holding fire through a boss kill never saw the next one. The rebuild waits
  for a fresh key press.
- **The cheats stay.** `qqq` (permanent shield) and `eee` (next level) are Easter eggs, and the
  QA shortcuts `bbb` (jump to the boss), `fff` (frame rate) and F2 (state dump) stay in the live
  build too. Ken doesn't mind if players cheat.
- **Static files only.** No server code, no API, no accounts.
- **House rules.** Where the original plays like a bug, the rebuild changes it, with a switch
  back to the original in `data/config.json`. Leave them as shipped.

## What's in the package

    foobar/
      index.html        the page: cabinet, overlays, HUD and the boot script (an inline module)
      js/               core.js, game.js, scores.js, and sim.js (the original's rules)
      data/             config.json, levels.json, enemies.json, manifest.json
      assets/sprites/   250 PNGs decoded from the original cicn resources
      assets/ui/        decoded PICTs, plus share.png (1200 x 630) and icon.png (the favicon)
      assets/sounds/    9 WAVs decoded from the original snd resources
      assets/fonts/     4 woff2 files and their SIL Open Font License texts

That's 308 files and about 1.1 MB. Every path inside is relative, and every module, data and
asset URL carries `?v=25`.

The page keeps two things in `localStorage` on the RF origin: `foobar_save` (the level to
continue from) and `foobar_highscores` (the top ten table). Nothing leaves the browser.

The source zip (`foobar_vs_dea_v25.zip`) has the same files plus the tests, the reverse
engineering tools and the docs. Only the deploy package goes on the server.

## The route

Recommendation: a `/games/` section beside `/tools/`, with the game at `/games/foobar/`.

- A game is a different kind of page from a tool. It takes over the screen and the keyboard,
  and people come to it to play. Its own section keeps `/tools/` about tools.
- Restored games get a home. If RF restores another abandoned game, it lands at
  `/games/<slug>/` and picks up the section's rules, starting with no monetisation, without
  anyone having to remember them.
- The share tags already assume it. The canonical URL, `og:url`, `og:image` and
  `twitter:image` in `index.html` all start with `https://restless-forge.dev/games/foobar/`.

If the route ends up somewhere else, change those four tags together. The harness checks that
the other three start with the canonical URL, so it catches a partial edit, but it can't know
what the right address is.

**Ask Ken:** `/games/foobar/` or a longer slug such as `/games/foobar-vs-the-dea/`. The short
one is fine for search, since the title carries the full name.

### The /games/ index

A normal RF page in the shared layout, with:

- one entry for Foobar: `assets/ui/share.png` as the image, the title, a line such as "Richard
  Cross and Tom Kluge's 1996 Mac shooter, rebuilt from the original code", and "In memory of
  Tom Kluge"
- a sentence on what the section is: old games restored to play in the browser, free and
  without ads
- the monetisation override switched on (below)

**Ask Ken** where it's linked from: the header nav, the home page, or both.

## Putting it on the site

### Option A: a standalone static folder (recommended)

Serve the folder as it is. The game page keeps its own small footer, which already leaves
Ko-fi out and links back to RF, Substack and GitHub.

1. Find out how the monorepo publishes files that skip templating: a `public/` or `static/`
   folder, a passthrough copy rule, or similar. Check how the build treats an existing `.html`
   file first, because some setups wrap every HTML file in the layout, minify it or rewrite its
   links.
2. Put the folder there so it's published at `/games/foobar/`.
3. Make sure nothing in the pipeline changes it. Watch for HTML minifiers (they can mangle the
   inline module script), asset fingerprinting (it breaks the `?v=` URLs the code builds at
   runtime), TypeScript or bundler passes that pick up `js/*.js`, link rewriters, and anything
   that injects scripts into every HTML page, whether at build time or at the host (AdSense
   auto ads, analytics snippets, host-level snippet injection).
4. Check that the published copy matches the package: `diff -r <package>/foobar
   <build-output>/games/foobar` should print nothing.

What Option A gives up is the RF header and nav on the game page. The footer links back to the
site, and a game that fills the screen suits a cabinet anyway.

Two small optional touches in the game's `index.html`: the footer's Restless Forge link opens
a new tab, which made sense when the game lived elsewhere and can become a plain link to `/`;
and if RF titles follow a pattern such as `Name | Restless Forge`, apply it to `<title>` only.

### Option B: the RF layout with the game in an iframe

If Ken wants the site header on the game page, wrap the game rather than merge it:

- serve the package at `/games/foobar/play/`, untouched, as in Option A
- make `/games/foobar/` a normal layout page that holds an iframe of `play/`, at most about
  1022 px wide and 1022:768 in shape, with the monetisation override on
- put the canonical, Open Graph and Twitter tags on the wrapper page, with `og:image` still
  pointing at the share image
- the game only gets keys once the iframe has focus. Clicking START gives it focus, but test
  that arrow keys and space don't scroll the outer page before then.

The iframe keeps the game's CSS and key handling apart from the site's. The game's mobile
layout still works inside it, since its media query reads the iframe's width.

### Don't merge the game's markup into the shared layout

It would mean rewriting the page, and it breaks things a quick look won't show:

- The page's CSS opens with a global reset (`*{margin:0;padding:0;box-sizing:border-box}`) and
  sets `html,body{height:100%;overflow:hidden}` with the body as a centred flex column. That
  would flatten the site's own layout.
- Class names such as `.row`, `.side`, `.plate`, `.lbl`, `.new` and `.at` are generic enough to
  collide with site styles.
- The input code listens on `window` and cancels the default action of arrow keys and space
  for the whole page, so the site's own controls would lose those keys.
- The cabinet is laid out for the whole viewport. It's 1022 px wide and switches to a stacked
  layout under 1060 px of viewport, not of container.
- The boot script is an inline module that expects its own element ids.

## The monetisation override

Ken's rule: restored games carry no monetisation, and the switch lives at the page level so
the global logic stays as it is. Even with Option A the `/games/` index needs it.

Make it a page setting the shared layout reads, on by default:

- a flag in whatever per-page config the layout uses (front matter, a page object, a data
  attribute), for example `monetisation: false`
- when it's false, the layout leaves out the AdSense script and any ad slots, the Ko-fi and
  other donation links in the footer, and any affiliate blocks. The rest of the footer stays.
- a section default for `/games/` if the layout supports one, so every page under it starts
  with the flag off, while any page can still set it either way
- one implementation shared by every page, so the next restored game needs no new code

Acceptance:

- Every page outside `/games/` builds to exactly the same output as before. Diff the built
  HTML of a few existing tool pages before and after the change.
- The built pages under `/games/` contain none of `adsbygoogle`, `googlesyndication`,
  `ko-fi.com` or an affiliate tag. If RF has tests, add one that greps the built output under
  `/games/` for those markers.
- Turning the flag back on for a `/games/` page brings the global footer back unchanged, which
  shows it's an override and not a fork of the footer.

**Ask Ken** about the FreeRoll Vegas backlink, if it's in the global footer by then. It's an
SEO swap, so the no-monetisation rule doesn't strictly cover it. It's still a promotional link,
and he may not want it under a memorial section.

## Hosting details

**Trailing slash.** `/games/foobar` has to answer with a 301 or 308 to `/games/foobar/`. Every
path in the page is relative, so a page served at the slashless URL resolves `js/game.js`
against `/games/` and loads nothing. Many static hosts redirect directory URLs to the slashed
form, but it depends on the host and its settings. Test it after deploy and add an explicit
redirect if it's missing.

**MIME types.** `.js` must be served with a JavaScript type such as `text/javascript`.
Browsers refuse module scripts served as `text/plain` or `application/octet-stream`. The rest
should be `application/json`, `audio/wav`, `font/woff2` and `image/png`, though only the
JavaScript type is enforced.

**Caching.** The page loads everything else through `?v=<build>` URLs, so:

- `index.html` should revalidate on every visit (`Cache-Control: no-cache`, or a short
  max-age). A stale `index.html` keeps players on the old build.
- everything under `js/`, `data/` and `assets/` can be cached for a long time, as long as the
  CDN keeps the query string in its cache key. Some CDN setups drop it, and then a new build
  gets served the old files under its new URLs. Check RF's settings.

If RF has a service worker whose scope covers `/games/`, make sure it doesn't answer
`index.html` from its cache first.

**Content Security Policy.** If RF sends a CSP header, the game needs:

- `script-src 'self'` plus permission for the inline module script in `index.html`. A hash
  works, but it changes with every build because the script contains the `?v=` stamps. The
  sturdier fix is to move that script into `js/main.js` in the game's own repo and load it with
  `<script type="module" src="js/main.js?v=NN">`. `test/boot_e2e.mjs` reads the inline script
  out of `index.html`, so it needs the same change.
- `style-src 'self' 'unsafe-inline'`, because the page has an inline `<style>` block and
  `style` attributes, some of them written by the script.
- `connect-src 'self'` for the `fetch` calls that load the JSON and WAV files, plus
  `img-src 'self'` and `font-src 'self'`.

Nothing else, and nothing from another origin. If RF sends no CSP, skip this.

## Removing a music track

If a takedown request comes in, these are the music files:

| Plays on | snd | File |
|---|---|---|
| title and intro | 134 | `assets/sounds/snd_134.wav` |
| level 1 | 135 | `assets/sounds/snd_135.wav` |
| level 2 | 133 | `assets/sounds/snd_133.wav` |
| level 3 | 136 | `assets/sounds/snd_136.wav` |
| level 4 | 138 | `assets/sounds/snd_138.wav` |

Delete the file and remove its name from `sounds` in `data/manifest.json`. The game plays
silence where that loop was, and the tests still pass. Leave `data/config.json` alone: it
records what the original plays, and the harness checks it against the code. The other four
WAVs (129, 130, 132, 137) are the game's sound effects.

## Mobile

Ken would like a mobile version, and he wants to try it once the game is on the site, because
it isn't obvious how missiles and bombs should work on a touchscreen. Treat it as design work
to test with him, not a port to ship unseen.

**What exists.** Under 1060 px of viewport the page stacks the left panel, the playfield and the
right panel in one column, and lays six invisible touch zones over the playfield (`#touch` in
`index.html`, wired up in `js/core.js`): strips down the left and right edges, bands across
the top and bottom, and fire and bomb side by side in the middle. Nobody has tried it on a
phone. Fingers cover the playfield, nothing shows where the zones are, and moving while firing
takes two fingers on the right two zones.

**Constraints from the original.**

- The ship moves 4 px per frame on each axis, all or nothing, like the keys. Dragging the
  ship under a finger would let it move faster than the original allows.
- Missiles destroy yummies. Always-on auto-fire, the usual mobile answer, would shoot the
  pickups the player is trying to collect.
- Holding fire repeats every 10 frames (5 with rapid fire) and holding bomb every 30, so
  hold-to-fire buttons behave like the keys.

**A scheme to try first.**

- controls under the playfield instead of on top of it, since a portrait phone has room
  below a 320 x 340 field scaled to its width
- left thumb: a virtual stick that turns the thumb's offset from where it landed into the
  same left, right, up and down flags the keys set, so the ship keeps its 4 px per frame
- right thumb: two visible buttons, FIRE and BOMB, held like the keys
- pause when the page is hidden (`visibilitychange`), since people switch apps mid-game

Keep the touch code in `Input` in `js/core.js`, which already merges touch flags with the keys,
so `js/sim.js` doesn't change. If an auto-fire option seems worth having, make it a setting
that's off by default, because of the yummies.

Test on a real iPhone and a real Android phone. Web Audio only starts after a tap, so check
the sound comes on after START. Check that long presses don't select text or open a menu
(`touch-action`, `user-select`, `-webkit-touch-callout`). The high score name field is a normal
text input, and on iOS the automatic focus may not raise the keyboard until the player taps it.

## Updating the game later

The build number lives in several places, and the page paints a red bar if they disagree:

- `index.html`: `const BUILD='NN'` and the `?v=NN` on every module, data and asset URL
- `js/core.js`: `export const V = 'NN'`
- `js/game.js`: the `?v=NN` on its import and its two `fetch` calls
- `data/config.json`: `"build"`
- `test/harness.mjs`: the build checks near the top

Bump them with a script that asserts each old string is there before replacing it. Silent
replacements that matched nothing broke three earlier builds.

Run the tests from the source zip before shipping a new build:

    node test/harness.mjs .        # 269 checks
    node test/soak.mjs .           # 48 games of random play
    node test/boot_e2e.mjs .       # boots index.html in a DOM shim
    python3 serve.py 8122 &
    python3 test/browser_e2e.py http://localhost:8122/ shots/

The browser test needs Playwright and Chromium. It also runs under a subfolder, which is the
better test for RF: serve a folder that contains `games/foobar/` and pass
`http://localhost:8122/games/foobar/`. It fails on any console error, any failed request and
any request outside the page's origin.

Leave the rules alone. `js/sim.js`, `data/levels.json` and `data/enemies.json` are the
original game, and `REVERSE_ENGINEERING.md` cites the routine behind every rule. A gameplay
change is a house rule: a setting in `data/config.json` with the original value one edit away.

## Still open

- **Browsers.** Everything was tested in Chromium, and Ken's QA covers whatever he plays on.
  Safari and Firefox haven't been tried. If Playwright's `firefox` and `webkit` browsers are
  installed, the browser test can run on them by changing its one `launch` call and dropping
  the Chromium-only autoplay flag it passes.
- **Mobile**, as above.
- The game's own open items are in `HANDOFF.md`.

## Checklist after deploy

- [ ] `https://restless-forge.dev/games/foobar` redirects to `/games/foobar/` with a 301 or 308
- [ ] the page loads, START works, and the footer shows build 25
- [ ] no red error bar, and the browser console is clean
- [ ] in the Network panel every request goes to restless-forge.dev and none fail
- [ ] `curl -sI "https://restless-forge.dev/games/foobar/js/game.js?v=25"` shows a JavaScript
      content type
- [ ] the page source has no `adsbygoogle`, `googlesyndication` or `ko-fi.com`, and neither
      does `/games/`
- [ ] other pages still show their ads and donation links as before
- [ ] `https://restless-forge.dev/games/foobar/assets/ui/share.png` opens
- [ ] a link preview (pasted into Slack or Discord, or LinkedIn's Post Inspector) shows the
      share image, the title and the description
- [ ] `/games/` and `/games/foobar/` are in the sitemap, allowed by robots.txt and not
      noindexed, and indexing is requested for both in Search Console
- [ ] `bbb` jumps to the level 1 boss; losing on purpose with a score opens the name dialog,
      and after a reload the score is still in HIGH SCORES
