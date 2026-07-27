# ilovemitochondria.com

A data-driven static blog about mitochondria & VDAC1. No framework, no dependencies —
one small Node generator turns the `content/` folder into a fully-linked, indexable site.

## How it works

```
content/            ← the ONLY thing you edit
  config.json         site name, nav, hero, author, links (single source of truth)
  resources.json      the resource shelf (grouped links)
  genetics.json       VDAC1 gene facts + sequence + tissue expression (→ /gene/)
  diseases.json       organ→disease→paper map (→ /diseases/ body map)
  companies.json      mitochondrial-medicine companies (→ /companies/, filterable)
  trials.json         clinical trials w/ NCT ids (→ /trials/, filterable)
  about.md            the about page
  news/*.md           one file per news piece
  posts/*.md          one file per long-form post
assets/             ← css + images (copied verbatim into the build)
  images/vdac1-anim.svg   the animated VDAC1 loop
build.mjs           ← the generator
dist/               ← GENERATED output — this is what you host (never edit by hand)
```

### Generated pages
Top nav: **home · news · resources ▾ · about**. The Resources dropdown holds:
resource shelf, companies to follow, clinical trials, the gene, disease body map.

`/` home · `/news/` paper feed **+ filters** (type blog/new-research, domain VDAC1/mitochondria,
category, year, tag) · `/posts/` explainers · `/companies/` filterable company watchlist
(stage / MoA / indication) · `/trials/` clinical trials → ClinicalTrials.gov (MoA / indication) ·
`/gene/` sequence & expression · `/diseases/` body map · `/resources/` · `/about/` ·
`/tags/` + one page per tag · plus `sitemap.xml`, `feed.xml`, `robots.txt`, `404.html`, `favicon.svg`.

### Updating the gene data (`/gene/`)
`genetics.json` is a cached snapshot fetched from GTEx v8 (expression) and UniProt (sequence).
To refresh, re-pull from those sources and replace the values — the page rebuilds from the file.

### Updating the body map (`/diseases/`)
Each entry in `diseases.json` is an organ hotspot: `x`/`y`/`r` place it on the body SVG,
and `disease`, `blurb`, `paperUrl`, `paperLabel`, optional `internal` (a link to your own
write-up) and `tags` fill the panel. Add an entry → a new hotspot appears automatically.

Run the generator:

```bash
npm run build        # or: node build.mjs
```

Preview locally (root-relative links need a server, so don't just double-click):

```bash
cd dist && python -m http.server 8080
# then open http://localhost:8080
```

## Adding a news item

Drop a new file in `content/news/`, e.g. `my-slug.md`. The filename becomes the URL
(`/news/my-slug/`). Front matter is a JSON block between `---` fences:

```md
---
{
  "title": "Headline goes here",
  "date": "2026-08-01",
  "tags": ["VDAC1", "mitophagy"],
  "format": "brief",
  "summary": "One-sentence summary used in listings, meta description and RSS.",
  "source": { "authors": "Lastname et al.", "journal": "Journal", "year": 2026, "doi": "10.xxxx/yyyy" }
}
---
Your write-up in Markdown. Paraphrase the paper in your own voice.
```

Rebuild, and it automatically appears in: the news listing, the homepage, every tag page
for its tags, the "related reading" of anything it shares tags with, the sitemap, and the RSS feed.
**Nothing is hand-maintained.**

### `format` options (how the item looks in the news listing)
- `feature` — big block with image (set `"featured": true` to make it the homepage hero item)
- `brief` — headline + summary (set `"accent": "pink" | "violet"` to recolor)
- `oneliner` — one-line ticker row
- `quick` — bundled into the "rapid-fire" numbered box (set `"quickGroup": "..."` for its title)
- `aside` — dashed callout (set `"asideLabel": "..."`)

## Adding a post (explainer)

Same idea in `content/posts/`. Extra fields: `"kind"`, `"readingTime"`, `"viewer3d": true`
(embeds the interactive 3D VDAC1 structure — use the `{{viewer3d}}` token in the body to place it).

Markdown extras: `![alt](/assets/images/x.svg "caption")` → figure, and `::: callout … :::` → callout box.

## Deploying

Host the `dist/` folder on any static host (Netlify, Cloudflare Pages, GitHub Pages, S3…).
Point `ilovemitochondria.com` at it. Set the production URL in `content/config.json` → `baseUrl`
(used for canonical tags, Open Graph, sitemap and RSS).
