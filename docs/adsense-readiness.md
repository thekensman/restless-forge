# AdSense readiness audit, October 2026

An audit of Restless Forge for a second AdSense application. The first was
rejected on 2026-08-16 for "Low value content". This report is meant to be
compared with an independent audit, so every finding has an ID, a label, and
the evidence behind it.

## Scope and method

- **What was audited.** The deployed source: `main` at f1a3dde, which the
  2026-09-30 deploy verified in production (sitemap sweep, legacy-URL sweep).
  The live site could not be fetched from the audit sandbox (DNS and proxy
  block restless-forge.dev), so nothing here is a screenshot of production.
  Nothing has merged to `main` since that deploy.
- **What changed since the rejection.** One essay (self-publishing, 2026-08-18),
  wording tweaks, ad slots that collapse when unfilled, the 2026-09-29 URL
  cleanup, one author identity, and contextual links from the tool pages. The
  reviewer in August saw essentially this content.
- **Depth.** "Read" means the full text was read. "Skim" means the opening,
  structure, and an automated scan (word count, byline, date, structured data,
  outbound citations, unsupported-claim phrases, placeholder text).
- **Labels.** Confirmed: seen in the source or the data. Likely: the best
  explanation of the evidence. Possible: plausible, weakly supported. Not
  established: no evidence either way.

## Summary

**Not ready.** Resubmitting the site as it stands has, in my judgment, about a
one in five chance. That is an estimate, not a measurement.

The most likely cause of the rejection is HoloPath's 15 articles (F1). They are
the largest group of articles on the site, and they read as content written to
rank: no byline, date, structured data or citation; six topics with no
connection to what the tool does; one title that promises products and names
none; unsupported claims; and two articles that contradict the tool. Everywhere
else the site is strong. The What Is My Time Worth, SandPath and TattooSafe
articles are built from each tool's engine, carry specific numbers, and are
bylined and dated. The four essays are first person and original.

Google Search tells the same story from the outside: 4 of 58 sitemap URLs
indexed, unchanged since August. That is not an AdSense rule, but it is the same
company assessing the same pages.

With the five changes below deployed and recrawled, I would put the odds at
about even or somewhat better. AdSense review is discretionary; no audit can
promise approval.

## Findings

| ID | Finding | Evidence | Label | Severity |
|---|---|---|---|---|
| F1 | HoloPath's 15 articles read as made-for-search content. | None has a byline, date, structured data or outbound citation (every other tool's articles have the first three). Openings like "Few technologies have captured the human imagination quite like holograms". Six topics have no tie to the tool: history, pop culture, future of displays, business uses, colour theory, best projectors. | Defects Confirmed; cause of the rejection Likely | P1 |
| F2 | Unsupported claims. | `hologram-displays-for-business`: "Studies of in-store digital signage consistently find…", "Escape room operators have found that holographic 'guides' … dramatically increase player immersion ratings". No sources. | Confirmed | P1 |
| F3 | A title promise is unmet. | `best-hologram-projectors` is titled "Best Hologram Projectors for Home Use in 2026", names no product, and its tiers run to $600+ museum installations. | Confirmed | P1 |
| F4 | Articles contradict the tool. | The tool exports MP4/WebM (`video-encoder.ts`) and has a circular LED-fan layout (`layout.ts`, `composeFan`). `gif-vs-video-hologram` says to convert the GIF to MP4 "using any standard video tool"; `best-hologram-projectors` says the square export works for fans "after circular cropping". | Confirmed | P1 |
| F5 | Site copy the site does not back up. | `/` and `/essays/` cite articles on "what an applicant tracking system actually measures" and "where invoice rounding goes wrong"; both exist only under unlaunched, noindex tools (`forgeresume`, `forgeinvoice`). `/articles/` says HoloPath has "sixteen articles" (15 exist) and "Nothing here is a summary of what other sites already say", which F1 contradicts. | Confirmed | P1 |
| F6 | HoloPath FAQ overstates video support. | "Videos can be of any length." `media-parser.ts` caps video at 900 frames (90 s at 10 fps) and spreads them across longer clips, so a 3-minute video plays back at double speed. | Confirmed | P2 |
| F7 | Little first-hand experience in tool articles. | First-person passages and photos of real output appear only in the essays. The HoloPath origin (a Magna-Tiles hologram projector built for a STEM project) is on Substack, not on the site. | Possible | P2 |
| F8 | Google indexes 4 of 58 sitemap URLs. | Search Console, 2026-10-08: the homepage and the three tools that inherited 301s from old domains. Unchanged since August. | Fact Confirmed; relevance Likely | Context |
| F9 | Nav, footer and the AdSense loader exist only after JavaScript runs. | Since 6d9d1f7 (2026-07-22) the chrome renders from `/shared.js`; the loader is inserted from `window.rfAdsenseClientId`. No page's HTML contains a `ca-pub` ID. Verification succeeded in August regardless, and Google renders JavaScript. Kept by owner decision and covered by browser tests instead. | Fact Confirmed; risk Possible | P3 |
| F10 | Unsourced statistic in a FAQ. | What Is My Time Worth FAQ: "Most people discover it's 30–50% lower than their advertised rate." The same claim is in the page's FAQPage markup. | Confirmed | P3 |
| F11 | Tools on real devices. | Not tested in this audit; browser smoke tests follow. | Not established | P0 if broken |
| F12 | Privacy policy describes an unlisted tool. | `/privacy` explains Rise & Rhyme's data flow and links its privacy page, while saying cloud tools carry a badge "in the tool directory", where Rise & Rhyme does not appear. The tool is deployed (noindex), so the disclosure must stay while anyone can reach it. | Confirmed | P3 |

