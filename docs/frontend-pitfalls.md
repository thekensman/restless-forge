# Frontend Pitfalls

Defects that actually shipped, what caused them, and what stops them coming
back. Every entry here cost real debugging time, and most of them looked like
something else first — that misdirection is the reason the file exists.

Each one names its guard. If a guard exists, trust it over your memory.

---

## 1. Immutable caching without a hash

**Symptom.** A phone showed ~1200px of black between the nav and the article.
Nothing reproduced locally at any viewport width. It looked like an ad problem,
then like an Auto Ads problem. It was neither — Auto Ads was off.

**Cause.** nginx serves css/js as `immutable, max-age=31536000`, while HTML is
`no-cache`. That split is only safe if the URL changes when the file does.
`/styles.css` was referenced bare, with no `?v=` hash, so returning visitors
held a **year-old stylesheet against freshly deployed markup** — and
`immutable` means the browser will not even revalidate to find out.

The visible damage came from a rule that only existed in the new CSS. When the
rail ads shipped, a phone with a cached pre-rail `styles.css` had no
`.ad-rail { display: none }`, so two 600px ad containers rendered as ordinary
static blocks and pushed the article a full screen and a half down the page.

**Why it hid.** A local build always serves a fresh stylesheet, so the bug is
invisible to the person who wrote it. Only a client holding an old copy sees
it, and only until they hard-refresh.

**Rule.** Any file with a stable filename served from `dist/` must be
cache-busted in `build.sh`. Vite's own bundles (`assets/index-<hash>.js`) carry
the hash in the filename and are exempt.

**Guard.** `scripts/check-links.mjs` fails when a same-origin `.css`/`.js`
reference in built HTML has neither `?v=` nor a hashed filename.

---

## 2. A more specific selector replaces the global reset

**Symptom.** Every essay page scrolled sideways on a phone, into empty margin,
with the header brand clipped.

**Cause.** `.page figure img { max-width: 640px }` is more specific than the
global `img { max-width: 100% }` reset, so the cap **replaced** the reset
instead of tightening it. A 640px image rendered inside a 360px viewport.

**Rule.** When capping a dimension that a global reset already constrains,
write the cap as the smaller of the two — `min(100%, 640px)` — never the bare
pixel value.

**Guard.** None automated (see "What is not guarded" below). Check a 360px
viewport by hand when touching image or layout CSS.

---

## 3. Explicit `width` destroys the aspect-ratio reservation

**Symptom.** An essay image shoved everything below it down by 750px when it
finally decoded.

**Cause.** A lazy-loaded image with no `width`/`height` attributes reserves no
box: the figure sat at 34px — a caption with nothing above it — until the image
arrived.

The fix for that is intrinsic `width`/`height` attributes, which let the
browser reserve the correct aspect-ratio box. But the *second* attempt at
capping image height reintroduced it: `max-height` + `width: auto` produces a
correct ratio, yet the explicit `width` **overrides the aspect-ratio box the
attributes provide**, so nothing is reserved and all four images shift ~640px
each.

**Rule.** Always set `width` and `height` on content images. Cap size with
`max-width` — never with `max-height`, and never with an explicit `width`:

| Approach | Ratio | Box reserved |
|---|---|---|
| `max-height` alone | **distorted** (clamps height, keeps width) | yes |
| `max-height` + `width: auto` | correct | **no — ~640px shift** |
| `max-width` | correct | yes |

**Guard.** None automated. Verify in a browser with the image requests held
open, so the pre-load reservation is observed rather than assumed.

---

## 4. Ad slots

Three separate failures, all silent:

- **A slot without a loader renders nothing.** Three TattooSafe sub-pages had
  `<ins class="adsbygoogle">` and called `rfMountAdsenseSlots()` with no loader
  script, so the queue was pushed and nothing consumed it.
  *Guard:* `check-content-health.mjs` rule 6.
- **An unfilled unit holds its space open.** AdSense stamps
  `data-ad-status="unfilled"` on an `<ins>` it could not fill; without a rule to
  collapse it, the container's border, padding and "Advertisement" label render
  around nothing. That is every page before the account is approved.
  *Handled:* `ins.adsbygoogle[data-ad-status="unfilled"] { display: none }` in
  `site/styles.css`, plus `:has()` rules for our own containers.
- **Ads on thin pages are a policy problem, not just an aesthetic one.**
  *Guard:* `check-content-health.mjs` rules 2, 4 and 5 (250-word floor on
  indexable ad-bearing prose; unlaunched tools stay ad-free).

---

## 5. Extensionless canonicals need an nginx fallback

**Symptom.** Every tool article was a Search Console crawl error, while the
sitemap URL returned 200 the whole time.

**Cause.** Articles declare an extensionless `rel=canonical`, but
`location /tools/` had no `$uri.html` in its `try_files` chain the way the site
root did. All 19 articles told Google their authoritative URL was a 404.

A second, independent version of the same class: HoloPath's articles index
linked to `/articles/<slug>` — site-root absolute, left over from the
standalone holopath.art domain, resolving to the *global* articles hub where
none of them exist.

**Rule.** The canonical URL, the sitemap entry, and the links pointing at a
page must all be the same URL, and that URL must resolve.

**Guard.** `scripts/check-links.mjs` resolves every internal `href`,
`canonical`, `og:url` and sitemap entry against `dist/` using nginx's actual
`try_files` chains. It runs after the build in CI. **If `nginx/restless-forge.conf`
changes, update the resolver to match** — the point is that it agrees with
production, not that it is independently reasonable.

---

## 6. Generated-once metadata rots

**Symptom.** An essay's social card pointed at an image path that no longer
existed. The page itself looked perfect.

**Cause.** The essay shell's `<head>` was filled from front-matter at creation
and never revisited, so editing front-matter afterwards changed nothing.
Nothing renders `og:image` or the JSON-LD `image`, so neither the page nor a
review shows the rot.

**Rule.** Anything derived from a source of truth regenerates on every run,
inside `generated:*` markers, covered by CI's drift gate. Write-once
substitution is only acceptable for content a human then owns and edits.

**Guard.** `check-links.mjs` checks absolute `restless-forge.dev` image URLs,
not just `src`/`href`, so a rotted `og:image` fails the build.

---

## 7. Committed images carry EXIF

A phone photograph arrived tagged with the GPS coordinates of where it was
taken. Publishing it would have put a home address on the site, permanently —
once it ships it is scraped.

**Rule.** Strip metadata before committing. Re-saving through any image tool
without the EXIF block does it; resizing to the width limit usually does it for
free.

**Guard.** `check-content-health.mjs` rule 8 scans every committed image for an
EXIF block (JPEG APP1, PNG `eXIf`, WebP RIFF EXIF). It fails on the block's
presence rather than on GPS specifically — "this one only has DPI tags" is how
the habit erodes.

---

## What is not guarded

Responsive layout (#2) and layout stability (#3) have no automated check. Both
would need a real browser in CI — Playwright plus a browser download — which is
a large dependency for two rules.

Until that trade looks worthwhile, the manual step when touching layout CSS is:
**load a page at 360px wide and confirm the document does not scroll
horizontally.** Both defects above would have been caught by that one check.

```js
// what to assert, whatever tool you use
document.documentElement.scrollWidth === document.documentElement.clientWidth
```
