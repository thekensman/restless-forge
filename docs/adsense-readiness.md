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