## Page by page

Severity and action refer to the findings above. Confidence: High when read in
full, Medium when skimmed.

### Site pages

| URL | Role | Strengths | Deficiencies | Severity | Action | Confidence |
|---|---|---|---|---|---|---|
| `/` | Homepage | States the purpose and the one-person workshop; links essays and tools in static HTML. | F5: promises articles from unlaunched tools. | P1 | Minor improvement | High |
| `/tools/` | Tool directory | Explains each category; static grid of the four live tools. | None material. | | Keep | Medium |
| `/essays/` | Essays index | Separates essays from tool articles. | F5: same unlaunched-tool examples. | P1 | Minor improvement | High |
| `/articles/` | Articles hub | Groups articles by tool with one-line descriptions. | F5: wrong count; standard contradicted by F1; HoloPath linked only as a block. | P1 | Minor improvement | High |
| `/about` | Publisher identity | Names Kenneth Cross; explains the ads-only funding model; ProfilePage markup. | None material. | | Keep | High |
| `/contact` | Contact | Working address, response expectations. | None. | | Keep | Medium |
| `/privacy` | Privacy policy | Every AdSense disclosure: vendor cookies, opt-outs, Google's partner-sites page, EEA consent. | Says consent goes through Google's certified CMP; that depends on AdSense account settings (unknown). F12. | P3 | Keep; confirm CMP | High |
| `/terms` | Terms | Plain, covers the tools. | "Last updated: March 2026" predates the August legal consolidation. | P3 | Keep | Medium |
| `/faq` | Site FAQ | FAQPage markup; tool answer generated from the tool directory. | None. | | Keep | Medium |

### Essays

| URL | Role | Strengths | Deficiencies | Severity | Action | Confidence |
|---|---|---|---|---|---|---|
| `/essays/a-floor-of-curiosity` | Origin essay | First person, family detail, minesweeper.org history. The strongest experience signal on the site. | None. | | Keep | High |
| `/essays/why-i-build-these-tools` | Economics essay | First person; explains how free tools stay funded. | None. | | Keep | Medium |
| `/essays/how-a-tool-gets-built` | Technical tour | Concrete process from idea to shipped tool. | None. | | Keep | Medium |
| `/essays/self-publishing-dreaming-with-eyes-open` | Long essay | 2,290 words, ten outbound sources, first person. | Same body as the noindex `/guides/` copy (acceptable while that copy stays noindex). | | Keep | Medium |

### What Is My Time Worth

