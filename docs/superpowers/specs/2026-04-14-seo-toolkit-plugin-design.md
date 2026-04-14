# SEO Toolkit Plugin for EmDash

## Summary

A standard-format EmDash plugin (`plugin-seo-toolkit`) that adds three SEO subsystems to the CMS: content auditing with health scores, DataForSEO-powered rank/backlink/AI visibility tracking, and on-save content analysis. Designed for API efficiency — all external data fetched via domain-level batch calls, cached in plugin storage, and served from cache.

## Context

EmDash already provides solid per-entry SEO fields (title, description, image, canonical, noindex), Open Graph/Twitter Card rendering, JSON-LD (BlogPosting, WebSite), sitemap generation, and robots.txt. This plugin builds on top of that foundation — it does not duplicate any core SEO functionality.

The `posts` collection already has `"seo"` in its `supports` array. The `pages` collection should also add `"seo"` support.

## Plugin Identity

- **Package:** `plugin-seo-toolkit` (local workspace at `packages/plugin-seo-toolkit/`)
- **Format:** Standard (works in both trusted and sandboxed modes)
- **Capabilities:** `read:content`, `read:media`, `network:fetch`
- **Allowed hosts:** `api.dataforseo.com`

## Storage Collections

| Collection | Indexes | Purpose |
|---|---|---|
| `audit_results` | `entryId`, `collection`, `score`, `lastAudit` | Per-entry audit scores and issue lists |
| `domain_data` | `dataType`, `fetchedAt` | Cached DataForSEO responses (rankings, backlinks, AI visibility) |
| `analysis_scores` | `entryId`, `collection`, `lastAnalysis` | Per-entry on-save content analysis results |

## Admin Pages

| Path | Label | Icon | Purpose |
|---|---|---|---|
| `/dashboard` | SEO Dashboard | `bar-chart` | Site-wide health score, top issues, trends |
| `/rankings` | Rankings | `trending-up` | Keyword rankings from DataForSEO |
| `/backlinks` | Backlinks | `link` | Inbound link profile, broken link list |
| `/settings` | SEO Settings | `settings` | DataForSEO credentials, domain, refresh toggle |

---

## Subsystem 1: Content Audit

### Trigger

- Manual: "Run Audit" button on dashboard
- Automatic: Weekly cron (same schedule as DataForSEO refresh)

### Scan Scope

All published entries in SEO-enabled collections (`posts`, `pages` once enabled).

### Checks

| Check | Severity | Weight | Logic |
|---|---|---|---|
| Missing meta description | Warning | -10 | `seo_description` is null AND entry has no excerpt |
| Short meta title | Warning | -10 | Resolved title < 30 characters |
| Long meta title | Warning | -10 | Resolved title > 60 characters |
| Missing featured image | Info | -5 | No `seo_image` and no image block in body |
| Missing image alt text | Warning | -10 | Image blocks in Portable Text body with empty/missing `alt` |
| Thin content | Warning | -10 | Body word count < 300 |
| Duplicate meta titles | Error | -20 | Same resolved title as another published entry |
| Noindex flagged | Info | -5 | `seo_no_index` is true (informational) |
| Missing canonical | Info | -5 | No explicit canonical URL set |
| Broken internal links | Error | -20 | Internal hrefs in body that don't match any known slug |

### Scoring

- Base score: 100
- Deductions applied per check (weights above)
- Floor: 0 (no negative scores)
- Site-wide health score: average of all entry scores

### Storage

Each entry's audit result stored in `audit_results`:

```json
{
  "entryId": "01ABC...",
  "collection": "posts",
  "score": 75,
  "issues": [
    { "check": "missing_alt_text", "severity": "warning", "detail": "2 images missing alt text" },
    { "check": "thin_content", "severity": "warning", "detail": "Word count: 187" }
  ],
  "lastAudit": "2026-04-14T22:00:00Z"
}
```

### Dashboard Display

- Site-wide health score (large number, color-coded)
- Issue breakdown by type (counts per check)
- Table of entries sorted by worst score: entry title, collection, score, issue count, link to editor
- Traffic light indicators: green (90+), yellow (70-89), red (<70)

---

## Subsystem 2: DataForSEO Integration

### API Efficiency

All calls are **domain-level batch requests**. No per-page or per-keyword individual calls. Results cached in `domain_data` with 7-day TTL. Delta refresh skips data younger than 24 hours.

### API Calls (4-5 per refresh)

