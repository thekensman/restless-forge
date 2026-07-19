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
- `title`/`description`/`date` drive essay-shell creation and the
  essays index cards.
- Tool articles usually need no front-matter (their shells already
  carry the metadata, and their index pages are hand-curated).

## Adding a global essay (one file)

1. Write `site/essays/<slug>.md` with full front-matter, body starting
   with `# Title`.
2. `npm run sync-content` — the page shell is auto-created from
   `scripts/templates/essay-shell.html` (metas, OG, Article JSON-LD
   filled from front-matter) and the essays index cards regenerate.
3. Add `/essays/<slug>` to `site/sitemap.xml`.
4. `npm run sync-static` (nav/footer for the new page) — or just
   `npm run sync`, which runs both.

## Adding a tool article

1. Copy an existing article shell in the tool's `articles/` directory
   (head metas + empty `generated:content` markers + ad slot), update
   its metas/canonical.
2. Write the sibling `.md`; run `npm run sync-content`.
3. Add the article to the tool's `articles/index.html` listing and to
   `site/sitemap.xml` (if the tool is live).

## What is (and isn't) Markdown-backed

Migrated: global essays, all HoloPath articles, WIMTW's article,
TattooSafe's pricing page. The template's about page is Markdown-first,
so every new tool starts this way.

**Migrate on touch:** FAQ, about, and how-it-works pages of existing
tools, legal pages, and tool main-page UI copy stay as plain HTML until
the next time their content is meaningfully edited — convert them to
this pattern then, not before.