| URL | Role | Strengths | Deficiencies | Severity | Action | Confidence |
|---|---|---|---|---|---|---|
| `/tools/what-is-my-time-worth/` | Tool | Indexed; about 1,000 words of static explanation; WebApplication markup. | Prose reads machine-written (64 em dashes per 1,000 words); not a policy issue. | P3 | Keep | Medium |
| `…/about/` | About | Explains the three calculation stages. | None. | | Keep | Medium |
| `…/faq/` | FAQ | Answers the real questions. | F10. | P3 | Minor improvement | Medium |
| `…/articles/` | Articles index | Frames each article's question. | None. | | Keep | Medium |
| `…/articles/what-your-real-hourly-wage-subtracts/` | Article | Walks every subtraction the calculator makes; corrects the 2,080-hour shortcut; bylined and dated. | None. | | Keep | High |
| `…/articles/comparing-job-offers-across-states/` | Article | Worked example of a raise that is a pay cut. | None. | | Keep | Medium |
| `…/articles/the-enjoyment-multiplier/` | Article | States the model's fudge factor openly. | None. | | Keep | Medium |
| `…/articles/life-energy-and-ymoyl/` | Article | First person; grounded in the book the tool rests on. | None. | | Keep | Medium |

### HoloPath

| URL | Role | Strengths | Deficiencies | Severity | Action | Confidence |
|---|---|---|---|---|---|---|
| `/tools/holopath/` | Tool | Indexed; states inputs, limits (15 MB, 10 fps, 900 frames) and the five layouts in static HTML. | None material. | | Keep | High |
| `…/about/` | About | Explains why the tool exists. | F7: no first-hand origin (the Magna-Tiles project). | P2 | Minor improvement | Medium |
| `…/faq/` | FAQ | Covers formats, privacy, displays. | F6. | P2 | Minor improvement | Medium |
| `…/how-it-works/` | Method | Walks the pipeline step by step. | Check against `hologram.ts` when articles change. | | Keep | Medium |
| `…/articles/` | Articles index | Lists all 15. | Lists the six generic articles (F1). | P1 | Update after pruning | Medium |
| `…/articles/best-hologram-projectors` | Article | Sensible tiering by budget. | F3, F4; repeats the fan, pyramid and Pepper's Ghost articles. | P1 | Remove | High |
| `…/articles/history-of-holograms` | Article | Accurate overview. | F1: encyclopedic, no tie to the tool. | P1 | Remove | Medium |
| `…/articles/holograms-in-pop-culture` | Article | Some analysis of the Star Wars look the tool imitates. | F1: culture survey, no tie to the tool. | P1 | Remove | Medium |
| `…/articles/future-of-holographic-displays` | Article | Names real companies and approaches. | F1: research survey, no tie to the tool. | P1 | Remove | Medium |
| `…/articles/hologram-displays-for-business` | Article | Plausible use cases. | F1, F2. | P1 | Remove | High |
| `…/articles/colour-theory-holographic-art` | Article | Connects to the hue presets. | F1: generic colour symbolism; the useful part belongs in the effects article. | P1 | Remove | Medium |
| `…/articles/creating-hologram-art` | Article | Tool-specific walkthrough. | Overlaps `optimizing-hologram-output`. | P2 | Merge | Medium |
| `…/articles/optimizing-hologram-output` | Article | Tool-specific tips. | Overlaps `creating-hologram-art`. | P2 | Merge | Medium |
| `…/articles/gif-vs-video-hologram` | Article | Accurate on palettes, LZW and codecs; useful per-use advice. | F4; general knowledge with no HoloPath specifics. | P1 | Substantive rewrite | High |
| `…/articles/hologram-effects-explained` | Article | Explains each effect the tool applies. | No byline, date or markup. | P2 | Minor improvement | Medium |
| `…/articles/best-images-for-holograms` | Article | Source-selection advice tied to how the effects behave. | No byline, date or markup. | P2 | Minor improvement | Medium |
| `…/articles/how-hologram-pyramids-work` | Article | Optics of the pyramid; matches the 360° and 270° layouts. | No byline, date or markup. | P2 | Minor improvement | Medium |
| `…/articles/diy-hologram-pyramid` | Article | Build guide. | Overlaps the pyramid article; no byline, date or markup. | P2 | Minor improvement | Medium |
| `…/articles/led-hologram-fans` | Article | Persistence-of-vision explanation; matches the fan layout. | Unsourced specifications; no byline, date or markup. | P2 | Minor improvement | Medium |
| `…/articles/peppers-ghost-illusion` | Article | History and optics; matches the Pepper's Ghost layout. | No byline, date or markup. | P2 | Minor improvement | Medium |