| Call | Endpoint | Returns | Cache Key |
|---|---|---|---|
| Ranked keywords | `dataforseo_labs/google/ranked_keywords/live` | All keywords domain ranks for: keyword, position, search volume, URL, competition | `ranked_keywords` |
| Backlink summary | `backlinks/summary/live` | Total backlinks, referring domains, domain rank score | `backlink_summary` |
| Referring domains | `backlinks/referring_domains/live` | Linking domains with authority metrics | `referring_domains` |
| Broken backlinks | `backlinks/backlinks/live` (filter: target pages returning 404) | External links to dead pages on your site | `broken_backlinks` |
| AI Overview check | `serp/google/organic/live` with `check_ai_overview: true` | AI Overview presence for top 10-20 ranked keywords (batched in one task) | `ai_overview` |

### Authentication

DataForSEO uses HTTP Basic Auth (login + password). Stored in plugin KV as `settings:dataforseoLogin` and `settings:dataforseoPassword`.

### Refresh Flow

1. Weekly cron fires (or manual "Refresh" button clicked)
2. Plugin checks `domain_data` timestamps per `dataType`
3. Skips any data fetched < 24 hours ago
4. Makes only the calls needed
5. Stores full response in `domain_data` with `fetchedAt` timestamp
6. Dashboard reads from cache — never hits API on page load

### Rankings Page

- Table: keyword, position, URL (linked to entry), search volume, change since last refresh
- Grouped by page URL for "which content drives traffic" view
- Sort by search volume (default) or position

### Backlinks Page

- Domain stats at top: total backlinks, referring domains, domain rank
- Table of referring domains: domain, backlinks count, domain rank
- Broken inbound links section: dead URL on your site, referring page URL, anchor text — actionable for redirect setup

### Settings Page

- DataForSEO login (text input)
- DataForSEO password (secret input)
- Target domain (text input, default: `practicaltravelgear.com`)
- Auto-refresh toggle (on/off, default: on)
- "Refresh Now" button
- Last refresh timestamp display

---

## Subsystem 3: Content Analysis on Save

### Trigger

`content:afterSave` hook with `errorPolicy: "continue"` and moderate priority. Never blocks a save.

### Checks (all local — no API calls)

| Check | What it measures | Target |
|---|---|---|
| Readability | Flesch-Kincaid grade level from body text | Grade 6-8 for web content |
| Sentence length | Average words per sentence | < 25 words average |
| Paragraph length | Words per paragraph | < 150 words per paragraph |
| Keyword in title | Primary ranked keyword (from DataForSEO cache) appears in title | Present |
| Keyword in first paragraph | Primary keyword in first 100 words of body | Present |
| Keyword density | Primary keyword frequency in body | 0.5% - 3% |
| Heading structure | At least one H2, no skipped heading levels | Valid hierarchy |
| Internal links | Count of internal links in body | At least 1 |
| External links | Count of external links in body | At least 1 |

### Keyword Data Dependency

Keyword checks (title, first paragraph, density) only run if DataForSEO cache has ranked keyword data for the entry's URL. If no keyword data exists, those checks are skipped gracefully — the score is calculated from the remaining checks only. No API calls are triggered on save.

### Score Storage

```json
{
  "entryId": "01ABC...",
  "collection": "posts",
  "score": 82,
  "readabilityGrade": 7.2,
  "checks": {
    "readability": { "pass": true, "value": 7.2 },
    "sentence_length": { "pass": true, "value": 18 },
    "keyword_in_title": { "pass": true, "keyword": "travel backpack" },
    "internal_links": { "pass": false, "value": 0, "detail": "No internal links found" }
  },
  "lastAnalysis": "2026-04-14T22:00:00Z"
}
```

### Integration with Audit Dashboard

Analysis scores feed into the dashboard's per-entry view. The traffic light combines both audit score and analysis score (weighted average: audit 60%, analysis 40%).

---

## Hooks

| Hook | Type | Purpose |
|---|---|---|
| `content:afterSave` | Standard | Trigger content analysis scoring |
| `cron` | Standard | Weekly DataForSEO refresh + audit scan |

## Routes

| Route | Auth | Purpose |
|---|---|---|
| `admin` | Yes | Block Kit admin handler for all pages |
| `refresh` | Yes | Manual DataForSEO refresh trigger |
| `audit` | Yes | Manual audit scan trigger |
| `status` | Yes | Dashboard data endpoint |

---

## Future: Phase 2 (LLM-Powered)

Not in scope for this spec, but the storage schema accommodates:

- AI-generated meta description suggestions
- Title rewrite recommendations
- Content gap analysis (what keywords to target)
- Competitor content comparison

---

## Dependencies

- No npm dependencies — uses `ctx.http.fetch()` for DataForSEO API
- DataForSEO account with API access (login + password)
- EmDash `read:content` + `read:media` capabilities for content scanning
- Local workspace package at `packages/plugin-seo-toolkit/`

## Seed Changes

- Add `"seo"` to `pages` collection `supports` array (posts already has it)
