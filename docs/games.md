# Restored games

`/games/` holds old games restored to play in the browser. The first is *Foobar vs. the
DEA* (Richard Cross and Tom Kluge, Funner Software, 1996), and its sequels may follow. This
page covers how a game lives in the repo, how it ships, and the rules that come with the
section. Each game's own notes (its `README.md`, `HANDOFF.md` and, for Foobar,
`RF_INTEGRATION.md`) cover the game itself.

## The rules

These are Ken's decisions and every page under `/games/` follows them.

- **No monetisation.** No AdSense loader or ad slot, no donation links, no sales or
  affiliate links, on the games and on `/games/` itself. Every other page keeps its ads
  and its support links.
- **Static files only.** A game makes no request outside the site, needs no server code,
  and ships exactly as it sits in its folder.
- **A game page is never wrapped in the site layout.** Its CSS opens with a global reset
  and sets `html, body { overflow: hidden }`, its input code cancels arrow keys and space for
  the whole page, and its boot script expects its own element ids. It keeps its own footer,
  which links back to `/`.
- **Nothing from an original archive goes online unchecked.** Foobar's original carries an
  old mailing address; its intro art is cropped above it and PICT 136 is not shipped.
  Check any new art for addresses and phone numbers, and never commit the original
  archive (`.gitignore` blocks `.hqx`, `.rsrc`, `resource_fork.bin` and video captures
  under `games/`).

## Layout

```
games/
├── games.json             ← single source: /games/ cards, sitemap, llms.txt, build copy, tests
├── memorials/<id>/        ← a memorial shared by several games (photo.png + memorial.json)
└── <slug>/                ← one game's FULL source: page, code, data, assets, tests, tools, notes
site/games/index.html      ← the /games/ hub, in the site layout, monetisation off
scripts/games.mjs          ← reads games.json; copy, render and verify helpers
```

A `games.json` entry:

| Field | What it is |
|---|---|
| `slug` | folder under `games/` and the URL, `/games/<slug>/`. Use the full title, since sequels exist |
| `title`, `studio`, `year`, `desc` | the card and the `llms.txt` line (plain text, escaped at render) |
| `image`, `imageAlt` | card image, a path inside the game (Foobar uses its 1200 x 630 share image) |
| `note` | optional caveat on the card. Foobar's says it needs a keyboard until touch controls exist |
| `memorial` | optional, a folder name in `games/memorials/` |
| `files` | the runtime subset that ships. Everything else in the folder stays in the repo |
| `tests` | node scripts `npm test` runs from the game's folder with `.` as the argument |

`loadGames()` fails on a missing field, a path that does not exist, or a folder under
`games/` with no entry, so a game cannot be half-added.

## How a game ships

- `build.sh` runs `node scripts/games.mjs copy dist`, which copies each game's `files` into
  `dist/games/<slug>/` byte for byte. No templating, minifying or cache-busting touches
  them; the game stamps its own URLs with `?v=<build>`.
- `npm run check-links` fails if any file in `dist/games/<slug>/` differs from its source,
  is missing, or was never listed. The build's cache-busting seds run over every HTML file
  in `dist`, so this is what proves a game page came through them unchanged.
- nginx serves games from the root `location /`, so the slashless URL 301s to the slashed
  one like every directory page. That matters more here than anywhere: every path in a game
  page is relative, so the page loads nothing at the slashless URL. `check-urls` asserts
  the redirect, the JavaScript type on every module script, `audio/wav` on sounds, and a
  one-day cache on the page's `og:image`, which is named without `?v=` and would otherwise
  sit under the one-year immutable rule.
- In `npm run dev`, the root server (`vite.config.ts`) streams the shipped files from
  `games/<slug>/` without Vite's HTML transform. A game also runs on its own from its
  folder (Foobar: `python3 serve.py`), which is how its browser test runs it.

## The monetisation override

One switch, `window.rfMonetisation()` in `site/shared.js`:

- A page sets `<meta name="rf-monetisation" content="off">` (or `"on"`).
- Without the tag, every page under `/games/` is off and every other page is on.
- Off, `rfFooter()` leaves out Ko-fi, Buy Me a Coffee and Books on Amazon (the entries
  marked `true` in `support`) and retitles the block "Follow Restless Forge". The nav, the
  footer links, Substack and GitHub stay.
- Ads are opted out by the page itself: no page under `/games/` loads the AdSense loader.

`check-links` holds it in place. It fails when built HTML under `/games/` contains ad or
donation markup, when the footer rendered under `/games/` links Ko-fi, Buy Me a Coffee or
Amazon, when switching the flag back on does not reproduce the global footer exactly, and
when the global footer loses its donation links. Game pages do not load `/shared.js` at all;
their own footers carry no donation links, which Foobar's harness also checks.

## Memorials

`games/memorials/tom-kluge/` holds the photo from Foobar's resources (PICT 137) and its
dedication, shared by every Foobar game so the sequels carry it without a copy to drift.

- A game opts in with `"memorial": "tom-kluge"` in `games.json` and a pair of markers in its
  `index.html` where the block should sit (Foobar: the title screen):

  ```html
  <!-- generated:memorial — do not edit; run `npm run sync-static` -->
  <!-- /generated:memorial -->
  ```

- `npm run sync` writes the block between them and copies the photo to
  `assets/memorial/<id>.png` inside the game, stamped with the page's `BUILD`. The copy keeps
  the game runnable from its own folder. The block uses inline styles and the game's
  `--gold-dim` and `--dim` properties when it defines them, so it needs no CSS from the game.
- Sync fails if a game names a memorial and has no markers, or has markers and names none.
- Edit the text and photo in `games/memorials/`, never in a game page. CI's drift check
  fails on a hand edit.
- A photo must carry no metadata. `check-content` rejects EXIF and the PNG text chunks that
  hold EXIF, IPTC or XMP profiles; Foobar's photo arrived with an IPTC chunk.

## Adding a game (a Foobar sequel, say)

1. Put its full source in `games/<slug>/`. Check its art for addresses and phone numbers
   before anything else.
2. Its page needs canonical, `og:url`, `og:image` and `twitter:image` under
   `https://restless-forge.dev/games/<slug>/` (`check-urls` fails if the canonical is not
   the served URL), relative asset paths, the `?v=<build>` stamps, the site's title suffix,
   no ad or donation markup, and its own footer linking to `/`.
3. Add its entry to `games/games.json`, and the memorial markers if it carries one.
4. Add it to "Restored games" in `LICENSE.md` with its authors' terms.
5. Run `npm run sync`, `npm test`, then `./build.sh && npm run check-links && npm run check-urls`.
6. After deploy, run the game's own checklist (Foobar's is at the end of `RF_INTEGRATION.md`).

## Updating a game

Change it in its folder and follow its own release notes. Foobar's build number lives in
several files and the page shows a red bar when they disagree (`RF_INTEGRATION.md`,
"Updating the game later"). Bump it for any change to `js/`, `data/` or `assets/` after a
deploy: those files are cached for a year under their `?v=` URL. Then run `npm run sync`,
which re-stamps the memorial photo with the new build, and `npm test`.

## Takedowns

If a rights holder asks for a music loop to come down, follow "Removing a music track" in
Foobar's `RF_INTEGRATION.md`. The files are in this public repo's history too, and Ken has
accepted rewriting history if a request needs them gone from GitHub as well.