### SandPath

| URL | Role | Strengths | Deficiencies | Severity | Action | Confidence |
|---|---|---|---|---|---|---|
| `/tools/sandpath/` | Tool | Indexed; explains formats and modes. | None. | | Keep | Medium |
| `…/about/` | About | States what the tool will never do. | None. | | Keep | Medium |
| `…/faq/` | FAQ | Answers formats, privacy, quality, travel lines. | None. | | Keep | Medium |
| `…/getting-started/` | Guide | How tables draw; first-pattern advice. | None. | | Keep | Medium |
| `…/how-it-works/` | Method | Vector-first conversion, three modes, path ordering. | None. | | Keep | Medium |
| `…/supported-tables/` | Reference | Bed sizes in millimetres and formats per table. | None. | | Keep | Medium |
| `…/articles/` | Articles index | Frames the questions the articles answer. | None. | | Keep | Medium |
| `…/articles/why-scanlines-look-wrong-in-sand/` | Article | The best article on the site: physical constraints with numbers, the algorithms the tool uses, failure modes. | None. | | Keep | High |
| `…/articles/theta-rho-vs-gcode/` | Article | Explains why the two formats disagree. | None. | | Keep | Medium |
| `…/articles/travel-lines-and-path-ordering/` | Article | Travelling-salesman framing of a real constraint. | None. | | Keep | Medium |

### TattooSafe

| URL | Role | Strengths | Deficiencies | Severity | Action | Confidence |
|---|---|---|---|---|---|---|
| `/tools/tattoosafe/` | Tool | Clear purpose; states that the preview is a static overlay, not body tracking. | Not indexed despite comparable text (F8). | | Keep; smoke-test camera flow | Medium |
| `…/about/` | About | Names the two questions the tool answers. | None. | | Keep | Medium |
| `…/faq/` | FAQ | Explains how the overlay works and its limits. | None. | | Keep | Medium |
| `…/pricing/` | Calculator | Explains how quotes are built from time. | None. | | Keep | Medium |
| `…/articles/` | Articles index | Frames both questions. | None. | | Keep | Medium |
| `…/articles/how-tattoo-studios-price-work/` | Article | Minutes-per-square-inch table, placement multipliers, the order of calculation. | None. | | Keep | High |
| `…/articles/sizing-a-tattoo-to-a-body-part/` | Article | Why screens mislead about size. | None. | | Keep | Medium |

## Technical checks

| Check | Result | Evidence |
|---|---|---|
| Canonicals, one URL per page, sitemap | Pass | `check-urls` in CI against the real vhost; the 2026-09-30 production sweep. |
| `noindex` | Only `/guides/…`, `/sites-i-like` and the 24 unlaunched tools | Source scan. |
| Unlaunched tools | Noindex, no ad code, linked from one live page | ForgeDoc head checked; link scan of live pages. The one link is `/privacy` to Rise & Rhyme's privacy page (F12). |
| ads.txt | Pass | `build.sh` substitutes `RF_ADSENSE_PUB` and fails the build if the placeholder survives. |
| AdSense loader | Present on every live page, inserted at runtime | F9. |
| Privacy disclosures | Pass | `/privacy` advertising section. |
| Live-site fetch | Not possible from the audit sandbox | DNS and proxy. |

## Top five changes

1. **HoloPath articles (F1 to F4).** Remove the six generic articles; they return
   404 under the policy in `docs/indexing.md`. Merge the two overlapping
   walkthroughs, with the retired URL 301ing to the survivor. Rework the rest
   against the engine (`hologram.ts`, `gif-encoder.ts`, `layout.ts`,
   `video-encoder.ts`, `media-parser.ts`): fix the contradictions, cut unsupported
   claims, add byline, date and BlogPosting markup. Add engine-grounded articles,
   and the Magna-Tiles origin piece once its photos are in hand.
2. **Site copy (F5, F6, F10).** Make `/`, `/essays/`, `/articles/` and the two FAQs
   say only what the site backs up.
3. **Tool smoke tests (F11).** Every live tool on a phone-sized and a desktop
   viewport: load, sample input, output, download, no console errors, no sideways
   scroll.
