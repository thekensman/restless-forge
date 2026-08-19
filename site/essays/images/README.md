# Essay images

Images referenced from `site/essays/*.md`, colocated with the essays that use
them. `build.sh` copies `site/*` wholesale into `dist/`, so anything here ships
at `/essays/images/<file>` with no config. (`.md` files are stripped from
`dist/`, so this README never deploys. The generators enumerate `*.md` inside
`site/essays/` only, so this subdirectory is invisible to sitemap.xml,
llms.txt and the essay cards.)

## Conventions

- **Name by content, not by position** — `first-pc-build.jpg`, not `img-2.jpg`.
  Essays get reordered; filenames should not have to change with them.
- **Photographs → `.jpg`. Screenshots and anything with text → `.png`.**
  Lossy compression smears hard edges, which is exactly what UI text is.
  A screenshot that only ever existed as a `.jpg` stays a `.jpg` — re-encoding
  to PNG cannot recover detail already lost, and inflates the file.
- **Keep each under ~300 KB. Around 1280px wide is the sweet spot.** Figures
  render at most 640 CSS px wide (`.page figure img` in `site/styles.css`), so
  1280 is exactly 2x for retina and anything beyond that is bytes no one sees.
- **Always set `width` and `height` on the `<img>`.** They are what let the
  browser reserve the right box before the image loads. Without them a lazy
  image reserves nothing and shoves the rest of the page down when it arrives —
  the minesweeper shot moved everything below it by 750px. Use the file's real
  pixel dimensions and let CSS scale it; `height: auto` keeps it responsive.
- **Strip EXIF from phone photographs before committing.** A camera JPEG
  carries GPS coordinates; `sand-art.jpg` arrived tagged with the location it
  was taken in. Re-saving through any image tool without the EXIF block
  removes it — resizing to the width limit above usually does it for free.
- **Use a `<figure>` block, not a Markdown image**, when the picture needs a
  visible caption. Markdown renders `![alt](src)` as a bare `<img>` — the alt
  text never appears on screen. Raw HTML passes through the Markdown pipeline
  untouched:

  ```html
  <figure>
    <img src="/images/essays/example.jpg"
         alt="A literal description, for screen readers."
         loading="lazy" decoding="async">
    <figcaption>The caption a sighted reader sees.</figcaption>
  </figure>
  ```

  `alt` and `figcaption` do different jobs and should not be identical: alt
  describes what the image *is*, the caption says why it's here.
  Omit `loading="lazy"` on the first image so it isn't deferred.

- **`image:` front-matter sets the essay's social card.** Without it an essay
  falls back to the site-wide `og-image.png`. Pick the image that represents
  the piece, and prefer something ~1200×630 — smaller sources still work but
  render as a small share card rather than a wide banner.

`scripts/check-content-health.mjs` fails the build if a page references a local
image that isn't here, so a broken image can't reach production.
