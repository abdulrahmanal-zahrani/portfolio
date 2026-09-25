# Portfolio — Abdulrahman Alzahrani

Static site for GitHub Pages at <https://abdulrahmanal-zahrani.github.io/portfolio/>.
Plain HTML, CSS and a little JavaScript; no framework and no runtime dependencies.
Pages are generated from JSON and HTML partials by a small Node script and the
output is committed, so GitHub Pages serves the repository as is.

## Layout

```
data/site.json          Profile, contact links, allowed documents, UI strings (per locale)
data/projects.json      Projects: the single source for cards and case studies
src/pages/*.html        Hand-written pages (CV, certificates, references, viewer, demos)
tools/build.mjs         Generates the pages below from data/ and src/pages/
assets/css/site.css     Design system: tokens and components
assets/css/fonts.css    Self-hosted IBM Plex (SIL OFL 1.1, licence in assets/fonts/)
assets/js/              Site script, document viewer, demo engines and demo UIs
assets/img/             Portrait, project images, favicon and share image
Resources/              Owner documents (certificate, recommendation letters)

index.html, projects/, demo/, cv.html, certificates.html, references.html,
viewer.html, 404.html, sitemap.xml      ← generated; do not edit by hand
```

## Build and preview

```sh
node tools/build.mjs            # regenerate pages
node tools/build.mjs --check    # fail if a generated page is out of date
node tools/serve.mjs            # http://localhost:8080/portfolio/ (behaves like GitHub Pages)
```

## Adding a project

1. Add an entry to `data/projects.json` (copy an existing one). Required:
   `slug`, `status` (`public`, `internal`, `prototype`, `in-progress`), `year`,
   `title`, `type`, `summary`, `features`, `technologies`, `image`, `links`.
2. Leave `role` and `outcome` as `null` until they are confirmed; empty
   sections are not rendered. Do not add numbers that are not confirmed.
3. `links.live` and `links.source` only for a public URL that works. Internal
   tools get no link; if they need a demo, rebuild one under `src/pages/` with
   fictional data and point `links.demo` at it.
4. Add a 1280×800 image as WebP at 1280 and 640 px widths in
   `assets/img/projects/` (fictional or synthetic data only).
5. Run the build and the checks below.

`featured: true` puts a project on the home page. Projects that share a
`family` (see `families`) link to each other on their case-study pages.

## Languages

Every visible string is an object keyed by locale (`{ "en": "…" }`), and the
build fails on a missing translation instead of mixing languages. The CSS uses
logical properties (`inline`/`block`), so a right-to-left locale needs only
`dir="rtl"`. To add Arabic: add `ar` to `site.json › locales` with
`"dir": "rtl"` and a prefix, translate `strings` and the content fields, add
IBM Plex Sans Arabic to `assets/css/fonts.css`, and extend `build()` in
`tools/build.mjs` to write each locale under its prefix.

## Privacy rules

- No employer, bank, client or supplier names, logos, account numbers, IBANs,
  reference numbers, balances or internal links in projects, demos, images or data.
- Demos use fictional names (Example Company, Demo Bank) and say so on the page.
- The CV, certificates and recommendation letters are owner documents: their
  text is not rewritten here.
- Do not link to repositories or apps that contain work data.

## Checks

```sh
node tools/test-engines.mjs     # demo calculations against hand-worked examples
node tools/check-links.mjs      # internal links, images, anchors (case-sensitive)
node tools/check-public.mjs     # sensitive-data scan of every published file
```

`check-public.mjs` always checks for IBAN, BIC, phone, e-mail and API-key
patterns and for image metadata. It also reads an optional local deny-list,
`.sensitive-terms` (one `term<TAB>category` per line), which is git-ignored:
build it from the private sources and never commit it.

Browser checks (need `playwright` and `axe-core` installed outside the repo
and `node tools/serve.mjs` running):

```sh
node tools/qa/browser-check.mjs <outDir>   # pages, paths, viewer, keyboard, demos, print, a11y, RTL
node tools/qa/capture-pages.mjs <outDir>   # desktop and phone screenshots
node tools/qa/capture-project-images.mjs <outDir> [appUrl]
python3 tools/qa/process-project-images.py <outDir>   # grayscale WebP for the site
node tools/qa/capture-og.mjs               # share image and touch icon
```