4. **Runtime chrome, tested (F9).** Keep the runtime nav, footer and loader. Browser
   tests confirm the About, Contact, Privacy and Terms links render and the
   loader is inserted with the right client ID on every page type.
5. **Resubmit only after a recrawl.** Deploy, request indexing for the changed
   pages, wait until URL Inspection shows the homepage and the HoloPath articles
   index fetched after the deploy, confirm the AdSense consent message and
   Policy center, then resubmit.

## Hypotheses

| Hypothesis | Confidence | Why |
|---|---|---|
| The HoloPath articles drove the rejection. | Likely | Largest content group, every generic-content signal at once, and the rest of the site is consistently stronger. |
| Search indexing and AdSense review reflect the same quality judgment. | Likely | Same company, same pages; the pages Google indexed are the ones with outside history. |
| Machine-written style across tool pages adds to a generic impression. | Possible | Em-dash density and stock phrasing outside the essays; Google still indexed three of those tool pages. |
| Thin first-hand experience hurts. | Possible | Experience shows only in the essays. |
| Runtime chrome or the runtime loader affected the review. | Not established | August produced a content verdict, so the code was found and the site was reviewed. |
| The rejection date matters. | Not established | Googlebot fetched three of the site's pages on the evening of 2026-08-16; coincidence or the review crawl, unknown. |

## Unknowns

- Which pages the August reviewer looked at.
- AdSense account state: site status, Policy center, and whether the EEA
  consent message (Privacy & messaging) is published.
- Whether AdSense review draws on Search indexing signals.
- Tool behaviour on real phones, especially camera permissions for TattooSafe on
  iOS Safari.

## Files likely to change

- `tools/holopath/frontend/src/articles/` (removals, merge, rewrites, new articles)
  and its `index.html`
- `tools/holopath/frontend/src/faq/index.html`, `…/about/index.html`
- `site/index.html`, `site/essays/index.md`, `site/articles/index.html`
- `tools/what-is-my-time-worth/frontend/src/faq/index.html`
- `nginx/restless-forge.conf` (legacy map for removed and merged slugs),
  `scripts/check-urls.mjs`, `.github/workflows/deploy.yml`, `docs/indexing.md`
- `CLAUDE.md` (the runtime chrome note)

## Follow-up, 2026-10-14

What changed on `claude/rf-hav-discovery-improvements-er83dr` after the audit
above, and what testing and a claim-by-claim check of every live tool page
against its code turned up. The original findings above are left as written.

### Status of the original findings

| ID | Status | Commits |
|---|---|---|
| F1 | Fixed. Six generic articles removed (they 404), two walkthroughs merged (a 301), the other eight rewritten against the engine with byline, date and BlogPosting markup, and one new article on GIF banding. | 986a1fd, 3793e43 |
| F2 | Fixed: the article carrying them was removed. | 986a1fd |
| F3 | Fixed: removed. | 986a1fd |
| F4 | Fixed in the articles. The HoloPath FAQ had the same contradiction ("Why is the output a GIF and not a video?") and is fixed too. | 3793e43, 9d4f0aa |
| F5 | Fixed: the homepage and essays index in one commit, `/articles/` with the HoloPath rework. | f42e06f, 3793e43 |
| F6 | Fixed. | f42e06f |
| F7 | Fixed by link, not by copy. The origin story already lives on Substack ("Hologram STEM", 2026-03-06, with the build photos), and republishing it would put the same text on two sites. The HoloPath About page now tells it first-hand in one paragraph, under the author's name, and links the post; the DIY pyramid article already linked it. | |
| F8 | Context. Recheck after the recrawl. | |
| F9 | Kept by owner decision; the browser checks below pass. | |
| F10 | Fixed in the FAQ, and in the life-energy article, which repeated it. | f42e06f, 0e1a36b |
| F11 | Confirmed working in a browser; see below. Real phones not tested. | |
| F12 | Fixed. | f42e06f |

### Browser checks (F11)

Playwright with Chromium against the built `dist/`, served statically, at the
branch head on 2026-10-14. 53 of 53 passed.

- **Chrome on seven page types** (site page, essay, tool page, HoloPath
  article, SandPath sub-page, What Is My Time Worth article, TattooSafe page):
  - header and footer render, with links to About, Contact, Privacy and Terms;
  - the AdSense loader is inserted with `ca-pub-5516736042033534`.
