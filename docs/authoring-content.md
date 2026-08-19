# Authoring Content — the Markdown pipeline

Prose lives in **Markdown**, not in HTML. Page shells own the metadata,
chrome, and ad slots; the copy is written in a sibling `.md` file and
rendered into the page by `npm run sync-content` (checked-in output,
CI fails on drift). Never hand-edit a `generated:content` block.

## The convention

Any `X.md` next to `X.html` — or `index.md` next to `index.html` —
under `site/` or `tools/<name>/frontend/src/` is that page's content
source. The rendered HTML lands between markers in the shell:

```html
<!-- generated:content — do not edit; edit index.md and run `npm run sync-content` -->
…
<!-- /generated:content -->
```

Place the marker pair wherever the prose belongs (inside `<article>`,
`<main>`, `.article__body`, …). The script errors if a `.md` has no
sibling shell or the shell has no markers — nothing is guessed.

`README.md` files are ignored. The `tools/template/` copy of the
pattern renders only after `new-tool.sh` substitutes its placeholders.

## Writing rules

- Plain Markdown (GFM). Headings `#`/`##`, lists, links, `code`,
  `---` for a divider.
- **External links** (`http…`) automatically get
  `target="_blank" rel="noopener"` — write plain Markdown links.
- Raw inline HTML passes through untouched — use it for the rare
  styled block (`<div class="formula">…`, CTA buttons). If a block has
  a class, keep it as HTML; everything else should be Markdown.

### Markdown inside a styled block needs blank lines

This is the one rule that fails silently, so it is worth knowing before
you hit it. Markdown inside a raw HTML block is **not** processed:

```
<div class="reality">
**On scams:** open read-only access to your doc.
</div>
```

ships the literal asterisks to the page. No error, no warning.

Put a blank line after the opening tag and before the closing tag, and
everything between is ordinary Markdown again — including links, which
then pick up `target="_blank" rel="noopener"` for free:

```
<div class="reality">

**On scams:** see [r/BetaReaders](https://www.reddit.com/r/BetaReaders/).

</div>
```

Nesting works the same way; give every wrapper that contains prose its
own blank lines. A block with **no** prose (a grid of figures, say) needs
none, because there is no Markdown in it to render.

`check-content-health` rule 10 fails the build if a generated block ever
ships unrendered Markdown, so a lost blank line is caught rather than
published. Available components are documented in the "Essay components"
section of `site/styles.css`.

## Front-matter

Optional `---` block of `key: value` lines at the top:

```
---
title: Why I Build These Tools
description: One-sentence summary (also the index-card excerpt).
date: 2026-07-18
author: Ken
---
```

- `date`/`author` render a byline under the first heading.
- `title`/`description`/`date` are required on an essay, and drive its
  `generated:head` block plus the essays index cards.
- `image` (optional, essays) sets that essay's social card — `og:image`
  and the JSON-LD `Article.image`. A site-root path is expanded to an
  absolute URL. Without it the essay uses the site-wide `og-image.png`.
  Prefer ~1200×630; smaller sources render as a small share card.
- **Editing an essay's front-matter after publishing is safe** — the head
  regenerates on every `npm run sync-content`. It did not always: the head
  was filled in once at shell creation and never revisited, so an essay
  whose `image:` changed kept advertising the old path to every social
  scraper while the page itself looked perfect.

## `source:` — borrowing a body from a standalone page

Some pieces ship twice: a bare, self-contained HTML page for external
communities (no chrome, nothing linking back, so a moderator does not read
it as a funnel) and a normal essay wearing the site chrome. The text must
not live in both files.

Point the essay at the standalone page and everything between its `<main>`
tags becomes the essay body:

```
---
title: "Self-Publishing: Dreaming with Eyes Open"
description: …
date: 2026-08-17
author: Kenneth Cross
source: ../guides/self-publishing.html
---

Any Markdown here is appended after the borrowed content.
```

- The path is relative to the `.md`.
- Only `<main>` is taken. A hero, a sticky rail, a footer or a script
  outside it are excluded automatically — the essay has real site
  navigation and wants none of them.
- The `<h1>` comes from `title:`, not from the source's hero, so the
  heading, `<title>`, canonical and JSON-LD cannot disagree.
- **Markdown left in the body is appended.** That is where closing links
  belong (contact, a shop, a "there is a bare copy at …" pointer) — the
  things that must NOT appear in the copy posted externally.
- **Keep the `.md`.** Deleting it looks harmless because the page keeps
  working, but three systems key on "an essay is a `.md` in
  `site/essays/`": content injection, the essay-card generator, and
  `sync-static-html`'s sitemap and llms.txt lists. The last two fail
  silently — the essay simply stops being listed anywhere.
- Extraction refuses to guess: a missing file, zero `<main>`, more than
  one, or an empty one each fail the build by name.

After this, `npm run sync` plus the CI drift gate is the enforcement.
Editing the standalone page without syncing fails the build, so the two
copies cannot drift apart.

### Styling a page that ships twice

`site/guide-components.css` holds the styled blocks both versions need. The
standalone page links it **and** keeps its own full copy in an inline
`<style>`, so it still renders if the shared file never arrives.

Two rules keep that layering working — break either and the shared sheet
silently loses to the inline copy:

1. **Selectors are `main .thing`** (specificity 0,1,1) against the inline
   copy's bare `.thing` (0,1,0). The shared sheet therefore wins wherever
   it sits in the cascade, so link order does not matter. `main` matches
   both hosts: `<main class="page">` in the essay shell, `<main>` in the
   standalone page. Never scope these to `.page article` — that is 0,2,1
   and hands control back to the inline copy on the standalone page.
2. **Values are chained variable fallbacks**:
   `var(--border, var(--line, #33291d))` — the site's token if present,
   else the standalone page's own, else a literal. **Put the rarer token
   first.** `.numbers .lbl` originally read
   `var(--text-dim, var(--text-dimmer, …))`, and because the guide defines
   both, the label rendered a shade brighter than its own rule intended.

Adding a component: define it in `guide-components.css`, then mirror it
into the standalone page's inline `<style>` using that page's variable
names. Verify by loading the standalone page with the shared sheet blocked
and confirming nothing moves.
- Tool articles usually need no front-matter (their shells already
  carry the metadata, and their index pages are hand-curated).

## Adding a global essay (one file)

1. Write `site/essays/<slug>.md` with full front-matter, body starting
   with `# Title`.
2. `npm run sync-content` — the page shell is auto-created from
   `scripts/templates/essay-shell.html` (chrome, rail + bottom ad slots,
   favicons), its `generated:head` block is filled from the front-matter,
   and the essays index cards regenerate.
3. `npm run sync-static` (nav/footer for the new page, plus the essay's
   sitemap.xml and llms.txt entries) — or just `npm run sync`, which
   runs both.

## Adding a tool article

1. Copy an existing article shell in the tool's `articles/` directory
   (head metas + empty `generated:content` markers + ad slot), update
   its metas/canonical.
2. Write the sibling `.md`; run `npm run sync-content`.
3. Add the article to the tool's `articles/index.html` listing.
   (`site/sitemap.xml` picks it up automatically at `npm run sync` if
   the tool is live.)

## What is (and isn't) Markdown-backed

Migrated: global essays, all HoloPath articles, WIMTW's article,
TattooSafe's pricing page. The template's about page is Markdown-first,
so every new tool starts this way.

**Migrate on touch:** FAQ, about, and how-it-works pages of existing
tools, legal pages, and tool main-page UI copy stay as plain HTML until
the next time their content is meaningfully edited — convert them to
this pattern then, not before.
