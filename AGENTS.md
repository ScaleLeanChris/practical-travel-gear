# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This is an EmDash site -- a CMS built on Astro with a full admin UI, deployed on Cloudflare Workers with D1 (database) and R2 (media storage).

## Commands

```bash
npx emdash dev        # Start dev server (runs migrations, seeds, generates types)
npx emdash types      # Regenerate TypeScript types from schema
npx emdash seed seed/seed.json --validate  # Validate seed file
npm run build         # Production build (astro build)
npm run typecheck     # Type checking (astro check)
npm run deploy        # Deploy to Cloudflare (wrangler deploy)
```

The admin UI is at `http://localhost:4321/_emdash/admin`.

## Architecture

**Infrastructure:** Cloudflare Workers runtime with D1 database and R2 media storage. The Astro adapter is `@astrojs/cloudflare`. Bindings are configured in `wrangler.jsonc` (DB, MEDIA, LOADER).

**Plugins:** Two EmDash plugins are active in `astro.config.mjs`:
- `formsPlugin()` -- runs in main worker
- `webhookNotifierPlugin()` -- runs sandboxed via Cloudflare's sandbox runner

**Content model** is defined in `seed/seed.json`: two collections (`posts`, `pages`), two taxonomies (`category`, `tag`), bylines, menus, and widgets. The seed file is the source of truth for schema -- changing it and re-running `npx emdash dev` applies migrations.

**Layout:** `src/layouts/Base.astro` wires up EmDash head/body tags, menus, search, and plugin page contributions. All content pages pass a `content` prop to Base for plugin contributions to work.

## Routes

Posts and pages are served at root-level URLs (`/:slug`) to preserve WordPress permalink structure. The catch-all route tries posts first, then pages. Old `/posts/:slug` and `/pages/:slug` URLs 301 redirect to `/:slug`.

| Route | File |
|---|---|
| `/` | `src/pages/index.astro` |
| `/:slug` | `src/pages/[...slug].astro` (catch-all: posts then pages) |
| `/posts` | `src/pages/posts/index.astro` |
| `/posts/:slug` | `src/pages/posts/[slug].astro` (301 → `/:slug`) |
| `/guides` | `src/pages/guides/index.astro` |
| `/guides/:slug` | `src/pages/guides/[slug].astro` |
| `/category/:slug` | `src/pages/category/[slug].astro` |
| `/tag/:slug` | `src/pages/tag/[slug].astro` |
| `/search` | `src/pages/search.astro` |
| `/pages/:slug` | `src/pages/pages/[slug].astro` (301 → `/:slug`) |
| `/rss.xml` | `src/pages/rss.xml.ts` |

## Key Files

| File | Purpose |
|---|---|
| `astro.config.mjs` | Astro config with `emdash()` integration, database, storage, and plugins |
| `src/live.config.ts` | EmDash loader registration (boilerplate -- don't modify) |
| `seed/seed.json` | Schema definition + demo content (collections, fields, taxonomies, menus, widgets) |
| `emdash-env.d.ts` | Generated types for collections (auto-regenerated on dev server start) |
| `src/layouts/Base.astro` | Base layout with EmDash wiring (menus, search, page contributions) |
| `src/worker.ts` | Cloudflare Worker entrypoint (boilerplate -- don't modify) |
| `wrangler.jsonc` | Cloudflare bindings: D1 database, R2 bucket, worker loader |

## Skills

Agent skills are in `.agents/skills/`. Load them when working on specific tasks:

- **building-emdash-site** -- Querying content, rendering Portable Text, schema design, seed files, site features (menus, widgets, search, SEO, comments, bylines). Start here.
- **creating-plugins** -- Building EmDash plugins with hooks, storage, admin UI, API routes, and Portable Text block types.
- **emdash-cli** -- CLI commands for content management, seeding, type generation, and visual editing flow.

## Rules

- All content pages must be server-rendered (`output: "server"`). No `getStaticPaths()` for CMS content.
- Image fields are objects (`{ src, alt }`), not strings. Use `<Image image={...} />` from `"emdash/ui"`.
- `entry.id` is the slug (for URLs). `entry.data.id` is the database ULID (for API calls like `getEntryTerms`).
- Always call `Astro.cache.set(cacheHint)` on pages that query content.
- Taxonomy names in queries must match the seed's `"name"` field exactly (e.g., `"category"` not `"categories"`).
- Bylines are auto-hydrated by `getEmDashCollection`/`getEmDashEntry` -- access via `entry.data.bylines`, no extra fetch needed.
- Content pages should pass `content={{ collection, id, slug }}` to the Base layout for plugin page contributions.