- **No sideways scroll at 360 px** on 36 pages: every index, every tool page,
  every edited article and every FAQ. Two failed on the first run, both from
  code blocks, and were fixed (F22).
- **Each tool at 390 px and 1280 px:**
  - HoloPath generates a GIF;
  - SandPath converts;
  - TattooSafe prices a design ($110 to $211) and shows a plain message when
    the camera is unavailable;
  - What Is My Time Worth computes a real wage.
- **Two targeted checks:**
  - What Is My Time Worth with California selected computes, and its tax
    tooltips carry the 2026 year and the $184,500 wage base;
  - SandPath converts the full sand-art photo (806 paths) with no error.

Not covered: real phones, and camera permissions on iOS Safari.

### New findings

| ID | Finding | Label | Status |
|---|---|---|---|
| F13 | HoloPath's GIF palette went mostly on duplicate black. The default test kept 118 distinct colours of 256, and Pepper's Ghost 36, so glows banded. | Confirmed | Fixed: 235 and 196 (cfdf242) |
| F14 | HoloPath's reflective layouts weren't mirrored, so text read backwards in the reflection. Pyramid copies cut notches into each other, and the how-it-works page described several effects wrongly. | Confirmed | Fixed (15d4445, 3793e43) |
| F15 | SandPath's default trace mode, Outline, lost most of every image. A ring came back as one speck, drawn as a triangle on the table, and a star made Convert fail. Centerline returned no paths at all for line drawings. | Confirmed | Fixed, with tests that fail if any part is reverted (7caa608) |
| F16 | SandPath's Convert crashed ("Maximum call stack size exceeded") at the app's own maximum-detail settings on every test photo. | Confirmed | Fixed (7caa608) |
| F17 | Five statements in SandPath's guides described behaviour the tool doesn't have, among them a preview that shows travel moves. TIFF was listed as supported, but only Safari can open it. | Confirmed | Fixed, with clearer error messages (f4e5782) |
| F18 | What Is My Time Worth had stale tax-year copy ("2024/2025", and the 2025 wage base in a tooltip), false claims in the job-offers article, two unsourced statistics, and a privacy answer that denied the site has a backend. State tax is one flat bracket rate per state, which overstates it where a state taxes in brackets: California, single, $105,000 gives $9,765 against about $5,520. | Confirmed | Copy fixed and tooltips built from the tax data (0e1a36b). Brackets planned in `docs/state-income-tax-brackets.md` (d4d8e19). |
| F19 | TattooSafe's pricing page says it documents the estimator exactly but missed three of its rules. The About page and sizing article described a silhouette that changes with height, which it doesn't, and the sizing article opened with an unsupported statistic about tattoo regret. | Confirmed | Fixed (1dafbbd) |
| F20 | All four tool home pages carried FAQ markup for questions they don't show, and the FAQ pages' markup had drifted from their visible answers. | Confirmed | Fixed; `check-links` now fails on any mismatch (9d4f0aa) |
| F21 | The site says "open source" in about ten places, and the Terms say the code is on GitHub "under their respective licenses", but the repository has no LICENSE file. | Confirmed | Fixed: `LICENSE.md` puts the code under MIT and keeps the written content, images and branding all rights reserved. The Terms and the global FAQ (visible answer and JSON-LD) now say so. |
| F22 | Code blocks made two pages scroll sideways at 360 px. | Confirmed | Fixed (ecbd2b1) |

### Odds, revisited

Unchanged: about even or somewhat better once the work is deployed and
recrawled. The fixes since the first estimate remove defects a reviewer could
meet directly: a default mode that produced nothing usable, FAQ answers that
contradicted their tools, and markup describing content that isn't on the page.
They leave the estimate's main uncertainty where it was: how Google judges a
small site with little outside history (F8).

### Follow-ups, not in this PR

- State income tax brackets: `docs/state-income-tax-brackets.md`.
- SandPath: a tracer that follows one-pixel lines instead of tracing around
  them, since each traced line is drawn out and back today; and a preview that
  shows travel moves.
- What Is My Time Worth: local income taxes and credits stay outside the model.
- PlotPath (unlaunched) spreads points into `Math.min(...)` the way SandPath
  did. Fix it before launch.
