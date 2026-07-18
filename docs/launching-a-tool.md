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
      the page doesn't consist almost entirely of interactive UI.
- [ ] `<title>` and meta description describe what the tool **actually
      ships**, not planned features (see `docs/seo-readiness.md`).
- [ ] Tests green (`npm test --prefix tools/<id>/frontend`) and the tool
      builds (`./build.sh`).
- [ ] Any tool-specific safety/accuracy gate is cleared (e.g. PetDose
      stays hidden until veterinary review, regardless of content).

## 1. Directory listing

- [ ] In `site/tools-data.js`: flip `status: "soon"` → `"live"` and
      confirm `label`, `category`, `cta`, and `desc` read well — the
      landing page and `/tools/` directory cards render from this entry
      automatically.

## 2. Indexing

- [ ] Remove `<meta name="robots" content="noindex">` from **every** HTML
      page under `tools/<id>/frontend/src/`:

      ```bash
      grep -rl 'content="noindex"' tools/<id>/frontend/src --include='*.html'
      # then delete the line in each file
      ```

## 3. Ads

- [ ] Add the AdSense loader to `<head>` of every page:

      ```html
      <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-5516736042033534" crossorigin="anonymous"></script>
      ```

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

## 4. Sitemap

- [ ] Add the tool's main URL and its **content** sub-pages (about, FAQ,
      how-it-works, pricing, articles) to `site/sitemap.xml`. Skip
      boilerplate legal duplicates (per-tool privacy/terms/contact).

## 5. Regenerate static HTML

- [ ] Run `node scripts/sync-static-html.mjs` so the crawlable static
      grids on the homepage and `/tools/` include the new tool. Commit
      the regenerated blocks (CI fails on drift).

## 6. Copy consistency

These global pages enumerate the live tools and must be updated (keep
this list short — if a page doesn't need to enumerate tools, don't make
it):

- [ ] `site/about.html` — "The Tools" list
- [ ] `site/contact.html` — per-tool GitHub issues list
- [ ] `site/terms.html` — services list
- [ ] `site/faq.html` — "What is Restless Forge?" answer

## 7. Verify

- [ ] `npm test` (all suites) and `./build.sh` — green.
- [ ] Merge → deploy runs automatically. Then on the live site:
  - [ ] `curl -s https://restless-forge.dev/tools/<id>/ | grep -c noindex` → 0
  - [ ] Page loads, directory card appears on `/` and `/tools/`
  - [ ] Ad unit renders (or at least the `<ins>` markup is present)
  - [ ] `https://restless-forge.dev/sitemap.xml` includes the new URLs
- [ ] Optionally request indexing in Google Search Console.

## De-launching (rollback)

Reverse order: remove sitemap entries, flip status back to `"soon"`,
re-add `noindex` to every page, remove the loader + ad units, re-run
`scripts/sync-static-html.mjs`.
