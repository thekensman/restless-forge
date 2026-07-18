# SEO Readiness — Pending Tools

Audit of the 17 unlaunched tools (2026-07). Re-run the checks before each
launch; the goal is that launching a tool is *only* the three steps in
`site/tools-data.js` (flip status, remove noindex, sitemap).

## What was already in place (verified on every pending tool)

- `<title>` and meta description on the main page
- Canonical URL pointing at the correct `/tools/<id>/` slug
- `og:title`, `og:description`, absolute `og:image`
- JSON-LD structured data
- `lang` attribute, viewport meta, full favicon/manifest block

## Gaps found and fixed in this pass

| Gap | Affected | Fix |
|---|---|---|
| No brand assets (favicon/og-image/webmanifest) | all 17 | Generated per-tool line-art favicon.svg (in each tool's accent color), multi-size favicon.ico, apple-touch-icon.png, 1200×630 og-image.png, site.webmanifest |
| No `og:url` / `twitter:card` / `twitter:image` | 6 finance tools | Added after the og:image meta |
| No `<h1>` (page started at `<h2>`) | 11 maker tools | First heading promoted to `<h1>`; `.tool-intro` CSS selector updated |
| **No `noindex` while deployed-but-unlisted** | all 17 + template | Added `<meta name="robots" content="noindex">` to all 74 pages. Unfinished tools are built and served in production; without this, crawlers index thin/stub content, which drags sitewide quality signals (and AdSense review) down. **Remove at launch.** |

## Remaining gaps to close at (or before) each launch

These need real content, not mechanics — flagged per tool:

1. **Finance six** (`is-my-raise-real`, `subscription-audit`,
   `repair-or-replace`, `am-i-actually-saving`, `pet-cost`,
   `side-hustle-reality`): single-page apps with **no sub-pages**
   (about/FAQ/methodology). Thin for launch; each needs at least a
   methodology/FAQ page — the maker tools' 5-sub-page structure is the
   template to copy.
2. **Maker eleven**: have the 5-page structure, but sub-page copy is
   scaffold-grade; needs a real-content pass per tool before launch.
3. **PetDose**: keep noindex until the dosing data passes professional
   veterinary review (independent of content readiness).
4. **Meta descriptions**: re-read at launch — several describe planned
   features rather than what the tool actually does.

## Launch checklist

Moved: the canonical launch procedure (directory, noindex, ads, sitemap,
static-HTML regen, copy consistency, verification) lives in
**`docs/launching-a-tool.md`** — follow it there; don't duplicate it here.
