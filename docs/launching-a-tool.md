# Launching a Tool — the canonical checklist

The single source of truth for taking a tool from **hidden-in-production**
to **live, indexed, and ad-ready**. Every launch follows these steps in
this order; other docs (`docs/seo-readiness.md`, the `site/tools-data.js`
header comment, `docs/adding-a-tool.md`) point here instead of carrying
their own copies.

A tool is "hidden" when: `status: "soon"` in `site/tools-data.js`, every
page carries `<meta name="robots" content="noindex">`, no AdSense loader
or units, and no sitemap entries. That's the state `scripts/new-tool.sh`
scaffolds and the state every unlaunched tool must stay in.

## 0. Prerequisites (before any launch mechanics)

- [ ] The tool is field-tested and verified by a human on desktop **and**
      mobile (real phone, not just devtools emulation).
- [ ] Real-content pass done: main page has genuine crawlable copy (not
      scaffold text), sub-pages (about/FAQ/etc.) have real content, and
      the page doesn't consist almost entirely of interactive UI. Prose
      is authored per `docs/authoring-content.md` (Markdown-backed
      pages; run `npm run sync-content` after editing).
- [ ] `<title>` and meta description describe what the tool **actually
      ships**, not planned features (see `docs/seo-readiness.md`).
- [ ] Tests green (`npm test --prefix tools/<id>/frontend`) and the tool
      builds (`./build.sh`).
- [ ] Any tool-specific safety/accuracy gate is cleared (e.g. PetDose
      stays hidden until veterinary review, regardless of content).
- [ ] **No per-tool legal or contact pages.** `/privacy`, `/terms` and
      `/contact` are site-global and every tool's footer already links
      them via `rfGlobalFooterLinks`. Delete any `src/{privacy,terms,contact}/`
      the tool inherited from an older scaffold. **Exception:** a
      `tier: 'cloud'` tool keeps its own `privacy/` page describing its
      server-side data flow (see CLAUDE.md).
- [ ] **Every ad-bearing prose sub-page clears ~250 visible words.**
      Thin pages carrying ads are what "low value content" means to an
      AdSense reviewer; the site was rejected once for exactly this.
      Main tool pages are exempt — a calculator's value is the tool, not
      the prose.
- [ ] **`npm run check-content` passes.** It enforces the two rules above
      plus "live tools carry no stray noindex" and "unlaunched tools stay
      noindexed and ad-free". CI runs it; run it locally first.
- [ ] **Decide whether this tool warrants articles — it is a judgment
      call, not a quota.** Articles earn their place when the tool has
      real domain depth worth explaining (SandPath's coordinate formats,
      WIMTW's tax arithmetic). Simple file-operation tools and
      single-purpose calculators legitimately need none. If you do write
      them, ground each one in the tool's actual engine code rather than
      generic topic research — a handful of specific articles beats a
      library of interchangeable ones, and bulk-produced content is what
      Google's scaled-content-abuse policy targets.

## 1. Directory listing

- [ ] In `site/tools-data.js`: flip `status: "soon"` → `"live"` and
      confirm `label`, `category`, `cta`, and `desc` read well — the
      landing page and `/tools/` directory cards render from this entry
      automatically.
- [ ] Add a `blurb` to the entry: a short lowercase noun phrase
      ("a real hourly wage calculator and ..."). It renders into the
      tool lists on `/about` and `/terms` and the FAQ's "What is
      Restless Forge?" answer (visible + JSON-LD) at sync time.

## 2. Indexing

- [ ] Remove `<meta name="robots" content="noindex">` from **every** HTML
      page under `tools/<id>/frontend/src/`:

      ```bash
      grep -rl 'content="noindex"' tools/<id>/frontend/src --include='*.html'
      # then delete the line in each file
      ```

## 3. Ads

- [ ] Add the AdSense loader to `<head>` of every page, **after**
      `<script src="/shared.js"></script>` (it reads `rfAdsenseClientId`
      from there — the publisher ID is single-sourced in `site/shared.js`,
      never hard-coded per page):

      ```html
      <script>(function(){var s=document.createElement('script');s.async=true;s.crossOrigin='anonymous';s.src='https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client='+window.rfAdsenseClientId;document.head.appendChild(s);})();</script>
      ```

      The loader and the `<ins>` slot must **both** be present on a page.
      A slot without the loader pushes to a queue nothing consumes, so ads
      silently never render — this was a real bug on TattooSafe's
      sub-pages. `npm run check-content` does not catch it; grep for
      `adsbygoogle` and `rfAdsenseClientId` and confirm they agree.

- [ ] Add the bottom ad unit before the footer placeholder on the main
      page and each content sub-page (the pattern every live tool uses —
      reference: holopath):

      ```html
      <aside class="ad-slot ad-slot--bottom" aria-label="Advertisement">
        <ins class="adsbygoogle" style="display:block"
             data-ad-client="ca-pub-5516736042033534"
             data-ad-slot="7057676288"
             data-ad-format="auto"
             data-full-width-responsive="true"></ins>
        <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
      </aside>
      ```

- [ ] Add the `.ad-slot--bottom` CSS block to the tool's `src/styles.css`
      and `public/pages.css` (copy from a live tool) if not present.
- [ ] Do NOT place ads so they could be confused with tool controls or
      download buttons, and never inside the working area of the tool.
- [ ] `ads.txt` is site-global — nothing to do per tool.

## 4. Regenerate everything else (one command)

- [ ] Run `npm run sync` and commit the regenerated output (CI fails
      on drift). This single step now covers what used to be manual:
      - the crawlable static grids on the homepage and `/tools/`
      - **`site/sitemap.xml`** — the tool's main URL plus every content
        sub-page found in its `src/` (per-tool privacy/terms/contact
        and any page still carrying `noindex` are excluded
        automatically)
      - **`/llms.txt`**, the AI-assistant index
      - the live-tool lists on `/about` and `/terms`, and the FAQ's
        "What is Restless Forge?" answer (visible + JSON-LD), all
        rendered from the entry's `blurb`
- [ ] Skim the diff on `about.html` / `terms.html` / `faq.html` /
      `sitemap.xml` — the generated copy should read well, not just
      exist. (`/contact` points at the single monorepo issues page and
      needs no per-tool edit.)

## 5. Verify

- [ ] `npm test` (all suites) and `./build.sh` — green.
- [ ] Merge → deploy runs automatically. Then on the live site:
  - [ ] `curl -s https://restless-forge.dev/tools/<id>/ | grep -c noindex` → 0
  - [ ] Page loads, directory card appears on `/` and `/tools/`
  - [ ] Ad unit renders (or at least the `<ins>` markup is present)
  - [ ] `https://restless-forge.dev/sitemap.xml` includes the new URLs
- [ ] Optionally request indexing in Google Search Console.

## De-launching (rollback)

Reverse order: flip status back to `"soon"`, re-add `noindex` to every
page, remove the loader + ad units, then `npm run sync` — the sitemap,
grids, llms.txt, and the about/terms/FAQ copy all drop the tool
automatically.
